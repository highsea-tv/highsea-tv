// SPDX-License-Identifier: AGPL-3.0-only
// Where the web's player runs (./playback.web.ts): what it loads by URL, what it fetches the
// server with when the page is closing, and which computer's app it's in. In a browser at /web the
// page and the server share an origin and the session cookie signs every request, so the
// defaults change nothing. The desktop app's page reaches the server through its Rust side
// instead (ADR 0058, apps/web/src/host.ts) and says so with `WebHostProvider`, which must hold
// every player it renders: outside it, the player loads streams from the page's own origin, which
// in the app isn't the server, and says so in development.
import { createContext, createElement, type ReactNode, useContext } from 'react'

export type WebHost = {
  /** A server path as the page loads it by URL. Full URLs are left as they are. */
  media: (url: string) => string
  /** The fetch for the requests the player sends itself, with `keepalive`. */
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  /** The desktop app's computer, for the playback profile it starts from (ADR 0052). */
  app?: 'mac' | 'windows' | 'linux'
}

const browser: WebHost = {
  media: (url) => url,
  fetch: (input, init) => fetch(input, init),
}

// null outside a provider, so the desktop app's mistake can be told from a browser's default
const Host = createContext<WebHost | null>(null)

export function WebHostProvider({ value, children }: { value: WebHost; children: ReactNode }) {
  return createElement(Host.Provider, { value }, children)
}

let warned = false

export function useWebHost(): WebHost {
  const host = useContext(Host)
  if (host) return host
  // Tauri 2 puts `__TAURI_INTERNALS__` on every window it opens (apps/web/src/host.ts's `inApp`);
  // `process.env.NODE_ENV` is replaced by Vite and Metro at build time
  if (
    !warned &&
    process.env.NODE_ENV !== 'production' &&
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  ) {
    warned = true
    console.warn(
      'highsea: a player was rendered outside WebHostProvider in the desktop app, so its streams load from the page, not the server',
    )
  }
  return browser
}
