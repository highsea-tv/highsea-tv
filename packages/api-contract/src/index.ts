// SPDX-License-Identifier: AGPL-3.0-only
// The public API's contract (ADR 0006): every route's method, path, inputs and responses, as zod
// schemas with OpenAPI metadata. The server implements these routes; the SDK calls them; the
// OpenAPI document is generated from them. The prototype's draft types
// (design/prototypes/src/mock/types.ts) move here a route group at a time.
export * from './accounts.ts'
export * from './collections.ts'
export * from './common.ts'
export * from './connections.ts'
export * from './curation.ts'
export * from './downloads.ts'
export * from './events.ts'
export * from './importers.ts'
export * from './indexers.ts'
export * from './library.ts'
export * from './library-import.ts'
export * from './lists.ts'
export * from './metadata.ts'
export * from './movies.ts'
export * from './operations.ts'
export * from './personalization.ts'
export * from './quality.ts'
export * from './settings.ts'
export * from './setup.ts'
export * from './subtitles.ts'
export * from './system.ts'
export * from './tags.ts'
export * from './vpn.ts'
export * from './wanted.ts'

import { apiKeys, audit, auth, devices, links, me, users } from './accounts.ts'
import { collections, libraryCollections } from './collections.ts'
import { connections, pushSubscriptions } from './connections.ts'
import { announcements, clientHome, curation } from './curation.ts'
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
import { importers } from './importers.ts'
import { catalog, indexers, releaseRoutes } from './indexers.ts'
import { library } from './library.ts'
import { libraryImport } from './library-import.ts'
import { importLists } from './lists.ts'
import { metadata } from './metadata.ts'
import { movies, rootFolders } from './movies.ts'
import { operationsSettings } from './operations.ts'
import { appearance, dashboard, home, preferences } from './personalization.ts'
import { quality } from './quality.ts'
import { settings } from './settings.ts'
import { setup } from './setup.ts'
import { subtitles } from './subtitles.ts'
import { system } from './system.ts'
import { tags } from './tags.ts'
import { vpn } from './vpn.ts'
import { wanted } from './wanted.ts'

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
  settings: { ...settings, ...downloadSettingsRoutes, ...operationsSettings },
  audit,
  dashboard,
  preferences,
  home: { ...home, ...clientHome },
  appearance,
  movies: { ...movies, ...releaseRoutes, ...movieDownloadRoutes },
  metadata,
  quality,
  rootFolders,
  library: { ...library, ...libraryCollections },
  indexers,
  catalog,
  queue,
  history,
  blocklist,
  downloads,
  fs,
  manualImport,
  libraryImport,
  importers,
  vpn,
  subtitles,
  wanted,
  importLists,
  connections,
  pushSubscriptions,
  curation,
  collections,
  announcements,
  tags,
} as const
