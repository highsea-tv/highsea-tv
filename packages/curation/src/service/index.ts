// SPDX-License-Identifier: AGPL-3.0-only
// Curation (curation.md, client-home.md; checkpoint 8c, ADR 0048):
// - announcements: placed, aimed at an audience and scheduled, with who has seen or acknowledged
//   each (reach counts people, not devices, and only accepted accounts);
// - featured sections: picked by hand or by a rule, in the owner's order, with taglines and artwork
//   per title;
// - resolution per person and kind of app: `home()` and `announcements()`, which the apps read, and
//   `preview()`, the same with one draft in it, saving nothing;
// - `announcements.updated` and `home.updated`, sent to each person only when what they'd get
//   changed: after a save, and at each start and end, where `curation.schedule` runs. A run
//   compares what each person gets with what they got before, so a second run sends nothing
//   (ADR 0022).
// Curation doesn't import the library: the runtime hands it `CurationLibrary`.
import type {
  Announcement,
  AnnouncementInput,
  AnnouncementSummary,
  Audience,
  ClientAnnouncement,
  ClientItem,
  ClientType,
  CurationPreview,
  CurationPreviewInput,
  FeaturedOverride,
  FeaturedSection,
  FeaturedSectionInput,
  FeaturedSource,
  HomeItem,
  HomeSection,
  RuleOptions,
  SectionSummary,
} from '@highsea-tv/api-contract'
import { AppError, type Clock, type EventBus, type Logger, newId } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import {
  CLIENTS,
  type LibraryPick,
  mayReach,
  RULE_ERRORS,
  reaches,
  rulePick,
  statusOf,
  type Viewer,
} from './rules.ts'

export * from './rules.ts'

const { announcements, announcementSeen, featuredSections, featuredOverrides, users } = schema

export const CURATION_JOB = 'curation.schedule'
/** A safety net under the runs at each start and end: a clock that jumped is caught within it. */
export const CURATION_EVERY_MS = 60 * 60 * 1000
export const CURATION_TOPIC = 'curation.updated'
export const ANNOUNCEMENTS_TOPIC = 'announcements.updated'
export const HOME_TOPIC = 'home.updated'
/** Titles a section shows, and the composer's list. */
export const SECTION_MAX = 50
/** Posters in the admin list's strip. */
const SAMPLE = 6

/** A built-in row of the home screen (ADR 0028): Continue watching, Recently added, a genre. */
export type BuiltInRow = { id: string; title: string | null; items: ClientItem[] }

/** What curation needs from the library; the runtime adapts `movies` to it. */
export type CurationLibrary = {
  /** Which of these TMDB ids are in the library, by TMDB id, with their item ids. */
  itemIds(tmdbIds: number[]): Map<number, string>
  /** The TMDB ids of these library items. */
  tmdbIds(itemIds: string[]): Map<string, number>
  /** Which of these titles have a file to play. */
  withFile(tmdbIds: number[]): Set<number>
  /** What a rule picks now: titles with a file, best first, at most `limit`, and how many in all. */
  pick(pick: LibraryPick, limit: number): { tmdbIds: number[]; total: number }
  /** Titles as the apps see them, with this person's watch state, in this order. */
  items(tmdbIds: number[], userId: string): ClientItem[]
  /** The rows under the featured ones: Continue watching, then Recently added and genres. */
  builtIn(userId: string): BuiltInRow[]
  ruleOptions(): Omit<RuleOptions, 'smart'>
}

/** The server's own collections (checkpoint 8d), which a `collection` rule can draw on. */
export type SmartSource = {
  /** What can be played, in the collection's order, at most `limit`, and how many in all. */
  playable(id: string, limit: number): { tmdbIds: number[]; total: number }
  exists(id: string): boolean
  names(): { id: string; name: string }[]
  /** Changes whenever any collection does. */
  version(): number
}

type AnnouncementRow = typeof announcements.$inferSelect
type SectionRow = typeof featuredSections.$inferSelect

/** A featured section as resolution reads it: the API's shape, its times as numbers. */
type Section = FeaturedSection & { startAt: number; endAt: number | null; updatedAt: number }
type Live = Announcement & { startAt: number; endAt: number | null; updatedAt: number }

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (value: string) => Date.parse(value)

const invalid = (message: string, field: string, reason = 'invalid') =>
  new AppError('invalid', message, { field, reason })

