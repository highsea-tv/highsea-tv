// SPDX-License-Identifier: AGPL-3.0-only
// The mock server's entities: a first draft of the shapes @highsea/sdk will return in Phase 3.
// Names follow the roadmap (docs/roadmap.md, Phase 3) and ADR 0012 (the unified media item tree).
// Times are ISO 8601 strings; sizes are bytes; rates are bytes per second; durations are seconds
// unless a name says otherwise.

export type ISODate = string

// ---------------------------------------------------------------- server

export type Reachability = 'local' | 'remote'

export type Server = {
  id: string
  name: string
  version: string
  /** Inherited by every client (roadmap › personalization). */
  branding: { name: string; accent: string | null; customMark: boolean }
  addresses: { local: string[]; public: string | null }
  /** How this client reached the server: the LAN address won, or it failed over to remote. */
  reachability: Reachability
  setupComplete: boolean
  catalogVersion: string
  clientsConnected: number
}

/** `GET /api/v1/system/info/public`: unauthenticated, for discovery and the sign-in screen. */
export type PublicServerInfo = {
  id: string
  name: string
  version: string
  setupComplete: boolean
  auth: { local: boolean; oidc: { name: string } | null }
}

/** A server answering LAN discovery (UDP broadcast or mDNS `_highsea._tcp`). */
export type DiscoveredServer = {
  id: string
  name: string
  version: string
  address: string
  latencyMs: number
  owner: string
  discoveredAt: ISODate
}

// ---------------------------------------------------------------- users and devices

export type UserRole = 'owner' | 'admin' | 'member' | 'restricted'

/** Fine-grained permissions beyond the role (roadmap › gap analysis › permissions model). */
export type Permission =
  | 'request'
  | 'autoApprove'
  | 'download'
  | 'manageLibrary'
  | 'manageUsers'
  | 'admin'

export type User = {
  id: string
  username: string
  displayName: string
  role: UserRole
  permissions: Permission[]
  /** Library-level access: every library, or the listed ones. */
  libraries: 'all' | string[]
  twoFactor: boolean
  lastSeen: ISODate | null
  /** Pending until the invite is accepted. */
  invited: boolean
}

export type ClientType =
  | 'admin'
  | 'web'
  | 'desktop'
  | 'ios'
  | 'android'
  | 'tvos'
  | 'androidtv'
  | 'webos'
  | 'tizen'

/** A per-server device token: listed and revocable (roadmap › auth). */
export type Device = {
  id: string
  userId: string
  name: string
  client: ClientType
  appVersion: string
  address: string
  lastSeen: ISODate
}

export type Session = { user: User; deviceId: string; expiresAt: ISODate }

export type SignInResult =
  | { status: 'signed-in'; session: Session }
  | { status: 'two-factor'; challenge: string }

// ---------------------------------------------------------------- media (ADR 0012)

export type MediaType =
  | 'movie'
  | 'series'
  | 'season'
  | 'episode'
  | 'artist'
  | 'album'
  | 'track'
  | 'book'

export type MediaStatus =
  | 'available'
  | 'downloading'
  | 'queued'
  | 'missing'
  | 'cutoff-unmet'
  | 'unreleased'

export type MinimumAvailability = 'announced' | 'in-cinemas' | 'released'

/** One version of an item, with its own quality profile (4K HDR beside 1080p SDR). */
export type MediaVersion = {
  id: string
  label: string
  qualityProfileId: string
  fileId: string | null
}

export type MediaItem = {
  id: string
  type: MediaType
  parentId: string | null
  title: string
  originalTitle?: string | null
  sortTitle: string
  year: number
  runtimeMinutes: number
  genres: string[]
  synopsis: string
  /** Community rating out of 5. */
  rating: number
  tmdbId: number
  monitored: boolean
  minimumAvailability: MinimumAvailability
  languageProfileId: string
  rootFolder: string
  path: string
  addedAt: ISODate
  releaseDate: ISODate
  status: MediaStatus
  versions: MediaVersion[]
  quality: string[]
  art: { poster: string; backdrop: string; still: string }
}

