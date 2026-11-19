// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's upkeep through the API (indexer-catalog-upkeep.md, part C; ADR 0069): each
// definition's stage, status and last check, from a signed bundle built here, on the catalog's
// definitions and on installed indexers; a retired id's note on the indexer that still uses it;
// nothing for a private definition, nor from a bundle built before stages.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  emptyStages,
  generateSigningKey,
  retire,
  type StagesFile,
  sha256,
  signManifest,
  type TrustedKey,
} from '@highsea-tv/catalog'
import { buildCatalog, writeCatalog } from '@highsea-tv/catalog/build'
import { schema } from '@highsea-tv/db'
import { createApi } from '../src/api/app.ts'
import { bootRuntime, cleanup, clientFor, withOwner } from './helpers.ts'

const folders: string[] = []
afterEach(() => {
  cleanup()
  for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true })
})

const folder = (prefix: string) => {
  const f = mkdtempSync(join(tmpdir(), `highsea-${prefix}-`))
  folders.push(f)
  return f
}

/** A definition small enough to vary; JSON is YAML, so it's written as the build reads it. */
const definition = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  version: '1.0.0',
  minEngineVersion: '1.0.0',
  name: id[0]?.toUpperCase() + id.slice(1),
  description: `The ${id} feed.`,
  kind: 'rss',
  privacy: 'public',
  language: 'en',
  links: [`https://${id}.test/`],
  categories: [{ id: 'movies', standard: 2000 }],
  search: { request: { path: '/rss' } },
  source: { author: 'highsea tests', documentation: `https://${id}.test/docs` },
  license: 'CC0-1.0',
  ...patch,
})

const verifiedEntry = (name: string, checked: string, verified: string | null) => ({
  name,
  version: '1.0.0',
  channel: 'stable',
  result: verified === checked ? 'working' : 'failing',
  reason: verified === checked ? null : 'The test search: It found nothing.',
  checked,
  verified,
  counts: { probes: 2, working: verified === checked ? 2 : 0, releases: 10, withSize: 10 },
})

type StageEntry = StagesFile['definitions'][string]
const stageEntry = (name: string, patch: Partial<StageEntry> = {}): StageEntry => ({
  name,
  status: 'working',
  since: null,
  note: null,
  version: '1.0.0',
  firstSeen: '2026-10-01',
  passes: 4,
  failures: 0,
  ...patch,
})

/**
 * A signed seed with alpha (working), bravo (broken), a private definition the stages name, and
 * gone, retired (its file left, its note kept). `withStatus: false` writes the bundle as a build
 * before stages did: the same definitions, no `status`, signed again.
 */
function seed(withStatus: boolean) {
  const k = generateSigningKey()
  const key = { privateKey: k.privateKey, keyId: 'test' }
  const trusted: TrustedKey = { id: 'test', publicKey: k.publicKey }
  const root = folder('catalog-src')
  mkdirSync(join(root, 'definitions'))
  mkdirSync(join(root, 'beta'))
  const defs = [
    definition('alpha'),
    definition('bravo'),
    definition('hidden', { privacy: 'private' }),
  ]
  for (const d of defs)
    writeFileSync(join(root, 'definitions', `${d.id}.yml`), JSON.stringify(d, null, 2))
  writeFileSync(join(root, 'CHANGES.md'), '# Changes\n\n## 2026.11.20\n\n- The definitions.\n')
  writeFileSync(
    join(root, 'verified.json'),
    JSON.stringify({
      about: '',
      definitions: {
        alpha: verifiedEntry('Alpha', '2026-11-16', '2026-11-16'),
        bravo: verifiedEntry('Bravo', '2026-11-16', '2026-11-02'),
        hidden: verifiedEntry('Hidden', '2026-11-16', '2026-11-16'),
      },
    }),
  )
  const stages = retire(
    {
      ...emptyStages(),
      definitions: {
        alpha: stageEntry('Alpha'),
        bravo: stageEntry('Bravo', {
          status: 'broken',
          since: '2026-11-09',
          note: 'The site changed how it answers searches. A fix is being worked on.',
          failures: 2,
        }),
        hidden: stageEntry('Hidden'),
      },
    },
    'gone',
    'Gone',
    '1.0.0',
    'The site closed.',
    '2026-11-19',
  )
  writeFileSync(join(root, 'stages.json'), JSON.stringify(stages))
  const out = folder('seed')
  const built = buildCatalog({ root }, key)
  writeCatalog(built, out)
  if (!withStatus) {
    const stable = built[0] as { bundle: string; manifest: string | object }
    const { status: _, ...bundle } = JSON.parse(stable.bundle)
    const text = JSON.stringify(bundle)
    const manifest = JSON.parse(
      typeof stable.manifest === 'string' ? stable.manifest : JSON.stringify(stable.manifest),
    )
    const path = manifest.bundle.path
    manifest.bundle = { path, sha256: sha256(text), size: Buffer.byteLength(text) }
    writeFileSync(join(out, 'stable', path), text)
    writeFileSync(
      join(out, 'stable', 'manifest.json'),
      JSON.stringify(signManifest(JSON.stringify(manifest), key.privateKey, key.keyId)),
    )
  }
  return { seedDir: out, trustedKeys: [trusted], mainUrl: null }
}

