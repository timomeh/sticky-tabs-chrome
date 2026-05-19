import * as stickyManager from "./stickyManager"

export const MENUS = {
  ToggleId: "toggle-sticky",
  ReplaceId: "replace-sticky",
}

export async function initialize() {
  await chrome.contextMenus.removeAll().catch(() => {
    // intentionally left blank
  })

  chrome.contextMenus.create({
    id: MENUS.ToggleId,
    title: "Sticky",
    type: "checkbox",
    checked: false,
    contexts: ["page", "action"],
  })

  chrome.contextMenus.create({
    id: MENUS.ReplaceId,
    title: "Replace Pinned URL with Current",
    contexts: ["page", "action"],
    enabled: false,
  })
}

export async function refresh(tabId: number) {
  const tab = await chrome.tabs.get(tabId).catch(() => null)
  if (!tab) return

  const isSticky = stickyManager.isSticky(tabId)

  // refresh context menu
  try {
    await chrome.contextMenus.update(MENUS.ToggleId, {
      checked: isSticky,
    })
    await chrome.contextMenus.update(MENUS.ReplaceId, {
      enabled: isSticky && !stickyManager.isPinnedUrl(tabId, tab.url),
    })
  } catch {}

  // refresh icon
  try {
    const iconPath = isSticky
      ? {
          16: "icons/icon-active16.png",
          32: "icons/icon-active32.png",
          48: "icons/icon-active48.png",
          128: "icons/icon-active128.png",
        }
      : {
          16: "icons/icon16.png",
          32: "icons/icon32.png",
          48: "icons/icon48.png",
          128: "icons/icon128.png",
        }

    await chrome.action.setIcon({ tabId, path: iconPath })
  } catch (error) {
    console.error(error)
  }
}
