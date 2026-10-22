// SPDX-License-Identifier: AGPL-3.0-only
// Curation (checkpoint 8c, ADR 0048) against a fake library: status from the schedule, audiences
// per person and app, reach, the home screen's order, the personal events, the preview that
// saves nothing, and the schedule job run twice.
import { describe, expect, test } from 'bun:test'
import type { AnnouncementInput, ClientItem, FeaturedSectionInput } from '@highsea/api-contract'
import {
  AppError,
  createEventBus,
  createFakeClock,
  type ServerEvent,
  silentLogger,
} from '@highsea/core'
import { migrate, openDatabase, schema } from '@highsea/db'
import { createJobQueue } from '@highsea/jobs'
import {
  type BuiltInRow,
  CURATION_JOB,
  type CurationLibrary,
  createCuration,
} from '../src/service/index.ts'
import { parseFilter, rulePick, statusOf } from '../src/service/rules.ts'

const HOUR = 3_600_000

/** A library of titles by TMDB id; those in `files` have a file. */
function fakeLibrary() {
  const titles = new Map<number, { item: string; genre: string; year: number }>([
    [10, { item: 'i-10', genre: 'Comedy', year: 1925 }],
    [20, { item: 'i-20', genre: 'Drama', year: 2001 }],
    [30, { item: 'i-30', genre: 'Comedy', year: 2010 }],
    [40, { item: 'i-40', genre: 'Drama', year: 2020 }],
  ])
  const files = new Set([10, 20, 30])
  const builtIn: BuiltInRow[] = []
  const item = (id: number): ClientItem => ({
    id,
    type: 'movie',
    title: `Movie ${id}`,
    year: titles.get(id)?.year ?? null,
    runtimeMinutes: 90,
    genres: [titles.get(id)?.genre ?? ''],
    synopsis: `About ${id}`,
    rating: 4,
    voteCount: 10,
    releaseDate: null,
    addedAt: new Date(0).toISOString(),
    status: 'available',
    playable: false,
    art: { poster: `/p/${id}`, backdrop: `/b/${id}` },
    progress: null,
    position: 0,
  })
  const library: CurationLibrary = {
    itemIds: (ids) =>
      new Map(ids.flatMap((id) => (titles.has(id) ? [[id, titles.get(id)?.item as string]] : []))),
    tmdbIds: (items) =>
      new Map([...titles].filter(([, t]) => items.includes(t.item)).map(([id, t]) => [t.item, id])),
    withFile: (ids) => new Set(ids.filter((id) => files.has(id))),
    pick(pick, limit) {
      const ids = [...titles]
        .filter(([id]) => files.has(id))
        .filter(([, t]) =>
          pick.rule === 'genre'
            ? t.genre === pick.genre
            : pick.rule === 'filter'
              ? pick.terms.every((term) => (term.op === '<' ? t.year < term.value : true))
              : pick.rule === 'recently-added',
        )
        .map(([id]) => id)
      return { tmdbIds: ids.slice(0, limit), total: ids.length }
    },
    items: (ids) => ids.map(item),
    builtIn: () => builtIn,
    ruleOptions: () => ({ genres: ['Comedy', 'Drama'], collections: [] }),
  }
  return { library, files, builtIn, item }
}

