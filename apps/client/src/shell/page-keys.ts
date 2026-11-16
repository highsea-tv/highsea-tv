// SPDX-License-Identifier: AGPL-3.0-only
// The page's key presses (README.md › Platform files): only a browser window, the web and the
// desktop app, has a keyboard for the shell's shortcuts (./shortcuts.tsx), so here, on the phone
// and the TV, nothing listens.

/** Calls `onKey` for each key pressed in the page, while mounted. */
export function usePageKeys(_onKey: (e: KeyboardEvent) => void): void {}
