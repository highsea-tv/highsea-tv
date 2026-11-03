// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./discovery.ts: a browser can't browse Bonjour, and the web client is served
// by its server, so nothing is found and the browser says so at once.
import type { browse as nativeBrowse } from './discovery.ts'

export type { BrowseState, Found } from './discovery.ts'

export const browse: typeof nativeBrowse = (on) => {
  on.state({ state: 'failed' })
  return () => {}
}
