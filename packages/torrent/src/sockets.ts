// SPDX-License-Identifier: AGPL-3.0-only
// Every socket the engine opens is made here, so nothing can open one unbound
// (docs/plans/phase-3-checkpoint-6.md › The network binding). With a binding, the TCP listener, each
// peer connection (`localAddress`, https://nodejs.org/docs/latest-v24.x/api/net.html#socketconnectoptions-connectlistener),
// the UDP socket (https://nodejs.org/api/dgram.html#socketbindoptions-callback) and tracker
// requests all leave from the binding's address, and tracker names are looked up with a resolver
// bound to it (`resolver.setLocalAddress`, https://nodejs.org/docs/latest-v24.x/api/dns.html#resolversetlocaladdressipv4-ipv6),
// never the system's. When the binding goes, every socket is destroyed and nothing new opens.
//
// IPv6 (6b): a binding has an IPv4 side and, when it can, an IPv6 side. With a VPN binding the IPv6
// side exists only when the binding names an IPv6 address (`address6`). With the "any" binding it
// exists when the host has a global IPv6 address (2000::/3, the global unicast space of RFC 4291
// § 2.4, less Teredo's 2001::/32, which BEP 32 says to avoid), and its sockets listen on `::`, as
// libtorrent's default `listen_interfaces` (`0.0.0.0:6881,[::]:6881`) does. IPv6 sockets are
// `ipv6Only`, so the two families share one port
// (https://nodejs.org/docs/latest-v24.x/api/net.html#serverlistenoptions-callback,
// https://nodejs.org/docs/latest-v24.x/api/dgram.html#dgramcreatesocketoptions-callback).
import dgram from 'node:dgram'
import { Resolver } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net, { isIP } from 'node:net'
import os from 'node:os'
import type { Duplex } from 'node:stream'

/** Where torrent traffic leaves from, handed over by `@highsea-tv/vpn`. */
export type Binding = {
  /**
   * The local address every socket binds to, or null for any address: no VPN, or a VPN container
   * whose network has no route but the tunnel.
   */
  address: string | null
  /** DNS servers for tracker names; empty uses the system's servers (still from `address`). */
  dns: string[]
  /**
   * The IPv6 address for IPv6 sockets beside an IPv4 `address`: a tunnel with an IPv6 address.
   * Absent with a VPN binding, IPv6 isn't used. With the "any" binding (`address` null), absent
   * means "when the host has a global IPv6 address".
   */
  address6?: string | null
}

export type Family = 4 | 6

/** One address family the binding allows, and the address its sockets bind to (null: any). */
export type Local = { family: Family; address: string | null }

/** A peer connection's stream: a TCP socket, or a uTP stream (utp.ts). */
export type PeerSocket = Duplex & { remoteAddress?: string; remotePort?: number }

/** What a socket was opened for, and the address it was bound to: the kill switch test reads it. */
export type SocketRecord = {
  kind: 'listen' | 'connect' | 'udp' | 'http' | 'utp'
  localAddress: string | null
  remote: string | null
}

export class Unbound extends Error {
  constructor() {
    super('The torrent network is down.')
    this.name = 'Unbound'
  }
}

/** BEP 32's choice of address: global unicast (2000::/3), not Teredo (2001:0::/32). */
export function isGlobalIPv6(address: string): boolean {
  if (isIP(address) !== 6) return false
  const [a = '', b = ''] = address.split(':')
  const first = Number.parseInt(a || '0', 16)
  if (first < 0x2000 || first > 0x3fff) return false
  return !(first === 0x2001 && Number.parseInt(b || '0', 16) === 0)
}

/** The family an address belongs to: 6 for IPv6, else 4. */
export const familyOf = (address: string | null): Family => (address && isIP(address) === 6 ? 6 : 4)

