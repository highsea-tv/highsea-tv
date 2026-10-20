// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createEventBus,
  createFakeClock,
  createLogger,
  createSealer,
  generateSecretKey,
  memorySink,
  type ServerEvent,
} from '@highsea/core'
import { migrate, openDatabase } from '@highsea/db'
import { createJobQueue } from '@highsea/jobs'
import {
  defaultQualitySizes,
  type QualityProfile,
  seedFormats,
  seedProfiles,
} from '@highsea/quality'
import { type Definition, formatIssues, validateDefinition } from '@highsea/schemas/indexers'
import type { DefinitionSource, SourceDefinition } from '../src/context.ts'
import { createIndexers } from '../src/index.ts'
import type { SearchInput } from '../src/search.ts'
import { createFakeIndexer, FAKE_NOW, MOVIES } from './fake/index.ts'

const CATALOG = join(import.meta.dir, '../../../catalog/indexers/definitions')

/** A definition from the repository's catalog, as it ships. */
export function catalogDefinition(id: string): Definition {
  const raw = Bun.YAML.parse(readFileSync(join(CATALOG, `${id}.yml`), 'utf8'))
  const result = validateDefinition(raw)
  if (!result.ok) throw new Error(`${id}: ${formatIssues(result.errors)}`)
  return result.definition
}

/** A catalog in memory that tests can change under a running service. */
export function memorySource(initial: Definition[] = []) {
  const defs = new Map<string, SourceDefinition>(
    initial.map((d) => [d.id, { definition: d, origin: 'main', logo: null }]),
  )
  const listeners = new Set<Parameters<DefinitionSource['onDefinitionsChanged']>[0]>()
  const source: DefinitionSource & {
    put(d: Definition, origin?: string): void
    drop(id: string): void
  } = {
    definitions: () => [...defs.values()],
    definition: (id) => defs.get(id) ?? null,
    onDefinitionsChanged(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    put(d, origin = 'main') {
      defs.set(d.id, { definition: d, origin, logo: null })
      for (const l of listeners) l([{ id: d.id, definition: d }])
    },
    drop(id) {
      defs.delete(id)
      for (const l of listeners) l([{ id, definition: null }])
    },
  }
  return source
}

export function setup(options: { definitions?: Definition[]; timeoutMs?: number } = {}) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock(FAKE_NOW)
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const fake = createFakeIndexer()
  const source = memorySource(options.definitions ?? [])
  const logs = memorySink()
  const sleeps: number[] = []
  const sealer = createSealer(generateSecretKey())
  const indexers = createIndexers({
    db,
    jobs,
    clock,
    logger: createLogger({ sinks: [logs], level: 'debug', clock }),
    events,
    sealer,
    fetch: fake.fetch,
    definitions: source,
    sleep: async (ms) => {
      sleeps.push(ms)
      clock.advance(ms)
    },
    random: () => 0.5,
    timeoutMs: options.timeoutMs ?? 2000,
  })
  return { db, raw, clock, events, seen, jobs, fake, source, logs, sleeps, sealer, indexers }
}

const profiles = seedProfiles()
export const hd = profiles.find((p) => p.id === 'qp-hd') as QualityProfile
export const any = profiles.find((p) => p.id === 'qp-any') as QualityProfile

/** A search for Sintel with the seeded profiles, formats and sizes. */
export function sintelSearch(profile: QualityProfile = hd): SearchInput {
  return {
    tmdbId: MOVIES.sintel.tmdbId,
    imdbId: MOVIES.sintel.imdbId,
    title: MOVIES.sintel.title,
    year: MOVIES.sintel.year,
    movie: { title: 'Sintel', year: 2010, runtimeMinutes: 15, originalLanguage: 'en' },
    profile,
    formats: seedFormats(),
    sizes: defaultQualitySizes(),
  }
}
