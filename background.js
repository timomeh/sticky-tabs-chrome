const NO_GROUP = { title: null, color: null }
const ENTRIES_KEY = "stickyEntries"

const MENU_TOGGLE = "toggle-sticky"
const MENU_REPLACE = "replace-pinned"

// In-memory cache of tabs.
// Rebuilt from chrome.storage.local.stickyEntries on every service worker boot.
// Shape:
// { [tabId]: { pinnedUrl, lastUrl, groupId, groupTitle, groupColor, index, windowId } }
// groupId tracks the live Chrome group so we can update title when the group
// gets renamed. It's null for ungrouped tabs. Entries on disk are still keyed
// by title so they survive browser restarts (where groupIds reset).
const stickyTabs = {}

// Tab ids currently being restored after close.
// Event handlers should leave these tabs alone so restore() isn't clobbered by
// transient updates of these restoring tabs.
const restoringTabs = new Set()

// Chrome fires onUpdated with groupId = NONE right before onRemoved for a
// grouped tab being closed. To tell that apart from a real "user dragged the
// tab out of its group", we defer applying the ungroup; if onRemoved fires
// within UNGROUP_DEFER_MS, we treat it as a close and skip the update.
const UNGROUP_DEFER_MS = 200
const pendingUngroup = new Map()

const storage = {
  _entryKey(pinnedUrl, groupTitle) {
    const NULL = "\x00"
    return [pinnedUrl, groupTitle].join(NULL)
  },

  async _saveEntries(entries) {
    await chrome.storage.local.set({ [ENTRIES_KEY]: entries })
  },

  async loadEntries() {
    const data = await chrome.storage.local.get(ENTRIES_KEY)
    return data[ENTRIES_KEY] || []
  },

  async upsertEntry(entry) {
    const entries = await storage.loadEntries()
    const key = storage._entryKey(entry.pinnedUrl, entry.groupTitle)
    const i = entries.findIndex(
      (e) => storage._entryKey(e.pinnedUrl, e.groupTitle) === key
    )
    if (i >= 0) entries[i] = { ...entries[i], ...entry }
    else entries.push(entry)
    await storage._saveEntries(entries)
  },

  async removeEntry(pinnedUrl, groupTitle) {
    const entries = await storage.loadEntries()
    const key = storage._entryKey(pinnedUrl, groupTitle)
    const filtered = entries.filter(
      (e) => storage._entryKey(e.pinnedUrl, e.groupTitle) !== key
    )
    await storage._saveEntries(filtered)
  },
}

const util = {
  async getGroupInfo(tab) {
    if (
      !tab ||
      tab.groupId === undefined ||
      tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
    ) {
      return { ...NO_GROUP }
    }
    try {
      const group = await chrome.tabGroups.get(tab.groupId)
      return { title: group.title ?? "", color: group.color ?? "grey" }
    } catch {
      return { ...NO_GROUP }
    }
  },

  isSticky(tabId) {
    return Object.prototype.hasOwnProperty.call(stickyTabs, tabId)
  },

  isRestricted(url) {
    return !url || url.startsWith("chrome://") || url.startsWith("edge://")
  },
}

const sync = {
  patchTab(tabId, partial) {
    if (!stickyTabs[tabId]) return
    stickyTabs[tabId] = { ...stickyTabs[tabId], ...partial }
  },

  renameTabId(oldId, newId) {
    if (oldId === newId) return
    const state = stickyTabs[oldId]
    if (!state) return
    stickyTabs[newId] = state
    delete stickyTabs[oldId]
  },

  async persistEntry(tabId) {
    const state = stickyTabs[tabId]
    if (!state) return
    await storage.upsertEntry({
      pinnedUrl: state.pinnedUrl,
      lastUrl: state.lastUrl,
      groupTitle: state.groupTitle,
      groupColor: state.groupColor,
    })
  },
}

