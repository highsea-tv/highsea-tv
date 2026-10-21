// SPDX-License-Identifier: AGPL-3.0-only
// The public API's contract (ADR 0006): every route's method, path, inputs and responses, as zod
// schemas with OpenAPI metadata. The server implements these routes; the SDK calls them; the
// OpenAPI document is generated from them. The prototype's draft types
// (design/prototypes/src/mock/types.ts) move here a route group at a time.
export * from './accounts.ts'
export * from './common.ts'
export * from './downloads.ts'
export * from './events.ts'
export * from './indexers.ts'
export * from './library.ts'
export * from './metadata.ts'
export * from './movies.ts'
export * from './personalization.ts'
export * from './quality.ts'
export * from './settings.ts'
export * from './setup.ts'
export * from './system.ts'
export * from './vpn.ts'

import { apiKeys, audit, auth, devices, links, me, users } from './accounts.ts'
import {
  blocklist,
  downloadSettingsRoutes,
  downloads,
  fs,
  history,
  manualImport,
  movieDownloadRoutes,
  queue,
  speedRoutes,
} from './downloads.ts'
import { catalog, indexers, releaseRoutes } from './indexers.ts'
import { library } from './library.ts'
import { metadata } from './metadata.ts'
import { movies, rootFolders } from './movies.ts'
import { appearance, dashboard, home, preferences } from './personalization.ts'
import { quality } from './quality.ts'
import { settings } from './settings.ts'
import { setup } from './setup.ts'
import { system } from './system.ts'
import { vpn } from './vpn.ts'

/** Every route, by group. The SDK builds its methods from this. */
export const routes = {
  system: { ...system, ...speedRoutes },
  setup,
  auth,
  links,
  me,
  users,
  devices,
  apiKeys,
  settings: { ...settings, ...downloadSettingsRoutes },
  audit,
  dashboard,
  preferences,
  home,
  appearance,
  movies: { ...movies, ...releaseRoutes, ...movieDownloadRoutes },
  metadata,
  quality,
  rootFolders,
  library,
  indexers,
  catalog,
  queue,
  history,
  blocklist,
  downloads,
  fs,
  manualImport,
  vpn,
} as const
