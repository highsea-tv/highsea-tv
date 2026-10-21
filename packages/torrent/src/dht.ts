// SPDX-License-Identifier: AGPL-3.0-only
// The DHT (BEP 5) through `bittorrent-dht`, on the engine's shared UDP socket (udp.ts): k-rpc-socket
// takes `opts.socket` (k-rpc-socket 1.11.1, index.js), so the DHT never opens its own. k-rpc-socket
// looks up a node's name with `dns.lookup`, the system's resolver, so bootstrap names are resolved
// here through the factory first and the DHT only ever sees addresses. Public torrents only (BEP 27).
//
// The IPv6 DHT (BEP 32, https://www.bittorrent.org/beps/bep_0032.html) is a second, independent DHT
// on the IPv6 socket, with the same node id, as BEP 32 recommends. Since k-rpc-socket takes an
// injected socket, nothing is patched (the plan's judgement call 7). What k-rpc 5.1.0 and
// bittorrent-dht 11.0.12 can't do is IPv6's compact forms: they read and write only 26-byte nodes
// and 6-byte peers. So the IPv6 DHT's socket is an adapter that speaks BEP 32 on the wire and IPv4
// to the libraries: each IPv6 address is given a stand-in from 240.0.0.0/4, the block RFC 1112
// § 4 reserves and nothing routes, and `nodes6` (38 bytes a node) and 18-byte `values` become
// `nodes` and 6-byte values on the way in, and back on the way out. The stand-ins never reach the
// network: a send to an unknown one is dropped.

import { isIP } from 'node:net'
import bencode from 'bencode'
import DHT from 'bittorrent-dht'
import type { Family } from './sockets.ts'
import { addressKey } from './sockets.ts'
import { KrpcSocket } from './udp.ts'

/** The bootstrap routers every client uses; k-rpc's own defaults. */
export const DEFAULT_BOOTSTRAP = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881',
]

/**
 * For the IPv6 DHT: libtorrent's default `dht_bootstrap_nodes` (reference-Settings.html), whose
 * first has an IPv6 address; a name without one is skipped.
 */
export const DEFAULT_BOOTSTRAP6 = ['dht.libtorrent.org:25401', ...DEFAULT_BOOTSTRAP]

export type Dht = {
  family: Family
  lookup(infoHash: string): void
  announce(infoHash: string, port: number): void
  nodes(): number
  /** Known nodes, kept so the next start needs no bootstrap. */
  saved(): string[]
  /** The node id, which the other family's DHT shares (BEP 32). */
  id(): Uint8Array
  destroy(): Promise<void>
}

/** Splits `host:port` or `[v6]:port`. */
function splitAddress(a: string): { host: string; port: number } | null {
  const i = a.lastIndexOf(':')
  if (i < 0) return null
  const host = a.slice(0, i).replace(/^\[|\]$/g, '')
  const port = Number(a.slice(i + 1))
  return host && port > 0 && port < 65536 ? { host, port } : null
}

