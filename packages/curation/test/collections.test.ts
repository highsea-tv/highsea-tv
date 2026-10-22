// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections (checkpoint 8d, ADR 0049) against a fake library: what's refused and why, the
// admin's order, the events, what draws on a collection, the apps' list and page with the audience
// applied, the rules in words, featured sections drawing on a collection, and 8c's filter
// sections turned into collections. The SQL behind `evaluate` is tested in packages/runtime.
import { describe, expect, test } from 'bun:test'
import type {
  ClientItem,
  RuleCondition,
  RuleGroup,
  SmartCollectionInput,
} from '@highsea-tv/api-contract'
import {
  AppError,
  createEventBus,
  createFakeClock,
  type ServerEvent,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase, schema } from '@highsea-tv/db'
import { createJobQueue } from '@highsea-tv/jobs'
import {
  type CollectionDef,
  type CollectionLibrary,
  checkRules,
  createCollections,
  describe as inWords,
  type Member,
} from '../src/collections/index.ts'
import { type CurationLibrary, createCuration } from '../src/service/index.ts'

/** Titles by TMDB id: a year, a genre (TMDB's id) and whether there's a file. */
const TITLES = new Map([
  [10, { year: 1925, genre: '35', file: true }],
  [20, { year: 2001, genre: '18', file: true }],
  [30, { year: 2010, genre: '35', file: true }],
  [40, { year: 2020, genre: '18', file: false }],
])
/** Regions' certifications, mildest first, as `@highsea-tv/metadata` gives them from TMDB's list. */
const US = ['NR', 'G', 'PG', 'PG-13', 'R', 'NC-17']
const GB = ['U', 'PG', '12A', '12', '15', '18', 'R18']
const DE = ['0', '6', '12', '16', '18']
/** The server's region's list; null before TMDB has been asked. */
let ratings: string[] | null = US
const itemOf = (tmdb: number) => `i-${tmdb}`
const tmdbOf = (item: string) => Number(item.slice(2))

/** Answers year and genre conditions, and other collections, the way the SQL does. */
function fakeLibrary(): CollectionLibrary {
  const matches = (
    rule: RuleGroup['rules'][number],
    tmdb: number,
    lookup: (id: string) => CollectionDef | null,
    visiting: Set<string>,
  ): boolean => {
    if (rule.kind === 'group') return holds(rule, tmdb, lookup, visiting)
    const t = TITLES.get(tmdb) as { year: number; genre: string }
    const v = rule.value
    switch (rule.field) {
      case 'year':
        return rule.op === 'after'
          ? t.year > Number(v)
          : rule.op === 'before'
            ? t.year < Number(v)
            : t.year === v
      case 'genre':
        return (v as string[]).includes(t.genre) === (rule.op !== 'noneOf')
      case 'collection':
        return (v as string[]).some((id) => {
          const def = lookup(id)
          if (!def || visiting.has(id)) return false
          return run(def, lookup, new Set([...visiting, id])).some((m) => m.tmdbId === tmdb)
        })
      default:
        return false
    }
  }
  const holds = (
    g: { match: 'all' | 'any'; rules: RuleGroup['rules'] },
    tmdb: number,
    lookup: (id: string) => CollectionDef | null,
    visiting: Set<string>,
  ): boolean =>
    g.match === 'all'
      ? g.rules.every((r) => matches(r, tmdb, lookup, visiting))
      : g.rules.some((r) => matches(r, tmdb, lookup, visiting))
  const run = (
    def: CollectionDef,
    lookup: (id: string) => CollectionDef | null,
    visiting = new Set([def.id]),
  ): Member[] => {
    const ids = [...TITLES.keys()].filter(
      (tmdb) =>
        !def.exclude.includes(itemOf(tmdb)) &&
        (def.include.includes(itemOf(tmdb)) ||
          (def.rules !== null && holds(def.rules, tmdb, lookup, visiting))),
    )
    if (def.descending) ids.reverse()
    return ids
      .slice(0, def.limit ?? undefined)
      .map((tmdbId) => ({ itemId: itemOf(tmdbId), tmdbId, playable: !!TITLES.get(tmdbId)?.file }))
  }
  return {
    evaluate: (def, lookup) => run(def, lookup),
    itemIds: (ids) => new Map(ids.filter((id) => TITLES.has(id)).map((id) => [id, itemOf(id)])),
    tmdbIds: (items) => new Map(items.map((i) => [i, tmdbOf(i)])),
    items: (ids) => ids.map(clientItem),
    options: (field) =>
      field === 'genre'
        ? [
            { value: '18', label: 'Drama' },
            { value: '35', label: 'Comedy' },
          ]
        : field === 'collection'
          ? [{ value: '9', label: 'Blender Open Movies' }]
          : field === 'certification'
            ? [{ value: 'PG-13', label: 'PG-13' }]
            : [],
    people: (q) => (q === 'lang' ? [{ id: 400, name: 'Fritz Lang', photo: null, titles: 1 }] : []),
    personNames: (ids) => new Map(ids.filter((id) => id === 400).map((id) => [id, 'Fritz Lang'])),
    certifications: () => ratings,
    tmdbCollections: () => [
      {
        id: 9,
        name: 'Blender Open Movies',
        overview: '',
        art: { poster: '/c', backdrop: null },
        tmdbIds: [30],
        years: [2010],
      },
    ],
  }
}

