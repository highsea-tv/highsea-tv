// SPDX-License-Identifier: AGPL-3.0-only
// What a guide's screenshot is: a page of the admin on the seeded server (scripts/sweeps/seeded.ts),
// what to do once it's up, and what to keep. Each area of the guides lists its own in areas/.
import type { Locator, Page } from 'playwright-core'
import type { Server, seed } from '../sweeps/seeded.ts'

export type Seeded = Awaited<ReturnType<typeof seed>>

export type Context = {
  server: Server
  seeded: Seeded
  /** The API as the owner. */
  api: <T>(method: string, path: string, body?: unknown) => Promise<T>
}

export type Shot = {
  /** The file's name in apps/docs/public/images/admin/<area>/, without .png. */
  name: string
  /** The admin address, or one worked out from what was seeded. */
  path: string | ((c: Context) => string)
  /** What to do once the page is up: open a tab, a dialog, a menu. */
  act?: (page: Page, c: Context) => Promise<void>
  /** The part of the page to keep; the whole viewport otherwise. */
  crop?: (page: Page) => Locator
  /** The viewport, 1280 × 800 unless given. */
  width?: number
  height?: number
}

export type Area = {
  /** Data the area's pages need beyond the shared seed, made through the API before its shots. */
  prepare?: (c: Context) => Promise<void>
  /** Undoes what `prepare` changed that other areas' pages would show, after its shots. */
  finish?: (c: Context) => Promise<void>
  shots: Shot[]
}
