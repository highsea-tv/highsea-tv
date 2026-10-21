// SPDX-License-Identifier: AGPL-3.0-only
// Test helpers: torrents made in memory, a tracker on loopback (HTTP and UDP, BEP 3, 15 and 23)
// and engines with their own database. Nothing reaches the network.
import { createHash, randomBytes } from 'node:crypto'
import dgram from 'node:dgram'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { silentLogger } from '@highsea/core'
import { migrate, openDatabase } from '@highsea/db'
import bencode from 'bencode'
import { createTorrentEngine, type EngineEvent } from '../src/index.ts'
import type { SocketRecord } from '../src/sockets.ts'

export const sha1 = (d: Uint8Array) => createHash('sha1').update(d).digest('hex')

export function tempDir(name = 'torrent') {
  return mkdtempSync(join(tmpdir(), `highsea-${name}-`))
}

export type TestFile = { path: string; data: Uint8Array }

/** A `.torrent` for these files: one file when there's one, else a folder named `name`. */
export function makeTorrent(options: {
  name: string
  files: TestFile[]
  pieceLength?: number
  announce?: string[]
  private?: boolean
}) {
  const pieceLength = options.pieceLength ?? 32 * 1024
  const all = Buffer.concat(options.files.map((f) => f.data))
  const pieces: Buffer[] = []
  for (let o = 0; o < all.length; o += pieceLength)
    pieces.push(
      createHash('sha1')
        .update(all.subarray(o, o + pieceLength))
        .digest(),
    )
  const info: Record<string, unknown> = {
    name: options.name,
    'piece length': pieceLength,
    pieces: Buffer.concat(pieces),
  }
  if (options.private) info.private = 1
  const single = options.files.length === 1 && options.files[0]?.path === options.name
  if (single) info.length = all.length
  else
    info.files = options.files.map((f) => ({
      length: f.data.length,
      path: f.path.split('/').slice(1),
    }))
  const dict: Record<string, unknown> = { info }
  if (options.announce?.length) {
    dict.announce = options.announce[0]
    dict['announce-list'] = options.announce.map((a) => [a])
  }
  const torrent = bencode.encode(dict)
  return { torrent, infoHash: sha1(bencode.encode(info)), length: all.length }
}

/** Writes the files under `dir`, as a seeder has them. */
export function writeFiles(dir: string, files: TestFile[]) {
  for (const f of files) {
    const p = join(dir, ...f.path.split('/'))
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, f.data)
  }
}

export const randomData = (n: number) => new Uint8Array(randomBytes(n))

type SwarmPeer = { ip: string; port: number; left: number }

/** Decodes a query value that holds raw bytes (`info_hash`, `peer_id`). */
function rawParam(query: string, key: string): Buffer | null {
  for (const part of query.split('&')) {
    const [k, v] = part.split('=')
    if (k !== key || v === undefined) continue
    const bytes: number[] = []
    for (let i = 0; i < v.length; i++) {
      if (v[i] === '%') {
        bytes.push(Number.parseInt(v.slice(i + 1, i + 3), 16))
        i += 2
      } else bytes.push(v.charCodeAt(i))
    }
    return Buffer.from(bytes)
  }
  return null
}

