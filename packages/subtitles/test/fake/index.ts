// SPDX-License-Identifier: AGPL-3.0-only
// The fake subtitle providers (checkpoint 7's plan, "Tests"): OpenSubtitles.com, Subdl and
// SubSource behind one `Fetch`, each written from its API's documented shapes, as checkpoint 5's
// fake indexer is. Tests hand it to the adapters as the fetch seam, so nothing leaves the process;
// any other host throws, as an unreachable one would. It misbehaves on cue, per provider and path.
//
//   api.opensubtitles.com, vip-api.opensubtitles.com   /api/v1/login, /infos/user, /subtitles,
//                                                      /download
//   www.opensubtitles.com                              /download/{key}/subfile/{name}
//   api.subdl.com                                      /api/v1/subtitles, /api/v1/me
//   dl.subdl.com                                       /subtitle/{sd}-{id}.zip
//   api.subsource.net                                  /api/v1/movies/search, /subtitles,
//                                                      /subtitles/{id}/download
//
// No key, token or account in it is real.
import { type Clock, type Fetch, systemClock } from '@highsea/core'
import type { ProviderId } from '../../src/shared/types.ts'
import type { FakeSubtitle } from './fixtures.ts'
import { createFakeOpenSubtitles } from './opensubtitles.ts'
import { createFakeSubdl } from './subdl.ts'
import { createFakeSubSource } from './subsource.ts'
import { createWorld, json } from './world.ts'

export * from './fixtures.ts'
export { FAKE_SUBSOURCE_LIMIT } from './subsource.ts'
export { makeZip, type ZipFile } from './zip.ts'

export const FAKE_SUBTITLE_HOSTS = [
  'api.opensubtitles.com',
  'vip-api.opensubtitles.com',
  'www.opensubtitles.com',
  'api.subdl.com',
  'dl.subdl.com',
  'api.subsource.net',
]

const HOST_PROVIDER: Record<string, ProviderId> = {
  'api.opensubtitles.com': 'opensubtitles',
  'vip-api.opensubtitles.com': 'opensubtitles',
  'www.opensubtitles.com': 'opensubtitles',
  'api.subdl.com': 'subdl',
  'dl.subdl.com': 'subdl',
  'api.subsource.net': 'subsource',
}

export type FakeMisbehaviour =
  | { kind: 'status'; status: number; retryAfter?: string; body?: unknown }
  | { kind: 'slow'; ms: number }
  | { kind: 'malformed' }
  | { kind: 'network' }

export type FakeSubtitleRequest = { method: string; url: URL; headers: Headers; body: string }

export type FakeSubtitles = {
  fetch: Fetch
  requests: FakeSubtitleRequest[]
  add(sub: FakeSubtitle): void
  /**
   * Misbehaves for a provider: on every path, or only those starting with `path`
   * (`/api/v1/download`), for `times` requests or until it's cleared with null.
   */
  misbehave(
    provider: ProviderId,
    m: FakeMisbehaviour | null,
    options?: { path?: string; times?: number },
  ): void
  /** OpenSubtitles.com downloads left today (406 at 0). */
  setRemaining(n: number): void
  /** OpenSubtitles.com forgets every token it handed out, as when one expires. */
  expireTokens(): void
  /** Serves these bytes at this exact URL, in place of the fake's own; null goes back. */
  serve(url: string, bytes: Uint8Array | null): void
  /** POST /login requests to OpenSubtitles.com. */
  readonly logins: number
  /** POST /download requests OpenSubtitles.com counted. */
  readonly downloads: number
}

type Rule = { m: FakeMisbehaviour; path: string | null; times: number | null }

export function createFakeSubtitles(
  options: {
    /** Answer any movie with a few made-up results per language per provider (default true). */
    generate?: boolean
    /** OpenSubtitles.com downloads left today (default 20). */
    remainingDownloads?: number
    vip?: boolean
    /** Dates the quota's reset and SubSource's rate limit; the system clock by default. */
    clock?: Clock
  } = {},
): FakeSubtitles {
  const world = createWorld({
    clock: options.clock ?? systemClock,
    generate: options.generate ?? true,
    vip: options.vip ?? false,
    remaining: options.remainingDownloads ?? 20,
  })
  const requests: FakeSubtitleRequest[] = []
  const rules = new Map<ProviderId, Rule[]>()
  const handlers = {
    opensubtitles: createFakeOpenSubtitles(world),
    subdl: createFakeSubdl(world),
    subsource: createFakeSubSource(world),
  }

  function takeRule(provider: ProviderId, path: string): FakeMisbehaviour | null {
    const list = rules.get(provider) ?? []
    const rule = list.find((r) => r.path === null || path.startsWith(r.path))
    if (!rule) return null
    if (rule.times !== null && --rule.times <= 0) list.splice(list.indexOf(rule), 1)
    return rule.m
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const provider = HOST_PROVIDER[url.hostname]
    if (url.protocol !== 'https:' || !provider) throw new TypeError('fake: unknown host')
    const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text()
    requests.push({ method: request.method, url, headers: request.headers, body })

    const rule = takeRule(provider, url.pathname)
    if (rule?.kind === 'network') throw new TypeError('fetch failed')
    if (rule?.kind === 'slow')
      await new Promise<void>((resolve, reject) => {
        if (request.signal.aborted) return reject(request.signal.reason)
        const timer = setTimeout(resolve, rule.ms)
        request.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(request.signal.reason)
        })
      })
    if (rule?.kind === 'status')
      return json(rule.body ?? { message: 'Something went wrong' }, rule.status, {
        ...(rule.retryAfter ? { 'retry-after': rule.retryAfter } : {}),
      })
    if (rule?.kind === 'malformed')
      return new Response('{"data": [{"attributes": ', {
        headers: { 'content-type': 'application/json' },
      })

    const served = world.files.get(url.toString())
    if (served) return new Response(new Uint8Array(served))
    if (provider === 'opensubtitles') return handlers.opensubtitles(url, request, body)
    if (provider === 'subdl') return handlers.subdl(url)
    return handlers.subsource(url, request)
  }

  return {
    requests,
    fetch: (input, init) =>
      handle(
        input instanceof Request ? new Request(input, init) : new Request(String(input), init),
      ),
    add(sub) {
      world.added.push(sub)
    },
    misbehave(provider, m, opts = {}) {
      const list = rules.get(provider) ?? []
      const path = opts.path ?? null
      const kept = list.filter((r) => r.path !== path)
      if (m) kept.push({ m, path, times: opts.times ?? null })
      rules.set(provider, kept)
    },
    setRemaining(n) {
      world.remaining = n
    },
    expireTokens() {
      world.tokens.clear()
    },
    serve(url, bytes) {
      if (bytes) world.files.set(url, bytes)
      else world.files.delete(url)
    },
    get logins() {
      return world.logins
    },
    get downloads() {
      return world.downloads
    },
  }
}
