// SPDX-License-Identifier: AGPL-3.0-only
// The platform under Node, the server's runtime (ADR 0019): `bun test` covers bun:sqlite; this
// covers better-sqlite3, workers, the API and the torrent engine on a real file database. Run with
// `node`; exits 1 on the first failure. CI runs it after the tests. TMDB answers from the
// recordings (ADR 0029), so the metadata package and the image cache run as production runs them,
// without the network; the engine listens on a free port with no DHT and a torrent with no
// trackers. It runs on the Node in `.nvmrc` only (`bun run smoke` checks before anything loads).
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { issueDevice } from '@highsea/auth'
import { defineJob } from '@highsea/jobs'
import { createReplayFetch } from '@highsea/metadata/replay'
import { boot, loadConfig } from '@highsea/runtime'
import { makeTorrent, randomData, until, writeFiles } from '@highsea/torrent/testing'
import { z } from 'zod'
import { assertNodeVersion } from '../../../scripts/check-node.ts'
import { createApi } from '../src/api/app.ts'

assertNodeVersion()

const dir = mkdtempSync(join(tmpdir(), 'highsea-smoke-'))
const config = loadConfig({
  HIGHSEA_CONFIG_DIR: join(dir, 'config'),
  HIGHSEA_DATA_DIR: join(dir, 'data'),
})
try {
  const replay = createReplayFetch()
  // the engine listens on a free port, without the DHT: nothing reaches the network
  const torrent = { port: 0, dht: false }
  const runtime = await boot({
    config,
    version: '0.0.0-smoke',
    quiet: true,
    manualTicks: true,
    fetch: replay,
    torrent,
  })
  assert.equal(runtime.database.driver, 'node', 'production runs on better-sqlite3')

  const api = createApi(runtime)
  const health = await api.request('/api/health')
  assert.equal(health.status, 200)
  const info = (await (await api.request('/api/v1/system/info/public')).json()) as { id: string }
  assert.equal(info.id, runtime.identity().id)

  // a recorded Discover, through the API as an app calls it, and a poster from the image cache
  const meta = { address: '127.0.0.1', userAgent: 'smoke' }
  const owner = await runtime.auth.createOwner(
    { username: 'smoke', displayName: 'Smoke', password: 'a long enough password' },
    meta,
  )
  const token = issueDevice(runtime.auth.ctx, owner.id, 'password', meta, {
    name: 'smoke',
    client: 'tvos',
    appVersion: '0.0.0',
  }).secret
  await runtime.metadata.settings.setKey('smoke-key')
  // the recordings' region
  runtime.metadata.settings.update({ region: 'US' })
  const authorization = { authorization: `Bearer ${token}` }
  const discover = await api.request('/api/v1/discover/movies?list=popular', {
    headers: authorization,
  })
  assert.equal(discover.status, 200)
  const page = (await discover.json()) as { items: { art: { poster: string | null } }[] }
  assert.ok(page.items.length > 0, 'Discover lists the recorded movies')
  const poster = page.items.find((m) => m.art.poster)?.art.poster
  assert.ok(poster, 'a recorded movie has a poster')
  const image = await api.request(poster, { headers: authorization })
  assert.equal(image.status, 200)
  assert.match(image.headers.get('content-type') ?? '', /^image\//)
  // whole, decodable bytes: a JPEG starts FF D8 FF, a PNG 89 50 4E 47
  const bytes = new Uint8Array(await image.arrayBuffer())
  const head = Buffer.from(bytes.subarray(0, 4)).toString('hex')
  assert.ok(head.startsWith('ffd8ff') || head === '89504e47', `image bytes start ${head}`)
  assert.equal(Number(image.headers.get('content-length') ?? bytes.byteLength), bytes.byteLength)

  // the seed catalog, verified with the development key and installed at boot (checkpoint 5)
  const catalog = await api.request('/api/v1/catalog', { headers: authorization })
  assert.equal(catalog.status, 200)
  const status = (await catalog.json()) as { version: string | null }
  assert.ok(status.version, 'the seed catalog is installed')
  const definitions = await api.request('/api/v1/catalog/indexers', { headers: authorization })
  assert.ok(((await definitions.json()) as unknown[]).length > 0, 'the seed has definitions')

  let ran = 0
  runtime.jobs.define(
    defineJob({
      type: 'smoke',
      payload: z.object({ n: z.number() }),
      run: async ({ n }) => {
        ran += n
      },
    }),
  )
  const id = runtime.jobs.enqueue('smoke', { n: 2 })
  await runtime.jobs.tick()
  await runtime.jobs.idle()
  assert.equal(ran, 2)
  assert.equal(runtime.jobs.get(id)?.status, 'succeeded')

  // the torrent engine (checkpoint 6): it binds its port once the VPN, off here, says it may, and
  // checks a file already on disk with SHA-1 in the worker pool, as production does
  await until(() => runtime.engine.status().listening, 10_000, 'the engine to listen')
  const files = [{ path: 'smoke/smoke.bin', data: randomData(300_000) }]
  const savePath = join(config.dataDir, 'downloads', 'manual')
  writeFiles(savePath, files)
  const made = makeTorrent({ name: 'smoke', files })
  const added = await runtime.engine.add({
    source: { torrent: made.torrent },
    savePath,
    category: 'manual',
    manual: true,
  })
  await until(() => runtime.engine.get(added.id).state === 'seeding', 20_000, 'the check')

  const sealed = runtime.sealer.seal('secret')
  assert.equal(runtime.sealer.open(sealed), 'secret')
  await runtime.shutdown()

  // a second boot on the same files: same identity, nothing to migrate
  const again = await boot({
    config,
    version: '0.0.0-smoke',
    quiet: true,
    manualTicks: true,
    torrent,
  })
  // shutdown wrote the resume data, so the torrent is whole at boot, without a recheck, and seeds
  // once the binding arrives (until then it waits as queued)
  const resumed = again.engine.get(added.id)
  assert.notEqual(resumed.state, 'checking', 'fast resume trusted the files')
  assert.equal(resumed.progress, 1)
  await until(() => again.engine.get(added.id).state === 'seeding', 10_000, 'it to seed again')
  assert.equal(again.identity().id, info.id)
  assert.equal(again.sealer.open(sealed), 'secret')
  await again.shutdown()
  console.log('smoke: ok under Node', process.version)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
