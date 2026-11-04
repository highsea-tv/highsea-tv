// SPDX-License-Identifier: AGPL-3.0-only
// What the films screens decide (one-client-platform-b.md › B1): Home's rows, cards, the A–Z
// index, the film page's picks, a person's header, Search's kinds, collection tiles, Mark as
// watched's words and an announcement's tone.
import { describe, expect, test } from 'bun:test'
import {
  createFilmsText,
  heroOf,
  isNew,
  isShownKind,
  lettersOf,
  NEW_FOR_MS,
  OFF,
  personHeaderOf,
  picksOf,
  qualitiesOf,
  rowsOf,
  SEARCH_KINDS,
  toneOf,
  versionLabel,
} from '../src/films/index.ts'

const text = createFilmsText('en')
const NOW = Date.parse('2026-10-17T20:15:00.000Z')

describe('Home', () => {
  const rows = [
    { id: 'fs-empty', title: 'Featured', layout: 'hero', items: [] },
    { id: 'fs-hero', title: 'Featured', layout: 'hero', items: [1] },
    { id: 'continue', title: null, layout: 'continue', items: [2] },
    { id: 'recent', title: null, layout: 'row', items: [] },
    { id: 'genre:18', title: 'Drama', layout: 'row', items: [3] },
  ]

  test('the hero is the first with something in it, and empty rows go', () => {
    expect(heroOf(rows)?.id).toBe('fs-hero')
    expect(rowsOf(rows).map((r) => r.id)).toEqual(['continue', 'genre:18'])
  })

  test('built-in rows are named by the app', () => {
    expect(text.rowTitle({ id: 'continue', title: null })).toBe('Continue watching')
    expect(text.rowTitle({ id: 'recent', title: null })).toBe('Recently added')
    expect(text.rowTitle({ id: 'genre:18', title: 'Drama' })).toBe('Drama')
  })

  test('New is the first card’s, for thirty days, by the clock given', () => {
    const lately = { addedAt: new Date(NOW - NEW_FOR_MS + 1000).toISOString() }
    const long = { addedAt: new Date(NOW - NEW_FOR_MS - 1000).toISOString() }
    expect(isNew(lately, NOW)).toBe(true)
    expect(isNew(long, NOW)).toBe(false)
    const film = { ...lately, year: 2010, genres: ['Fantasy'] }
    expect(text.kicker(film, true, NOW)).toBe('New · 2010 · Fantasy')
    expect(text.kicker(film, false, NOW)).toBe('2010 · Fantasy')
  })
})

describe('cards', () => {
  const film = {
    title: 'Sintel',
    year: 2010,
    runtimeMinutes: 15,
    position: 300,
    progress: 0.3,
    art: { poster: 'p', backdrop: 'b' },
  }

  test('a poster with its year, or Home’s still with the time left', () => {
    expect(text.card(film)).toMatchObject({ title: 'Sintel', src: 'p', caption: '2010' })
    expect(text.card(film, { resume: true })).toMatchObject({
      src: 'b',
      aspect: 'still',
      caption: '10 min left',
      progress: 0.3,
      progressBelow: true,
    })
  })

  test('an episode is its show and its place', () => {
    const episode = {
      ...film,
      art: { poster: 'p', still: 's' },
      show: { title: 'Ghost Signal', code: 'S1, E3', episode: 'Northbound' },
    }
    expect(text.card(episode)).toMatchObject({
      title: 'Ghost Signal',
      caption: 'S1, E3 · Northbound',
    })
    expect(text.card(episode, { resume: true })).toMatchObject({
      src: 's',
      caption: 'S1, E3 · 10 min left',
    })
    // an episode without a name is its place alone, with nothing trailing
    const unnamed = { ...episode, show: { title: 'Ghost Signal', code: 'S1, E3' } }
    expect(text.card(unnamed).caption).toBe('S1, E3')
  })
})

describe('the A–Z index', () => {
  test('the letters present and the first title under each', () => {
    const items = [
      { id: 1, title: '12 Angry Men' },
      { id: 2, title: 'The Apartment' },
      { id: 3, title: 'Amélie' },
      { id: 4, title: 'Brazil' },
    ]
    const { present, firsts } = lettersOf(items)
    expect([...present]).toEqual(['#', 'A', 'B'])
    expect([...firsts]).toEqual([1, 2, 4])
  })
})

