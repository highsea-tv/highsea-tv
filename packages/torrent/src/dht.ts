// SPDX-License-Identifier: AGPL-3.0-only
// The DHT (BEP 5) through `bittorrent-dht`, on a UDP socket from the socket factory: k-rpc-socket
// takes `opts.socket` (k-rpc-socket 1.11.1, index.js), so the DHT never opens its own. k-rpc-socket
// looks up a node's name with `dns.lookup`, the system's resolver, so bootstrap names are resolved
// here through the factory first and the DHT only ever sees addresses. Public torrents only (BEP 27).
import DHT from 'bittorrent-dht'
import type { SocketFactory } from './sockets.ts'

/** The bootstrap routers every client uses; k-rpc's own defaults. */
export const DEFAULT_BOOTSTRAP = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881',
]

export type Dht = {
  lookup(infoHash: string): void
  announce(infoHash: string, port: number): void
  nodes(): number
  /** Known nodes, kept so the next start needs no bootstrap. */
  saved(): string[]
  destroy(): Promise<void>
}

export async function startDht(options: {
  sockets: SocketFactory
  port: number
  bootstrap: string[]
  /** Nodes saved from the last run, as `host:port`. */
  nodes?: string[]
  onPeer(infoHash: string, address: string): void
  /** False once the engine went offline while the names resolved: nothing is started then. */
  current?(): boolean
}): Promise<Dht | null> {
  const socket = await options.sockets.udp(options.port)
  const resolved: string[] = []
  for (const b of options.bootstrap) {
    const i = b.lastIndexOf(':')
    try {
      resolved.push(`${await options.sockets.resolve(b.slice(0, i))}:${b.slice(i + 1)}`)
    } catch {
      // a router that doesn't resolve is skipped; the others and the saved nodes remain
    }
  }
  // the factory closed the socket while the names resolved; a DHT on it would bootstrap into a
  // closed socket and throw from a timer
  if (options.current && !options.current()) {
    try {
      socket.close()
    } catch {}
    return null
  }
  const dht = new DHT({ socket, bootstrap: resolved.length ? resolved : false })
  dht.on('error', () => {})
  dht.on('warning', () => {})
  dht.on('peer', (peer: { host: string; port: number }, infoHash: Uint8Array) =>
    options.onPeer(Buffer.from(infoHash).toString('hex'), `${peer.host}:${peer.port}`),
  )
  for (const n of options.nodes ?? []) {
    const i = n.lastIndexOf(':')
    const host = n.slice(0, i)
    if (/^[0-9.]+$/.test(host)) dht.addNode({ host, port: Number(n.slice(i + 1)) })
  }
  return {
    lookup: (infoHash) => {
      dht.lookup(infoHash)
    },
    announce: (infoHash, port) => dht.announce(infoHash, port),
    nodes: () => dht.toJSON().nodes.length,
    saved: () => dht.toJSON().nodes.map((n) => `${n.host}:${n.port}`),
    destroy: () => new Promise<void>((resolve) => dht.destroy(() => resolve())),
  }
}
