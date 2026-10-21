// SPDX-License-Identifier: AGPL-3.0-only
// qBittorrent's WebUI API v2 (https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)):
// log in with a username and password for the `SID` cookie, then read. `torrents/export` arrived in
// Web API 2.8.18, qBittorrent 4.5.0 (WebAPI_Changelog.md:
// https://github.com/qbittorrent/qBittorrent/blob/master/WebAPI_Changelog.md), so older versions
// are refused with the version needed. Only reads: the importer changes nothing in qBittorrent.
import { AppError, type Fetch } from '@highsea/core'
import { baseUrl, jsonOf, request } from '../shared/http.ts'

export type QbtConnection = { url: string; username: string; password: string }

/** `torrents/info`: the fields this importer uses. Limits: -2 is the global one, -1 none. */
export type QbtTorrent = {
  hash: string
  name: string
  size: number
  category: string
  save_path: string
  progress: number
  state: string
  ratio_limit: number
  seeding_time_limit: number
  uploaded: number
  downloaded: number
  seeding_time?: number
}

export type QbtProperties = {
  save_path: string
  total_uploaded: number
  total_downloaded: number
  seeding_time: number
}

/** `torrents/files`: priority 0 is "do not download", 1 normal, 6 high, 7 maximal. */
export type QbtFile = { index?: number; name: string; size: number; priority: number }

export type QbtCategory = { name: string; savePath: string }

/** The first Web API version with `torrents/export`, and the qBittorrent release it shipped in. */
export const MIN_WEB_API = '2.8.18'
export const MIN_QBITTORRENT = '4.5.0'

/** `2.8.18` against `2.8.5`, part by part. */
export function versionAtLeast(have: string, want: string): boolean {
  const a = have
    .replace(/^v/, '')
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
  const b = want.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return true
}

export function createQbtClient(fetch: Fetch, conn: QbtConnection) {
  const base = baseUrl(conn.url)
  let cookie: string | null = null

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    // qBittorrent's CSRF protection wants a Referer or Origin on the same host (the wiki's
    // Authentication section)
    headers.set('Referer', `${base}/`)
    if (cookie) headers.set('Cookie', cookie)
    const res = await request(fetch, 'qBittorrent', `${base}/api/v2/${path}`, {
      ...init,
      headers,
    })
    if (res.status === 403 && path !== 'auth/login')
      throw new AppError(
        'invalid',
        'qBittorrent refused the sign-in. Check the username and password.',
        {
          field: 'password',
          reason: 'bad-credentials',
        },
      )
    return res
  }

  async function text(path: string): Promise<string> {
    const res = await call(path)
    if (!res.ok)
      throw new AppError('unavailable', `qBittorrent answered ${res.status} for ${path}.`, {
        reason: 'bad-answer',
      })
    return (await res.text()).trim()
  }

  async function json<T>(path: string): Promise<T> {
    const res = await call(path)
    if (!res.ok)
      throw new AppError('unavailable', `qBittorrent answered ${res.status} for ${path}.`, {
        reason: 'bad-answer',
      })
    return jsonOf<T>('qBittorrent', res)
  }

  const hashQuery = (hash: string) => `hash=${encodeURIComponent(hash)}`

  return {
    /** Signs in; the `SID` cookie goes with every request after. */
    async login() {
      const res = await call('auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: conn.username, password: conn.password }).toString(),
      })
      if (res.status === 403)
        throw new AppError(
          'invalid',
          'qBittorrent has blocked this address after too many failed sign-ins. Try again later.',
          { reason: 'banned' },
        )
      const body = (await res.text()).trim()
      // "Fails." with a 200 is a wrong username or password
      if (!res.ok || body === 'Fails.')
        throw new AppError(
          'invalid',
          'qBittorrent refused the sign-in. Check the username and password.',
          { field: 'password', reason: 'bad-credentials' },
        )
      const sid = /(?:^|[;,]\s*)SID=([^;,\s]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1]
      // no cookie: qBittorrent lets this address in without signing in (its "bypass" settings)
      cookie = sid ? `SID=${sid}` : null
    },
    version: () => text('app/version'),
    webApiVersion: () => text('app/webapiVersion'),
    torrents: () => json<QbtTorrent[]>('torrents/info'),
    categories: () => json<Record<string, QbtCategory>>('torrents/categories'),
    properties: (hash: string) => json<QbtProperties>(`torrents/properties?${hashQuery(hash)}`),
    files: (hash: string) => json<QbtFile[]>(`torrents/files?${hashQuery(hash)}`),
    async export(hash: string): Promise<Uint8Array> {
      const res = await call(`torrents/export?${hashQuery(hash)}`)
      if (!res.ok)
        throw new AppError(
          'unavailable',
          `qBittorrent couldn’t export the torrent (${res.status}).`,
          {
            reason: 'bad-answer',
          },
        )
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}

export type QbtClient = ReturnType<typeof createQbtClient>

/** Signs in and checks the version: below Web API 2.8.18 it's refused with the version needed. */
export async function openQbt(fetch: Fetch, conn: QbtConnection) {
  const client = createQbtClient(fetch, conn)
  await client.login()
  const [version, webApi] = await Promise.all([client.version(), client.webApiVersion()])
  if (!versionAtLeast(webApi, MIN_WEB_API))
    throw new AppError(
      'invalid',
      `highsea needs qBittorrent ${MIN_QBITTORRENT} or later (Web API ${MIN_WEB_API}), which can export torrents. This one is ${version.replace(/^v/, '')} (Web API ${webApi}). Update qBittorrent, then try again.`,
      { reason: 'too-old', version, webApi },
    )
  return { client, version: version.replace(/^v/, ''), webApi }
}