const userAction = {
  async toggleSticky(tab) {
    if (!tab || util.isRestricted(tab.url)) return

    if (util.isSticky(tab.id)) {
      const state = stickyTabs[tab.id]
      delete stickyTabs[tab.id]
      await storage.removeEntry(state.pinnedUrl, state.groupTitle)
    } else {
      const groupInfo = await util.getGroupInfo(tab)
      stickyTabs[tab.id] = {
        pinnedUrl: tab.url,
        lastUrl: tab.url,
        groupId:
          tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
            ? null
            : tab.groupId,
        groupTitle: groupInfo.title,
        groupColor: groupInfo.color,
        index: tab.index,
        windowId: tab.windowId,
      }
      await storage.upsertEntry({
        pinnedUrl: tab.url,
        lastUrl: tab.url,
        groupTitle: groupInfo.title,
        groupColor: groupInfo.color,
      })
    }
    await ui.refresh(tab)
  },

  async replacePinnedUrl(tab) {
    if (!tab || !util.isSticky(tab.id) || util.isRestricted(tab.url)) return
    const state = stickyTabs[tab.id]
    if (tab.url === state.pinnedUrl) return

    const oldPinnedUrl = state.pinnedUrl
    const oldGroupTitle = state.groupTitle
    stickyTabs[tab.id] = { ...state, pinnedUrl: tab.url, lastUrl: tab.url }
    await storage.removeEntry(oldPinnedUrl, oldGroupTitle)
    await storage.upsertEntry({
      pinnedUrl: tab.url,
      lastUrl: tab.url,
      groupTitle: state.groupTitle,
      groupColor: state.groupColor,
    })
    await ui.refresh(tab)
  },
}

const ui = {
  async updateBadge(tabId) {
    try {
      if (util.isSticky(tabId)) {
        await chrome.action.setBadgeText({ text: "PIN", tabId })
        await chrome.action.setBadgeBackgroundColor({
          color: "#4CAF50",
          tabId,
        })
      } else {
        await chrome.action.setBadgeText({ text: "", tabId })
      }
    } catch {}
  },

  async updateContextMenu(tab) {
    const sticky = tab && util.isSticky(tab.id)
    try {
      await chrome.contextMenus.update(MENU_TOGGLE, { checked: !!sticky })
      const canReplace =
        sticky && tab.url && tab.url !== stickyTabs[tab.id].pinnedUrl
      await chrome.contextMenus.update(MENU_REPLACE, {
        enabled: !!canReplace,
      })
    } catch {}
  },

  async refresh(tab) {
    if (!tab) return
    await ui.updateBadge(tab.id)
    await ui.updateContextMenu(tab)
  },
}

async function restoreClosedTab(state, windowId) {
  let newTab
  try {
    newTab = await chrome.tabs.create({
      url: state.pinnedUrl,
      active: false,
      windowId,
      index: state.index,
    })
  } catch {
    return
  }

  restoringTabs.add(newTab.id)
  stickyTabs[newTab.id] = { ...state, lastUrl: state.pinnedUrl, windowId }

  const finish = async () => {
    try {
      await chrome.tabs.get(newTab.id)
    } catch {
      restoringTabs.delete(newTab.id)
      return
    }

    try {
      await chrome.tabs.move(newTab.id, { index: state.index })
    } catch {}
    restoringTabs.delete(newTab.id)
  }

  if (state.groupTitle === null) {
    await finish()
    return
  }

  try {
    const groups = await chrome.tabGroups.query({ windowId })
    const existing = groups.find((g) => g.title === state.groupTitle)
    if (existing) {
      await chrome.tabs.group({ tabIds: newTab.id, groupId: existing.id })
    } else {
      const newGroupId = await chrome.tabs.group({ tabIds: newTab.id })
      await chrome.tabGroups.update(newGroupId, {
        title: state.groupTitle,
        color: state.groupColor,
      })
    }
  } catch {}

  await finish()
}

async function setupMenus() {
  try {
    await chrome.contextMenus.removeAll()
  } catch {}

  chrome.contextMenus.create({
    id: MENU_TOGGLE,
    title: "Sticky",
    type: "checkbox",
    checked: false,
    contexts: ["page", "action"],
  })
  chrome.contextMenus.create({
    id: MENU_REPLACE,
    title: "Replace Pinned URL with Current",
    contexts: ["page", "action"],
    enabled: false,
  })
}

