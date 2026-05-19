<p align="center">
  <img src="icons/icon-active128.png" alt="Sticky Tabs" width="128" height="128" />
</p>

# Sticky Tabs for Chrome

[View and Install in Chrome Web Store](https://chromewebstore.google.com/detail/sticky-tabs/jgedjheikgjbgihecdbicmhmonegdoch)

A small Chrome extension for Arc-style sticky tabs for regular chrome tabs.

Keeps a tab in the sidebar when you close it: in the right tab group, at the right spot, with its initial URL. Just like in Arc.

No custom sidebar. Just native chrome tabs.

## What it does

Mark a tab as **Sticky**. When you close that tab, it instantly reopens (silently in the background) at its original position, inside its original tab group.

- Ungrouped tabs stay ungrouped on restore.
- Grouped tabs stay in their group.
- Restored tabs spawn pre-discarded, so they don't eat memory until you click them.
- The tab position is preserved.
- The initial tab URL is restored.

## Usage

You can mark a Tab as sticky in two ways:

- **Toolbar icon:** click the extension's toolbar icon to toggle sticky for the current tab.
- **Right-click on the page** → Sticky Tabs → Sticky

To change the Tab's initial URL:

- **Right-click on the page** → Sticky Tabs → Replace pinned URL with Current

## Known Issues and Limitations

Here are some known limitations that I might be able to fix, maybe not. Let's see.

- To persist stickiness when you close/reopen Chrome, quit Chrome (cmd-q) instead of closing the window. Regular window close will also close all tabs, so stickiness of tabs won't persist.
- If the sticky tab is the only tab in the window and you close it, the window closes.
- Closing and re-opening a tab-group won't preserve stickiness.
- If you rename a tab group on another device, it won't be able to restore the sticky state.