export function createCuration(deps: {
  db: Db
  clock: Clock
  events: EventBus
  jobs: JobQueue
  logger: Logger
  library: CurationLibrary
  /** A person's own order and hidden rows (`/me/home`). */
  arrangement(userId: string): { order: string[]; hidden: string[] }
  /** The server's own collections; without them a collection rule names TMDB's only. */
  smart?: SmartSource
}) {
  const { db, clock, events, jobs, library } = deps
  const log = deps.logger.child('curation')

  // ------------------------------------------------------------ people

  /** Accepted accounts: an invite doesn't count until it's taken up. */
  const people = (): Viewer[] =>
    db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.invited, false))
      .orderBy(asc(users.createdAt))
      .all()

  const viewer = (id: string): Viewer => {
    const row = db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .get()
    if (!row) throw new AppError('not-found', 'There’s no such person.')
    return row
  }

  // ------------------------------------------------------------ rows to shapes

  function announcementOf(row: AnnouncementRow, now = clock.now()): Live {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      image: row.image,
      cta: row.cta ?? null,
      severity: row.severity,
      placements: row.placements,
      audience: row.audience as Audience,
      schedule: { start: iso(row.startAt), end: row.endAt === null ? null : iso(row.endAt) },
      acknowledgement: row.acknowledgement,
      status: statusOf(row, now),
      startAt: row.startAt,
      endAt: row.endAt,
      updatedAt: row.updatedAt,
    }
  }

  const strip = ({ startAt: _s, endAt: _e, updatedAt: _u, ...a }: Live): Announcement => a

  function sectionsOf(rows: SectionRow[]): Section[] {
    const manual = rows.flatMap((r) => (r.source.kind === 'manual' ? r.source.itemIds : []))
    const overrides = rows.length
      ? db
          .select()
          .from(featuredOverrides)
          .where(
            inArray(
              featuredOverrides.sectionId,
              rows.map((r) => r.id),
            ),
          )
          .all()
      : []
    const tmdb = library.tmdbIds([...new Set([...manual, ...overrides.map((o) => o.itemId)])])
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      tagline: r.tagline,
      layout: r.layout,
      source:
        r.source.kind === 'manual'
          ? {
              kind: 'manual',
              itemIds: r.source.itemIds.flatMap((id) => tmdb.get(id) ?? []),
            }
          : r.source,
      overrides: overrides
        .filter((o) => o.sectionId === r.id)
        .flatMap((o) => {
          const itemId = tmdb.get(o.itemId)
          return itemId ? [{ itemId, artwork: o.artwork, tagline: o.tagline }] : []
        }),
      audience: r.audience as Audience,
      schedule: { start: iso(r.startAt), end: r.endAt === null ? null : iso(r.endAt) },
      order: r.position,
      startAt: r.startAt,
      endAt: r.endAt,
      updatedAt: r.updatedAt,
    }))
  }

  const allSections = () =>
    sectionsOf(db.select().from(featuredSections).orderBy(asc(featuredSections.position)).all())

  const allAnnouncements = (now = clock.now()) =>
    db
      .select()
      .from(announcements)
      .all()
      .map((r) => announcementOf(r, now))

  // ------------------------------------------------------------ resolving a section

  /** TMDB ids a source picks now, with a file, in order, and how many in all. */
  function picks(
    source: FeaturedSource,
    limit = SECTION_MAX,
  ): { tmdbIds: number[]; total: number } {
    if (source.kind === 'manual') {
      const playable = library.withFile(source.itemIds)
      const ids = source.itemIds.filter((id) => playable.has(id))
      return { tmdbIds: ids.slice(0, limit), total: ids.length }
    }
    const pick = rulePick(source)
    if (!pick) return { tmdbIds: [], total: 0 }
    if (pick.rule === 'smart')
      return deps.smart?.playable(pick.collectionId, limit) ?? { tmdbIds: [], total: 0 }
    return library.pick(pick, limit)
  }

  function homeItems(tmdbIds: number[], overrides: FeaturedOverride[], userId: string): HomeItem[] {
    const by = new Map(overrides.map((o) => [o.itemId, o]))
    return library.items(tmdbIds, userId).map((m) => {
      const o = by.get(m.id)
      return {
        ...m,
        art: o?.artwork ? { ...m.art, backdrop: o.artwork } : m.art,
        tagline: o?.tagline ?? null,
      }
    })
  }

  // ------------------------------------------------------------ resolution

  const visibleSections = (all: Section[], v: Viewer, client: ClientType, now: number) =>
    all
      .filter((s) => statusOf(s, now) === 'live' && reaches(s.audience, v, client))
      .sort((a, b) => a.order - b.order)

  /**
   * A person's home screen on one kind of app (client-home.md): the live featured sections in
   * their audience, the first hero on top and later ones as rows, Continue watching right after
   * the hero, then the built-in rows; then their own order and hidden rows. Empty rows are left out.
   */
  function homeFor(v: Viewer, client: ClientType, all: Section[], now: number): HomeSection[] {
    let hero = false
    const featured = visibleSections(all, v, client, now).flatMap((s): HomeSection[] => {
      const items = homeItems(picks(s.source).tmdbIds, s.overrides, v.id)
      if (!items.length) return []
      const layout = s.layout === 'hero' && !hero ? 'hero' : s.layout === 'hero' ? 'row' : s.layout
      if (layout === 'hero') hero = true
      return [{ id: s.id, title: s.title, suffix: s.tagline, layout, items }]
    })
    const builtIn = library
      .builtIn(v.id)
      .filter((r) => r.items.length > 0)
      .map(
        (r): HomeSection => ({
          id: r.id,
          title: r.title,
          suffix: null,
          layout: r.id === 'continue' ? 'continue' : 'row',
          items: r.items.map((m) => ({ ...m, tagline: null })),
        }),
      )
    // the first hero in the order fills the top, wherever it sits among the rows
    const top = featured.find((s) => s.layout === 'hero') ?? null
    const rows = [
      ...builtIn.filter((r) => r.id === 'continue'),
      ...featured.filter((s) => s !== top),
      ...builtIn.filter((r) => r.id !== 'continue'),
    ]
    // the person's own order and hidden rows (client-settings.md › Home screen); the hero stays
    const own = deps.arrangement(v.id)
    const shown = rows.filter((r) => !own.hidden.includes(r.id))
    const pos = (r: HomeSection, i: number) => {
      const j = own.order.indexOf(r.id)
      return j < 0 ? own.order.length + i : j
    }
    const ordered = shown
      .map((r, i) => ({ r, p: pos(r, i) }))
      .sort((a, b) => a.p - b.p)
      .map((x) => x.r)
    return top ? [top, ...ordered] : ordered
  }

  const seenBy = (userId: string) =>
    new Set(
      db
        .select({ id: announcementSeen.announcementId })
        .from(announcementSeen)
        .where(eq(announcementSeen.userId, userId))
        .all()
        .map((r) => r.id),
    )

  /** The live announcements for a person on one kind of app, newest first. */
  function announcementsFor(
    v: Viewer,
    client: ClientType,
    all: Live[],
    now: number,
    seen = seenBy(v.id),
  ): ClientAnnouncement[] {
    return all
      .filter((a) => statusOf(a, now) === 'live' && reaches(a.audience, v, client))
      .sort((a, b) => b.startAt - a.startAt || b.updatedAt - a.updatedAt)
      .map(({ status: _, startAt: _s, endAt: _e, updatedAt: _u, ...a }) => ({
        ...a,
        seen: seen.has(a.id),
      }))
  }

  // ------------------------------------------------------------ what changed, for whom

  /** What each person gets, as a fingerprint per topic, to send events only when it changes. */
  let last: Map<string, { announcements: string; home: string }> | null = null
  const none = CLIENTS.map(() => '').join('|')
  const NOTHING = { announcements: none, home: none }
  let lastStatuses = ''

  function fingerprints(now: number) {
    const anns = allAnnouncements(now)
    const secs = allSections()
    // a section drawing on one of the server's collections changes when any collection does
    const smart = deps.smart?.version() ?? 0
    const drawsOnSmart = (s: Section) =>
      s.source.kind === 'rule' && s.source.rule === 'collection' && s.source.value.startsWith('sc-')
    const out = new Map<string, { announcements: string; home: string }>()
    for (const v of people()) {
      const a: string[] = []
      const h: string[] = []
      for (const client of CLIENTS) {
        a.push(
          anns
            .filter((x) => x.status === 'live' && reaches(x.audience, v, client))
            .map((x) => `${x.id}@${x.updatedAt}`)
            .join(','),
        )
        h.push(
          visibleSections(secs, v, client, now)
            .map((s) => `${s.id}@${s.updatedAt}#${s.order}${drawsOnSmart(s) ? `~${smart}` : ''}`)
            .join(','),
        )
      }
      out.set(v.id, { announcements: a.join('|'), home: h.join('|') })
    }
    const statuses = [
      ...anns.map((a) => `${a.id}:${a.status}`),
      ...secs.map((s) => `${s.id}:${statusOf(s, now)}`),
    ].join(',')
    return { out, statuses }
  }

  /** Sends each person the topics whose result changed for them, and the admin's lists' topic. */
  function refresh({ changed = false }: { changed?: boolean } = {}) {
    const now = clock.now()
    const { out, statuses } = fingerprints(now)
    if (last) {
      const ann: string[] = []
      const home: string[] = []
      for (const [id, f] of out) {
        // someone who joined since gets nothing new unless something reaches them
        const before = last.get(id) ?? NOTHING
        if (before.announcements !== f.announcements) ann.push(id)
        if (before.home !== f.home) home.push(id)
      }
      if (ann.length) events.emit({ topic: ANNOUNCEMENTS_TOPIC, to: ann })
      if (home.length) events.emit({ topic: HOME_TOPIC, to: home })
    }
    if (changed || (last && statuses !== lastStatuses)) events.emit({ topic: CURATION_TOPIC })
    last = out
    lastStatuses = statuses
    scheduleNext(now)
  }

  /** A run of `curation.schedule` at the next start or end still to come. */
  function scheduleNext(now: number) {
    const times = [
      ...db.select({ s: announcements.startAt, e: announcements.endAt }).from(announcements).all(),
      ...db
        .select({ s: featuredSections.startAt, e: featuredSections.endAt })
        .from(featuredSections)
        .all(),
    ].flatMap((t) => [t.s, t.e ?? Number.POSITIVE_INFINITY].filter((x) => x > now))
    const next = Math.min(...times)
    if (Number.isFinite(next))
      jobs.enqueue(CURATION_JOB, {}, { runAt: next, dedupeKey: `at:${next}` })
  }

  // ------------------------------------------------------------ checking input

  function checkAudience(a: Audience) {
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
  }

  function checkSchedule(s: { start: string; end: string | null }) {
    if (s.end !== null && ms(s.end) <= ms(s.start))
      throw invalid('The end has to come after the start.', 'schedule.end')
  }

  /** Placements as stored: a required acknowledgement is always a dialog, and only then. */
  function placementsOf(input: AnnouncementInput): AnnouncementInput['placements'] {
    const rest = [...new Set(input.placements.filter((p) => p !== 'modal'))]
    return input.acknowledgement === 'require' ? [...rest, 'modal'] : rest
  }

  function checkAnnouncement(input: AnnouncementInput) {
    if (!input.title.trim())
      throw invalid('Give it a title. It’s the first thing people read.', 'title', 'required')
    if (input.draft) return
    if (!placementsOf(input).length)
      throw invalid('Choose at least one place to show it.', 'placements', 'required')
    if (input.cta && (!input.cta.label.trim() || !/^https:\/\/\S+$/.test(input.cta.url)))
      throw invalid('The button needs a label and a full link, starting with https://.', 'cta')
    checkAudience(input.audience)
    checkSchedule(input.schedule)
  }

  function checkSection(input: FeaturedSectionInput) {
    if (!input.title.trim())
      throw invalid('Give the section a title. It shows above its titles.', 'title', 'required')
    const s = input.source
    if (s.kind === 'manual') {
      if (!s.itemIds.length) throw invalid('Add at least one title.', 'source', 'required')
      const here = library.itemIds(s.itemIds)
      if (s.itemIds.some((id) => !here.has(id)))
        throw invalid('One of the titles isn’t in the library.', 'source', 'unknown')
    } else {
      const pick = rulePick(s)
      if (!pick || (pick.rule === 'smart' && !deps.smart?.exists(pick.collectionId)))
        throw invalid(RULE_ERRORS[s.rule], 'source.value')
    }
    checkAudience(input.audience)
    checkSchedule(input.schedule)
  }

  // ------------------------------------------------------------ writing

  function announcementValues(input: AnnouncementInput, now: number) {
    return {
      title: input.title.trim(),
      body: input.body,
      image: input.image,
      cta: input.cta,
      severity: input.severity,
      placements: placementsOf(input),
      audience: input.audience,
      startAt: ms(input.schedule.start),
      endAt: input.schedule.end === null ? null : ms(input.schedule.end),
      acknowledgement: input.acknowledgement,
      draft: input.draft,
      updatedAt: now,
    }
  }

  function writeOverrides(sectionId: string, overrides: FeaturedOverride[]) {
    db.delete(featuredOverrides).where(eq(featuredOverrides.sectionId, sectionId)).run()
    const kept = overrides.filter((o) => o.artwork || o.tagline?.trim())
    const items = library.itemIds(kept.map((o) => o.itemId))
    const rows = kept.flatMap((o) => {
      const itemId = items.get(o.itemId)
      return itemId
        ? [{ sectionId, itemId, artwork: o.artwork, tagline: o.tagline?.trim() || null }]
        : []
    })
    if (rows.length) db.insert(featuredOverrides).values(rows).onConflictDoNothing().run()
  }

  function sectionValues(input: FeaturedSectionInput, now: number) {
    const s = input.source
    const source =
      s.kind === 'manual'
        ? (() => {
            const items = library.itemIds(s.itemIds)
            return {
              kind: 'manual' as const,
              itemIds: s.itemIds.flatMap((id) => items.get(id) ?? []),
            }
          })()
        : { kind: 'rule' as const, rule: s.rule, value: s.value.trim() }
    return {
      title: input.title.trim(),
      tagline: input.tagline?.trim() || null,
      layout: input.layout,
      source,
      audience: input.audience,
      startAt: ms(input.schedule.start),
      endAt: input.schedule.end === null ? null : ms(input.schedule.end),
      updatedAt: now,
    }
  }

  const requireAnnouncement = (id: string) => {
    const row = db.select().from(announcements).where(eq(announcements.id, id)).get()
    if (!row) throw new AppError('not-found', 'There’s no announcement with that id.')
    return row
  }

  const requireSection = (id: string) => {
    const row = db.select().from(featuredSections).where(eq(featuredSections.id, id)).get()
    if (!row) throw new AppError('not-found', 'There’s no featured section with that id.')
    return row
  }

  /** Writes, then tells whoever's result changed. */
  function change<T>(write: () => T): T {
    const result = db.transaction(() => write())
    try {
      refresh({ changed: true })
    } catch (e) {
      log.warn('couldn’t compare what changed', { error: (e as Error).message })
    }
    return result
  }

  const ORDER = ['live', 'scheduled', 'draft', 'ended'] as const

  function section(id: string): FeaturedSection {
    const [s] = sectionsOf([requireSection(id)])
    const { startAt: _s, endAt: _e, updatedAt: _u, ...out } = s as Section
    return out
  }

  const reach = {
    /** How many of an announcement's audience saw it (acknowledged it, when that's required). */
    of(a: Live, people: Viewer[]) {
      const audience = people.filter((v) => mayReach(a.audience, v))
      if (!audience.length) return { seenBy: 0, audienceSize: 0 }
      const seen = db
        .select({ userId: announcementSeen.userId })
        .from(announcementSeen)
        .where(
          and(
            eq(announcementSeen.announcementId, a.id),
            a.acknowledgement === 'require'
              ? isNotNull(announcementSeen.acknowledgedAt)
              : undefined,
          ),
        )
        .all()
      const ids = new Set(seen.map((s) => s.userId))
      return {
        seenBy: audience.filter((v) => ids.has(v.id)).length,
        audienceSize: audience.length,
      }
    },
  }

  return {
    // ---------------------------------------------------------- announcements, for the admin

    announcements(): AnnouncementSummary[] {
      const everyone = people()
      return allAnnouncements()
        .sort(
          (a, b) =>
            ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
            b.startAt - a.startAt ||
            b.updatedAt - a.updatedAt,
        )
        .map((a) => ({ ...strip(a), ...reach.of(a, everyone) }))
    },

    announcement: (id: string): Announcement => strip(announcementOf(requireAnnouncement(id))),

    addAnnouncement(input: AnnouncementInput, createdBy: string | null): Announcement {
      checkAnnouncement(input)
      const now = clock.now()
      const id = newId('ann')
      change(() =>
        db
          .insert(announcements)
          .values({ id, ...announcementValues(input, now), createdBy, createdAt: now })
          .run(),
      )
      return strip(announcementOf(requireAnnouncement(id)))
    },

    saveAnnouncement(id: string, input: AnnouncementInput): Announcement {
      requireAnnouncement(id)
      checkAnnouncement(input)
      change(() =>
        db
          .update(announcements)
          .set(announcementValues(input, clock.now()))
          .where(eq(announcements.id, id))
          .run(),
      )
      return strip(announcementOf(requireAnnouncement(id)))
    },

    /** Off every screen now, kept with its reach as ended. One that already ended stays as it is. */
    endAnnouncement(id: string) {
      const row = requireAnnouncement(id)
      const now = clock.now()
      const status = statusOf(row, now)
      if (status === 'ended') return
      change(() =>
        db
          .update(announcements)
          .set({
            endAt: now,
            // a scheduled one ends before it starts: it starts now, so the end comes after it
            startAt: Math.min(row.startAt, now),
            draft: false,
            updatedAt: now,
          })
          .where(eq(announcements.id, id))
          .run(),
      )
    },

    removeAnnouncement(id: string) {
      requireAnnouncement(id)
      change(() => db.delete(announcements).where(eq(announcements.id, id)).run())
    },

    // ---------------------------------------------------------- sections, for the admin

    sections(): SectionSummary[] {
      const now = clock.now()
      return allSections().map(({ startAt, endAt, updatedAt: _, ...s }) => {
        const { tmdbIds, total } = picks(s.source, SAMPLE)
        const status = statusOf({ startAt, endAt }, now) as SectionSummary['status']
        return {
          ...s,
          status,
          itemCount: total,
          sample: library
            .items(tmdbIds, '')
            .map((m) => ({ id: m.id, title: m.title, poster: m.art.poster })),
        }
      })
    },

    section,

    addSection(input: FeaturedSectionInput): FeaturedSection {
      checkSection(input)
      const now = clock.now()
      const id = newId('sec')
      change(() => {
        const last = db
          .select({ position: featuredSections.position })
          .from(featuredSections)
          .orderBy(asc(featuredSections.position))
          .all()
          .at(-1)
        db.insert(featuredSections)
          .values({
            id,
            ...sectionValues(input, now),
            position: (last?.position ?? -1) + 1,
            createdAt: now,
          })
          .run()
        writeOverrides(id, input.overrides)
      })
      return section(id)
    },

    saveSection(id: string, input: FeaturedSectionInput): FeaturedSection {
      requireSection(id)
      checkSection(input)
      change(() => {
        db.update(featuredSections)
          .set(sectionValues(input, clock.now()))
          .where(eq(featuredSections.id, id))
          .run()
        writeOverrides(id, input.overrides)
      })
      return section(id)
    },

    removeSection(id: string) {
      requireSection(id)
      change(() => {
        db.delete(featuredSections).where(eq(featuredSections.id, id)).run()
        // close the gap, so the order stays 0, 1, 2…
        const rows = db
          .select({ id: featuredSections.id })
          .from(featuredSections)
          .orderBy(asc(featuredSections.position))
          .all()
        for (const [position, r] of rows.entries())
          db.update(featuredSections).set({ position }).where(eq(featuredSections.id, r.id)).run()
      })
    },

    /** Puts the sections in this order; any left out keep their place after the ones named. */
    orderSections(ids: string[]) {
      change(() => {
        const rows = db
          .select({ id: featuredSections.id, position: featuredSections.position })
          .from(featuredSections)
          .orderBy(asc(featuredSections.position))
          .all()
        const rank = (id: string) => {
          const i = ids.indexOf(id)
          return i < 0 ? ids.length + 1 : i
        }
        const now = clock.now()
        ;[...rows]
          .sort((a, b) => rank(a.id) - rank(b.id) || a.position - b.position)
          .forEach((r, position) => {
            if (r.position !== position)
              db.update(featuredSections)
                .set({ position, updatedAt: now })
                .where(eq(featuredSections.id, r.id))
                .run()
          })
      })
    },

    /** The titles a source picks now, for the composer. */
    resolve(source: FeaturedSource, userId: string): { items: HomeItem[]; total: number } {
      if (source.kind === 'rule' && !rulePick(source))
        throw invalid(RULE_ERRORS[source.rule], 'source.value')
      const { tmdbIds, total } = picks(source, 100)
      return { items: homeItems(tmdbIds, [], userId), total }
    },

    ruleOptions: (): RuleOptions => ({
      ...library.ruleOptions(),
      smart: deps.smart?.names() ?? [],
    }),

    // ---------------------------------------------------------- the apps

    home(userId: string, client: ClientType): HomeSection[] {
      return homeFor(viewer(userId), client, allSections(), clock.now())
    },

    activeAnnouncements(userId: string, client: ClientType): ClientAnnouncement[] {
      return announcementsFor(viewer(userId), client, allAnnouncements(), clock.now())
    },

    /** Dismissed or acknowledged: once per person, so a second time changes nothing. */
    seen(id: string, userId: string) {
      const row = requireAnnouncement(id)
      const now = clock.now()
      const acknowledgedAt = row.acknowledgement === 'require' ? now : null
      const before = db
        .select({ at: announcementSeen.seenAt })
        .from(announcementSeen)
        .where(and(eq(announcementSeen.announcementId, id), eq(announcementSeen.userId, userId)))
        .get()
      if (before) return
      db.insert(announcementSeen)
        .values({ announcementId: id, userId, seenAt: now, acknowledgedAt })
        .onConflictDoNothing()
        .run()
      events.emit({ topic: ANNOUNCEMENTS_TOPIC, ids: [id], to: [userId] })
      events.emit({ topic: CURATION_TOPIC, ids: [id] })
    },

    /**
     * The rows someone can arrange (`/me/home`): the live featured sections for them, less the
     * first hero, which stays on top. A later hero shows as a row, so it can be moved.
     */
    rows(userId: string): { id: string; title: string }[] {
      const v = db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .get()
      if (!v) return []
      const now = clock.now()
      const live = allSections()
        .filter(
          (s) => statusOf(s, now) === 'live' && CLIENTS.some((c) => reaches(s.audience, v, c)),
        )
        .sort((a, b) => a.order - b.order)
      const hero = live.find((s) => s.layout === 'hero')
      return live.filter((s) => s !== hero).map((s) => ({ id: s.id, title: s.title }))
    },

    // ---------------------------------------------------------- the preview

    /**
     * The home screen with a draft in it, as one person gets it on one kind of app (curation.md ›
     * The live preview). The draft shows as live whatever its schedule; an announcement's preview
     * shows it alone, a section's shows no announcements. Nothing is written.
     */
    preview(input: CurationPreviewInput): CurationPreview {
      const v = viewer(input.userId)
      const now = clock.now()
      const live = { start: iso(0), end: null }
      const d = input.draft
      if (d.kind === 'announcement') {
        const a = d.announcement
        const draft: Live = {
          id: d.id ?? 'draft',
          title: a.title,
          body: a.body,
          image: a.image,
          cta: a.cta,
          severity: a.severity,
          placements: placementsOf(a),
          audience: a.audience,
          schedule: live,
          acknowledgement: a.acknowledgement,
          status: 'live',
          startAt: 0,
          endAt: null,
          updatedAt: now,
        }
        return {
          sections: homeFor(v, input.client, allSections(), now),
          announcements: announcementsFor(v, input.client, [draft], now, new Set()),
          reaches: reaches(a.audience, v, input.client),
        }
      }
      const saved = allSections()
      const id = d.id ?? 'draft'
      const s = d.section
      const draft: Section = {
        id,
        ...s,
        schedule: live,
        order: saved.find((x) => x.id === id)?.order ?? saved.length,
        startAt: 0,
        endAt: null,
        updatedAt: now,
      }
      if (s.source.kind === 'rule' && !rulePick(s.source))
        draft.source = { kind: 'manual', itemIds: [] }
      return {
        sections: homeFor(v, input.client, [...saved.filter((x) => x.id !== id), draft], now),
        announcements: [],
        reaches: reaches(s.audience, v, input.client),
      }
    },

    // ---------------------------------------------------------- jobs

    defineJobs() {
      jobs.define({
        type: CURATION_JOB,
        payload: z.object({}),
        async run() {
          refresh()
        },
      })
    },

    /** The hourly safety net, and a run at the next start or end. Compares from here on. */
    schedule(now: number) {
      jobs.schedule(CURATION_JOB, CURATION_EVERY_MS, { firstRunAt: now + CURATION_EVERY_MS })
      const { out, statuses } = fingerprints(now)
      last = out
      lastStatuses = statuses
      scheduleNext(now)
    },

    /** Compares now: after people or roles change, say. */
    refresh: () => refresh(),
  }
}

export type Curation = ReturnType<typeof createCuration>