function clientItem(id: number): ClientItem {
  return {
    id,
    type: 'movie',
    title: `Movie ${id}`,
    year: TITLES.get(id)?.year ?? null,
    runtimeMinutes: 90,
    genres: [],
    synopsis: '',
    rating: 4,
    voteCount: 10,
    releaseDate: null,
    addedAt: new Date(0).toISOString(),
    status: 'available',
    playable: !!TITLES.get(id)?.file,
    art: { poster: `/p/${id}`, backdrop: `/b/${id}` },
    progress: null,
    position: 0,
  }
}

function setup() {
  ratings = US
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const sent: ServerEvent[] = []
  events.subscribe((e) => sent.push(e))
  for (const [id, role] of [
    ['ines', 'owner'],
    ['sam', 'admin'],
    ['ruth', 'user'],
  ] as const)
    db.insert(schema.users)
      .values({
        id,
        username: id,
        displayName: id,
        role,
        invited: false,
        webauthnId: id,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      })
      .run()
  for (const tmdbId of TITLES.keys())
    db.insert(schema.mediaItems)
      .values({
        id: itemOf(tmdbId),
        type: 'movie',
        tmdbId,
        title: `Movie ${tmdbId}`,
        sortTitle: `movie ${tmdbId}`,
        status: 'available',
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'any',
        rootFolder: '/movies',
        path: `/movies/${tmdbId}`,
        addedAt: clock.now(),
        updatedAt: clock.now(),
      })
      .run()
  let changed = 0
  const collections = createCollections({
    db,
    clock,
    events,
    logger: silentLogger,
    library: fakeLibrary(),
    changed: () => changed++,
  })
  return { db, raw, clock, events, sent, collections, changed: () => changed }
}

let n = 0
const cond = (
  field: RuleCondition['field'],
  op: RuleCondition['op'],
  value: RuleCondition['value'],
): RuleCondition => ({ kind: 'condition', id: `r${n++}`, field, op, value })
/** A group; one inside another may only hold conditions, which checkRules is tested on. */
const all = (...rules: (RuleCondition | RuleGroup)[]): RuleGroup =>
  ({ kind: 'group', id: `g${n++}`, match: 'all', rules }) as RuleGroup

const input = (patch: Partial<SmartCollectionInput> = {}): SmartCollectionInput => ({
  name: 'Comedies',
  summary: '',
  artwork: null,
  rules: all(cond('genre', 'anyOf', ['35'])),
  include: [],
  exclude: [],
  sort: 'title',
  descending: false,
  limit: null,
  audience: { kind: 'everyone' },
  ...patch,
})

/** The AppError a call throws: its message, and its details. */
function refusal(call: () => unknown) {
  try {
    call()
  } catch (e) {
    if (e instanceof AppError) return { code: e.code, message: e.message, details: e.details }
    throw e
  }
  throw new Error('expected a refusal')
}

