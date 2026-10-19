// SPDX-License-Identifier: AGPL-3.0-only
// An in-memory highsea server: state, the handlers behind each API call, and a simulation driven by
// the clock. Screens never touch this directly; they go through the client (client.ts).
import { backdropArt, posterArt, stillArt } from '@highsea/fixtures'
import { type Clock, createEmitter, createRandom, type Emitter, iso } from './clock.ts'
import { collection, knownTitles, movieMetadata, person, recommendations } from './metadata.ts'
import { GB, MB, type ServerState, seed } from './seed.ts'
import type {
  AddMovieInput,
  AddTorrentInput,
  Announcement,
  HardlinkCheck,
  Indexer,
  LanguageProfile,
  MediaFile,
  MediaItem,
  QueueItem,
  Release,
  SetupInput,
  SignInResult,
  SubtitleSearchResult,
  SubtitleSettings,
  SubtitleStats,
  SubtitleTrack,
  Torrent,
  TorrentLimits,
  User,
  UserRole,
  WidgetLayout,
  WidgetPlacement,
} from './types.ts'
import { allowed, normalize, roleDefault } from './widgets.ts'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const forbidden = () =>
  new ApiError(403, 'forbidden', 'Your account doesn’t have access to this. Ask the owner.')

/** At most this many torrents download at once; the rest wait in the queue. */
const ACTIVE_DOWNLOADS = 3
const IMPORT_SECONDS = 8
const SUBTITLE_SEARCH_SECONDS = 5
const SUBTITLE_SYNC_SECONDS = 6
const JOB_SECONDS = 4

export type MockServer = {
  kind: 'populated' | 'empty'
  state: ServerState
  clock: Clock
  events: Emitter
  /** Advances the simulation by `dt` simulated seconds. The clock calls this. */
  step(dt: number): void
  /** Stops listening to the clock. */
  dispose(): void
}

export type Storage = { load(key: string): unknown; save(key: string, value: unknown): void }

/** localStorage, wrapped: it can be missing or throw (private windows, file://, tests). */
export const browserStorage: Storage = {
  load(key) {
    try {
      const raw = globalThis.localStorage?.getItem(key)
      return raw ? JSON.parse(raw) : undefined
    } catch {
      return undefined
    }
  },
  save(key, value) {
    try {
      if (value === undefined) globalThis.localStorage?.removeItem(key)
      else globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
      // not remembered, still works
    }
  },
}

export const memoryStorage = (): Storage => {
  const m = new Map<string, string>()
  return {
    load: (k) => (m.has(k) ? JSON.parse(m.get(k) as string) : undefined),
    save: (k, v) => void (v === undefined ? m.delete(k) : m.set(k, JSON.stringify(v))),
  }
}

function setItemStatus(state: ServerState, id: string | null, status: MediaItem['status']) {
  const m = state.items.find((x) => x.id === id)
  if (m) m.status = status
}

function fileFor(state: ServerState, m: MediaItem): MediaFile | undefined {
  const v = [...m.versions].reverse().find((x) => x.fileId)
  return state.files.find((f) => f.id === v?.fileId)
}

function importTorrent(state: ServerState, clock: Clock, t: Torrent, m: MediaItem, now: number) {
  if (t.files.some((f) => /\.(exe|lnk|scr|zipx)$/i.test(f.path))) {
    t.state = 'import-blocked'
    t.stateReason = 'The release contains an executable file. It wasn’t imported.'
    return
  }
  t.state = 'seeding'
  t.upRate = 600_000
  const version = m.versions.find((v) => !v.fileId) ?? m.versions[m.versions.length - 1]
  if (version) {
    const uhd = t.name.includes('2160p')
    const f: MediaFile = {
      id: `f-${version.id}`,
      itemId: m.id,
      versionId: version.id,
      path: `${m.path}/${m.title.replace(/[:/]/g, '')} (${m.year}) [${uhd ? '2160p' : '1080p'}].mkv`,
      size: t.size - 40 * MB,
      quality: {
        resolution: uhd ? '2160p' : '1080p',
        source: uhd ? 'WEB-DL' : 'Bluray',
        codec: uhd ? 'HEVC' : 'x264',
      },
      releaseGroup: null,
      sceneName: t.name,
      addedAt: iso(now),
      streams: [
        {
          index: 0,
          type: 'video',
          codec: uhd ? 'hevc' : 'h264',
          width: uhd ? 3840 : 1920,
          height: uhd ? 2160 : 1080,
          hdr: t.name.includes('HDR') ? 'hdr10' : 'none',
          bitrate: uhd ? 28_000_000 : 9_000_000,
        },
        {
          index: 1,
          type: 'audio',
          codec: 'eac3',
          language: 'en',
          channels: '5.1',
          title: null,
          default: true,
        },
      ],
    }
    state.files = state.files.filter((x) => x.id !== f.id)
    state.files.push(f)
    version.fileId = f.id
  }
  m.status = 'available'
  addHistory(state, clock, m, 'imported', `Hardlinked to ${m.path}`, t)
}

function addHistory(
  state: ServerState,
  clock: Clock,
  m: MediaItem,
  type: ServerState['history'][number]['type'],
  message: string,
  t?: Torrent,
) {
  state.history.unshift({
    id: `h-${type}-${m.id}-${clock.now()}`,
    itemId: m.id,
    type,
    date: iso(clock.now()),
    sourceTitle: t?.name ?? m.title,
    quality: t?.quality ?? null,
    indexer: t?.indexer ?? null,
    message,
  })
}

