// SPDX-License-Identifier: AGPL-3.0-only
// Opening the listening port on the home router, when Settings › Download client's UPnP switch is
// on and no VPN is set (a mapping on the home router does nothing for a tunnel; the runtime decides
// that through `wanted`). NAT-PMP is tried first, then UPnP.
//
// - NAT-PMP is written here from RFC 6886 (https://www.rfc-editor.org/rfc/rfc6886): two requests,
//   the external address (opcode 0) and a mapping (1 UDP, 2 TCP), sent to the default gateway's
//   port 5351 from the engine's own UDP socket, so it goes through the socket factory and its
//   binding. Requests are retried after 250 ms, doubling (§3.1); a mapping asks for the recommended
//   7200 seconds and is renewed halfway to expiry (§3.3); on shutdown it's deleted with a lifetime
//   of 0 (§3.4). `@achingbrain/nat-port-mapper`'s NAT-PMP isn't used: it binds its own socket to
//   port 5350 on every address, sends only to port 5351, and writes its millisecond TTL into the
//   seconds field (`dist/src/pmp/gateway.js` at 4.0.5), so it can't go through the binding.
// - UPnP is `@achingbrain/nat-port-mapper` 4.0.5's IGD client (Apache-2.0 OR MIT): SSDP discovery
//   for an InternetGatewayDevice:2, then AddPortMapping for TCP and UDP, renewed by the library a
//   minute before its lease ends, and removed by `stop()`. What it opens, from its source: a UDP
//   socket on port 1900 of each non-loopback address for SSDP, and HTTP requests to the gateway with
//   the global `fetch`. Those sockets aren't the factory's, which is why UPnP only ever runs with no
//   VPN, when there's no binding address to keep to anyway.
// The default gateway is read from Linux's routing table, `/proc/net/route` (proc(5)); where that
// file doesn't exist (a developer's Mac), NAT-PMP is skipped and UPnP is tried alone.
import type dgram from 'node:dgram'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

export type MappingStatus = {
  via: 'nat-pmp' | 'upnp'
  externalPort: number
  externalAddress: string | null
}

/** The part of `@achingbrain/nat-port-mapper`'s gateway the mapper uses. */
export type UpnpGateway = {
  host: string
  map(
    internalPort: number,
    internalHost: string,
    options: { protocol: 'TCP' | 'UDP'; description: string; externalPort?: number },
  ): Promise<{ externalPort: number; externalHost: string }>
  stop(): Promise<void>
}
export type UpnpClient = {
  findGateways(options: { signal: AbortSignal }): AsyncGenerator<UpnpGateway, void, unknown>
}

export type PortMapperOptions = {
  /** The engine's UDP socket for NAT-PMP, from the socket factory. */
  udp(): Promise<dgram.Socket>
  log(level: 'info' | 'warn', message: string, fields?: Record<string, unknown>): void
  /** The router to ask; null skips NAT-PMP. Defaults to Linux's default route. */
  gateway?: () => string | null
  /** NAT-PMP's server port; 5351 except in tests. */
  pmpPort?: number
  /** The UPnP client; defaults to `@achingbrain/nat-port-mapper`'s. Null skips UPnP. */
  upnp?: (() => UpnpClient | Promise<UpnpClient>) | null
  /** The first NAT-PMP wait, doubling each try (RFC 6886 §3.1: 250 ms). */
  retryMs?: number
  /** Tries per request: RFC 6886 allows nine (about a minute); fewer, so UPnP isn't kept waiting. */
  tries?: number
  /** How long to look for a UPnP gateway. */
  discoverMs?: number
  /** What to map: both for the torrent engine, TCP alone for remote access's HTTPS port (4.3c). */
  protocols?: readonly ('tcp' | 'udp')[]
}

/** RFC 6886 §3.3: the recommended lifetime, in seconds. */
export const PMP_LIFETIME = 7200
export const PMP_PORT = 5351
const DESCRIPTION = 'highsea'

/** The IPv4 default gateway from `/proc/net/route` (proc(5)): little-endian hex. Null elsewhere. */
export function defaultGateway(routes = '/proc/net/route'): string | null {
  let table: string
  try {
    table = readFileSync(routes, 'utf8')
  } catch {
    return null
  }
  for (const line of table.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/)
    if (f[1] !== '00000000' || !f[2] || f[2] === '00000000') continue
    const n = Number.parseInt(f[2], 16)
    return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24].join('.')
  }
  return null
}

