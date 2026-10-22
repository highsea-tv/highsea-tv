// SPDX-License-Identifier: AGPL-3.0-only
// Writes the API's OpenAPI document to openapi.json, so changes to the contract show up in review.
// `--check` fails when it's stale.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, loadConfig } from '@highsea-tv/runtime'
import pkg from '../package.json' with { type: 'json' }
import { createApi } from '../src/api/app.ts'

const dir = mkdtempSync(join(tmpdir(), 'highsea-openapi-'))
const runtime = await boot({
  config: loadConfig({
    HIGHSEA_CONFIG_DIR: join(dir, 'config'),
    HIGHSEA_DATA_DIR: join(dir, 'data'),
  }),
  version: pkg.version,
  quiet: true,
  memory: true,
  manualTicks: true,
})
const doc = await (await createApi(runtime).request('/api/v1/openapi.json')).json()
await runtime.shutdown()
rmSync(dir, { recursive: true, force: true })

const out = `${JSON.stringify(doc, null, 2)}\n`
const target = join(import.meta.dir, '..', 'openapi.json')
if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {}
  if (current !== out) {
    console.error('openapi.json is stale: run `bun run openapi` in apps/server')
    process.exit(1)
  }
  console.log('openapi.json is up to date')
} else {
  writeFileSync(target, out)
  console.log('wrote openapi.json')
}
