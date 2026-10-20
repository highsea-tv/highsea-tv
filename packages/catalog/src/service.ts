// SPDX-License-Identifier: AGPL-3.0-only
// The catalog service (ADR 0034, implementing ADR 0007). Definitions come from three origins:
// - `main`: the seed snapshot shipped with the server, then the main catalog's updates;
// - `extra:{url}`: extra catalogs the owner adds, each with its own trusted key;
// - `local`: YAML in `/config/definitions`, validated but unsigned, overriding the others.
//
// A check fetches each catalog's signed manifest (with `If-None-Match`), verifies the signature,
// then the bundle's hash, refuses anything older than what's installed, validates every definition
// and skips those the engine can't run. A failure keeps what was there. Nothing unsigned or
// tampered is ever loaded from a catalog.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError, type Clock, type EventBus, type Fetch, type Logger } from '@highsea/core'
import { type Db, readSetting, schema, writeSetting } from '@highsea/db'
import type { JobQueue } from '@highsea/jobs'
import {
  type Definition,
  ENGINE_VERSION,
  engineSupports,
  formatIssues,
  validateDefinition,
} from '@highsea/schemas/indexers'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  type Bundle,
  bundleSchema,
  type CatalogChange,
  CHANNELS,
  type Channel,
  compareCatalogVersions,
  type Manifest,
  manifestSchema,
} from './format.ts'
import { type BrokenFile, loadDefinitionFiles } from './load.ts'
import { SignatureError, sha256, type TrustedKey, verifyEnvelope } from './signing.ts'

const { catalogDefinitions } = schema

export const CATALOG_TOPIC = 'catalog.updated'
export const CATALOG_CHECK_JOB = 'catalog.check'
/** Every 6 hours, as the plan says; a check that finds nothing new costs one small request. */
export const CATALOG_CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 30_000
/** Larger than any catalog should grow; a bigger answer is refused before it's parsed. */
const MAX_BUNDLE_BYTES = 20 * 1024 * 1024

export type CatalogDeps = {
  db: Db
  jobs: JobQueue
  clock: Clock
  logger: Logger
  events: EventBus
  /** Every catalog request goes through it (ADR 0029). */
  fetch: Fetch
  /** `/config`: the cache goes in `catalog/`, local definitions are read from `definitions/`. */
  configDir: string
  /** The keys the main catalog and the seed may be signed with. */
  trustedKeys: readonly TrustedKey[]
  /** Holds `{channel}/manifest.json` and its bundle; null when the build ships none. */
  seedDir: string | null
  /** The main catalog's base URL; null until publishing begins (decision 5). */
  mainUrl: string | null
}

export const CATALOG_SETTINGS_KEY = 'catalog'
const STATE_KEY = 'catalog.state'

export type ExtraCatalog = { url: string; keyId: string; publicKey: string }

export type CatalogSettings = {
  channel: Channel
  /** Install new versions on their own (owner's answer 4); false is "Ask first". */
  autoUpdate: boolean
  extras: ExtraCatalog[]
}

export const defaultCatalogSettings: CatalogSettings = {
  channel: 'stable',
  autoUpdate: true,
  extras: [],
}

type Installed = {
  version: string
  channel: Channel
  changes: CatalogChange[]
  etag: string | null
  installedAt: number
}

type Pending = { manifest: Manifest; bundleFile: string }

type CatalogState = {
  installed: Record<string, Installed>
  pending: Record<string, Pending>
  lastCheck: { at: number; ok: boolean; message: string | null } | null
}

const emptyState: CatalogState = { installed: {}, pending: {}, lastCheck: null }

export type DefinitionOrigin = 'main' | 'local' | `extra:${string}`

/** A definition as the rest of the server sees it. */
export type LoadedDefinition = {
  definition: Definition
  origin: DefinitionOrigin
  logo: string | null
}

export type CatalogStatus = {
  version: string | null
  channel: Channel
  autoUpdate: boolean
  engineVersion: string
  lastCheck: CatalogState['lastCheck']
  /** A verified version waiting for the owner, when updates ask first. */
  available: { version: string; changes: CatalogChange[] } | null
  changes: CatalogChange[]
  extras: { url: string; keyId: string; version: string | null }[]
  /** Local definitions that didn't validate, with why. */
  brokenLocal: BrokenFile[]
}

