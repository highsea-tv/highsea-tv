// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections in the admin (one-client-platform-d.md › D2; collections.md, ADR 0049),
// answered from the mock's api: the list with what each holds, the editor's fields, people and live
// preview, and saving and removing, with packages/curation's refusals in its words.
//
// The mock keeps titles by its own ids, people and TMDB's collections by slug; the contract has
// TMDB's numbers for all three (films.ts's `tmdbId` and `tmdbNumber`), so rules, picks and
// exclusions are turned over each way here. A smart collection's own id (`sc-…`) is the same in
// both. Shows picked by hand (the prototype's stage 6) aren't the server's, which has films only:
// they're left out of what goes back, and kept when a collection is saved.
import {
  ROLE_JOBS,
  RULE_FIELD_NAMES,
  RULE_FIELDS,
  type RuleCondition,
  type RuleField,
  type RuleGroup,
  type SmartCollection,
  type SmartCollectionInput,
} from '@highsea-tv/api-contract'
import { fold } from '@highsea-tv/media/search'
import { tmdbNumber } from '../films.ts'
import { collectionRefs, movieMetadata } from '../metadata.ts'
import type {
  SmartCollection as MockCollection,
  RuleCondition as MockCondition,
  RuleGroup as MockGroup,
} from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'
import { type MoviesKit, t } from './movies-shared.ts'

/** The editor's live result holds at most this many titles (the contract's 60). */
const PREVIEW_MAX = 60
/** People a search finds (the contract's 20). */
const PEOPLE_MAX = 20

const isPerson = (field: RuleField) => RULE_FIELDS[field].type === 'person'