describe('the film page', () => {
  const version = (id: string, playable = true) => ({
    id,
    label: id === 'v1' ? '4K' : '1080p',
    detail: playable ? 'HEVC · HDR10' : null,
    playable,
    audio: [
      { id: 'a0', default: false },
      { id: 'a1', default: true },
    ],
    subtitles: [{ id: 's0' }],
  })
  const versions = [version('v0', false), version('v1'), version('v2')]

  test('the first version that plays, its default audio and no subtitles', () => {
    const p = picksOf(versions, null)
    expect(p.version?.id).toBe('v1')
    expect(p.audio?.id).toBe('a1')
    expect(p.subtitleValue).toBe(OFF)
    expect(p.playable).toHaveLength(2)
  })

  test('the picks kept, where the version has them', () => {
    const p = picksOf(versions, { versionId: 'v2', audioId: 'a0', subtitleId: 's0' })
    expect([p.version?.id, p.audioValue, p.subtitleValue]).toEqual(['v2', 'a0', 's0'])
    expect(
      picksOf(versions, { versionId: 'v0', audioId: null, subtitleId: null }).version?.id,
    ).toBe('v1')
  })

  test('the tracks keep their own types, inferred from the versions', () => {
    type Audio = { id: string; default: boolean; language: string }
    type Subtitle = { id: string; forced: boolean }
    type V = { id: string; label: string; detail: string | null; playable: boolean }
    const typed: (V & { audio: Audio[]; subtitles: Subtitle[] })[] = [
      {
        ...version('v1'),
        audio: [{ id: 'a0', default: true, language: 'en' }],
        subtitles: [{ id: 's0', forced: false }],
      },
    ]
    const p = picksOf(typed, { versionId: null, audioId: null, subtitleId: 's0' })
    // these read fields only the call's own track types have: a typecheck fails if they widen
    const language: string | undefined = p.audio?.language
    const forced: boolean | undefined = p.subtitle?.forced
    expect([language, forced]).toEqual(['en', false])
    // a call naming all three types, as the screens wrote them, still compiles
    const named = picksOf<Audio, Subtitle, (typeof typed)[number]>(typed, null)
    expect(named.audio?.language).toBe('en')
  })

  test('a version’s name, the qualities and the lead line', () => {
    expect(versionLabel(versions[1] as (typeof versions)[number])).toBe('4K · HDR10')
    expect(versionLabel({ label: '1080p', detail: null })).toBe('1080p')
    expect(qualitiesOf([...versions, version('v3')])).toEqual(['4K', '1080p'])
    expect(text.leadOf({ year: 2012, runtimeMinutes: 12 })).toBe('2012 · 12m')
  })

  test('Mark as watched and its words', () => {
    const m = text.markWatched({ title: 'Sintel', watched: false })
    expect(m.label).toBe('Mark as watched')
    expect(m.toast()).toEqual({ title: 'Sintel marked as watched', description: undefined })
    const u = text.markWatched({ title: 'Sintel', watched: true })
    expect(u.label).toBe('Mark as unwatched')
    expect(u.toast()).toEqual({
      title: 'Sintel marked as unwatched',
      description: 'It plays from the start next time.',
    })
  })
})

describe('a person, Search, collections and announcements', () => {
  test('the films here, the best rated and how many', () => {
    const c = (id: number, rating: number, inLibrary = true) => ({
      id,
      rating,
      inLibrary,
      art: { backdrop: `b${id}` },
    })
    const h = personHeaderOf([c(1, 3), c(1, 3), c(2, 4.5), c(3, 5, false)])
    expect(h.best?.id).toBe(2)
    expect(h.count).toBe(2)
  })

  test('Search shows films, collections and people', () => {
    expect(SEARCH_KINDS).toEqual(['movies', 'collections', 'people'])
    expect(isShownKind({ kind: 'discover' })).toBe(false)
    expect(isShownKind({ kind: 'people' })).toBe(true)
    expect(text.search.kind('collections')).toBe('Collections')
  })

  test('a collection tile is named with its kind', () => {
    const c = { name: 'Blender', count: 3, years: '2006–2012', smart: null }
    expect(text.tileOf(c).label).toBe('Blender, 3 movies · 2006–2012')
    const smart = text.tileOf({ ...c, smart: { words: 'Animation' } })
    expect(smart.label).toBe('Blender, smart collection, 3 movies · 2006–2012')
    expect(smart.badge).toBe('Smart')
    // one of the server's own, picked by hand: no rules, so no words, drawn as any collection
    const picked = text.tileOf({ ...c, smart: { words: null } })
    expect(picked).toMatchObject({ smart: false, badge: null, kind: 'Collection' })
    expect(picked.label).toBe('Blender, 3 movies · 2006–2012')
  })

  test('a warning or worse is a warning', () => {
    expect(toneOf('critical')).toBe('warning')
    expect(toneOf('warning')).toBe('warning')
    expect(toneOf('info')).toBe('announcement')
  })
})
