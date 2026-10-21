// SPDX-License-Identifier: AGPL-3.0-only
// One torrent's session: its peers over the peer wire protocol (BEP 3, with the Fast extension of
// BEP 6 and the extension protocol of BEP 10), the blocks it asks for, the pieces it verifies and
// writes, whom it uploads to, and its trackers. The engine (engine.ts) owns sessions, sockets,
// limits and persistence; a session only uses what it's handed in its context.
import bencode from 'bencode'
import Wire from 'bittorrent-protocol'
import utMetadata from 'ut_metadata'
import utPex from 'ut_pex'
import { Bitfield } from './bitfield.ts'
import type { Bucket } from './limits.ts'
import { createMeter } from './limits.ts'
import type { Magnet, Metainfo } from './metainfo.ts'
import { parseInfo, pieceSize } from './metainfo.ts'
import type { Attempt, EncryptionPolicy, Method } from './mse.ts'
import { firstAttempt, nextAttempt, secureOutgoing } from './mse.ts'
import type { BlockRef, Picker } from './picker.ts'
import { BLOCK, createPicker } from './picker.ts'
import type { PeerSocket, SocketFactory } from './sockets.ts'
import { addressKey, familyOf, Unbound } from './sockets.ts'
import type { Priority, Storage } from './storage.ts'
import { createStorage } from './storage.ts'
import type { AnnounceEvent, TrackerStatus } from './trackers.ts'
import { announce, createTrackerSet } from './trackers.ts'

/** The engine's states, as the prototype's `TorrentState` less what belongs to `downloads`. */
export type EngineState =
  | 'checking'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'seeding'
  | 'completed'
  | 'error'

export type SeedRule = {
  /** Stop seeding at this ratio; null for no ratio limit. */
  ratio: number | null
  /** Stop seeding after this many minutes; null for no time limit. */
  minutes: number | null
  /** Never stop before this many minutes of seeding: private trackers' hit-and-run rule. */
  minMinutes: number | null
}

/** What the engine hands each session. */
export type SessionContext = {
  sockets: SocketFactory
  peerId: Uint8Array
  /** The port the listener is on, for announces. */
  port(): number
  /** A key the trackers can tell this client by across address changes (BEP 7's `key`). */
  key: number
  down: Bucket
  up: Bucket
  /** SHA-1 of a piece, in the worker pool. */
  hash(data: Uint8Array): Promise<string>
  /** Looks at the file list before anything downloads: a reason to refuse it, or null. */
  vet(files: Metainfo['files']): string | null
  /** Asks the DHT for peers; they arrive through `addPeers`. Public torrents only. */
  dhtLookup(infoHash: string): void
  dhtAnnounce(infoHash: string): void
  /**
   * A uTP connection to a peer (BEP 29), or null when uTP is off or there's no UDP socket for the
   * peer's family: the session connects over TCP then.
   */
  utp(host: string, port: number): PeerSocket | null
  /** Peer connections allowed for this torrent now, against the engine's overall limit. */
  connectionsFree(): number
  /** Something visible changed: state, progress, peers, trackers. The engine throttles it. */
  changed(): void
  /** The metadata arrived for a magnet. */
  gotMetadata(m: Metainfo): void
  /** Every wanted piece is in. */
  finished(): void
  /** The seeding rule was met. */
  seeded(): void
  log(level: 'debug' | 'info' | 'warn', message: string, fields?: Record<string, unknown>): void
  /** Settings › Download client's encryption (6b): how outgoing connections open. */
  encryption?(): EncryptionPolicy
  /** On the IP blocklist (6b): never connected to, whatever source named it. */
  blocked?(host: string): boolean
}

export type SessionInit = {
  id: string
  infoHash: string
  metainfo: Metainfo | null
  magnet: Magnet | null
  savePath: string
  priorities: Priority[] | null
  sequential: boolean
  /** Verified pieces from fast resume, or null to check (or start empty). */
  have: Uint8Array | null
  downloaded: number
  uploaded: number
  /** When it first finished, in ms since the epoch. */
  completedAt: number | null
  /** Seeding time so far, in ms. */
  seedingMs: number
  rule: SeedRule
}

export type PeerInfo = {
  address: string
  client: string
  progress: number
  downRate: number
  upRate: number
  /**
   * Short flags as qBittorrent shows them: D downloading, U uploading, I incoming, X from PEX,
   * P over uTP.
   */
  flags: string
}

export type SessionStats = {
  state: EngineState
  hasMetadata: boolean
  name: string
  size: number
  progress: number
  downloaded: number
  uploaded: number
  downRate: number
  upRate: number
  eta: number | null
  ratio: number
  peers: { connected: number; total: number }
  seeds: { connected: number; total: number }
  files: { path: string; size: number; progress: number; priority: Priority }[]
  trackers: TrackerStatus[]
  /** When data last arrived, ms since the epoch; null if never. */
  lastDataAt: number | null
  completedAt: number | null
  seedingMs: number
  message: string | null
  checkProgress: number | null
}

