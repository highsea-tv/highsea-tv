// SPDX-License-Identifier: AGPL-3.0-only
// The indexers service: the owner's installed indexers, each made from a catalog definition and
// its settings; testing, health, stats and interactive search (ADR 0033, ADR 0035).
import { AppError, iso, newId } from '@highsea/core'
import { schema } from '@highsea/db'
import {
  categoryName,
  type Definition,
  ENGINE_VERSION,
  protocolOf,
  type SettingField,
} from '@highsea/schemas/indexers'
import { and, asc, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import {
  type DefinitionSource,
  HEALTH_TOPIC,
  INDEXERS_TOPIC,
  type IndexersDeps,
} from './context.ts'
import {
  baseUrlOf,
  cookieOf,
  type RunResult,
  runSearch,
  type SearchQuery,
  signInTo,
} from './engine.ts'
import type { Caps } from './feed.ts'
import { type Fetched, fetchRelease } from './grab.ts'
import {
  createHealth,
  type Health,
  healthOf,
  type IndexerStats,
  isResting,
  summarize,
} from './health.ts'
import { IndexerError, redact } from './http.ts'
import { createRateLimiter } from './rate-limit.ts'
import { createSearch, type ReleaseView, type SearchInput } from './search.ts'
import {
  migrateSettings,
  openSettings,
  prepareSettings,
  type SettingsView,
  type StoredSettings,
  secretsOf,
  viewSettings,
} from './settings.ts'

const { indexers, releases: releasesTable } = schema

export const DEFAULT_PRIORITY = 25
/** Each indexer's time to answer a search (owner's answer 7). */
export const SEARCH_TIMEOUT_MS = 30_000
/** Capabilities change rarely; a day keeps a search to one request. */
const CAPS_TTL_MS = 24 * 60 * 60 * 1000
export const INDEXERS_PRUNE_JOB = 'indexers.prune'

export type IndexerView = {
  id: string
  definitionId: string
  name: string
  privacy: Definition['privacy'] | null
  kind: Definition['kind'] | null
  protocol: 'torrent' | 'usenet' | null
  enabled: boolean
  /** 1 to 50, lower first. */
  priority: number
  health: Health
  backoffUntil: string | null
  failingSince: string | null
  lastError: string | null
  /** A new definition version needs a setting, or the definition went away. */
  needsAttention: boolean
  /** The definition is gone from every catalog. */
  missing: boolean
  /** The definition comes from `/config/definitions`. */
  local: boolean
  definitionVersion: string
  logo: string | null
  settings: SettingsView
  stats: IndexerStats
  /** Seeding rules from this indexer; null fields use the global default. */
  seeding: { ratio: number | null; minutes: number | null; minMinutes: number | null }
  addedAt: string
}

export type CatalogEntry = {
  id: string
  version: string
  name: string
  description: string
  privacy: Definition['privacy']
  language: string
  kind: Definition['kind']
  protocol: 'torrent' | 'usenet'
  categories: string[]
  settings: SettingField[]
  source: Definition['source']
  license: string
  minEngineVersion: string
  starter: boolean
  links: string[]
  logo: string | null
  local: boolean
  origin: string
  /** How many installed indexers use it. */
  installed: number
}

export type TestResult = { ok: boolean; message: string; latencyMs: number }

/** A grabbed release, fetched: what the download client is handed. */
export type GrabbedRelease = {
  release: ReleaseView
  source: Fetched
  /** The indexer's seeding rules; null where it uses the global default. */
  seeding: { ratio: number | null; minutes: number | null; minMinutes: number | null }
}

export type IndexerPatch = {
  name?: string
  enabled?: boolean
  priority?: number
  settings?: Record<string, unknown>
  /** Its own seeding rules; a null field falls back to Settings › Download client's. */
  seeding?: { ratio: number | null; minutes: number | null; minMinutes: number | null }
}

type Row = typeof indexers.$inferSelect

function checkPriority(priority: number) {
  if (!Number.isInteger(priority) || priority < 1 || priority > 50)
    throw new AppError('invalid', 'Priority is a whole number from 1 to 50.', { field: 'priority' })
}

function checkName(name: string) {
  if (!name.trim() || name.trim().length > 60)
    throw new AppError('invalid', 'Give the indexer a name of up to 60 characters.', {
      field: 'name',
    })
}

export function createIndexers(deps: IndexersDeps) {
  const { db, clock, events, sealer } = deps
  const logger = deps.logger.child('indexers')
  const source: DefinitionSource = deps.definitions
  const random = deps.random ?? Math.random
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const timeoutMs = deps.timeoutMs ?? SEARCH_TIMEOUT_MS
  const health = createHealth(db, random)
  const limiter = createRateLimiter(clock, sleep)
  const capsCache = new Map<string, { caps: Caps; version: string; at: number }>()

  const rows = () =>
    db.select().from(indexers).orderBy(asc(indexers.priority), asc(indexers.name)).all()
  const row = (id: string) => db.select().from(indexers).where(eq(indexers.id, id)).get()
  const required = (id: string): Row => {
    const r = row(id)
    if (!r) throw new AppError('not-found', 'That indexer isn’t installed.')
    return r
  }
  const definitionOf = (r: Pick<Row, 'definitionId'>) => source.definition(r.definitionId)

  function emit(ids: string[], healthChanged: boolean) {
    events.emit({ topic: INDEXERS_TOPIC, ids })
    if (healthChanged) events.emit({ topic: HEALTH_TOPIC })
  }

  function view(r: Row, stats = health.stats(clock.now()), status = health.get(r.id)): IndexerView {
    const loaded = definitionOf(r)
    const def = loaded?.definition ?? null
    const now = clock.now()
    return {
      id: r.id,
      definitionId: r.definitionId,
      name: r.name,
      privacy: def?.privacy ?? null,
      kind: def?.kind ?? null,
      protocol: def ? protocolOf(def) : null,
      enabled: r.enabled,
      priority: r.priority,
      health: healthOf(status, r.enabled, now),
      backoffUntil:
        status?.backoffUntil && status.backoffUntil > now ? iso(status.backoffUntil) : null,
      failingSince: status?.failingSince ? iso(status.failingSince) : null,
      lastError: status?.lastError ?? null,
      needsAttention: r.needsAttention,
      missing: !def,
      local: loaded?.origin === 'local',
      definitionVersion: r.definitionVersion,
      logo: loaded?.logo ?? null,
      settings: viewSettings(def, r.settings as StoredSettings),
      stats: summarize(stats.get(r.id)),
      seeding: { ratio: r.seedRatio, minutes: r.seedMinutes, minMinutes: r.minSeedMinutes },
      addedAt: iso(r.addedAt),
    }
  }

  /** One run against an indexer, recording health and stats when it's installed. */
  async function run(
    key: string,
    def: Definition,
    stored: StoredSettings,
    query: SearchQuery,
    record: { id: string; session: string | null } | null,
  ): Promise<RunResult> {
    const opened = openSettings(def, stored, sealer)
    const secrets = secretsOf(def, opened)
    const cached = record ? capsCache.get(record.id) : undefined
    const caps =
      cached && cached.version === def.version && clock.now() - cached.at < CAPS_TTL_MS
        ? cached.caps
        : null
    const before = record ? health.get(record.id) : undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        runSearch(
          {
            definition: def,
            settings: opened,
            session: record?.session ?? null,
            caps,
            fetch: deps.fetch,
            timeoutMs,
            now: clock.now,
            beforeRequest: () => limiter.acquire(key, def.rateLimit),
          },
          query,
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new IndexerError(
                  'timeout',
                  `The indexer didn’t answer within ${Math.round(timeoutMs / 1000)} seconds.`,
                ),
              ),
            timeoutMs,
          )
        }),
      ])
      if (record) {
        if (result.caps)
          capsCache.set(record.id, { caps: result.caps, version: def.version, at: clock.now() })
        health.success(
          record.id,
          clock.now(),
          result.ms,
          result.session ? sealer.seal(result.session) : undefined,
        )
        const after = health.get(record.id)
        emit(
          [record.id],
          healthOf(before, true, clock.now()) !== healthOf(after, true, clock.now()),
        )
      }
      return result
    } catch (e) {
      const err =
        e instanceof IndexerError
          ? e
          : new IndexerError(
              'parse',
              `The indexer’s answer couldn’t be read: ${(e as Error).message}`,
            )
      const message = redact(err.message, secrets)
      if (record) {
        health.failure(record.id, clock.now(), err.kind, message, err.retryAfterMs)
        const after = health.get(record.id)
        emit(
          [record.id],
          healthOf(before, true, clock.now()) !== healthOf(after, true, clock.now()),
        )
        logger.warn('an indexer failed', { indexer: record.id, kind: err.kind, error: message })
      }
      throw new IndexerError(err.kind, message, err.retryAfterMs)
    } finally {
      clearTimeout(timer)
    }
  }

  async function test(
    def: Definition,
    stored: StoredSettings,
    record: { id: string; session: string | null } | null,
    name: string,
  ): Promise<TestResult> {
    const started = clock.now()
    const wall = Date.now()
    try {
      const result = await run(
        record?.id ?? `definition:${def.id}`,
        def,
        stored,
        { keywords: def.test.keywords },
        record,
      )
      const n = result.releases.length
      return {
        ok: true,
        message:
          n === 0
            ? `Connected to ${name}. The test search found nothing, which can be normal for a quiet indexer.`
            : `Connected to ${name}. The test search found ${n} ${n === 1 ? 'release' : 'releases'}.`,
        latencyMs: Math.max(clock.now() - started, Date.now() - wall, result.ms),
      }
    } catch (e) {
      return {
        ok: false,
        message: (e as Error).message,
        latencyMs: Math.max(clock.now() - started, Date.now() - wall),
      }
    }
  }

  function uniqueName(name: string): string {
    const taken = new Set(rows().map((r) => r.name))
    if (!taken.has(name)) return name
    for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`)) return `${name} ${i}`
  }

  /** Carries every indexer to its definition's current version. Safe to repeat. */
  function reconcile(): string[] {
    const changed: string[] = []
    for (const r of rows()) {
      const def = definitionOf(r)?.definition
      if (!def) {
        if (!r.needsAttention) {
          db.update(indexers)
            .set({ needsAttention: true, updatedAt: clock.now() })
            .where(eq(indexers.id, r.id))
            .run()
          changed.push(r.id)
        }
        continue
      }
      if (def.version === r.definitionVersion && !r.needsAttention) continue
      const { settings, needsAttention } = migrateSettings(
        def,
        r.settings as StoredSettings,
        sealer,
      )
      if (def.version === r.definitionVersion && needsAttention === r.needsAttention) continue
      db.update(indexers)
        .set({ settings, needsAttention, definitionVersion: def.version, updatedAt: clock.now() })
        .where(eq(indexers.id, r.id))
        .run()
      capsCache.delete(r.id)
      changed.push(r.id)
      logger.info('an indexer moved to a new definition version', {
        indexer: r.id,
        from: r.definitionVersion,
        to: def.version,
        needsAttention,
      })
    }
    if (changed.length) emit(changed, true)
    return changed
  }

  const search = createSearch({
    db,
    clock,
    logger,
    candidates: () => {
      const now = clock.now()
      const out: { row: Row; definition: Definition; blocked: boolean }[] = []
      for (const r of rows()) {
        if (!r.enabled || r.needsAttention) continue
        const def = definitionOf(r)?.definition
        // Usenet waits for a download client that speaks it (owner's answer 2)
        if (!def || protocolOf(def) !== 'torrent') continue
        const status = health.get(r.id)
        if (isResting(status, now)) continue
        out.push({ row: r, definition: def, blocked: healthOf(status, true, now) === 'failing' })
      }
      return out
    },
    run: (r, def, query) =>
      run(r.id, def, r.settings as StoredSettings, query, { id: r.id, session: openSession(r.id) }),
    isFailing: (id) => healthOf(health.get(id), true, clock.now()) === 'failing',
  })

  function openSession(id: string): string | null {
    const s = health.get(id)?.session
    if (!s) return null
    try {
      return sealer.open(s)
    } catch {
      return null
    }
  }

  return {
    start() {
      reconcile()
      return source.onDefinitionsChanged(() => reconcile())
    },

    /** Hourly: drops stats past two days and search results past their 30 minutes. */
    defineJobs() {
      deps.jobs.define({
        type: INDEXERS_PRUNE_JOB,
        payload: z.object({}),
        attempts: 2,
        async run() {
          health.prune(clock.now())
          search.prune()
        },
      })
    },

    schedule() {
      deps.jobs.schedule(INDEXERS_PRUNE_JOB, 60 * 60 * 1000)
    },

    list(): IndexerView[] {
      const stats = health.stats(clock.now())
      return rows().map((r) => view(r, stats))
    },

    get(id: string): IndexerView {
      return view(required(id))
    },

    /** Whether any enabled indexer can search: the 409 `no-indexers` asks this. */
    hasEnabled(): boolean {
      return rows().some((r) => r.enabled)
    },

    catalog(options: { starter?: boolean } = {}): CatalogEntry[] {
      const counts = new Map<string, number>()
      for (const r of rows()) counts.set(r.definitionId, (counts.get(r.definitionId) ?? 0) + 1)
      return source
        .definitions()
        .filter(
          (d) => !options.starter || (d.definition.starter && d.definition.privacy === 'public'),
        )
        .map(({ definition: d, origin, logo }) => ({
          id: d.id,
          version: d.version,
          name: d.name,
          description: d.description,
          privacy: d.privacy,
          language: d.language,
          kind: d.kind,
          protocol: protocolOf(d),
          categories: [...new Set(d.categories.map((c) => categoryName(c.standard)))],
          settings: d.settings,
          source: d.source,
          license: d.license,
          minEngineVersion: d.minEngineVersion,
          starter: d.starter,
          links: d.links,
          logo,
          local: origin === 'local',
          origin,
          installed: counts.get(d.id) ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    engineVersion: () => ENGINE_VERSION,

    /** Tests the settings, then adds the indexer only if the test passed. */
    async add(
      definitionId: string,
      input: { settings?: Record<string, unknown>; name?: string; priority?: number } = {},
    ): Promise<{ indexer: IndexerView; test: TestResult }> {
      const loaded = source.definition(definitionId)
      if (!loaded) throw new AppError('not-found', 'That indexer isn’t in the catalog.')
      const def = loaded.definition
      const priority = input.priority ?? DEFAULT_PRIORITY
      checkPriority(priority)
      if (input.name !== undefined) checkName(input.name)
      const settings = prepareSettings(def, input.settings ?? {}, null, sealer)
      const name = uniqueName(input.name?.trim() || def.name)
      const result = await test(def, settings, null, name)
      if (!result.ok)
        throw new AppError('invalid', result.message, { field: 'settings', test: result })
      const now = clock.now()
      const id = newId('ix')
      db.insert(indexers)
        .values({
          id,
          definitionId: def.id,
          definitionVersion: def.version,
          name,
          enabled: true,
          priority,
          settings,
          needsAttention: false,
          addedAt: now,
          updatedAt: now,
        })
        .run()
      emit([id], true)
      return { indexer: view(required(id)), test: result }
    },

    /** Tests an installed indexer, or a definition with settings before it's added. */
    async test(idOrDefinitionId: string, settings?: Record<string, unknown>): Promise<TestResult> {
      const installed = row(idOrDefinitionId)
      if (installed) {
        const loaded = definitionOf(installed)
        if (!loaded)
          throw new AppError('conflict', 'This indexer’s definition is gone from the catalog.')
        const stored = settings
          ? prepareSettings(
              loaded.definition,
              settings,
              installed.settings as StoredSettings,
              sealer,
            )
          : (installed.settings as StoredSettings)
        // unsaved settings don't change the saved indexer's health
        const record = settings ? null : { id: installed.id, session: openSession(installed.id) }
        return test(loaded.definition, stored, record, installed.name)
      }
      const loaded = source.definition(idOrDefinitionId)
      if (!loaded)
        throw new AppError('not-found', 'That indexer isn’t installed or in the catalog.')
      const stored = prepareSettings(loaded.definition, settings ?? {}, null, sealer)
      return test(loaded.definition, stored, null, loaded.definition.name)
    },

    update(id: string, patch: IndexerPatch): IndexerView {
      const r = required(id)
      const set: Partial<Row> = { updatedAt: clock.now() }
      let healthChanged = false
      if (patch.name !== undefined) {
        checkName(patch.name)
        set.name = patch.name.trim()
      }
      if (patch.priority !== undefined) {
        checkPriority(patch.priority)
        set.priority = patch.priority
      }
      if (patch.enabled !== undefined && patch.enabled !== r.enabled) {
        set.enabled = patch.enabled
        healthChanged = true
      }
      if (patch.settings !== undefined) {
        const def = definitionOf(r)?.definition
        if (!def)
          throw new AppError('conflict', 'This indexer’s definition is gone from the catalog.')
        set.settings = prepareSettings(def, patch.settings, r.settings as StoredSettings, sealer)
        set.definitionVersion = def.version
        set.needsAttention = false
        // new settings start over: no backoff, no old sign-in, fresh capabilities
        health.reset(id)
        capsCache.delete(id)
        healthChanged = true
      }
      if (patch.seeding !== undefined) {
        set.seedRatio = patch.seeding.ratio
        set.seedMinutes = patch.seeding.minutes
        set.minSeedMinutes = patch.seeding.minMinutes
      }
      db.update(indexers).set(set).where(eq(indexers.id, id)).run()
      emit([id], healthChanged)
      return view(required(id))
    },

    /** Retry now. */
    retry(id: string): IndexerView {
      required(id)
      health.clearBackoff(id, clock.now())
      emit([id], true)
      return view(required(id))
    },

    remove(id: string) {
      required(id)
      db.delete(indexers).where(eq(indexers.id, id)).run()
      capsCache.delete(id)
      limiter.forget(id)
      emit([id], true)
    },

    reconcile,

    /** Searches every usable indexer for a movie and judges each release. */
    search: (input: SearchInput) => search.search(input),

    /** The last search's releases for a movie, while they're fresh. */
    releases: (tmdbId: number) => search.cached(tmdbId),

    /**
     * Fetches a release from the last search by its indexer and guid: its `.torrent` through the
     * indexer's rate limit and sign-in, or its magnet. A grab counts in the indexer's stats; a
     * failure counts against its health as a search's does.
     */
    async grab(input: {
      tmdbId: number
      indexerId: string
      guid: string
    }): Promise<GrabbedRelease> {
      const cached = db
        .select()
        .from(releasesTable)
        .where(
          and(
            eq(releasesTable.tmdbId, input.tmdbId),
            eq(releasesTable.indexerId, input.indexerId),
            eq(releasesTable.guid, input.guid),
            gt(releasesTable.expiresAt, clock.now()),
          ),
        )
        .get()
      if (!cached)
        throw new AppError(
          'not-found',
          'That release is no longer in the search results. Search again.',
        )
      const r = required(input.indexerId)
      const loaded = definitionOf(r)
      if (!loaded)
        throw new AppError('conflict', `${r.name}’s definition is gone from the catalog.`)
      const def = loaded.definition
      const { rank: _rank, ...release } = cached.data as ReleaseView & { rank: number }
      const link = cached.download as {
        download: string | null
        magnet: string | null
        infohash: string | null
      }
      const seeding = {
        ratio: r.seedRatio,
        minutes: r.seedMinutes,
        minMinutes: r.minSeedMinutes,
      }
      const done = (source: Fetched): GrabbedRelease => {
        health.grab(r.id, clock.now())
        emit([r.id], false)
        return { release, source, seeding }
      }
      if (!link.download) {
        const magnet =
          link.magnet ??
          (link.infohash ? `magnet:?xt=urn:btih:${link.infohash.toLowerCase()}` : null)
        if (!magnet) throw new AppError('conflict', 'That release has nothing to download.')
        return done({ magnet })
      }
      const stored = r.settings as StoredSettings
      const opened = openSettings(def, stored, sealer)
      const secrets = secretsOf(def, opened)
      const runCtx = {
        definition: def,
        settings: opened,
        session: openSession(r.id),
        caps: null,
        fetch: deps.fetch,
        timeoutMs,
        now: clock.now,
        beforeRequest: () => limiter.acquire(r.id, def.rateLimit),
      }
      const before = health.get(r.id)
      const attempt = (cookie: string | null) =>
        fetchRelease(
          {
            fetch: deps.fetch,
            timeoutMs,
            now: clock.now,
            beforeRequest: runCtx.beforeRequest,
            origin: new URL(baseUrlOf(def, opened)).origin,
            cookie,
          },
          link.download as string,
        )
      try {
        let source: Fetched
        if (def.login.method === 'form') {
          let session = runCtx.session ?? (await signInTo(runCtx))
          try {
            source = await attempt(session)
          } catch (e) {
            // a session that ran out sends the sign-in page: sign in once more and try again
            if (!(e instanceof IndexerError && e.kind === 'auth')) throw e
            session = await signInTo(runCtx)
            source = await attempt(session)
          }
          if (session !== runCtx.session)
            health.saveSession(r.id, clock.now(), sealer.seal(session))
        } else source = await attempt(cookieOf(runCtx))
        return done(source)
      } catch (e) {
        const err = e instanceof IndexerError ? e : new IndexerError('parse', (e as Error).message)
        const message = redact(err.message, secrets)
        health.failure(r.id, clock.now(), err.kind, message, err.retryAfterMs)
        emit(
          [r.id],
          healthOf(before, true, clock.now()) !== healthOf(health.get(r.id), true, clock.now()),
        )
        logger.warn('a grab failed', { indexer: r.id, kind: err.kind, error: message })
        throw new AppError('unavailable', `${r.name} couldn’t send the release: ${message}`)
      }
    },

    /** Seeding rules for an indexer: null fields use the global default. */
    setSeeding(
      id: string,
      rules: { ratio: number | null; minutes: number | null; minMinutes: number | null },
    ): IndexerView {
      required(id)
      db.update(indexers)
        .set({
          seedRatio: rules.ratio,
          seedMinutes: rules.minutes,
          minSeedMinutes: rules.minMinutes,
          updatedAt: clock.now(),
        })
        .where(eq(indexers.id, id))
        .run()
      emit([id], false)
      return view(required(id))
    },

    /** How many indexers a search would ask, for "Searching {n} indexers…". */
    searchable: () => search.count(),

    /** What System › Health shows. */
    issues(): { id: string; level: 'warning' | 'error'; message: string; since: number }[] {
      const all = rows()
      const out: { id: string; level: 'warning' | 'error'; message: string; since: number }[] = []
      const now = clock.now()
      if (!all.some((r) => r.enabled))
        out.push({
          id: 'indexers-none',
          level: 'warning',
          message: 'No indexers are enabled, so searches find nothing. Add one in Indexers.',
          since: Math.min(now, ...all.map((r) => r.updatedAt)),
        })
      for (const r of all) {
        const status = health.get(r.id)
        if (healthOf(status, r.enabled, now) === 'failing' && status)
          out.push({
            id: `indexer-${r.id}`,
            level: 'error',
            message: `${r.name} has been failing${status.lastError ? `: ${status.lastError}` : '.'}`,
            since: status.failingSince ?? now,
          })
        else if (r.needsAttention)
          out.push({
            id: `indexer-${r.id}-attention`,
            level: 'warning',
            message: definitionOf(r)
              ? `${r.name} needs a setting its new definition asks for. Open it in Indexers.`
              : `${r.name}’s definition is gone from the catalog, so it can’t search.`,
            since: r.updatedAt,
          })
      }
      return out
    },
  }
}

export type Indexers = ReturnType<typeof createIndexers>
