// SPDX-License-Identifier: AGPL-3.0-only
// The admin's curation routes (one-client-platform-d.md › D2), answered from the mock's api:
// Settings' announcements and featured sections, the composer's resolve and rule options, and the
// live preview. The mock keeps its titles by its own ids and TMDB's collections by slug; the
// contract addresses both by TMDB's number (films.ts's `tmdbId` and `tmdbNumber`), so they're
// turned over each way here. Shows in a seeded manual section aren't the server's (it has films
// only), so they're left out of what goes back and dropped when the section is saved. The checks
// are packages/curation's own, in its words, before the mock's writes run.
import {
  type AnnouncementInput,
  type Announcement as ApiAnnouncement,
  type Audience as ApiAudience,
  type FeaturedSection as ApiSection,
  type ClientAnnouncement,
  CURATION_TOPICS,
  type FeaturedSectionInput,
  type FeaturedSource,
  type HomeItem,
} from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { iso } from '../clock.ts'
import { filmsOf, tmdbNumber } from '../films.ts'
import { collectionRefs } from '../metadata.ts'
import type { MockServer } from '../server.ts'
import type { Announcement, ClientType, FeaturedSection, User } from '../types.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

export const curationMessages = defineMessages({
  // packages/curation's service, word for word
  'curation.announcementUnknown': 'There’s no announcement with that id.',
  'curation.sectionUnknown': 'There’s no featured section with that id.',
  'curation.personUnknown': 'There’s no such person.',
  'curation.roles': 'Choose at least one role.',
  'curation.clients': 'Choose at least one kind of app.',
  'curation.people': 'Choose at least one person.',
  'curation.personNotHere': 'One of the people chosen isn’t on this server.',
  'curation.endBeforeStart': 'The end has to come after the start.',
  'curation.announcementTitle': 'Give it a title. It’s the first thing people read.',
  'curation.placements': 'Choose at least one place to show it.',
  'curation.cta': 'The button needs a label and a full link, starting with https://.',
  'curation.sectionTitle': 'Give the section a title. It shows above its titles.',
  'curation.noTitles': 'Add at least one title.',
  'curation.titleNotHere': 'One of the titles isn’t in the library.',
  // its RULE_ERRORS
  'curation.rule.recently-added': 'Choose 7, 30 or 90 days.',
  'curation.rule.genre': 'Choose a genre.',
  'curation.rule.collection': 'Choose a collection.',
})

const t = createT(curationMessages)

const invalid = (message: string, field: string, reason = 'invalid') =>
  refuse('invalid', message, { field, reason })

/** Recently added's windows (packages/curation's RECENT_WINDOWS). */
const RECENT_WINDOWS = new Set(['7d', '30d', '90d'])
const ORDER = ['live', 'scheduled', 'draft', 'ended'] as const
/** The composer's list: at most 100 (the contract's `resolve`). */
const RESOLVE_MAX = 100
/** The list's art strip (packages/curation's SAMPLE). */
const SAMPLE = 6

const random = () => Math.random().toString(36).slice(2, 10)

/** packages/curation's `rulePick`: does a rule's value make sense? */
function ruleMakesSense(source: Extract<FeaturedSource, { kind: 'rule' }>) {
  const value = source.value.trim()
  switch (source.rule) {
    case 'recently-added':
      return RECENT_WINDOWS.has(value)
    case 'genre':
      return value.length > 0
    case 'collection': {
      if (value.startsWith('sc-')) return true
      const id = Number(value)
      return Number.isInteger(id) && id > 0
    }
  }
}

/** packages/curation's `reaches`: is this person on this app in the audience? */
function reaches(audience: ApiAudience, u: User, client: ClientType) {
  switch (audience.kind) {
    case 'everyone':
      return true
    case 'roles':
      return audience.roles.includes(u.role)
    case 'users':
      return audience.userIds.includes(u.id)
    case 'clients':
      return audience.clients.includes(client)
  }
}

