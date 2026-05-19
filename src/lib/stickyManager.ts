type StickyTab = {
  tabId: number
  groupId: number
  index: number
  pinnedUrl?: string
  currentUrl?: string
}

type Group = {
  groupId: number
  groupTitle?: string
  windowId: number
  color: chrome.tabGroups.TabGroup["color"]
}

type Store = {
  stickies: Map<number, StickyTab>
  groups: Map<number, Group>
}

const store: Store = {
  stickies: new Map(),
  groups: new Map(),
}

const debounce = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  wait: number
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return (...args: Args) => {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      callback(...args)
    }, wait)
  }
}

export const debouncedSyncChanges = debounce(syncChanges, 100)

export async function syncChanges() {
  const [tabs, tabGroups] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
  ])

  // update stored sticky tabs with current state of chrome tabs
  const relevantTabs = tabs.filter(
    (tab) => tab.id && store.stickies.has(tab.id)
  )
  for (const tab of relevantTabs) {
    if (!tab.id) continue

    const stickie = store.stickies.get(tab.id)
    if (!stickie) continue

    stickie.groupId = tab.groupId
    stickie.index = tab.index
    stickie.currentUrl = tab.url
  }

  // remember groups so we can restore a group if its last tab was a sticky tab
  // and was closed.
  store.groups = new Map(
    tabGroups.map((group) => [
      group.id,
      {
        groupId: group.id,
        groupTitle: group.title,
        windowId: group.windowId,
        color: group.color,
      },
    ])
  )

  debouncedWriteStateToStorage()
}

export function renameTabId(prevTabId: number, newTabId: number) {
  const stickie = store.stickies.get(prevTabId)
  if (!stickie) return

  stickie.tabId = newTabId
  store.stickies.set(newTabId, stickie)
  store.stickies.delete(prevTabId)

  debouncedWriteStateToStorage()
}

export function toggleTab(tab: chrome.tabs.Tab) {
  if (!tab.id) return

  if (store.stickies.has(tab.id)) {
    store.stickies.delete(tab.id)
  } else {
    store.stickies.set(tab.id, {
      tabId: tab.id,
      groupId: tab.groupId,
      index: tab.index,
      currentUrl: tab.url,
      pinnedUrl: tab.url,
    })
  }

  debouncedWriteStateToStorage()
}

export async function reviveTab(tabId: number, windowId: number) {
  const stickie = store.stickies.get(tabId)
  if (!stickie) return

  const existingGroup =
    stickie.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE
      ? null
      : await chrome.tabGroups.get(stickie.groupId).catch(() => null)

  const newTab = await chrome.tabs.create({
    url: stickie.pinnedUrl,
    windowId,
    active: false,
    index: stickie.index,
  })

  if (!newTab.id) return // wtf

  renameTabId(tabId, newTab.id)

  if (stickie.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    if (existingGroup) {
      await chrome.tabs.group({ tabIds: newTab.id, groupId: existingGroup.id })
    } else {
      const newGroupId = await chrome.tabs.group({ tabIds: newTab.id })
      await chrome.tabGroups.update(newGroupId, {
        title: store.groups.get(stickie.groupId)?.groupTitle ?? "revived",
        color: store.groups.get(stickie.groupId)?.color,
      })
      stickie.groupId = newGroupId
    }
  }

  await chrome.tabs.move(newTab.id, { index: stickie.index })
  debouncedWriteStateToStorage()
}

export function updatePinnedUrl(tabId: number, url: string | undefined) {
  const stickie = store.stickies.get(tabId)
  if (!stickie) return

  stickie.pinnedUrl = url

  debouncedWriteStateToStorage()
}

export function isSticky(tabId: number) {
  return store.stickies.has(tabId)
}

export function isPinnedUrl(tabId: number, url: string | undefined) {
  const stickie = store.stickies.get(tabId)
  if (!stickie) return false
  return stickie.pinnedUrl === url
}

// storage

const STORAGE_KEY = "stored_stickies"

type StoredStickie = {
  currentUrl?: string
  pinnedUrl?: string
  index: number
  groupTitle?: string
}

export async function rehydrateStateFromStorage() {
  const data = await chrome.storage.local.get(STORAGE_KEY)
  const storedStickies = data?.[STORAGE_KEY] as StoredStickie[] | undefined
  if (!storedStickies) return

  const [tabs, tabGroups] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
  ])

  store.groups = new Map(
    tabGroups.map((group) => [
      group.id,
      {
        groupId: group.id,
        groupTitle: group.title,
        windowId: group.windowId,
        color: group.color,
      },
    ])
  )

  const mappedTabs = tabs.map((tab) => {
    if (!tab.id) return [null, null] as const

    const storedStickie = storedStickies.find(
      (s) =>
        s.currentUrl === tab.url &&
        s.groupTitle === store.groups.get(tab.groupId)?.groupTitle
    )

    if (storedStickie) {
      return [tab, storedStickie] as const
    }

    return [tab, null] as const
  })

  for (const [tab, stickie] of mappedTabs) {
    if (!tab?.id || !stickie) continue

    store.stickies.set(tab.id, {
      groupId: tab.groupId,
      index: tab.index,
      tabId: tab.id,
      currentUrl: tab.url,
      pinnedUrl: stickie.pinnedUrl,
    })
  }
}

const debouncedWriteStateToStorage = debounce(writeStateToStorage, 300)

async function writeStateToStorage() {
  const storedStickies: StoredStickie[] = Array.from(
    store.stickies.values()
  ).map((stickie) => ({
    currentUrl: stickie.currentUrl,
    pinnedUrl: stickie.pinnedUrl,
    index: stickie.index,
    groupTitle: store.groups.get(stickie.groupId)?.groupTitle,
  }))

  await chrome.storage.local.set({ [STORAGE_KEY]: storedStickies })
}
