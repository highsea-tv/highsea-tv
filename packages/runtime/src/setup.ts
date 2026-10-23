// SPDX-License-Identifier: AGPL-3.0-only
// First-run setup (setup.md): browsing folders inside the media root, the hardlink check, and
// finishing: the server's name, the owner, the folders, remote access. Browsing never leaves
// the media root, so an unauthenticated caller before setup sees nothing else of the disk (OWASP
// Path Traversal: canonicalize, then check the prefix).
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { AppError, type Clock, type EventBus } from '@highsea-tv/core'
import { type Db, readSetting, writeSetting } from '@highsea-tv/db'
import { defaultNetworkSettings, type NetworkSettings, PRIVATE_RANGES } from '@highsea-tv/network'
import type { Config } from './config.ts'

export const SETUP_KEY = 'setup'
export const FOLDERS_KEY = 'folders'
export const CLOUD_KEY = 'cloud'

export type SetupState = { completedAt: number | null }
/** The folders chosen in setup; checkpoint 4 turns them into root folders. */
export type MediaFolders = { movies: string; downloads: string }

export type RemoteAccessInput =
  | { kind: 'local-only' }
  | { kind: 'reverse-proxy'; url: string }
  | { kind: 'port-forward'; port: number }

export const isSetupComplete = (db: Db) =>
  readSetting<SetupState>(db, SETUP_KEY, { completedAt: null }).completedAt !== null

const invalid = (message: string, field: string) => new AppError('invalid', message, { field })

/**
 * `path` with symlinks resolved, though it may not exist yet: the nearest folder that exists,
 * canonicalized, plus the rest. A symlink can't lead out of the root, and a root behind one
 * (macOS's /var is /private/var) compares like for like.
 */
function canonical(path: string): string {
  const wanted = resolve(path)
  let existing = wanted
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing)
  return join(realpathSync(existing), wanted.slice(existing.length))
}

/** The canonical path of `path`, if it's inside the media root (OWASP Path Traversal). */
function insideRoot(config: Config, path: string): string | null {
  const root = canonical(config.dataDir)
  const real = canonical(path)
  return real === root || real.startsWith(root + sep) ? real : null
}

export function setupDefaults(config: Config) {
  const dataDir = resolve(config.dataDir)
  return {
    dataDir,
    folders: { movies: join(dataDir, 'media', 'movies'), downloads: join(dataDir, 'downloads') },
    serverName: 'highsea',
  }
}

/** The folders inside `path`, which must be in the media root. Hidden folders are left out. */
export function listFolders(config: Config, path: string) {
  const real = insideRoot(config, path)
  if (!real) throw invalid(`Choose a folder inside ${resolve(config.dataDir)}.`, 'path')
  if (!existsSync(real) || !statSync(real).isDirectory())
    throw new AppError('not-found', `${path} doesn’t exist on the server.`)
  return readdirSync(real, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, path: join(resolve(path), d.name), kind: 'folder' as const }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The filesystem a path is on, or would be once made: its nearest existing folder's device. */
function deviceOf(path: string): number {
  let p = path
  while (!existsSync(p) && dirname(p) !== p) p = dirname(p)
  return statSync(p).dev
}

/** setup.md's hardlink check: same filesystem, imports hardlink; otherwise they're copied. */
export function checkHardlinks(config: Config, a: string, b: string) {
  if (!a || !b) return { ok: false, sameDevice: false, message: 'Pick both folders first.' }
  const ra = insideRoot(config, a)
  const rb = insideRoot(config, b)
  if (!ra || !rb) throw invalid(`Choose folders inside ${resolve(config.dataDir)}.`, 'path')
  const same = deviceOf(ra) === deviceOf(rb)
  return same
    ? {
        ok: true,
        sameDevice: true,
        message:
          'Both folders are on the same disk, so imports are hardlinked: seeding takes no extra space.',
      }
    : {
        ok: false,
        sameDevice: false,
        message:
          'These folders are on different disks, so imports are copied. While a movie seeds, it takes twice the space. To avoid it, pick a downloads folder on the same disk as your movies.',
      }
}

/** What each remote-access choice sets in Settings › Network. */
export function networkFor(remote: RemoteAccessInput): NetworkSettings {
  switch (remote.kind) {
    case 'local-only':
      return { ...defaultNetworkSettings }
    case 'reverse-proxy':
      // a proxy on the same host or a Docker network; Settings narrows it
      return {
        ...defaultNetworkSettings,
        remoteAccess: 'reverse-proxy',
        externalUrl: remote.url.trim().replace(/\/+$/, ''),
        trustedProxies: PRIVATE_RANGES.join(', '),
        proxyHeaders: true,
        tls: 'proxy',
      }
    case 'port-forward':
      return {
        ...defaultNetworkSettings,
        remoteAccess: 'port-forward',
        tls: 'built-in',
        httpsPort: remote.port,
      }
  }
}

/** Checks everything setup.md's validation table lists that isn't the owner's account. */
export function checkSetup(
  config: Config,
  input: { serverName: string; folders: MediaFolders; remoteAccess: RemoteAccessInput },
) {
  if (!input.serverName.trim()) throw invalid('Give the server a name.', 'serverName')
  if (!input.folders.movies.trim()) throw invalid('Pick a folder for movies.', 'folders.movies')
  if (!input.folders.downloads.trim())
    throw invalid('Pick a folder for downloads.', 'folders.downloads')
  const movies = insideRoot(config, input.folders.movies)
  const downloads = insideRoot(config, input.folders.downloads)
  if (!movies) throw invalid(`Choose a folder inside ${resolve(config.dataDir)}.`, 'folders.movies')
  if (!downloads)
    throw invalid(`Choose a folder inside ${resolve(config.dataDir)}.`, 'folders.downloads')
  if (movies === downloads)
    throw invalid('Use a different folder from the movies folder.', 'folders.downloads')
  const r = input.remoteAccess
  if (r.kind === 'reverse-proxy') {
    let url: URL | null = null
    try {
      url = new URL(r.url.trim())
    } catch {}
    if (url?.protocol !== 'https:')
      throw invalid('Enter the full address, starting with https://', 'remoteAccess.url')
  }
  if (r.kind === 'port-forward' && (!Number.isInteger(r.port) || r.port < 1024 || r.port > 65535))
    throw invalid('Use a port from 1024 to 65535.', 'remoteAccess.port')
  return { movies, downloads }
}

/** Saves setup's choices, makes the folders, and marks setup complete. */
export function saveSetup(
  { db, config, clock, events }: { db: Db; config: Config; clock: Clock; events: EventBus },
  input: { folders: MediaFolders; remoteAccess: RemoteAccessInput; cloudLink: boolean },
  rename: (name: string) => void,
  serverName: string,
) {
  const { movies, downloads } = checkSetup(config, { serverName, ...input })
  for (const dir of [movies, downloads]) mkdirSync(dir, { recursive: true })
  const now = clock.now()
  rename(serverName.trim())
  writeSetting<MediaFolders>(db, FOLDERS_KEY, { movies, downloads }, now)
  writeSetting(db, 'network', networkFor(input.remoteAccess), now)
  // linking happens when highsea cloud exists; until then the choice is remembered
  writeSetting(db, CLOUD_KEY, { wanted: input.cloudLink, linked: false }, now)
  writeSetting<SetupState>(db, SETUP_KEY, { completedAt: now }, now)
  events.emit({ topic: 'server.updated' })
  events.emit({ topic: 'settings.updated' })
}
