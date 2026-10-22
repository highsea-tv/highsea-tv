// SPDX-License-Identifier: AGPL-3.0-only
// The mock servers' starting data. "populated" is Harbor, a server a year into use: about forty
// movies in varied states, a live queue, five indexers (one backing off), synced subtitles and a
// live announcement. "empty" is the same server just after setup: profiles and the catalog exist,
// nothing else does.
import { art, backdropArt, library, posterArt, stillArt, type Title } from '@highsea/fixtures'
import { seedFormats, seedProfiles } from '@highsea/quality'
import { iso } from './clock.ts'
import { defaultSettings, type Settings } from './settings.ts'
import type {
  Announcement,
  ApiKey,
  Appearance,
  Backup,
  BlocklistEntry,
  CatalogDefinition,
  CustomFormat,
  Device,
  DiscoveredServer,
  DiscoverMovie,
  FeaturedSection,
  HealthCheck,
  HistoryEvent,
  HomeLayout,
  Indexer,
  ISODate,
  Job,
  KnownServer,
  Language,
  LanguageProfile,
  MediaFile,
  MediaItem,
  MediaStatus,
  PlaybackPrefs,
  QualityProfile,
  RuleCondition,
  RuleGroup,
  Server,
  SmartCollection,
  SpeedSample,
  Stream,
  SubtitleProvider,
  SubtitleSettings,
  SubtitleTrack,
  SystemStatus,
  Torrent,
  TorrentLimits,
  TorrentState,
  User,
} from './types.ts'
import type { VpnRuntime } from './vpn.ts'

export const GB = 1e9
export const MB = 1e6
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export type FsNode = { device: string; children?: string[]; size?: number }

/** Where an item is in the download → import → subtitles pipeline (simulation bookkeeping). */
export type PipelineStep = {
  itemId: string
  torrentId: string
  stage: 'importing' | 'subtitle-search' | 'subtitle-sync'
  /** Simulated ms when this stage ends. */
  until: number
}

export type ServerState = {
  server: Server
  users: User[]
  devices: Device[]
  items: MediaItem[]
  files: MediaFile[]
  qualityProfiles: QualityProfile[]
  customFormats: CustomFormat[]
  torrents: Torrent[]
  history: HistoryEvent[]
  blocklist: BlocklistEntry[]
  catalog: CatalogDefinition[]
  indexers: Indexer[]
  languageProfiles: LanguageProfile[]
  languages: Language[]
  subtitles: SubtitleTrack[]
  providers: SubtitleProvider[]
  subtitleSettings: SubtitleSettings
  torrentLimits: TorrentLimits
  announcements: Announcement[]
  featured: FeaturedSection[]
  /** Collections the owner and admins made (docs/product/collections.md). */
  collections: SmartCollection[]
  jobs: Job[]
  health: HealthCheck[]
  status: SystemStatus
  speeds: SpeedSample[]
  fs: Record<string, FsNode>
  discovered: DiscoveredServer[]
  discoverCatalog: DiscoverMovie[]
  /** Servers this device has signed in to (the clients' switcher). */
  known: KnownServer[]
  /** Where each user is in each title (Continue watching, Resume). */
  watch: { userId: string; itemId: string; position: number; updatedAt: ISODate }[]
  /** Per user and title: the player's remembered picks, keyed `${userId}:${itemId}`. */
  prefs: Record<string, PlaybackPrefs>
  pipeline: PipelineStep[]
  /** Announcement ids the signed-in user dismissed or acknowledged. */
  seen: Record<string, string[]>
  appearance: Appearance
  apiKeys: ApiKey[]
  settings: Settings
  /** The tunnel's state apart from its settings (docs/product/vpn.md). */
  vpn: VpnRuntime
  backups: Backup[]
  /** Per user: their own order and hidden rows on Home (C7). */
  homeLayouts: Record<string, HomeLayout>
}

// ---------------------------------------------------------------- collections

const when = (
  id: string,
  field: RuleCondition['field'],
  op: RuleCondition['op'],
  value: RuleCondition['value'],
): RuleCondition => ({ kind: 'condition', id, field, op, value })

const all = (id: string, ...rules: RuleGroup['rules']): RuleGroup => ({
  kind: 'group',
  id,
  match: 'all',
  rules,
})

/**
 * The owner's example, a hand-picked one, one with exceptions, a composer's, the silent era (the
 * featured section's source) and one that matches nothing yet.
 */
function seedCollections(now: number): SmartCollection[] {
  const base = {
    summary: '',
    artwork: null,
    include: [],
    exclude: [],
    sort: 'rating',
    descending: true,
    limit: null,
    audience: { kind: 'everyone' },
    updatedAt: iso(now - 3 * DAY),
  } satisfies Partial<SmartCollection>
  return [
    {
      ...base,
      id: 'sc-2010s',
      name: '2010s, 4.5 stars and up, in English',
      summary: 'The best of the decade, in English.',
      rules: all(
        'g-2010s',
        when('c-year', 'year', 'between', [2010, 2020]),
        when('c-rating', 'rating', 'atLeast', 4.5),
        when('c-lang', 'originalLanguage', 'is', 'en'),
      ),
    },
    {
      ...base,
      id: 'sc-staff',
      name: 'Staff picks',
      summary: 'Ines’s favourites, in her order.',
      rules: null,
      include: ['metropolis', 'sintel', 'his-girl-friday', 'the-general', 'charade', 'spring'],
      sort: 'manual',
      updatedAt: iso(now - 9 * DAY),
    },
    {
      ...base,
      id: 'sc-dead',
      name: 'Zombie night',
      summary: 'Romero’s dead, and the films they walked out of.',
      rules: {
        kind: 'group',
        id: 'g-dead',
        match: 'any',
        rules: [
          when('c-kw', 'keyword', 'anyOf', ['zombie']),
          all(
            'g-vamp',
            when('c-vamp', 'keyword', 'anyOf', ['vampire']),
            when('c-before', 'year', 'before', 1970),
          ),
        ],
      },
      include: ['carnival-of-souls'],
      exclude: ['nosferatu'],
      sort: 'release',
      descending: false,
      audience: { kind: 'roles', roles: ['owner', 'admin'] },
    },
    {
      ...base,
      id: 'sc-morgenstern',
      name: 'Scored by Jan Morgenstern',
      summary: 'Blender’s composer, from Elephants Dream on.',
      rules: all('g-jan', when('c-jan', 'composer', 'includes', ['jan-morgenstern'])),
      sort: 'release',
      descending: false,
    },
    {
      ...base,
      id: 'sc-silent',
      name: 'The silent era',
      summary: 'Restored and scored.',
      rules: all('g-silent', when('c-silent', 'year', 'before', 1930)),
      sort: 'release',
      descending: false,
    },
    {
      ...base,
      id: 'sc-dolby',
      name: 'In Dolby Vision',
      summary: 'For the big screen, once the first Dolby Vision files arrive.',
      rules: all('g-dolby', when('c-dolby', 'hdr', 'is', 'dolby-vision')),
      updatedAt: iso(now - DAY),
    },
  ]
}

