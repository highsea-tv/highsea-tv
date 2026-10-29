// SPDX-License-Identifier: AGPL-3.0-only
// First-run setup (setup.md): browsing folders inside the media root, the hardlink check, and
// finishing: the server's name, the owner, the folders, remote access. Browsing never leaves
// the media root, so an unauthenticated caller before setup sees nothing else of the disk (OWASP
// Path Traversal: canonicalize, then check the prefix). Since 4.3c, what setup used to ask is
// detected first (install-simplicity.md B): the host's name, the folders under /data, the address
// apps use.
import { existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { hostname, type NetworkInterfaceInfo, networkInterfaces } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { AppError, type Clock, type EventBus } from '@highsea-tv/core'
import { type Db, readSetting, writeSetting } from '@highsea-tv/db'
import { defaultNetworkSettings, type NetworkSettings, PRIVATE_RANGES } from '@highsea-tv/network'
import type { Config } from './config.ts'

export const SETUP_KEY = 'setup'
export const FOLDERS_KEY = 'folders'
export const CLOUD_KEY = 'cloud'
/** The address apps on the network use, as setup's Review left it (ADR 0020's 4.3c section). */
export const ADDRESS_KEY = 'address'
export type AdvertisedAddress = { address: string }

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

// ---------------------------------------------------------------- what highsea finds by itself

/**
 * The host's name as a server name: its first label (`harbor.local` → `harbor`). Null for a name
 * that says nothing: Docker's default hostname is the container's id, 12 hex digits
 * (https://docs.docker.com/reference/cli/docker/container/run/#hostname), and `localhost`.
 */
export function detectServerName(name = hostname()): string | null {
  const first = name.split('.')[0]?.trim() ?? ''
  if (!first || /^[0-9a-f]{12}$/.test(first) || first.toLowerCase() === 'localhost') return null
  return first.slice(0, 60)
}

/** Where a library's movies usually are under /data: TRaSH's layout first, then a flat one. */
const MOVIE_FOLDERS = [['media', 'movies'], ['movies'], ['media', 'films'], ['films']]
/** Where downloads usually are: highsea's own layout, then TRaSH's. */
const DOWNLOAD_FOLDERS = [['downloads'], ['torrents']]

/** A folder below `root` matching `parts` without regard to case, or null. */
function findFolder(root: string, parts: string[]): string | null {
  let at = root
  for (const part of parts) {
    let next: string | undefined
    try {
      next = readdirSync(at, { withFileTypes: true }).find(
        (d) => d.isDirectory() && d.name.toLowerCase() === part,
      )?.name
    } catch {
      return null
    }
    if (!next) return null
    at = join(at, next)
  }
  return at
}

/**
 * The movies and downloads folders under the media root, or null when setup has to ask. An empty
 * or missing root gets highsea's own layout, which setup makes; a movies folder without a
 * downloads folder gets `downloads` beside it, on the same mount, so imports hardlink. A root
 * with other folders and no movies folder is the owner's to point at.
 */
export function detectFolders(config: Config): MediaFolders | null {
  const root = resolve(config.dataDir)
  let entries: string[] = []
  try {
    // ext4's lost+found and highsea's own transcode cache (ADR 0051) say nothing about the library
    entries = readdirSync(root).filter(
      (name) => !name.startsWith('.') && name !== 'lost+found' && name !== 'transcodes',
    )
  } catch {
    // not there yet: Docker makes the mount point, and setup the folders
  }
  if (!entries.length) return setupDefaults(config).folders
  const movies = MOVIE_FOLDERS.map((p) => findFolder(root, p)).find(Boolean)
  if (!movies) return null
  const downloads = DOWNLOAD_FOLDERS.map((p) => findFolder(root, p)).find(Boolean)
  return { movies, downloads: downloads ?? join(root, 'downloads') }
}

/** Interfaces Docker makes on the host: seen only with host networking. */
const DOCKER_INTERFACE = /^(docker\d+|br-[0-9a-f]+|veth)/

/**
 * The address apps on the network use (ADR 0020's 4.3c section), as `host:port`.
 * `HIGHSEA_PUBLISHED_URL` wins, as Jellyfin's `JELLYFIN_PublishedServerUrl` does. Otherwise the
 * host's own address, when highsea can see it: outside a container, or inside one with host
 * networking, where Docker's own interfaces show. In a bridge network the container sees only its
 * own address, which nothing outside can reach, so it's null and setup offers the one the browser
 * used.
 */
export function detectAddress(
  config: Config,
  {
    interfaces = networkInterfaces(),
    inContainer = existsSync('/.dockerenv'),
  }: { interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>; inContainer?: boolean } = {},
): string | null {
  if (config.publishedUrl) return new URL(config.publishedUrl).host
  const names = Object.keys(interfaces)
  if (inContainer && !names.some((n) => DOCKER_INTERFACE.test(n))) return null
  const lan = names
    .filter((n) => !DOCKER_INTERFACE.test(n))
    .flatMap((n) => interfaces[n] ?? [])
    .filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
  // a private address first: that's the one on the home network
  const best =
    lan.find((a) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) ?? lan[0]
  return best ? `${best.address}:${config.port}` : null
}

/** `host:port`, a name or an IPv4 address with an optional port, as Review's check has it. */
export const isAddress = (value: string) => /^[^\s/:]+(:\d{1,5})?$/.test(value)

// ---------------------------------------------------------------- browsing

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
  input: {
    serverName: string
    folders: MediaFolders
    remoteAccess: RemoteAccessInput
    address?: string
  },
) {
  if (!input.serverName.trim()) throw invalid('Give the server a name.', 'serverName')
  if (input.address?.trim() && !isAddress(input.address.trim()))
    throw invalid('Enter the address apps use, such as 192.168.1.20:3000.', 'address')
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
  input: {
    folders: MediaFolders
    remoteAccess: RemoteAccessInput
    cloudLink?: boolean
    address?: string
  },
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
  writeSetting(db, CLOUD_KEY, { wanted: input.cloudLink ?? false, linked: false }, now)
  const address = input.address?.trim()
  if (address) writeSetting<AdvertisedAddress>(db, ADDRESS_KEY, { address }, now)
  writeSetting<SetupState>(db, SETUP_KEY, { completedAt: now }, now)
  events.emit({ topic: 'server.updated' })
  events.emit({ topic: 'settings.updated' })
}
