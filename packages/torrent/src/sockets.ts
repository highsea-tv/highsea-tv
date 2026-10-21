// SPDX-License-Identifier: AGPL-3.0-only
// Every socket the engine opens is made here, so nothing can open one unbound
// (docs/plans/phase-3-checkpoint-6.md › The network binding). With a binding, the TCP listener, each
// peer connection (`localAddress`, https://nodejs.org/docs/latest-v24.x/api/net.html#socketconnectoptions-connectlistener),
// the UDP socket (https://nodejs.org/api/dgram.html#socketbindoptions-callback) and tracker
// requests all leave from the binding's address, and tracker names are looked up with a resolver
// bound to it (`resolver.setLocalAddress`, https://nodejs.org/docs/latest-v24.x/api/dns.html#resolversetlocaladdressipv4-ipv6),
// never the system's. When the binding goes, every socket is destroyed and nothing new opens.
import dgram from 'node:dgram'
import { Resolver } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net, { isIP } from 'node:net'

/** Where torrent traffic leaves from, handed over by `@highsea/vpn`. */
export type Binding = {
  /**
   * The local address every socket binds to, or null for any address: no VPN, or a VPN container
   * whose network has no route but the tunnel.
   */
  address: string | null
  /** DNS servers for tracker names; empty uses the system's servers (still from `address`). */
  dns: string[]
}

/** What a socket was opened for, and the address it was bound to: the kill switch test reads it. */
export type SocketRecord = {
  kind: 'listen' | 'connect' | 'udp' | 'http'
  localAddress: string | null
  remote: string | null
}

export class Unbound extends Error {
  constructor() {
    super('The torrent network is down.')
    this.name = 'Unbound'
  }
}

type Closable = { destroy?: () => void; close?: () => void }

export type SocketFactory = ReturnType<typeof createSocketFactory>

export function createSocketFactory(options: { audit?: (r: SocketRecord) => void } = {}) {
  let binding: Binding | null = null
  let resolver: Resolver | null = null
  const open = new Set<Closable>()

  const track = <T extends Closable>(s: T, record: SocketRecord, closeEvent = 'close'): T => {
    open.add(s)
    options.audit?.(record)
    ;(s as unknown as NodeJS.EventEmitter).once(closeEvent, () => open.delete(s))
    return s
  }

  const require = (): Binding => {
    if (!binding) throw new Unbound()
    return binding
  }

  /** Refuses names: peers are addresses, and trackers are resolved through `resolve` first. */
  const noLookup: net.LookupFunction = (hostname, _options, callback) =>
    callback(new Error(`${hostname} wasn’t resolved through the torrent network.`), '', 4)

  const familyOf = (address: string | null) => (address && isIP(address) === 6 ? 6 : 4)

  const factory = {
    /** The current binding, or null while the network is down. */
    binding: () => binding,
    up: () => binding !== null,

    /** Takes a new binding: every open socket is closed first, and the engine opens new ones. */
    rebind(next: Binding | null) {
      factory.closeAll()
      binding = next
      resolver = null
      if (next) {
        const r = new Resolver({ timeout: 5000, tries: 2 })
        if (next.address) {
          if (familyOf(next.address) === 6) r.setLocalAddress('0.0.0.0', next.address)
          else r.setLocalAddress(next.address)
        }
        if (next.dns.length) r.setServers(next.dns)
        resolver = r
      }
    },

    closeAll() {
      for (const s of [...open]) {
        try {
          if (s.destroy) s.destroy()
          else s.close?.()
        } catch {
          // already closed
        }
      }
      open.clear()
    },

    /** Resolves a tracker's name through the bound resolver: never the system's. */
    async resolve(host: string): Promise<string> {
      if (isIP(host)) return host
      require()
      const r = resolver as Resolver
      const family = familyOf(binding?.address ?? null)
      const answers = family === 6 ? await r.resolve6(host) : await r.resolve4(host)
      const first = answers[0]
      if (!first) throw new Error(`${host} has no address.`)
      return first
    },

    async listen(port: number): Promise<net.Server> {
      const b = require()
      const host = b.address ?? '0.0.0.0'
      const server = net.createServer()
      track(server as unknown as Closable, {
        kind: 'listen',
        localAddress: b.address,
        remote: null,
      })
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen({ port, host }, () => {
          server.off('error', reject)
          resolve(server)
        })
      })
    },

    /** Tracks a socket the listener accepted, so a rebind closes it too. */
    accepted(socket: net.Socket) {
      track(socket, {
        kind: 'connect',
        localAddress: socket.localAddress ?? null,
        remote: `${socket.remoteAddress}:${socket.remotePort}`,
      })
      return socket
    },

    connect(host: string, port: number, timeoutMs = 10_000): net.Socket {
      const b = require()
      if (!isIP(host)) throw new Error(`${host} isn’t an address.`)
      const socket = net.connect({
        host,
        port,
        localAddress: b.address ?? undefined,
        lookup: noLookup,
        timeout: timeoutMs,
      })
      socket.once('timeout', () => socket.destroy(new Error('Timed out connecting.')))
      socket.once('connect', () => socket.setTimeout(0))
      return track(socket, { kind: 'connect', localAddress: b.address, remote: `${host}:${port}` })
    },

    async udp(port: number): Promise<dgram.Socket> {
      const b = require()
      const socket = dgram.createSocket({
        type: familyOf(b.address) === 6 ? 'udp6' : 'udp4',
        reuseAddr: false,
      })
      track(socket as unknown as Closable, { kind: 'udp', localAddress: b.address, remote: null })
      return new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.bind({ port, address: b.address ?? undefined }, () => {
          socket.off('error', reject)
          resolve(socket)
        })
      })
    },

    /** A GET to a tracker: resolved through `resolve`, sent from the binding's address. */
    async get(url: URL, timeoutMs = 15_000): Promise<{ status: number; body: Uint8Array }> {
      const b = require()
      const address = await factory.resolve(url.hostname.replace(/^\[|\]$/g, ''))
      const lib = url.protocol === 'https:' ? https : http
      return new Promise((resolve, reject) => {
        const req = lib.request(
          url,
          {
            method: 'GET',
            localAddress: b.address ?? undefined,
            // the name is already resolved; TLS still checks the certificate against `servername`
            lookup: (_host, _opts, cb) => cb(null, address, familyOf(address)),
            servername: isIP(url.hostname) ? undefined : url.hostname,
            headers: { 'user-agent': 'highsea', 'accept-encoding': 'identity' },
            timeout: timeoutMs,
          } as https.RequestOptions,
          (res) => {
            const chunks: Buffer[] = []
            let size = 0
            res.on('data', (c: Buffer) => {
              size += c.length
              // a tracker answer is a few kilobytes; anything far bigger isn't one
              if (size > 4 * 1024 * 1024) req.destroy(new Error('The tracker’s answer is too big.'))
              else chunks.push(c)
            })
            res.on('end', () =>
              resolve({ status: res.statusCode ?? 0, body: new Uint8Array(Buffer.concat(chunks)) }),
            )
            res.on('error', reject)
          },
        )
        track(req as unknown as Closable, {
          kind: 'http',
          localAddress: b.address,
          remote: url.host,
        })
        req.once('timeout', () => req.destroy(new Error('The tracker didn’t answer in time.')))
        req.once('error', reject)
        req.end()
      })
    },
  }
  return factory
}
