// SPDX-License-Identifier: AGPL-3.0-only
// The engine behind `TorrentEngine` (ADR 0005, ADR 0037): every session, the one listening port for
// TCP and the DHT, the global limits, the download queue, fast resume and the network binding.
// Nothing here opens a socket itself; the socket factory does, bound to what `@highsea/vpn` hands
// over, and when the binding goes every torrent's networking stops at once.
import type net from 'node:net'
import { AppError, type Clock, type Logger, newId, systemClock } from '@highsea/core'
import { type Db, readSetting, schema, writeSetting } from '@highsea/db'
import Wire from 'bittorrent-protocol'
import { asc, eq } from 'drizzle-orm'
import { DEFAULT_BOOTSTRAP, type Dht, startDht } from './dht.ts'
import { createBucket } from './limits.ts'
import type { Metainfo } from './metainfo.ts'
import { parseInfo, parseMagnet, parseTorrentFile, toMagnet } from './metainfo.ts'
import type { Binding, SocketRecord } from './sockets.ts'
import { createSocketFactory } from './sockets.ts'
import type { Priority } from './storage.ts'
import type { PeerInfo, SeedRule, Session, SessionStats } from './torrent.ts'
import { createSession } from './torrent.ts'
import { newPeerId } from './trackers.ts'

const { torrents, torrentFiles, torrentResume } = schema

export type Limits = {
  /** Bytes per second; 0 is unlimited. */
  downloadRate: number
  uploadRate: number
  /** Torrents downloading at once; the rest wait as queued. */
  maxActive: number
  /** Peer connections across every torrent. */
  maxConnections: number
}

export const DEFAULT_LIMITS: Limits = {
  downloadRate: 0,
  uploadRate: 0,
  maxActive: 3,
  maxConnections: 200,
}

/** 6881 for TCP and the DHT, as the roadmap, the Dockerfile and ADR 0020 say. */
export const DEFAULT_PORT = 6881

export type EngineEvent =
  | { type: 'changed'; ids: string[] }
  | { type: 'metadata'; id: string }
  | { type: 'finished'; id: string }
  | { type: 'seeded'; id: string }
  | { type: 'refused'; id: string; reason: string }
  | { type: 'network'; up: boolean }

export type AddInput = {
  /** A `.torrent` file's bytes, or a magnet link. */
  source: { torrent: Uint8Array } | { magnet: string }
  savePath: string
  category: string
  manual?: boolean
  paused?: boolean
  rule?: SeedRule
  priorities?: Priority[]
}

export type TorrentSnapshot = SessionStats & {
  id: string
  infoHash: string
  category: string
  savePath: string
  manual: boolean
  addedAt: number
  rule: SeedRule
  private: boolean
  sequential: boolean
  /** The queue position: lower starts first. */
  position: number
}

export type EngineStatus = {
  up: boolean
  port: number
  listening: boolean
  binding: Binding | null
  /** Why the listener or the DHT couldn't start, in plain words. */
  problem: string | null
  downRate: number
  upRate: number
  dhtNodes: number
  connections: number
}

const NO_RULE: SeedRule = { ratio: null, minutes: null, minMinutes: null }
const RESUME_EVERY_MS = 30_000
const CHANGE_EVERY_MS = 1_000
const DHT_KEY = 'torrentDht'

export type TorrentEngine = ReturnType<typeof createTorrentEngine>