// ---------------------------------------------------------------- shared by both servers

const users = (now: number): User[] => [
  {
    id: 'u-ines',
    username: 'ines',
    displayName: 'Ines',
    role: 'owner',
    permissions: [],
    libraries: 'all',
    twoFactor: true,
    lastSeen: iso(now),
    invited: false,
  },
  {
    id: 'u-theo',
    username: 'theo',
    displayName: 'Theo',
    role: 'admin',
    permissions: [],
    libraries: 'all',
    twoFactor: false,
    lastSeen: iso(now - 3 * HOUR),
    invited: false,
  },
  {
    id: 'u-ruth',
    username: 'ruth',
    displayName: 'Ruth',
    role: 'user',
    permissions: ['request', 'download'],
    libraries: 'all',
    twoFactor: false,
    lastSeen: iso(now - 26 * HOUR),
    invited: false,
  },
  {
    id: 'u-sam',
    username: 'sam',
    displayName: 'Sam',
    role: 'user',
    permissions: ['request'],
    libraries: 'all',
    twoFactor: false,
    lastSeen: iso(now - 4 * DAY),
    invited: false,
  },
  {
    id: 'u-kids',
    username: 'kids',
    displayName: 'Kids',
    role: 'user',
    permissions: [],
    libraries: ['movies'],
    twoFactor: false,
    lastSeen: iso(now - 2 * DAY),
    invited: false,
  },
  {
    id: 'u-noor',
    username: 'noor',
    displayName: 'Noor',
    role: 'user',
    permissions: ['request'],
    libraries: 'all',
    twoFactor: false,
    lastSeen: null,
    invited: true,
  },
]

// The profiles and formats a new server starts with, from @highsea/quality.
const qualityProfiles: QualityProfile[] = seedProfiles()
const customFormats: CustomFormat[] = seedFormats()

const catalog: CatalogDefinition[] = [
  def(
    'lighthouse',
    'Lighthouse',
    'public',
    'General movies and TV. Fast, large, well seeded.',
    true,
  ),
  def('anchorage', 'Anchorage', 'public', 'Movies only, with good 4K coverage.', true),
  def(
    'driftnet',
    'Driftnet',
    'public',
    'A broad general index. Slower, but finds older films.',
    true,
  ),
  def('keel', 'Keel', 'public', 'Classic and public-domain cinema.', true),
  def('beacon', 'Beacon', 'public', 'Animation and short films.', false),
  def('tidewater', 'Tidewater', 'public', 'A Spanish-language general index.', false, 'es'),
  def('mooring', 'Mooring', 'semi-private', 'Open sign-up. Needs an account for downloads.', false),
  def(
    'fathom',
    'Fathom',
    'private',
    'An invite-only movie tracker with strict seeding rules.',
    false,
  ),
  def('quarterdeck', 'Quarterdeck', 'private', 'An invite-only general tracker.', false),
  def('bosun', 'Bosun', 'private', 'An invite-only tracker for remuxes and 4K.', false),
]

function def(
  id: string,
  name: string,
  privacy: CatalogDefinition['privacy'],
  description: string,
  starter: boolean,
  language = 'en',
): CatalogDefinition {
  const account =
    privacy === 'public'
      ? []
      : [
          {
            key: 'username',
            label: 'Username',
            type: 'text' as const,
            required: true,
            help: `The name you sign in to ${name} with.`,
          },
          {
            key: 'apiKey',
            label: 'API key',
            type: 'password' as const,
            required: true,
            help: `On ${name}, open your profile, then Security. Copy the key labelled "API".`,
          },
        ]
  return {
    id,
    version: '1.4.2',
    name,
    description,
    privacy,
    language,
    categories: ['Movies', 'Movies/UHD', 'Movies/HD'],
    settings: account,
    source: { name: 'highsea catalog', license: 'AGPL-3.0-only' },
    minEngineVersion: '1.0.0',
    starter,
  }
}

const languages: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'nl', name: 'Dutch' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
]

const languageProfiles: LanguageProfile[] = [
  {
    id: 'lp-en',
    name: 'English',
    languages: [{ code: 'en', forced: 'also', hi: 'no' }],
    cutoff: 'en',
    minScore: 80,
  },
  {
    id: 'lp-en-es',
    name: 'English and Spanish',
    languages: [
      { code: 'en', forced: 'also', hi: 'no' },
      { code: 'es', forced: 'no', hi: 'no' },
    ],
    cutoff: null,
    minScore: 80,
  },
]

/** A small filesystem for the path picker: one disk at /data, a NAS mount on another. */
const fs: Record<string, FsNode> = {
  '/': { device: 'root', children: ['/config', '/data', '/mnt'] },
  '/config': { device: 'root', children: [] },
  '/data': { device: 'data', children: ['/data/downloads', '/data/media'] },
  '/data/downloads': {
    device: 'data',
    children: ['/data/downloads/complete', '/data/downloads/incomplete'],
  },
  '/data/downloads/complete': { device: 'data', children: [] },
  '/data/downloads/incomplete': { device: 'data', children: [] },
  '/data/media': { device: 'data', children: ['/data/media/movies', '/data/media/tv'] },
  '/data/media/movies': { device: 'data', children: [] },
  '/data/media/tv': { device: 'data', children: [] },
  '/mnt': { device: 'root', children: ['/mnt/nas'] },
  '/mnt/nas': { device: 'nas', children: ['/mnt/nas/movies', '/mnt/nas/backups'] },
  '/mnt/nas/movies': { device: 'nas', children: [] },
  '/mnt/nas/backups': { device: 'nas', children: [] },
}

