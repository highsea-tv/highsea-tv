// SPDX-License-Identifier: AGPL-3.0-only
// The platform under Node, the server's runtime (ADR 0019): `bun test` covers bun:sqlite; this
// covers better-sqlite3, workers and the API on a real file database. Run with `node`; exits 1 on
// the first failure. CI runs it after the tests.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineJob } from '@highsea/jobs'
import { boot, loadConfig } from '@highsea/runtime'
import { z } from 'zod'
import { createApi } from '../src/api/app.ts'

const dir = mkdtempSync(join(tmpdir(), 'highsea-smoke-'))
const config = loadConfig({
  HIGHSEA_CONFIG_DIR: join(dir, 'config'),
  HIGHSEA_DATA_DIR: join(dir, 'data'),
})
try {
  const runtime = await boot({ config, version: '0.0.0-smoke', quiet: true, manualTicks: true })
  assert.equal(runtime.database.driver, 'node', 'production runs on better-sqlite3')

  const api = createApi(runtime)
  const health = await api.request('/api/health')
  assert.equal(health.status, 200)
  const info = (await (await api.request('/api/v1/system/info/public')).json()) as { id: string }
  assert.equal(info.id, runtime.identity().id)

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

  const sealed = runtime.sealer.seal('secret')
  assert.equal(runtime.sealer.open(sealed), 'secret')
  await runtime.shutdown()

  // a second boot on the same files: same identity, nothing to migrate
  const again = await boot({ config, version: '0.0.0-smoke', quiet: true, manualTicks: true })
  assert.equal(again.identity().id, info.id)
  assert.equal(again.sealer.open(sealed), 'secret')
  await again.shutdown()
  console.log('smoke: ok under Node', process.version)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