export function createTorrentEngine(options: {
  db: Db
  logger: Logger
  /** SHA-1 of a piece, in the worker pool. */
  hash(data: Uint8Array): Promise<string>
  /** Looks at a torrent's files before anything downloads: a reason to refuse, or null. */
  vet?(files: Metainfo['files']): string | null
  port?: number
  limits?: Partial<Limits>
  /** Off for tests and private-only setups. `bootstrap` defaults to the public routers. */
  dht?: { enabled: boolean; bootstrap?: string[] }
  clock?: Clock
  audit?: (r: SocketRecord) => void
  emit?: (event: EngineEvent) => void
}) {
  const { db } = options
  const clock = options.clock ?? systemClock
  const log = options.logger.child('torrent')
  const sockets = createSocketFactory({ audit: options.audit })
  const peerId = newPeerId()
  const key = Math.floor(Math.random() * 0xffffffff)
  const down = createBucket()
  const up = createBucket()
  let limits: Limits = { ...DEFAULT_LIMITS, ...options.limits }
  down.setRate(limits.downloadRate)
  up.setRate(limits.uploadRate)
  let port = options.port ?? DEFAULT_PORT
  const sessions = new Map<string, Session>()
  const byHash = new Map<string, Session>()
  let server: net.Server | null = null
  let dht: Dht | null = null
  // bumped by goOffline: a goOnline still awaiting its listener or the DHT (which resolves the
  // bootstrap names first) sees it went stale and stops what it started
  let generation = 0
  let problem: string | null = null
  let started = false
  let closing = false
  const checkQueue: string[] = []
  let checking = false
  const changed = new Set<string>()
  let changeTimer: ReturnType<typeof setTimeout> | null = null
  let resumeTimer: ReturnType<typeof setInterval> | null = null
  const emit = (e: EngineEvent) => {
    try {
      options.emit?.(e)
    } catch (err) {
      log.warn('An engine listener failed.', { error: String(err) })
    }
  }

  const flushChanges = () => {
    changeTimer = null
    if (!changed.size) return
    const ids = [...changed]
    changed.clear()
    emit({ type: 'changed', ids })
  }

  const markChanged = (id: string) => {
    changed.add(id)
    if (!changeTimer) {
      changeTimer = setTimeout(flushChanges, CHANGE_EVERY_MS)
      changeTimer.unref?.()
    }
  }

  const row = (id: string) => db.select().from(torrents).where(eq(torrents.id, id)).get()

  const ruleOf = (r: typeof torrents.$inferSelect): SeedRule => ({
    ratio: r.seedRatio,
    minutes: r.seedMinutes,
    minMinutes: r.minSeedMinutes,
  })

  const connections = () => {
    let n = 0
    for (const s of sessions.values()) n += s.connections()
    return n
  }

  const writeFiles = (id: string, m: Metainfo, priorities: Priority[]) => {
    db.delete(torrentFiles).where(eq(torrentFiles.torrentId, id)).run()
    if (m.files.length)
      db.insert(torrentFiles)
        .values(
          m.files.map((f, i) => ({
            torrentId: id,
            index: i,
            path: f.path,
            size: f.length,
            priority: priorities[i] ?? 'normal',
          })),
        )
        .run()
  }

  /** Writes a session's fast-resume data and totals. Safe to repeat. */
  const persist = async (s: Session) => {
    const r = await s.resume()
    if (!sessions.has(s.id)) return
    db.update(torrents)
      .set({
        uploaded: r.uploaded,
        downloaded: r.downloaded,
        seedingMs: r.seedingMs,
        completedAt: r.completedAt,
      })
      .where(eq(torrents.id, s.id))
      .run()
    if (!r.have) return
    // pieces still being assembled aren't on disk yet: they're left out and fetched again
    db.insert(torrentResume)
      .values({
        torrentId: s.id,
        bitfield: Buffer.from(r.have),
        files: r.files,
        updatedAt: clock.now(),
      })
      .onConflictDoUpdate({
        target: torrentResume.torrentId,
        set: { bitfield: Buffer.from(r.have), files: r.files, updatedAt: clock.now() },
      })
      .run()
  }

  const persistAll = async () => {
    for (const s of sessions.values())
      await persist(s).catch((e) =>
        log.warn('Resume data couldn’t be written.', { id: s.id, error: String(e) }),
      )
  }

  /** Runs the checks waiting, one at a time. */
  const runChecks = async () => {
    if (checking) return
    checking = true
    try {
      while (checkQueue.length && !closing) {
        const id = checkQueue.shift() as string
        const s = sessions.get(id)
        if (!s) continue
        await s.check()
        await persist(s)
        schedule()
      }
    } finally {
      checking = false
    }
  }

  const queueCheck = (id: string) => {
    if (!checkQueue.includes(id)) checkQueue.push(id)
    void runChecks()
  }

  /**
   * Who runs: seeding torrents always, downloading ones in queue order up to the limit, nothing
   * while the network is down.
   */
  const schedule = () => {
    if (!started || closing) return
    const rows = db.select().from(torrents).orderBy(asc(torrents.position)).all()
    let active = 0
    for (const r of rows) {
      const s = sessions.get(r.id)
      if (!s) continue
      const st = s.state()
      if (st === 'checking' || checkQueue.includes(r.id)) continue
      if (st === 'error' || st === 'completed') continue
      if (r.intent === 'paused') {
        if (st !== 'paused') void s.stop('paused')
        continue
      }
      // resumed while there's no binding (the VPN is down): it waits as queued, not paused
      if (!sockets.up()) {
        if (st === 'paused') void s.stop('queued')
        continue
      }
      const finished = st === 'seeding' || s.complete()
      if (!finished) {
        if (active >= limits.maxActive) {
          if (s.running() || st !== 'queued') void s.stop('queued')
          continue
        }
        active++
      }
      if (!s.running()) s.start()
    }
  }

  const sessionFor = (
    r: typeof torrents.$inferSelect,
    files: Priority[] | null,
    have: Uint8Array | null,
  ) => {
    let m: Metainfo | null = null
    if (r.info) {
      try {
        m = parseInfo(new Uint8Array(r.info), r.trackers)
      } catch (e) {
        log.warn('A stored torrent couldn’t be read.', { id: r.id, error: String(e) })
      }
    }
    const magnet = r.magnet ? parseMagnet(r.magnet) : null
    const s = createSession(
      {
        id: r.id,
        infoHash: r.infoHash,
        metainfo: m,
        magnet,
        savePath: r.savePath,
        priorities: files,
        sequential: r.sequential,
        have,
        downloaded: r.downloaded,
        uploaded: r.uploaded,
        completedAt: r.completedAt,
        seedingMs: r.seedingMs,
        rule: ruleOf(r),
      },
      {
        sockets,
        peerId,
        port: () => port,
        key,
        down,
        up,
        hash: options.hash,
        vet: (fs) => {
          const reason = options.vet?.(fs) ?? null
          if (reason) {
            db.update(torrents).set({ error: reason }).where(eq(torrents.id, r.id)).run()
            queueMicrotask(() => emit({ type: 'refused', id: r.id, reason }))
          }
          return reason
        },
        dhtLookup: (h) => dht?.lookup(h),
        dhtAnnounce: (h) => dht?.announce(h, port),
        connectionsFree: () => limits.maxConnections - connections(),
        changed: () => markChanged(r.id),
        gotMetadata: (meta) => {
          db.update(torrents)
            .set({ info: Buffer.from(meta.info), name: meta.name, private: meta.private })
            .where(eq(torrents.id, r.id))
            .run()
          writeFiles(r.id, meta, s.priorities())
          emit({ type: 'metadata', id: r.id })
        },
        finished: () => {
          void persist(s)
          emit({ type: 'finished', id: r.id })
          queueMicrotask(schedule)
        },
        seeded: () => {
          db.update(torrents).set({ seededAt: clock.now() }).where(eq(torrents.id, r.id)).run()
          void persist(s)
          emit({ type: 'seeded', id: r.id })
          queueMicrotask(schedule)
        },
        log: (level, message, fields) => log[level](message, { id: r.id, ...fields }),
      },
    )
    if (r.error) s.refuse(r.error)
    sessions.set(r.id, s)
    byHash.set(r.infoHash, s)
    return s
  }

  // --- the network -----------------------------------------------------------------------------

  const accept = (socket: net.Socket) => {
    sockets.accepted(socket)
    socket.on('error', () => {})
    const wire = new Wire()
    socket.pipe(wire).pipe(socket)
    const timer = setTimeout(() => wire.destroy(), 25_000)
    timer.unref?.()
    wire.on('error', () => wire.destroy())
    wire.once('close', () => {
      clearTimeout(timer)
      socket.destroy()
    })
    wire.once('handshake', (hash: string) => {
      clearTimeout(timer)
      const s = byHash.get(hash)
      if (!s) {
        wire.destroy()
        return
      }
      s.adopt(wire, socket)
    })
  }

  const goOnline = async () => {
    const mine = generation
    problem = null
    try {
      server = await sockets.listen(port)
      server.on('connection', accept)
      server.on('error', (e) => log.warn('The torrent listener failed.', { error: String(e) }))
    } catch (e) {
      problem = `highsea couldn’t listen on port ${port}: ${(e as Error).message}`
      log.warn(problem)
    }
    if (options.dht?.enabled !== false && options.dht) {
      try {
        const node = await startDht({
          sockets,
          port,
          bootstrap: options.dht.bootstrap ?? DEFAULT_BOOTSTRAP,
          nodes: readSetting<{ nodes: string[] }>(db, DHT_KEY, { nodes: [] }).nodes,
          onPeer: (hash, address) => byHash.get(hash)?.addPeers([address]),
          current: () => mine === generation,
        })
        if (!node || mine !== generation) {
          await node?.destroy().catch(() => {})
          return
        }
        dht = node
      } catch (e) {
        problem ??= `The DHT couldn’t start on port ${port}: ${(e as Error).message}`
        log.warn('The DHT couldn’t start.', { error: String(e) })
      }
    }
    schedule()
  }

  const goOffline = async () => {
    generation++
    if (dht) {
      const nodes = dht.saved()
      if (nodes.length) writeSetting(db, DHT_KEY, { nodes: nodes.slice(0, 200) }, clock.now())
      const d = dht
      dht = null
      await d.destroy().catch(() => {})
    }
    for (const s of sessions.values()) s.offline()
    server = null
  }

  const engine = {
    /** Loads every torrent, trusts fast resume where the files match, and checks the rest. */
    async start() {
      if (started) return
      started = true
      const rows = db.select().from(torrents).orderBy(asc(torrents.position)).all()
      for (const r of rows) {
        const files = db
          .select()
          .from(torrentFiles)
          .where(eq(torrentFiles.torrentId, r.id))
          .orderBy(asc(torrentFiles.index))
          .all()
        const resume = db
          .select()
          .from(torrentResume)
          .where(eq(torrentResume.torrentId, r.id))
          .get()
        const s = sessionFor(
          r,
          files.length ? files.map((f) => f.priority) : null,
          resume ? new Uint8Array(resume.bitfield) : null,
        )
        if (r.seededAt) continue
        if (!s.metainfo()) continue
        if (resume) {
          if (!(await s.resumable(resume.files))) {
            log.info('A torrent’s files changed since it stopped: checking it again.', { id: r.id })
            queueCheck(r.id)
          }
        } else if ((await s.storage()?.fileStats())?.some((f) => f !== null)) queueCheck(r.id)
      }
      resumeTimer = setInterval(() => void persistAll(), RESUME_EVERY_MS)
      resumeTimer.unref?.()
      schedule()
    },

    /**
     * Where torrent traffic goes, from `@highsea/vpn`. Null stops every torrent's networking at
     * once: the listener, the peers, the trackers and the DHT. A new binding starts them again.
     */
    async setBinding(next: Binding | null) {
      const was = sockets.binding()
      if (was && next && was.address === next.address && was.dns.join() === next.dns.join()) return
      sockets.rebind(next)
      await goOffline()
      if (next && !closing) await goOnline()
      emit({ type: 'network', up: next !== null })
    },

    async setPort(next: number) {
      if (next === port) return
      port = next
      const b = sockets.binding()
      if (!b) return
      sockets.rebind(b)
      await goOffline()
      await goOnline()
      for (const s of sessions.values()) s.reannounce()
    },

    setLimits(next: Partial<Limits>) {
      limits = { ...limits, ...next }
      down.setRate(limits.downloadRate)
      up.setRate(limits.uploadRate)
      schedule()
    },

    limits: () => limits,

    async add(input: AddInput): Promise<{ id: string; infoHash: string; existing: boolean }> {
      let infoHash: string
      let m: Metainfo | null = null
      let magnet: string | null = null
      let name: string
      let trackers: string[][]
      if ('torrent' in input.source) {
        m = parseTorrentFile(input.source.torrent)
        infoHash = m.infoHash
        name = m.name
        trackers = m.trackers
      } else {
        const mg = parseMagnet(input.source.magnet)
        infoHash = mg.infoHash
        name = mg.name ?? mg.infoHash
        trackers = mg.trackers
        magnet = toMagnet(mg)
      }
      const existing = db.select().from(torrents).where(eq(torrents.infoHash, infoHash)).get()
      if (existing) return { id: existing.id, infoHash, existing: true }
      const id = newId('tor')
      const last = db
        .select({ p: torrents.position })
        .from(torrents)
        .orderBy(asc(torrents.position))
        .all()
      const position = last.length ? Math.max(...last.map((x) => x.p)) + 1 : 0
      const rule = input.rule ?? NO_RULE
      const priorities = m ? m.files.map((_, i) => input.priorities?.[i] ?? 'normal') : []
      db.insert(torrents)
        .values({
          id,
          infoHash,
          name,
          info: m ? Buffer.from(m.info) : null,
          trackers,
          magnet,
          savePath: input.savePath,
          category: input.category,
          intent: input.paused ? 'paused' : 'active',
          private: m?.private ?? false,
          manual: input.manual ?? false,
          position,
          seedRatio: rule.ratio,
          seedMinutes: rule.minutes,
          minSeedMinutes: rule.minMinutes,
          addedAt: clock.now(),
        })
        .run()
      if (m) writeFiles(id, m, priorities)
      const r = row(id) as typeof torrents.$inferSelect
      const s = sessionFor(r, m ? priorities : null, null)
      if (m) {
        const reason = options.vet?.(m.files) ?? null
        if (reason) {
          db.update(torrents).set({ error: reason }).where(eq(torrents.id, id)).run()
          s.refuse(reason)
          queueMicrotask(() => emit({ type: 'refused', id, reason }))
          return { id, infoHash, existing: false }
        }
        // data already in the save folder (a re-add, or files moved in): check what's there
        if ((await s.storage()?.fileStats())?.some((f) => f !== null)) queueCheck(id)
      }
      markChanged(id)
      schedule()
      return { id, infoHash, existing: false }
    },

    /** Removes a torrent, and its files with `deleteData`. */
    async remove(id: string, deleteData: boolean) {
      const s = sessions.get(id)
      if (!s) throw new AppError('not-found', 'That torrent isn’t in the list any more.')
      sessions.delete(id)
      byHash.delete(s.infoHash)
      const i = checkQueue.indexOf(id)
      if (i >= 0) checkQueue.splice(i, 1)
      if (deleteData) await s.removeData()
      else await s.close(true)
      db.delete(torrents).where(eq(torrents.id, id)).run()
      markChanged(id)
      schedule()
    },

    pause(id: string) {
      engine.get(id)
      db.update(torrents).set({ intent: 'paused' }).where(eq(torrents.id, id)).run()
      schedule()
    },

    resume(id: string) {
      const s = sessions.get(id)
      if (!s) throw new AppError('not-found', 'That torrent isn’t in the list any more.')
      db.update(torrents).set({ intent: 'active', error: null }).where(eq(torrents.id, id)).run()
      if (s.state() === 'error') s.clearError()
      schedule()
    },

    recheck(id: string) {
      engine.get(id)
      queueCheck(id)
    },

    reannounce(id: string) {
      sessions.get(id)?.reannounce()
    },

    setPriorities(id: string, priorities: Priority[]) {
      const s = sessions.get(id)
      const m = s?.metainfo()
      if (!s || !m) throw new AppError('not-found', 'That torrent’s files aren’t known yet.')
      s.setPriorities(priorities)
      writeFiles(id, m, s.priorities())
      schedule()
    },

    setRule(id: string, rule: SeedRule) {
      const s = sessions.get(id)
      if (!s) throw new AppError('not-found', 'That torrent isn’t in the list any more.')
      s.setRule(rule)
      db.update(torrents)
        .set({ seedRatio: rule.ratio, seedMinutes: rule.minutes, minSeedMinutes: rule.minMinutes })
        .where(eq(torrents.id, id))
        .run()
    },

    setSequential(id: string, on: boolean) {
      sessions.get(id)?.setSequential(on)
      db.update(torrents).set({ sequential: on }).where(eq(torrents.id, id)).run()
    },

    /** Moves a torrent in the queue: to the top or the bottom. */
    move(id: string, to: 'top' | 'bottom') {
      const all = db.select({ id: torrents.id, p: torrents.position }).from(torrents).all()
      if (!all.some((r) => r.id === id))
        throw new AppError('not-found', 'That torrent isn’t in the list any more.')
      const ps = all.map((r) => r.p)
      const p = to === 'top' ? Math.min(...ps) - 1 : Math.max(...ps) + 1
      db.update(torrents).set({ position: p }).where(eq(torrents.id, id)).run()
      markChanged(id)
      schedule()
    },

    has: (id: string) => sessions.has(id),
    idOf: (infoHash: string) => byHash.get(infoHash.toLowerCase())?.id ?? null,

    get(id: string): TorrentSnapshot {
      const s = sessions.get(id)
      const r = row(id)
      if (!s || !r) throw new AppError('not-found', 'That torrent isn’t in the list any more.')
      return {
        ...s.stats(),
        id,
        infoHash: r.infoHash,
        category: r.category,
        savePath: r.savePath,
        manual: r.manual,
        addedAt: r.addedAt,
        rule: ruleOf(r),
        private: s.metainfo()?.private ?? r.private,
        sequential: r.sequential,
        position: r.position,
      }
    },

    list(): TorrentSnapshot[] {
      return db
        .select({ id: torrents.id })
        .from(torrents)
        .orderBy(asc(torrents.position))
        .all()
        .filter((r) => sessions.has(r.id))
        .map((r) => engine.get(r.id))
    },

    peers(id: string): PeerInfo[] {
      const s = sessions.get(id)
      if (!s) throw new AppError('not-found', 'That torrent isn’t in the list any more.')
      return s.peers()
    },

    /** The `.torrent` (or the magnet's metadata once known), for the files' paths and pieces. */
    metainfo: (id: string) => sessions.get(id)?.metainfo() ?? null,

    status(): EngineStatus {
      let downRate = 0
      let upRate = 0
      for (const s of sessions.values()) {
        const st = s.stats()
        downRate += st.downRate
        upRate += st.upRate
      }
      return {
        up: sockets.up(),
        port,
        listening: server?.listening ?? false,
        binding: sockets.binding(),
        problem,
        downRate,
        upRate,
        dhtNodes: dht?.nodes() ?? 0,
        connections: connections(),
      }
    },

    /**
     * Shutdown (parent plan, The server process): resume data for every torrent, `stopped` to the
     * trackers within a short deadline, then every socket closed.
     */
    async close() {
      if (closing) return
      closing = true
      if (resumeTimer) clearInterval(resumeTimer)
      if (changeTimer) clearTimeout(changeTimer)
      await persistAll()
      await Promise.all([...sessions.values()].map((s) => s.close(true).catch(() => {})))
      await goOffline()
      sockets.rebind(null)
      down.flush()
      up.flush()
    },
  }
  return engine
}