/** `host:port`, with an IPv6 host in brackets. */
export const addressKey = (host: string, port: number) =>
  isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`

type Closable = { destroy?: () => void; close?: () => void }

export type SocketFactory = ReturnType<typeof createSocketFactory>

export function createSocketFactory(
  options: {
    audit?: (r: SocketRecord) => void
    /** Addresses never connected to: the IP blocklist (6b, blocklist.ts). */
    refuse?: (host: string) => boolean
    /** The host's interfaces, for the "any" binding's IPv6 side; injectable for tests. */
    interfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>
  } = {},
) {
  const interfaces = options.interfaces ?? (() => os.networkInterfaces())
  let binding: Binding | null = null
  let locals: Local[] = []
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

  /** The families a binding allows, IPv4 first. */
  const localsOf = (b: Binding): Local[] => {
    if (b.address && isIP(b.address) === 6) return [{ family: 6, address: b.address }]
    const out: Local[] = [{ family: 4, address: b.address }]
    if (b.address6) out.push({ family: 6, address: b.address6 })
    else if (b.address === null && b.address6 === undefined) {
      const global = Object.values(interfaces())
        .flat()
        .some((i) => i && i.family === 'IPv6' && !i.internal && isGlobalIPv6(i.address))
      if (global) out.push({ family: 6, address: null })
    }
    return out
  }

  /** The local side for a family: throws while there's no binding or the family isn't allowed. */
  const localFor = (family: Family): Local => {
    require()
    const l = locals.find((x) => x.family === family)
    if (!l) throw new Error(family === 6 ? 'IPv6 isn’t available.' : 'IPv4 isn’t available.')
    return l
  }
  const primary = (): Family => locals[0]?.family ?? 4
  const anyOf = (family: Family) => (family === 6 ? '::' : '0.0.0.0')

  const factory = {
    /** The current binding, or null while the network is down. */
    binding: () => binding,
    up: () => binding !== null,

    /** The families the binding allows, IPv4 first; empty while the network is down. */
    locals: (): Local[] => [...locals],

    /** Whether a peer at this address can be reached: its family is allowed. */
    reachable(host: string): boolean {
      const f = isIP(host)
      return f !== 0 && locals.some((l) => l.family === f)
    },

    /** Takes a new binding: every open socket is closed first, and the engine opens new ones. */
    rebind(next: Binding | null) {
      factory.closeAll()
      binding = next
      resolver = null
      locals = next ? localsOf(next) : []
      if (next) {
        const r = new Resolver({ timeout: 5000, tries: 2 })
        const v4 = locals.find((l) => l.family === 4)?.address
        const v6 = locals.find((l) => l.family === 6)?.address
        if (v4 || v6) r.setLocalAddress(v4 ?? '0.0.0.0', v6 ?? '::0')
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

    /**
     * Resolves a tracker's name through the bound resolver, never the system's: an A record for
     * IPv4 and an AAAA record for IPv6 (the binding's first family by default).
     */
    async resolve(host: string, family?: Family): Promise<string> {
      if (isIP(host)) return host
      require()
      const r = resolver as Resolver
      const answers = (family ?? primary()) === 6 ? await r.resolve6(host) : await r.resolve4(host)
      const first = answers[0]
      if (!first) throw new Error(`${host} has no address.`)
      return first
    },

    async listen(port: number, family?: Family): Promise<net.Server> {
      const l = localFor(family ?? primary())
      const server = net.createServer()
      track(server as unknown as Closable, {
        kind: 'listen',
        localAddress: l.address,
        remote: null,
      })
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(
          { port, host: l.address ?? anyOf(l.family), ipv6Only: l.family === 6 },
          () => {
            server.off('error', reject)
            resolve(server)
          },
        )
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

    /**
     * Tracks a uTP stream (utp.ts), which lives on a UDP socket made here: a rebind closes the
     * socket and the stream with it, and the audit sees the stream's local address.
     */
    adopt<T extends PeerSocket>(stream: T, family: Family, remote: string): T {
      const l = localFor(family)
      return track(stream, { kind: 'utp', localAddress: l.address, remote })
    },

    connect(host: string, port: number, timeoutMs = 10_000): net.Socket {
      require()
      const f = isIP(host)
      if (!f) throw new Error(`${host} isn’t an address.`)
      if (options.refuse?.(host)) throw new Error(`${host} is on the IP blocklist.`)
      const l = localFor(f as Family)
      const socket = net.connect({
        host,
        port,
        localAddress: l.address ?? undefined,
        lookup: noLookup,
        timeout: timeoutMs,
      })
      socket.once('timeout', () => socket.destroy(new Error('Timed out connecting.')))
      socket.once('connect', () => socket.setTimeout(0))
      return track(socket, {
        kind: 'connect',
        localAddress: l.address,
        remote: addressKey(host, port),
      })
    },

    async udp(port: number, family?: Family): Promise<dgram.Socket> {
      const l = localFor(family ?? primary())
      const socket = dgram.createSocket({
        type: l.family === 6 ? 'udp6' : 'udp4',
        reuseAddr: false,
        ipv6Only: l.family === 6,
      })
      track(socket as unknown as Closable, { kind: 'udp', localAddress: l.address, remote: null })
      return new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.bind({ port, address: l.address ?? anyOf(l.family) }, () => {
          socket.off('error', reject)
          resolve(socket)
        })
      })
    },

    /**
     * A GET to a tracker: resolved through `resolve` in `family` (by default the literal's own, or
     * the binding's first), sent from the binding's address in that family.
     */
    async get(
      url: URL,
      timeoutMs = 15_000,
      family?: Family,
    ): Promise<{ status: number; body: Uint8Array }> {
      require()
      const host = url.hostname.replace(/^\[|\]$/g, '')
      const address = await factory.resolve(host, isIP(host) ? familyOf(host) : family)
      const l = localFor(familyOf(address))
      const lib = url.protocol === 'https:' ? https : http
      return new Promise((resolve, reject) => {
        const req = lib.request(
          url,
          {
            method: 'GET',
            localAddress: l.address ?? undefined,
            // the name is already resolved; TLS still checks the certificate against `servername`
            lookup: (_host, _opts, cb) => cb(null, address, familyOf(address)),
            servername: isIP(host) ? undefined : url.hostname,
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
          localAddress: l.address,
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