export type VideoStream = {
  index: number
  type: 'video'
  codec: string
  width: number
  height: number
  hdr: 'none' | 'hdr10' | 'dolby-vision' | 'hlg'
  bitrate: number
}
export type AudioStream = {
  index: number
  type: 'audio'
  codec: string
  language: string
  channels: string
  title: string | null
  default: boolean
}
export type SubtitleStream = {
  index: number
  type: 'subtitle'
  codec: string
  language: string
  forced: boolean
  hi: boolean
  default: boolean
}
export type Stream = VideoStream | AudioStream | SubtitleStream

/** A file on disk with its ffprobe stream info (`media_files`). */
export type MediaFile = {
  id: string
  itemId: string
  versionId: string
  path: string
  size: number
  quality: { resolution: '2160p' | '1080p' | '720p' | '480p'; source: string; codec: string }
  releaseGroup: string | null
  sceneName: string
  addedAt: ISODate
  streams: Stream[]
}

// ---------------------------------------------------------------- acquisition

export type QualityProfile = {
  id: string
  name: string
  cutoff: string
  qualities: { name: string; allowed: boolean }[]
  upgradeAllowed: boolean
  minFormatScore: number
  cutoffFormatScore: number
  formats: { formatId: string; score: number }[]
}

export type CustomFormat = {
  id: string
  name: string
  conditions: string[]
  source: 'preset' | 'custom'
}

export type DecisionReason = { kind: 'accepted' | 'rejected' | 'warning'; message: string }

/** A discoverable movie (TMDB catalog simulation). */
export type DiscoverMovie = {
  id: string
  tmdbId: number
  title: string
  year: number
  runtimeMinutes: number
  genres: string[]
  synopsis: string
  rating: number
  releaseDate: ISODate
  art: { poster: string; backdrop: string; still: string }
  inLibrary: boolean
  /** The library id once added, for links to its page; null otherwise. */
  libraryId: string | null
}

// ---------------------------------------------------------------- metadata (media pages, ADR 0014)

export type Department = 'Acting' | 'Directing' | 'Writing' | 'Production' | 'Sound' | 'Camera'

/** A person's part in a title: a character (cast) or a job (crew). */
export type Credit = {
  personId: string
  name: string
  photo: string
  department: Department
  /** Cast: who they play. */
  character: string | null
  /** Crew: what they did ("Director", "Screenplay"). */
  job: string | null
}

/** A trailer or extra, hosted on YouTube and embedded from youtube-nocookie.com on click. */
export type Video = {
  id: string
  name: string
  kind: 'Trailer' | 'Teaser' | 'Clip' | 'Featurette'
  site: 'YouTube'
  key: string
  lengthSeconds: number
  publishedAt: ISODate
  still: string
}

export type CollectionRef = { id: string; name: string }

export type Collection = CollectionRef & { overview: string; parts: DiscoverMovie[] }

/** `GET /api/v1/metadata/movies/{tmdbId}`: everything the metadata source knows, in any state. */
export type MovieMetadata = DiscoverMovie & {
  originalTitle: string
  /** ISO 639-1. */
  originalLanguage: string
  tagline: string | null
  /** US certification ("PG-13"), or null when unrated. */
  certification: string | null
  /** USD; null when unknown. */
  budget: number | null
  revenue: number | null
  studios: string[]
  imdbId: string
  wikidataId: string
  cast: Credit[]
  crew: Credit[]
  videos: Video[]
  collection: CollectionRef | null
}

/** A title in a person's filmography, with their part in it. */
export type PersonCredit = DiscoverMovie & { role: string; department: Department }

/** `GET /api/v1/metadata/people/{id}`. */
export type Person = {
  id: string
  name: string
  photo: string
  knownFor: Department
  bio: string | null
  born: { date: string; place: string } | null
  died: { date: string; place: string } | null
  credits: PersonCredit[]
}

