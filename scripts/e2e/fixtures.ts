// SPDX-License-Identifier: AGPL-3.0-only
// The end-to-end run's other side (phase-3-checkpoint-9.md › Tests (9a)): everything the server
// would otherwise reach on the internet, on one Docker network with no way out (compose.e2e.yaml).
// It runs in the Dockerfile's `e2e-fixtures` stage, and holds the harnesses the in-process run
// (apps/server/test/sintel-e2e.test.ts) and the server sweep already use, behind network ports:
//
// - :4000, HTTP:
//   - /catalog/{stable,beta}/: the catalog, built from catalog/indexers and signed with the
//     development key, plus one definition of its own: a public Torznab indexer at this service,
//     which setup adds in one click;
//   - /e2e/search, the catalog's indexer, and /dl/{id}.torrent, the fake indexer's downloads,
//     serving Sintel.2010.1080p.BluRay.x264-GRP as a real torrent of a generated clip;
//   - anything the server sends with `x-highsea-forwarded-url` (HIGHSEA_FIXTURES_URL, server.ts):
//     TMDB from the recordings in packages/metadata, and the subtitle providers from their fakes,
//     where Subdl has Sintel's official English subtitle, 2.5 s late;
//   - /ready: 200 once the clip is seeding.
// - A tracker (HTTP and UDP) and a seeding engine on 6882, for the clip: 330 seconds (Sintel's
//   runtime makes anything under 300 a sample) of black 1080p, speaking 52 seconds of Sintel.
// - :3000, the browser's way in: a plain proxy to the server, which is on the closed network only.
//   It keeps the Host header and streams, so the server sees what a browser sends it.
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { join } from 'node:path'
import { buildCatalog, buildVpnProviderCatalog, writeCatalog } from '@highsea-tv/catalog/build'
import { createFakeIndexer, RELEASES } from '@highsea-tv/indexers/fake'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { createFakeSubtitles } from '@highsea-tv/subtitles/fake'
import { makeSyncClip, sintel } from '@highsea-tv/subtitles/testing'
import {
  makeTorrent,
  startTracker,
  tempDir,
  testEngine,
  until,
  writeFiles,
} from '@highsea-tv/torrent/testing'

const ROOT = join(import.meta.dir, '../..')
const HOST = process.env.FIXTURES_HOST ?? 'fixtures'
const ORIGIN = `http://${HOST}:4000`
const SERVER = { host: process.env.FIXTURES_SERVER ?? 'highsea', port: 3000 }
const RELEASE = 'Sintel.2010.1080p.BluRay.x264-GRP'
const RELEASE_ID = 101
const SINTEL = 45745
const TMDB = new Set(['api.themoviedb.org', 'image.tmdb.org'])

/** An SRT's every time moved by `ms`. */
const shiftSrt = (text: string, ms: number) =>
  text.replace(/(\d\d):(\d\d):(\d\d),(\d\d\d)/g, (_, h, m, sec, milli) => {
    const t = Math.max(0, ((+h * 60 + +m) * 60 + +sec) * 1000 + +milli + ms)
    const pad = (n: number, w = 2) => String(n).padStart(w, '0')
    return `${pad(Math.floor(t / 3_600_000))}:${pad(Math.floor(t / 60_000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`
  })

// ---------------------------------------------------------------- the catalog

const catalogSource = tempDir('catalog')
cpSync(join(ROOT, 'catalog/indexers'), catalogSource, { recursive: true })
// public, so setup offers it with a checkbox and no settings; JSON, because the catalog's format
// gives a Torznab indexer an API key (ADR 0033). It answers from /e2e/search below.
writeFileSync(
  join(catalogSource, 'definitions', 'e2e-indexer.yml'),
  `# SPDX-License-Identifier: CC0-1.0
id: e2e-indexer
version: 1.0.0
minEngineVersion: 1.0.0
name: Harbor Test Indexer
description: The end-to-end run's indexer, on the fixtures service.
kind: json
privacy: public
language: en
starter: true
links: ['${ORIGIN}/']
categories:
  - { id: '2040', standard: 2040, name: Movies HD }
search:
  request:
    path: /e2e/search
    query:
      q: '{{ .Query.Keywords }}'
  rows: { path: torrents }
  fields:
    _id: { path: id }
    title: { path: name }
    guid: { path: id, filters: [{ filter: prepend, value: 'e2e:' }] }
    download: { text: '/dl/{{ .Result._id }}.torrent' }
    size: { path: size, filters: [{ filter: size }] }
    seeders: { path: seeders }
    leechers: { path: leechers }
    category: { path: cat }
    published: { path: added, filters: [{ filter: date, format: unix }] }
    imdbId: { path: imdb, optional: true }
  supports: [q]
errors:
  - { path: error }
rateLimit: { requests: 30, seconds: 60 }
test: { keywords: '' }
source:
  author: highsea
  documentation: https://github.com/highsea-tv/highsea-tv/blob/main/scripts/e2e/fixtures.ts
license: CC0-1.0
`,
)
// newer than the server's seed, so the server takes this one
const changes = readFileSync(join(catalogSource, 'CHANGES.md'), 'utf8')
writeFileSync(
  join(catalogSource, 'CHANGES.md'),
  changes.replace('\n## ', '\n## 2099.1.1\n\n- The end-to-end run’s indexer.\n\n## '),
)
const catalogDir = tempDir('catalog-out')
const key = {
  privateKey: readFileSync(join(ROOT, 'catalog/keys/development.pem'), 'utf8'),
  keyId: 'development',
}
writeCatalog(buildCatalog({ root: catalogSource }, key), catalogDir)
// the VPN providers too, which the server checks on the same channel (scripts/catalog.ts)
writeCatalog(
  buildVpnProviderCatalog({ root: join(ROOT, 'catalog/vpn-providers') }, key),
  join(catalogDir, 'vpn-providers'),
)