/** A tracker on 127.0.0.1, HTTP and UDP, that remembers who announced. */
export async function startTracker() {
  const swarms = new Map<string, Map<string, SwarmPeer>>()
  const announces: { infoHash: string; event: string | null; port: number; via: 'http' | 'udp' }[] =
    []

  const record = (
    infoHash: string,
    ip: string,
    port: number,
    left: number,
    event: string | null,
  ) => {
    let s = swarms.get(infoHash)
    if (!s) {
      s = new Map()
      swarms.set(infoHash, s)
    }
    const key = `${ip}:${port}`
    if (event === 'stopped') s.delete(key)
    else s.set(key, { ip, port, left })
    const others = [...s.entries()].filter(([k]) => k !== key).map(([, p]) => p)
    const compact = Buffer.alloc(others.length * 6)
    others.forEach((p, i) => {
      for (const [j, o] of p.ip.split('.').entries()) compact.writeUInt8(Number(o), i * 6 + j)
      compact.writeUInt16BE(p.port, i * 6 + 4)
    })
    const seeders = [...s.values()].filter((p) => p.left === 0).length
    return { compact, seeders, leechers: s.size - seeders }
  }

  const httpServer = http.createServer((req, res) => {
    const query = (req.url ?? '').split('?')[1] ?? ''
    const hash = rawParam(query, 'info_hash')
    const params = new URLSearchParams(query.replace(/(info_hash|peer_id)=[^&]*&?/g, ''))
    if (hash?.length !== 20) {
      res.end(Buffer.from(bencode.encode({ 'failure reason': 'bad info_hash' })))
      return
    }
    const infoHash = hash.toString('hex')
    const event = params.get('event')
    const port = Number(params.get('port'))
    announces.push({ infoHash, event, port, via: 'http' })
    const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')
    const r = record(infoHash, ip, port, Number(params.get('left')), event)
    res.end(
      Buffer.from(
        bencode.encode({
          interval: 60,
          complete: r.seeders,
          incomplete: r.leechers,
          peers: r.compact,
        }),
      ),
    )
  })
  await new Promise<void>((r) => httpServer.listen(0, '127.0.0.1', r))

  const udp = dgram.createSocket('udp4')
  udp.on('message', (msg, rinfo) => {
    if (msg.length < 16) return
    const action = msg.readUInt32BE(8)
    const tx = msg.readUInt32BE(12)
    if (action === 0) {
      const out = Buffer.alloc(16)
      out.writeUInt32BE(0, 0)
      out.writeUInt32BE(tx, 4)
      out.writeBigUInt64BE(0x1234n, 8)
      udp.send(out, rinfo.port, rinfo.address)
      return
    }
    if (action !== 1 || msg.length < 98) return
    const infoHash = msg.subarray(16, 36).toString('hex')
    const left = Number(msg.readBigUInt64BE(64))
    const ev = ([null, 'completed', 'started', 'stopped'] as const)[msg.readUInt32BE(80)] ?? null
    const port = msg.readUInt16BE(96)
    announces.push({ infoHash, event: ev, port, via: 'udp' })
    const r = record(infoHash, rinfo.address, port, left, ev)
    const out = Buffer.alloc(20 + r.compact.length)
    out.writeUInt32BE(1, 0)
    out.writeUInt32BE(tx, 4)
    out.writeUInt32BE(60, 8)
    out.writeUInt32BE(r.leechers, 12)
    out.writeUInt32BE(r.seeders, 16)
    r.compact.copy(out, 20)
    udp.send(out, rinfo.port, rinfo.address)
  })
  await new Promise<void>((r) => udp.bind(0, '127.0.0.1', r))

  return {
    httpUrl: `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/announce`,
    udpUrl: `udp://127.0.0.1:${udp.address().port}`,
    announces,
    swarm: (infoHash: string) => [...(swarms.get(infoHash)?.values() ?? [])],
    async close() {
      await new Promise<void>((r) => httpServer.close(() => r()))
      httpServer.closeAllConnections()
      udp.close()
    },
  }
}

let nextPort = 46000 + Math.floor(Math.random() * 1000)

/** An engine with its own in-memory database, bound to loopback. */
export function testEngine(
  options: {
    db?: ReturnType<typeof openDatabase>
    vet?: (files: { path: string }[]) => string | null
    limits?: { downloadRate?: number; uploadRate?: number; maxActive?: number }
    port?: number
    /** Also hears the engine's events, as the runtime's downloads service does. */
    onEvent?: (e: EngineEvent) => void
  } = {},
) {
  const database = options.db ?? openDatabase(':memory:')
  if (!options.db) migrate(database.raw)
  const events: EngineEvent[] = []
  const sockets: SocketRecord[] = []
  let hashes = 0
  const port = options.port ?? nextPort++
  const engine = createTorrentEngine({
    db: database.db,
    logger: silentLogger,
    hash: async (d) => {
      hashes++
      return sha1(d)
    },
    vet: options.vet,
    port,
    limits: options.limits,
    audit: (r) => sockets.push(r),
    emit: (e) => {
      events.push(e)
      options.onEvent?.(e)
    },
  })
  return { engine, database, events, sockets, port, hashes: () => hashes }
}

export const LOOPBACK = { address: '127.0.0.1', dns: [] }

/** Waits until `check` holds, polling every 25 ms. */
export async function until(check: () => boolean, timeoutMs = 15_000, what = 'the condition') {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}.`)
    await new Promise((r) => setTimeout(r, 25))
  }
}