/** The local IPv4 address on the gateway's subnet: the address a UPnP mapping points at. */
export function localAddressFor(gateway: string): string | null {
  const toNum = (a: string) => a.split('.').reduce((n, o) => n * 256 + Number(o), 0)
  const g = toNum(gateway)
  let fallback: string | null = null
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      fallback ??= a.address
      const mask = toNum(a.netmask)
      if ((toNum(a.address) & mask) >>> 0 === (g & mask) >>> 0) return a.address
    }
  return fallback
}

type PmpResult = { op: number; code: number; data: Buffer }

/** A NAT-PMP client on one UDP socket (RFC 6886 §3). */
function pmpClient(
  socket: dgram.Socket,
  gateway: string,
  port: number,
  retryMs: number,
  tries: number,
) {
  const waiting = new Map<number, (r: PmpResult) => void>()
  socket.on('message', (msg, from) => {
    // §3.1: answers come from the gateway's address and port, version 0, opcode 128 + request
    if (from.address !== gateway || from.port !== port || msg.length < 8 || msg[0] !== 0) return
    const op = (msg[1] as number) - 128
    const done = waiting.get(op)
    if (!done) return
    waiting.delete(op)
    done({ op, code: msg.readUInt16BE(2), data: msg })
  })
  const ask = async (op: number, body: Buffer, attempts = tries): Promise<PmpResult> => {
    const answer = new Promise<PmpResult>((resolve) => waiting.set(op, resolve))
    let wait = retryMs
    for (let i = 0; i < attempts; i++) {
      socket.send(body, port, gateway)
      let timer: ReturnType<typeof setTimeout> | undefined
      const r = await Promise.race([
        answer,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), wait)
          timer.unref?.()
        }),
      ])
      clearTimeout(timer)
      if (r) {
        if (r.code !== 0) throw new Error(`The router refused NAT-PMP (result ${r.code}).`)
        return r
      }
      wait *= 2
    }
    waiting.delete(op)
    throw new Error('The router didn’t answer NAT-PMP.')
  }
  return {
    async externalAddress(): Promise<string> {
      const r = await ask(0, Buffer.from([0, 0]))
      if (r.data.length < 12) throw new Error('The router’s NAT-PMP answer is short.')
      return [8, 9, 10, 11].map((i) => r.data[i]).join('.')
    },
    /** Maps (or with lifetime 0, deletes) a port: the external port and the lifetime granted. */
    async map(
      protocol: 'udp' | 'tcp',
      internal: number,
      external: number,
      lifetime: number,
      attempts?: number,
    ) {
      const op = protocol === 'udp' ? 1 : 2
      const body = Buffer.alloc(12)
      body.writeUInt8(0, 0)
      body.writeUInt8(op, 1)
      body.writeUInt16BE(internal, 4)
      body.writeUInt16BE(external, 6)
      body.writeUInt32BE(lifetime, 8)
      const r = await ask(op, body, attempts)
      if (r.data.length < 16) throw new Error('The router’s NAT-PMP answer is short.')
      return { externalPort: r.data.readUInt16BE(10), lifetime: r.data.readUInt32BE(12) }
    },
  }
}

export type PortMapper = ReturnType<typeof createPortMapper>

