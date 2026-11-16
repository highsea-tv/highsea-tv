# Desktop and web clients

- **Covers:** the household-facing web client (`/web`) and the desktop app. Both are `apps/client`, the one client ([ADR 0061](../../adr/0061-one-client-platform.md)): the web is its web export, and the desktop app is Tauri around its desktop export (`export:desktop`, with the Tauri code in only behind `EXPO_PUBLIC_HIGHSEA_APP=desktop`). Each screen is the same one the phone and the TV draw, laid out by the form-factor rule for a pointer.
- **Doesn't cover:** the server admin, which is in [admin](admin.md).
- **Status:** designed in the Phase 2 prototypes, and built once in `apps/client` in the one client platform's part B. The prototypes' web frames hold the client's mock export (`#/web/…`).

## Structure

- **Same structure as TV:** Hero + rows, adapted for a pointer and a keyboard.
  - The hero is shorter (about 55–60% of the viewport height).
  - A row's posters are about 10.5% of the window, between 104 and 192 wide, and its stills about 24%, between 240 and 336, so a wider window shows more of them (`pointerItemWidth` in the library's `row.tsx`).
- **Navigation:** the top bar holds the server at the left, Search as its icon, then Home, Collections and Movies centred (Shows and Music follow on a server that serves them), with Alerts and the profile at the right. It is clear over a page's art until the page scrolls under it, and then glass. The desktop app adds its window's buttons and, on Downloads' own page, what it keeps.
- **Layout:** the form-factor rule ([spacing and layout › Width classes](../spacing-layout.md#width-classes)). A pointer window is compact below 768 and regular from 768. The page's side margin is 16px when compact and 64px when regular (`usePageGutter`, `web.margin.wide`), and content is at most 1680px wide (`web.maxWidth`), centred. Rows still bleed to the right edge. There's no column grid: a screen lays out by its parts' own measures inside the margins.

## Pointer

- **Hover** previews what TV focus does: the poster scales to 1.02 (`hover.posterScale`, [motion › Choreography](../motion.md#choreography)) with `spring.base` and shows a quick-actions overlay (Play, Add to list, More), as it does while focus is inside it. Hover never triggers sound.
- **Hero binding:** hovering a poster for 220ms or more doesn't change the hero. On desktop the hero changes only on selection. Pointer users move fast, and an unexpectedly changing hero is distracting.
- **Rows:** scroll by trackpad and wheel, and paging arrow buttons appear at the row edges on hover.
- **Controls:** 36px, and 30px only in dense places, with 14px text and the `radius-sm` corner. On a coarse pointer (a phone's browser) they keep that size, take 16px text and reach 44 with an invisible hit area ([controls](../controls.md)).

## Keyboard

- **Arrows:** full arrow-key navigation using the [TV spatial focus model](tv.md#spatial-focus-model) inside content regions. Tab and Shift-Tab move between regions (nav, hero, each row).
- **Focus ring:** the same 2px `focus` ring with a 2px offset as in [accessibility](../accessibility.md#operable).
- **Shortcuts:** in the player, Space plays or pauses, ← and → seek, `M` mutes, `F` toggles fullscreen and Esc leaves it (`usePageInput`, `apps/client/src/player/picture.web.tsx`). Outside the player, `/` opens Search with its field focused and `?` lists the shortcuts in the library's Dialog, with Close; neither fires while typing in a field, with Ctrl, ⌘ or Alt held, or while a dialog is open (`apps/client/src/shell/shortcuts.tsx`, the owner's decision of 2026-11-15).

## Desktop app specifics

- **Window chrome:** native on macOS (traffic lights over the top bar, which includes a drag region), and a custom title bar on Windows and Linux in `bg`. The title bar's buttons copy each operating system's own (Windows' 46-wide caption buttons and its Close red, macOS's three colours), so they're the one place a client draws values outside the tokens, listed with that lasting reason in `scripts/one-place-exceptions.json` (`apps/client/src/desktop/window.tsx`).
- **Media keys and OS integration:** OS media controls (Now Playing on macOS, SMTC on Windows) reflect the player.
- **Offline downloads:** the same Offline destination as mobile.
