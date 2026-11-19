// SPDX-License-Identifier: AGPL-3.0-only
// Web seeds (BEP 19, webseed.ts) against a web server on loopback inside the test: a torrent with
// no peers at all downloads from HTTP alone, single-file and as an Internet Archive-style folder
// (a `url-list` ending in `/`, a padding file, a redirect to another address); a seed that answers
// wrongly or sends bad data is dropped and the good one finishes; a busy seed backs off and is
// tried again; the download limit and the binding hold for web seeds as for peers. No network.
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { parseTorrentFile } from '../src/index.ts'
import { webSeedUrl } from '../src/webseed.ts'
import {
  LOOPBACK,
  makeTorrent,
  randomData,
  type TestFile,
  tempDir,
  testEngine,
  until,
} from './helpers.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

type Served = {
  url: string
  requests: { path: string; range: string | undefined; local: string | undefined }[]
  close(): Promise<void>
}

/**
 * A web server on 127.0.0.1 serving `files` (by URL path) with byte ranges, as RFC 9110 § 14
 * describes. `answer` may replace the answer for a request: a status, a redirect, or wrong data.
 */
async function webSeed(
  files: Record<string, Uint8Array>,
  answer?: (
    path: string,
    n: number,
  ) => { status: number; location?: string } | 'ignore-range' | 'corrupt' | null,
): Promise<Served> {
  const requests: Served['requests'] = []
  let n = 0
  const server = http.createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    requests.push({ path, range: req.headers.range, local: req.socket.remoteAddress })
    const special = answer?.(path, n++) ?? null
    if (special && typeof special === 'object') {
      res.writeHead(special.status, special.location ? { location: special.location } : {})
      res.end()
      return
    }
    const data = files[path]
    if (!data) {
      res.writeHead(404)
      res.end()
      return
    }
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
    if (!m || special === 'ignore-range') {
      res.writeHead(200, { 'content-length': data.length })
      res.end(Buffer.from(data))
      return
    }
    const from = Number(m[1])
    const to = Math.min(Number(m[2]), data.length - 1)
    let body = Buffer.from(data.subarray(from, to + 1))
    if (special === 'corrupt') body = Buffer.alloc(body.length, 7)
    res.writeHead(206, {
      'content-range': `bytes ${from}-${to}/${data.length}`,
      'content-length': body.length,
    })
    res.end(body)
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  }
}

async function leecher(options: Parameters<typeof testEngine>[0] = {}, bind = true) {
  const b = testEngine({ webSeeds: { backoff: { firstMs: 50, maxMs: 200 } }, ...options })
  cleanups.push(() => b.engine.close())
  await b.engine.start()
  if (bind) await b.engine.setBinding(LOOPBACK)
  return b
}

const same = (path: string, data: Uint8Array) =>
  Buffer.from(readFileSync(path)).equals(Buffer.from(data))

