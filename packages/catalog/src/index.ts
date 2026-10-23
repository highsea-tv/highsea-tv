// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/catalog: the signed catalog (ADR 0034). The service fetches, verifies, filters and caches
// definitions; the format, signing and build live here too, so the pipeline and the server can't
// disagree about what a valid catalog is. `@highsea-tv/catalog/build` is the pipeline's entry.
export * from './format.ts'
export * from './keys.ts'
export * from './load.ts'
export * from './providers.ts'
export * from './service.ts'
export * from './signing.ts'

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The signed seed snapshot this build ships, `{channel}/manifest.json` and its bundle. Joined as a
 * path, not `new URL('../seed', import.meta.url)`: Next's bundler turns that form into an asset
 * import (Next docs › urlImports › Asset Imports) and fails on a folder. Only the custom server,
 * unbundled, reads it.
 */
export const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed')