// Rehydrate state on every SW boot so
async function rehydrate() {
  const entries = await storage.loadEntries()
  const tabs = await chrome.tabs.query({})

  if (entries.length > 0) {
    const groupInfos = await Promise.all(tabs.map((t) => util.getGroupInfo(t)))

    const claimed = new Set()
    for (const entry of entries) {
      let matchIdx = -1
      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i]
        if (claimed.has(tab.id)) continue
        const urlOk = tab.url === entry.lastUrl || tab.url === entry.pinnedUrl
        const groupOk = groupInfos[i].title === entry.groupTitle
        if (urlOk && groupOk) {
          matchIdx = i
          break
        }
      }
      if (matchIdx < 0) continue
      const tab = tabs[matchIdx]
      claimed.add(tab.id)
      stickyTabs[tab.id] = {
        pinnedUrl: entry.pinnedUrl,
        lastUrl: tab.url,
        groupId:
          tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
            ? null
            : tab.groupId,
        groupTitle: entry.groupTitle,
        groupColor: entry.groupColor,
        index: tab.index,
        windowId: tab.windowId,
      }
    }
  }
  for (const tab of tabs) await ui.updateBadge(tab.id)
}

chrome.runtime.onInstalled.addListener(setupMenus)
chrome.runtime.onStartup.addListener(setupMenus)

chrome.action.onClicked.addListener((tab) => {
  userAction.toggleSticky(tab)
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_TOGGLE) userAction.toggleSticky(tab)
  else if (info.menuItemId === MENU_REPLACE) userAction.replacePinnedUrl(tab)
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (restoringTabs.has(tabId)) return
  if (!stickyTabs[tabId]) {
    if (tab && tab.active) await ui.refresh(tab)
    return
  }

  if (changeInfo.url) {
    sync.patchTab(tabId, { lastUrl: changeInfo.url })
    await sync.persistEntry(tabId)
  }

  if (changeInfo.groupId !== undefined) {
    if (changeInfo.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      // Defer — might be a close prelude (see pendingUngroup comment).
      if (pendingUngroup.has(tabId)) clearTimeout(pendingUngroup.get(tabId))
      pendingUngroup.set(
        tabId,
        setTimeout(async () => {
          pendingUngroup.delete(tabId)
          const prev = stickyTabs[tabId]
          if (!prev || prev.groupTitle === null) return
          sync.patchTab(tabId, {
            groupId: null,
            groupTitle: null,
            groupColor: null,
          })
          await storage.removeEntry(prev.pinnedUrl, prev.groupTitle)
          await sync.persistEntry(tabId)
        }, UNGROUP_DEFER_MS)
      )
    } else {
      const prev = stickyTabs[tabId]
      const groupInfo = await util.getGroupInfo(tab)
      sync.patchTab(tabId, {
        groupId: changeInfo.groupId,
        groupTitle: groupInfo.title,
        groupColor: groupInfo.color,
      })
      if (prev.groupTitle !== groupInfo.title) {
        await storage.removeEntry(prev.pinnedUrl, prev.groupTitle)
        await sync.persistEntry(tabId)
      }
    }
  }

  if (tab && tab.active) await ui.refresh(tab)
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId)
    await ui.refresh(tab)
  } catch {}
})

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  if (restoringTabs.has(tabId)) return
  sync.patchTab(tabId, { index: moveInfo.toIndex })
})

chrome.tabs.onAttached.addListener(async (tabId, info) => {
  if (restoringTabs.has(tabId)) return
  sync.patchTab(tabId, {
    windowId: info.newWindowId,
    index: info.newPosition,
  })
  await sync.persistEntry(tabId)
})

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  sync.renameTabId(removedTabId, addedTabId)
})

chrome.tabGroups.onUpdated.addListener(async (group) => {
  const newTitle = group.title ?? ""
  const newColor = group.color ?? "grey"
  for (const tabId of Object.keys(stickyTabs)) {
    const state = stickyTabs[tabId]
    if (state.groupId !== group.id) continue
    if (state.groupTitle === newTitle && state.groupColor === newColor) continue
    const oldTitle = state.groupTitle
    sync.patchTab(Number(tabId), {
      groupTitle: newTitle,
      groupColor: newColor,
    })
    if (oldTitle !== newTitle) {
      await storage.removeEntry(state.pinnedUrl, oldTitle)
    }
    await sync.persistEntry(Number(tabId))
  }
})

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (pendingUngroup.has(tabId)) {
    clearTimeout(pendingUngroup.get(tabId))
    pendingUngroup.delete(tabId)
  }
  const state = stickyTabs[tabId]
  if (!state) return
  delete stickyTabs[tabId]
  if (removeInfo.isWindowClosing) return
  await restoreClosedTab(state, removeInfo.windowId)
})

// boot
setupMenus()
rehydrate()