export function curationAnswers(kit: AdminKit): Answers {
  const { wall, emit } = kit
  /** A wall-clock time on the mock's clock: `wall`'s offset taken back off. */
  const unwall = (date: string) => iso(Date.parse(date) - Date.parse(kit.wallMs(0)))
  const unwallSchedule = (s: { start: string; end: string | null }) => ({
    start: unwall(s.start),
    end: s.end === null ? null : unwall(s.end),
  })
  const wallSchedule = (s: { start: string; end: string | null }) => ({
    start: wall(s.start),
    end: s.end === null ? null : wall(s.end),
  })

  // ------------------------------------------------------------ ids each way

  const films = (srv: MockServer) => srv.state.items.filter((m) => m.type === 'movie')
  const tmdbOf = (srv: MockServer, id: string) => films(srv).find((m) => m.id === id)?.tmdbId
  const mockOf = (srv: MockServer, tmdb: number) => films(srv).find((m) => m.tmdbId === tmdb)?.id
  const slugOf = (n: number) => collectionRefs().find((c) => tmdbNumber(c.id) === n)?.id

  /** A source as the contract has it: films by TMDB number, TMDB's collections by number. */
  const sourceOut = (srv: MockServer, s: FeaturedSection['source']): FeaturedSource =>
    s.kind === 'manual'
      ? { kind: 'manual', itemIds: s.itemIds.flatMap((id) => tmdbOf(srv, id) ?? []) }
      : s.rule === 'collection' && !s.value.startsWith('sc-')
        ? { ...s, value: String(tmdbNumber(s.value)) }
        : s
  /** And back: a number the library doesn't know is refused, as the server's check does. */
  const sourceIn = (
    srv: MockServer,
    s: FeaturedSource,
    check = true,
  ): FeaturedSection['source'] => {
    if (s.kind === 'manual') {
      const ids = s.itemIds.map((n) => mockOf(srv, n))
      if (check && ids.some((id) => id === undefined))
        throw invalid(t('curation.titleNotHere'), 'source', 'unknown')
      return { kind: 'manual', itemIds: ids.flatMap((id) => id ?? []) }
    }
    const value = s.value.trim()
    if (s.rule === 'collection' && !value.startsWith('sc-'))
      // a TMDB collection the mock has no slug for picks nothing, as the server's would
      return { ...s, value: slugOf(Number(value)) ?? value }
    return { ...s, value }
  }

  const sectionOut = (srv: MockServer, f: FeaturedSection): ApiSection => ({
    id: f.id,
    title: f.title,
    tagline: f.tagline,
    layout: f.layout,
    source: sourceOut(srv, f.source),
    overrides: f.overrides.flatMap((o) => {
      const itemId = tmdbOf(srv, o.itemId)
      return itemId === undefined ? [] : [{ itemId, artwork: o.artwork, tagline: o.tagline }]
    }),
    audience: f.audience,
    schedule: wallSchedule(f.schedule),
    order: f.order,
  })
  const sectionIn = (
    srv: MockServer,
    id: string,
    input: FeaturedSectionInput,
    order: number,
  ): FeaturedSection => ({
    id,
    title: input.title.trim(),
    tagline: input.tagline?.trim() || null,
    layout: input.layout,
    source: sourceIn(srv, input.source),
    overrides: input.overrides.flatMap((o) => {
      const itemId = mockOf(srv, o.itemId)
      return itemId === undefined ? [] : [{ itemId, artwork: o.artwork, tagline: o.tagline }]
    }),
    audience: input.audience,
    schedule: unwallSchedule(input.schedule),
    order,
  })

  const announcementOut = (
    a: Announcement,
    status: ApiAnnouncement['status'],
  ): ApiAnnouncement => ({
    id: a.id,
    title: a.title,
    body: a.body,
    image: a.image,
    cta: a.cta,
    severity: a.severity,
    placements: a.placements,
    audience: a.audience,
    schedule: wallSchedule(a.schedule),
    acknowledgement: a.acknowledgement,
    status,
  })

  // ------------------------------------------------------------ the server's checks

  function checkAudience(srv: MockServer, a: ApiAudience) {
    if (a.kind === 'roles' && !a.roles.length)
      throw invalid(t('curation.roles'), 'audience', 'required')
    if (a.kind === 'clients' && !a.clients.length)
      throw invalid(t('curation.clients'), 'audience', 'required')
    if (a.kind === 'users') {
      if (!a.userIds.length) throw invalid(t('curation.people'), 'audience', 'required')
      const known = new Set(srv.state.users.map((u) => u.id))
      if (a.userIds.some((id) => !known.has(id)))
        throw invalid(t('curation.personNotHere'), 'audience', 'unknown')
    }
  }
  function checkSchedule(s: { start: string; end: string | null }) {
    if (s.end !== null && Date.parse(s.end) <= Date.parse(s.start))
      throw invalid(t('curation.endBeforeStart'), 'schedule.end')
  }
  /** Placements as stored: a required acknowledgement is always a dialog, and only then. */
  const placementsOf = (input: AnnouncementInput): AnnouncementInput['placements'] => {
    const rest = [...new Set(input.placements.filter((p) => p !== 'modal'))]
    return input.acknowledgement === 'require' ? [...rest, 'modal'] : rest
  }
  function checkAnnouncement(srv: MockServer, input: AnnouncementInput) {
    if (!input.title.trim()) throw invalid(t('curation.announcementTitle'), 'title', 'required')
    if (input.draft) return
    if (!placementsOf(input).length)
      throw invalid(t('curation.placements'), 'placements', 'required')
    if (input.cta && (!input.cta.label.trim() || !/^https:\/\/\S+$/.test(input.cta.url)))
      throw invalid(t('curation.cta'), 'cta')
    checkAudience(srv, input.audience)
    checkSchedule(input.schedule)
  }
  function checkRule(source: FeaturedSource) {
    if (source.kind === 'rule' && !ruleMakesSense(source))
      throw invalid(t(`curation.rule.${source.rule}`), 'source.value')
  }
  function checkSection(srv: MockServer, input: FeaturedSectionInput) {
    if (!input.title.trim()) throw invalid(t('curation.sectionTitle'), 'title', 'required')
    const s = input.source
    if (s.kind === 'manual') {
      if (!s.itemIds.length) throw invalid(t('curation.noTitles'), 'source', 'required')
      sourceIn(srv, s)
    } else {
      checkRule(s)
      if (
        s.value.trim().startsWith('sc-') &&
        !srv.state.collections.some((c) => c.id === s.value.trim())
      )
        throw invalid(t('curation.rule.collection'), 'source.value')
    }
    checkAudience(srv, input.audience)
    checkSchedule(input.schedule)
  }

  // ------------------------------------------------------------ reading

  const announcementAt = (ctx: Ctx, id: string) => {
    const a = ctx.srv.state.announcements.find((x) => x.id === id)
    if (!a) throw refuse('not-found', t('curation.announcementUnknown'))
    return a
  }
  const sectionAt = (ctx: Ctx, id: string) => {
    const f = ctx.srv.state.featured.find((x) => x.id === id)
    if (!f) throw refuse('not-found', t('curation.sectionUnknown'))
    return f
  }

  /**
   * Home as `userId` would get it with these featured sections, from films.ts's own `home`, on a
   * copy of the server that differs only in them: so the composer, the list and the preview pick
   * titles exactly as Home does (films with a file, the overrides' art and lines).
   */
  const homeWith = (ctx: Ctx, featured: FeaturedSection[], userId: string, client: ClientType) => {
    const srv: MockServer = { ...ctx.srv, state: { ...ctx.srv.state, featured } }
    return filmsOf({ srv, api: ctx.api, userId }).home(client)
  }
  /** What one source picks now, for this person. */
  const picksOf = (ctx: Ctx, source: FeaturedSection['source']): HomeItem[] => {
    const id = `resolve-${random()}`
    const probe: FeaturedSection = {
      id,
      title: id,
      tagline: null,
      layout: 'row',
      source,
      overrides: [],
      audience: { kind: 'everyone' },
      schedule: { start: iso(0), end: null },
      order: 0,
    }
    return homeWith(ctx, [probe], ctx.userId, 'web').find((s) => s.id === id)?.items ?? []
  }

  return {
    curation: {
      // ---------------------------------------------------------- announcements

      // live first, then scheduled, drafts and ended; newest start first within each
      announcements: (_, ctx) => {
        const summaries = ctx.api.curation.announcements()
        return summaries
          .sort(
            (a, b) =>
              ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
              Date.parse(b.schedule.start) - Date.parse(a.schedule.start),
          )
          .map((a) => ({
            ...announcementOut(a, a.status),
            seenBy: a.seenBy,
            audienceSize: a.audienceSize,
          }))
      },

      announcement: ({ params }, ctx) => {
        announcementAt(ctx, params.id)
        const a = ctx.api.curation.announcement(params.id)
        return announcementOut(a, a.status)
      },

      addAnnouncement: ({ body }, ctx) => {
        checkAnnouncement(ctx.srv, body)
        const saved = save(ctx, `ann-${random()}`, body)
        return saved
      },

      saveAnnouncement: ({ params, body }, ctx) => {
        announcementAt(ctx, params.id)
        checkAnnouncement(ctx.srv, body)
        return save(ctx, params.id, body)
      },

      // off every screen now; one that already ended stays as it is, and a scheduled one starts
      // now so its end comes after its start (packages/curation's `endAnnouncement`)
      endAnnouncement: ({ params }, ctx) => {
        const a = announcementAt(ctx, params.id)
        const now = ctx.srv.clock.now()
        const status = ctx.api.curation.announcement(params.id).status
        if (status === 'ended') return undefined
        if (Date.parse(a.schedule.start) > now) a.schedule = { ...a.schedule, start: iso(now) }
        ctx.api.curation.endAnnouncement(params.id)
        emit(CURATION_TOPICS.curation)
        return undefined
      },

      removeAnnouncement: ({ params }, ctx) => {
        announcementAt(ctx, params.id)
        ctx.api.curation.deleteAnnouncement(params.id)
        // the record of who saw it goes with it
        for (const [u, ids] of Object.entries(ctx.srv.state.seen))
          ctx.srv.state.seen[u] = ids.filter((id) => id !== params.id)
        emit(CURATION_TOPICS.curation)
        return undefined
      },

      // ---------------------------------------------------------- sections

      sections: (_, ctx) =>
        ctx.api.curation.sections().map((s) => {
          const items = picksOf(ctx, s.source)
          return {
            ...sectionOut(ctx.srv, s),
            status: s.status,
            itemCount: items.length,
            sample: items
              .slice(0, SAMPLE)
              .map((m) => ({ id: m.id, title: m.title, poster: m.art.poster })),
          }
        }),

      section: ({ params }, ctx) => {
        sectionAt(ctx, params.id)
        return sectionOut(ctx.srv, ctx.api.curation.section(params.id))
      },

      addSection: ({ body }, ctx) => {
        checkSection(ctx.srv, body)
        const id = `sec-${random()}`
        const f = sectionIn(ctx.srv, id, body, ctx.srv.state.featured.length)
        ctx.api.curation.saveSection(f)
        emit(CURATION_TOPICS.curation)
        emit(CURATION_TOPICS.home)
        return sectionOut(ctx.srv, sectionAt(ctx, id))
      },

      saveSection: ({ params, body }, ctx) => {
        const before = sectionAt(ctx, params.id)
        checkSection(ctx.srv, body)
        ctx.api.curation.saveSection(sectionIn(ctx.srv, params.id, body, before.order))
        emit(CURATION_TOPICS.curation)
        emit(CURATION_TOPICS.home)
        return sectionOut(ctx.srv, sectionAt(ctx, params.id))
      },

      removeSection: ({ params }, ctx) => {
        sectionAt(ctx, params.id)
        ctx.api.curation.deleteSection(params.id)
        emit(CURATION_TOPICS.curation)
        emit(CURATION_TOPICS.home)
        return undefined
      },

      orderSections: ({ body }, ctx) => {
        ctx.api.curation.reorderSections(body.ids)
        emit(CURATION_TOPICS.curation)
        emit(CURATION_TOPICS.home)
        return undefined
      },

      // ---------------------------------------------------------- the composer

      resolve: ({ body }, ctx) => {
        checkRule(body.source)
        // staff only, as the mock's own resolve checks
        ctx.api.curation.ruleOptions()
        const items = picksOf(ctx, sourceIn(ctx.srv, body.source, false))
        return { items: items.slice(0, RESOLVE_MAX), total: items.length }
      },

      ruleOptions: (_, ctx) => {
        const o = ctx.api.curation.ruleOptions()
        return {
          genres: o.genres,
          collections: o.collections.map((c) => ({ id: tmdbNumber(c.id), name: c.name })),
          smart: o.smart,
        }
      },

      // the saved curation with one draft in it, for one person on one kind of app; the draft
      // shows as live whatever its schedule, and nothing is saved (packages/curation's `preview`)
      preview: ({ body }, ctx) => {
        // staff only
        ctx.api.curation.snapshot()
        const v = ctx.srv.state.users.find((u) => u.id === body.userId)
        if (!v) throw refuse('not-found', t('curation.personUnknown'))
        const client = body.client
        const live = { start: iso(0), end: null }
        const saved = ctx.srv.state.featured
        const d = body.draft
        if (d.kind === 'announcement') {
          const a = d.announcement
          const draft: ClientAnnouncement = {
            id: d.id ?? 'draft',
            title: a.title,
            body: a.body,
            image: a.image,
            cta: a.cta,
            severity: a.severity,
            placements: placementsOf(a),
            audience: a.audience,
            schedule: { start: new Date(0).toISOString(), end: null },
            acknowledgement: a.acknowledgement,
            seen: false,
          }
          const here = reaches(a.audience, v, client)
          return {
            sections: homeWith(ctx, saved, v.id, client),
            announcements: here ? [draft] : [],
            reaches: here,
          }
        }
        const s = d.section
        const id = d.id ?? 'draft'
        const source =
          s.source.kind === 'rule' && !ruleMakesSense(s.source)
            ? { kind: 'manual' as const, itemIds: [] }
            : sourceIn(ctx.srv, s.source, false)
        const draft: FeaturedSection = {
          ...sectionIn(ctx.srv, id, { ...s, source: { kind: 'manual', itemIds: [] } }, 0),
          title: s.title,
          source,
          schedule: live,
          order: saved.find((x) => x.id === id)?.order ?? saved.length,
        }
        return {
          sections: homeWith(ctx, [...saved.filter((x) => x.id !== id), draft], v.id, client),
          announcements: [],
          reaches: reaches(s.audience, v, client),
        }
      },
    },
  }

  /** Writes an announcement through the mock's api, as the server's add and save do. */
  function save(ctx: Ctx, id: string, input: AnnouncementInput): ApiAnnouncement {
    const a: Announcement = {
      id,
      title: input.title.trim(),
      body: input.body,
      image: input.image,
      cta: input.cta,
      severity: input.severity,
      placements: placementsOf(input),
      audience: input.audience,
      schedule: unwallSchedule(input.schedule),
      acknowledgement: input.acknowledgement,
      // the mock works the rest out from the schedule
      status: input.draft ? 'draft' : 'live',
      seen: false,
    }
    if (a.placements.length) ctx.api.curation.saveAnnouncement(a)
    else {
      // a draft may have nowhere to show yet, which the mock's own save refuses; the server keeps it
      ctx.api.curation.announcements()
      const i = ctx.srv.state.announcements.findIndex((x) => x.id === id)
      if (i >= 0) ctx.srv.state.announcements[i] = a
      else ctx.srv.state.announcements.unshift(a)
    }
    emit(CURATION_TOPICS.curation)
    emit(CURATION_TOPICS.announcements)
    const out = ctx.api.curation.announcement(id)
    return announcementOut(out, out.status)
  }
}
