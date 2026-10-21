// SPDX-License-Identifier: AGPL-3.0-only
// Private Internet Access, through the API its own scripts document: pia-foss/manual-connections
// (https://github.com/pia-foss/manual-connections, MIT). Each call follows a script:
//
// - get_token.sh: POST https://www.privateinternetaccess.com/api/client/v2/token with the form
//   fields `username` and `password`; the answer's `token` lasts 24 hours.
// - get_region.sh: GET https://serverlist.piaservers.net/vpninfo/servers/v6. The JSON is the first
//   line (a signature follows); `regions[]` have `id`, `name`, `port_forward` and `servers.wg[]`
//   with `ip` and `cn`.
// - connect_to_wireguard_with_token.sh: GET https://{cn}:1337/addKey?pt={token}&pubkey={key},
//   connecting to the server's `ip` (curl's --connect-to) and trusting only PIA's CA (--cacert
//   ca.rsa.4096.crt). The answer has `status` "OK", `peer_ip`, `server_key`, `server_port` and
//   `dns_servers`; the configuration is Address = peer_ip, PublicKey = server_key, AllowedIPs =
//   0.0.0.0/0, Endpoint = {ip}:{server_port}, PersistentKeepalive = 25.
// - port_forwarding.sh: through the tunnel, GET https://{cn}:19999/getSignature?token={token} at
//   the WireGuard server's address; the answer's `payload` is base64 JSON with `port` and
//   `expires_at`, beside a `signature`. Then GET https://{cn}:19999/bindPort?payload=…&signature=…,
//   and again every 15 minutes to keep the port.
//
// Every request goes through a transport, so tests answer with a fake PIA and nothing leaves the
// machine. The username and password go in a POST body, never a URL or a log.
import https from 'node:https'
import { generateWireGuardKeys } from './keys.ts'
import { PIA_CA } from './pia-ca.ts'
import type { TunnelSpec } from './tunnel.ts'
import { isWireGuardKey } from './wireguard.ts'

export const PIA_URLS = {
  token: 'https://www.privateinternetaccess.com/api/client/v2/token',
  servers: 'https://serverlist.piaservers.net/vpninfo/servers/v6',
}
/** port_forwarding.sh: "The port will be bound every 15 minutes". */
export const PIA_BIND_EVERY_MS = 15 * 60_000

export type PiaRequest = {
  method: 'GET' | 'POST'
  url: string
  /** Connect to this address, with the URL's host as the TLS name (curl's --connect-to). */
  connectTo?: string
  /** Leave from this address: the tunnel's, for port forwarding. */
  localAddress?: string
  form?: Record<string, string>
}
export type PiaResponse = { status: number; body: string }
export type PiaTransport = (request: PiaRequest) => Promise<PiaResponse>

export class PiaError extends Error {
  readonly kind: 'refused' | 'unreachable' | 'answer'
  constructor(kind: 'refused' | 'unreachable' | 'answer', message: string) {
    super(message)
    this.name = 'PiaError'
    this.kind = kind
  }
}

/**
 * node:https, trusting PIA's CA for PIA's own servers (the scripts' --cacert) and the system's for
 * its websites. `servername` keeps the certificate check on the server's name while connecting to
 * its address (https://nodejs.org/docs/latest-v24.x/api/tls.html#tlsconnectoptions-callback).
 */
export function httpsTransport(timeoutMs = 20_000): PiaTransport {
  return (r) =>
    new Promise((resolve, reject) => {
      const url = new URL(r.url)
      const body = r.form ? new URLSearchParams(r.form).toString() : undefined
      const req = https.request(
        {
          method: r.method,
          host: r.connectTo ?? url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          servername: url.hostname,
          headers: {
            host: url.host,
            'user-agent': 'highsea',
            ...(body
              ? {
                  'content-type': 'application/x-www-form-urlencoded',
                  'content-length': String(Buffer.byteLength(body)),
                }
              : {}),
          },
          ...(r.connectTo ? { ca: PIA_CA } : {}),
          ...(r.localAddress ? { localAddress: r.localAddress } : {}),
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 502,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          )
          res.on('error', reject)
        },
      )
      req.on('timeout', () => req.destroy(new Error('PIA didn’t answer in time.')))
      req.on('error', reject)
      req.end(body)
    })
}

export type PiaRegion = {
  id: string
  name: string
  portForward: boolean
  server: { ip: string; cn: string }
}

export type PiaForward = { port: number; expiresAt: number; payload: string; signature: string }

function json(body: string, what: string): Record<string, unknown> {
  try {
    const v = JSON.parse(body) as unknown
    if (v && typeof v === 'object') return v as Record<string, unknown>
  } catch {}
  throw new PiaError('answer', `PIA’s ${what} answer wasn’t what highsea expected.`)
}

