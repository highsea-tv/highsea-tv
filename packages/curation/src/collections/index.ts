// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections (collections.md; checkpoint 8d, ADR 0049): collections the owner and admins
// make, from rules that are answered when read, or from titles picked by hand, with titles always
// or never included.
// - the admin's list, editor and live preview: every match and how many of them can be played;
// - the apps' Library › Collections: the server's collections a person is in the audience for,
//   then TMDB's with titles here, each with only what can be played;
// - featured sections draw on a collection (`collection` rule, `sc-` id), so a change tells
//   curation, which tells whoever's home changed; one can't be deleted while a section uses it.
// The library answers the rules (`CollectionLibrary`, the runtime's SQL), so curation never
// imports media. Titles are TMDB ids in the API and library item ids in the database.
import type {
  ClientItem,
  ClientType,
  CollectionPreview,
  CollectionSummary,
  LibraryCollection,
  RuleField,
  RuleFieldInfo,
  RuleGroup,
  RulePerson,
  SmartCollection,
  SmartCollectionInput,
} from '@highsea/api-contract'
import {
  type Audience,
  PLAYBACK_FIELDS,
  RULE_FIELD_NAMES,
  RULE_FIELDS,
  RuleGroup as RuleGroupSchema,
} from '@highsea/api-contract'
import { AppError, type Clock, type EventBus, type Logger, newId } from '@highsea/core'
import { type Db, schema } from '@highsea/db'
import { createT, defineMessages } from '@highsea/i18n'
import { asc, eq, inArray, max } from 'drizzle-orm'
import { mayReach, parseFilter, reaches, type Viewer } from '../service/rules.ts'
import {
  checkRules,
  describe,
  drawsOnItself,
  HDR_CHOICES,
  isSmartId,
  type Labels,
  NOT_RATED,
  namedCollections,
  RESOLUTIONS,
  SMART_PREFIX,
} from './rules.ts'

export * from './rules.ts'

const { smartCollections, smartCollectionItems, featuredSections, users } = schema

export const COLLECTIONS_TOPIC = 'collections.updated'
const HOME_TOPIC = 'home.updated'
/** Titles in the editor's preview. */
export const PREVIEW_MAX = 60
/** Posters in a mosaic (Plex draws four). */
const MOSAIC = 4

/** A collection as the library answers it: its titles as library item ids. */
export type CollectionDef = {
  id: string
  rules: RuleGroup | null
  include: string[]
  exclude: string[]
  sort: SmartCollection['sort']
  descending: boolean
  limit: number | null
}

/** A title a collection holds. */
export type Member = { itemId: string; tmdbId: number; playable: boolean }

export type Option = { value: string; label: string }

/** A TMDB collection with titles here that can be played, oldest first. */
export type TmdbCollection = {
  id: number
  name: string
  overview: string
  art: { poster: string | null; backdrop: string | null }
  tmdbIds: number[]
  years: number[]
}

/** What collections need from the library; the runtime answers it in SQL. */
export type CollectionLibrary = {
  /**
   * What a collection holds now, in its order and after its limit. `lookup` answers for the
   * collections its rules name; one that names a collection already being answered matches nothing.
   */
  evaluate(def: CollectionDef, lookup: (id: string) => CollectionDef | null): Member[]
  itemIds(tmdbIds: number[]): Map<number, string>
  tmdbIds(itemIds: string[]): Map<string, number>
  /** Titles as the apps see them, with this person's watch state, in this order. */
  items(tmdbIds: number[], userId: string): ClientItem[]
  /** A field's choices from what's in the library, for the fields the library knows. */
  options(field: RuleField): Option[]
  /** People credited here, by name; for a role field, only in that role. */
  people(query: string, field: RuleField | undefined, limit: number): RulePerson[]
  /** Names of people by TMDB id, for the rules in words. */
  personNames(ids: number[]): Map<number, string>
  /** TMDB's collections with titles here that can be played, by name. */
  tmdbCollections(): TmdbCollection[]
  /** The server's region's certifications, mildest first; null until TMDB has been asked. */
  certifications(): string[] | null
}