export function collectionsAnswers(kit: AdminKit, k: MoviesKit): Answers {
  /** Every person the library credits, by slug, with their number and their credits per title. */
  const credits = (ctx: Ctx) => {
    const now = ctx.srv.clock.now()
    return k.libraryOf(ctx.srv.state).flatMap((m) => {
      const meta = movieMetadata(ctx.srv.state, m.id, now)
      return [
        ...(meta?.cast ?? []).map((c) => ({ ...c, titleId: m.id, cast: true })),
        ...(meta?.crew ?? []).map((c) => ({ ...c, titleId: m.id, cast: false })),
      ]
    })
  }

  // ------------------------------------------------------------ ids each way

  type Turn = (value: string) => string | null
  /** A rule's values turned over: a person's or a TMDB collection's slug and its number. */
  const turnValues = (c: MockCondition | RuleCondition, turn: Turn) => {
    const one = (v: string) => turn(v)
    if (Array.isArray(c.value) && typeof c.value[0] === 'string') {
      const xs = (c.value as string[]).flatMap((v) => one(v) ?? [])
      return xs.length ? xs : c.value
    }
    if (typeof c.value === 'string') return one(c.value) ?? c.value
    return c.value
  }

  const toApi = (ctx: Ctx) => {
    const tmdb = new Set(collectionRefs().map((c) => c.id))
    const turn =
      (field: RuleField): Turn =>
      (v) =>
        isPerson(field)
          ? String(tmdbNumber(v))
          : field === 'collection' && tmdb.has(v)
            ? String(tmdbNumber(v))
            : v
    const condition = (c: MockCondition): RuleCondition => ({
      kind: 'condition',
      id: c.id,
      field: c.field,
      op: c.op,
      value: turnValues(c, turn(c.field)) as RuleCondition['value'],
    })
    const rules = (g: MockGroup | null): RuleGroup | null =>
      g && {
        kind: 'group',
        id: g.id,
        match: g.match,
        rules: g.rules.map((r) =>
          r.kind === 'condition'
            ? condition(r)
            : {
                kind: 'group' as const,
                id: r.id,
                match: r.match,
                rules: r.rules.flatMap((x) => (x.kind === 'condition' ? [condition(x)] : [])),
              },
        ),
      }
    const titles = (ids: string[]) => ids.flatMap((id) => k.tmdbIdOf(ctx.srv.state, id) ?? [])
    return (c: MockCollection): SmartCollection => ({
      id: c.id,
      name: c.name,
      summary: c.summary,
      artwork: c.artwork,
      rules: rules(c.rules),
      include: titles(c.include),
      exclude: titles(c.exclude),
      sort: c.sort,
      descending: c.descending,
      limit: c.limit,
      audience: c.audience,
      updatedAt: kit.wall(c.updatedAt),
    })
  }

  const fromApi = (ctx: Ctx, input: SmartCollectionInput, id: string): MockCollection => {
    const people = new Map(credits(ctx).map((c) => [String(tmdbNumber(c.personId)), c.personId]))
    const tmdb = new Map(collectionRefs().map((c) => [String(tmdbNumber(c.id)), c.id]))
    const turn =
      (field: RuleField): Turn =>
      (v) =>
        isPerson(field) ? (people.get(v) ?? null) : field === 'collection' ? (tmdb.get(v) ?? v) : v
    const condition = (c: RuleCondition): MockCondition => ({
      ...c,
      value: turnValues(c, turn(c.field)) as MockCondition['value'],
    })
    const rules = (g: RuleGroup | null): MockGroup | null =>
      g && {
        ...g,
        rules: g.rules.map((r) =>
          r.kind === 'condition' ? condition(r) : { ...r, rules: r.rules.map(condition) },
        ),
      }
    const titles = (ids: number[]) => ids.flatMap((n) => k.mockIdOf(ctx.srv.state, n) ?? [])
    const was = ctx.srv.state.collections.find((x) => x.id === id)
    return {
      id,
      name: input.name,
      summary: input.summary,
      artwork: input.artwork,
      rules: rules(input.rules),
      include: titles(input.include),
      exclude: titles(input.exclude),
      shows: was?.shows ?? [],
      sort: input.sort,
      descending: input.descending,
      limit: input.limit,
      audience: input.audience,
      updatedAt: was?.updatedAt ?? new Date(ctx.srv.clock.now()).toISOString(),
    }
  }

  // ------------------------------------------------------------ reads

  const usedBy = (ctx: Ctx, id: string) =>
    ctx.srv.state.featured
      .filter(
        (f) => f.source.kind === 'rule' && f.source.rule === 'collection' && f.source.value === id,
      )
      .map((f) => ({ id: f.id, title: f.title }))

  const summaries = (ctx: Ctx) => {
    const api = toApi(ctx)
    return ctx.api.collections.list().map((c) => ({
      ...api(c),
      matched: c.matched,
      playable: c.playable,
      // the films' posters: shows aren't the server's
      mosaic: ctx.api.collections
        .preview(c)
        .items.map((x) => x.poster)
        .filter(Boolean)
        .slice(0, 4),
      words: c.words,
      usedBy: usedBy(ctx, c.id),
    }))
  }

  const requireCollection = (ctx: Ctx, id: string) => {
    const c = ctx.srv.state.collections.find((x) => x.id === id)
    if (!c) throw refuse('not-found', t('collections.unknown'))
    return c
  }

  /** Whether a rule tree names a collection, at either level. */
  const names = (g: MockGroup | null, id: string): boolean =>
    !!g &&
    g.rules.some((r) =>
      r.kind === 'group'
        ? names(r, id)
        : r.field === 'collection' &&
          (Array.isArray(r.value) ? (r.value as unknown[]).includes(id) : r.value === id),
    )

  return {
    collections: {
      list: (_, ctx) => summaries(ctx),
      get: ({ params }, ctx) => {
        requireCollection(ctx, params.id)
        const s = summaries(ctx).find((x) => x.id === params.id)
        if (!s) throw refuse('not-found', t('collections.unknown'))
        return s
      },
      add: ({ body }, ctx) => {
        const id = `sc-${ctx.srv.clock.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
        return toApi(ctx)(ctx.api.collections.save(fromApi(ctx, body, id)))
      },
      save: ({ params, body }, ctx) => {
        requireCollection(ctx, params.id)
        return toApi(ctx)(ctx.api.collections.save(fromApi(ctx, body, params.id)))
      },
      remove: ({ params }, ctx) => {
        requireCollection(ctx, params.id)
        const sections = usedBy(ctx, params.id)
        const first = sections[0]
        if (first)
          throw refuse('conflict', t('collections.inUse', { title: first.title }), {
            reason: 'in-use',
            sections,
          })
        const naming = ctx.srv.state.collections.filter(
          (c) => c.id !== params.id && names(c.rules, params.id),
        )
        const other = naming[0]
        if (other)
          throw refuse('conflict', t('collections.namedBy', { name: other.name }), {
            reason: 'in-use',
            collections: naming.map((c) => ({ id: c.id, name: c.name })),
          })
        ctx.api.collections.remove(params.id)
        return undefined
      },
      preview: ({ body }, ctx) => {
        const p = ctx.api.collections.preview(fromApi(ctx, body.collection, body.id ?? 'sc-draft'))
        return {
          matched: p.matched,
          playable: p.playable,
          items: p.items.slice(0, PREVIEW_MAX).flatMap((x) => {
            const id = k.tmdbIdOf(ctx.srv.state, x.id)
            return id === null
              ? []
              : [
                  {
                    id,
                    title: x.title,
                    year: x.year || null,
                    poster: x.poster || null,
                    playable: x.playable,
                  },
                ]
          }),
          words: p.words,
        }
      },
      fields: ({ query }, ctx) => {
        const tmdb = new Set(collectionRefs().map((c) => c.id))
        const mock = new Map(ctx.api.collections.fields(query.except).map((f) => [f.field, f]))
        return RULE_FIELD_NAMES.flatMap((field) => {
          const f = mock.get(field)
          if (!f) return []
          const options =
            isPerson(field) || !f.options
              ? undefined
              : field === 'collection'
                ? f.options.map((o) =>
                    tmdb.has(o.value) ? { ...o, value: String(tmdbNumber(o.value)) } : o,
                  )
                : f.options
          return [
            {
              field,
              type: f.type,
              ops: f.ops,
              ...(options ? { options } : {}),
              ...(f.disabled ? { disabled: 'playback' as const } : {}),
            },
          ]
        })
      },
      people: ({ query }, ctx) => {
        const q = fold(query.q)
        if (!q) return []
        const field = query.field
        const jobs: readonly string[] | undefined =
          field && field in ROLE_JOBS ? ROLE_JOBS[field as keyof typeof ROLE_JOBS] : undefined
        const fits = (c: { cast: boolean; job: string | null }) =>
          !field || field === 'person' || !isPerson(field)
            ? true
            : field === 'actor'
              ? c.cast
              : !c.cast && !!c.job && !!jobs?.includes(c.job)
        const found = new Map<string, { name: string; photo: string; titles: Set<string> }>()
        for (const c of credits(ctx)) {
          if (!fits(c) || !fold(c.name).includes(q)) continue
          const p = found.get(c.personId) ?? { name: c.name, photo: c.photo, titles: new Set() }
          p.titles.add(c.titleId)
          found.set(c.personId, p)
        }
        return [...found.entries()]
          .map(([slug, p]) => ({
            id: tmdbNumber(slug),
            name: p.name,
            photo: p.photo || null,
            titles: p.titles.size,
          }))
          .sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name))
          .slice(0, PEOPLE_MAX)
      },
    },
  }
}
