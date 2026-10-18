// SPDX-License-Identifier: AGPL-3.0-only
// An in-memory highsea server: state, the handlers behind each API call, and a simulation driven by
// the clock. Screens never touch this directly; they go through the client (client.ts).
import { type Clock, createEmitter, createRandom, type Emitter, iso } from './clock.ts'
import { MB, type ServerState, seed } from './seed.ts'
import type {
  Announcement,
  HardlinkCheck,
  MediaFile,
  MediaItem,
  QueueItem,
  SetupInput,
  SignInResult,
  SubtitleStats,
  Torrent,
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
      setItemStatus(next.itemId, 'downloading')
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
        importTorrent(t, m, now)
        state.pipeline.push({
          ...p,
          stage: 'subtitle-search',
          until: now + SUBTITLE_SEARCH_SECONDS * 1000,
        })
        queueChanged = torrentsChanged = true
        events.emit({ type: 'item.updated', id: m.id })
      } else if (p.stage === 'subtitle-search') {
        const f = fileFor(m)
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
          addHistory(m, 'subtitle-downloaded', 'English subtitles from OpenSubtitles (score 96)')
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

  function setItemStatus(id: string | null, status: MediaItem['status']) {
    const m = state.items.find((x) => x.id === id)
    if (m) m.status = status
  }

  function fileFor(m: MediaItem): MediaFile | undefined {
    const v = [...m.versions].reverse().find((x) => x.fileId)
    return state.files.find((f) => f.id === v?.fileId)
  }

  function importTorrent(t: Torrent, m: MediaItem, now: number) {
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
    addHistory(m, 'imported', `Hardlinked to ${m.path}`, t)
  }

  function addHistory(
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

  const unsubscribe = clock.onAdvance((dt) => step(dt))
  return { kind, state, clock, events, step, dispose: unsubscribe }
}

// ---------------------------------------------------------------- the API

export type Ctx = { userId: string; storage?: Storage }

/**
 * The handlers behind each API call, grouped as @highsea/sdk will group them. Each returns plain
 * data; the client makes them async and applies the toolbar's data state.
 */
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
    },

    queue: {
      list: () => state.torrents.filter((t) => t.itemId && t.state !== 'completed').map(queueItem),
    },

    downloads: {
      list: () => {
        requireStaff()
        return state.torrents
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