export function createPia(transport: PiaTransport = httpsTransport()) {
  async function send(request: PiaRequest, what: string): Promise<PiaResponse> {
    try {
      return await transport(request)
    } catch (e) {
      throw new PiaError('unreachable', `Couldn’t reach PIA’s ${what}: ${(e as Error).message}`)
    }
  }

  return {
    /** A token for the username and password; PIA's refusal throws `refused`. */
    async token(username: string, password: string): Promise<string> {
      const res = await send(
        { method: 'POST', url: PIA_URLS.token, form: { username, password } },
        'sign-in',
      )
      if (res.status === 401 || res.status === 403)
        throw new PiaError('refused', 'PIA didn’t accept that username and password.')
      if (res.status !== 200) throw new PiaError('answer', `PIA’s sign-in answered ${res.status}.`)
      const token = json(res.body, 'sign-in').token
      if (typeof token !== 'string' || !token)
        throw new PiaError('refused', 'PIA didn’t accept that username and password.')
      return token
    },

    /** The regions with a WireGuard server. */
    async regions(): Promise<PiaRegion[]> {
      const res = await send({ method: 'GET', url: PIA_URLS.servers }, 'server list')
      if (res.status !== 200)
        throw new PiaError('answer', `PIA’s server list answered ${res.status}.`)
      const list = json(res.body.split('\n')[0] ?? '', 'server list').regions
      if (!Array.isArray(list)) throw new PiaError('answer', 'PIA’s server list has no regions.')
      const out: PiaRegion[] = []
      for (const r of list as Record<string, unknown>[]) {
        const wg = (r.servers as { wg?: { ip?: unknown; cn?: unknown }[] } | undefined)?.wg?.[0]
        if (typeof r.id !== 'string' || typeof r.name !== 'string') continue
        if (typeof wg?.ip !== 'string' || typeof wg.cn !== 'string') continue
        out.push({
          id: r.id,
          name: r.name,
          portForward: r.port_forward === true,
          server: { ip: wg.ip, cn: wg.cn },
        })
      }
      return out
    },

    /**
     * Registers a new key with a region's WireGuard server and returns the tunnel to build: the
     * scripts' configuration, with a key highsea made itself.
     */
    async connect(
      region: PiaRegion,
      token: string,
    ): Promise<{ spec: TunnelSpec; dns: string[]; server: PiaRegion['server'] }> {
      const keys = generateWireGuardKeys()
      const url = new URL(`https://${region.server.cn}:1337/addKey`)
      url.searchParams.set('pt', token)
      url.searchParams.set('pubkey', keys.publicKey)
      const res = await send(
        { method: 'GET', url: url.toString(), connectTo: region.server.ip },
        'WireGuard server',
      )
      const a = json(res.body, 'WireGuard server')
      if (a.status !== 'OK') throw new PiaError('answer', 'PIA’s WireGuard server refused the key.')
      const peerIp = a.peer_ip
      const serverKey = a.server_key
      const serverPort = Number(a.server_port)
      if (typeof peerIp !== 'string' || typeof serverKey !== 'string' || !isWireGuardKey(serverKey))
        throw new PiaError('answer', 'PIA’s WireGuard server answered without a key or address.')
      if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535)
        throw new PiaError('answer', 'PIA’s WireGuard server answered without a port.')
      const dns = Array.isArray(a.dns_servers)
        ? a.dns_servers.filter((d): d is string => typeof d === 'string')
        : []
      return {
        spec: {
          privateKey: keys.privateKey,
          addresses: [peerIp.includes('/') ? peerIp : `${peerIp}/32`],
          peers: [
            {
              publicKey: serverKey,
              presharedKey: null,
              endpoint: { host: region.server.ip, port: serverPort },
              allowedIps: ['0.0.0.0/0'],
              persistentKeepalive: 25,
            },
          ],
          mtu: null,
        },
        dns,
        server: region.server,
      }
    },

    /** Asks for a forwarded port, through the tunnel. */
    async signature(
      server: PiaRegion['server'],
      token: string,
      localAddress: string,
    ): Promise<PiaForward> {
      const url = new URL(`https://${server.cn}:19999/getSignature`)
      url.searchParams.set('token', token)
      const res = await send(
        { method: 'GET', url: url.toString(), connectTo: server.ip, localAddress },
        'port forwarding',
      )
      const a = json(res.body, 'port forwarding')
      if (a.status !== 'OK' || typeof a.payload !== 'string' || typeof a.signature !== 'string')
        throw new PiaError(
          'answer',
          'PIA didn’t give a forwarded port. Pick a region that forwards ports.',
        )
      const payload = json(Buffer.from(a.payload, 'base64').toString('utf8'), 'port forwarding')
      const port = Number(payload.port)
      const expiresAt = Date.parse(String(payload.expires_at))
      if (!Number.isInteger(port) || port < 1 || port > 65535 || Number.isNaN(expiresAt))
        throw new PiaError('answer', 'PIA’s forwarded port wasn’t what highsea expected.')
      return { port, expiresAt, payload: a.payload, signature: a.signature }
    },

    /** Binds the port, and keeps it bound when called again within 15 minutes. */
    async bind(server: PiaRegion['server'], forward: PiaForward, localAddress: string) {
      const url = new URL(`https://${server.cn}:19999/bindPort`)
      url.searchParams.set('payload', forward.payload)
      url.searchParams.set('signature', forward.signature)
      const res = await send(
        { method: 'GET', url: url.toString(), connectTo: server.ip, localAddress },
        'port forwarding',
      )
      if (json(res.body, 'port forwarding').status !== 'OK')
        throw new PiaError('answer', 'PIA didn’t keep the forwarded port.')
    },
  }
}

export type Pia = ReturnType<typeof createPia>

/** A region by the name the owner picked, or its id. */
export function findRegion(regions: readonly PiaRegion[], wanted: string): PiaRegion | undefined {
  const w = wanted.trim().toLowerCase()
  return regions.find((r) => r.name.toLowerCase() === w) ?? regions.find((r) => r.id === w)
}
