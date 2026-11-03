// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./form-factor.ts: `?ff=` in the address the page opened at, as a prototype's
// frame gives it (`/web/?ff=touch`). The router drops the query as the client moves on (a choice
// on Choose a server replaces the address with `/web/sign-in`), and the root layout may mount again
// after that, so the value is read once, when this module loads, and kept for the tab's session in
// sessionStorage (https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage): a
// reload at `/web/sign-in` keeps the TV it opened as. A new `?ff=` replaces it. Only a page opened
// on its own keeps it: the prototypes' frames share one tab's storage, and their chrome gives each
// its input anyway (./frame-channel.ts). Storage may be missing or refuse (a private window), so
// it's guarded, and the value read at load still holds.
import type { formFactorOverride as native } from './form-factor.ts'

const KEY = 'highsea.ff'

function session(): Storage | undefined {
  try {
    if (window.parent !== window) return undefined
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

function first(): string | undefined {
  const asked =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('ff')
  try {
    if (asked) session()?.setItem(KEY, asked)
    return asked ?? session()?.getItem(KEY) ?? undefined
  } catch {
    return asked ?? undefined
  }
}

const opened = first()

export const formFactorOverride: typeof native = () => opened
