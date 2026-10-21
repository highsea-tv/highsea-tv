// SPDX-License-Identifier: AGPL-3.0-only
// Trackers: HTTP announces (BEP 3, compact peers per BEP 23, IPv6 peers per BEP 7) and UDP
// announces (BEP 15), in BEP 12's tiers. highsea writes this client rather than using
// `bittorrent-tracker`'s, whose UDP sockets are unbound and whose names go through the system's
// resolver (lib/client/udp-tracker.js and http-tracker.js at 11.2.3): every request here goes
// through the socket factory. Announce answers carry the swarm's seeders and leechers, which is
// what A8 shows, so no separate scrape is sent.
import { randomBytes } from 'node:crypto'
import bencode from 'bencode'
import type { SocketFactory } from './sockets.ts'

export type AnnounceEvent = 'started' | 'completed' | 'stopped' | null

export type Announce = {
  infoHash: string
  peerId: Uint8Array
  port: number
  uploaded: number
  downloaded: number
  left: number
  event: AnnounceEvent
  numWant: number
  key: number
}

export type AnnounceResult = {
  /** Seconds until the next announce. */
  interval: number
  peers: { host: string; port: number }[]
  seeders: number | null
  leechers: number | null
  warning: string | null
}

export type TrackerStatus = {
  url: string
  status: 'working' | 'updating' | 'error' | 'not-contacted'
  peers: number
  message: string | null
  seeders: number | null
  leechers: number | null
}

export class TrackerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrackerError'
  }
}

const hexToBytes = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'))

/** Percent-encodes raw bytes for a query string: unreserved characters stay as they are. */
export function escapeBytes(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) {
    const c = String.fromCharCode(b)
    out += /[A-Za-z0-9.\-_~]/.test(c) ? c : `%${b.toString(16).padStart(2, '0').toUpperCase()}`
  }
  return out
}

/** BEP 23's compact peers: 6 bytes each (IPv4), or 18 (IPv6, BEP 7). */
export function compactPeers(data: Uint8Array, family: 4 | 6): { host: string; port: number }[] {
  const size = family === 4 ? 6 : 18
  const out: { host: string; port: number }[] = []
  for (let i = 0; i + size <= data.length; i += size) {
    const view = new DataView(data.buffer, data.byteOffset + i, size)
    const port = view.getUint16(size - 2)
    if (port === 0) continue
    let host: string
    if (family === 4) host = `${data[i]}.${data[i + 1]}.${data[i + 2]}.${data[i + 3]}`
    else {
      const groups: string[] = []
      for (let g = 0; g < 8; g++) groups.push(view.getUint16(g * 2).toString(16))
      host = groups.join(':')
    }
    out.push({ host, port })
  }
  return out
}

const text = (v: unknown) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : null)

export async function announceHttp(
  sockets: SocketFactory,
  url: string,
  a: Announce,
  timeoutMs = 15_000,
): Promise<AnnounceResult> {
  const u = new URL(url)
  const params = [
    `info_hash=${escapeBytes(hexToBytes(a.infoHash))}`,
    `peer_id=${escapeBytes(a.peerId)}`,
    `port=${a.port}`,
    `uploaded=${a.uploaded}`,
    `downloaded=${a.downloaded}`,
    `left=${a.left}`,
    'compact=1',
    `numwant=${a.numWant}`,
    `key=${a.key.toString(16)}`,
    ...(a.event ? [`event=${a.event}`] : []),
  ]
  u.search = u.search ? `${u.search}&${params.join('&')}` : `?${params.join('&')}`
  const res = await sockets.get(u, timeoutMs)
  if (res.status < 200 || res.status >= 300)
    throw new TrackerError(`The tracker answered with HTTP ${res.status}.`)
  let body: unknown
  try {
    body = bencode.decode(res.body)
  } catch {
    throw new TrackerError('The tracker’s answer isn’t a tracker response.')
  }
  if (typeof body !== 'object' || body === null || body instanceof Uint8Array)
    throw new TrackerError('The tracker’s answer isn’t a tracker response.')
  const d = body as Record<string, unknown>
  const failure = text(d['failure reason'])
  if (failure) throw new TrackerError(failure)
  const peers: { host: string; port: number }[] = []
  if (d.peers instanceof Uint8Array) peers.push(...compactPeers(d.peers, 4))
  else if (Array.isArray(d.peers))
    for (const p of d.peers as Record<string, unknown>[]) {
      const host = text(p.ip)
      if (host && typeof p.port === 'number') peers.push({ host, port: p.port })
    }
  if (d.peers6 instanceof Uint8Array) peers.push(...compactPeers(d.peers6, 6))
  const interval = typeof d.interval === 'number' ? d.interval : 1800
  const minInterval = typeof d['min interval'] === 'number' ? d['min interval'] : 0
  return {
    interval: Math.max(interval, minInterval, 60),
    peers,
    seeders: typeof d.complete === 'number' ? d.complete : null,
    leechers: typeof d.incomplete === 'number' ? d.incomplete : null,
    warning: text(d['warning message']),
  }
}