export async function startDht(options: {
  /** The DHT's view of the shared UDP socket (udp.ts). */
  socket: KrpcSocket
  family: Family
  /** Names through the socket factory's bound resolver, in this DHT's family. */
  resolve(host: string): Promise<string>
  bootstrap: string[]
  /** Nodes saved from the last run, as `host:port` (`[host]:port` for IPv6). */
  nodes?: string[]
  /** The IPv4 DHT's node id, for the IPv6 one (BEP 32). */
  nodeId?: Uint8Array
  onPeer(infoHash: string, address: string): void
  /** False once the engine went offline while the names resolved: nothing is started then. */
  current?(): boolean
}): Promise<Dht | null> {
  const resolved: string[] = []
  for (const b of options.bootstrap) {
    const a = splitAddress(b)
    if (!a) continue
    try {
      const host = await options.resolve(a.host)
      if (isIP(host) === options.family) resolved.push(addressKey(host, a.port))
    } catch {
      // a router that doesn't resolve is skipped; the others and the saved nodes remain
    }
  }
  // the factory closed the socket while the names resolved; a DHT on it would bootstrap into a
  // closed socket and throw from a timer
  if ((options.current && !options.current()) || options.socket.closed) {
    options.socket.close()
    return null
  }
  const v6 = options.family === 6 ? ipv6Adapter(options.socket) : null
  const socket = v6 ? v6.socket : options.socket
  const fake = (a: string) => {
    if (!v6) return a
    const s = splitAddress(a)
    return s ? `${v6.toFake(s.host)}:${s.port}` : a
  }
  const real = (host: string) => (v6 ? (v6.toReal(host) ?? null) : host)
  const bootstrap = resolved.map(fake)
  const dht = new DHT({
    socket,
    bootstrap: bootstrap.length ? bootstrap : false,
    ...(options.nodeId ? { nodeId: Buffer.from(options.nodeId) } : {}),
  })
  dht.on('error', () => {})
  dht.on('warning', () => {})
  dht.on('peer', (peer: { host: string; port: number }, infoHash: Uint8Array) => {
    const host = real(peer.host)
    if (host) options.onPeer(Buffer.from(infoHash).toString('hex'), addressKey(host, peer.port))
  })
  for (const n of options.nodes ?? []) {
    const a = splitAddress(n)
    if (!a || isIP(a.host) !== options.family) continue
    dht.addNode({ host: v6 ? v6.toFake(a.host) : a.host, port: a.port })
  }
  const known = () =>
    dht
      .toJSON()
      .nodes.map((n) => ({ host: real(n.host), port: n.port }))
      .filter((n): n is { host: string; port: number } => n.host !== null)
  return {
    family: options.family,
    lookup: (infoHash) => {
      dht.lookup(infoHash)
    },
    announce: (infoHash, port) => dht.announce(infoHash, port),
    nodes: () => known().length,
    saved: () => known().map((n) => addressKey(n.host, n.port)),
    id: () => new Uint8Array(dht.nodeId),
    destroy: () => new Promise<void>((resolve) => dht.destroy(() => resolve())),
  }
}

// --- the IPv6 adapter --------------------------------------------------------------------------

const STANDINS = 1 << 16

type Dict = Record<string, unknown>

const isDict = (v: unknown): v is Dict =>
  typeof v === 'object' && v !== null && !(v instanceof Uint8Array) && !Array.isArray(v)

/** An IPv6 address's 16 bytes. */
function ipv6Bytes(host: string): Uint8Array {
  // WHATWG URL parses IPv6 into its canonical form; split it into the eight groups
  const canonical = new URL(`http://[${host}]/`).hostname.slice(1, -1)
  const [head = '', tail = ''] = canonical.split('::')
  const h = head ? head.split(':') : []
  const t = canonical.includes('::') ? (tail ? tail.split(':') : []) : []
  const groups = canonical.includes('::')
    ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t]
    : h
  const out = new Uint8Array(16)
  groups.forEach((g, i) => {
    const n = Number.parseInt(g, 16)
    out[i * 2] = n >> 8
    out[i * 2 + 1] = n & 0xff
  })
  return out
}

/** Canonical text for 16 bytes of IPv6 (RFC 5952, through WHATWG URL's serializer). */
export function ipv6Text(bytes: Uint8Array): string {
  const groups: string[] = []
  for (let g = 0; g < 8; g++)
    groups.push((((bytes[g * 2] as number) << 8) | (bytes[g * 2 + 1] as number)).toString(16))
  return new URL(`http://[${groups.join(':')}]/`).hostname.slice(1, -1)
}