export function createPortMapper(options: PortMapperOptions) {
  const retryMs = options.retryMs ?? 250
  const tries = options.tries ?? 4
  const pmpPort = options.pmpPort ?? PMP_PORT
  const withUdp = (options.protocols ?? ['tcp', 'udp']).includes('udp')
  let status: MappingStatus | null = null
  let generation = 0
  let mapped: number | null = null
  let renewTimer: ReturnType<typeof setTimeout> | null = null
  let pmp: ReturnType<typeof pmpClient> | null = null
  let pmpSocket: dgram.Socket | null = null
  let upnpGateway: UpnpGateway | null = null
  let running: Promise<void> | null = null

  const closePmpSocket = () => {
    try {
      pmpSocket?.close()
    } catch {
      // the factory closed it already, on a rebind
    }
    pmpSocket = null
  }

  const loadUpnp = async (): Promise<UpnpClient> => {
    const lib = await import('@achingbrain/nat-port-mapper')
    return lib.upnpNat({ description: DESCRIPTION }) as unknown as UpnpClient
  }

  const viaPmp = async (port: number, mine: number): Promise<boolean> => {
    const gateway = (options.gateway ?? defaultGateway)()
    if (!gateway) return false
    try {
      const socket = await options.udp()
      if (mine !== generation) {
        socket.close()
        return true
      }
      pmpSocket = socket
      const client = pmpClient(socket, gateway, pmpPort, retryMs, tries)
      pmp = client
      // §3.3: a renewal asks for the external ports the router gave last time
      const external = { udp: port, tcp: port }
      const renew = async () => {
        const udp = withUdp ? await client.map('udp', port, external.udp, PMP_LIFETIME) : null
        const tcp = await client.map('tcp', port, external.tcp, PMP_LIFETIME)
        external.udp = udp?.externalPort ?? external.udp
        external.tcp = tcp.externalPort
        if (mine !== generation) return
        // §3.3: renew halfway to expiry, from the shorter lifetime the router granted
        const seconds = Math.max(1, Math.min(udp?.lifetime ?? tcp.lifetime, tcp.lifetime) / 2)
        renewTimer = setTimeout(() => {
          renew().catch((e) =>
            options.log('warn', 'The NAT-PMP mapping couldn’t be renewed.', { error: String(e) }),
          )
        }, seconds * 1000)
        renewTimer.unref?.()
        return tcp.externalPort
      }
      const externalPort = await renew()
      if (mine !== generation || externalPort === undefined) return true
      const externalAddress = await client.externalAddress().catch(() => null)
      mapped = port
      status = { via: 'nat-pmp', externalPort, externalAddress }
      options.log('info', 'Opened the listening port with NAT-PMP.', { gateway, ...status })
      return true
    } catch (e) {
      if (mine !== generation) return true
      pmp = null
      closePmpSocket()
      options.log('info', 'NAT-PMP didn’t open the port.', { gateway, error: String(e) })
      return false
    }
  }

  const viaUpnp = async (port: number, mine: number): Promise<boolean> => {
    if (options.upnp === null || mine !== generation) return false
    try {
      const client = await (options.upnp ?? loadUpnp)()
      let found: UpnpGateway | null = null
      for await (const g of client.findGateways({
        signal: AbortSignal.timeout(options.discoverMs ?? 10_000),
      })) {
        found = g
        break
      }
      if (!found) throw new Error('No UPnP gateway answered.')
      if (mine !== generation) {
        await found.stop()
        return true
      }
      upnpGateway = found
      const host = localAddressFor(found.host) ?? '0.0.0.0'
      const tcp = await found.map(port, host, { protocol: 'TCP', description: DESCRIPTION })
      if (withUdp) await found.map(port, host, { protocol: 'UDP', description: DESCRIPTION })
      if (mine !== generation) return true
      mapped = port
      status = {
        via: 'upnp',
        externalPort: tcp.externalPort,
        externalAddress: tcp.externalHost || null,
      }
      options.log('info', 'Opened the listening port with UPnP.', {
        gateway: found.host,
        ...status,
      })
      return true
    } catch (e) {
      options.log('warn', 'highsea couldn’t open the listening port with NAT-PMP or UPnP.', {
        error: String(e),
      })
      return false
    }
  }

  const mapper = {
    status: () => status,
    /** Whether a mapping is being made or is in place. */
    active: () => running !== null || mapped !== null,

    /** Maps `port` (TCP and UDP, or `protocols`). Never throws: a router that won't is logged. */
    start(port: number): Promise<void> {
      if (mapper.active()) return running ?? Promise.resolve()
      const mine = ++generation
      running = (async () => {
        if (!(await viaPmp(port, mine))) await viaUpnp(port, mine)
      })().finally(() => {
        if (mine === generation) running = null
      })
      return running
    },

    /** Removes the mapping: NAT-PMP's lifetime 0 (one try each), UPnP's `stop()`. */
    async stop(): Promise<void> {
      generation++
      running = null
      if (renewTimer) clearTimeout(renewTimer)
      renewTimer = null
      const port = mapped
      const client = pmp
      const gateway = upnpGateway
      mapped = null
      status = null
      pmp = null
      upnpGateway = null
      if (client && port !== null)
        await Promise.allSettled([
          ...(withUdp ? [client.map('udp', port, 0, 0, 1)] : []),
          client.map('tcp', port, 0, 0, 1),
        ])
      closePmpSocket()
      if (gateway) await gateway.stop().catch(() => {})
    },
  }
  return mapper
}