export function createServer(
  kind: 'populated' | 'empty',
  clock: Clock,
  storage: Storage = memoryStorage(),
): MockServer {
  const state = seed(kind, clock.now())
  const events = createEmitter()
  const random = createRandom(kind === 'populated' ? 1 : 2)
  /** Each downloading torrent wanders around its own base rate. */
  const baseRate = new Map<string, number>(
    state.torrents.filter((t) => t.downRate > 0).map((t) => [t.id, t.downRate]),
  )
  const jobEnds = new Map<string, number>()
  let sinceSample = 0
  let nextBackoff = clock.now() + 25 * 60_000

  const savedName = storage.load(`server:${kind}:name`)
  if (typeof savedName === 'string') {
    state.server.name = savedName
    state.server.branding.name = savedName
  }

  function step(dt: number) {
    const now = clock.now()
    let torrentsChanged = false
    let queueChanged = false

    // downloads
    for (const t of state.torrents) {
      if (t.state === 'downloading') {
        const base = baseRate.get(t.id) ?? 6 * MB
        t.downRate = Math.round(base * (0.82 + random() * 0.36))
        t.upRate = Math.round(t.downRate * 0.08)
        t.downloaded = Math.min(t.size, t.downloaded + t.downRate * dt)
        t.uploaded += t.upRate * dt
        t.progress = t.downloaded / t.size
        t.ratio = t.uploaded / t.size
        t.eta = Math.round((t.size - t.downloaded) / t.downRate)
        for (const f of t.files) if (f.priority !== 'skip') f.progress = t.progress
        if (t.downloaded >= t.size) {
          t.state = 'importing'
          t.progress = 1
          t.downRate = 0
          t.eta = null
          t.completedAt = iso(now)
          state.pipeline.push({
            itemId: t.itemId ?? '',
            torrentId: t.id,
            stage: 'importing',
            until: now + IMPORT_SECONDS * 1000,
          })
          queueChanged = true
        }
        torrentsChanged = true
      } else if (t.state === 'seeding') {
        t.upRate = Math.round((t.upRate || 600_000) * (0.85 + random() * 0.3))
        t.uploaded += t.upRate * dt
        t.ratio = t.uploaded / t.size
        if (t.seedingRule.ratio !== null && t.ratio >= t.seedingRule.ratio) {
          t.state = 'completed'
          t.upRate = 0
          queueChanged = true
        }
        torrentsChanged = true
      }
    }
    const active = state.torrents.filter((t) => t.state === 'downloading').length
    const next = state.torrents.find((t) => t.state === 'queued')
    if (next && active < ACTIVE_DOWNLOADS) {
      next.state = 'downloading'
      baseRate.set(next.id, 6.5 * MB)
      setItemStatus(state, next.itemId, 'downloading')
      queueChanged = torrentsChanged = true
    }

    // the pipeline: import, then subtitle search, then subtitle sync
    for (const p of [...state.pipeline]) {
      if (now < p.until) continue
      state.pipeline.splice(state.pipeline.indexOf(p), 1)
      const t = state.torrents.find((x) => x.id === p.torrentId)
      const m = state.items.find((x) => x.id === p.itemId)
      if (!t || !m) continue
      if (p.stage === 'importing') {
        importTorrent(state, clock, t, m, now)
        state.pipeline.push({
          ...p,
          stage: 'subtitle-search',
          until: now + SUBTITLE_SEARCH_SECONDS * 1000,
        })
        queueChanged = torrentsChanged = true
        events.emit({ type: 'item.updated', id: m.id })
      } else if (p.stage === 'subtitle-search') {
        const f = fileFor(state, m)
        if (f && m.year >= 1930) {
          state.subtitles.push({
            id: `st-${f.id}-en`,
            itemId: m.id,
            fileId: f.id,
            language: 'en',
            kind: 'external',
            format: 'srt',
            forced: false,
            hi: false,
            provider: 'OpenSubtitles',
            score: 96,
            sync: { status: 'syncing', confidence: null, offsetMs: 0 },
            path: f.path.replace(/\.mkv$/, '.en.srt'),
          })
          addHistory(
            state,
            clock,
            m,
            'subtitle-downloaded',
            'English subtitles from OpenSubtitles (score 96)',
          )
          state.pipeline.push({
            ...p,
            stage: 'subtitle-sync',
            until: now + SUBTITLE_SYNC_SECONDS * 1000,
          })
        }
        events.emit({ type: 'subtitles.updated', itemId: m.id })
      } else {
        const track = state.subtitles.find((s) => s.itemId === m.id && s.sync.status === 'syncing')
        if (track) {
          track.sync = { status: 'synced', confidence: 0.93, offsetMs: -1840 }
          addHistory(
            state,
            clock,
            m,
            'subtitle-synced',
            'Synced to the audio: moved 1.84 s earlier, confidence 0.93',
          )
        }
        events.emit({ type: 'subtitles.updated', itemId: m.id })
      }
    }

    // scheduled jobs
    let jobsChanged = false
    for (const j of state.jobs) {
      const end = jobEnds.get(j.id)
      if (j.state === 'running' && end !== undefined) {
        j.progress = Math.min(1, 1 - (end - now) / (JOB_SECONDS * 1000))
        if (now >= end) {
          j.state = 'idle'
          j.progress = null
          j.lastRun = iso(now)
          j.nextRun = j.interval ? iso(now + j.interval * 1000) : null
          jobEnds.delete(j.id)
        }
        jobsChanged = true
      } else if (j.nextRun && now >= Date.parse(j.nextRun)) {
        j.state = 'running'
        j.progress = 0
        jobEnds.set(j.id, now + JOB_SECONDS * 1000)
        jobsChanged = true
      }
    }

    // indexer health: backoffs end, and now and then one starts
    let indexersChanged = false
    for (const ix of state.indexers) {
      if (ix.health === 'backoff' && ix.backoffUntil && now >= Date.parse(ix.backoffUntil)) {
        ix.health = 'healthy'
        ix.backoffUntil = null
        ix.lastError = null
        state.health = state.health.filter((h) => h.id !== `h-${ix.definitionId}`)
        indexersChanged = true
      }
    }
    if (kind === 'populated' && now >= nextBackoff) {
      const ix = state.indexers.find((x) => x.definitionId === 'driftnet')
      if (ix && ix.health === 'healthy') {
        ix.health = 'backoff'
        ix.backoffUntil = iso(now + 4 * 60_000)
        ix.lastError = 'Driftnet answered with an error 3 times in a row (HTTP 502).'
        state.health.push({
          id: 'h-driftnet',
          source: 'Indexers',
          level: 'warning',
          message: 'Driftnet is backing off after 3 failed searches. highsea retries in 4 minutes.',
          since: iso(now),
        })
        indexersChanged = true
      }
      nextBackoff = now + 25 * 60_000
    }

    // speed samples every 10 simulated seconds, ten minutes kept
    sinceSample += dt
    if (sinceSample >= 10) {
      sinceSample = 0
      const down = state.torrents.reduce((s, t) => s + t.downRate, 0)
      const up = state.torrents.reduce((s, t) => s + t.upRate, 0)
      state.speeds.push({ t: now, down, up })
      while (state.speeds.length > 60) state.speeds.shift()
    }
    state.status.cpu = Math.round((active > 0 ? 10 : 3) + random() * 6)

    events.emit({ type: 'tick', now })
    if (torrentsChanged) events.emit({ type: 'torrents.updated' })
    if (queueChanged) events.emit({ type: 'queue.changed' })
    if (jobsChanged) events.emit({ type: 'jobs.updated' })
    if (indexersChanged) {
      events.emit({ type: 'indexers.updated' })
      events.emit({ type: 'health.updated' })
    }
  }

  const unsubscribe = clock.onAdvance((dt) => step(dt))
  return { kind, state, clock, events, step, dispose: unsubscribe }
}

// ---------------------------------------------------------------- the API

export type Ctx = { userId: string; storage?: Storage }

/**
 * The handlers behind each API call, grouped as @highsea/sdk will group them. Each returns plain
 * data; the client makes them async and applies the toolbar's data state.
 */