function jobs(now: number, empty: boolean): Job[] {
  const job = (
    id: string,
    kind: Job['kind'],
    name: string,
    interval: number | null,
    lastAgo: number | null,
    nextIn: number | null,
  ): Job => ({
    id,
    kind,
    name,
    state: 'idle',
    progress: null,
    lastRun: lastAgo === null ? null : iso(now - lastAgo),
    nextRun: nextIn === null ? null : iso(now + nextIn),
    interval,
    message: null,
  })
  return [
    job('j-rss', 'rss-sync', 'RSS sync', 15 * 60, 6 * MIN, 9 * MIN),
    job('j-refresh', 'refresh-movies', 'Refresh movies', 12 * 3600, 5 * HOUR, 7 * HOUR),
    job('j-subs', 'subtitle-search', 'Search wanted subtitles', 6 * 3600, 2 * HOUR, 4 * HOUR),
    job('j-catalog', 'catalog-sync', 'Catalog sync', 6 * 3600, 3 * HOUR, 3 * HOUR),
    job('j-health', 'health-check', 'Health check', 5 * 60, 2 * MIN, 3 * MIN),
    job('j-backup', 'backup', 'Backup', 24 * 3600, 17 * HOUR, 7 * HOUR),
    empty
      ? job('j-import', 'import', 'Import', null, null, null)
      : job('j-import', 'import', 'Import', null, 40 * MIN, null),
  ]
}

function status(now: number, empty: boolean): SystemStatus {
  return {
    version: '1.0.0',
    catalogVersion: '2026.10.14',
    startedAt: iso(now - 9 * DAY - 4 * HOUR),
    cpu: empty ? 3 : 12,
    memory: { used: empty ? 0.4 * GB : 1.2 * GB, total: 8 * GB },
    disks: [
      {
        path: '/data',
        label: 'data',
        total: 16_000 * GB,
        free: empty ? 15_100 * GB : 6_200 * GB,
        usedBy: empty
          ? { movies: 0, tv: 0, music: 0, downloads: 0, other: 900 * GB }
          : { movies: 6_100 * GB, tv: 0, music: 0, downloads: 1_800 * GB, other: 1_900 * GB },
      },
    ],
  }
}

function server(): Server {
  return {
    id: 'srv-harbor',
    name: 'Harbor',
    version: '1.0.0',
    branding: { name: 'Harbor', accent: null, customMark: false },
    addresses: { local: ['192.168.1.20:3000'], public: 'https://harbor.example.net' },
    reachability: 'local',
    setupComplete: true,
    catalogVersion: '2026.10.14',
    clientsConnected: 4,
  }
}

/** The clients' remembered servers: Harbor, and Attic, a friend's server signed out of. */
const known = (now: number): KnownServer[] => [
  {
    id: 'srv-harbor',
    name: 'Harbor',
    owner: 'Ines',
    addresses: { local: '192.168.1.20:3000', remote: 'harbor.example.net' },
    signedIn: true,
    lastSeen: iso(now),
  },
  {
    id: 'srv-attic',
    name: 'Attic',
    owner: 'Theo',
    addresses: { local: '192.168.1.31:3000', remote: null },
    signedIn: false,
    lastSeen: iso(now - 9 * DAY),
  },
]

const discovered = (now: number): DiscoveredServer[] => [
  {
    id: 'srv-harbor',
    name: 'Harbor',
    version: '1.0.0',
    address: '192.168.1.20:3000',
    latencyMs: 3,
    owner: 'Ines',
    discoveredAt: iso(now),
  },
  {
    id: 'srv-attic',
    name: 'Attic',
    version: '1.0.0',
    address: '192.168.1.31:3000',
    latencyMs: 6,
    owner: 'Theo',
    discoveredAt: iso(now),
  },
  {
    id: 'srv-den',
    name: 'Den',
    version: '1.0.0',
    address: '192.168.1.44:3000',
    latencyMs: 9,
    owner: 'Sam',
    discoveredAt: iso(now),
  },
]

// ---------------------------------------------------------------- the library

/** Items that aren't in the fixtures: monitored editions that haven't been released yet. */
const upcoming: { id: string; title: string; year: number; genre: string; inDays: number }[] = [
  {
    id: 'wing-it-directors-cut',
    title: 'Wing It! Director’s Cut',
    year: 2026,
    genre: 'Comedy',
    inDays: 6,
  },
  {
    id: 'agent-327-barbershop',
    title: 'Agent 327: Operation Barbershop',
    year: 2026,
    genre: 'Action',
    inDays: 10,
  },
  {
    id: 'sprite-fright-extended',
    title: 'Sprite Fright Extended',
    year: 2026,
    genre: 'Horror comedy',
    inDays: 13,
  },
]

/** Items whose state the queue and the dashboard show. Everything else is simply available. */
const special: Record<string, MediaStatus> = {
  'cosmos-laundromat': 'downloading',
  charge: 'queued',
  'wing-it': 'downloading',
  nosferatu: 'downloading',
  'the-last-man-on-earth': 'missing',
  'royal-wedding': 'missing',
  'big-buck-bunny': 'cutoff-unmet',
}

const minutes = (runtime: string) => {
  const h = /(\d+)h/.exec(runtime)?.[1]
  const m = /(\d+)m/.exec(runtime)?.[1]
  return Number(h ?? 0) * 60 + Number(m ?? 0)
}

const folder = (t: { title: string; year: number }) =>
  `/data/media/movies/${t.title.replace(/[:/]/g, '')} (${t.year})`

function item(t: Title, i: number, now: number): MediaItem {
  const uhd = t.quality.includes('4K')
  return {
    id: t.id,
    type: 'movie',
    parentId: null,
    title: t.title,
    sortTitle: t.title.replace(/^(The|A) /, ''),
    year: t.year,
    runtimeMinutes: minutes(t.runtime),
    genres: [t.genre],
    synopsis: t.synopsis,
    rating: t.rating,
    tmdbId: 10_000 + i * 37,
    monitored: true,
    minimumAvailability: 'released',
    languageProfileId: 'lp-en',
    rootFolder: '/data/media/movies',
    path: folder(t),
    // the first ten were added over the last month, the rest across the year
    addedAt: iso(now - (i < 10 ? i * 2.6 * DAY : (30 + i * 8) * DAY)),
    releaseDate: iso(new Date(t.year, 5, 1).getTime()),
    status: special[t.id] ?? 'available',
    versions: [
      {
        id: `${t.id}-v1`,
        label: uhd ? '4K' : '1080p',
        qualityProfileId: uhd ? 'qp-uhd' : 'qp-hd',
        fileId: null,
      },
    ],
    quality: t.quality,
    art: art(t),
  }
}

function streams(uhd: boolean, hdr: boolean, silent: boolean, subs: string[]): Stream[] {
  const list: Stream[] = [
    {
      index: 0,
      type: 'video',
      codec: uhd ? 'hevc' : 'h264',
      width: uhd ? 3840 : 1920,
      height: uhd ? 2160 : 1080,
      hdr: hdr ? 'hdr10' : 'none',
      bitrate: uhd ? 28_000_000 : 9_000_000,
    },
    {
      index: 1,
      type: 'audio',
      codec: silent ? 'aac' : 'eac3',
      language: silent ? 'zxx' : 'en',
      channels: silent ? '2.0' : '5.1',
      title: silent ? 'Score' : null,
      default: true,
    },
  ]
  for (const [n, language] of subs.entries())
    list.push({
      index: 2 + n,
      type: 'subtitle',
      codec: 'subrip',
      language,
      forced: false,
      hi: false,
      default: false,
    })
  return list
}

