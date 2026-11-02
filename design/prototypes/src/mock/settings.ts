// SPDX-License-Identifier: AGPL-3.0-only
// The server's settings pages (A15, `/settings/*`): what each holds, with Harbor's values. The
// reference pages edit these as plain values; Phase 3 gives each section its own schema. Since
// stage 5 of prototype-gaps.md the shapes follow what apps/server built: General's Region, Updates
// and Diagnostics with Metadata and the indexer catalog, Media management's colons, permissions,
// root folders and tags, Import lists with Trakt and the exclusions, Connections with each kind's
// settings, and the browsers that get notifications. Lists, connections, tags and root folders
// save at once through their own calls (lists.ts, connections.ts, library-settings.ts).
import { defaultQualitySizes, type QualitySize } from '@highsea-tv/quality'
import { EPOCH, iso } from './clock.ts'
import { defaultPlaybackSettings, type PlaybackSettings } from './playback.ts'
import type { ImportList, ISODate, ServerEvent } from './types.ts'
import { defaultVpnSettings, type VpnSettings } from './vpn.ts'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Region, Updates and Diagnostics (8b): there are no automatic updates and no usage counts. */
export type GeneralSettings = {
  /** The server's own messages: English until there are translations. */
  language: string
  timeZone: string
  updateChannel: 'stable' | 'beta'
  logLevel: LogLevel
  /** Written to the config folder, never sent. */
  crashReports: boolean
}

/** Prometheus at `/metrics`, with a read-scoped API key. */
export type MetricsSettings = { enabled: boolean }

/** General › Metadata (checkpoint 4): the key itself never comes back, only its last four. */
export type MetadataSettings = {
  key: { set: boolean; last4: string | null; builtIn: boolean }
  /** TMDB's language, `en-GB`. */
  language: string
  /** ISO 3166-1, for certifications, release dates and Discover. */
  region: string
}

export type CatalogExtra = { url: string; keyId: string; publicKey: string }

/** General › Indexer catalog (checkpoint 5), the owner's alone. */
export type CatalogSettings = {
  channel: 'stable' | 'beta'
  autoUpdate: boolean
  extras: CatalogExtra[]
}

export const COLON_REPLACEMENTS = [
  'delete',
  'dash',
  'space-dash',
  'space-dash-space',
  'smart',
] as const
export type ColonReplacement = (typeof COLON_REPLACEMENTS)[number]

export type MediaSettings = {
  rename: boolean
  fileFormat: string
  folderFormat: string
  colonReplacement: ColonReplacement
  hardlinks: boolean
  nfo: boolean
  /** Off: folders get what the server's user gives them. */
  permissions: boolean
  chmod: string
  recycleBin: string
  /** 0 keeps deleted files until the bin is emptied. */
  recycleBinDays: number
  unmonitorDeleted: boolean
}

/** A root folder as Settings › Media management lists it (`rootFolders.list`). */
export type RootFolderRow = {
  id: string
  path: string
  free: number | null
  total: number | null
  accessible: boolean
  /** Movies filed under it. */
  movies: number
  /** New folders the library scan couldn't match surely, waiting in Library import. */
  waiting: number
  /** The subtitle languages a movie added here takes. */
  languageProfileId: string | null
}

/** A tag, and how many movies carry it (the mock's movies don't carry their tags yet). */
export type TagSeed = { id: string; label: string; movies: number }

export type Tag = {
  id: string
  label: string
  usage: { movies: number; indexers: number; lists: number; connections: number }
}

export type DownloadClientSettings = {
  port: number
  encryption: 'require' | 'prefer' | 'allow'
  upnp: boolean
  maxActive: number
}

export type NetworkSettings = {
  externalUrl: string
  trustedProxies: string
  proxyHeaders: boolean
  tls: 'proxy' | 'built-in' | 'off'
  discovery: boolean
}

export type SecuritySettings = {
  /** Require two-step for the owner and admins, the only people who open the admin. */
  twoFactor: boolean
  passkeys: boolean
  oidc: { enabled: boolean; name: string; issuer: string; clientId: string }
  sessionDays: number
}

export type BackupSettings = {
  schedule: 'daily' | 'weekly' | 'off'
  time: string
  keep: number
  location: string
}

export const CONNECTION_KINDS = [
  'discord',
  'slack',
  'telegram',
  'ntfy',
  'gotify',
  'pushover',
  'matrix',
  'email',
  'webhook',
  'apprise',
  'browser',
] as const
export type NotificationKind = (typeof CONNECTION_KINDS)[number]