describe('checking a collection', () => {
  test('a name, and rules or picks', () => {
    const { collections } = setup()
    expect(refusal(() => collections.add(input({ name: ' ' }), null)).message).toBe(
      'Give the collection a name.',
    )
    expect(refusal(() => collections.add(input({ rules: null }), null)).message).toBe(
      'Add a rule, or pick at least one film.',
    )
    expect(refusal(() => collections.add(input({ include: [99] }), null)).message).toBe(
      'One of the titles isn’t in the library.',
    )
    expect(
      refusal(() => collections.add(input({ audience: { kind: 'roles', roles: [] } }), null))
        .message,
    ).toBe('Choose at least one role.')
    expect(
      refusal(() =>
        collections.add(input({ audience: { kind: 'users', userIds: ['nobody'] } }), null),
      ).message,
    ).toBe('One of the people chosen isn’t on this server.')
  })

  test('each field with its own comparisons and values, groups one level deep', () => {
    const message = (rules: RuleGroup) => refusal(() => checkRules(rules)).message
    expect(message(all(cond('year', 'contains', 'x')))).toBe(
      'That comparison doesn’t go with that field.',
    )
    expect(message(all(cond('watched', 'is', 'yes')))).toBe(
      'Watch state comes with playback, so it can’t be used yet.',
    )
    expect(message(all(cond('year', 'between', [2010] as unknown as [number, number])))).toBe(
      'Give both ends of the range.',
    )
    expect(message(all(cond('genre', 'anyOf', [])))).toBe('Choose at least one.')
    expect(message(all(cond('resolution', 'is', '1440')))).toBe(
      'Choose 480p, 576p, 720p, 1080p or 4K.',
    )
    expect(message(all(cond('releaseDate', 'before', '1 May')))).toBe('Give a date as YYYY-MM-DD.')
    expect(message(all(cond('actor', 'includes', [])))).toBe('Choose at least one person.')
    expect(message(all(all(all(cond('year', 'is', 2010)))))).toBe('Groups go one level deep.')
    const bad = refusal(() => checkRules(all(cond('decade', 'is', '1995'))))
    expect(bad.details).toMatchObject({ field: 'rules', reason: 'invalid' })
    // fine
    checkRules(all(cond('year', 'between', [2010, 2020]), all(cond('resolution', 'is', '4K'))))
  })

  test('certifications are the region’s, or any short text before TMDB is asked', () => {
    const message = (c: RuleCondition, list: string[] | null) =>
      refusal(() => checkRules(all(c), list)).message
    const fine = (c: RuleCondition, list: string[] | null) => checkRules(all(c), list)
    const wrong = 'Choose a certification from the list.'
    // US
    fine(cond('certification', 'is', 'PG-13'), US)
    fine(cond('certification', 'isNot', ['R', 'NR']), US)
    fine(cond('certification', 'atMost', 'PG'), US)
    expect(message(cond('certification', 'is', '12A'), US)).toBe(wrong)
    expect(message(cond('certification', 'atMost', 'NR'), US)).toBe(wrong)
    // GB
    fine(cond('certification', 'is', '12A'), GB)
    fine(cond('certification', 'isNot', ['18', 'R18']), GB)
    fine(cond('certification', 'atMost', '15'), GB)
    expect(message(cond('certification', 'atMost', 'PG-13'), GB)).toBe(wrong)
    // DE
    fine(cond('certification', 'is', ['0', '6']), DE)
    fine(cond('certification', 'isNot', 'NR'), DE)
    fine(cond('certification', 'atMost', '12'), DE)
    expect(message(cond('certification', 'is', 'FSK 12'), DE)).toBe(wrong)
    // not asked yet: anything of 1 to 10 characters, so an offline server still works
    fine(cond('certification', 'is', 'FSK 12'), null)
    fine(cond('certification', 'atMost', '12A'), null)
    expect(message(cond('certification', 'is', 'Not suitable for anyone'), null)).toBe(wrong)
    expect(message(cond('certification', 'atMost', 'NR'), null)).toBe(wrong)
    // saving checks against the region's list
    const { collections } = setup()
    expect(
      refusal(() =>
        collections.add(input({ rules: all(cond('certification', 'is', '12A')) }), null),
      ).message,
    ).toBe(wrong)
    ratings = GB
    expect(
      collections.add(input({ rules: all(cond('certification', 'atMost', '12A')) }), null).rules,
    ).not.toBeNull()
  })

  test('another collection must exist, and none may draw on itself', () => {
    const { collections } = setup()
    expect(
      refusal(() =>
        collections.add(input({ rules: all(cond('collection', 'oneOf', ['sc-gone'])) }), null),
      ).message,
    ).toBe('One of the collections chosen no longer exists.')
    const a = collections.add(input({ name: 'A' }), null)
    const b = collections.add(
      input({ name: 'B', rules: all(cond('collection', 'oneOf', [a.id])) }),
      null,
    )
    const loop = refusal(() =>
      collections.save(a.id, input({ name: 'A', rules: all(cond('collection', 'oneOf', [b.id])) })),
    )
    expect(loop).toMatchObject({
      message: 'A collection can’t be one of its own rules.',
      details: { field: 'rules', reason: 'self' },
    })
    expect(
      refusal(() =>
        collections.preview(input({ rules: all(cond('collection', 'oneOf', [b.id])) }), a.id),
      ).message,
    ).toBe('A collection can’t be one of its own rules.')
  })
})