function file(m: MediaItem, versionId: string, uhd: boolean, hdr: boolean): MediaFile {
  const silent = m.year < 1930
  const res = uhd ? '2160p' : '1080p'
  const name = `${m.title.replace(/[:/]/g, '')} (${m.year})`
  const scene = `${m.title.replace(/[^\w]+/g, '.')}.${m.year}.${res}.${uhd ? 'WEB-DL.DDP5.1' : 'BluRay'}.${hdr ? 'HDR.' : ''}${uhd ? 'HEVC' : 'x264'}-HSEA`
  return {
    id: `f-${versionId}`,
    itemId: m.id,
    versionId,
    path: `${m.path}/${name} [${res}${hdr ? ' HDR' : ''}].mkv`,
    size: Math.round(m.runtimeMinutes * (uhd ? 0.18 : 0.07) * GB + 0.2 * GB),
    quality: { resolution: res, source: uhd ? 'WEB-DL' : 'Bluray', codec: uhd ? 'HEVC' : 'x264' },
    releaseGroup: 'HSEA',
    sceneName: scene,
    addedAt: m.addedAt,
    streams: streams(uhd, hdr, silent, silent ? [] : m.year > 2015 ? ['en'] : []),
  }
}

function track(m: MediaItem, f: MediaFile, n: number): SubtitleTrack {
  // a handful are still waiting or failed, so the Subtitles tab and widget have states to show
  const sync =
    n % 11 === 3
      ? { status: 'failed' as const, confidence: 0.41, offsetMs: 0 }
      : n % 13 === 5
        ? { status: 'unsynced' as const, confidence: null, offsetMs: 0 }
        : {
            status: 'synced' as const,
            confidence: 0.88 + (n % 7) / 70,
            offsetMs: ((n * 373) % 2400) - 600,
          }
  return {
    id: `st-${f.id}-en`,
    itemId: m.id,
    fileId: f.id,
    language: 'en',
    kind: 'external',
    format: 'srt',
    forced: false,
    hi: false,
    provider: n % 3 === 0 ? 'Subdl' : 'OpenSubtitles.com',
    score: 92 - (n % 9),
    sync,
    path: f.path.replace(/\.mkv$/, '.en.srt'),
  }
}

function torrent(
  id: string,
  m: MediaItem,
  o: {
    state: TorrentState
    progress: number
    uhd: boolean
    hdr?: boolean
    down?: number
    up?: number
    ratio?: number
    reason?: string
    indexer: string
    addedAgo: number
  },
  now: number,
): Torrent {
  const res = o.uhd ? '2160p' : '1080p'
  const name = `${m.title.replace(/[^\w]+/g, '.')}.${m.year}.${res}.${o.uhd ? 'WEB-DL.DDP5.1' : 'BluRay'}.${o.hdr ? 'HDR.' : ''}${o.uhd ? 'HEVC' : 'x264'}`
  const size = Math.round(m.runtimeMinutes * (o.uhd ? 0.18 : 0.07) * GB + 0.3 * GB)
  const downloaded = Math.round(size * o.progress)
  const down = o.down ?? 0
  const blocked = o.state === 'import-blocked'
  return {
    id,
    name,
    infoHash: Array.from(id.padEnd(20, '0'), (c) => c.charCodeAt(0).toString(16).slice(-2)).join(
      '',
    ),
    itemId: m.id,
    category: 'movies',
    size,
    downloaded,
    uploaded: Math.round(size * (o.ratio ?? 0)),
    progress: o.progress,
    downRate: down,
    upRate: o.up ?? 0,
    eta: down > 0 ? Math.round((size - downloaded) / down) : null,
    peers: { connected: down > 0 ? 18 : 0, total: down > 0 ? 64 : 3 },
    seeds: { connected: down > 0 ? 9 : 0, total: down > 0 ? 41 : 0 },
    ratio: o.ratio ?? 0,
    state: o.state,
    stateReason: o.reason ?? null,
    indexer: o.indexer,
    quality: o.uhd ? (o.hdr ? 'WEB 2160p HDR' : 'WEB 2160p') : 'Bluray 1080p',
    addedAt: iso(now - o.addedAgo),
    completedAt: o.progress >= 1 ? iso(now - o.addedAgo / 2) : null,
    savePath: '/data/downloads/complete/movies',
    files: [
      {
        path: `${name}/${name}.mkv`,
        size: size - 40 * MB,
        progress: o.progress,
        priority: 'normal',
      },
      ...(blocked
        ? [
            {
              path: `${name}/${m.title.replace(/\s+/g, '')}.exe`,
              size: 2 * MB,
              progress: 1,
              priority: 'normal' as const,
            },
          ]
        : []),
      { path: `${name}/Sample/sample.mkv`, size: 38 * MB, progress: o.progress, priority: 'skip' },
    ],
    trackers: [
      {
        url: `udp://tracker.${o.indexer.toLowerCase()}.example:6969/announce`,
        status: 'working',
        peers: 40,
        message: null,
      },
      {
        url: 'udp://open.tracker.example:1337/announce',
        status: o.state === 'stalled' ? 'error' : 'working',
        peers: 12,
        message: o.state === 'stalled' ? 'Connection timed out' : null,
      },
    ],
    seedingRule: { ratio: 2, minutes: 7 * 24 * 60 },
  }
}

// the three providers highsea ships (checkpoint 7's answer 2); Podnapisi closed, Addic7ed is TV
// only, YIFY Subtitles has no API
const defaultProviders: SubtitleProvider[] = [
  {
    id: 'opensubtitles',
    name: 'OpenSubtitles.com',
    enabled: true,
    rateLimitRemaining: 17,
    rateLimitMax: 20,
    requiresAuth: true,
    username: 'harbor_admin',
    attribution: 'Subtitles provided by OpenSubtitles.com',
  },
  {
    id: 'subdl',
    name: 'Subdl',
    enabled: true,
    rateLimitRemaining: 1840,
    rateLimitMax: 2000,
    requiresAuth: true,
    username: '••••8f2c',
  },
  {
    id: 'subsource',
    name: 'SubSource',
    enabled: false,
    rateLimitRemaining: 0,
    rateLimitMax: 7200,
    requiresAuth: true,
  },
]

