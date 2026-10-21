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

/** The owner and admins run the server; users watch (ADR 0032). */
export type UserRole = 'owner' | 'admin' | 'user'

/** A user's, set per person: ask for titles, download for offline. Staff hold every power by role. */
export type Permission = 'request' | 'download'

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

export type InviteInput = {
  displayName: string
  /** Optional: the invite can go by email, or as a link the owner shares. */
  email: string | null
  role: Exclude<UserRole, 'owner'>
  libraries: 'all' | string[]
}

/** A pending user and the single-use link that finishes their account. */
export type Invite = { user: User; link: string; expiresAt: ISODate }

/** For scripts and other apps (Home Assistant, a backup job). The secret shows once. */
export type ApiKey = {
  id: string
  name: string
  /** The first characters, to tell keys apart: `hs_7Kq2…`. */
  prefix: string
  scope: 'read' | 'full'
  /** Who made it: the key acts for them, never beyond an admin. */
  userId: string
  createdAt: ISODate
  lastUsed: ISODate | null
}

export type CreatedApiKey = ApiKey & { secret: string }

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

// Profiles, custom formats and the decision engine's reasons are @highsea/quality's (ADR 0031).
import type { CustomFormat, DecisionReason, QualityProfile } from '@highsea/quality'

export type { CustomFormat, DecisionReason, QualityProfile }

/**
 * A title the metadata source knows (TMDB simulation). `id` is its media id: the same before and
 * after it's added to the library (ADR 0014).
 */
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
  /** Adds what it finds as monitored, and searches for it. */
  search: boolean
  profileId: string
}

/** A file manual import (A17) found, and what highsea thinks it is. */
export type ImportCandidate = {
  path: string
  size: number
  quality: string
  language: string
  /** The movie it matched, by name; null when nothing did. */
  itemId: string | null
  /** Why it would be skipped, when it would. */
  skip: string | null
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

export type CurationStatus = 'draft' | 'scheduled' | 'live' | 'ended'

/** An announcement in the admin's list: how many of its audience have seen it. */
export type AnnouncementSummary = Announcement & { seenBy: number; audienceSize: number }

/** A featured section in the admin's list: what its source resolves to right now. */
export type SectionSummary = FeaturedSection & {
  status: Exclude<CurationStatus, 'draft'>
  itemCount: number
  /** The first few titles, for the list's art strip. */
  sample: { id: string; title: string; poster: string }[]
}

/** The curation a client preview renders: the saved lists with the draft merged in. */
export type CurationPreview = { announcements: Announcement[]; featured: FeaturedSection[] }

// ---------------------------------------------------------------- appearance (A12)

/** A custom theme: a partial override of a built-in one (the theme engine's `ThemeInput`). */
export type CustomTheme = {
  id: string
  name: string
  base: 'default' | 'oled' | 'high-contrast'
  accent: string
  colors?: Record<string, string>
}

/** What clients play until someone changes it on their own device. */
export type SoundDefaults = {
  tv: boolean
  phone: boolean
  web: boolean
  /** 0–1. */
  volume: number
  pack: string
}

export type Appearance = {
  /** A built-in theme id or a custom theme's. Clients use it until someone picks their own. */
  defaultTheme: string
  themes: CustomTheme[]
  sound: SoundDefaults
}

// ---------------------------------------------------------------- personalization

// the registry's types, from the package the server uses
import type { WidgetPlacement } from '@highsea/personalization/widgets'

export type { WidgetKind, WidgetPlacement, WidgetSpan } from '@highsea/personalization/widgets'

/** Only staff have a dashboard: it's the admin's. */
export type StaffRole = Exclude<UserRole, 'user'>

export type LayoutScope = { kind: 'user'; userId: string } | { kind: 'role'; role: StaffRole }

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
  | { type: 'curation.updated' }
  | { type: 'users.updated' }
  | { type: 'settings.updated' }
  | { type: 'vpn.updated' }
  | { type: 'layout.updated' }
  | { type: 'server.updated' }
  | { type: 'watch.updated' }

export type EventTopic = ServerEvent['type']

// ---------------------------------------------------------------- clients (C1–C5)

/** A server this device has signed in to before (the multi-server switcher). */
export type KnownServer = {
  id: string
  name: string
  owner: string
  /** The LAN address, then the remote one the client fails over to. */
  addresses: { local: string; remote: string | null }
  signedIn: boolean
  lastSeen: ISODate
}

/** `POST /api/v1/connect/probe`: what an address answered, before signing in. */
export type ProbeResult = PublicServerInfo & { address: string; reachability: Reachability }

/** Sign-in by code (TV): the code a phone or computer approves at `url`. */
export type Pairing = { code: string; url: string; expiresAt: ISODate }

/** A title as the clients see it: the library item plus this user's watch state. */
export type ClientItem = MediaItem & {
  /** 0–1 through the movie, or null if not started (or finished). */
  progress: number | null
  /** Seconds in, for Resume. */
  position: number
  /** A featured section's override, if any. */
  tagline: string | null
}

export type HomeSection = {
  id: string
  title: string
  /** A curated-by suffix ("by Ines") or a tagline. */
  suffix: string | null
  layout: 'hero' | 'row' | 'spotlight' | 'continue'
  items: ClientItem[]
}

/** A person in search results, with how many titles here they're in. */
export type SearchPerson = { id: string; name: string; photo: string; titles: number }

/** A collection as clients see it: only its parts on this server count. */
export type ClientCollection = {
  id: string
  name: string
  overview: string
  /** The first part's art. */
  art: { poster: string; backdrop: string }
  /** How many of its titles are here. */
  count: number
  /** "2010–2016", or one year. */
  years: string
}

/**
 * One kind of result. New media types (shows, episodes, music) join as new kinds; clients show
 * the sections in the order the server ranks them, and skip kinds they don't know yet.
 */
export type SearchSection =
  | { kind: 'movies'; items: ClientItem[] }
  | { kind: 'collections'; items: ClientCollection[] }
  | { kind: 'people'; items: SearchPerson[] }

export type SearchKind = SearchSection['kind']

/** Search (C6): results grouped by kind, the best-matching kind first. Empty kinds are left out. */
export type SearchResults = { sections: SearchSection[] }

/** A person's own home screen order (C7): ids of featured sections and `continue`. */
export type HomeLayout = { order: string[]; hidden: string[] }

export type ClientTrack = {
  id: string
  kind: 'audio' | 'subtitle'
  label: string
  language: string
  /** Subtitles: forced, SDH; audio: channels. */
  detail: string | null
  default: boolean
}

export type ClientVersion = {
  id: string
  label: string
  /** "4K · HDR10 · HEVC · 18.2 GB". */
  detail: string
  audio: ClientTrack[]
  subtitles: ClientTrack[]
}

/** `GET /api/v1/items/{id}` for clients: the page and the player read the same shape. */
export type ClientDetail = {
  item: ClientItem
  versions: ClientVersion[]
  cast: Credit[]
  directors: Credit[]
  related: ClientItem[]
  /** This user's remembered picks for the title, or the server's defaults. */
  defaults: { versionId: string; audioId: string | null; subtitleId: string | null }
}

/** This user's per-title player settings, saved as they change. */
export type PlaybackPrefs = {
  versionId?: string
  audioId?: string | null
  subtitleId?: string | null
  /** Subtitle timing nudge for this title, in ms (±50 steps). */
  subtitleOffsetMs?: number
}
