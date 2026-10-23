// SPDX-License-Identifier: AGPL-3.0-only
// The one Node version highsea runs and is tested on: `.nvmrc`, which CI (`node-version-file`) and
// the Docker image (`node:24.21.0-bookworm-slim`) match. better-sqlite3 is a native addon built for
// one Node, and the platform's behaviour is only checked on this one, so anything that runs the
// server under Node checks first: `node scripts/check-node.ts`, or `assertNodeVersion()`.
import { readFileSync } from 'node:fs'

export const NODE_VERSION = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim()

/** Throws unless this process is the Node in `.nvmrc`. */
export function assertNodeVersion(version = process.versions.node): void {
  if (version !== NODE_VERSION)
    throw new Error(
      `highsea runs on Node ${NODE_VERSION} (.nvmrc), but this is Node ${version}. ` +
        'Switch with `nvm use` (or your version manager), then reinstall so better-sqlite3 ' +
        'matches: `rm -rf node_modules && bun install`.',
    )
}

if (import.meta.main) {
  try {
    assertNodeVersion()
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