/** Unchoke slots, plus one optimistic, as clients have used since BEP 3's day. */
const UPLOAD_SLOTS = 3
const RECHOKE_MS = 10_000
/** The optimistic unchoke turns over every third rechoke: 30 seconds. */
const OPTIMISTIC_EVERY = 3
const CONNECT_MS = 1_000
const HALF_OPEN = 8
const HANDSHAKE_MS = 25_000
/** A request unanswered this long drops the peer, as WebTorrent and libtorrent do. */
const REQUEST_TIMEOUT_MS = 60_000
/** A peer that sent this many pieces' worth of bad data is banned. */
const BAN_SHARE = 2
const MAX_PEERS = 50
const DHT_EVERY_MS = 15 * 60_000
const NUM_WANT = 50
const STOPPED_DEADLINE_MS = 5_000

type Peer = {
  key: string
  host: string
  port: number
  outgoing: boolean
  fromPex: boolean
  wire: Wire
  socket: PeerSocket
  transport: 'tcp' | 'utp'
  requests: Map<string, BlockRef>
  down: ReturnType<typeof createMeter>
  up: ReturnType<typeof createMeter>
  handshaked: boolean
  /** How the connection is encrypted (6b): qBittorrent's E and e flags. */
  method: Method
  has(piece: number): boolean
}

const blockKey = (b: BlockRef) => `${b.piece}:${b.offset}`

/** A peer id's client, from Azureus-style ids (`-qB4630-`): the letters and version. */
export function clientOf(peerId: string | null): string {
  if (!peerId) return 'Unknown'
  const id = Buffer.from(peerId, 'hex').toString('latin1')
  const m = /^-([A-Za-z]{2})([0-9A-Za-z]{4})-/.exec(id)
  if (!m) return 'Unknown'
  const names: Record<string, string> = {
    qB: 'qBittorrent',
    TR: 'Transmission',
    DE: 'Deluge',
    lt: 'libtorrent',
    LT: 'libtorrent',
    UT: 'µTorrent',
    WW: 'WebTorrent',
    HS: 'highsea',
    AZ: 'Vuze',
    BI: 'BiglyBT',
  }
  const v = (m[2] as string).replace(/0+$/, '').split('').join('.')
  return `${names[m[1] as string] ?? m[1]} ${v}`.trim()
}

export type Session = ReturnType<typeof createSession>