describe('the admin', () => {
  test('in the order they were made, closing up when one goes; every change tells', () => {
    const { collections, sent, changed } = setup()
    const a = collections.add(input({ name: 'A' }), 'ines')
    const b = collections.add(input({ name: 'B' }), 'ines')
    const c = collections.add(input({ name: 'C' }), 'ines')
    expect(a.id).toMatch(/^sc-/)
    expect(collections.list().map((x) => x.name)).toEqual(['A', 'B', 'C'])
    collections.remove(b.id)
    expect(collections.list().map((x) => x.name)).toEqual(['A', 'C'])
    expect(collections.names()).toEqual([
      { id: a.id, name: 'A' },
      { id: c.id, name: 'C' },
    ])
    expect(sent.filter((e) => e.topic === 'collections.updated')).toHaveLength(4)
    const home = sent.filter((e) => e.topic === 'home.updated')
    expect(home.at(-1)).toMatchObject({ to: ['ines', 'sam', 'ruth'] })
    expect(changed()).toBe(4)
  })

  test('only the people an audience may reach hear of it, before and after', () => {
    const { collections, sent } = setup()
    const a = collections.add(input({ audience: { kind: 'users', userIds: ['ruth'] } }), null)
    expect(sent.filter((e) => e.topic === 'home.updated').at(-1)).toMatchObject({ to: ['ruth'] })
    collections.save(a.id, input({ audience: { kind: 'roles', roles: ['admin'] } }))
    expect(sent.filter((e) => e.topic === 'home.updated').at(-1)).toMatchObject({
      to: ['sam', 'ruth'],
    })
  })

  test('picks and exceptions by TMDB id, Never wins over Always', () => {
    const { collections } = setup()
    const saved = collections.add(
      input({ rules: null, include: [40, 20, 10], exclude: [10] }),
      null,
    )
    expect(saved.include).toEqual([40, 20])
    expect(saved.exclude).toEqual([10])
    const summary = collections.get(saved.id)
    expect(summary).toMatchObject({ matched: 2, playable: 1, words: null })
    expect(summary.mosaic).toEqual(['/p/20'])
  })

  test('a summary: both counts, a mosaic of four, words and what draws on it', () => {
    const { collections } = setup()
    const s = collections.get(
      collections.add(
        input({
          rules: {
            kind: 'group',
            id: 'root',
            match: 'any',
            rules: [cond('genre', 'anyOf', ['35']), cond('year', 'after', 2015)],
          },
        }),
        null,
      ).id,
    )
    expect(s).toMatchObject({
      matched: 3,
      playable: 2,
      mosaic: ['/p/10', '/p/30'],
      words: 'Comedy or released after 2015',
      usedBy: [],
    })
  })

  test('the preview saves nothing and names what it can', () => {
    const { collections } = setup()
    const p = collections.preview(
      input({ rules: all(cond('genre', 'noneOf', ['35']), cond('director', 'includes', ['400'])) }),
    )
    expect(p.matched).toBe(0)
    expect(p.words).toBe('Not Comedy, directed by Fritz Lang')
    const q = collections.preview(input())
    expect(q).toMatchObject({ matched: 2, playable: 2 })
    expect(q.items.map((i) => [i.id, i.title, i.playable])).toEqual([
      [10, 'Movie 10', true],
      [30, 'Movie 30', true],
    ])
    expect(collections.list()).toEqual([])
  })

  test('fields: every one, with choices, watch state waiting for playback', () => {
    const { collections } = setup()
    const a = collections.add(input({ name: 'A' }), null)
    const b = collections.add(input({ name: 'B' }), null)
    const fields = collections.fields(a.id)
    const field = (name: string) => fields.find((f) => f.field === name)
    expect(field('genre')?.options?.map((o) => o.label)).toEqual(['Drama', 'Comedy'])
    expect(field('certification')?.options?.map((o) => o.value)).toEqual([
      'G',
      'PG',
      'PG-13',
      'R',
      'NC-17',
      'NR',
    ])
    expect(field('certification')?.options?.at(-1)).toEqual({ value: 'NR', label: 'Not rated' })
    ratings = DE
    expect(collections.fields().find((f) => f.field === 'certification')?.options).toEqual([
      { value: '0', label: '0' },
      { value: '6', label: '6' },
      { value: '12', label: '12' },
      { value: '16', label: '16' },
      { value: '18', label: '18' },
      { value: 'NR', label: 'Not rated' },
    ])
    // before TMDB is asked, what the library holds
    ratings = null
    expect(
      collections
        .fields()
        .find((f) => f.field === 'certification')
        ?.options?.map((o) => o.value),
    ).toEqual(['PG-13', 'NR'])
    // TMDB's, then the server's own, leaving out the one being edited
    expect(field('collection')?.options).toEqual([
      { value: '9', label: 'Blender Open Movies' },
      { value: b.id, label: 'B' },
    ])
    expect(field('watched')?.disabled).toBe('playback')
    expect(field('year')?.options).toBeUndefined()
    expect(collections.people('  ')).toEqual([])
    expect(collections.people('lang', 'director').map((p) => p.name)).toEqual(['Fritz Lang'])
  })

  test('can’t go while a featured section or another collection draws on it', () => {
    const { db, clock, collections } = setup()
    const a = collections.add(input({ name: 'A' }), null)
    db.insert(schema.featuredSections)
      .values({
        id: 'fs1',
        title: 'Laughs',
        tagline: null,
        layout: 'row',
        source: { kind: 'rule', rule: 'collection', value: a.id },
        audience: { kind: 'everyone' },
        startAt: 0,
        endAt: null,
        position: 0,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      })
      .run()
    expect(collections.get(a.id).usedBy).toEqual([{ id: 'fs1', title: 'Laughs' }])
    expect(refusal(() => collections.remove(a.id))).toMatchObject({
      code: 'conflict',
      message:
        'The featured section “Laughs” draws on it. Choose another source for the section first.',
      details: { reason: 'in-use' },
    })
    db.delete(schema.featuredSections).run()
    collections.add(input({ name: 'B', rules: all(cond('collection', 'oneOf', [a.id])) }), null)
    expect(refusal(() => collections.remove(a.id))).toMatchObject({
      code: 'conflict',
      message: 'The collection “B” names it in its rules. Change that collection first.',
    })
  })
})