// ---------------------------------------------------------------- the release, seeded

const clipDir = tempDir('clip')
const clip = new Uint8Array(
  readFileSync(
    makeSyncClip(join(clipDir, 'sintel.mkv'), {
      audio: 'sintel',
      seconds: 330,
      size: '1920x1080',
    }),
  ),
)
const files = [{ path: `${RELEASE}/${RELEASE}.mkv`, data: clip }]
const tracker = await startTracker({ host: '0.0.0.0' })
const trackerPort = new URL(tracker.httpUrl).port
const torrent = makeTorrent({
  name: RELEASE,
  files,
  // by address: the tracker records each peer at the address its announce came from, and the
  // seeder must announce over the closed network (compose.e2e.yaml)
  announce: [`http://${process.env.FIXTURES_ADDRESS ?? HOST}:${trackerPort}/announce`],
})
const seedDir = tempDir('seed')
writeFiles(seedDir, files)
const seeder = testEngine({ port: 6882, dht: { enabled: false } })
await seeder.engine.start()
await seeder.engine.setBinding({ address: null, dns: [] })
const seeding = await seeder.engine.add({
  source: { torrent: torrent.torrent },
  savePath: seedDir,
  category: 'movies',
})
await until(() => seeder.engine.get(seeding.id).state === 'seeding', 30_000, 'the seeder')

// ---------------------------------------------------------------- the services

const indexer = createFakeIndexer({ origin: ORIGIN })
indexer.serve(RELEASE_ID, torrent.torrent)
const tmdb = createReplayFetch()
const subtitles = createFakeSubtitles({ generate: false })
subtitles.add({
  provider: 'subdl',
  tmdbId: SINTEL,
  language: 'en',
  releaseName: RELEASE,
  content: shiftSrt(sintel.srt(), 2_500),
})

const forwarded: string[] = []
Bun.serve({
  port: 4000,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url)
    const original = req.headers.get('x-highsea-forwarded-url')
    if (original) {
      const target = new URL(original)
      forwarded.push(`${req.method} ${target.host}${target.pathname}`)
      const headers = new Headers(req.headers)
      headers.delete('x-highsea-forwarded-url')
      const init = {
        method: req.method,
        headers,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      }
      if (TMDB.has(target.hostname)) return tmdb(new Request(target, init))
      return subtitles.fetch(new Request(target, init))
    }
    if (url.pathname === '/ready') return new Response('ready')
    // the indexer's search: the fake's Sintel release, which /dl/101.torrent serves as the clip
    if (url.pathname === '/e2e/search') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const release = RELEASES.find((r) => r.id === RELEASE_ID)
      const hit = release && (!q || release.name.toLowerCase().includes(q.split(' ')[0] ?? ''))
      return Response.json({
        torrents: hit
          ? [
              {
                id: release.id,
                name: release.name,
                size: release.size,
                seeders: release.seeders,
                leechers: release.leechers,
                cat: '2040',
                added: Math.floor(Date.now() / 1000) - 86_400,
                imdb: release.imdbId,
              },
            ]
          : [],
      })
    }
    // what the server asked the outside for, for the run's report
    if (url.pathname === '/forwarded') return Response.json(forwarded)
    if (url.pathname.startsWith('/catalog/')) {
      const file = Bun.file(join(catalogDir, url.pathname.slice('/catalog/'.length)))
      return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 })
    }
    return indexer.handle(req)
  },
})

createServer((req, res) => {
  const upstream = request(
    { ...SERVER, method: req.method, path: req.url, headers: req.headers },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.pipe(upstream)
}).listen(3000, '0.0.0.0')

console.log(`fixtures: ready at ${ORIGIN}, seeding ${RELEASE}, proxying :3000 to ${SERVER.host}`)

const stop = async () => {
  await seeder.engine.close()
  await tracker.close()
  for (const dir of [catalogSource, catalogDir, clipDir, seedDir])
    rmSync(dir, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGTERM', () => void stop())
process.on('SIGINT', () => void stop())
