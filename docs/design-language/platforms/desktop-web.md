# Desktop and web clients

- **Covers:** the household-facing web client and the desktop app, a Tauri wrapper around the web build ([ADR 0008](../../adr/0008-clients-react-everywhere.md)).
- **Doesn't cover:** the server admin, which is in [admin](admin.md).
- **Status:** the brand boards didn't include a desktop or web client home. Its layout is designed in the **Phase 2 prototypes**. This guide sets the constraints that design must meet.

## Structure

- **Same structure as TV:** Hero + rows, adapted for a pointer and a keyboard.
  - The hero is shorter (about 55–60% of the viewport height).
  - Rows show more posters per row, depending on breakpoint.
- **Navigation:** a slim top bar holds the server switcher, the primary destinations (Home, Search, Library, Downloads), and the profile. It is translucent over the hero.
- **Layout:** the 12-column grid with breakpoints from [spacing and layout](../spacing-layout.md#grids-per-platform). Content max width is 1680px on wide screens. Rows still bleed to the right edge.

## Pointer

- **Hover** previews what TV focus does: the poster scales to 1.04 with `spring.base` and shows a quick-actions overlay (Play, Add to list, More). Hover never triggers sound.
- **Hero binding:** hovering a poster for 220ms or more doesn't change the hero. On desktop the hero changes only on selection. Pointer users move fast, and an unexpectedly changing hero is distracting.
- **Rows:** scroll by trackpad and wheel, and paging arrow buttons appear at the row edges on hover.

## Keyboard

- **Arrows:** full arrow-key navigation using the [TV spatial focus model](tv.md#spatial-focus-model) inside content regions. Tab and Shift-Tab move between regions (nav, hero, each row).
- **Focus ring:** the same 2px `focus` ring with a 2px offset as in [accessibility](../accessibility.md#operable).
- **Shortcuts:**
  - `/` focuses search;
  - Space plays or pauses in the player;
  - `F` toggles fullscreen;
  - `?` lists shortcuts.

## Desktop app specifics

- **Window chrome:** native on macOS (traffic lights over the top bar, which includes a drag region), and a custom title bar on Windows and Linux in `bg`.
- **Media keys and OS integration:** OS media controls (Now Playing on macOS, SMTC on Windows) reflect the player.
- **Offline downloads:** the same Offline destination as mobile.