function generateReleases(m: MediaItem, state: ServerState): Release[] {
  const isUhd = m.versions.some((v) => v.qualityProfileId === 'qp-uhd') || m.quality.includes('4K')
  const cleanTitle = m.title.replace(/[^\w\s]/gi, '').replace(/\s+/g, '.')
  const availableIndexers = state.indexers.filter((i) => i.enabled).map((i) => i.name)
  const ix = (n: number, fallback: string) =>
    availableIndexers[n % availableIndexers.length] ?? fallback

  return [
    {
      guid: `rel-${m.id}-1`,
      title: `${cleanTitle}.${m.year}.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX`,
      indexerId: 'ix-anchorage',
      indexer: ix(0, 'Anchorage'),
      size: 14.8 * GB,
      seeders: 86,
      leechers: 12,
      ageHours: 18,
      quality: 'WEB 2160p',
      customFormats: ['Dolby Vision', 'HDR10', 'x265'],
      formatScore: 2600,
      approved: isUhd,
      reasons: isUhd
        ? [
            { kind: 'accepted', message: 'Matches target WEB 2160p' },
            { kind: 'accepted', message: 'Dolby Vision format score +1500' },
            { kind: 'accepted', message: 'HDR10 format score +1000' },
            { kind: 'accepted', message: 'x265 codec bonus +100' },
          ]
        : [{ kind: 'rejected', message: 'Quality WEB 2160p is not allowed in HD-1080p profile' }],
    },
    {
      guid: `rel-${m.id}-2`,
      title: `${cleanTitle}.${m.year}.1080p.BluRay.x264.DTS-HD.MA.5.1-EPSiLON`,
      indexerId: 'ix-driftnet',
      indexer: ix(1, 'Driftnet'),
      size: 8.4 * GB,
      seeders: 42,
      leechers: 5,
      ageHours: 120,
      quality: 'Bluray 1080p',
      customFormats: ['DTS-HD MA'],
      formatScore: 400,
      approved: true,
      reasons: [
        { kind: 'accepted', message: 'Matches Bluray 1080p' },
        { kind: 'accepted', message: 'DTS-HD MA audio format score +400' },
      ],
    },
    {
      guid: `rel-${m.id}-3`,
      title: `${cleanTitle}.${m.year}.1080p.WEB-DL.AAC2.0.H.264-NTb`,
      indexerId: 'ix-keel',
      indexer: ix(2, 'Keel'),
      size: 3.2 * GB,
      seeders: 19,
      leechers: 2,
      ageHours: 240,
      quality: 'WEB 1080p',
      customFormats: [],
      formatScore: 0,
      approved: true,
      reasons: [{ kind: 'accepted', message: 'Matches WEB 1080p' }],
    },
    {
      guid: `rel-${m.id}-4`,
      title: `${cleanTitle}.${m.year}.720p.HDTV.x264-DEADPOOL`,
      indexerId: 'ix-flotsam',
      indexer: ix(3, 'Flotsam'),
      size: 1.1 * GB,
      seeders: 2,
      leechers: 0,
      ageHours: 850,
      quality: 'HDTV 720p',
      customFormats: ['Low Quality'],
      formatScore: -10000,
      approved: false,
      reasons: [
        { kind: 'rejected', message: 'Low Quality format score (-10000) below minimum cutoff' },
        { kind: 'rejected', message: 'Seeders (2) below minimum threshold of 3' },
      ],
    },
    {
      guid: `rel-${m.id}-5`,
      title: `${cleanTitle}.${m.year}.CAM.XviD-UNKNOWN`,
      indexerId: 'ix-public',
      indexer: 'PublicTracker',
      size: 700 * MB,
      seeders: 0,
      leechers: 1,
      ageHours: 1200,
      quality: 'CAM',
      customFormats: ['Low Quality'],
      formatScore: -10000,
      approved: false,
      reasons: [
        { kind: 'rejected', message: 'Quality CAM is not allowed in any profile' },
        { kind: 'rejected', message: 'No seeders available' },
      ],
    },
  ]
}

function generateSubtitleResults(m: MediaItem, lang = 'en'): SubtitleSearchResult[] {
  const cleanTitle = m.title.replace(/[^\w\s]/gi, '').replace(/\s+/g, '.')
  return [
    {
      id: `sub-res-${m.id}-1`,
      language: lang,
      releaseName: `${cleanTitle}.${m.year}.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX`,
      provider: 'OpenSubtitles.com',
      score: 98,
      forced: false,
      hi: false,
      format: 'srt',
    },
    {
      id: `sub-res-${m.id}-2`,
      language: lang,
      releaseName: `${cleanTitle}.${m.year}.1080p.BluRay.x264.DTS-HD.MA.5.1-EPSiLON`,
      provider: 'SubSource',
      score: 92,
      forced: false,
      hi: true,
      format: 'srt',
    },
    {
      id: `sub-res-${m.id}-3`,
      language: lang,
      releaseName: `${cleanTitle}.${m.year}.Forced.Foreign.Parts.Only`,
      provider: 'YIFY Subtitles',
      score: 85,
      forced: true,
      hi: false,
      format: 'ass',
    },
    {
      id: `sub-res-${m.id}-4`,
      language: lang,
      releaseName: `${cleanTitle}.${m.year}.Hearing.Impaired.CC`,
      provider: 'Podnapisi',
      score: 79,
      forced: false,
      hi: true,
      format: 'vtt',
    },
  ]
}