function setup() {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const sent: ServerEvent[] = []
  events.subscribe((e) => sent.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const fake = fakeLibrary()
  const arrangements = new Map<string, { order: string[]; hidden: string[] }>()
  const person = (id: string, role: 'owner' | 'admin' | 'user', invited = false) =>
    db
      .insert(schema.users)
      .values({
        id,
        username: id,
        displayName: id,
        role,
        invited,
        webauthnId: id,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      })
      .run()
  // the library's items, which overrides point at
  for (const [tmdbId, id] of fake.library.itemIds([10, 20, 30, 40]))
    db.insert(schema.mediaItems)
      .values({
        id,
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
  person('ines', 'owner')
  person('sam', 'admin')
  person('ruth', 'user')
  person('newcomer', 'user', true)
  const curation = createCuration({
    db,
    clock,
    events,
    jobs,
    logger: silentLogger,
    library: fake.library,
    arrangement: (id) => arrangements.get(id) ?? { order: [], hidden: [] },
  })
  curation.defineJobs()
  curation.schedule(clock.now())
  return { db, clock, jobs, curation, sent, fake, arrangements }
}

const at = (ms: number) => new Date(ms).toISOString()

function announcement(clock: { now(): number }, patch: Partial<AnnouncementInput> = {}) {
  return {
    title: 'Movie night',
    body: 'Friday at **8**.',
    image: null,
    cta: null,
    severity: 'notice',
    placements: ['banner'],
    audience: { kind: 'everyone' },
    schedule: { start: at(clock.now()), end: null },
    acknowledgement: 'dismiss',
    draft: false,
    ...patch,
  } satisfies AnnouncementInput
}

function section(clock: { now(): number }, patch: Partial<FeaturedSectionInput> = {}) {
  return {
    title: 'Staff picks',
    tagline: 'by Ines',
    layout: 'row',
    source: { kind: 'manual', itemIds: [20, 10] },
    overrides: [],
    audience: { kind: 'everyone' },
    schedule: { start: at(clock.now()), end: null },
    ...patch,
  } satisfies FeaturedSectionInput
}

const refused = (run: () => unknown) => {
  try {
    run()
  } catch (e) {
    expect(e).toBeInstanceOf(AppError)
    return (e as AppError).message
  }
  throw new Error('expected a refusal')
}

describe('rules', () => {
  test('status comes from the schedule; only a draft is stored', () => {
    expect(statusOf({ startAt: 0, endAt: null, draft: true }, 5)).toBe('draft')
    expect(statusOf({ startAt: 10, endAt: null }, 5)).toBe('scheduled')
    expect(statusOf({ startAt: 0, endAt: 5 }, 5)).toBe('ended')
    expect(statusOf({ startAt: 0, endAt: 6 }, 5)).toBe('live')
  })

  test('filters read as the library’s filter bar writes them', () => {
    expect(parseFilter('year < 1930 and rating >= 4')).toEqual([
      { field: 'year', op: '<', value: 1930 },
      { field: 'rating', op: '>=', value: 4 },
    ])
    expect(parseFilter('runtime < 90')).toBeNull()
    expect(rulePick({ kind: 'rule', rule: 'recently-added', value: '14d' })).toBeNull()
    expect(rulePick({ kind: 'rule', rule: 'collection', value: '87' })).toEqual({
      rule: 'collection',
      collectionId: 87,
    })
  })
})

describe('announcements', () => {
  test('one for a role shows only to that role, and its events go only to them', () => {
    const { curation, clock, sent } = setup()
    sent.length = 0
    const a = curation.addAnnouncement(
      announcement(clock, { audience: { kind: 'roles', roles: ['admin'] } }),
      'ines',
    )
    expect(a.status).toBe('live')
    expect(curation.activeAnnouncements('sam', 'web').map((x) => x.id)).toEqual([a.id])
    expect(curation.activeAnnouncements('ines', 'web')).toEqual([])
    expect(curation.activeAnnouncements('ruth', 'web')).toEqual([])
    const personal = sent.filter((e) => e.topic === 'announcements.updated')
    expect(personal.map((e) => e.to)).toEqual([['sam']])
    expect(sent.some((e) => e.topic === 'curation.updated')).toBe(true)
  })

  test('an app audience reaches people on those apps only', () => {
    const { curation, clock } = setup()
    curation.addAnnouncement(
      announcement(clock, { audience: { kind: 'clients', clients: ['tvos', 'androidtv'] } }),
      'ines',
    )
    expect(curation.activeAnnouncements('ruth', 'tvos')).toHaveLength(1)
    expect(curation.activeAnnouncements('ruth', 'web')).toHaveLength(0)
  })

  test('a draft needs only a title; publishing checks the rest', () => {
    const { curation, clock } = setup()
    const draft = curation.addAnnouncement(
      announcement(clock, {
        draft: true,
        placements: [],
        audience: { kind: 'users', userIds: [] },
      }),
      'ines',
    )
    expect(draft.status).toBe('draft')
    expect(curation.activeAnnouncements('ruth', 'web')).toEqual([])
    expect(
      refused(() => curation.saveAnnouncement(draft.id, announcement(clock, { placements: [] }))),
    ).toBe('Choose at least one place to show it.')
    expect(
      refused(() =>
        curation.addAnnouncement(
          announcement(clock, { cta: { label: 'Go', url: 'http://plain' } }),
          null,
        ),
      ),
    ).toBe('The button needs a label and a full link, starting with https://.')
    expect(
      refused(() =>
        curation.addAnnouncement(
          announcement(clock, { schedule: { start: at(clock.now()), end: at(clock.now()) } }),
          null,
        ),
      ),
    ).toBe('The end has to come after the start.')
  })

  test('a required acknowledgement is a dialog, and reach counts acknowledgements', () => {
    const { curation, clock } = setup()
    const a = curation.addAnnouncement(announcement(clock, { acknowledgement: 'require' }), 'ines')
    expect(a.placements).toEqual(['banner', 'modal'])
    curation.seen(a.id, 'ruth')
    curation.seen(a.id, 'ruth')
    const [summary] = curation.announcements()
    // the invite doesn't count until it's taken up
    expect(summary).toMatchObject({ seenBy: 1, audienceSize: 3 })
    expect(curation.activeAnnouncements('ruth', 'web')[0]?.seen).toBe(true)
    expect(curation.activeAnnouncements('sam', 'web')[0]?.seen).toBe(false)
  })

  test('ending one takes it off every screen and keeps its reach', () => {
    const { curation, clock } = setup()
    const later = curation.addAnnouncement(
      announcement(clock, { schedule: { start: at(clock.now() + HOUR), end: null } }),
      'ines',
    )
    expect(later.status).toBe('scheduled')
    curation.endAnnouncement(later.id)
    expect(curation.announcement(later.id).status).toBe('ended')
    expect(curation.activeAnnouncements('ruth', 'web')).toEqual([])
  })
})

describe('featured sections', () => {
  test('a manual section keeps its order, by TMDB id, and drops titles without a file', () => {
    const { curation, clock } = setup()
    const s = curation.addSection(
      section(clock, { source: { kind: 'manual', itemIds: [40, 20, 10] } }),
    )
    expect(s.source).toEqual({ kind: 'manual', itemIds: [40, 20, 10] })
    const home = curation.home('ruth', 'web')
    expect(home.map((h) => h.id)).toEqual([s.id])
    expect(home[0]?.items.map((m) => m.id)).toEqual([20, 10])
    expect(home[0]?.suffix).toBe('by Ines')
    expect(curation.sections()[0]).toMatchObject({ itemCount: 2, status: 'live' })
  })

  test('a title not in the library is refused, as is a rule that makes no sense', () => {
    const { curation, clock } = setup()
    expect(
      refused(() =>
        curation.addSection(section(clock, { source: { kind: 'manual', itemIds: [99] } })),
      ),
    ).toBe('One of the titles isn’t in the library.')
    expect(
      refused(() =>
        curation.addSection(
          section(clock, { source: { kind: 'rule', rule: 'filter', value: 'runtime < 90' } }),
        ),
      ),
    ).toContain('filter bar')
  })

  test('a rule with no matches hides its section', () => {
    const { curation, clock, fake } = setup()
    const s = curation.addSection(
      section(clock, { source: { kind: 'rule', rule: 'genre', value: 'Comedy' } }),
    )
    expect(curation.home('ruth', 'web').map((h) => h.id)).toEqual([s.id])
    fake.files.delete(10)
    fake.files.delete(30)
    expect(curation.home('ruth', 'web')).toEqual([])
    expect(curation.sections()[0]?.itemCount).toBe(0)
  })

  test('the first hero leads, Continue watching follows, and the person’s order applies below', () => {
    const { curation, clock, fake, arrangements } = setup()
    const row = curation.addSection(section(clock, { title: 'Row' }))
    const hero = curation.addSection(
      section(clock, {
        title: 'Hero',
        layout: 'hero',
        overrides: [{ itemId: 20, artwork: null, tagline: 'Our pick' }],
      }),
    )
    const second = curation.addSection(section(clock, { title: 'Second hero', layout: 'hero' }))
    fake.builtIn.push(
      { id: 'continue', title: null, items: [fake.item(30)] },
      { id: 'recent', title: null, items: [fake.item(10)] },
      { id: 'genre:35', title: 'Comedy', items: [] },
    )
    const home = curation.home('ruth', 'web')
    expect(home.map((h) => [h.id, h.layout])).toEqual([
      [hero.id, 'hero'],
      ['continue', 'continue'],
      [row.id, 'row'],
      [second.id, 'row'],
      ['recent', 'row'],
    ])
    expect(home[0]?.items[0]?.tagline).toBe('Our pick')

    arrangements.set('ruth', { order: ['recent', row.id], hidden: ['continue'] })
    expect(curation.home('ruth', 'web').map((h) => h.id)).toEqual([
      hero.id,
      'recent',
      row.id,
      second.id,
    ])
    // the rows a person can arrange: live featured rows, the hero aside
    expect(curation.rows('ruth').map((r) => r.id)).toEqual([row.id, second.id])
  })

  test('sections take the order given; any left out keep their place after', () => {
    const { curation, clock } = setup()
    const a = curation.addSection(section(clock, { title: 'A' }))
    const b = curation.addSection(section(clock, { title: 'B' }))
    const c = curation.addSection(section(clock, { title: 'C' }))
    curation.orderSections([c.id])
    expect(curation.sections().map((s) => s.title)).toEqual(['C', 'A', 'B'])
    curation.removeSection(c.id)
    expect(curation.sections().map((s) => s.order)).toEqual([0, 1])
    expect(curation.section(b.id).order).toBe(1)
    expect(curation.section(a.id).order).toBe(0)
  })
})

describe('the preview', () => {
  test('shows a draft as live, for one person on one app, and saves nothing', () => {
    const { curation, clock, sent } = setup()
    sent.length = 0
    const preview = curation.preview({
      client: 'web',
      userId: 'ruth',
      draft: {
        kind: 'section',
        section: section(clock, {
          title: '',
          schedule: { start: at(clock.now() + 10 * HOUR), end: null },
        }),
      },
    })
    expect(preview.sections.map((s) => s.id)).toEqual(['draft'])
    expect(preview.reaches).toBe(true)
    expect(curation.sections()).toEqual([])
    expect(sent).toEqual([])

    const outside = curation.preview({
      client: 'web',
      userId: 'ruth',
      draft: {
        kind: 'announcement',
        announcement: announcement(clock, { audience: { kind: 'roles', roles: ['owner'] } }),
      },
    })
    expect(outside).toMatchObject({ announcements: [], reaches: false })
    expect(curation.announcements()).toEqual([])
  })
})

describe('the schedule', () => {
  test('a start tells the people it reaches, once, however often the job runs', async () => {
    const { curation, clock, jobs, sent } = setup()
    curation.addAnnouncement(
      announcement(clock, {
        audience: { kind: 'users', userIds: ['ruth'] },
        schedule: { start: at(clock.now() + HOUR / 2), end: null },
      }),
      'ines',
    )
    sent.length = 0
    expect(curation.activeAnnouncements('ruth', 'web')).toEqual([])
    clock.advance(HOUR / 2 + 1000)
    for (let i = 0; i < 3; i++) {
      await jobs.tick()
      await jobs.idle()
    }
    curation.refresh()
    const personal = sent.filter((e) => e.topic === 'announcements.updated')
    expect(personal.map((e) => e.to)).toEqual([['ruth']])
    expect(sent.filter((e) => e.topic === 'curation.updated')).toHaveLength(1)
    expect(curation.activeAnnouncements('ruth', 'web')).toHaveLength(1)
    expect(CURATION_JOB).toBe('curation.schedule')
  })
})