function ipv6Adapter(inner: KrpcSocket) {
  const toStandin = new Map<string, string>()
  const fromStandin = new Map<string, string>()
  let next = 1

  const toFake = (host: string): string => {
    let f = toStandin.get(host)
    if (f) {
      // most recently used last, so the oldest goes first when the table is full
      toStandin.delete(host)
      toStandin.set(host, f)
      return f
    }
    if (toStandin.size >= STANDINS) {
      const [oldReal, oldFake] = toStandin.entries().next().value as [string, string]
      toStandin.delete(oldReal)
      fromStandin.delete(oldFake)
    }
    const n = next++ & 0x0fffffff
    f = `${240 | (n >>> 24)}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`
    toStandin.set(host, f)
    fromStandin.set(f, host)
    return f
  }
  const toReal = (fake: string) => fromStandin.get(fake)

  const fakeBytes = (host: string) => Uint8Array.from(toFake(host).split('.').map(Number))
  const realBytes = (fake: Uint8Array) => {
    const r = toReal(`${fake[0]}.${fake[1]}.${fake[2]}.${fake[3]}`)
    return r ? ipv6Bytes(r) : null
  }

  /** `nodes6` (id, 16-byte address, port) into `nodes` (id, 4-byte stand-in, port). */
  const nodesIn = (n6: Uint8Array) => {
    const out: Uint8Array[] = []
    for (let i = 0; i + 38 <= n6.length; i += 38) {
      const e = new Uint8Array(26)
      e.set(n6.subarray(i, i + 20))
      e.set(fakeBytes(ipv6Text(n6.subarray(i + 20, i + 36))), 20)
      e.set(n6.subarray(i + 36, i + 38), 24)
      out.push(e)
    }
    return Buffer.concat(out)
  }
  const nodesOut = (n4: Uint8Array) => {
    const out: Uint8Array[] = []
    for (let i = 0; i + 26 <= n4.length; i += 26) {
      const addr = realBytes(n4.subarray(i + 20, i + 24))
      if (!addr) continue
      const e = new Uint8Array(38)
      e.set(n4.subarray(i, i + 20))
      e.set(addr, 20)
      e.set(n4.subarray(i + 24, i + 26), 36)
      out.push(e)
    }
    return Buffer.concat(out)
  }

  const socket = new KrpcSocket(
    (data, port, host) => {
      const to = toReal(host)
      if (!to) return
      let msg: unknown
      try {
        msg = bencode.decode(data)
      } catch {
        return
      }
      if (isDict(msg) && isDict(msg.r)) {
        const r = msg.r
        if (r.nodes instanceof Uint8Array) {
          r.nodes6 = nodesOut(r.nodes)
          delete r.nodes
        }
        if (Array.isArray(r.values))
          r.values = r.values
            .filter((v): v is Uint8Array => v instanceof Uint8Array && v.length === 6)
            .map((v) => {
              const addr = realBytes(v)
              if (!addr) return null
              const e = new Uint8Array(18)
              e.set(addr)
              e.set(v.subarray(4, 6), 16)
              return e
            })
            .filter((v) => v !== null)
      }
      const out = Buffer.from(bencode.encode(msg))
      inner.send(out, 0, out.length, port, to)
    },
    () => inner.address(),
  )

  inner.on('message', (buf: Buffer, rinfo: { address: string; port: number }) => {
    let msg: unknown
    try {
      msg = bencode.decode(buf)
    } catch {
      return
    }
    if (!isDict(msg)) return
    delete msg.ip
    if (isDict(msg.r)) {
      const r = msg.r
      r.nodes = r.nodes6 instanceof Uint8Array ? nodesIn(r.nodes6) : Buffer.alloc(0)
      delete r.nodes6
      if (Array.isArray(r.values))
        r.values = r.values
          .filter((v): v is Uint8Array => v instanceof Uint8Array && v.length === 18)
          .map((v) => {
            const e = new Uint8Array(6)
            e.set(fakeBytes(ipv6Text(v.subarray(0, 16))))
            e.set(v.subarray(16, 18), 4)
            return e
          })
    }
    socket.emit('message', Buffer.from(bencode.encode(msg)), {
      address: toFake(rinfo.address),
      port: rinfo.port,
      family: 'IPv4',
      size: buf.length,
    })
  })
  inner.on('error', (e: Error) => {
    if (socket.listenerCount('error')) socket.emit('error', e)
  })
  inner.on('close', () => socket.close())
  const close = socket.close.bind(socket)
  socket.close = () => {
    close()
    inner.close()
  }
  return { socket, toFake, toReal }
}
