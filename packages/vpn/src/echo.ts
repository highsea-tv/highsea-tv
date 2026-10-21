// SPDX-License-Identifier: AGPL-3.0-only
// The exit check's IP echo service (docs/plans/phase-3-checkpoint-6.md › The checks, judgement
// call 16). The default is ifconfig.co, which needs no key and documents a JSON answer with `ip`
// and `country` (https://ifconfig.co, "How do I get this programmatically?" and "Can I force
// getting JSON?"); it runs echoip, BSD-3-Clause (https://github.com/mpolden/echoip). Its FAQ allows
// automated use under one request a minute; highsea asks once from each address every 5 minutes,
// plus Check now. It's a setting, so an owner can point it at their own
// echoip, or at any service answering `ip` (or `public_ip`) in JSON, or the bare address as text.
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import type { Fetch } from '@highsea/core'

export const DEFAULT_ECHO_URL = 'https://ifconfig.co/json'

export type Echo = { ip: string; country: string | null }

/** Reads an echo service's answer: JSON with `ip` or `public_ip` (and maybe `country`), or text. */
export function parseEcho(body: string): Echo | null {
  const trimmed = body.trim()
  if (isIP(trimmed)) return { ip: trimmed, country: null }
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>
    const ip = typeof json.ip === 'string' ? json.ip : json.public_ip
    if (typeof ip !== 'string' || !isIP(ip)) return null
    return { ip, country: typeof json.country === 'string' && json.country ? json.country : null }
  } catch {
    return null
  }
}

export async function askEcho(fetch: Fetch, url: string, timeoutMs = 10_000): Promise<Echo> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`The echo service answered with HTTP ${res.status}.`)
  const echo = parseEcho(await res.text())
  if (!echo) throw new Error('The echo service’s answer has no address.')
  return echo
}

/**
 * A `Fetch` whose requests leave from `localAddress`, for the bound half of the exit check. The
 * global `fetch` can't choose its local address without undici's own Agent, so this asks with
 * node:http's `localAddress` (https://nodejs.org/docs/latest-v24.x/api/http.html#httprequesturl-options-callback),
 * as the torrent engine's tracker requests do. GET only, which is all the echo needs.
 */
export function boundFetch(localAddress: string): Fetch {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(input instanceof Request ? input.url : input)
      const client = url.protocol === 'https:' ? https : http
      const headers: Record<string, string> = {}
      new Headers(init?.headers).forEach((v, k) => {
        headers[k] = v
      })
      const req = client.get(url, { localAddress, headers, signal: init?.signal ?? undefined })
      req.on('response', (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502 })),
        )
        res.on('error', reject)
      })
      req.on('error', reject)
    })
}