describe('web seeds (BEP 19)', () => {
  test('URLs: a name added after a slash, a folder’s path after its name', () => {
    expect(webSeedUrl('http://m.example/pub/', { urlPath: 'Sintel.mkv' })).toBe(
      'http://m.example/pub/Sintel.mkv',
    )
    expect(webSeedUrl('http://m.example/f.mkv', { urlPath: 'Sintel.mkv' })).toBe(
      'http://m.example/f.mkv',
    )
    // BEP 19's own example: http://mirror.com/pub/ + michael + Readme.txt
    expect(webSeedUrl('http://mirror.com/pub/', { urlPath: 'michael/Readme.txt' })).toBe(
      'http://mirror.com/pub/michael/Readme.txt',
    )
    expect(webSeedUrl('http://mirror.com/pub', { urlPath: 'michael/Read%20me.txt' })).toBe(
      'http://mirror.com/pub/michael/Read%20me.txt',
    )
  })

  test('url-list: one address or a list, HTTP only, each once; padding files known', () => {
    const files: TestFile[] = [
      { path: 'Film/a b.mp4', data: new Uint8Array(100) },
      { path: 'Film/.____padding_file/0', data: new Uint8Array(32_668), attr: 'p' },
      { path: 'Film/c.srt', data: new Uint8Array(10) },
    ]
    const list = makeTorrent({
      name: 'Film',
      files,
      urlList: [
        'https://archive.org/download/',
        'ftp://x.example/',
        'https://archive.org/download/',
      ],
    })
    const m = parseTorrentFile(list.torrent)
    expect(m.webSeeds).toEqual(['https://archive.org/download/'])
    expect(m.files.map((f) => [f.urlPath, f.pad])).toEqual([
      ['Film/a%20b.mp4', false],
      ['Film/.____padding_file/0', true],
      ['Film/c.srt', false],
    ])
    const one = makeTorrent({
      name: 'x.mkv',
      files: [{ path: 'x.mkv', data: new Uint8Array(10) }],
      urlList: 'http://m.example/x.mkv',
    })
    expect(parseTorrentFile(one.torrent).webSeeds).toEqual(['http://m.example/x.mkv'])
  })

  test('a single file with no peers and no trackers downloads from the web seed alone', async () => {
    const data = randomData(700_000)
    const web = await webSeed({ '/pub/Sintel.mkv': data })
    cleanups.push(() => web.close())
    const t = makeTorrent({
      name: 'Sintel.mkv',
      files: [{ path: 'Sintel.mkv', data }],
      urlList: `${web.url}/pub/`,
    })
    const b = await leecher()
    const dir = tempDir('web')
    const { id } = await b.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => b.engine.get(id).state === 'seeding', 15_000, 'the web seed download')

    expect(same(join(dir, 'Sintel.mkv'), data)).toBe(true)
    // ranges, never the whole file, and every one from the binding's address
    expect(web.requests.length).toBeGreaterThan(1)
    expect(
      web.requests.every(
        (r) => r.path === '/pub/Sintel.mkv' && /^bytes=\d+-\d+$/.test(r.range ?? ''),
      ),
    ).toBe(true)
    expect(
      b.sockets.filter((s) => s.kind === 'http').every((s) => s.localAddress === '127.0.0.1'),
    ).toBe(true)
    expect(b.engine.get(id).webSeeds).toEqual([
      { url: `${web.url}/pub/`, status: 'working', message: null, downRate: expect.any(Number) },
    ])

    // the web seed is stored with the torrent: a restart still has it
    await b.engine.close()
    const again = testEngine({ db: b.database })
    cleanups.push(() => again.engine.close())
    await again.engine.start()
    expect(again.engine.get(id).webSeeds.map((w) => w.url)).toEqual([`${web.url}/pub/`])
  }, 30_000)

  test('an Internet Archive-style folder: name and path, a padding file, a redirect', async () => {
    const video = randomData(600_000)
    const subs = randomData(20_000)
    const pad = new Uint8Array(32 * 1024 - (video.length % (32 * 1024)))
    const files: TestFile[] = [
      { path: 'HisGirlFriday1940/His Girl Friday.mp4', data: video },
      { path: 'HisGirlFriday1940/.____padding_file/0', data: pad, attr: 'p' },
      { path: 'HisGirlFriday1940/His Girl Friday.srt', data: subs },
    ]
    // the item's address redirects to a data node, as archive.org/download/ does
    const node = await webSeed({
      '/0/items/HisGirlFriday1940/His Girl Friday.mp4': video,
      '/0/items/HisGirlFriday1940/His Girl Friday.srt': subs,
    })
    cleanups.push(() => node.close())
    const front = await webSeed({}, (path) => ({
      status: 302,
      location: `${node.url}/0/items${path.replace('/download', '')}`,
    }))
    cleanups.push(() => front.close())
    const t = makeTorrent({ name: 'HisGirlFriday1940', files, urlList: [`${front.url}/download/`] })
    const b = await leecher()
    const dir = tempDir('web')
    const { id } = await b.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => b.engine.get(id).state === 'seeding', 15_000, 'the folder')

    expect(same(join(dir, 'HisGirlFriday1940', 'His Girl Friday.mp4'), video)).toBe(true)
    expect(same(join(dir, 'HisGirlFriday1940', 'His Girl Friday.srt'), subs)).toBe(true)
    // the padding file was never asked for; the front was asked once per file, then the node
    expect([...front.requests, ...node.requests].some((r) => r.path.includes('padding'))).toBe(
      false,
    )
    expect(new Set(front.requests.map((r) => r.path))).toEqual(
      new Set([
        '/download/HisGirlFriday1940/His Girl Friday.mp4',
        '/download/HisGirlFriday1940/His Girl Friday.srt',
      ]),
    )
    expect(front.requests.length).toBeLessThan(node.requests.length)
  }, 30_000)

  test('a seed that answers wrongly is dropped; bad data drops another; the good one finishes', async () => {
    const data = randomData(400_000)
    // the good seed is busy at first, so the others' answers come in and are checked first
    const good = await webSeed({ '/Sintel.mkv': data }, (_path, n) =>
      n < 4 ? { status: 503 } : null,
    )
    const missing = await webSeed({})
    const liar = await webSeed({ '/Sintel.mkv': data }, () => 'corrupt')
    const noRanges = await webSeed({ '/Sintel.mkv': data }, () => 'ignore-range')
    for (const s of [good, missing, liar, noRanges]) cleanups.push(() => s.close())
    const urls = [missing, liar, noRanges, good].map((s) => `${s.url}/`)
    const t = makeTorrent({
      name: 'Sintel.mkv',
      files: [{ path: 'Sintel.mkv', data }],
      urlList: urls,
    })
    const b = await leecher()
    const dir = tempDir('web')
    const { id } = await b.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => b.engine.get(id).state === 'seeding', 20_000, 'the good seed')
    expect(same(join(dir, 'Sintel.mkv'), data)).toBe(true)

    const status = new Map(b.engine.get(id).webSeeds.map((w) => [w.url, w]))
    expect(status.get(`${missing.url}/`)).toMatchObject({ status: 'error' })
    expect(status.get(`${missing.url}/`)?.message).toContain('doesn’t have Sintel.mkv')
    expect(status.get(`${liar.url}/`)).toMatchObject({
      status: 'error',
      message: 'It sent data that doesn’t match the torrent.',
    })
    expect(status.get(`${good.url}/`)).toMatchObject({ status: 'working', message: null })
    // a 404 is asked again only until the third wrong answer, then never
    expect(missing.requests.length).toBeLessThanOrEqual(3 * 2)
    // a server that ignores ranges is only any use from the file's start
    expect(status.get(`${noRanges.url}/`)?.status).not.toBe('working')
  }, 30_000)

  test('a busy seed backs off and is tried again', async () => {
    const data = randomData(200_000)
    const busy = await webSeed({ '/Sintel.mkv': data }, (_path, n) =>
      n < 3 ? { status: 503 } : null,
    )
    cleanups.push(() => busy.close())
    const t = makeTorrent({
      name: 'Sintel.mkv',
      files: [{ path: 'Sintel.mkv', data }],
      urlList: `${busy.url}/Sintel.mkv`,
    })
    const b = await leecher()
    const dir = tempDir('web')
    const { id } = await b.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => b.engine.get(id).webSeeds[0]?.status === 'error', 5_000, 'the first refusal')
    expect(b.engine.get(id).webSeeds[0]?.message).toContain('is busy (HTTP 503)')
    await until(() => b.engine.get(id).state === 'seeding', 15_000, 'the retry')
    expect(same(join(dir, 'Sintel.mkv'), data)).toBe(true)
    expect(b.engine.get(id).webSeeds[0]?.status).toBe('working')
  }, 30_000)

  test('the download limit and the binding hold for web seeds as for peers', async () => {
    const data = randomData(900_000)
    const web = await webSeed({ '/Sintel.mkv': data })
    cleanups.push(() => web.close())
    const t = makeTorrent({
      name: 'Sintel.mkv',
      files: [{ path: 'Sintel.mkv', data }],
      urlList: `${web.url}/`,
    })
    const b = await leecher({ limits: { downloadRate: 200_000 } }, false)
    const dir = tempDir('web')
    const { id } = await b.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })

    // no binding: no request leaves
    await new Promise((r) => setTimeout(r, 300))
    expect(web.requests).toHaveLength(0)
    expect(b.sockets).toHaveLength(0)

    const started = Date.now()
    await b.engine.setBinding(LOOPBACK)
    await until(() => b.engine.get(id).progress > 0.2, 10_000, 'some progress')
    // 200 KB/s with a one-second burst: a fifth of 900 KB can't come in under half a second
    expect(Date.now() - started).toBeGreaterThan(400)

    // the tunnel drops: nothing more is asked, nothing more arrives
    await b.engine.setBinding(null)
    await new Promise((r) => setTimeout(r, 200))
    const asked = web.requests.length
    const at = b.engine.get(id).progress
    await new Promise((r) => setTimeout(r, 1_200))
    expect(web.requests.length).toBe(asked)
    expect(b.engine.get(id).progress).toBe(at)

    // back, unlimited: it finishes
    b.engine.setLimits({ downloadRate: 0 })
    await b.engine.setBinding(LOOPBACK)
    await until(() => b.engine.get(id).state === 'seeding', 15_000, 'the rest')
    expect(same(join(dir, 'Sintel.mkv'), data)).toBe(true)
    expect(
      b.sockets.filter((s) => s.kind === 'http').every((s) => s.localAddress === '127.0.0.1'),
    ).toBe(true)
  }, 40_000)
})
