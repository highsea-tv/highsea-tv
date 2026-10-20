// SPDX-License-Identifier: AGPL-3.0-only
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEventBus, createFakeClock, type ServerEvent, silentLogger } from '@highsea/core'
import { type Db, migrate, openDatabase } from '@highsea/db'
import { createJobQueue } from '@highsea/jobs'
import { stringify } from 'yaml'
import { buildCatalog, writeCatalog } from '../src/build.ts'
import { createCatalog } from '../src/service.ts'
import { generateSigningKey, type TrustedKey } from '../src/signing.ts'
import { createStaticHost } from '../src/static-host.ts'

/** A definition small enough to vary per test. */
export function definition(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    version: '1.0.0',
    minEngineVersion: '1.0.0',
    name: id,
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
  }
}

export const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), `highsea-${prefix}-`))

/** A catalog source tree: definitions, CHANGES.md with one entry per version given. */
export function sources(defs: object[], versions: string[], beta: object[] = []) {
  const root = tmp('catalog-src')
  mkdirSync(join(root, 'definitions'))
  mkdirSync(join(root, 'beta'))
  for (const d of defs)
    writeFileSync(join(root, 'definitions', `${(d as { id: string }).id}.yml`), stringify(d))
  for (const d of beta)
    writeFileSync(join(root, 'beta', `${(d as { id: string }).id}.yml`), stringify(d))
  writeFileSync(
    join(root, 'CHANGES.md'),
    `# Changes\n\n${versions.map((v) => `## ${v}\n\n- Changes in ${v}.\n`).join('\n')}`,
  )
  return root
}

export function keyPair(id = 'test') {
  const k = generateSigningKey()
  return {
    privateKey: k.privateKey,
    keyId: id,
    trusted: { id, publicKey: k.publicKey } as TrustedKey,
  }
}

/** Builds a catalog from definitions and writes it to `out` (a seed dir or the host's root). */
export function publish(
  out: string,
  key: { privateKey: string; keyId: string },
  defs: object[],
  versions: string[],
) {
  const built = buildCatalog({ root: sources(defs, versions) }, key)
  writeCatalog(built, out)
  return built
}

export function setup(options: {
  db?: Db
  seedDir?: string | null
  mainUrl?: string | null
  trusted: TrustedKey[]
  configDir?: string
  hostDir?: string
}) {
  const database = options.db ? null : openDatabase(':memory:')
  if (database) migrate(database.raw)
  const db = options.db ?? (database?.db as Db)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const hostDir = options.hostDir ?? tmp('host')
  const fetch = createStaticHost(hostDir)
  const configDir = options.configDir ?? tmp('config')
  const catalog = createCatalog({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    fetch,
    configDir,
    trustedKeys: options.trusted,
    seedDir: options.seedDir ?? null,
    mainUrl: options.mainUrl === undefined ? 'https://catalog.test' : options.mainUrl,
  })
  return { db, clock, events, seen, jobs, fetch, hostDir, configDir, catalog }
}

export function copyDir(from: string, to: string) {
  cpSync(from, to, { recursive: true })
}
