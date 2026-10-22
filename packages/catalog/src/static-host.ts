// SPDX-License-Identifier: AGPL-3.0-only
// A local stand-in for the static host a catalog is published to: a `Fetch` that answers from a
// directory, with an ETag per file and `304` for `If-None-Match`. Tests and the sweeps publish
// versions into the directory and the server checks them, with no network (the plan's rule).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import type { Fetch } from '@highsea-tv/core'
import { sha256 } from './signing.ts'

export type StaticHost = Fetch & { requests: string[] }

export function createStaticHost(dir: string, origin = 'https://catalog.test'): StaticHost {
  const requests: string[] = []
  const host = (async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    requests.push(url.pathname)
    if (url.origin !== origin) return new Response('Not this host.', { status: 502 })
    const path = normalize(join(dir, decodeURIComponent(url.pathname)))
    if (!path.startsWith(normalize(dir)) || !existsSync(path) || !statSync(path).isFile())
      return new Response('Not found.', { status: 404 })
    const body = readFileSync(path)
    const etag = `"${sha256(body).slice(0, 16)}"`
    const asked = new Headers(init?.headers).get('if-none-match')
    if (asked === etag) return new Response(null, { status: 304, headers: { etag } })
    return new Response(body, {
      status: 200,
      headers: { etag, 'content-type': 'application/json', 'content-length': String(body.length) },
    })
  }) as StaticHost
  host.requests = requests
  return host
}