/** The labels the server gives fixed choices (the rest come from the library). */
export const choiceMessages = defineMessages({
  'status.available': 'Available',
  'status.wanted': 'Wanted',
  'status.downloading': 'Downloading',
  'status.not-released': 'Not released',
  'status.unmonitored': 'Unmonitored',
  notRated: 'Not rated',
  'hdr.any': 'Any HDR',
  'hdr.dolby-vision': 'Dolby Vision',
  'hdr.hdr10': 'HDR10',
  'hdr.hlg': 'HLG',
  'hdr.none': 'None',
  uhd: '4K',
  lines: '{n}p',
})
const ct = createT(choiceMessages)

const STATUSES = ['available', 'wanted', 'downloading', 'not-released', 'unmonitored'] as const

/** Fixed choices: the library's statuses, resolutions and HDR formats. */
function fixedOptions(field: RuleField): Option[] | null {
  switch (field) {
    case 'status':
      return STATUSES.map((s) => ({ value: s, label: ct(`status.${s}`) }))
    case 'resolution':
      return RESOLUTIONS.map((n) => ({
        value: String(n),
        label: n === 2160 ? ct('uhd') : ct('lines', { n }),
      }))
    case 'hdr':
      return HDR_CHOICES.map((h) => ({ value: h, label: ct(`hdr.${h}`) }))
    default:
      return null
  }
}

/** Fields whose choices come from the library or the fixed lists. */
const CHOICE_TYPES = new Set(['choice', 'list'])

type Row = typeof smartCollections.$inferSelect

const invalid = (message: string, field: string, reason = 'invalid') =>
  new AppError('invalid', message, { field, reason })

const iso = (ms: number) => new Date(ms).toISOString()
/** `sc-` and newId's random part, so the apps can tell the server's collections from TMDB's. */
const smartId = () => `${SMART_PREFIX}${newId('sc').slice('sc_'.length)}`