export function createSession(init: SessionInit, ctx: SessionContext) {
  const infoHash = init.infoHash
  let metainfo: Metainfo | null = init.metainfo
  let priorities: Priority[] = init.priorities ?? []
  let sequential = init.sequential
  let state: EngineState = 'queued'
  let message: string | null = null
  let running = false
  let downloaded = init.downloaded
  let uploaded = init.uploaded
  let completedAt = init.completedAt
  let seedingMs = init.seedingMs
  let seedingSince: number | null = null
  let lastDataAt: number | null = null
  let checkProgress: number | null = null
  let rule = init.rule
  let have: Bitfield | null = null
  let picker: Picker | null = null
  let storage: Storage | null = null
  const down = createMeter()
  const up = createMeter()
  const peers = new Map<string, Peer>()
  /** Addresses heard of, with when to try each next. */
  // `attempt`: the next way to open a connection, when the first failed (MSE's fallback, 6b).
  // `utp` false: the last uTP attempt failed, so the next goes over TCP (libtorrent's
  // `supports_utp`, cleared on a failed uTP connect: torrent.cpp `connect_to_peer`, RC_2_0)
  const candidates = new Map<
    string,
    { next: number; fails: number; pex: boolean; utp: boolean | null; attempt?: Attempt }
  >()
  const policy = (): EncryptionPolicy => ctx.encryption?.() ?? 'allow'
  const isBlocked = (host: string) => ctx.blocked?.(host) ?? false
  const banned = new Set<string>()
  const badShare = new Map<string, number>()
  let halfOpen = 0
  const timers: ReturnType<typeof setTimeout>[] = []
  let announceTimer: ReturnType<typeof setTimeout> | null = null
  let rechokes = 0
  let optimistic: string | null = null
  const trackers = createTrackerSet(metainfo?.trackers ?? init.magnet?.trackers ?? [])
  let completedAnnounced = init.completedAt !== null
  let fillTimer: ReturnType<typeof setTimeout> | null = null
  const isPrivate = () => metainfo?.private ?? false

  const wantedPiece = (p: number): number => {
    if (!metainfo || !storage) return 0
    let best = 0
    for (const s of storage.spans(p, 0, pieceSize(metainfo, p))) {
      const pr = priorities[s.file] ?? 'normal'
      best = Math.max(best, pr === 'high' ? 2 : pr === 'normal' ? 1 : 0)
    }
    return best
  }

  /** Bytes of wanted pieces still missing. */
  const left = (): number => {
    if (!metainfo || !have) return 0
    let n = 0
    for (let p = 0; p < metainfo.pieceCount; p++)
      if (!have.get(p) && wantedPiece(p) > 0) n += pieceSize(metainfo, p)
    return n
  }

  const allWantedIn = () => metainfo !== null && have !== null && left() === 0

  /** Builds storage, the bitfield and the picker once the metadata is known. */
  const prepare = (m: Metainfo, haveBytes: Uint8Array | null) => {
    metainfo = m
    if (priorities.length !== m.files.length) priorities = m.files.map(() => 'normal')
    storage = createStorage({ savePath: init.savePath, metainfo: m, priorities: () => priorities })
    have = new Bitfield(m.pieceCount, haveBytes ?? undefined)
    picker = createPicker(m, {
      have,
      priority: wantedPiece,
      sequential: () => sequential,
    })
  }

  if (metainfo) prepare(metainfo, init.have)

  // --- peers ---------------------------------------------------------------------------------

  const updateInterest = (peer: Peer) => {
    if (!picker) return
    if (picker.wants(peer)) {
      if (!peer.wire.amInterested) peer.wire.interested()
    } else if (peer.wire.amInterested) peer.wire.uninterested()
  }

  const scheduleFill = (ms: number) => {
    if (fillTimer) return
    fillTimer = setTimeout(() => {
      fillTimer = null
      for (const p of peers.values()) fill(p)
    }, ms)
    fillTimer.unref?.()
  }

  /** Requests in flight for a peer: about two seconds of what it's sending, between 4 and 250. */
  const depth = (peer: Peer) =>
    Math.max(4, Math.min(250, Math.ceil((peer.down.rate() * 2) / BLOCK)))

  const fill = (peer: Peer) => {
    if (!picker || !running || state !== 'downloading') return
    if (peer.wire.destroyed || peer.wire.peerChoking || !peer.wire.amInterested) return
    const room = depth(peer) - peer.requests.size
    if (room <= 0) return
    const blocks = picker.next(peer, room)
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i] as BlockRef
      if (!ctx.down.tryTake(b.length)) {
        for (const rest of blocks.slice(i)) picker.release(peer.key, rest)
        scheduleFill(100)
        return
      }
      peer.requests.set(blockKey(b), b)
      peer.wire.request(b.piece, b.offset, b.length, (err, data) => {
        peer.requests.delete(blockKey(b))
        if (err || !data) {
          picker?.release(peer.key, b)
          return
        }
        void onBlock(peer, b, data)
      })
    }
  }

  const onBlock = async (peer: Peer, b: BlockRef, data: Uint8Array) => {
    if (!picker || !metainfo || !have || !storage) return
    peer.down.add(data.length)
    down.add(data.length)
    lastDataAt = Date.now()
    const res = picker.arrived(peer.key, b.piece, b.offset, data)
    if (res)
      for (const k of res.cancel) {
        const other = peers.get(k)
        if (other?.requests.has(blockKey(b))) other.wire.cancel(b.piece, b.offset, b.length)
      }
    fill(peer)
    if (!res?.piece) return
    const piece = b.piece
    const bytes = res.piece
    const expected = Buffer.from(metainfo.pieces.subarray(piece * 20, piece * 20 + 20)).toString(
      'hex',
    )
    let ok: boolean
    try {
      ok = (await ctx.hash(bytes)) === expected
    } catch (e) {
      ctx.log('warn', 'A piece couldn’t be checked.', { infoHash, piece, error: String(e) })
      ok = false
    }
    if (!picker || !have || !storage) return
    if (!ok) {
      for (const [k, share] of picker.checked(piece, false)) {
        const total = (badShare.get(k) ?? 0) + share
        badShare.set(k, total)
        const p = peers.get(k)
        if (total >= BAN_SHARE && p) {
          banned.add(p.host)
          ctx.log('info', 'A peer sent bad data and was banned.', { infoHash, peer: p.host })
          p.wire.destroy()
        }
      }
      return
    }
    try {
      await storage.write(piece, bytes)
    } catch (e) {
      picker.checked(piece, false)
      fail(`highsea couldn’t write to ${init.savePath}: ${(e as Error).message}`)
      return
    }
    picker.checked(piece, true)
    have.set(piece)
    downloaded += bytes.length
    for (const p of peers.values()) {
      if (p.handshaked) p.wire.have(piece)
      if (p.wire.amInterested) updateInterest(p)
    }
    ctx.changed()
    if (allWantedIn()) finish()
  }

  const onRequest = (
    peer: Peer,
    index: number,
    offset: number,
    length: number,
    respond: (err: Error | null, data?: Uint8Array) => void,
  ) => {
    if (!have?.get(index) || !storage || length > BLOCK * 2 || length <= 0) {
      respond(new Error('Not available.'))
      return
    }
    void ctx.up
      .take(length)
      .then(() => {
        if (peer.wire.destroyed || peer.wire.amChoking) throw new Error('Choked.')
        return (storage as Storage).read(index, offset, length)
      })
      .then((data) => {
        peer.up.add(data.length)
        up.add(data.length)
        uploaded += data.length
        respond(null, data)
      })
      .catch((e: Error) => respond(e))
  }

  const removePeer = (peer: Peer) => {
    if (peers.get(peer.key) !== peer) return
    peers.delete(peer.key)
    if (picker && peer.handshaked) picker.removePeer(peer.has)
    picker?.dropPeer(peer.key)
    peer.requests.clear()
    peer.wire.ut_pex?.reset()
    if (peer.outgoing) for (const p of peers.values()) pexDrop(p.wire, peer)
    if (optimistic === peer.key) optimistic = null
    ctx.changed()
  }

  /** BEP 11: an IPv6 peer goes in `added6`, a uTP one with its flag (0x04). */
  const pexAdd = (wire: Wire, p: Peer) => {
    const flags = { supportsUtp: p.transport === 'utp' }
    if (familyOf(p.host) === 6) wire.ut_pex?.addPeer6(p.key, flags)
    else wire.ut_pex?.addPeer(p.key, flags)
  }
  const pexDrop = (wire: Wire, p: Peer) => {
    if (familyOf(p.host) === 6) wire.ut_pex?.dropPeer6(p.key)
    else wire.ut_pex?.dropPeer(p.key)
  }

  /** Sets up a wire whose socket is connected: extensions, events, and our handshake. */
  const attach = (
    wire: Wire,
    socket: PeerSocket,
    host: string,
    port: number,
    outgoing: boolean,
    method: Method = 'plain',
    transport: 'tcp' | 'utp' = 'tcp',
  ) => {
    const key = addressKey(host, port)
    const peer: Peer = {
      key,
      host,
      port,
      outgoing,
      fromPex: candidates.get(key)?.pex ?? false,
      wire,
      socket,
      transport,
      requests: new Map(),
      down: createMeter(),
      up: createMeter(),
      handshaked: false,
      method,
      has: (p) => wire.peerPieces.get(p),
    }
    peers.set(key, peer)
    wire.use(utMetadata(metainfo?.info))
    if (!isPrivate()) wire.use(utPex())
    wire.setKeepAlive(true)
    wire.setTimeout(REQUEST_TIMEOUT_MS, true)

    const handshakeTimer = setTimeout(() => wire.destroy(), HANDSHAKE_MS)
    handshakeTimer.unref?.()
    const close = () => {
      clearTimeout(handshakeTimer)
      removePeer(peer)
      if (!socket.destroyed) socket.destroy()
      if (!wire.destroyed) wire.destroy()
    }
    socket.once('close', close)
    socket.on('error', () => {})
    wire.once('close', close)
    wire.on('error', () => wire.destroy())
    wire.on('timeout', () => wire.destroy())

    const onPeerPieces = () => {
      if (!picker) return
      picker.addPeer(peer.has)
      updateInterest(peer)
      fill(peer)
      ctx.changed()
    }
    wire.once('handshake', (hash: string, peerId: string) => {
      clearTimeout(handshakeTimer)
      if (hash !== infoHash || peerId === Buffer.from(ctx.peerId).toString('hex')) {
        wire.destroy()
        return
      }
      for (const [k, p] of peers)
        if (k !== key && p.wire.peerId === peerId) {
          // the same peer twice (both connected at once): keep the first
          wire.destroy()
          return
        }
      peer.handshaked = true
      // an incoming wire hears the handshake before we've sent ours
      if (!outgoing) wire.handshake(infoHash, Buffer.from(ctx.peerId).toString('hex'), dhtFlags())
      if (have && have.count() > 0) {
        if (wire.hasFast && have.full()) wire.haveAll()
        else wire.bitfield(have.buffer)
      } else if (wire.hasFast) wire.haveNone()
      if (!metainfo) wire.ut_metadata?.fetch()
      if (wire.ut_pex) {
        wire.ut_pex.start()
        for (const p of peers.values()) if (p.outgoing && p !== peer) pexAdd(wire, p)
      }
      if (outgoing) for (const p of peers.values()) if (p !== peer) pexAdd(p.wire, peer)
    })
    wire.on('bitfield', onPeerPieces)
    wire.on('have-all', onPeerPieces)
    wire.on('have', (index: number) => {
      if (!picker || !peer.handshaked) return
      picker.peerHas(index)
      if (!wire.amInterested) updateInterest(peer)
      fill(peer)
    })
    wire.on('unchoke', () => fill(peer))
    wire.on('interested', () => {
      if (rechokeNeeded()) rechoke()
    })
    wire.on(
      'request',
      (
        index: number,
        offset: number,
        length: number,
        respond: (e: Error | null, d?: Uint8Array) => void,
      ) => onRequest(peer, index, offset, length, respond),
    )
    wire.ut_metadata?.on('metadata', (torrent: Uint8Array) => void onMetadata(torrent))
    wire.ut_metadata?.on('warning', () => {})
    // ut_pex 5.0.2 hands both families to 'peer', an IPv6 one as `[address]:port`
    wire.ut_pex?.on('peer', (p: string) => addPeers([p], true))

    if (outgoing) wire.handshake(infoHash, Buffer.from(ctx.peerId).toString('hex'), dhtFlags())
    return peer
  }

  const dhtFlags = () => ({ dht: !isPrivate(), fast: true })

  /** Fewer than every slot is filled while someone interested waits. */
  const rechokeNeeded = () => {
    let unchoked = 0
    for (const p of peers.values()) if (!p.wire.amChoking) unchoked++
    return unchoked < UPLOAD_SLOTS + 1
  }

  /**
   * BEP 3's choking: the peers that give us the most (or, seeding, take the most) get the slots,
   * plus one chosen at random so newcomers get a chance.
   */
  const rechoke = () => {
    if (!running) return
    const seeding = state === 'seeding'
    const interested = [...peers.values()].filter((p) => p.handshaked && p.wire.peerInterested)
    interested.sort((a, b) => (seeding ? b.up.rate() - a.up.rate() : b.down.rate() - a.down.rate()))
    const keep = new Set(interested.slice(0, UPLOAD_SLOTS).map((p) => p.key))
    if (rechokes % OPTIMISTIC_EVERY === 0 || !optimistic || !peers.has(optimistic)) {
      const rest = interested.filter((p) => !keep.has(p.key))
      optimistic = rest.length ? (rest[Math.floor(Math.random() * rest.length)] as Peer).key : null
    }
    if (optimistic) keep.add(optimistic)
    for (const p of peers.values()) {
      if (!p.handshaked) continue
      if (keep.has(p.key)) {
        if (p.wire.amChoking) p.wire.unchoke()
      } else if (!p.wire.amChoking) p.wire.choke()
    }
  }

  const connectMore = () => {
    if (!running || !ctx.sockets.up()) return
    if (state === 'seeding' && peers.size >= MAX_PEERS / 2) return
    const now = Date.now()
    let budget = Math.min(MAX_PEERS - peers.size, ctx.connectionsFree(), HALF_OPEN - halfOpen)
    for (const [addr, c] of candidates) {
      if (budget <= 0) break
      if (c.next > now || peers.has(addr)) continue
      const i = addr.lastIndexOf(':')
      const host = addr.slice(0, i).replace(/^\[|\]$/g, '')
      const port = Number(addr.slice(i + 1))
      if (banned.has(host) || isBlocked(host)) continue
      // a peer in a family the binding has no address in can't be reached; it waits
      if (!ctx.sockets.reachable(host)) continue
      budget--
      halfOpen++
      c.next = now + HANDSHAKE_MS
      // uTP first, as libtorrent does with `enable_outgoing_utp` on; TCP after a uTP failure
      let socket: PeerSocket | null = null
      let transport: 'tcp' | 'utp' = 'tcp'
      try {
        if (c.utp !== false) socket = ctx.utp(host, port)
        if (socket) transport = 'utp'
        else socket = ctx.sockets.connect(host, port)
      } catch {
        halfOpen--
        c.fails++
        continue
      }
      const conn = socket
      let opened = false
      let shook = false
      const attempt = c.attempt ?? firstAttempt(policy())
      conn.once('connect', () => {
        opened = true
        halfOpen--
        c.fails = 0
        if (transport === 'utp') c.utp = true
        if (!running) {
          conn.destroy()
          return
        }
        // MSE below the wire when the policy says so (mse.ts); plaintext hands the socket back
        secureOutgoing(conn, infoHash, attempt, policy()).then(
          ({ stream, method }) => {
            if (!running || conn.destroyed) {
              conn.destroy()
              return
            }
            const wire = new Wire()
            stream.pipe(wire).pipe(stream)
            wire.once('handshake', () => {
              shook = true
            })
            attach(wire, conn, host, port, true, method, transport)
          },
          () => conn.destroy(),
        )
      })
      conn.once('close', () => {
        if (opened) {
          // hung up before its handshake: the other way of opening is tried next (prefer falls
          // back to plaintext, allow to encrypted), then back to the first after a long wait
          const next = shook ? null : nextAttempt(policy(), attempt)
          c.attempt = next ?? undefined
          if (next) {
            c.next = Date.now() + 1_000
            return
          }
          // a peer that hung up is tried again later, not at once
          c.next = Date.now() + 30_000
          return
        }
        halfOpen--
        if (transport === 'utp') {
          // no answer over uTP: TCP at once, as libtorrent falls back
          c.utp = false
          c.next = 0
          return
        }
        c.fails++
        c.next = Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** (c.fails - 1))
      })
      conn.on('error', () => {})
    }
  }

  // --- trackers ------------------------------------------------------------------------------

  let trackerBackoff = 60

  const sendAnnounce = (event: AnnounceEvent, timeoutMs?: number) =>
    trackers.announce((url) =>
      announce(
        ctx.sockets,
        url,
        {
          infoHash,
          peerId: ctx.peerId,
          port: ctx.port(),
          uploaded,
          downloaded,
          left: metainfo ? left() : 16384,
          event,
          numWant: event === 'stopped' ? 0 : NUM_WANT,
          key: ctx.key,
        },
        timeoutMs,
      ),
    )

  const announceLoop = (event: AnnounceEvent) => {
    if (announceTimer) clearTimeout(announceTimer)
    announceTimer = null
    if (!running || trackers.empty()) return
    sendAnnounce(event)
      .then((res) => {
        trackerBackoff = 60
        addPeers(
          res.peers.map((p) =>
            p.host.includes(':') ? `[${p.host}]:${p.port}` : `${p.host}:${p.port}`,
          ),
        )
        if (event === 'completed') completedAnnounced = true
        schedule(res.interval)
      })
      .catch((e) => {
        if (e instanceof Unbound) return
        trackerBackoff = Math.min(trackerBackoff * 2, 30 * 60)
        schedule(trackerBackoff)
      })
      .finally(() => ctx.changed())
    const schedule = (seconds: number) => {
      if (!running) return
      announceTimer = setTimeout(() => announceLoop(null), seconds * 1000)
      announceTimer.unref?.()
    }
  }

  // --- metadata ------------------------------------------------------------------------------

  const onMetadata = async (torrent: Uint8Array) => {
    if (metainfo) return
    let m: Metainfo
    try {
      const dict = bencode.decode(torrent) as { info: unknown }
      m = parseInfo(bencode.encode(dict.info), init.magnet?.trackers ?? [])
    } catch (e) {
      ctx.log('info', 'A peer sent metadata highsea couldn’t read.', { infoHash, error: String(e) })
      return
    }
    if (m.infoHash !== infoHash) return
    prepare(m, null)
    for (const p of peers.values()) {
      p.wire.ut_metadata?.setMetadata(m.info)
      if (p.handshaked && picker) {
        picker.addPeer(p.has)
        updateInterest(p)
      }
    }
    ctx.gotMetadata(m)
    const refused = ctx.vet(m.files)
    if (refused) {
      halt(false)
      state = 'error'
      message = refused
      ctx.changed()
      return
    }
    if (allWantedIn()) finish()
    else for (const p of peers.values()) fill(p)
    ctx.changed()
  }

  // --- states --------------------------------------------------------------------------------

  const finish = () => {
    if (state === 'seeding' || state === 'completed') return
    if (completedAt === null) completedAt = Date.now()
    state = 'seeding'
    seedingSince = Date.now()
    for (const p of peers.values()) if (p.wire.amInterested) p.wire.uninterested()
    void storage?.close()
    if (!completedAnnounced && running) announceLoop('completed')
    ctx.finished()
    ctx.changed()
  }

  const fail = (why: string) => {
    halt(false)
    state = 'error'
    message = why
    ctx.changed()
  }

  const totalSeedingMs = () => seedingMs + (seedingSince ? Date.now() - seedingSince : 0)

  /** Whether the seeding rule is met: ratio or time, whichever first, never before the minimum. */
  const ruleMet = (): boolean => {
    if (state !== 'seeding') return false
    const minutes = totalSeedingMs() / 60_000
    if (rule.minMinutes !== null && minutes < rule.minMinutes) return false
    const size = metainfo?.length ?? 0
    const ratio = size > 0 ? uploaded / size : 0
    if (rule.ratio !== null && ratio >= rule.ratio) return true
    if (rule.minutes !== null && minutes >= rule.minutes) return true
    return false
  }

  const run = () => {
    if (running) return
    running = true
    message = null
    if (state !== 'seeding') state = metainfo && allWantedIn() ? 'seeding' : 'downloading'
    if (state === 'seeding') seedingSince = Date.now()
    // a fresh start tries everyone again: the binding came back, or the owner resumed
    for (const c of candidates.values()) c.next = 0
    if (init.magnet) addPeers(init.magnet.peers)
    announceLoop('started')
    if (!isPrivate()) {
      ctx.dhtLookup(infoHash)
      ctx.dhtAnnounce(infoHash)
    }
    const every = (ms: number, fn: () => void) => {
      const t = setInterval(fn, ms)
      t.unref?.()
      timers.push(t)
    }
    every(CONNECT_MS, connectMore)
    every(RECHOKE_MS, () => {
      rechokes++
      rechoke()
      if (ruleMet()) {
        const announceStopped = true
        halt(announceStopped)
        state = 'completed'
        ctx.seeded()
        ctx.changed()
      }
    })
    if (!isPrivate())
      every(DHT_EVERY_MS, () => {
        ctx.dhtLookup(infoHash)
        ctx.dhtAnnounce(infoHash)
      })
    connectMore()
    ctx.changed()
  }

  /** Stops networking. With `announceStopped`, tells the trackers, within a short deadline. */
  const halt = (announceStopped: boolean): Promise<void> => {
    if (!running) return Promise.resolve()
    running = false
    if (seedingSince) {
      seedingMs += Date.now() - seedingSince
      seedingSince = null
    }
    for (const t of timers.splice(0)) clearInterval(t)
    if (announceTimer) clearTimeout(announceTimer)
    announceTimer = null
    if (fillTimer) clearTimeout(fillTimer)
    fillTimer = null
    for (const p of [...peers.values()]) {
      p.wire.destroy()
      p.socket.destroy()
      removePeer(p)
    }
    const stopped =
      announceStopped && !trackers.empty() && ctx.sockets.up()
        ? Promise.race([
            sendAnnounce('stopped', STOPPED_DEADLINE_MS).then(
              () => {},
              () => {},
            ),
            new Promise<void>((r) => setTimeout(r, STOPPED_DEADLINE_MS).unref?.()),
          ])
        : Promise.resolve()
    return stopped
  }

  const addPeers = (addrs: string[], pex = false) => {
    for (const a of addrs) {
      if (candidates.size >= 2000) break
      if (!/^(\[[0-9a-fA-F:.]+\]|[0-9.]+):\d{1,5}$/.test(a)) continue
      const i = a.lastIndexOf(':')
      const port = Number(a.slice(i + 1))
      if (port <= 0 || port > 65535) continue
      let host = a.slice(0, i).replace(/^\[|\]$/g, '')
      if (a.startsWith('[')) {
        // one spelling per IPv6 address, so the same peer isn't two candidates
        try {
          host = new URL(`http://[${host}]/`).hostname.slice(1, -1)
        } catch {
          continue
        }
        // an IPv4-mapped address is the IPv4 peer
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host)
        if (mapped) host = mapped[1] as string
      }
      if (isBlocked(host)) continue
      const key = addressKey(host, port)
      if (!candidates.has(key)) candidates.set(key, { next: 0, fails: 0, pex, utp: null })
    }
  }

  const fileProgress = (): number[] => {
    if (!metainfo || !have) return []
    const m = metainfo
    return m.files.map((f) => {
      if (f.length === 0) return 1
      const first = Math.floor(f.offset / m.pieceLength)
      const last = Math.floor((f.offset + f.length - 1) / m.pieceLength)
      let got = 0
      for (let p = first; p <= last; p++) {
        if (!have?.get(p)) continue
        const start = Math.max(f.offset, p * m.pieceLength)
        const end = Math.min(f.offset + f.length, p * m.pieceLength + pieceSize(m, p))
        got += end - start
      }
      return got / f.length
    })
  }

  return {
    id: init.id,
    infoHash,
    metainfo: () => metainfo,
    state: () => state,
    running: () => running,
    /** Every wanted piece is in. */
    complete: () => allWantedIn(),
    storage: () => storage,
    priorities: () => priorities,
    sequential: () => sequential,
    rule: () => rule,

    /** Starts networking: peers, trackers, the DHT. */
    start() {
      if (state === 'error' && message) return
      run()
    },

    /** Stops networking and leaves the state as `queued` or `paused` (or keeps `completed`). */
    async stop(as: 'queued' | 'paused', announceStopped = true) {
      const halted = halt(announceStopped)
      if (state !== 'completed' && state !== 'error' && state !== 'seeding') state = as
      else if (state === 'seeding' && as === 'paused') state = 'paused'
      ctx.changed()
      await halted
    },

    /** The binding went: networking stops at once and starts again with `start` when it's back. */
    offline() {
      void halt(false)
    },

    /** Adopts an incoming connection whose handshake named this torrent. */
    adopt(
      wire: Wire,
      socket: PeerSocket,
      method: Method = 'plain',
      transport: 'tcp' | 'utp' = 'tcp',
    ) {
      if (!running) {
        wire.destroy()
        return
      }
      const host = (socket.remoteAddress ?? '').replace(/^::ffff:/, '')
      if (
        banned.has(host) ||
        isBlocked(host) ||
        peers.size >= MAX_PEERS ||
        ctx.connectionsFree() <= 0
      ) {
        wire.destroy()
        return
      }
      const peer = attach(wire, socket, host, socket.remotePort ?? 0, false, method, transport)
      // the engine read the handshake already: replay it into the session's listener
      peer.wire.emit('handshake', infoHash, wire.peerId, wire.peerExtensions)
    },

    addPeers,

    /** Connections open now, for the engine's overall limit. */
    connections: () => peers.size,

    /** Refuses the torrent before anything downloads: the vet hook found a blocked file. */
    refuse(reason: string) {
      fail(reason)
    },

    /** Clears an error so the torrent can start again. */
    clearError() {
      if (state !== 'error') return
      state = 'queued'
      message = null
      ctx.changed()
    },

    /**
     * Checks every piece on disk, for a torrent added with data already there or whose files
     * changed since its resume data was written.
     */
    async check() {
      if (!metainfo || !storage || !have) return
      const wasRunning = running
      if (running) await halt(false)
      state = 'checking'
      checkProgress = 0
      ctx.changed()
      const m = metainfo
      const fresh = new Bitfield(m.pieceCount)
      for (let p = 0; p < m.pieceCount; p++) {
        if (await storage.readable(p)) {
          try {
            const data = await storage.readPiece(p)
            const expected = Buffer.from(m.pieces.subarray(p * 20, p * 20 + 20)).toString('hex')
            if ((await ctx.hash(data)) === expected) fresh.set(p)
          } catch {
            // unreadable: missing
          }
        }
        checkProgress = (p + 1) / m.pieceCount
        if (p % 16 === 0) ctx.changed()
      }
      await storage.close()
      prepare(m, fresh.buffer)
      checkProgress = null
      state = allWantedIn() ? 'seeding' : 'queued'
      if (state === 'seeding' && completedAt === null) completedAt = Date.now()
      ctx.changed()
      if (wasRunning) run()
    },

    /**
     * Whether fast resume can trust the stored bitfield: each file that should have data is
     * there at its full size, and a finished torrent's files haven't changed since.
     */
    async resumable(stored: ({ size: number; mtimeMs: number } | null)[]): Promise<boolean> {
      if (!metainfo || !storage || !have) return false
      const now = await storage.fileStats()
      const progress = fileProgress()
      for (let i = 0; i < metainfo.files.length; i++) {
        const f = metainfo.files[i] as Metainfo['files'][number]
        if ((progress[i] ?? 0) === 0 || priorities[i] === 'skip') continue
        const n = now[i]
        if (!n || n.size !== f.length) return false
        if (completedAt !== null && stored[i] && n.mtimeMs !== stored[i]?.mtimeMs) return false
      }
      return true
    },

    setPriorities(next: Priority[]) {
      if (!metainfo || !storage || !have) return
      const before = priorities
      priorities = next.slice(0, metainfo.files.length)
      for (let i = 0; i < priorities.length; i++)
        if (before[i] === 'skip' && priorities[i] !== 'skip') {
          const h = have
          void storage.unskip(i, (p) => h.get(p))
        }
      picker?.prune()
      if (state === 'seeding' && !allWantedIn()) {
        state = running ? 'downloading' : 'queued'
        if (seedingSince) seedingMs += Date.now() - seedingSince
        seedingSince = null
      } else if (running && state === 'downloading' && allWantedIn()) finish()
      for (const p of peers.values()) {
        updateInterest(p)
        fill(p)
      }
      ctx.changed()
    },

    setSequential(on: boolean) {
      sequential = on
    },

    setRule(next: SeedRule) {
      rule = next
    },

    /** Re-announces now: the listening port changed, or the owner asked. */
    reannounce() {
      if (running) announceLoop(null)
    },

    peers(): PeerInfo[] {
      const count = have?.length ?? 0
      return [...peers.values()]
        .filter((p) => p.handshaked)
        .map((p) => {
          let got = 0
          for (let i = 0; i < count; i++) if (p.has(i)) got++
          const flags = [
            p.wire.amInterested && !p.wire.peerChoking ? 'D' : '',
            p.wire.peerInterested && !p.wire.amChoking ? 'U' : '',
            p.outgoing ? '' : 'I',
            p.fromPex ? 'X' : '',
            p.method === 'rc4' ? 'E' : p.method === 'obfuscated' ? 'e' : '',
            p.transport === 'utp' ? 'P' : '',
          ].join('')
          return {
            address: p.key,
            client: clientOf(p.wire.peerId),
            progress: count ? got / count : 0,
            downRate: p.down.rate(),
            upRate: p.up.rate(),
            flags,
          }
        })
    },

    stats(): SessionStats {
      const m = metainfo
      const size = m
        ? m.files.reduce((n, f, i) => n + (priorities[i] === 'skip' ? 0 : f.length), 0)
        : 0
      const remaining = m ? left() : 0
      const downRate = down.rate()
      let connectedSeeds = 0
      for (const p of peers.values())
        if (p.handshaked && have && have.length > 0) {
          let all = true
          for (let i = 0; i < have.length && all; i++) if (!p.has(i)) all = false
          if (all) connectedSeeds++
        }
      const connected = [...peers.values()].filter((p) => p.handshaked).length
      const swarm = trackers.swarm()
      const progress = fileProgress()
      return {
        state,
        hasMetadata: m !== null,
        name: m?.name ?? init.magnet?.name ?? infoHash,
        size,
        progress: m && size > 0 ? (size - remaining) / size : state === 'seeding' ? 1 : 0,
        downloaded,
        uploaded,
        downRate,
        upRate: up.rate(),
        eta:
          state === 'downloading' && downRate > 0
            ? Math.round(remaining / downRate)
            : state === 'seeding'
              ? 0
              : null,
        ratio: m && m.length > 0 ? uploaded / m.length : 0,
        peers: {
          connected: connected - connectedSeeds,
          total: Math.max(connected - connectedSeeds, swarm.leechers ?? 0),
        },
        seeds: { connected: connectedSeeds, total: Math.max(connectedSeeds, swarm.seeders ?? 0) },
        files: m
          ? m.files.map((f, i) => ({
              path: f.path,
              size: f.length,
              progress: progress[i] ?? 0,
              priority: priorities[i] ?? 'normal',
            }))
          : [],
        trackers: trackers.statuses(),
        lastDataAt,
        completedAt,
        seedingMs: totalSeedingMs(),
        message,
        checkProgress,
      }
    },

    /** What fast resume stores. */
    async resume() {
      return {
        have: have ? Uint8Array.from(have.buffer) : null,
        activePieces: picker?.activePieces() ?? [],
        files: storage ? await storage.fileStats() : [],
        downloaded,
        uploaded,
        completedAt,
        seedingMs: totalSeedingMs(),
      }
    },

    /** Stops for good: a last `stopped` to the trackers, files closed. */
    async close(announceStopped = true) {
      await halt(announceStopped)
      await storage?.close()
    },

    /** Removes the torrent's downloaded files. */
    async removeData() {
      await halt(false)
      await storage?.remove()
    },
  }
}
