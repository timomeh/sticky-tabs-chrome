import { debug } from "./lib/debug"
import * as stickyManager from "./lib/stickyManager"
import * as menu from "./lib/menu"

const ready = boot()

async function boot() {
  await menu.initialize()
  await stickyManager.rehydrateStateFromStorage()
}

// Fired when an action icon is clicked.
// This event will not fire if the action has a popup.
chrome.action.onClicked.addListener(async (tab) => {
  await ready

  // when clicking the extension icon iteself
  stickyManager.toggleTab(tab)
  if (tab.id) void menu.refresh(tab.id)
})

// Fired when a context menu item is clicked.
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  await ready

  if (!tab?.id) return

  if (info.menuItemId === menu.MENUS.ToggleId) {
    stickyManager.toggleTab(tab)
    void menu.refresh(tab.id)
    return
  }

  if (info.menuItemId === menu.MENUS.ReplaceId) {
    stickyManager.updatePinnedUrl(tab.id, tab.url)
    void menu.refresh(tab.id)
    return
  }
})

// Fired when a tab is updated.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  debug("tabs.onUpdated", { tabId, changeInfo, tab })
  await ready

  void menu.refresh(tabId)
  stickyManager.debouncedSyncChanges()
})

// Fires when the active tab in a window changes.
// Note that the tab's URL may not be set at the time this event fired,
// but you can listen to onUpdated events so as to be notified when a URL is set
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  debug("tabs.onActivated", { activeInfo })
  await ready

  void menu.refresh(activeInfo.tabId)
})

// Fired when a tab is moved within a window.
// Only one move event is fired, representing the tab the user directly moved.
// Move events are not fired for the other tabs that must move in response
// to the manually-moved tab.
// This event is not fired when a tab is moved between windows; see onDetached.
chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  debug("tabs.onMoved", { tabId, moveInfo })
  await ready

  stickyManager.debouncedSyncChanges()
})

// Fired when a tab is attached to a window, for example because it was moved
// between windows.
chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
  debug("tabs.onAttached", { tabId, attachInfo })
  await ready

  stickyManager.debouncedSyncChanges()
})

// Fired when a tab is replaced with another tab due to prerendering or instant.
chrome.tabs.onReplaced.addListener(async (addedTabId, removedTabId) => {
  debug("tabs.onAttached", { addedTabId, removedTabId })
  await ready

  stickyManager.renameTabId(removedTabId, addedTabId)
})

// Fired when a tab is closed.
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  debug("tabs.onRemoved", { tabId, removeInfo })
  await ready

  // so that we can still close the window
  if (removeInfo.isWindowClosing) return

  if (stickyManager.isSticky(tabId)) {
    void stickyManager.reviveTab(tabId, removeInfo.windowId)
  }
})

// Fired when a group is updated.
chrome.tabGroups.onUpdated.addListener(async (group) => {
  debug("tabGroups.onUpdated", { group })
  await ready

  stickyManager.debouncedSyncChanges()
})

// Fired when a group is created.
chrome.tabGroups.onCreated.addListener(async (group) => {
  debug("tabGroups.onCreated", { group })
  await ready

  stickyManager.debouncedSyncChanges()
})

// Fired when a group is closed, either directly by the user or automatically
// because it contained zero tabs.
chrome.tabGroups.onRemoved.addListener(async (group) => {
  debug("tabGroups.onRemoved", { group })
  await ready

  stickyManager.debouncedSyncChanges()
})

// More event listeners that we don't care about:

// Fired when a tab is created.
// Note that the tab's URL and tab group membership may not be set at the time
// this event is fired, but you can listen to onUpdated events so as to be
// notified when a URL is set or the tab is added to a tab group.
// chrome.tabs.onCreated.addListener()

// Fired when a tab is detached from a window; for example, because it was moved
// between windows.
// chrome.tabs.onDetached.addListener()

// Fired when the highlighted or selected tabs in a window changes.
// chrome.tabs.onHighlighted.addListener()

// Fired when a tab is zoomed.
// chrome.tabs.onZoomChange.addListener()

// Fired when a group is moved within a window.
// Move events are still fired for the individual tabs within the group,
// as well as for the group itself. This event is not fired when a group is
// moved between windows; instead, it will be removed from one window and
// created in another.
// chrome.tabGroups.onMoved.addListener()
