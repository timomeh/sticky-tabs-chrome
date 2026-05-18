# Sticky Tabs for Chrome

Arc-style sticky tabs for regular chrome tabs.

A tiny Chrome extension that keeps a tab in the sidebar when you close it: in the right tab group, at the right spot, with its initial URL. Just like in Arc.

No custom sidebar. Native chrome tabs.

## What it does

Mark any tab as **Sticky**. When you close it, it instantly reopens (silently, in the background) at its original position, inside its original tab group.

- Ungrouped tabs stay ungrouped on restore.
- Restored tabs spawn pre-discarded, so they don't eat memory until you click them.
- The tab position is preserved.
- The initial tab URL is restored.

## Usage

You can mark a Tab as sticky in two ways:

- **Toolbar icon:** click the extension's toolbar icon to toggle sticky for the current tab. A green `PIN` badge appears when a tab is sticky.
- **Right-click on the page** → Sticky Tabs → Sticky

To change the Tab's initial URL:

- - **Right-click on the page** → Sticky Tabs → Replace pinned URL with Current

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this folder.

After editing files, hit the reload arrow on the extension card.