export type AddMovieInput = {
  tmdbId?: number
  title: string
  year: number
  rootFolder: string
  qualityProfileId: string
  languageProfileId: string
  monitored: boolean
  minimumAvailability: MinimumAvailability
  searchNow?: boolean
}

export type SubtitleSearchResult = {
  id: string
  language: string
  releaseName: string
  provider: string
  score: number
  forced: boolean
  hi: boolean
  format: 'srt' | 'ass' | 'vtt'
}

export type SubtitleProvider = {
  id: string
  name: string
  enabled: boolean
  rateLimitRemaining: number
  rateLimitMax: number
  requiresAuth: boolean
  username?: string
}

export type TorrentLimits = {
  downRateLimit: number
  upRateLimit: number
  vpnConnected: boolean
  vpnInterface: string
  vpnIp: string
}

export type AddTorrentInput = {
  urlOrMagnet: string
  category: string
  savePath: string
  startImmediately?: boolean
}

/** A search result with the decision engine's verdict and its reasons. */
export type Release = {
  guid: string
  title: string
  indexerId: string
  indexer: string
  size: number
  seeders: number
  leechers: number
  ageHours: number
  quality: string
  customFormats: string[]
  formatScore: number
  approved: boolean
  reasons: DecisionReason[]
}

export type TorrentState =
  | 'queued'
  | 'checking'
  | 'downloading'
  | 'stalled'
  | 'paused'
  | 'importing'
  /** Import refused, for example a release that contains an executable. */
  | 'import-blocked'
  | 'seeding'
  | 'completed'
  | 'error'

export type TorrentFile = {
  path: string
  size: number
  progress: number
  priority: 'skip' | 'normal' | 'high'
}

export type Tracker = {
  url: string
  status: 'working' | 'updating' | 'error'
  peers: number
  message: string | null
}

export type SeedingRule = { ratio: number | null; minutes: number | null }

export type Torrent = {
  id: string
  name: string
  infoHash: string
  /** The media item it was grabbed for; null for manual adds. */
  itemId: string | null
  category: string
  size: number
  downloaded: number
  uploaded: number
  /** 0–1. */
  progress: number
  downRate: number
  upRate: number
  /** Seconds left, or null when unknown (stalled). */
  eta: number | null
  peers: { connected: number; total: number }
  seeds: { connected: number; total: number }
  ratio: number
  state: TorrentState
  /** Why it's stalled, blocked or failed, in plain words. */
  stateReason: string | null
  indexer: string | null
  quality: string | null
  addedAt: ISODate
  completedAt: ISODate | null
  savePath: string
  files: TorrentFile[]
  trackers: Tracker[]
  seedingRule: SeedingRule
}

/** A row in Activity › Queue: a torrent seen from the media item it's for. */
export type QueueItem = {
  id: string
  torrentId: string
  itemId: string | null
  title: string
  year: number | null
  release: string
  quality: string | null
  size: number
  progress: number
  downRate: number
  upRate: number
  eta: number | null
  ratio: number
  state: TorrentState
  stateReason: string | null
}

export type HistoryEventType =
  | 'grabbed'
  | 'imported'
  | 'import-failed'
  | 'deleted'
  | 'renamed'
  | 'subtitle-downloaded'
  | 'subtitle-synced'
  | 'blocklisted'

export type HistoryEvent = {
  id: string
  itemId: string
  type: HistoryEventType
  date: ISODate
  sourceTitle: string
  quality: string | null
  indexer: string | null
  message: string | null
}

export type BlocklistEntry = {
  id: string
  itemId: string
  sourceTitle: string
  indexer: string
  reason: string
  date: ISODate
}

export type ImportList = {
  id: string
  name: string
  kind: 'trakt' | 'imdb' | 'letterboxd' | 'tmdb'
  enabled: boolean
  lastSync: ISODate | null
  items: number
}

/** Root folders and the hardlink check (roadmap › Docker: a single `/data` root). */
export type RootFolder = { path: string; free: number; total: number; device: string }