const defaultTorrentLimits: TorrentLimits = {
  downRateLimit: 0,
  upRateLimit: 0,
  vpnConnected: true,
  vpnInterface: 'wg0',
  vpnIp: '10.2.0.15',
}

const discoverPool: DiscoverMovie[] = [
  {
    id: 'disc-charge',
    tmdbId: 1002341,
    title: 'Charge',
    year: 2022,
    runtimeMinutes: 14,
    genres: ['Animation', 'Action', 'Sci-Fi'],
    synopsis:
      'In an old battery factory, an elderly warrior finds himself hunted by security droids while retrieving a vital energy core.',
    rating: 8.2,
    releaseDate: '2022-12-15T00:00:00.000Z',
    art: {
      poster: posterArt('Charge'),
      backdrop: backdropArt('Charge'),
      still: stillArt('Charge'),
    },
    inLibrary: false,
  },
  {
    id: 'disc-sprite-fright',
    tmdbId: 1002342,
    title: 'Sprite Fright',
    year: 2021,
    runtimeMinutes: 11,
    genres: ['Animation', 'Comedy', 'Horror'],
    synopsis:
      'When a group of rowdy teenagers venture into an isolated forest, they encounter cheerful sprites with a deadly vendetta against litterbugs.',
    rating: 7.9,
    releaseDate: '2021-10-29T00:00:00.000Z',
    art: {
      poster: posterArt('Sprite Fright'),
      backdrop: backdropArt('Sprite Fright'),
      still: stillArt('Sprite Fright'),
    },
    inLibrary: false,
  },
  {
    id: 'disc-cosmos-laundromat',
    tmdbId: 1002343,
    title: 'Cosmos Laundromat',
    year: 2015,
    runtimeMinutes: 12,
    genres: ['Animation', 'Fantasy', 'Sci-Fi'],
    synopsis:
      'On a desolate windswept island, a depressed sheep named Franck is offered the adventure of a lifetime by a mysterious salesman named Victor.',
    rating: 8.4,
    releaseDate: '2015-08-10T00:00:00.000Z',
    art: {
      poster: posterArt('Cosmos Laundromat'),
      backdrop: backdropArt('Cosmos Laundromat'),
      still: stillArt('Cosmos Laundromat'),
    },
    inLibrary: false,
  },
  {
    id: 'disc-coffee-run',
    tmdbId: 1002344,
    title: 'Coffee Run',
    year: 2020,
    runtimeMinutes: 3,
    genres: ['Animation', 'Comedy'],
    synopsis:
      'Fueled by an acute craving for coffee, a solitary traveler journeys across dimensions and surrealist landscapes.',
    rating: 7.1,
    releaseDate: '2020-05-29T00:00:00.000Z',
    art: {
      poster: posterArt('Coffee Run'),
      backdrop: backdropArt('Coffee Run'),
      still: stillArt('Coffee Run'),
    },
    inLibrary: false,
  },
  {
    id: 'disc-agent-327',
    tmdbId: 1002345,
    title: 'Agent 327: Operation Barbershop',
    year: 2017,
    runtimeMinutes: 4,
    genres: ['Animation', 'Action', 'Comedy'],
    synopsis:
      'Secret agent Hendrik IJzerbroot investigates a covert intelligence ring operating out of a quiet neighborhood barbershop.',
    rating: 7.8,
    releaseDate: '2017-05-15T00:00:00.000Z',
    art: {
      poster: posterArt('Agent 327'),
      backdrop: backdropArt('Agent 327'),
      still: stillArt('Agent 327'),
    },
    inLibrary: false,
  },
  {
    id: 'disc-hero',
    tmdbId: 1002346,
    title: 'Hero',
    year: 2018,
    runtimeMinutes: 4,
    genres: ['Animation', 'Fantasy', 'Action'],
    synopsis:
      'A brave warrior faces the greatest challenge of his life in a dark underground cavern filled with ancient perils.',
    rating: 7.4,
    releaseDate: '2018-04-16T00:00:00.000Z',
    art: { poster: posterArt('Hero'), backdrop: backdropArt('Hero'), still: stillArt('Hero') },
    inLibrary: false,
  },
  // public-domain films not in the library yet: what Discover can actually add, and two sequels so
  // a collection has parts missing
  ...(
    [
      [
        'nanook-of-the-north',
        'Nanook of the North',
        1922,
        79,
        'Documentary',
        6.9,
        'A year with an Inuit family on the shore of Hudson Bay, filmed over sixteen months.',
      ],
      [
        'the-lost-world',
        'The Lost World',
        1925,
        93,
        'Adventure',
        6.6,
        'An expedition up the Amazon finds a plateau where dinosaurs still live, and brings one home to London.',
      ],
      [
        'the-great-train-robbery',
        'The Great Train Robbery',
        1903,
        12,
        'Western',
        7.1,
        'Bandits hold up a steam train and are chased down by a posse, in twelve minutes that set the template.',
      ],
      [
        'dementia-13',
        'Dementia 13',
        1963,
        75,
        'Horror',
        5.7,
        'A widow hides her husband’s death from his wealthy family while someone with an axe stalks their Irish castle.',
      ],
      [
        'meet-john-doe',
        'Meet John Doe',
        1941,
        122,
        'Drama',
        7.5,
        'A newspaper invents a man who will jump from city hall in protest, then hires a drifter to play him.',
      ],
      [
        'scarlet-street',
        'Scarlet Street',
        1945,
        102,
        'Crime',
        7.7,
        'A meek cashier and Sunday painter is drawn into a con by a woman who passes off his paintings as hers.',
      ],
      [
        'the-stranger',
        'The Stranger',
        1946,
        95,
        'Thriller',
        7.3,
        'A war crimes investigator follows a lead to a quiet Connecticut town and its new schoolteacher.',
      ],
      [
        'dawn-of-the-dead',
        'Dawn of the Dead',
        1978,
        127,
        'Horror',
        7.9,
        'Four survivors of a spreading plague of the living dead barricade themselves inside a shopping mall.',
      ],
      [
        'day-of-the-dead',
        'Day of the Dead',
        1985,
        101,
        'Horror',
        7.1,
        'Scientists and soldiers sheltering in an underground bunker turn on each other as the dead overrun the world above.',
      ],
      [
        'the-last-time-i-saw-paris',
        'The Last Time I Saw Paris',
        1954,
        116,
        'Romance',
        6.4,
        'A writer looks back on his marriage in postwar Paris, and the night it came apart.',
      ],
    ] as const
  ).map(
    ([slug, title, year, runtimeMinutes, genre, rating, synopsis], n): DiscoverMovie => ({
      id: `disc-${slug}`,
      tmdbId: 1_003_000 + n,
      title,
      year,
      runtimeMinutes,
      genres: [genre],
      synopsis,
      rating: rating / 2,
      releaseDate: iso(new Date(year, 0, 1).getTime()),
      art: { poster: posterArt(title), backdrop: backdropArt(title), still: stillArt(title) },
      inLibrary: false,
    }),
  ),
]

