'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The ⌘K hint's modifier, rendered the same on the server and in the browser's first pass.
//
// `modKey()` reads `navigator.platform`, and Node has a `navigator` too (Node 21+): the server
// answers from its own platform, "Linux x86_64" or "Linux arm64" in the image, so it rendered "Ctrl" while a Mac
// hydrated "⌘", and React threw error #418 (the text didn't match). React's documented answer for
// content that has to differ is a second render on the client
// (https://react.dev/reference/react-dom/client/hydrateRoot#handling-different-client-and-server-content):
// useSyncExternalStore renders `getServerSnapshot` on the server and while hydrating, then the
// browser's own value (https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
import { useSyncExternalStore } from 'react'
import { modKey } from './kbd.tsx'

// the platform doesn't change while the page is open: nothing to subscribe to
const subscribe = () => () => {}
/** What the server renders, whatever it runs on: the visitor's platform isn't known there. */
const SERVER_MOD_KEY = 'Ctrl'

/** `⌘` on Apple platforms, `Ctrl` elsewhere; `Ctrl` on the server and while hydrating. */
export function useModKey(): string {
  return useSyncExternalStore(subscribe, modKey, () => SERVER_MOD_KEY)
}

/** The modifier as text, safe to render on the server: `<Kbd><ModKey />K</Kbd>`. */
export function ModKey() {
  return useModKey()
}