describe('the apps', () => {
  test('the audience’s collections with something to play, then TMDB’s', () => {
    const { collections } = setup()
    collections.add(input({ name: 'Everyone' }), null)
    collections.add(input({ name: 'Admins', audience: { kind: 'roles', roles: ['admin'] } }), null)
    collections.add(
      input({ name: 'On TV', audience: { kind: 'clients', clients: ['tvos'] } }),
      null,
    )
    // only the title without a file
    collections.add(input({ name: 'Nothing yet', rules: all(cond('year', 'is', 2020)) }), null)
    const names = (user: string, client: 'web' | 'tvos') =>
      collections.forApps(user, client).map((c) => c.name)
    expect(names('ruth', 'web')).toEqual(['Everyone', 'Blender Open Movies'])
    expect(names('sam', 'web')).toEqual(['Everyone', 'Admins', 'Blender Open Movies'])
    expect(names('ruth', 'tvos')).toEqual(['Everyone', 'On TV', 'Blender Open Movies'])
    const own = collections.forApps('ruth', 'web')[0]
    expect(own).toMatchObject({
      count: 2,
      years: '1925–2010',
      art: { poster: '/p/10', backdrop: '/b/10' },
      smart: { rules: true, words: 'Comedy', mosaic: ['/p/10', '/p/30'] },
    })
    expect(collections.forApps('ruth', 'web')[1]).toMatchObject({ id: '9', smart: null })
  })

  test('a page, only where the person is in the audience', () => {
    const { collections } = setup()
    const admins = collections.add(
      input({ name: 'Admins', audience: { kind: 'roles', roles: ['admin'] } }),
      null,
    )
    expect(collections.page(admins.id, 'sam', 'web').items.map((i) => i.id)).toEqual([10, 30])
    expect(refusal(() => collections.page(admins.id, 'ruth', 'web'))).toMatchObject({
      code: 'not-found',
      message: 'There’s no collection with that id.',
    })
    expect(collections.page('9', 'ruth', 'web').items.map((i) => i.id)).toEqual([30])
    expect(refusal(() => collections.page('8', 'ruth', 'web')).code).toBe('not-found')
  })
})