/** What a connection can hear (checkpoint 8b's events, with 4.3a's Playback started). */
export const NOTIFICATION_EVENTS = [
  'grabbed',
  'imported',
  'upgraded',
  'download-failed',
  'subtitle-added',
  'health',
  'update',
  'movie-added',
  'playback-started',
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

/** A connection as saved: its secrets in full. `connections.list` masks them. */
export type Connection = {
  id: string
  kind: NotificationKind
  name: string
  enabled: boolean
  events: NotificationEvent[]
  /** The kind's own fields (`webhookUrl`, `topic`, `host`…); a Browser's `userIds`. */
  settings: Record<string, unknown>
  /** An Email connection that also sends invites and password resets. One at most. */
  serverMail: boolean
  tags: string[]
  lastSentAt: ISODate | null
  lastError: string | null
}

export type ConnectionInput = Omit<Connection, 'id' | 'lastSentAt' | 'lastError'>
export type ConnectionTest = { ok: boolean; message: string | null }

/** A browser that gets this person's notifications (web push). */
export type PushSubscription = {
  id: string
  userId: string
  label: string
  /** The push service the browser uses, by name. */
  service: string
  createdAt: ISODate
}

/** A title someone removed and asked lists not to add again. */
export type ListExclusion = {
  tmdbId: number
  title: string
  year: number | null
  createdAt: ISODate
}

/** Trakt: whether this build has highsea's application, and the account connected to it. */
export type TraktStatus = { available: boolean; account: string | null }

/** MiB per minute of runtime: below `min` or above `max` a release is rejected (@highsea-tv/quality). */
export type { QualitySize }

export type Settings = {
  general: GeneralSettings
  metrics: MetricsSettings
  metadata: MetadataSettings
  catalog: CatalogSettings
  media: MediaSettings
  rootFolders: RootFolderRow[]
  tags: TagSeed[]
  downloadClient: DownloadClientSettings
  vpn: VpnSettings
  playback: PlaybackSettings
  network: NetworkSettings
  security: SecuritySettings
  backups: BackupSettings
  connections: Connection[]
  pushSubscriptions: PushSubscription[]
  importLists: ImportList[]
  listExclusions: ListExclusion[]
  trakt: TraktStatus
  qualitySizes: QualitySize[]
}

export type SettingsSection = keyof Settings

/** What the settings' own calls (lists.ts, connections.ts, …) need from the mock server. */
export type SettingsDeps = {
  settings: Settings
  now: () => number
  emit: (event: ServerEvent) => void
  requireStaff: () => void
  requireOwner: () => void
  /** An ApiError with `details`, as the server's refusals carry (`field`, `reason`). */
  fail: (status: number, code: string, message: string, details?: Record<string, string>) => Error
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const TB = 1e12

export const defaultSettings = (
  kind: 'populated' | 'empty' = 'populated',
  now = EPOCH,
): Settings => {
  const empty = kind === 'empty'
  return {
    general: {
      language: 'en',
      timeZone: 'Europe/Lisbon',
      updateChannel: 'stable',
      logLevel: 'info',
      crashReports: true,
    },
    metrics: { enabled: false },
    // a fresh server uses the key built into the image; Harbor's owner added their own
    metadata: {
      key: empty
        ? { set: false, last4: null, builtIn: true }
        : { set: true, last4: '3f9a', builtIn: true },
      language: 'en-GB',
      region: 'PT',
    },
    catalog: {
      channel: 'stable',
      autoUpdate: true,
      extras: empty
        ? []
        : [
            {
              url: 'https://catalog.example.org/manifest.json',
              keyId: 'harbor-friends-2026',
              publicKey: 'MCowBQYDK2VwAyEAq7Jm2v4yXc9PZbF0d1Lh8sWnE3TgK5oRj6uYiA2xQe0=',
            },
          ],
    },
    media: {
      rename: true,
      fileFormat: '{Movie Title} ({Release Year}) {Quality Full}',
      folderFormat: '{Movie Title} ({Release Year})',
      colonReplacement: 'smart',
      hardlinks: true,
      nfo: false,
      permissions: false,
      chmod: '755',
      recycleBin: '',
      recycleBinDays: 7,
      unmonitorDeleted: true,
    },
    rootFolders: [
      {
        id: 'rf-movies',
        path: '/data/media/movies',
        free: 3.4 * TB,
        total: 16 * TB,
        accessible: true,
        movies: 0,
        waiting: empty ? 0 : 2,
        languageProfileId: empty ? null : 'lp-en',
      },
      ...(empty
        ? []
        : [
            {
              id: 'rf-movies-4k',
              path: '/data/media/movies-4k',
              free: 3.4 * TB,
              total: 16 * TB,
              accessible: true,
              movies: 0,
              waiting: 0,
              languageProfileId: null,
            },
          ]),
    ],
    tags: empty
      ? []
      : [
          { id: 't-4k', label: '4k', movies: 6 },
          { id: 't-kids', label: 'kids', movies: 9 },
          { id: 't-silent', label: 'silent', movies: 4 },
        ],
    downloadClient: {
      port: 6881,
      encryption: 'prefer',
      upnp: false,
      maxActive: 3,
    },
    vpn: defaultVpnSettings(kind),
    playback: defaultPlaybackSettings(),
    network: {
      externalUrl: 'https://harbor.example.net',
      trustedProxies: '172.18.0.0/16',
      proxyHeaders: true,
      tls: 'proxy',
      discovery: true,
    },
    security: {
      twoFactor: true,
      passkeys: true,
      oidc: {
        enabled: true,
        name: 'Authentik',
        issuer: 'https://auth.example.net/application/o/highsea/',
        clientId: 'highsea',
      },
      sessionDays: 30,
    },
    backups: { schedule: 'daily', time: '03:30', keep: 14, location: '/config/backups' },
    connections: empty
      ? []
      : [
          {
            id: 'n-discord',
            kind: 'discord',
            name: 'Household Discord',
            enabled: true,
            events: ['imported', 'download-failed', 'health'],
            settings: {
              webhookUrl:
                'https://discord.com/api/webhooks/1290031457/hS4kq0Zr7vYp2LwXbT9mN1cJ8fGd6eRa5uUi3oPl0sQ2',
              username: 'highsea',
            },
            serverMail: false,
            tags: [],
            lastSentAt: iso(now - 3 * HOUR),
            lastError: null,
          },
          {
            id: 'n-ntfy',
            kind: 'ntfy',
            name: 'Ines’s phone',
            enabled: true,
            events: ['grabbed', 'imported', 'health', 'update'],
            settings: { serverUrl: 'https://ntfy.sh', topic: 'harbor-4f2a9c', priority: 3 },
            serverMail: false,
            tags: [],
            lastSentAt: iso(now - 20 * MIN),
            lastError: null,
          },
          {
            id: 'n-mail',
            kind: 'email',
            name: 'Harbor mail',
            enabled: true,
            events: ['health', 'update'],
            settings: {
              host: 'smtp.example.net',
              port: 587,
              security: 'starttls',
              username: 'media@harbor.example.net',
              password: 'n8Vq2xLr5tWz',
              from: 'highsea <media@harbor.example.net>',
              to: 'owner@harbor.example.net',
            },
            serverMail: true,
            tags: [],
            lastSentAt: iso(now - 2 * DAY),
            lastError: null,
          },
          {
            id: 'n-gotify',
            kind: 'gotify',
            name: 'Theo’s Gotify',
            enabled: false,
            events: ['grabbed', 'imported'],
            settings: {
              serverUrl: 'http://gotify.lan:8080',
              appToken: 'AqZ7mR2pK9xW',
              priority: 5,
            },
            serverMail: false,
            tags: ['t-4k'],
            lastSentAt: iso(now - 9 * DAY),
            lastError: 'Couldn’t reach gotify.lan:8080 (connection refused).',
          },
        ],
    pushSubscriptions: empty
      ? []
      : [
          {
            id: 'ps-firefox',
            userId: 'u-ines',
            label: 'Firefox on macOS',
            service: 'Mozilla',
            createdAt: iso(now - 12 * DAY),
          },
        ],
    importLists: empty
      ? []
      : [
          {
            id: 'il-trakt',
            name: 'Ines’s Trakt watchlist',
            enabled: true,
            settings: { kind: 'trakt', source: 'watchlist' },
            rootFolder: '/data/media/movies',
            qualityProfileId: 'qp-uhd',
            languageProfileId: null,
            monitored: true,
            minimumAvailability: 'released',
            searchOnAdd: true,
            tags: [],
            items: 18,
            lastSync: iso(now - 2 * HOUR),
            lastResult: { found: 18, added: 2, skipped: 16, unresolved: [], error: null },
          },
          {
            id: 'il-tmdb-popular',
            name: 'Popular on TMDB',
            enabled: true,
            settings: { kind: 'tmdb', source: 'popular' },
            rootFolder: '/data/media/movies',
            qualityProfileId: 'qp-hd',
            languageProfileId: 'lp-en',
            monitored: false,
            minimumAvailability: 'released',
            searchOnAdd: false,
            tags: [],
            items: 20,
            lastSync: iso(now - 4 * HOUR),
            lastResult: {
              found: 20,
              added: 1,
              skipped: 18,
              unresolved: ['The Lighthouse Keeper’s Daughter'],
              error: null,
            },
          },
          {
            id: 'il-silent',
            name: 'Silent cinema essentials',
            enabled: false,
            settings: {
              kind: 'generic',
              url: 'https://mdblist.com/lists/harbor-films/silent-essentials/json',
            },
            rootFolder: '/data/media/movies',
            qualityProfileId: 'qp-hd',
            languageProfileId: null,
            monitored: true,
            minimumAvailability: 'released',
            searchOnAdd: false,
            tags: ['t-silent'],
            items: 42,
            lastSync: iso(now - 3 * DAY),
            lastResult: {
              found: 0,
              added: 0,
              skipped: 0,
              unresolved: [],
              error: 'The address answered 404 Not Found.',
            },
          },
        ],
    listExclusions: empty
      ? []
      : [
          {
            tmdbId: 457_219,
            title: 'The Glass Orchard',
            year: 2025,
            createdAt: iso(now - 6 * DAY),
          },
          { tmdbId: 391_004, title: 'Night Ferry', year: 2023, createdAt: iso(now - 21 * DAY) },
        ],
    trakt: { available: true, account: empty ? null : 'harbor-ines' },
    qualitySizes: defaultQualitySizes(),
  }
}