const PROTOCOL_ID = 0x41727101980n
const EVENTS: Record<string, number> = { completed: 1, started: 2, stopped: 3 }

/** UDP connection ids last a minute (BEP 15); kept per tracker address. */
const connections = new Map<string, { id: bigint; until: number }>()

async function udpExchange(
  sockets: SocketFactory,
  host: string,
  port: number,
  packet: (txid: number) => Uint8Array,
  timeoutMs: number,
): Promise<DataView> {
  const socket = await sockets.udp(0)
  try {
    const txid = randomBytes(4).readUInt32BE(0)
    // BEP 15 retries after 15 * 2^n seconds; highsea gives up sooner, at the caller's deadline
    const tries = Math.max(1, Math.floor(Math.log2(timeoutMs / 15_000 + 1)) + 1)
    let wait = Math.min(15_000, timeoutMs)
    for (let attempt = 0; attempt < tries; attempt++) {
      const answer = await new Promise<DataView | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.off('message', onMessage)
          resolve(null)
        }, wait)
        const onMessage = (msg: Buffer) => {
          if (msg.length < 8 || msg.readUInt32BE(4) !== txid) return
          clearTimeout(timer)
          socket.off('message', onMessage)
          if (msg.readUInt32BE(0) === 3)
            reject(new TrackerError(msg.subarray(8).toString('utf8') || 'The tracker refused.'))
          else resolve(new DataView(msg.buffer, msg.byteOffset, msg.length))
        }
        socket.on('message', onMessage)
        socket.send(packet(txid), port, host)
      })
      if (answer) return answer
      wait *= 2
    }
    throw new TrackerError('The tracker didn’t answer.')
  } finally {
    socket.close()
  }
}