export function createApi(srv: MockServer, ctx: Ctx) {
  const { state } = srv
  const storage = ctx.storage ?? memoryStorage()
  const now = () => srv.clock.now()
  const me = (): User => {
    const u = state.users.find((x) => x.id === ctx.userId) ?? state.users[0]
    if (!u) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.')
    return u
  }
  const staff = () => me().role === 'owner' || me().role === 'admin'
  const requireStaff = () => {
    if (!staff()) throw forbidden()
  }
  const layoutKey = (scope: string) => `layout:${srv.kind}:${scope}`

  const queueItem = (t: Torrent): QueueItem => {
    const m = state.items.find((x) => x.id === t.itemId)
    return {
      id: `q-${t.id}`,
      torrentId: t.id,
      itemId: t.itemId,
      title: m?.title ?? t.name,
      year: m?.year ?? null,
      release: t.name,
      quality: t.quality,
      size: t.size,
      progress: t.progress,
      downRate: t.downRate,
      upRate: t.upRate,
      eta: t.eta,
      ratio: t.ratio,
      state: t.state,
      stateReason: t.stateReason,
    }
  }

  const visible = (a: Announcement) => {
    const u = me()
    if (a.audience.kind === 'roles') return a.audience.roles.includes(u.role)
    if (a.audience.kind === 'users') return a.audience.userIds.includes(u.id)
    return true
  }

  const layoutFor = (role: UserRole): WidgetPlacement[] => {
    const saved = storage.load(layoutKey(`role:${role}`)) as WidgetPlacement[] | undefined
    return (saved ?? roleDefault(role)).filter((w) => allowed(w.kind, role)).map(normalize)
  }

  /** Available movies still missing a language their profile asks for. */
  const wantedSubtitles = () => {
    const results: { movie: MediaItem; missingLanguages: string[] }[] = []
    for (const m of state.items) {
      if (m.status !== 'available') continue
      const tracks = state.subtitles.filter((s) => s.itemId === m.id)
      const embedded = state.files
        .filter((f) => f.itemId === m.id)
        .flatMap((f) => f.streams.filter((s) => s.type === 'subtitle').map((s) => s.language))
      const profile = state.languageProfiles.find((lp) => lp.id === m.languageProfileId)
      // a language is wanted until an external track or an embedded stream covers it
      const missing = (profile?.languages ?? [])
        .map((l) => l.code)
        .filter((code) => !tracks.some((t) => t.language === code) && !embedded.includes(code))
      if (missing.length > 0) {
        results.push({ movie: m, missingLanguages: missing })
      }
    }
    return results
  }

  return {
    system: {
      publicInfo: () => ({
        id: state.server.id,
        name: state.server.name,
        version: state.server.version,
        setupComplete: state.server.setupComplete,
        auth: { local: true, oidc: { name: 'Authentik' } },
      }),
      server: () => state.server,
      status: () => state.status,
      health: () => {
        requireStaff()
        return state.health
      },
      jobs: () => state.jobs,
      speeds: () => {
        requireStaff()
        return state.speeds
      },
    },

    auth: {
      session: () => ({ user: me(), deviceId: 'd-admin', expiresAt: iso(now() + 30 * 86_400_000) }),
      signIn: (input: { username: string; password: string }): SignInResult => {
        if (input.password === 'wrong' || !input.password)
          throw new ApiError(401, 'invalid-credentials', 'That username and password don’t match.')
        if (input.password === 'locked')
          throw new ApiError(429, 'rate-limited', 'Too many attempts. Try again in 5 minutes.')
        const u = state.users.find((x) => x.username === input.username.toLowerCase()) ?? me()
        if (u.twoFactor) return { status: 'two-factor', challenge: `ch-${u.id}` }
        return {
          status: 'signed-in',
          session: { user: u, deviceId: 'd-admin', expiresAt: iso(now()) },
        }
      },
      verifyTwoFactor: (input: { challenge: string; code: string }): SignInResult => {
        if (!/^\d{6}$/.test(input.code) || input.code === '000000')
          throw new ApiError(
            401,
            'invalid-code',
            'That code didn’t work. Codes change every 30 seconds.',
          )
        return {
          status: 'signed-in',
          session: { user: me(), deviceId: 'd-admin', expiresAt: iso(now()) },
        }
      },
    },

    setup: {
      complete: (input: SetupInput) => {
        state.server.name = input.serverName
        state.server.branding.name = input.serverName
        state.server.setupComplete = true
        storage.save(`server:${srv.kind}:name`, input.serverName)
        srv.events.emit({ type: 'server.updated' })
        return state.server
      },
    },

    fs: {
      list: (path: string) => {
        const node = state.fs[path]
        if (!node) throw new ApiError(404, 'not-found', `${path} doesn’t exist on the server.`)
        return (node.children ?? []).map((p) => ({
          name: p.split('/').pop() ?? p,
          path: p,
          kind: 'folder' as const,
        }))
      },
      checkHardlinks: (a: string, b: string): HardlinkCheck => {
        const da = state.fs[a]?.device
        const db = state.fs[b]?.device
        if (!da || !db) return { ok: false, sameDevice: false, message: 'Pick both folders first.' }
        return da === db
          ? {
              ok: true,
              sameDevice: true,
              message:
                'Both folders are on the same disk, so imports are hardlinked: seeding takes no extra space.',
            }
          : {
              ok: true,
              sameDevice: false,
              message:
                'These folders are on different disks, so imports are copied. While a movie seeds, it takes twice the space.',
            }
      },
    },

    catalog: {
      list: () => state.catalog,
      starterPack: () => state.catalog.filter((d) => d.starter),
    },

    indexers: {
      list: () => {
        requireStaff()
        return state.indexers
      },
      catalog: () => state.catalog,
      add: (definitionId: string, _settings: Record<string, string> = {}) => {
        requireStaff()
        const def = state.catalog.find((c) => c.id === definitionId)
        if (!def) throw new ApiError(404, 'not-found', 'Indexer definition not found.')
        const existing = state.indexers.find((i) => i.definitionId === definitionId)
        if (existing) return existing
        const newIndexer: Indexer = {
          id: `ix-${def.id}`,
          definitionId: def.id,
          name: def.name,
          privacy: def.privacy,
          enabled: true,
          priority: 25,
          health: 'healthy',
          backoffUntil: null,
          lastError: null,
          stats: {
            queries24h: 0,
            grabs24h: 0,
            avgResponseMs: 145,
            successRate: 1.0,
          },
        }
        state.indexers.push(newIndexer)
        srv.events.emit({ type: 'indexers.updated' })
        srv.events.emit({ type: 'health.updated' })
        return newIndexer
      },
      update: (id: string, patch: Partial<Indexer>) => {
        requireStaff()
        const ix = state.indexers.find((x) => x.id === id)
        if (!ix) throw new ApiError(404, 'not-found', 'Indexer not found.')
        Object.assign(ix, patch)
        srv.events.emit({ type: 'indexers.updated' })
        return ix
      },
      remove: (id: string) => {
        requireStaff()
        state.indexers = state.indexers.filter((x) => x.id !== id)
        srv.events.emit({ type: 'indexers.updated' })
        srv.events.emit({ type: 'health.updated' })
      },
      test: (idOrDefId: string, settings?: Record<string, string>) => {
        requireStaff()
        const ix = state.indexers.find((x) => x.id === idOrDefId || x.definitionId === idOrDefId)
        const def = state.catalog.find((x) => x.id === idOrDefId)
        // the prototype's way to see a rejected key: type "wrong"
        if (settings?.apiKey === 'wrong')
          return {
            ok: false,
            message: `${def?.name ?? 'The indexer'} rejected the API key (401). Copy it again from your profile.`,
            latencyMs: 210,
          }
        if (ix?.health === 'failing') {
          return {
            ok: false,
            message: 'Connection timed out (504 Gateway Timeout).',
            latencyMs: 3200,
          }
        }
        return {
          ok: true,
          message: `Successfully connected to ${ix?.name ?? def?.name ?? 'indexer'}. 1,420 releases indexed in test category.`,
          latencyMs: 165,
        }
      },
      clearBackoff: (id: string) => {
        requireStaff()
        const ix = state.indexers.find((x) => x.id === id)
        if (ix) {
          ix.health = 'healthy'
          ix.backoffUntil = null
          ix.lastError = null
          state.health = state.health.filter((h) => h.id !== `h-${ix.definitionId}`)
          srv.events.emit({ type: 'indexers.updated' })
          srv.events.emit({ type: 'health.updated' })
        }
      },
      toggle: (id: string, enabled: boolean) => {
        requireStaff()
        const ix = state.indexers.find((x) => x.id === id)
        if (!ix) throw new ApiError(404, 'not-found', 'Indexer not found.')
        ix.enabled = enabled
        srv.events.emit({ type: 'indexers.updated' })
        return ix
      },
    },

    metadata: {
      movie: (id: string) => {
        const m = movieMetadata(state, id, now())
        if (!m) throw new ApiError(404, 'not-found', 'There’s no movie with that id')
        return m
      },
      recommendations: (id: string) => recommendations(state, id),
      collection: (id: string) => {
        const c = collection(state, id)
        if (!c) throw new ApiError(404, 'not-found', 'TMDB doesn’t know that collection')
        return c
      },
      person: (id: string) => {
        const p = person(state, id)
        if (!p) throw new ApiError(404, 'not-found', 'TMDB doesn’t know that person')
        return p
      },
    },

    movies: {
      list: () => state.items.filter((m) => m.type === 'movie'),
      get: (id: string) => {
        const m = state.items.find((x) => x.id === id)
        if (!m) throw new ApiError(404, 'not-found', 'That movie isn’t in the library.')
        return m
      },
      upcoming: (days = 14) =>
        state.items
          .filter((m) => {
            const d = Date.parse(m.releaseDate) - now()
            return m.monitored && d > 0 && d < days * 86_400_000
          })
          .sort((a, b) => Date.parse(a.releaseDate) - Date.parse(b.releaseDate)),
      recent: (limit = 8) =>
        state.items
          .filter((m) => m.status === 'available')
          .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
          .slice(0, limit),
      discover: (query = '') => {
        const q = query.trim().toLowerCase()
        const all = knownTitles(state)
        if (!q) return all
        return all.filter(
          (m) =>
            m.title.toLowerCase().includes(q) ||
            m.genres.some((g) => g.toLowerCase().includes(q)) ||
            m.year.toString().includes(q),
        )
      },
      add: (input: AddMovieInput) => {
        requireStaff()
        const existing = state.items.find(
          (x) =>
            (input.tmdbId && x.tmdbId === input.tmdbId) ||
            x.title.toLowerCase() === input.title.toLowerCase(),
        )
        if (existing) return existing

        // a title from the metadata cache keeps its media id; anything else takes the next one
        const meta = state.discoverCatalog.find((d) => d.tmdbId === input.tmdbId)
        const id =
          meta?.id ??
          String(
            Math.max(0, ...[...state.items, ...state.discoverCatalog].map((x) => Number(x.id))) + 1,
          )
        const isUhd = input.qualityProfileId === 'qp-uhd'
        const newItem: MediaItem = {
          id,
          type: 'movie',
          parentId: null,
          tmdbId: input.tmdbId ?? 1000000 + state.items.length,
          title: input.title,
          originalTitle: null,
          sortTitle: input.title.toLowerCase().replace(/^(the|a|an)\s+/i, ''),
          year: input.year,
          runtimeMinutes: meta?.runtimeMinutes ?? 0,
          genres: meta?.genres ?? [],
          synopsis: meta?.synopsis ?? '',
          rating: meta?.rating ?? 0,
          status: 'missing',
          monitored: input.monitored,
          minimumAvailability: input.minimumAvailability,
          languageProfileId: input.languageProfileId || 'lp-default',
          rootFolder: input.rootFolder || '/data/media/movies',
          releaseDate: meta?.releaseDate ?? iso(now() - 30 * 86_400_000),
          addedAt: iso(now()),
          path: `${input.rootFolder}/${input.title} (${input.year})`,
          versions: [
            {
              id: `${id}-v1`,
              label: isUhd ? '4K HDR' : '1080p',
              qualityProfileId: input.qualityProfileId,
              fileId: null,
            },
          ],
          quality: isUhd ? ['4K', 'HDR'] : ['1080p'],
          art: meta?.art ?? {
            poster: posterArt(input.title),
            backdrop: backdropArt(input.title),
            still: stillArt(input.title),
          },
        }

        state.items.push(newItem)

        if (input.searchNow) {
          const releases = generateReleases(newItem, state)
          const chosen = releases.find((r) => r.approved) ?? releases[0]
          if (chosen) {
            const torrentId = `t-${id}-${Date.now().toString(36)}`
            const newTorrent: Torrent = {
              id: torrentId,
              name: chosen.title,
              infoHash: `hash-${id}-${Date.now().toString(36)}`,
              itemId: id,
              category: 'movies',
              size: chosen.size,
              downloaded: 0,
              uploaded: 0,
              progress: 0.05,
              downRate: 18.5 * MB,
              upRate: 1.2 * MB,
              eta: 140,
              peers: { connected: 34, total: 48 },
              seeds: { connected: chosen.seeders, total: chosen.seeders + 10 },
              ratio: 0,
              state: 'downloading',
              stateReason: null,
              indexer: chosen.indexer,
              quality: chosen.quality,
              addedAt: iso(now()),
              completedAt: null,
              savePath: '/data/downloads/complete/movies',
              files: [
                {
                  path: `${chosen.title}/${chosen.title}.mkv`,
                  size: chosen.size - 40 * MB,
                  progress: 0.05,
                  priority: 'normal',
                },
              ],
              trackers: [
                {
                  url: `udp://tracker.${chosen.indexer.toLowerCase()}.example:6969/announce`,
                  status: 'working',
                  peers: chosen.seeders,
                  message: null,
                },
              ],
              seedingRule: { ratio: 2, minutes: 7 * 24 * 60 },
            }
            state.torrents.unshift(newTorrent)
            newItem.status = 'downloading'
            state.history.unshift({
              id: `h-grab-${id}-${now()}`,
              itemId: id,
              type: 'grabbed',
              date: iso(now()),
              sourceTitle: chosen.title,
              quality: chosen.quality,
              indexer: chosen.indexer,
              message: `Grabbed from ${chosen.indexer} (format score ${chosen.formatScore})`,
            })
            srv.events.emit({ type: 'torrents.updated' })
            srv.events.emit({ type: 'queue.changed' })
            srv.events.emit({ type: 'history.updated' })
          }
        }

        srv.events.emit({ type: 'movies.updated' })
        srv.events.emit({ type: 'item.updated', id })
        return newItem
      },
      update: (id: string, patch: Partial<MediaItem>) => {
        requireStaff()
        const m = state.items.find((x) => x.id === id)
        if (!m) throw new ApiError(404, 'not-found', 'That movie isn’t in the library.')
        Object.assign(m, patch)
        srv.events.emit({ type: 'item.updated', id })
        srv.events.emit({ type: 'movies.updated' })
        return m
      },
      delete: (id: string, opts: { deleteFiles?: boolean } = {}) => {
        requireStaff()
        const m = state.items.find((x) => x.id === id)
        if (!m) return
        state.items = state.items.filter((x) => x.id !== id)
        state.torrents = state.torrents.filter((t) => t.itemId !== id)
        state.subtitles = state.subtitles.filter((s) => s.itemId !== id)
        if (opts.deleteFiles) {
          state.files = state.files.filter((f) => f.itemId !== id)
        }
        state.history.unshift({
          id: `h-del-${id}-${now()}`,
          itemId: id,
          type: 'deleted',
          date: iso(now()),
          sourceTitle: m.title,
          quality: null,
          indexer: null,
          message: opts.deleteFiles
            ? 'Removed movie and deleted files from disk.'
            : 'Removed movie from library.',
        })
        srv.events.emit({ type: 'movies.updated' })
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
        srv.events.emit({ type: 'history.updated' })
      },
      bulkUpdate: (ids: string[], patch: Partial<MediaItem>) => {
        requireStaff()
        for (const id of ids) {
          const m = state.items.find((x) => x.id === id)
          if (m) Object.assign(m, patch)
        }
        srv.events.emit({ type: 'movies.updated' })
      },
      /** Moves each item's first version to the profile; extra versions keep their own. */
      bulkSetQualityProfile: (ids: string[], profileId: string) => {
        requireStaff()
        if (!state.qualityProfiles.some((p) => p.id === profileId))
          throw new ApiError(404, 'not-found', 'That quality profile doesn’t exist.')
        for (const id of ids) {
          const v = state.items.find((x) => x.id === id)?.versions[0]
          if (v) v.qualityProfileId = profileId
        }
        srv.events.emit({ type: 'movies.updated' })
      },
      bulkDelete: (ids: string[], deleteFiles = false) => {
        requireStaff()
        for (const id of ids) {
          state.items = state.items.filter((x) => x.id !== id)
          state.torrents = state.torrents.filter((t) => t.itemId !== id)
          state.subtitles = state.subtitles.filter((s) => s.itemId !== id)
          if (deleteFiles) {
            state.files = state.files.filter((f) => f.itemId !== id)
          }
        }
        srv.events.emit({ type: 'movies.updated' })
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
      },
      bulkSearch: (ids: string[]) => {
        requireStaff()
        for (const id of ids) {
          const m = state.items.find((x) => x.id === id)
          if (!m || m.status === 'available' || m.status === 'downloading') continue
          const releases = generateReleases(m, state)
          const chosen = releases.find((r) => r.approved) ?? releases[0]
          if (chosen) {
            const torrentId = `t-${id}-${Date.now().toString(36)}`
            const newTorrent: Torrent = {
              id: torrentId,
              name: chosen.title,
              infoHash: `hash-${id}-${Date.now().toString(36)}`,
              itemId: id,
              category: 'movies',
              size: chosen.size,
              downloaded: 0,
              uploaded: 0,
              progress: 0.08,
              downRate: 15.2 * MB,
              upRate: 800_000,
              eta: 180,
              peers: { connected: 22, total: 38 },
              seeds: { connected: chosen.seeders, total: chosen.seeders + 8 },
              ratio: 0,
              state: 'downloading',
              stateReason: null,
              indexer: chosen.indexer,
              quality: chosen.quality,
              addedAt: iso(now()),
              completedAt: null,
              savePath: '/data/downloads/complete/movies',
              files: [
                {
                  path: `${chosen.title}/${chosen.title}.mkv`,
                  size: chosen.size - 40 * MB,
                  progress: 0.08,
                  priority: 'normal',
                },
              ],
              trackers: [
                {
                  url: `udp://tracker.${chosen.indexer.toLowerCase()}.example:6969/announce`,
                  status: 'working',
                  peers: chosen.seeders,
                  message: null,
                },
              ],
              seedingRule: { ratio: 2, minutes: 7 * 24 * 60 },
            }
            state.torrents.unshift(newTorrent)
            m.status = 'downloading'
          }
        }
        srv.events.emit({ type: 'movies.updated' })
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
      },
      files: (id: string) => {
        return state.files.filter((f) => f.itemId === id)
      },
      history: (id: string) => {
        return state.history.filter((h) => h.itemId === id)
      },
      interactiveSearch: (id: string) => {
        requireStaff()
        const m = state.items.find((x) => x.id === id)
        if (!m) throw new ApiError(404, 'not-found', 'Movie not found.')
        return generateReleases(m, state)
      },
      grabRelease: (id: string, releaseGuid: string) => {
        requireStaff()
        const m = state.items.find((x) => x.id === id)
        if (!m) throw new ApiError(404, 'not-found', 'Movie not found.')
        const releases = generateReleases(m, state)
        const chosen = releases.find((r) => r.guid === releaseGuid) ?? releases[0]
        if (!chosen) throw new ApiError(404, 'not-found', 'That release is no longer available.')
        const torrentId = `t-${id}-${Date.now().toString(36)}`
        const newTorrent: Torrent = {
          id: torrentId,
          name: chosen.title,
          infoHash: `hash-${id}-${Date.now().toString(36)}`,
          itemId: id,
          category: 'movies',
          size: chosen.size,
          downloaded: 0,
          uploaded: 0,
          progress: 0.02,
          downRate: 22.4 * MB,
          upRate: 1.4 * MB,
          eta: 110,
          peers: { connected: 28, total: 42 },
          seeds: { connected: chosen.seeders, total: chosen.seeders + 12 },
          ratio: 0,
          state: 'downloading',
          stateReason: null,
          indexer: chosen.indexer,
          quality: chosen.quality,
          addedAt: iso(now()),
          completedAt: null,
          savePath: '/data/downloads/complete/movies',
          files: [
            {
              path: `${chosen.title}/${chosen.title}.mkv`,
              size: chosen.size - 40 * MB,
              progress: 0.02,
              priority: 'normal',
            },
          ],
          trackers: [
            {
              url: `udp://tracker.${chosen.indexer.toLowerCase()}.example:6969/announce`,
              status: 'working',
              peers: chosen.seeders,
              message: null,
            },
          ],
          seedingRule: { ratio: 2, minutes: 7 * 24 * 60 },
        }
        state.torrents.unshift(newTorrent)
        m.status = 'downloading'
        state.history.unshift({
          id: `h-grab-${id}-${now()}`,
          itemId: id,
          type: 'grabbed',
          date: iso(now()),
          sourceTitle: chosen.title,
          quality: chosen.quality,
          indexer: chosen.indexer,
          message: `Manually grabbed from ${chosen.indexer}`,
        })
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
        srv.events.emit({ type: 'movies.updated' })
        srv.events.emit({ type: 'history.updated' })
        return newTorrent
      },
      qualityProfiles: () => state.qualityProfiles,
      languageProfiles: () => state.languageProfiles,
      rootFolders: () => ['/data/media/movies', '/data/media/movies-4k'],
    },

    queue: {
      list: () => state.torrents.filter((t) => t.itemId && t.state !== 'completed').map(queueItem),
      pause: (torrentId: string) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === torrentId)
        if (t) {
          t.state = 'paused'
          t.downRate = 0
          t.eta = null
          srv.events.emit({ type: 'torrents.updated' })
          srv.events.emit({ type: 'queue.changed' })
        }
      },
      resume: (torrentId: string) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === torrentId)
        if (t) {
          t.state = 'downloading'
          t.downRate = 12 * MB
          srv.events.emit({ type: 'torrents.updated' })
          srv.events.emit({ type: 'queue.changed' })
        }
      },
      remove: (torrentId: string, _deleteData = false) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === torrentId)
        if (t?.itemId) {
          const m = state.items.find((x) => x.id === t.itemId)
          if (m && m.status === 'downloading') {
            m.status = fileFor(state, m) ? 'available' : 'missing'
          }
        }
        state.torrents = state.torrents.filter((x) => x.id !== torrentId)
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
        srv.events.emit({ type: 'movies.updated' })
      },
      forceImport: (torrentId: string) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === torrentId)
        if (!t?.itemId) return
        const m = state.items.find((x) => x.id === t.itemId)
        if (!m) return
        // remove executable or problematic file
        t.files = t.files.filter((f) => !/\.(exe|lnk|scr|zipx)$/i.test(f.path))
        t.state = 'importing'
        t.stateReason = null
        importTorrent(state, srv.clock, t, m, now())
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
        srv.events.emit({ type: 'movies.updated' })
        srv.events.emit({ type: 'history.updated' })
      },
      searchAlternative: (torrentId: string) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === torrentId)
        if (!t?.itemId) return
        const m = state.items.find((x) => x.id === t.itemId)
        if (!m) return
        // add to blocklist
        state.blocklist.unshift({
          id: `bl-${t.id}-${now()}`,
          itemId: m.id,
          sourceTitle: t.name,
          indexer: t.indexer ?? 'Unknown',
          reason: t.stateReason ?? 'User marked release as bad',
          date: iso(now()),
        })
        state.torrents = state.torrents.filter((x) => x.id !== torrentId)
        const releases = generateReleases(m, state).filter((r) => r.title !== t.name)
        const next = releases.find((r) => r.approved) ?? releases[0]
        if (next) {
          const newTorrent: Torrent = {
            id: `t-${m.id}-${Date.now().toString(36)}`,
            name: next.title,
            infoHash: `hash-${m.id}-${Date.now().toString(36)}`,
            itemId: m.id,
            category: 'movies',
            size: next.size,
            downloaded: 0,
            uploaded: 0,
            progress: 0.04,
            downRate: 16.8 * MB,
            upRate: 1.1 * MB,
            eta: 130,
            peers: { connected: 24, total: 36 },
            seeds: { connected: next.seeders, total: next.seeders + 6 },
            ratio: 0,
            state: 'downloading',
            stateReason: null,
            indexer: next.indexer,
            quality: next.quality,
            addedAt: iso(now()),
            completedAt: null,
            savePath: '/data/downloads/complete/movies',
            files: [
              {
                path: `${next.title}/${next.title}.mkv`,
                size: next.size - 40 * MB,
                progress: 0.04,
                priority: 'normal',
              },
            ],
            trackers: [
              {
                url: `udp://tracker.${next.indexer.toLowerCase()}.example:6969/announce`,
                status: 'working',
                peers: next.seeders,
                message: null,
              },
            ],
            seedingRule: { ratio: 2, minutes: 7 * 24 * 60 },
          }
          state.torrents.unshift(newTorrent)
        }
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
        srv.events.emit({ type: 'history.updated' })
      },
    },

    history: {
      list: () => state.history,
      clear: () => {
        requireStaff()
        state.history = []
        srv.events.emit({ type: 'history.updated' })
      },
    },

    blocklist: {
      list: () => state.blocklist,
      remove: (id: string) => {
        requireStaff()
        state.blocklist = state.blocklist.filter((b) => b.id !== id)
        srv.events.emit({ type: 'history.updated' })
      },
    },

    downloads: {
      list: () => {
        requireStaff()
        return state.torrents
      },
      get: (id: string) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === id)
        if (!t) throw new ApiError(404, 'not-found', 'Torrent not found.')
        return t
      },
      add: (input: AddTorrentInput) => {
        requireStaff()
        const name = input.urlOrMagnet.startsWith('magnet:')
          ? decodeURIComponent(
              input.urlOrMagnet.split('&dn=')[1]?.split('&')[0] ?? 'Custom.Magnet.Release',
            )
          : (input.urlOrMagnet.split('/').pop() ?? 'Custom.Torrent.Release')
        const newTorrent: Torrent = {
          id: `t-manual-${Date.now().toString(36)}`,
          name,
          infoHash: `hash-${Date.now().toString(36)}`,
          itemId: null,
          category: input.category || 'movies',
          size: 4.8 * GB,
          downloaded: 0,
          uploaded: 0,
          progress: 0.01,
          downRate: input.startImmediately !== false ? 14.5 * MB : 0,
          upRate: input.startImmediately !== false ? 800_000 : 0,
          eta: input.startImmediately !== false ? 320 : null,
          peers: { connected: 16, total: 30 },
          seeds: { connected: 24, total: 32 },
          ratio: 0,
          state: input.startImmediately !== false ? 'downloading' : 'paused',
          stateReason: null,
          indexer: 'Manual',
          quality: 'WEB 1080p',
          addedAt: iso(now()),
          completedAt: null,
          savePath: input.savePath || '/data/downloads/complete/movies',
          files: [
            {
              path: `${name}/${name}.mkv`,
              size: 4.76 * GB,
              progress: 0.01,
              priority: 'normal',
            },
          ],
          trackers: [
            {
              url: 'udp://tracker.open.example:6969/announce',
              status: 'working',
              peers: 24,
              message: null,
            },
          ],
          seedingRule: { ratio: 2, minutes: 7 * 24 * 60 },
        }
        state.torrents.unshift(newTorrent)
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
        return newTorrent
      },
      delete: (id: string, _deleteFiles = false) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === id)
        if (t?.itemId) {
          const m = state.items.find((x) => x.id === t.itemId)
          if (m && m.status === 'downloading') {
            m.status = fileFor(state, m) ? 'available' : 'missing'
          }
        }
        state.torrents = state.torrents.filter((x) => x.id !== id)
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
        srv.events.emit({ type: 'movies.updated' })
      },
      pause: (id: string) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === id)
        if (t) {
          t.state = 'paused'
          t.downRate = 0
          t.eta = null
          srv.events.emit({ type: 'torrents.updated' })
          srv.events.emit({ type: 'queue.changed' })
        }
      },
      resume: (id: string) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === id)
        if (t) {
          t.state = 'downloading'
          t.downRate = 14 * MB
          srv.events.emit({ type: 'torrents.updated' })
          srv.events.emit({ type: 'queue.changed' })
        }
      },
      pauseAll: () => {
        requireStaff()
        for (const t of state.torrents)
          if (t.state === 'downloading' || t.state === 'queued' || t.state === 'stalled') {
            t.state = 'paused'
            t.downRate = 0
            t.eta = null
          }
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
      },
      resumeAll: () => {
        requireStaff()
        for (const t of state.torrents) if (t.state === 'paused') t.state = 'queued'
        srv.events.emit({ type: 'torrents.updated' })
        srv.events.emit({ type: 'queue.changed' })
      },
      setFilePriority: (
        torrentId: string,
        filePath: string,
        priority: 'skip' | 'normal' | 'high',
      ) => {
        requireStaff()
        const t = state.torrents.find((x) => x.id === torrentId)
        const f = t?.files.find((file) => file.path === filePath)
        if (f) {
          f.priority = priority
          srv.events.emit({ type: 'torrents.updated' })
        }
      },
      limits: () => {
        requireStaff()
        return state.torrentLimits
      },
      setLimits: (patch: Partial<TorrentLimits>) => {
        requireStaff()
        Object.assign(state.torrentLimits, patch)
        srv.events.emit({ type: 'torrents.updated' })
        return state.torrentLimits
      },
    },

    subtitles: {
      stats: (): SubtitleStats => {
        requireStaff()
        const synced = state.subtitles.filter((s) => s.sync.status === 'synced')
        const waiting = state.subtitles.filter(
          (s) =>
            s.sync.status === 'syncing' ||
            s.sync.status === 'queued' ||
            s.sync.status === 'unsynced',
        ).length
        const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
        return {
          syncedToday: Math.min(synced.length, 12),
          waiting,
          avgOffsetMs: Math.round(avg(synced.map((s) => Math.abs(s.sync.offsetMs)))),
          avgConfidence: avg(synced.map((s) => s.sync.confidence ?? 0)),
        }
      },
      languages: () => state.languages,
      wanted: () => {
        requireStaff()
        return wantedSubtitles()
      },
      forItem: (id: string) => {
        return state.subtitles.filter((s) => s.itemId === id)
      },
      search: (id: string, language = 'en') => {
        requireStaff()
        const m = state.items.find((x) => x.id === id)
        if (!m) throw new ApiError(404, 'not-found', 'Movie not found.')
        return generateSubtitleResults(m, language)
      },
      download: (id: string, result: SubtitleSearchResult) => {
        requireStaff()
        const m = state.items.find((x) => x.id === id)
        if (!m) throw new ApiError(404, 'not-found', 'Movie not found.')
        const f = fileFor(state, m)
        const newTrack: SubtitleTrack = {
          id: `st-${id}-${result.language}-${Date.now().toString(36)}`,
          itemId: id,
          fileId: f?.id ?? `f-${id}-v1`,
          language: result.language,
          kind: 'external',
          format: result.format,
          forced: result.forced,
          hi: result.hi,
          provider: result.provider,
          score: result.score,
          sync: { status: 'synced', confidence: 0.96, offsetMs: -120 },
          path: `${m.path}/${m.title} (${m.year}).${result.language}.${result.format}`,
        }
        state.subtitles.push(newTrack)
        state.history.unshift({
          id: `h-sub-${id}-${now()}`,
          itemId: id,
          type: 'subtitle-downloaded',
          date: iso(now()),
          sourceTitle: result.releaseName,
          quality: null,
          indexer: result.provider,
          message: `Downloaded ${result.language.toUpperCase()} subtitles from ${result.provider} (score ${result.score})`,
        })
        srv.events.emit({ type: 'subtitles.updated', itemId: id })
        srv.events.emit({ type: 'history.updated' })
        return newTrack
      },
      sync: (trackId: string) => {
        requireStaff()
        const track = state.subtitles.find((s) => s.id === trackId)
        if (!track) throw new ApiError(404, 'not-found', 'Subtitle track not found.')
        track.sync = {
          status: 'synced',
          confidence: 0.98,
          offsetMs: -350,
        }
        const m = state.items.find((x) => x.id === track.itemId)
        if (m) {
          state.history.unshift({
            id: `h-sync-${trackId}-${now()}`,
            itemId: track.itemId,
            type: 'subtitle-synced',
            date: iso(now()),
            sourceTitle: m.title,
            quality: null,
            indexer: null,
            message: `Audio sync completed: offset -350 ms, confidence 98%`,
          })
        }
        srv.events.emit({ type: 'subtitles.updated', itemId: track.itemId })
        srv.events.emit({ type: 'history.updated' })
        return track
      },
      setOffset: (trackId: string, offsetMs: number) => {
        requireStaff()
        const track = state.subtitles.find((s) => s.id === trackId)
        if (!track) throw new ApiError(404, 'not-found', 'Subtitle track not found.')
        track.sync.offsetMs = offsetMs
        srv.events.emit({ type: 'subtitles.updated', itemId: track.itemId })
        return track
      },
      delete: (trackId: string) => {
        requireStaff()
        const track = state.subtitles.find((s) => s.id === trackId)
        if (!track) return
        state.subtitles = state.subtitles.filter((s) => s.id !== trackId)
        srv.events.emit({ type: 'subtitles.updated', itemId: track.itemId })
      },
      providers: () => {
        requireStaff()
        return state.providers ?? []
      },
      settings: (): SubtitleSettings => {
        requireStaff()
        return state.subtitleSettings
      },
      saveSettings: (patch: Partial<SubtitleSettings>) => {
        requireStaff()
        Object.assign(state.subtitleSettings, patch)
        srv.events.emit({ type: 'subtitles.updated' })
        return state.subtitleSettings
      },
      toggleProvider: (id: string, enabled: boolean) => {
        requireStaff()
        const p = state.providers.find((x) => x.id === id)
        if (!p) throw new ApiError(404, 'not-found', 'Provider not found.')
        p.enabled = enabled
        srv.events.emit({ type: 'subtitles.updated' })
        return p
      },
      languageProfiles: () => state.languageProfiles,
      saveLanguageProfile: (profile: LanguageProfile) => {
        requireStaff()
        const existingIdx = state.languageProfiles.findIndex((lp) => lp.id === profile.id)
        if (existingIdx >= 0) {
          state.languageProfiles[existingIdx] = profile
        } else {
          state.languageProfiles.push(profile)
        }
        srv.events.emit({ type: 'subtitles.updated' })
        return profile
      },
      deleteLanguageProfile: (id: string) => {
        requireStaff()
        state.languageProfiles = state.languageProfiles.filter((lp) => lp.id !== id)
        srv.events.emit({ type: 'subtitles.updated' })
      },
      searchAllMissing: () => {
        requireStaff()
        for (const { movie: m, missingLanguages } of wantedSubtitles()) {
          const f = fileFor(state, m)
          for (const language of missingLanguages)
            state.subtitles.push({
              id: `st-${m.id}-${language}-auto`,
              itemId: m.id,
              fileId: f?.id ?? `f-${m.id}-v1`,
              language,
              kind: 'external',
              format: 'srt',
              forced: false,
              hi: false,
              provider: 'OpenSubtitles.com',
              score: 95,
              sync: { status: 'synced', confidence: 0.94, offsetMs: -80 },
              path: `${m.path}/${m.title} (${m.year}).${language}.srt`,
            })
        }
        srv.events.emit({ type: 'subtitles.updated' })
      },
    },

    announcements: {
      /** The live announcements this user should see, not yet dismissed or acknowledged. */
      active: () => {
        const seen = state.seen[me().id] ?? []
        return state.announcements
          .filter((a) => a.status === 'live' && visible(a))
          .map((a) => ({ ...a, seen: seen.includes(a.id) }))
      },
      dismiss: (id: string) => {
        const u = me().id
        state.seen[u] = [...(state.seen[u] ?? []), id]
        srv.events.emit({ type: 'announcements.updated' })
      },
    },

    dashboard: {
      layout: (): WidgetLayout => {
        const u = me()
        const own = storage.load(layoutKey(`user:${u.id}`)) as WidgetPlacement[] | undefined
        return {
          scope: { kind: 'user', userId: u.id },
          widgets: (own ?? layoutFor(u.role)).filter((w) => allowed(w.kind, u.role)).map(normalize),
          updatedAt: iso(now()),
          inherited: !own,
        }
      },
      saveLayout: (widgets: WidgetPlacement[]) => {
        const u = me()
        for (const w of widgets) if (!allowed(w.kind, u.role)) throw forbidden()
        storage.save(layoutKey(`user:${u.id}`), widgets)
        srv.events.emit({ type: 'layout.updated' })
      },
      /** Forgets the user's own layout, so they see their role's default again. */
      resetLayout: () => {
        storage.save(layoutKey(`user:${me().id}`), undefined)
        srv.events.emit({ type: 'layout.updated' })
      },
      roleDefault: (role: UserRole) => layoutFor(role),
      saveRoleDefault: (role: UserRole, widgets: WidgetPlacement[]) => {
        if (me().role !== 'owner') throw forbidden()
        storage.save(
          layoutKey(`role:${role}`),
          widgets.filter((w) => allowed(w.kind, role)),
        )
        srv.events.emit({ type: 'layout.updated' })
      },
    },

    users: {
      list: () => {
        requireStaff()
        return state.users
      },
    },

    devices: {
      list: () => {
        requireStaff()
        return state.devices
      },
    },
  }
}

export type Api = ReturnType<typeof createApi>