// ---------------------------------------------------------------- the two servers

/**
 * Media ids are database ids: one sequence for every title the server knows, in the library or
 * only in its metadata cache, so a title keeps its id (and its page's address) when it's added.
 * The seed is written with readable slugs; this numbers them, and every reference to them.
 */
export function seed(kind: 'populated' | 'empty', now: number): ServerState {
  const state = seedBySlug(kind, now)
  const ids = new Map(state.items.map((m, i) => [m.id, String(i + 1)]))
  const renumber = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(renumber)
    else if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      if (typeof o.itemId === 'string') o.itemId = ids.get(o.itemId) ?? o.itemId
      if (Array.isArray(o.itemIds)) o.itemIds = o.itemIds.map((x) => ids.get(x as string) ?? x)
      for (const v of Object.values(o)) if (v && typeof v === 'object') renumber(v)
    }
  }
  renumber(state)
  for (const c of state.collections) {
    c.include = c.include.map((x) => ids.get(x) ?? x)
    c.exclude = c.exclude.map((x) => ids.get(x) ?? x)
  }
  for (const m of state.items) m.id = ids.get(m.id) ?? m.id
  // the metadata cache's titles continue the sequence, in both servers alike
  state.discoverCatalog = state.discoverCatalog.map((d, n) => ({ ...d, id: String(101 + n) }))
  return state
}

