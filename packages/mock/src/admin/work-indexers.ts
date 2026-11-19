// SPDX-License-Identifier: AGPL-3.0-only
// The work answers' indexers part (one-client-platform-d.md › D2): Indexers (A9) and the catalog's
// definitions, from the mock's catalog and installed indexers.
//
// What the mock doesn't keep, kept here per transport: each indexer's plain settings, which
// secrets are set, its seeding rules and its tags. Every catalog definition here is a Torznab
// torrent indexer, as the mock's are all torrent sites; none is local or from an extra catalog.
import {
  type CatalogIndexer,
  type DefinitionCheck,
  INDEXER_TOPICS,
  type Indexer,
} from '@highsea-tv/api-contract'
import type { ServerState } from '../seed.ts'
import type { CatalogDefinition, Indexer as MockIndexer } from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'
import { tw } from './work-shared.ts'

type Value = string | number | boolean
type Seeding = Indexer['seeding']

const DAY = 86_400_000
const NO_SEEDING: Seeding = { ratio: null, minutes: null, minMinutes: null }

/**
 * What the catalog says of each definition's upkeep (indexer-catalog-upkeep.md, part C; ADR 0069),
 * as the server passes the bundle's `status` on: days before the mock's now that it was last
 * checked working (null: never), its stage, a status with the days since and a note, and the last
 * check's days ago and result (by default the day it was last checked working, and working). One of
 * each case A9 draws: checked lately, on Beta, checked long ago, broken, never checked, and
 * retired. Private definitions have none: `catalog:verify` skips them (the plan's part G).
 */
const CHECKS: Record<
  string,
  {
    verified: number | null
    stage?: DefinitionCheck['stage']
    status?: DefinitionCheck['status']
    since?: number
    note?: string
    checked?: { days: number; result: NonNullable<DefinitionCheck['result']> }
  }
> = {
  lighthouse: { verified: 1 },
  anchorage: { verified: 3, stage: 'beta' },
  driftnet: { verified: 41 },
  keel: {
    verified: 12,
    status: 'broken',
    since: 5,
    note: 'The site changed how it answers searches. A fix is being worked on.',
    checked: { days: 5, result: 'failing' },
  },
  beacon: { verified: null, stage: 'beta' },
  tidewater: {
    verified: 64,
    status: 'retired',
    since: 20,
    note: 'The site closed.',
    checked: { days: 27, result: 'failing' },
  },
}

/** A definition's settings as the mock's test reads them: strings, nulls left out. */
const asStrings = (settings: Record<string, Value | null> = {}) =>
  Object.fromEntries(
    Object.entries(settings).flatMap(([k, v]) => (v === null ? [] : [[k, String(v)]])),
  )