describe('featured sections', () => {
  test('a section draws on a collection: what can be played, in its order, and it refreshes', () => {
    const { db, clock, events, collections } = setup()
    const library: CurationLibrary = {
      itemIds: () => new Map(),
      tmdbIds: () => new Map(),
      withFile: (ids) => new Set(ids),
      pick: () => ({ tmdbIds: [], total: 0 }),
      items: (ids) => ids.map(clientItem),
      builtIn: () => [],
      ruleOptions: () => ({ genres: [], collections: [] }),
    }
    const curation = createCuration({
      db,
      clock,
      events,
      jobs: createJobQueue({ db, clock, events }),
      logger: silentLogger,
      library,
      arrangement: () => ({ order: [], hidden: [] }),
      smart: collections,
    })
    const c = collections.add(input({ descending: true }), null)
    expect(collections.playable(c.id, 1)).toEqual({ tmdbIds: [30], total: 2 })
    expect(curation.ruleOptions().smart).toEqual([{ id: c.id, name: 'Comedies' }])
    expect(collections.version()).toBe(clock.now())
    expect(collections.exists(c.id)).toBe(true)
    expect(collections.exists('sc-gone')).toBe(false)
    expect(collections.playable('sc-gone', 5)).toEqual({ tmdbIds: [], total: 0 })
  })

  test('8c’s filter sections become collections, once', () => {
    const { db, clock, collections } = setup()
    db.insert(schema.featuredSections)
      .values({
        id: 'fs1',
        title: 'Silent era',
        tagline: null,
        layout: 'row',
        source: { kind: 'rule', rule: 'filter' as 'genre', value: 'year < 1930 and rating >= 4' },
        audience: { kind: 'everyone' },
        startAt: 0,
        endAt: null,
        position: 0,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      })
      .run()
    expect(collections.adoptFilterSections()).toBe(1)
    expect(collections.adoptFilterSections()).toBe(0)
    const [made] = collections.list()
    expect(made).toMatchObject({
      name: 'Silent era',
      sort: 'rating',
      descending: true,
      words: 'Released before 1930, rated 4 or more',
    })
    expect(made?.rules?.rules).toMatchObject([
      { field: 'year', op: 'before', value: 1930 },
      { field: 'rating', op: 'atLeast', value: 4 },
    ])
    const section = db.select().from(schema.featuredSections).get()
    expect(section?.source).toEqual({ kind: 'rule', rule: 'collection', value: made?.id as string })
  })
})

describe('the rules in words', () => {
  test('all joined by commas, any by or, a group in brackets', () => {
    const label = (_: string, v: string) => ({ '35': 'Comedy', '18': 'Drama' })[v] ?? v
    expect(
      inWords(
        all(
          cond('year', 'between', [2020, 2010]),
          cond('rating', 'atLeast', 4.5),
          cond('originalLanguage', 'is', 'en'),
          {
            kind: 'group',
            id: 'x',
            match: 'any',
            rules: [cond('genre', 'anyOf', ['35', '18']), cond('runtime', 'atMost', 90)],
          },
        ),
        label,
      ),
    ).toBe(
      'Released 2010–2020, rated 4.5 or more, in en, (Comedy or Drama or 90 minutes or shorter)',
    )
    expect(inWords(all(cond('year', 'inLast', 1)), label)).toBe('Released in the last 1 year')
    expect(inWords(all(), label)).toBeNull()
  })
})
