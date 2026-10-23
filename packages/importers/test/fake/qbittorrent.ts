// SPDX-License-Identifier: AGPL-3.0-only
// A fake qBittorrent WebUI on 127.0.0.1: the Web API v2 routes the importer reads, in the shapes
// the qBittorrent wiki gives (https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)).
// `auth/login` answers "Ok." with a `SID` cookie, or "Fails."; every other route wants the cookie
// (403 without it). Tests add torrents with their `.torrent` bytes; no real instance's data.
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export const FAKE_QBT_USER = 'admin'
export const FAKE_QBT_PASSWORD = 'fake-qbt-password'

export type FakeQbtTorrent = {
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
  seeding_time: number
  /** Served by `torrents/export`. */
  torrent: Uint8Array
  files: { name: string; size: number; priority: number }[]
}

export type FakeQbtState = {
  username: string
  password: string
  version: string
  webApi: string
  torrents: FakeQbtTorrent[]
  categories: Record<string, { name: string; savePath: string }>
}

export function qbtState(patch: Partial<FakeQbtState> = {}): FakeQbtState {
  return {
    username: FAKE_QBT_USER,
    password: FAKE_QBT_PASSWORD,
    version: 'v5.0.2',
    webApi: '2.11.2',
    torrents: [],
    categories: {
      radarr: { name: 'radarr', savePath: '/downloads/radarr' },
      'linux/isos': { name: 'linux/isos', savePath: '' },
    },
    ...patch,
  }
}

export async function startFakeQbittorrent(initial: FakeQbtState = qbtState()) {
  const state = initial
  const sid = 'fake-sid-0001'
  const requests: string[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8')
    })
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://fake')
      requests.push(`${req.method} ${url.pathname}${url.search}`)
      const text = (status: number, t: string, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'Content-Type': 'text/plain', ...headers })
        res.end(t)
      }
      const json = (v: unknown) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(v))
      }
      if (url.pathname === '/api/v2/auth/login' && req.method === 'POST') {
        const form = new URLSearchParams(body)
        if (form.get('username') === state.username && form.get('password') === state.password)
          return text(200, 'Ok.', { 'Set-Cookie': `SID=${sid}; HttpOnly; path=/; SameSite=Strict` })
        return text(200, 'Fails.')
      }
      if (!(req.headers.cookie ?? '').includes(`SID=${sid}`)) return text(403, 'Forbidden')
      const hash = url.searchParams.get('hash')?.toLowerCase()
      const t = state.torrents.find((x) => x.hash === hash)
      switch (url.pathname) {
        case '/api/v2/app/version':
          return text(200, state.version)
        case '/api/v2/app/webapiVersion':
          return text(200, state.webApi)
        case '/api/v2/torrents/info':
          return json(state.torrents.map(({ torrent: _t, files: _f, ...rest }) => rest))
        case '/api/v2/torrents/categories':
          return json(state.categories)
        case '/api/v2/torrents/properties':
          if (!t) return text(404, 'Not Found')
          return json({
            save_path: t.save_path,
            total_uploaded: t.uploaded,
            total_downloaded: t.downloaded,
            seeding_time: t.seeding_time,
            share_ratio: t.downloaded ? t.uploaded / t.downloaded : 0,
          })
        case '/api/v2/torrents/files':
          if (!t) return text(404, 'Not Found')
          return json(
            t.files.map((f, index) => ({ index, ...f, progress: t.progress, is_seed: false })),
          )
        case '/api/v2/torrents/export':
          if (!t) return text(404, 'Not Found')
          res.writeHead(200, { 'Content-Type': 'application/x-bittorrent' })
          return res.end(Buffer.from(t.torrent))
      }
      text(404, 'Not Found')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

export type FakeQbittorrent = Awaited<ReturnType<typeof startFakeQbittorrent>>