async function started(withStatus: boolean) {
  const runtime = await bootRuntime({ catalog: seed(withStatus) })
  const app = createApi(runtime)
  const { token } = await withOwner(runtime)
  // an indexer set up while gone was still in the catalog: the row as the service wrote it
  const now = Date.now()
  runtime.db
    .insert(schema.indexers)
    .values(
      ['alpha', 'gone'].map((id) => ({
        id: `ix_${id}`,
        definitionId: id,
        definitionVersion: '1.0.0',
        name: `My ${id}`,
        enabled: true,
        priority: 25,
        settings: {},
        addedAt: now,
        updatedAt: now,
      })),
    )
    .run()
  return { runtime, api: clientFor(app, { token }) }
}

describe('the catalog’s upkeep', () => {
  test('each definition carries its stage, status, note and last check', async () => {
    const { api } = await started(true)
    const defs = await api.catalog.indexers()
    const byId = new Map(defs.map((d) => [d.id, d]))
    expect(byId.get('alpha')?.check).toEqual({
      stage: 'stable',
      status: 'working',
      since: null,
      note: null,
      checked: '2026-11-16',
      result: 'working',
      verified: '2026-11-16',
    })
    expect(byId.get('bravo')?.check).toEqual({
      stage: 'stable',
      status: 'broken',
      since: '2026-11-09',
      note: 'The site changed how it answers searches. A fix is being worked on.',
      checked: '2026-11-16',
      result: 'failing',
      verified: '2026-11-02',
    })
    // the weekly check skips private definitions: their silence would read as "not checked yet"
    expect(byId.get('hidden')).toBeDefined()
    expect(byId.get('hidden')?.check).toBeUndefined()
    // a retired definition's file left the bundle
    expect(byId.has('gone')).toBe(false)
  })

  test('an installed indexer carries it, a retired definition’s note included', async () => {
    const { api } = await started(true)
    const xs = await api.indexers.list()
    const alpha = xs.find((x) => x.id === 'ix_alpha')
    const gone = xs.find((x) => x.id === 'ix_gone')
    expect(alpha?.check).toMatchObject({ status: 'working', verified: '2026-11-16' })
    expect(gone).toMatchObject({ missing: true })
    expect(gone?.check).toMatchObject({
      stage: 'stable',
      status: 'retired',
      since: '2026-11-19',
      note: 'The site closed.',
    })
  })

  test('a bundle built before stages says nothing, and installs as before', async () => {
    const { api } = await started(false)
    const defs = await api.catalog.indexers()
    expect(defs.map((d) => d.id).sort()).toEqual(['alpha', 'bravo', 'hidden'])
    for (const d of defs) expect('check' in d).toBe(false)
    for (const x of await api.indexers.list()) expect('check' in x).toBe(false)
  })
})