export async function announceUdp(
  sockets: SocketFactory,
  url: string,
  a: Announce,
  timeoutMs = 15_000,
): Promise<AnnounceResult> {
  const u = new URL(url)
  const host = await sockets.resolve(u.hostname.replace(/^\[|\]$/g, ''))
  const port = Number(u.port)
  if (!port) throw new TrackerError('The tracker’s address has no port.')
  const key = `${host}:${port}`
  let conn = connections.get(key)
  if (!conn || conn.until < Date.now()) {
    const answer = await udpExchange(
      sockets,
      host,
      port,
      (txid) => {
        const b = Buffer.alloc(16)
        b.writeBigUInt64BE(PROTOCOL_ID, 0)
        b.writeUInt32BE(0, 8)
        b.writeUInt32BE(txid, 12)
        return b
      },
      timeoutMs,
    )
    if (answer.byteLength < 16 || answer.getUint32(0) !== 0)
      throw new TrackerError('The tracker’s answer isn’t a tracker response.')
    conn = { id: answer.getBigUint64(8), until: Date.now() + 60_000 }
    connections.set(key, conn)
  }
  const id = conn.id
  const answer = await udpExchange(
    sockets,
    host,
    port,
    (txid) => {
      const b = Buffer.alloc(98)
      b.writeBigUInt64BE(id, 0)
      b.writeUInt32BE(1, 8)
      b.writeUInt32BE(txid, 12)
      Buffer.from(a.infoHash, 'hex').copy(b, 16)
      Buffer.from(a.peerId).copy(b, 36)
      b.writeBigUInt64BE(BigInt(a.downloaded), 56)
      b.writeBigUInt64BE(BigInt(a.left), 64)
      b.writeBigUInt64BE(BigInt(a.uploaded), 72)
      b.writeUInt32BE(a.event ? (EVENTS[a.event] ?? 0) : 0, 80)
      b.writeUInt32BE(0, 84)
      b.writeUInt32BE(a.key >>> 0, 88)
      b.writeInt32BE(a.numWant, 92)
      b.writeUInt16BE(a.port, 96)
      return b
    },
    timeoutMs,
  )
  if (answer.byteLength < 20 || answer.getUint32(0) !== 1)
    throw new TrackerError('The tracker’s answer isn’t a tracker response.')
  const peers = compactPeers(
    new Uint8Array(answer.buffer, answer.byteOffset + 20, answer.byteLength - 20),
    host.includes(':') ? 6 : 4,
  )
  return {
    interval: Math.max(answer.getUint32(8), 60),
    peers,
    leechers: answer.getUint32(12),
    seeders: answer.getUint32(16),
    warning: null,
  }
}

export function announce(sockets: SocketFactory, url: string, a: Announce, timeoutMs?: number) {
  if (url.startsWith('udp:')) return announceUdp(sockets, url, a, timeoutMs)
  return announceHttp(sockets, url, a, timeoutMs)
}

/**
 * One torrent's trackers in BEP 12's tiers: shuffled within each tier at first, tried in order,
 * a tracker that answers moving to the front of its tier, the next tier only when a whole tier
 * fails.
 */
export function createTrackerSet(tiers: string[][], random: () => number = Math.random) {
  const shuffled = tiers.map((tier) => {
    const t = [...tier]
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[t[i], t[j]] = [t[j] as string, t[i] as string]
    }
    return t
  })
  const status = new Map<string, TrackerStatus>()
  for (const url of tiers.flat())
    status.set(url, {
      url,
      status: 'not-contacted',
      peers: 0,
      message: null,
      seeders: null,
      leechers: null,
    })

  return {
    empty: () => shuffled.length === 0,
    statuses: () => [...status.values()],
    /** Announces until one tracker answers; throws the last error if none does. */
    async announce(
      send: (url: string) => Promise<AnnounceResult>,
    ): Promise<AnnounceResult & { url: string }> {
      let last: Error = new TrackerError('The torrent has no trackers.')
      for (const tier of shuffled)
        for (let i = 0; i < tier.length; i++) {
          const url = tier[i] as string
          const s = status.get(url) as TrackerStatus
          s.status = 'updating'
          try {
            const result = await send(url)
            Object.assign(s, {
              status: 'working',
              peers: result.peers.length,
              message: result.warning,
              seeders: result.seeders,
              leechers: result.leechers,
            })
            tier.splice(i, 1)
            tier.unshift(url)
            return { ...result, url }
          } catch (e) {
            last = e as Error
            Object.assign(s, { status: 'error', message: (e as Error).message, peers: 0 })
          }
        }
      throw last
    },
    /** The best known swarm size, from whichever tracker reported one. */
    swarm(): { seeders: number | null; leechers: number | null } {
      let seeders: number | null = null
      let leechers: number | null = null
      for (const s of status.values()) {
        if (s.seeders !== null) seeders = Math.max(seeders ?? 0, s.seeders)
        if (s.leechers !== null) leechers = Math.max(leechers ?? 0, s.leechers)
      }
      return { seeders, leechers }
    },
  }
}

/** An Azureus-style peer id: `-HS0001-` and 12 random bytes. */
export function newPeerId(): Uint8Array {
  const id = new Uint8Array(20)
  id.set(new TextEncoder().encode('-HS0001-'))
  id.set(randomBytes(12), 8)
  return id
}