export function createCollections(deps: {
  db: Db
  clock: Clock
  events: EventBus
  logger: Logger
  library: CollectionLibrary
  /** A collection changed: featured sections drawing on it may show something else. */
  changed?: () => void
}) {
  const { db, clock, events, library } = deps
  const log = deps.logger.child('collections')

  // ------------------------------------------------------------ rows

  const rows = (): Row[] =>
    db.select().from(smartCollections).orderBy(asc(smartCollections.position)).all()

  const requireRow = (id: string): Row => {
    const row = db.select().from(smartCollections).where(eq(smartCollections.id, id)).get()
    if (!row) throw new AppError('not-found', 'There’s no collection with that id.')
    return row
  }

  /** Stored rules, checked with the contract's schema; a tree that no longer parses is none. */
  function rulesOf(row: Row): RuleGroup | null {
    if (row.rules === null) return null
    const parsed = RuleGroupSchema.safeParse(row.rules)
    if (!parsed.success) {
      log.warn('a collection’s rules don’t parse', { id: row.id })
      return null
    }
    return parsed.data
  }

  /** Each collection's picks and exceptions, by collection, in their order. */
  function picksOf(ids: string[]) {
    const out = new Map<string, { include: string[]; exclude: string[] }>()
    for (const id of ids) out.set(id, { include: [], exclude: [] })
    if (!ids.length) return out
    for (const r of db
      .select()
      .from(smartCollectionItems)
      .where(inArray(smartCollectionItems.collectionId, ids))
      .orderBy(asc(smartCollectionItems.position))
      .all())
      out.get(r.collectionId)?.[r.kind].push(r.itemId)
    return out
  }

  /** The saved collections as the library answers them, by id. */
  function defs(): Map<string, CollectionDef> {
    const all = rows()
    const picks = picksOf(all.map((r) => r.id))
    return new Map(
      all.map((r) => [
        r.id,
        {
          id: r.id,
          rules: rulesOf(r),
          include: picks.get(r.id)?.include ?? [],
          exclude: picks.get(r.id)?.exclude ?? [],
          sort: r.sort,
          descending: r.descending,
          limit: r.limit,
        },
      ]),
    )
  }

  function toApi(row: Row, picks: { include: string[]; exclude: string[] }): SmartCollection {
    const tmdb = library.tmdbIds([...picks.include, ...picks.exclude])
    return {
      id: row.id,
      name: row.name,
      summary: row.summary,
      artwork: row.artwork,
      rules: rulesOf(row),
      include: picks.include.flatMap((id) => tmdb.get(id) ?? []),
      exclude: picks.exclude.flatMap((id) => tmdb.get(id) ?? []),
      sort: row.sort,
      descending: row.descending,
      limit: row.limit,
      audience: row.audience as Audience,
      updatedAt: iso(row.updatedAt),
    }
  }

  // ------------------------------------------------------------ evaluating

  /** What a collection holds now; another named in its rules is answered from what's saved. */
  function evaluate(def: CollectionDef, saved = defs()): Member[] {
    return library.evaluate(def, (id) => (id === def.id ? def : (saved.get(id) ?? null)))
  }

  function draftDef(input: SmartCollectionInput, id: string): CollectionDef {
    const items = library.itemIds([...input.include, ...input.exclude])
    const excluded = new Set(input.exclude)
    return {
      id,
      rules: input.rules,
      // never wins over always
      include: input.include.filter((t) => !excluded.has(t)).flatMap((t) => items.get(t) ?? []),
      exclude: input.exclude.flatMap((t) => items.get(t) ?? []),
      sort: input.sort,
      descending: input.descending,
      limit: input.limit,
    }
  }

  // ------------------------------------------------------------ labels and words

  const smartNames = () => rows().map((r) => ({ value: r.id, label: r.name }))

  /** A field's choices: fixed, from the library, and for `collection` the server's own too. */
  function optionsOf(field: RuleField, except?: string): Option[] | undefined {
    const info = RULE_FIELDS[field]
    if (!CHOICE_TYPES.has(info.type)) return undefined
    if (field === 'certification') {
      // all of the region's, so a rule can be made before a title has the rating; without the
      // region's list, the ones the library holds
      const ratings = library.certifications() ?? library.options(field).map((o) => o.value)
      return [
        ...ratings.filter((r) => r !== NOT_RATED).map((r) => ({ value: r, label: r })),
        { value: NOT_RATED, label: ct('notRated') },
      ]
    }
    const fixed = fixedOptions(field)
    if (fixed) return fixed
    const found = library.options(field)
    if (field === 'collection') return [...found, ...smartNames().filter((c) => c.value !== except)]
    return found
  }

  /** Labels for the values a tree uses, reading only the fields it names. */
  function labelsFor(rules: RuleGroup | null): Labels {
    const cache = new Map<RuleField, Map<string, string>>()
    const people = new Map<number, string>()
    if (rules) {
      const conditions = rules.rules.flatMap((r) => (r.kind === 'group' ? r.rules : [r]))
      const ids = conditions
        .filter((c) => RULE_FIELDS[c.field].type === 'person')
        .flatMap((c) => (Array.isArray(c.value) ? c.value : [c.value]).map(Number))
      for (const [id, name] of library.personNames([...new Set(ids)])) people.set(id, name)
    }
    return (field, value) => {
      if (RULE_FIELDS[field].type === 'person') return people.get(Number(value)) ?? value
      let labels = cache.get(field)
      if (!labels) {
        labels = new Map((optionsOf(field) ?? []).map((o) => [o.value, o.label]))
        cache.set(field, labels)
      }
      return labels.get(value) ?? value
    }
  }

  const words = (rules: RuleGroup | null) => describe(rules, labelsFor(rules))

  // ------------------------------------------------------------ checking input

  function check(input: SmartCollectionInput, id: string) {
    if (!input.name.trim()) throw invalid('Give the collection a name.', 'name', 'required')
    if (!input.rules && !input.include.length)
      throw invalid('Add a rule, or pick at least one film.', 'rules', 'required')
    if (input.rules) {
      checkRules(input.rules, library.certifications())
      const saved = defs()
      for (const named of namedCollections(input.rules))
        if (named !== id && !saved.has(named))
          throw invalid('One of the collections chosen no longer exists.', 'rules', 'unknown')
      if (
        drawsOnItself(id, input.rules, (other) =>
          other === id ? input.rules : (saved.get(other)?.rules ?? null),
        )
      )
        throw invalid('A collection can’t be one of its own rules.', 'rules', 'self')
    }
    const a = input.audience
    if (a.kind === 'roles' && !a.roles.length)
      throw invalid('Choose at least one role.', 'audience', 'required')
    if (a.kind === 'clients' && !a.clients.length)
      throw invalid('Choose at least one kind of app.', 'audience', 'required')
    if (a.kind === 'users') {
      if (!a.userIds.length) throw invalid('Choose at least one person.', 'audience', 'required')
      const known = db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, a.userIds))
        .all()
      if (known.length !== new Set(a.userIds).size)
        throw invalid('One of the people chosen isn’t on this server.', 'audience', 'unknown')
    }
    const here = library.itemIds([...input.include, ...input.exclude])
    if ([...input.include, ...input.exclude].some((t) => !here.has(t)))
      throw invalid('One of the titles isn’t in the library.', 'include', 'unknown')
  }

  // ------------------------------------------------------------ writing

  function writePicks(id: string, input: SmartCollectionInput) {
    db.delete(smartCollectionItems).where(eq(smartCollectionItems.collectionId, id)).run()
    const def = draftDef(input, id)
    const values = [
      ...def.include.map((itemId, position) => ({
        collectionId: id,
        itemId,
        kind: 'include' as const,
        position,
      })),
      ...def.exclude.map((itemId, position) => ({
        collectionId: id,
        itemId,
        kind: 'exclude' as const,
        position,
      })),
    ]
    if (values.length) db.insert(smartCollectionItems).values(values).onConflictDoNothing().run()
  }

  const values = (input: SmartCollectionInput, now: number) => ({
    name: input.name.trim(),
    summary: input.summary.trim(),
    artwork: input.artwork,
    rules: input.rules,
    sort: input.sort,
    descending: input.descending,
    limit: input.limit,
    audience: input.audience,
    updatedAt: now,
  })

  /** Accepted accounts, for who a collection reaches. */
  const people = (): Viewer[] =>
    db.select({ id: users.id, role: users.role }).from(users).where(eq(users.invited, false)).all()

  /**
   * Writes, then tells the admin, the people whose Library › Collections may have changed (the
   * audience before and after), and curation, whose sections may draw on it.
   */
  function change<T>(audiences: Audience[], write: () => T): T {
    const result = db.transaction(() => write())
    events.emit({ topic: COLLECTIONS_TOPIC })
    try {
      const to = people()
        .filter((v) => audiences.some((a) => mayReach(a, v)))
        .map((v) => v.id)
      if (to.length) events.emit({ topic: HOME_TOPIC, to })
      deps.changed?.()
    } catch (e) {
      log.warn('couldn’t tell who a collection’s change reaches', { error: (e as Error).message })
    }
    return result
  }

  function usedBy(id: string) {
    return db
      .select({
        id: featuredSections.id,
        title: featuredSections.title,
        source: featuredSections.source,
      })
      .from(featuredSections)
      .orderBy(asc(featuredSections.position))
      .all()
      .filter(
        (s) => s.source.kind === 'rule' && s.source.rule === 'collection' && s.source.value === id,
      )
      .map((s) => ({ id: s.id, title: s.title }))
  }

  function summaryOf(row: Row, saved: Map<string, CollectionDef>): CollectionSummary {
    const def = saved.get(row.id) as CollectionDef
    const members = evaluate(def, saved)
    const playable = members.filter((m) => m.playable)
    return {
      ...toApi(row, { include: def.include, exclude: def.exclude }),
      matched: members.length,
      playable: playable.length,
      mosaic: library
        .items(
          (playable.length ? playable : members).slice(0, MOSAIC).map((m) => m.tmdbId),
          '',
        )
        .flatMap((m) => (m.art.poster ? [m.art.poster] : [])),
      words: words(def.rules),
      usedBy: usedBy(row.id),
    }
  }

  const viewer = (id: string): Viewer => {
    const row = db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .get()
    if (!row) throw new AppError('not-found', 'There’s no such person.')
    return row
  }

  const yearsOf = (years: number[]) => {
    if (!years.length) return ''
    const lo = Math.min(...years)
    const hi = Math.max(...years)
    return lo === hi ? String(lo) : `${lo}–${hi}`
  }

  /** A collection of the server's as the apps see it: what can be played, in its own order. */
  function forApps(row: Row, saved: Map<string, CollectionDef>, userId: string) {
    const def = saved.get(row.id) as CollectionDef
    const ids = evaluate(def, saved)
      .filter((m) => m.playable)
      .map((m) => m.tmdbId)
    if (!ids.length) return null
    const items = library.items(ids, userId)
    const first = items[0] as ClientItem
    const collection: LibraryCollection = {
      id: row.id,
      name: row.name,
      overview: row.summary,
      art: { poster: row.artwork ?? first.art.poster, backdrop: first.art.backdrop },
      count: items.length,
      years: yearsOf(items.flatMap((m) => (m.year === null ? [] : [m.year]))),
      smart: {
        rules: def.rules !== null,
        words: words(def.rules),
        mosaic: row.artwork
          ? []
          : items.slice(0, MOSAIC).flatMap((m) => (m.art.poster ? [m.art.poster] : [])),
      },
    }
    return { collection, items }
  }

  const tmdbForApps = (c: TmdbCollection): LibraryCollection => ({
    id: String(c.id),
    name: c.name,
    overview: c.overview,
    art: c.art,
    count: c.tmdbIds.length,
    years: yearsOf(c.years),
    smart: null,
  })

  return {
    // ---------------------------------------------------------- the admin

    /** Every collection, in the admin's order, with what it holds now. */
    list(): CollectionSummary[] {
      const saved = defs()
      return rows().map((r) => summaryOf(r, saved))
    },

    get(id: string): CollectionSummary {
      const row = requireRow(id)
      return summaryOf(row, defs())
    },

    add(input: SmartCollectionInput, createdBy: string | null): SmartCollection {
      const id = smartId()
      check(input, id)
      const now = clock.now()
      change([input.audience], () => {
        const last = db
          .select({ position: max(smartCollections.position) })
          .from(smartCollections)
          .get()
        db.insert(smartCollections)
          .values({
            id,
            ...values(input, now),
            position: (last?.position ?? -1) + 1,
            createdBy,
            createdAt: now,
          })
          .run()
        writePicks(id, input)
      })
      const row = requireRow(id)
      return toApi(row, picksOf([id]).get(id) as { include: string[]; exclude: string[] })
    },

    save(id: string, input: SmartCollectionInput): SmartCollection {
      const before = requireRow(id)
      check(input, id)
      change([before.audience as Audience, input.audience], () => {
        db.update(smartCollections)
          .set(values(input, clock.now()))
          .where(eq(smartCollections.id, id))
          .run()
        writePicks(id, input)
      })
      return toApi(
        requireRow(id),
        picksOf([id]).get(id) as { include: string[]; exclude: string[] },
      )
    },

    /** Its titles stay in the library. Refused while a featured section draws on it. */
    remove(id: string) {
      const row = requireRow(id)
      const sections = usedBy(id)
      if (sections.length)
        throw new AppError(
          'conflict',
          `The featured section “${(sections[0] as { title: string }).title}” draws on it. Choose another source for the section first.`,
          { reason: 'in-use', sections },
        )
      const names = rows().filter((r) => r.id !== id && namedCollections(rulesOf(r)).includes(id))
      if (names.length)
        throw new AppError(
          'conflict',
          `The collection “${(names[0] as Row).name}” names it in its rules. Change that collection first.`,
          { reason: 'in-use', collections: names.map((r) => ({ id: r.id, name: r.name })) },
        )
      change([row.audience as Audience], () => {
        db.delete(smartCollections).where(eq(smartCollections.id, id)).run()
        const left = db
          .select({ id: smartCollections.id })
          .from(smartCollections)
          .orderBy(asc(smartCollections.position))
          .all()
        for (const [position, r] of left.entries())
          db.update(smartCollections).set({ position }).where(eq(smartCollections.id, r.id)).run()
      })
    },

    /** What a draft holds now: both counts, its first titles in order, its rules in words. */
    preview(input: SmartCollectionInput, id?: string): CollectionPreview {
      const draftId = id ?? 'draft'
      if (input.rules) {
        checkRules(input.rules, library.certifications())
        const saved = defs()
        if (
          drawsOnItself(draftId, input.rules, (other) =>
            other === draftId ? input.rules : (saved.get(other)?.rules ?? null),
          )
        )
          throw invalid('A collection can’t be one of its own rules.', 'rules', 'self')
      }
      const members = evaluate(draftDef(input, draftId))
      const shown = members.slice(0, PREVIEW_MAX)
      const items = new Map(
        library
          .items(
            shown.map((m) => m.tmdbId),
            '',
          )
          .map((m) => [m.id, m]),
      )
      return {
        matched: members.length,
        playable: members.filter((m) => m.playable).length,
        items: shown.map((m) => {
          const item = items.get(m.tmdbId)
          return {
            id: m.tmdbId,
            title: item?.title ?? '',
            year: item?.year ?? null,
            poster: item?.art.poster ?? null,
            playable: m.playable,
          }
        }),
        words: words(input.rules),
      }
    },

    /** The fields the editor offers, with the library's choices; `except` is the one being edited. */
    fields(except?: string): RuleFieldInfo[] {
      return RULE_FIELD_NAMES.map((field) => {
        const info = RULE_FIELDS[field]
        const options = optionsOf(field, except)
        return {
          field,
          type: info.type,
          ops: [...info.ops],
          ...(options ? { options } : {}),
          ...(PLAYBACK_FIELDS.includes(field) ? { disabled: 'playback' as const } : {}),
        }
      })
    },

    people(query: string, field?: RuleField): RulePerson[] {
      const q = query.trim()
      if (!q) return []
      return library.people(q, field, 20)
    },

    // ---------------------------------------------------------- the apps

    /**
     * Library › Collections: the server's collections this person on this app is in the audience
     * for and can play something in, in the admin's order, then TMDB's with titles here.
     */
    forApps(userId: string, client: ClientType): LibraryCollection[] {
      const v = viewer(userId)
      const saved = defs()
      const own = rows()
        .filter((r) => reaches(r.audience as Audience, v, client))
        .flatMap((r) => forApps(r, saved, userId)?.collection ?? [])
      return [...own, ...library.tmdbCollections().map(tmdbForApps)]
    },

    /** A collection's page: the server's (`sc-…`) or TMDB's (its number). */
    page(id: string, userId: string, client: ClientType) {
      const gone = () => new AppError('not-found', 'There’s no collection with that id.')
      if (isSmartId(id)) {
        const row = db.select().from(smartCollections).where(eq(smartCollections.id, id)).get()
        if (!row || !reaches(row.audience as Audience, viewer(userId), client)) throw gone()
        const found = forApps(row, defs(), userId)
        if (!found) throw gone()
        return found
      }
      const c = library.tmdbCollections().find((x) => String(x.id) === id)
      if (!c) throw gone()
      return { collection: tmdbForApps(c), items: library.items(c.tmdbIds, userId) }
    },

    // ---------------------------------------------------------- featured sections

    /** What a section drawing on a collection shows: what can be played, in its order. */
    playable(id: string, limit: number): { tmdbIds: number[]; total: number } {
      const saved = defs()
      const def = saved.get(id)
      if (!def) return { tmdbIds: [], total: 0 }
      const ids = evaluate(def, saved)
        .filter((m) => m.playable)
        .map((m) => m.tmdbId)
      return { tmdbIds: ids.slice(0, limit), total: ids.length }
    },

    /** The collections a section can draw on, in the admin's order. */
    names: (): { id: string; name: string }[] => rows().map((r) => ({ id: r.id, name: r.name })),

    exists: (id: string) =>
      !!db
        .select({ id: smartCollections.id })
        .from(smartCollections)
        .where(eq(smartCollections.id, id))
        .get(),

    /** When any collection last changed: a section drawing on one compares it. */
    version(): number {
      return (
        db
          .select({ at: max(smartCollections.updatedAt) })
          .from(smartCollections)
          .get()?.at ?? 0
      )
    },

    /**
     * 8c's free-text filter rule (`year < 1930 and rating >= 4`) became collections in 8d: each
     * section still using one draws on a new collection with the same rules, named after it. Run at
     * boot; once there are none left it does nothing (ADR 0022).
     */
    adoptFilterSections(): number {
      const found = db
        .select()
        .from(featuredSections)
        .all()
        .filter((s) => s.source.kind === 'rule' && (s.source.rule as string) === 'filter')
      if (!found.length) return 0
      const now = clock.now()
      db.transaction(() => {
        let position =
          (db
            .select({ p: max(smartCollections.position) })
            .from(smartCollections)
            .get()?.p ?? -1) + 1
        for (const s of found) {
          const terms = parseFilter((s.source as { value: string }).value) ?? []
          const id = smartId()
          const rules: RuleGroup = {
            kind: 'group',
            id: 'root',
            match: 'all',
            rules: terms.map((term, i) => filterCondition(term, `r${i + 1}`)),
          }
          db.insert(smartCollections)
            .values({
              id,
              name: s.title,
              summary: '',
              artwork: null,
              rules: rules.rules.length ? rules : null,
              sort: 'rating',
              descending: true,
              limit: null,
              audience: { kind: 'everyone' },
              position: position++,
              createdBy: null,
              createdAt: now,
              updatedAt: now,
            })
            .run()
          db.update(featuredSections)
            .set({ source: { kind: 'rule', rule: 'collection', value: id }, updatedAt: now })
            .where(eq(featuredSections.id, s.id))
            .run()
        }
      })
      log.info('turned filter sections into collections', { count: found.length })
      return found.length
    },
  }
}

/** One of 8c's filter terms as a condition: ratings were out of 5 then too. */
function filterCondition(
  term: { field: 'year' | 'rating'; op: '<' | '<=' | '>' | '>=' | '='; value: number },
  id: string,
): RuleGroup['rules'][number] {
  const v = term.value
  if (term.field === 'year') {
    const [op, value] =
      term.op === '<'
        ? (['before', v] as const)
        : term.op === '<='
          ? (['before', v + 1] as const)
          : term.op === '>'
            ? (['after', v] as const)
            : term.op === '>='
              ? (['after', v - 1] as const)
              : (['is', v] as const)
    return { kind: 'condition', id, field: 'year', op, value }
  }
  const step = 0.1
  if (term.op === '=')
    return { kind: 'condition', id, field: 'rating', op: 'between', value: [v, v] }
  const atLeast = term.op === '>=' || term.op === '>'
  const value = term.op === '>' ? v + step : term.op === '<' ? v - step : v
  return {
    kind: 'condition',
    id,
    field: 'rating',
    op: atLeast ? 'atLeast' : 'atMost',
    value: Math.round(value * 10) / 10,
  }
}

export type Collections = ReturnType<typeof createCollections>