export type FsEntry = { name: string; path: string; kind: 'folder' | 'file'; size?: number }

export type HardlinkCheck = {
  ok: boolean
  /** Same filesystem: imports hardlink, so seeding takes no extra space. */
  sameDevice: boolean
  message: string
}

// ---------------------------------------------------------------- indexers

export type SettingField = {
  key: string
  label: string
  type: 'text' | 'password' | 'select' | 'checkbox' | 'number'
  required: boolean
  /** "Where to find this", shown inline. */
  help: string | null
  options?: { value: string; label: string }[]
}

export type IndexerPrivacy = 'public' | 'semi-private' | 'private'

export type CatalogDefinition = {
  id: string
  version: string
  name: string
  description: string
  privacy: IndexerPrivacy
  language: string
  categories: string[]
  settings: SettingField[]
  /** Every definition records its source and license (roadmap › indexers). */
  source: { name: string; license: string }
  minEngineVersion: string
  /** In the setup wizard's starter pack. */
  starter: boolean
}

export type IndexerHealth = 'healthy' | 'backoff' | 'failing' | 'disabled'

export type Indexer = {
  id: string
  definitionId: string
  name: string
  privacy: IndexerPrivacy
  enabled: boolean
  priority: number
  health: IndexerHealth
  backoffUntil: ISODate | null
  lastError: string | null
  stats: { queries24h: number; grabs24h: number; avgResponseMs: number; successRate: number }
}

// ---------------------------------------------------------------- subtitles

export type LanguageRule = {
  code: string
  forced: 'no' | 'also' | 'only'
  hi: 'no' | 'also' | 'only'
}

export type LanguageProfile = {
  id: string
  name: string
  /** In order of preference. */
  languages: LanguageRule[]
  /** Stop upgrading once this language is found; null to keep looking for better matches. */
  cutoff: string | null
  minScore: number
}

export type SyncStatus = 'synced' | 'syncing' | 'queued' | 'unsynced' | 'failed' | 'not-needed'

export type SubtitleTrack = {
  id: string
  itemId: string
  fileId: string
  language: string
  kind: 'external' | 'embedded' | 'bundled'
  format: 'srt' | 'ass' | 'vtt' | 'pgs'
  forced: boolean
  hi: boolean
  provider: string | null
  /** Match score, 0–100 (hash match > release match > title and year). */
  score: number | null
  sync: { status: SyncStatus; confidence: number | null; offsetMs: number }
  path: string | null
}

export type SubtitleStats = {
  syncedToday: number
  waiting: number
  avgOffsetMs: number
  avgConfidence: number
}

export type Language = { code: string; name: string }

/** Settings › Subtitles: scoring and the automatic sync (roadmap › subtitles). */
export type SubtitleSettings = {
  /** Never download below this score, 0–100. Language profiles can raise it. */
  minScore: number
  /** Sync every downloaded subtitle to the audio. */
  autoSync: boolean
  /** Below this confidence, keep the original timing and mark it for review, 0–1. */
  minConfidence: number
  /** Look for a better match for this many days after import. */
  upgradeDays: number
  /** Prefer subtitles that match the release (hash or name) over title and year. */
  preferReleaseMatch: boolean
}

// ---------------------------------------------------------------- curation

export type Audience =
  | { kind: 'everyone' }
  | { kind: 'roles'; roles: UserRole[] }
  | { kind: 'users'; userIds: string[] }
  | { kind: 'clients'; clients: ClientType[] }

export type Placement = 'banner' | 'modal' | 'toast' | 'card'

export type Announcement = {
  id: string
  title: string
  /** Markdown. */
  body: string
  image: string | null
  cta: { label: string; url: string } | null
  severity: 'info' | 'notice' | 'warning' | 'critical'
  placements: Placement[]
  audience: Audience
  schedule: { start: ISODate; end: ISODate | null }
  acknowledgement: 'dismiss' | 'require'
  status: 'draft' | 'scheduled' | 'live' | 'ended'
  /** For the signed-in user: dismissed or acknowledged. */
  seen: boolean
}