/** Called after definitions change, with the ids whose version changed or that went away. */
export type DefinitionsListener = (changed: { id: string; definition: Definition | null }[]) => void

const extraOrigin = (url: string): DefinitionOrigin => `extra:${url}`

export function createCatalog(deps: CatalogDeps) {
  const { db, clock, events } = deps
  const logger = deps.logger.child('catalog')
  const cacheDir = join(deps.configDir, 'catalog')
  const localDir = join(deps.configDir, 'definitions')
  const listeners = new Set<DefinitionsListener>()

  let effective = new Map<string, LoadedDefinition>()
  let brokenLocal: BrokenFile[] = []

  const settings = () => readSetting(db, CATALOG_SETTINGS_KEY, defaultCatalogSettings)
  // a copy: readSetting hands back the defaults themselves when there's no row, and callers mutate
  const state = (): CatalogState => structuredClone(readSetting(db, STATE_KEY, emptyState))
  const saveState = (s: CatalogState) => writeSetting(db, STATE_KEY, s, clock.now())

  // ------------------------------------------------------------ the effective definitions

  function recompute() {
    const before = effective
    const rows = db.select().from(catalogDefinitions).all()
    const rank = (origin: string) => {
      if (origin === 'local') return 0
      if (origin === 'main') return 1
      const i = settings().extras.findIndex((e) => extraOrigin(e.url) === origin)
      return i < 0 ? Number.POSITIVE_INFINITY : 2 + i
    }
    const next = new Map<string, LoadedDefinition>()
    for (const row of rows.sort((a, b) => rank(a.origin) - rank(b.origin))) {
      if (next.has(row.id) || rank(row.origin) === Number.POSITIVE_INFINITY) continue
      next.set(row.id, {
        definition: row.definition as Definition,
        origin: row.origin as DefinitionOrigin,
        logo: row.logo,
      })
    }
    effective = next
    const changed: { id: string; definition: Definition | null }[] = []
    for (const [id, d] of next) {
      const old = before.get(id)
      if (!old || old.definition.version !== d.definition.version || old.origin !== d.origin)
        changed.push({ id, definition: d.definition })
    }
    for (const id of before.keys()) if (!next.has(id)) changed.push({ id, definition: null })
    if (changed.length && before.size) {
      for (const l of listeners) {
        try {
          l(changed)
        } catch (e) {
          logger.error('a catalog listener failed', { error: (e as Error).message })
        }
      }
    }
    if (changed.length) events.emit({ topic: CATALOG_TOPIC })
  }

  /** Replaces one origin's rows with the definitions that validate and that this engine runs. */
  function store(
    origin: DefinitionOrigin,
    raw: readonly unknown[],
    logos: Record<string, string>,
    from: { version: string | null; channel: Channel | null },
  ) {
    const rows: (typeof catalogDefinitions.$inferInsert)[] = []
    for (const item of raw) {
      const result = validateDefinition(item)
      if (!result.ok) {
        const id = (item as { id?: unknown })?.id
        logger.warn('skipped a definition that doesn’t validate', {
          origin,
          id: typeof id === 'string' ? id : null,
          problems: formatIssues(result.errors),
        })
        continue
      }
      const d = result.definition
      if (!engineSupports(d.minEngineVersion)) {
        logger.info('skipped a definition for a newer engine', {
          origin,
          id: d.id,
          needs: d.minEngineVersion,
          engine: ENGINE_VERSION,
        })
        continue
      }
      rows.push({
        origin,
        id: d.id,
        version: d.version,
        kind: d.kind,
        definition: d,
        author: d.source.author,
        license: d.license,
        logo: d.logo ? (logos[d.logo] ?? null) : null,
        catalogVersion: from.version,
        channel: from.channel,
        updatedAt: clock.now(),
      })
    }
    db.transaction((tx) => {
      tx.delete(catalogDefinitions).where(eq(catalogDefinitions.origin, origin)).run()
      for (const row of rows) tx.insert(catalogDefinitions).values(row).run()
    })
    return rows.length
  }

  // ------------------------------------------------------------ verifying

  /** Verifies an envelope and its bundle; returns both parsed. Throws with a message for the log. */
  function verify(envelope: unknown, bundleBytes: Uint8Array, keys: readonly TrustedKey[]) {
    const text = verifyEnvelope(envelope, keys)
    const manifest = manifestSchema.parse(JSON.parse(text))
    if (
      bundleBytes.byteLength !== manifest.bundle.size ||
      sha256(bundleBytes) !== manifest.bundle.sha256
    )
      throw new SignatureError('The catalog bundle doesn’t match its signed manifest.')
    const bundle = bundleSchema.parse(JSON.parse(Buffer.from(bundleBytes).toString('utf8')))
    if (bundle.version !== manifest.version || bundle.kind !== manifest.kind)
      throw new SignatureError('The catalog bundle doesn’t match its signed manifest.')
    return { manifest, bundle }
  }

  function install(
    origin: DefinitionOrigin,
    manifest: Manifest,
    bundle: Bundle,
    etag: string | null,
  ) {
    const count = store(origin, bundle.definitions, bundle.logos, {
      version: manifest.version,
      channel: manifest.channel,
    })
    const s = state()
    s.installed[origin] = {
      version: manifest.version,
      channel: manifest.channel,
      changes: manifest.changes,
      etag,
      installedAt: clock.now(),
    }
    delete s.pending[origin]
    saveState(s)
    logger.info('installed a catalog version', {
      origin,
      version: manifest.version,
      definitions: count,
    })
  }

  /** Whether a manifest is newer than what's installed from that origin on that channel. */
  function isNewer(origin: string, manifest: Manifest) {
    const current = state().installed[origin]
    if (!current || current.channel !== manifest.channel) return true
    return compareCatalogVersions(manifest.version, current.version) > 0
  }

  // ------------------------------------------------------------ the seed

  function installSeed() {
    if (!deps.seedDir) return
    const channel = settings().channel
    const dir = join(deps.seedDir, channel)
    try {
      const envelope = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
      const peek = manifestSchema.parse(
        JSON.parse(z.object({ manifest: z.string() }).parse(envelope).manifest),
      )
      const bytes = readFileSync(join(dir, peek.bundle.path))
      const { manifest, bundle } = verify(envelope, bytes, deps.trustedKeys)
      if (isNewer('main', manifest)) install('main', manifest, bundle, null)
    } catch (e) {
      logger.warn('couldn’t use the seed catalog', { error: (e as Error).message })
    }
  }

  // ------------------------------------------------------------ local definitions

  function loadLocal() {
    const { loaded, broken } = loadDefinitionFiles(localDir)
    brokenLocal = broken
    for (const b of broken)
      logger.warn('skipped a local definition', { file: b.file, problems: b.message })
    store(
      'local',
      loaded.map((l) => l.raw),
      {},
      { version: null, channel: null },
    )
  }

  // ------------------------------------------------------------ checking

  async function get(url: string, headers: Record<string, string> = {}) {
    const response = await deps.fetch(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    return response
  }

  async function readBytes(response: Response): Promise<Uint8Array> {
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_BUNDLE_BYTES) throw new Error('The catalog bundle is too large.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_BUNDLE_BYTES) throw new Error('The catalog bundle is too large.')
    return bytes
  }

  /** Checks one catalog. Returns what happened, for the log and the status. */
  async function checkOne(origin: DefinitionOrigin, base: string, keys: readonly TrustedKey[]) {
    const channel = settings().channel
    const root = base.replace(/\/+$/, '')
    const current = state().installed[origin]
    const etag = current?.channel === channel ? current.etag : null
    const response = await get(
      `${root}/${channel}/manifest.json`,
      etag ? { 'if-none-match': etag } : {},
    )
    if (response.status === 304) return 'unchanged' as const
    if (!response.ok) throw new Error(`The catalog answered ${response.status}.`)
    const envelope: unknown = await response.json()
    // verify the manifest first, so an unsigned one never decides what's downloaded next
    const manifest = manifestSchema.parse(JSON.parse(verifyEnvelope(envelope, keys)))
    if (manifest.channel !== channel)
      throw new SignatureError('The catalog manifest is for another channel.')
    if (!isNewer(origin, manifest)) {
      if (current && compareCatalogVersions(manifest.version, current.version) < 0)
        logger.warn('ignored an older catalog version', {
          origin,
          offered: manifest.version,
          installed: current.version,
        })
      return 'unchanged' as const
    }
    const bundleResponse = await get(`${root}/${channel}/${manifest.bundle.path}`)
    if (!bundleResponse.ok) throw new Error(`The catalog bundle answered ${bundleResponse.status}.`)
    const bytes = await readBytes(bundleResponse)
    const verified = verify(envelope, bytes, keys)
    const newEtag = response.headers.get('etag')

    if (!settings().autoUpdate) {
      mkdirSync(cacheDir, { recursive: true })
      const bundleFile = join(cacheDir, `pending-${sha256(origin).slice(0, 12)}.json`)
      writeFileSync(
        bundleFile,
        JSON.stringify({ envelope, bundle: Buffer.from(bytes).toString('base64'), etag: newEtag }),
      )
      const s = state()
      s.pending[origin] = { manifest: verified.manifest, bundleFile }
      saveState(s)
      return 'pending' as const
    }
    install(origin, verified.manifest, verified.bundle, newEtag)
    cache(origin, envelope, bytes)
    return 'installed' as const
  }

  /** The verified files, under `/config/catalog/`, for anyone looking into what's installed. */
  function cache(origin: string, envelope: unknown, bytes: Uint8Array) {
    try {
      const dir = join(
        cacheDir,
        origin === 'main' ? 'main' : `extra-${sha256(origin).slice(0, 12)}`,
      )
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(envelope, null, 2))
      writeFileSync(join(dir, 'bundle.json'), bytes)
    } catch (e) {
      logger.warn('couldn’t cache the catalog files', { error: (e as Error).message })
    }
  }

  async function check(): Promise<CatalogStatus> {
    const failures: string[] = []
    const targets: { origin: DefinitionOrigin; url: string; keys: readonly TrustedKey[] }[] = []
    if (deps.mainUrl) targets.push({ origin: 'main', url: deps.mainUrl, keys: deps.trustedKeys })
    for (const e of settings().extras)
      targets.push({
        origin: extraOrigin(e.url),
        url: e.url,
        keys: [{ id: e.keyId, publicKey: e.publicKey }],
      })

    for (const t of targets) {
      try {
        const result = await checkOne(t.origin, t.url, t.keys)
        logger.info('checked a catalog', { origin: t.origin, result })
      } catch (e) {
        const message = (e as Error).message
        logger.warn('a catalog check failed', { origin: t.origin, error: message })
        failures.push(message)
      }
    }
    loadLocal()
    recompute()
    const s = state()
    const kept = s.installed.main?.version
    s.lastCheck = {
      at: clock.now(),
      ok: failures.length === 0,
      message: failures.length ? `${failures[0]}${kept ? ` Keeping ${kept}.` : ''}` : null,
    }
    saveState(s)
    events.emit({ topic: CATALOG_TOPIC })
    return status()
  }

  function status(): CatalogStatus {
    const s = state()
    const set = settings()
    const main = s.installed.main
    const pending = s.pending.main
    return {
      version: main?.version ?? null,
      channel: set.channel,
      autoUpdate: set.autoUpdate,
      engineVersion: ENGINE_VERSION,
      lastCheck: s.lastCheck,
      available: pending
        ? { version: pending.manifest.version, changes: pending.manifest.changes }
        : null,
      changes: main?.changes ?? [],
      extras: set.extras.map((e) => ({
        url: e.url,
        keyId: e.keyId,
        version: s.installed[extraOrigin(e.url)]?.version ?? null,
      })),
      brokenLocal,
    }
  }

  return {
    /** Loads what's cached, the seed when it's newer, and the local definitions. Call once at boot. */
    start() {
      installSeed()
      loadLocal()
      recompute()
    },

    /** Queues a check now and every 6 hours. The runtime calls this once at boot. */
    schedule(now: number) {
      deps.jobs.schedule(CATALOG_CHECK_JOB, CATALOG_CHECK_EVERY_MS, { firstRunAt: now + 60_000 })
    },

    defineJobs() {
      deps.jobs.define({
        type: CATALOG_CHECK_JOB,
        payload: z.object({}),
        attempts: 2,
        timeoutMs: 5 * 60_000,
        async run() {
          await check()
        },
      })
    },

    check,
    status,

    /** Installs the versions waiting for the owner ("Ask first"). */
    installPending() {
      const s = state()
      for (const [origin, p] of Object.entries(s.pending)) {
        try {
          const saved = JSON.parse(readFileSync(p.bundleFile, 'utf8')) as {
            envelope: unknown
            bundle: string
            etag: string | null
          }
          const extra = settings().extras.find((e) => extraOrigin(e.url) === origin)
          const keys =
            origin === 'main'
              ? deps.trustedKeys
              : extra
                ? [{ id: extra.keyId, publicKey: extra.publicKey }]
                : []
          const bytes = Buffer.from(saved.bundle, 'base64')
          const { manifest, bundle } = verify(saved.envelope, bytes, keys)
          if (isNewer(origin, manifest))
            install(origin as DefinitionOrigin, manifest, bundle, saved.etag)
          cache(origin, saved.envelope, bytes)
        } catch (e) {
          logger.warn('couldn’t install a waiting catalog version', {
            origin,
            error: (e as Error).message,
          })
          const fresh = state()
          delete fresh.pending[origin]
          saveState(fresh)
        }
      }
      recompute()
      return status()
    },

    settings,

    /** Owner only (ADR 0032's answers): the channel, automatic updates and extra catalogs. */
    updateSettings(patch: Partial<CatalogSettings>) {
      const next = { ...settings() }
      if (patch.channel !== undefined) {
        if (!CHANNELS.includes(patch.channel))
          throw new AppError('invalid', 'Choose stable or beta.', { field: 'channel' })
        next.channel = patch.channel
      }
      if (patch.autoUpdate !== undefined) next.autoUpdate = patch.autoUpdate
      if (patch.extras !== undefined) {
        const seen = new Set<string>()
        for (const e of patch.extras) {
          if (
            !/^https:\/\/[^\s]+$/.test(e.url) &&
            !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(e.url)
          )
            throw new AppError('invalid', 'Use an https:// address for each catalog.', {
              field: 'extras',
            })
          if (!/^[a-z0-9-]{1,40}$/.test(e.keyId))
            throw new AppError('invalid', 'Key ids are lowercase letters, digits and hyphens.', {
              field: 'extras',
            })
          if (!/^[A-Za-z0-9+/]+=*$/.test(e.publicKey))
            throw new AppError('invalid', 'Paste the catalog’s public key as base64.', {
              field: 'extras',
            })
          if (seen.has(e.url))
            throw new AppError('invalid', 'Each catalog is listed once.', { field: 'extras' })
          seen.add(e.url)
        }
        // a removed catalog's definitions go with it
        for (const old of next.extras)
          if (!seen.has(old.url))
            db.delete(catalogDefinitions)
              .where(eq(catalogDefinitions.origin, extraOrigin(old.url)))
              .run()
        next.extras = patch.extras
      }
      const channelChanged = next.channel !== settings().channel
      writeSetting(db, CATALOG_SETTINGS_KEY, next, clock.now())
      if (channelChanged) installSeed()
      recompute()
      events.emit({ topic: CATALOG_TOPIC })
      return status()
    },

    /** Every definition the server can use, local first, then main, then the extras. */
    definitions(): LoadedDefinition[] {
      return [...effective.values()]
    },

    definition(id: string): LoadedDefinition | null {
      return effective.get(id) ?? null
    },

    /** The main catalog's installed version, for System › About and A9's header. */
    version: () => state().installed.main?.version ?? null,

    /** Reloads `/config/definitions`. */
    reloadLocal() {
      loadLocal()
      recompute()
    },

    onDefinitionsChanged(listener: DefinitionsListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /** What System › Health shows. */
    issues(): { id: string; level: 'warning'; message: string }[] {
      const out: { id: string; level: 'warning'; message: string }[] = []
      const last = state().lastCheck
      if (last && !last.ok && last.message)
        out.push({ id: 'catalog-check', level: 'warning', message: last.message })
      for (const b of brokenLocal)
        out.push({
          id: `catalog-local-${b.file}`,
          level: 'warning',
          message: `The local definition ${b.file} doesn’t validate, so it’s skipped. The log has why.`,
        })
      return out
    },
  }
}

export type Catalog = ReturnType<typeof createCatalog>
