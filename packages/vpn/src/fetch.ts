// SPDX-License-Identifier: AGPL-3.0-only
// A `Fetch` whose connections leave from one local address, and whose names are looked up from it
// too: the exit check's bound half, and indexer searches when they go through the VPN (answer V6).
// The global fetch can't pick its local address without undici's own Agent, which Bun doesn't
// honour, so this speaks node:http and node:https with `localAddress` and `lookup`
// (https://nodejs.org/docs/latest-v24.x/api/http.html#httprequesturl-options-callback). Names are
// resolved with a `dns.Resolver` sending from the same address to the tunnel's resolvers
// (https://nodejs.org/docs/latest-v24.x/api/dns.html#resolversetlocaladdressipv4-ipv6), so a lookup
// takes the tunnel's routing rule like everything else from that address.
//
// It covers what highsea's callers use: GET and POST, a string, form or bytes body, headers in and
// out (several Set-Cookie lines kept), redirects followed (up to 5) or handed back, and an abort
// signal.
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { isIP } from 'node:net'
import type { Fetch } from '@highsea/core'

const MAX_REDIRECTS = 5

export type BoundFetchOptions = {
  /** Resolvers to ask from the bound address; empty asks the system's. */
  dns?: readonly string[]
}

function lookupFrom(localAddress: string, servers: readonly string[]): LookupFunction | undefined {
  if (!servers.length) return undefined
  const resolver = new dns.Resolver({ timeout: 5_000, tries: 2 })
  const family = isIP(localAddress)
  // Bun's Resolver may lack setLocalAddress; production runs Node, which has it
  resolver.setLocalAddress?.(
    family === 4 ? localAddress : '0.0.0.0',
    family === 6 ? localAddress : '::0',
  )
  resolver.setServers([...servers])
  return (hostname, options, callback) => {
    const all = typeof options === 'object' && options !== null && options.all === true
    const wantV6 = family === 6
    const resolve = wantV6 ? resolver.resolve6.bind(resolver) : resolver.resolve4.bind(resolver)
    resolve(hostname, (err, addresses) => {
      if (err || !addresses.length)
        return (callback as (e: Error | null) => void)(
          err ?? Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }),
        )
      const f = wantV6 ? 6 : 4
      if (all)
        (callback as (e: null, a: { address: string; family: number }[]) => void)(
          null,
          addresses.map((address) => ({ address, family: f })),
        )
      else (callback as (e: null, a: string, f: number) => void)(null, addresses[0] as string, f)
    })
  }
}

async function bodyOf(body: unknown): Promise<Buffer | undefined> {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return Buffer.from(body)
  if (body instanceof URLSearchParams) return Buffer.from(body.toString())
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength)
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  throw new TypeError('This fetch takes a string, form or bytes body.')
}

export function boundFetch(localAddress: string, options: BoundFetchOptions = {}): Fetch {
  const lookup = lookupFrom(localAddress, options.dns ?? [])

  const once = (
    url: URL,
    method: string,
    headers: Headers,
    body: Buffer | undefined,
    signal: AbortSignal | undefined,
  ) =>
    new Promise<{ status: number; headers: Headers; body: Buffer }>((resolve, reject) => {
      if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return reject(new TypeError(`Can’t fetch ${url.protocol} addresses.`))
      const out: Record<string, string> = {}
      headers.forEach((v, k) => {
        out[k] = v
      })
      if (body) out['content-length'] = String(body.byteLength)
      const client = url.protocol === 'https:' ? https : http
      const req = client.request(url, {
        method,
        headers: out,
        localAddress,
        ...(lookup ? { lookup } : {}),
        ...(signal ? { signal } : {}),
      })
      req.on('response', (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const h = new Headers()
          for (let i = 0; i < res.rawHeaders.length; i += 2)
            h.append(res.rawHeaders[i] as string, res.rawHeaders[i + 1] as string)
          resolve({ status: res.statusCode ?? 502, headers: h, body: Buffer.concat(chunks) })
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.end(body)
    })

  return async (input, init) => {
    const request = input instanceof Request ? input : null
    let url = new URL(request ? request.url : String(input))
    let method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const headers = new Headers(init?.headers ?? request?.headers)
    let body = await bodyOf(init?.body ?? undefined)
    if (body && init?.body instanceof URLSearchParams && !headers.has('content-type'))
      headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8')
    const signal = init?.signal ?? request?.signal ?? undefined
    const redirect = init?.redirect ?? 'follow'
    for (let hop = 0; ; hop++) {
      const res = await once(url, method, headers, body, signal)
      const location = res.headers.get('location')
      if (redirect === 'follow' && location && [301, 302, 303, 307, 308].includes(res.status)) {
        if (hop >= MAX_REDIRECTS) throw new TypeError('Too many redirects.')
        const next = new URL(location, url)
        // the Fetch standard's redirect rules: 303, and 301 or 302 after a POST, become a GET
        if (
          res.status === 303 ||
          ((res.status === 301 || res.status === 302) && method === 'POST')
        ) {
          method = 'GET'
          body = undefined
          headers.delete('content-type')
        }
        if (next.origin !== url.origin) headers.delete('authorization')
        url = next
        continue
      }
      if (redirect === 'error' && location && res.status >= 300 && res.status < 400)
        throw new TypeError('A redirect where none was allowed.')
      const nullBody = res.status === 204 || res.status === 304 || method === 'HEAD'
      const response = new Response(nullBody ? null : new Uint8Array(res.body), {
        status: res.status,
        headers: res.headers,
      })
      Object.defineProperty(response, 'url', { value: url.toString() })
      return response
    }
  }
}