export function indexerAnswers(kit: AdminKit): Answers {
  const { wall, wallMs, emit } = kit
  /** Per indexer id: its plain settings, secrets set, seeding rules and tags. */
  const kept = new Map<
    string,
    {
      values: Record<string, Value>
      secrets: Record<string, boolean>
      seeding: Seeding
      tags: string[]
    }
  >()

  const keptOf = (s: ServerState, ix: MockIndexer) => {
    let k = kept.get(ix.id)
    if (!k) {
      const def = s.catalog.find((d) => d.id === ix.definitionId)
      // a seeded indexer was set up with every field filled: its secrets are set
      k = {
        values: {},
        secrets: Object.fromEntries(
          (def?.settings ?? []).filter((f) => f.type === 'password').map((f) => [f.key, true]),
        ),
        seeding: { ...NO_SEEDING },
        tags: [],
      }
      kept.set(ix.id, k)
    }
    return k
  }

  const keep = (ctx: Ctx, ix: MockIndexer, settings: Record<string, Value | null>) => {
    const k = keptOf(ctx.srv.state, ix)
    const def = ctx.srv.state.catalog.find((d) => d.id === ix.definitionId)
    for (const [key, value] of Object.entries(settings)) {
      const secret = def?.settings.find((f) => f.key === key)?.type === 'password'
      // an empty secret keeps the saved one
      if (secret) {
        if (value !== null && value !== '') k.secrets[key] = true
      } else if (value === null) delete k.values[key]
      else k.values[key] = value
    }
  }

  const indexerOf = (ctx: Ctx, ix: MockIndexer): Indexer => {
    const s = ctx.srv.state
    const def = s.catalog.find((d) => d.id === ix.definitionId)
    const k = keptOf(s, ix)
    const check = s.health.find((h) => h.id === `h-${ix.definitionId}`)
    const upkeep = checkOf(ctx, ix.definitionId)
    return {
      id: ix.id,
      definitionId: ix.definitionId,
      name: ix.name,
      privacy: def ? ix.privacy : null,
      kind: def ? 'torznab' : null,
      protocol: def ? 'torrent' : null,
      enabled: ix.enabled,
      priority: ix.priority,
      health: ix.health,
      backoffUntil: ix.backoffUntil && wall(ix.backoffUntil),
      failingSince: ix.health === 'failing' && check ? wall(check.since) : null,
      lastError: ix.lastError,
      needsAttention: !def,
      missing: !def,
      local: false,
      definitionVersion: def?.version ?? '',
      logo: null,
      settings: { values: { ...k.values }, secrets: { ...k.secrets } },
      stats: { ...ix.stats },
      seeding: { ...k.seeding },
      tags: [...k.tags],
      // the mock keeps no date it was added: two months before the mock's now
      addedAt: wallMs(ctx.srv.clock.now() - 60 * DAY),
      ...(upkeep ? { check: upkeep } : {}),
    }
  }

  /** A day `days` before the mock's now, on the wall clock (YYYY-MM-DD). */
  const dayBefore = (ctx: Ctx, days: number) =>
    wallMs(ctx.srv.clock.now() - days * DAY).slice(0, 10)

  const checkOf = (ctx: Ctx, id: string): DefinitionCheck | undefined => {
    const c = CHECKS[id]
    if (!c) return undefined
    const checked =
      c.checked ?? (c.verified === null ? null : { days: c.verified, result: 'working' as const })
    return {
      stage: c.stage ?? 'stable',
      status: c.status ?? 'working',
      since: c.since === undefined ? null : dayBefore(ctx, c.since),
      note: c.note ?? null,
      checked: checked ? dayBefore(ctx, checked.days) : null,
      result: checked?.result ?? null,
      verified: c.verified === null ? null : dayBefore(ctx, c.verified),
    }
  }

  const definitionOf = (ctx: Ctx, d: CatalogDefinition): CatalogIndexer => {
    const check = checkOf(ctx, d.id)
    return {
      id: d.id,
      version: d.version,
      name: d.name,
      description: d.description,
      privacy: d.privacy,
      language: d.language,
      kind: 'torznab',
      protocol: 'torrent',
      categories: [...d.categories],
      settings: d.settings.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        secret: f.type === 'password',
        help: f.help,
        ...(f.options ? { options: f.options.map((o) => ({ ...o })) } : {}),
      })),
      // the mock's definitions name their catalog, not an author or the site's API documentation:
      // the catalog's name, and a documentation address on the reserved example domain (RFC 2606)
      source: { author: d.source.name, documentation: `https://${d.id}.example/api` },
      license: d.source.license,
      minEngineVersion: d.minEngineVersion,
      starter: d.starter,
      links: [`https://${d.id}.example`],
      logo: null,
      local: false,
      origin: 'main',
      installed: ctx.srv.state.indexers.filter((i) => i.definitionId === d.id).length,
      ...(check ? { check } : {}),
    }
  }

  const installed = (ctx: Ctx, id: string) => {
    const ix = ctx.srv.state.indexers.find((x) => x.id === id)
    if (!ix) throw refuse('not-found', tw('work.indexerUnknown'))
    return ix
  }

  return {
    catalog: {
      indexers: ({ query }, ctx) => {
        const s = ctx.srv.state
        return (
          s.catalog
            .filter((d) => query.starter !== 'true' || (d.starter && d.privacy === 'public'))
            // a retired definition's file leaves the bundle, so the server no longer lists it
            .filter((d) => CHECKS[d.id]?.status !== 'retired')
            .map((d) => definitionOf(ctx, d))
        )
      },
      // the mock never has a version waiting, so installing changes nothing
      install: (_, ctx) => kit.catalogOf(ctx),
    },

    indexers: {
      list: (_, ctx) => ctx.api.indexers.list().map((ix) => indexerOf(ctx, ix)),
      add: ({ body }, ctx) => {
        const s = ctx.srv.state
        const def = s.catalog.find((d) => d.id === body.definitionId)
        if (!def) throw refuse('not-found', tw('work.definitionUnknown'))
        // tested first, and added only when the test passes (the server's indexers.add)
        const test = ctx.api.indexers.test(def.id, asStrings(body.settings))
        if (!test.ok) throw refuse('invalid', test.message, { field: 'settings', test })
        const ix = ctx.api.indexers.add(def.id, asStrings(body.settings))
        const patch: Partial<MockIndexer> = {}
        if (body.name) patch.name = body.name
        if (body.priority !== undefined) patch.priority = body.priority
        if (Object.keys(patch).length) ctx.api.indexers.update(ix.id, patch)
        keep(ctx, ix, body.settings ?? {})
        if (body.tags) keptOf(s, ix).tags = [...body.tags]
        return { indexer: indexerOf(ctx, ix), test }
      },
      test: ({ body }, ctx) => {
        const s = ctx.srv.state
        if (!s.indexers.some((x) => x.id === body.id) && !s.catalog.some((d) => d.id === body.id))
          throw refuse('not-found', tw('work.neitherUnknown'))
        return ctx.api.indexers.test(body.id, body.settings && asStrings(body.settings))
      },
      update: ({ params, body }, ctx) => {
        const ix = installed(ctx, params.id)
        const patch: Partial<MockIndexer> = {}
        if (body.name !== undefined) patch.name = body.name
        if (body.enabled !== undefined) patch.enabled = body.enabled
        if (body.priority !== undefined) patch.priority = body.priority
        // new settings start over: no backoff (the server's indexers.update)
        if (body.settings)
          Object.assign(patch, { health: 'healthy', backoffUntil: null, lastError: null })
        ctx.api.indexers.update(ix.id, patch)
        if (body.settings) keep(ctx, ix, body.settings)
        if (body.seeding) keptOf(ctx.srv.state, ix).seeding = { ...body.seeding }
        if (body.tags) keptOf(ctx.srv.state, ix).tags = [...body.tags]
        emit(INDEXER_TOPICS.indexers)
        return indexerOf(ctx, ix)
      },
      retry: ({ params }, ctx) => {
        const ix = installed(ctx, params.id)
        ctx.api.indexers.clearBackoff(ix.id)
        return indexerOf(ctx, ix)
      },
      remove: ({ params }, ctx) => {
        installed(ctx, params.id)
        ctx.api.indexers.remove(params.id)
        kept.delete(params.id)
        return undefined
      },
    },
  }
}