function seedBySlug(kind: 'populated' | 'empty', now: number): ServerState {
  const base = {
    server: server(),
    // a fresh server: the owner, plus an admin and a user so every toolbar role still applies
    users:
      kind === 'empty'
        ? users(now).filter((u) => ['u-ines', 'u-theo', 'u-ruth'].includes(u.id))
        : users(now),
    qualityProfiles,
    customFormats,
    catalog,
    languageProfiles,
    languages,
    providers: structuredClone(defaultProviders),
    subtitleSettings: {
      minScore: 80,
      autoSync: true,
      minConfidence: 0.7,
      upgradeDays: 14,
      preferReleaseMatch: true,
    },
    torrentLimits: defaultTorrentLimits,
    discoverCatalog: structuredClone(discoverPool),
    jobs: jobs(now, kind === 'empty'),
    status: status(now, kind === 'empty'),
    fs: structuredClone(fs),
    discovered: discovered(now),
    known: known(now),
    watch: [],
    prefs: {},
    pipeline: [],
    seen: {},
    appearance: {
      defaultTheme: 'default',
      // what an owner might build: OLED black with a sea-glass accent (the toolbar's Harbor)
      themes: [{ id: 'harbor', name: 'Harbor', base: 'oled', accent: '#8fbfb7' }],
      sound: { tv: true, phone: false, web: false, volume: 0.8, pack: 'felt' },
    } satisfies Appearance,
    apiKeys: (kind === 'empty'
      ? []
      : [
          {
            id: 'k-ha',
            name: 'Home Assistant',
            prefix: 'hs_7Kq2',
            scope: 'read',
            userId: 'u-ines',
            createdAt: iso(now - 40 * DAY),
            lastUsed: iso(now - 5 * MIN),
          },
          {
            id: 'k-backup',
            name: 'Nightly backup script',
            prefix: 'hs_Rm9x',
            scope: 'full',
            userId: 'u-theo',
            createdAt: iso(now - 120 * DAY),
            lastUsed: iso(now - 20 * HOUR),
          },
        ]) satisfies ApiKey[],
    settings: defaultSettings(kind),
    vpn: {
      capability: kind === 'populated',
      phase: 'connected',
      failure: null,
      until: 0,
      connectedAt: now - 3 * HOUR,
      checkedAt: now - 4 * 60_000,
    } satisfies VpnRuntime,
    homeLayouts: {},
    backups: [
      ...Array.from(
        { length: kind === 'empty' ? 0 : 7 },
        (_, i): Backup => ({
          id: `b-${i}`,
          createdAt: iso(now - (17 * HOUR + i * DAY)),
          size: 48_200_000 - i * 310_000,
          kind: 'scheduled',
        }),
      ),
      ...(kind === 'empty'
        ? []
        : [
            {
              id: 'b-migration',
              createdAt: iso(now - 9 * DAY - 4 * HOUR),
              size: 44_900_000,
              kind: 'pre-migration',
            } satisfies Backup,
          ]),
    ],
  }
  if (kind === 'empty')
    return {
      ...base,
      server: { ...base.server, clientsConnected: 1 },
      devices: [device('d-admin', 'u-ines', 'MacBook Pro', 'admin', now)],
      items: [],
      files: [],
      torrents: [],
      history: [],
      blocklist: [],
      indexers: [],
      subtitles: [],
      announcements: [],
      featured: [],
      collections: [],
      health: [
        {
          id: 'h-indexers',
          source: 'Indexers',
          level: 'warning',
          message: 'No indexers are enabled, so searches won’t find any releases.',
          since: iso(now - 10 * MIN),
        },
      ],
      speeds: samples(now, () => ({ down: 0, up: 0 })),
    }

  const items = library.map((t, i) => item(t, i, now))
  // a few more of the 2010s at 4.5, so the owner's example collection has something to show
  for (const m of items)
    if (['cosmos-laundromat', 'caminandes-llamigos', 'hero', 'coffee-run'].includes(m.id))
      m.rating = 4.5
  for (const u of upcoming)
    items.push({
      ...item(
        {
          id: u.id,
          title: u.title,
          year: u.year,
          runtime: '12m',
          genre: u.genre,
          rating: 0,
          quality: ['4K'],
          synopsis: 'A new cut, announced for release this month.',
        },
        items.length,
        now,
      ),
      status: 'unreleased',
      releaseDate: iso(now + u.inDays * DAY),
      addedAt: iso(now - 4 * DAY),
      art: { poster: posterArt(u.title), backdrop: backdropArt(u.title), still: stillArt(u.title) },
    })

  const byId = (id: string) => items.find((m) => m.id === id) as MediaItem
  // Sintel and Spring keep a 1080p file and add a 4K HDR version: two versions, one item
  for (const id of ['sintel', 'spring']) {
    const m = byId(id)
    m.versions = [
      { id: `${id}-v1`, label: '1080p', qualityProfileId: 'qp-hd', fileId: null },
      { id: `${id}-v2`, label: '4K HDR', qualityProfileId: 'qp-uhd', fileId: null },
    ]
  }

  const files: MediaFile[] = []
  const subtitles: SubtitleTrack[] = []
  items.forEach((m, n) => {
    if (m.status !== 'available' && m.status !== 'cutoff-unmet') return
    const v = m.versions[0]
    if (!v) return
    const uhd = v.label.startsWith('4K')
    const f = file(m, v.id, uhd, v.label.includes('HDR'))
    v.fileId = f.id
    files.push(f)
    if (m.year >= 1930) subtitles.push(track(m, f, n))
  })
  // the 4K HDR versions of Sintel and Spring are the ones in the queue
  for (const m of [byId('sintel'), byId('spring')]) m.status = 'downloading'

  const torrents = [
    torrent(
      't-sintel',
      byId('sintel'),
      {
        state: 'downloading',
        progress: 0.62,
        uhd: true,
        hdr: true,
        down: 14.2 * MB,
        up: 1.1 * MB,
        indexer: 'Anchorage',
        addedAgo: 22 * MIN,
      },
      now,
    ),
    torrent(
      't-tears',
      byId('tears-of-steel'),
      {
        state: 'seeding',
        progress: 1,
        uhd: false,
        up: 820_000,
        ratio: 1.42,
        indexer: 'Lighthouse',
        addedAgo: 2 * DAY,
      },
      now,
    ),
    torrent(
      't-spring',
      byId('spring'),
      {
        state: 'importing',
        progress: 1,
        uhd: true,
        hdr: true,
        indexer: 'Anchorage',
        addedAgo: 50 * MIN,
      },
      now,
    ),
    torrent(
      't-cosmos',
      byId('cosmos-laundromat'),
      {
        state: 'stalled',
        progress: 0.27,
        uhd: false,
        reason: 'No seeds for 2 hours. highsea will search for another release at 3 hours.',
        indexer: 'Driftnet',
        addedAgo: 5 * HOUR,
      },
      now,
    ),
    torrent(
      't-wing',
      byId('wing-it'),
      {
        state: 'downloading',
        progress: 0.18,
        uhd: true,
        down: 4.2 * MB,
        up: 0.2 * MB,
        indexer: 'Lighthouse',
        addedAgo: 6 * MIN,
      },
      now,
    ),
    torrent(
      't-charge',
      byId('charge'),
      { state: 'queued', progress: 0, uhd: false, indexer: 'Lighthouse', addedAgo: 3 * MIN },
      now,
    ),
    torrent(
      't-nosferatu',
      byId('nosferatu'),
      {
        state: 'import-blocked',
        progress: 1,
        uhd: false,
        reason:
          'The release contains an executable file (Nosferatu.exe). It wasn’t imported, and it has been blocklisted.',
        indexer: 'Keel',
        addedAgo: 3 * HOUR,
      },
      now,
    ),
  ]
  const history: HistoryEvent[] = [
    ...torrents.map(
      (t) =>
        ({
          id: `h-grab-${t.id}`,
          itemId: t.itemId as string,
          type: 'grabbed' as const,
          date: t.addedAt,
          sourceTitle: t.name,
          quality: t.quality,
          indexer: t.indexer,
          message: null,
        }) satisfies HistoryEvent,
    ),
    {
      id: 'h-import-tears',
      itemId: 'tears-of-steel',
      type: 'imported',
      date: iso(now - DAY),
      sourceTitle: torrents[1]?.name ?? '',
      quality: 'Bluray 1080p',
      indexer: 'Lighthouse',
      message: 'Hardlinked to /data/media/movies/Tears of Steel (2012)',
    },
    {
      id: 'h-block-nosferatu',
      itemId: 'nosferatu',
      type: 'blocklisted',
      date: iso(now - 2 * HOUR),
      sourceTitle: torrents[6]?.name ?? '',
      quality: 'Bluray 1080p',
      indexer: 'Keel',
      message: 'Contains an executable file',
    },
  ]

  const indexers: Indexer[] = [
    idx('lighthouse', 'Lighthouse', 'public', 'healthy', 212, 412, 9),
    idx('anchorage', 'Anchorage', 'public', 'healthy', 340, 288, 6),
    idx('driftnet', 'Driftnet', 'public', 'healthy', 188, 301, 2),
    {
      ...idx('keel', 'Keel', 'public', 'backoff', 1200, 96, 0),
      backoffUntil: iso(now + 4 * MIN),
      lastError: 'Keel didn’t answer 3 searches in a row (timed out after 30 s).',
    },
    idx('fathom', 'Fathom', 'private', 'healthy', 260, 140, 3),
  ]

  const announcements: Announcement[] = [
    {
      id: 'an-movie-night',
      title: 'Movie night is Friday',
      body: 'We’re watching **Sintel** and **Spring** in the living room at 8 pm. Bring a blanket.',
      image: backdropArt('Sintel backdrop'),
      cta: null,
      severity: 'notice',
      placements: ['banner', 'card'],
      audience: { kind: 'everyone' },
      schedule: { start: iso(now - 2 * DAY), end: iso(now + 6 * DAY) },
      acknowledgement: 'dismiss',
      status: 'live',
      seen: false,
    },
    {
      id: 'an-maintenance',
      title: 'Harbor restarts on Sunday night',
      body: 'Streams pause for about ten minutes after 2 am while the server updates.',
      image: null,
      cta: null,
      severity: 'warning',
      placements: ['banner', 'modal'],
      audience: { kind: 'everyone' },
      schedule: { start: iso(now + 1 * DAY), end: iso(now + 2 * DAY) },
      acknowledgement: 'require',
      status: 'scheduled',
      seen: false,
    },
    {
      id: 'an-new-address',
      title: 'Harbor has a new remote address',
      body: 'Away from home, the apps now connect through **harbor.example.net**. Nothing to change: they switch on their own.',
      image: null,
      cta: null,
      severity: 'notice',
      placements: ['modal', 'banner', 'card'],
      // the household's apps only: the admin doesn't need it
      audience: {
        kind: 'clients',
        clients: ['web', 'desktop', 'ios', 'android', 'tvos', 'androidtv', 'webos', 'tizen'],
      },
      schedule: { start: iso(now - 1 * DAY), end: iso(now + 13 * DAY) },
      acknowledgement: 'require',
      status: 'live',
      seen: false,
    },
  ]

  const featured: FeaturedSection[] = [
    {
      id: 'fs-hero',
      title: 'Featured on Harbor',
      tagline: null,
      layout: 'hero',
      source: { kind: 'manual', itemIds: ['sintel', 'spring', 'sprite-fright', 'charge'] },
      overrides: [],
      audience: { kind: 'everyone' },
      schedule: { start: iso(now - 7 * DAY), end: null },
      order: 0,
    },
    {
      id: 'fs-staff',
      title: 'Staff picks',
      tagline: 'by Ines',
      layout: 'row',
      source: { kind: 'manual', itemIds: library.slice(0, 10).map((t) => t.id) },
      overrides: [],
      audience: { kind: 'everyone' },
      schedule: { start: iso(now - 30 * DAY), end: null },
      order: 1,
    },
    {
      id: 'fs-silent',
      title: 'The silent era',
      tagline: 'Restored and scored',
      layout: 'spotlight',
      source: { kind: 'rule', rule: 'collection', value: 'sc-silent' },
      overrides: [],
      audience: { kind: 'everyone' },
      schedule: { start: iso(now - 14 * DAY), end: null },
      order: 2,
    },
    {
      id: 'fs-recent',
      title: 'Recently added',
      tagline: null,
      layout: 'row',
      source: { kind: 'rule', rule: 'recently-added', value: '30d' },
      overrides: [],
      audience: { kind: 'everyone' },
      schedule: { start: iso(now - 60 * DAY), end: null },
      order: 3,
    },
  ]

  const collections = seedCollections(now)

  const health: HealthCheck[] = [
    {
      id: 'h-keel',
      source: 'Indexers',
      level: 'warning',
      message: 'Keel is backing off after 3 failed searches. highsea retries in 4 minutes.',
      since: iso(now - 6 * MIN),
    },
    {
      id: 'h-blocked',
      source: 'Downloads',
      level: 'notice',
      message: '1 download was blocked because it contained an executable file.',
      since: iso(now - 2 * HOUR),
    },
  ]

  const devices: Device[] = [
    device('d-admin', 'u-ines', 'MacBook Pro', 'admin', now),
    device('d-livingroom', 'u-ines', 'Living room Apple TV', 'tvos', now - 2 * MIN),
    device('d-ines-phone', 'u-ines', 'Ines’s iPhone', 'ios', now - 40 * MIN),
    device('d-theo-phone', 'u-theo', 'Pixel 9', 'android', now - 3 * HOUR),
    device('d-kids-tv', 'u-kids', 'Kids’ room TV', 'tizen', now - 2 * DAY),
    device('d-ruth-web', 'u-ruth', 'Firefox on Windows', 'web', now - 26 * HOUR),
  ]

  const rng = (() => {
    let a = 7
    return () => {
      a = (a * 16807) % 2147483647
      return a / 2147483647
    }
  })()
  return {
    ...base,
    // two of the household have already seen Friday's movie night
    seen: { 'u-theo': ['an-movie-night'], 'u-sam': ['an-movie-night'] },
    devices,
    items,
    files,
    torrents,
    history,
    blocklist: [
      {
        id: 'bl-1',
        itemId: 'charge',
        sourceTitle: 'Charge.2022.2160p.WEB-DL.DDP5.1.Atmos.H.265-SAMPLE.mkv',
        indexer: 'Anchorage',
        reason: 'Sample file detected (< 150MB length)',
        date: iso(now - 3 * DAY),
      },
      {
        id: 'bl-2',
        itemId: 'agent-327',
        sourceTitle: 'Agent.327.Operation.Barbershop.1080p.Setup.exe',
        indexer: 'Driftnet',
        reason: 'Malicious payload: contains Windows executable',
        date: iso(now - 5 * DAY),
      },
      {
        id: 'bl-3',
        itemId: 'cosmos-laundromat',
        sourceTitle: 'Cosmos.Laundromat.2015.1080p.BluRay.x264-PASSWORD.rar',
        indexer: 'Keel',
        reason: 'Password protected archive',
        date: iso(now - 9 * DAY),
      },
    ],
    indexers,
    subtitles,
    announcements,
    featured,
    collections,
    watch: watch(items, now),
    health,
    speeds: samples(now, (k) => ({
      down: Math.max(0, (16 + Math.sin(k / 9) * 4 + (rng() - 0.5) * 5) * MB),
      up: Math.max(0, (1.6 + Math.cos(k / 7) * 0.5 + (rng() - 0.5) * 0.6) * MB),
    })),
    pipeline: [{ itemId: 'spring', torrentId: 't-spring', stage: 'importing', until: now + 8000 }],
  }
}