export type FeaturedSection = {
  id: string
  title: string
  tagline: string | null
  layout: 'hero' | 'row' | 'spotlight'
  source:
    | { kind: 'manual'; itemIds: string[] }
    | { kind: 'rule'; rule: 'recently-added' | 'genre' | 'collection' | 'filter'; value: string }
  overrides: { itemId: string; artwork: string | null; tagline: string | null }[]
  audience: Audience
  schedule: { start: ISODate; end: ISODate | null }
  order: number
}

// ---------------------------------------------------------------- personalization

export type WidgetKind =
  | 'network'
  | 'storage'
  | 'indexers'
  | 'subtitles'
  | 'upcoming'
  | 'announcement'
  | 'activity'
  | 'recently-added'
  | 'calendar'
  | 'system-health'

export type WidgetSpan = 1 | 2 | 3 | 4

/** Where a widget sits: its place in the order, its width in columns and its height in rows. */
export type WidgetPlacement = { id: string; kind: WidgetKind; span: WidgetSpan; rows: number }

export type LayoutScope = { kind: 'user'; userId: string } | { kind: 'role'; role: UserRole }

export type WidgetLayout = {
  scope: LayoutScope
  widgets: WidgetPlacement[]
  updatedAt: ISODate
  /** True when the user has no layout of their own and sees their role's default. */
  inherited: boolean
}

// ---------------------------------------------------------------- system

export type JobKind =
  | 'rss-sync'
  | 'refresh-movies'
  | 'movie-search'
  | 'import'
  | 'subtitle-search'
  | 'subtitle-sync'
  | 'catalog-sync'
  | 'health-check'
  | 'backup'

export type Job = {
  id: string
  kind: JobKind
  name: string
  state: 'running' | 'queued' | 'idle' | 'failed'
  progress: number | null
  lastRun: ISODate | null
  nextRun: ISODate | null
  /** Repeats every this many seconds; null for one-off jobs. */
  interval: number | null
  message: string | null
}

export type HealthCheck = {
  id: string
  source: string
  level: 'ok' | 'notice' | 'warning' | 'error'
  message: string
  since: ISODate
}

export type Disk = {
  path: string
  label: string
  total: number
  free: number
  usedBy: { movies: number; tv: number; music: number; downloads: number; other: number }
}

export type SystemStatus = {
  version: string
  catalogVersion: string
  startedAt: ISODate
  cpu: number
  memory: { used: number; total: number }
  disks: Disk[]
}

export type SpeedSample = { t: number; down: number; up: number }

export type LogEntry = {
  time: ISODate
  level: 'debug' | 'info' | 'warn' | 'error'
  logger: string
  message: string
}

export type Backup = {
  id: string
  createdAt: ISODate
  size: number
  kind: 'scheduled' | 'manual' | 'pre-migration'
}

// ---------------------------------------------------------------- setup

export type RemoteAccess =
  | { kind: 'local-only' }
  | { kind: 'reverse-proxy'; url: string }
  | { kind: 'port-forward'; port: number }

export type SetupInput = {
  serverName: string
  owner: { username: string; displayName: string; password: string }
  folders: { movies: string; downloads: string }
  indexers: string[]
  subtitleLanguages: string[]
  remoteAccess: RemoteAccess
  cloudLink: boolean
}

// ---------------------------------------------------------------- events (SSE stand-in)

export type ServerEvent =
  | { type: 'tick'; now: number }
  | { type: 'torrents.updated' }
  | { type: 'queue.changed' }
  | { type: 'item.updated'; id: string }
  | { type: 'movies.updated' }
  | { type: 'history.updated' }
  | { type: 'jobs.updated' }
  | { type: 'indexers.updated' }
  | { type: 'health.updated' }
  | { type: 'subtitles.updated'; itemId?: string }
  | { type: 'announcements.updated' }
  | { type: 'layout.updated' }
  | { type: 'server.updated' }

export type EventTopic = ServerEvent['type']