function idx(
  id: string,
  name: string,
  privacy: Indexer['privacy'],
  health: Indexer['health'],
  avgResponseMs: number,
  queries24h: number,
  grabs24h: number,
): Indexer {
  return {
    id: `ix-${id}`,
    definitionId: id,
    name,
    privacy,
    enabled: true,
    priority: 25,
    health,
    backoffUntil: null,
    lastError: null,
    stats: { queries24h, grabs24h, avgResponseMs, successRate: health === 'healthy' ? 0.99 : 0.71 },
  }
}

function device(
  id: string,
  userId: string,
  name: string,
  client: Device['client'],
  lastSeen: number,
): Device {
  return {
    id,
    userId,
    name,
    client,
    appVersion: '1.0.0',
    address: client === 'admin' || client === 'tvos' ? '192.168.1.44' : '84.12.0.7',
    lastSeen: iso(lastSeen),
  }
}

/** Ten minutes of speed history, one sample every 10 simulated seconds. */
function samples(now: number, f: (k: number) => { down: number; up: number }): SpeedSample[] {
  return Array.from({ length: 60 }, (_, k) => ({ t: now - (59 - k) * 10_000, ...f(k) }))
}

/** Continue watching: Ines is partway through four films, Ruth through two. */
function watch(items: MediaItem[], now: number): ServerState['watch'] {
  const at = (userId: string, slug: string, fraction: number, hoursAgo: number) => {
    const m = items.find((x) => x.id === slug)
    if (!m) return []
    return [
      {
        userId,
        itemId: m.id,
        position: Math.round(m.runtimeMinutes * 60 * fraction),
        updatedAt: iso(now - hoursAgo * HOUR),
      },
    ]
  }
  return [
    ...at('u-ines', 'tears-of-steel', 0.35, 2),
    ...at('u-ines', 'charade', 0.74, 20),
    ...at('u-ines', 'elephants-dream', 0.62, 30),
    ...at('u-ines', 'the-general', 0.18, 50),
    ...at('u-ruth', 'metropolis', 0.4, 5),
    ...at('u-ruth', 'his-girl-friday', 0.12, 26),
  ]
}
