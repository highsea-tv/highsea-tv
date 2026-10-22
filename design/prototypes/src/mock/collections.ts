// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections (docs/product/collections.md, docs/plans/smart-collections.md): the facts each
// film is judged on, the fields the editor offers, the evaluator, and the rules in words. The facts
// the seed doesn't carry (votes, keywords, countries, tags, certification where TMDB has none) are
// derived from the title, so every run of the prototype sees the same library.
import { movieMetadata } from './metadata.ts'
import type { ServerState } from './seed.ts'
import type {
  CollectionPreview,
  CollectionSort,
  MediaItem,
  RuleCondition,
  RuleField,
  RuleFieldInfo,
  RuleGroup,
  RuleValue,
  SmartCollection,
} from './types.ts'

const DAY = 86_400_000

function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

// ---------------------------------------------------------------- facts

export const languageNames: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  ru: 'Russian',
  es: 'Spanish',
  it: 'Italian',
  nl: 'Dutch',
  ja: 'Japanese',
  zxx: 'No dialogue',
}

const countryOf: Record<string, string> = {
  de: 'Germany',
  fr: 'France',
  ru: 'Soviet Union',
}

/** Keywords as TMDB tags films, for the titles that have telling ones. */
const keywordsByTitle: Record<string, string[]> = {
  Sintel: ['dragon', 'quest', 'open movie'],
  Spring: ['spirits', 'shepherd', 'open movie'],
  'Cosmos Laundromat': ['sheep', 'afterlife', 'open movie'],
  'Tears of Steel': ['robot', 'amsterdam', 'open movie'],
  'Big Buck Bunny': ['rabbit', 'revenge', 'open movie'],
  'Elephants Dream': ['surreal', 'open movie'],
  'Caminandes: Llama Drama': ['llama', 'patagonia', 'open movie'],
  'Caminandes: Gran Dillama': ['llama', 'patagonia', 'open movie'],
  'Caminandes: Llamigos': ['llama', 'penguin', 'patagonia', 'open movie'],
  'Night of the Living Dead': ['zombie', 'siege'],
  'Dawn of the Dead': ['zombie', 'shopping mall', 'siege'],
  'Day of the Dead': ['zombie', 'bunker'],
  Nosferatu: ['vampire', 'expressionism'],
  'The Cabinet of Dr. Caligari': ['expressionism', 'somnambulism'],
  Metropolis: ['robot', 'dystopia', 'expressionism'],
  'A Trip to the Moon': ['moon', 'space travel'],
  'The Last Man on Earth': ['vampire', 'apocalypse'],
  Detour: ['film noir', 'hitchhiker'],
  'D.O.A.': ['film noir', 'poison'],
  'Scarlet Street': ['film noir'],
  'The Stranger': ['film noir', 'nazi'],
  'The Hitch-Hiker': ['film noir', 'hitchhiker'],
  Charade: ['paris', 'heist'],
}

/** Tags the owner gave titles in the library (Movies › Edit). */
const tagsByTitle: Record<string, string[]> = {
  'Big Buck Bunny': ['kids'],
  'Caminandes: Llama Drama': ['kids'],
  'Caminandes: Gran Dillama': ['kids'],
  'Caminandes: Llamigos': ['kids'],
  Spring: ['kids', 'restored-audio'],
  Metropolis: ['restored'],
  Nosferatu: ['restored'],
  'The General': ['restored'],
  'Night of the Living Dead': ['halloween'],
  'Dawn of the Dead': ['halloween'],
  'Carnival of Souls': ['halloween'],
}

/** The people fields, their TMDB department and job, and their labels. */
export const roles = {
  actor: { label: 'Actor', job: null },
  director: { label: 'Director', job: 'Director' },
  writer: { label: 'Writer', job: 'Screenplay' },
  composer: { label: 'Composer', job: 'Original Music Composer' },
  producer: { label: 'Producer', job: 'Producer' },
  cinematographer: { label: 'Cinematographer', job: 'Director of Photography' },
  editor: { label: 'Editor', job: 'Editor' },
} as const
type Role = keyof typeof roles

const resolutions = ['480p', '720p', '1080p', '2160p'] as const
const certifications = ['G', 'PG', 'PG-13', 'R', 'NC-17'] as const

export type Facts = {
  item: MediaItem
  title: string
  status: string
  year: number
  release: number
  rating: number
  votes: number
  certification: string
  originalLanguage: string
  audio: string[]
  subtitles: string[]
  genres: string[]
  runtime: number
  keywords: string[]
  studios: string[]
  countries: string[]
  people: Record<Role, string[]>
  /** TMDB collections, by id. */
  collections: string[]
  added: number
  tags: string[]
  rootFolder: string
  qualityProfiles: string[]
  resolution: string | null
  hdr: string[]
  codecs: string[]
  editions: string[]
  /** The largest file, in GB. */
  size: number
  playable: boolean
}

export function factsOf(state: ServerState, m: MediaItem, now: number): Facts {
  const meta = movieMetadata(state, m.id, now)
  const files = state.files.filter((f) => f.itemId === m.id)
  const silent = m.year < 1930
  const original = meta?.originalLanguage ?? 'en'
  const streams = files.flatMap((f) => f.streams)
  const audio = [
    ...new Set([
      // a dubbed film keeps its own language beside the English track
      ...(silent || original === 'en' || original === 'zxx' ? [] : [original]),
      ...streams.flatMap((s) => (s.type === 'audio' ? [s.language] : [])),
    ]),
  ]
  const subtitles = [
    ...new Set([
      ...streams.flatMap((s) => (s.type === 'subtitle' ? [s.language] : [])),
      ...state.subtitles.filter((t) => t.itemId === m.id).map((t) => t.language),
    ]),
  ]
  const crew = meta?.crew ?? []
  const ofJob = (job: string) => crew.filter((c) => c.job === job).map((c) => c.personId)
  const people: Record<Role, string[]> = {
    actor: (meta?.cast ?? []).map((c) => c.personId),
    director: ofJob('Director'),
    writer: ofJob('Screenplay'),
    composer: ofJob('Original Music Composer'),
    producer: ofJob('Producer'),
    cinematographer: ofJob('Director of Photography'),
    editor: ofJob('Editor'),
  }
  const videos = streams.flatMap((s) => (s.type === 'video' ? [s] : []))
  const best = files
    .map((f) => f.quality.resolution)
    .sort((a, b) => resolutions.indexOf(b) - resolutions.indexOf(a))[0]
  const studios = meta?.studios ?? []
  const h = hash(m.title)
  return {
    item: m,
    title: m.title,
    status:
      m.status === 'cutoff-unmet' || m.status === 'missing'
        ? 'wanted'
        : m.status === 'queued'
          ? 'downloading'
          : m.status,
    year: m.year,
    release: Date.parse(m.releaseDate),
    rating: m.rating,
    votes: m.rating ? 120 + (h % 9400) : 0,
    // MPAA ratings began in 1968; TMDB lists earlier films as not rated
    certification:
      meta?.certification ??
      (m.year < 1968
        ? 'NR'
        : m.genres.includes('Horror')
          ? 'R'
          : m.title === 'Sintel' || m.title === 'Tears of Steel'
            ? 'PG-13'
            : 'PG'),
    originalLanguage: original,
    audio,
    subtitles,
    genres: m.genres,
    runtime: m.runtimeMinutes,
    keywords: [...(keywordsByTitle[m.title] ?? []), ...(silent ? ['silent film'] : [])],
    studios,
    countries: [
      studios.includes('Blender Studio') ? 'Netherlands' : (countryOf[original] ?? 'United States'),
    ],
    people,
    collections: meta?.collection ? [meta.collection.id] : [],
    added: Date.parse(m.addedAt),
    tags: tagsByTitle[m.title] ?? [],
    rootFolder: m.rootFolder,
    qualityProfiles: m.versions.map((v) => v.qualityProfileId),
    resolution: best ?? null,
    hdr: videos.map((v) => v.hdr),
    codecs: [...new Set(files.map((f) => f.quality.codec))],
    editions: m.versions.map((v) => v.label),
    size: Math.max(0, ...files.map((f) => f.size / 1e9)),
    playable: m.versions.some((v) => v.fileId),
  }
}

// ---------------------------------------------------------------- fields

const decadesOf = (years: number[]) =>
  [...new Set(years.map((y) => Math.floor(y / 10) * 10))]
    .sort((a, b) => a - b)
    .map((d) => ({ value: String(d), label: `${d}s` }))

const opts = (xs: string[], label = (x: string) => x) =>
  [...new Set(xs)]
    .sort((a, b) => label(a).localeCompare(label(b)))
    .map((x) => ({
      value: x,
      label: label(x),
    }))

/**
 * The fields the editor offers, with their choices from the library as it is. People fields carry
 * every person in that role, for the editor's search.
 */
export function fields(
  state: ServerState,
  now: number,
  others: { id: string; name: string }[],
): RuleFieldInfo[] {
  const movies = state.items.filter((m) => m.type === 'movie')
  const all = movies.map((m) => factsOf(state, m, now))
  const names = new Map<string, string>()
  for (const m of movies) {
    const meta = movieMetadata(state, m.id, now)
    for (const c of [...(meta?.cast ?? []), ...(meta?.crew ?? [])]) names.set(c.personId, c.name)
  }
  const people = (role: Role | null) =>
    opts(
      role
        ? all.flatMap((f) => f.people[role])
        : all.flatMap((f) => Object.values(f.people).flat()),
      (id) => names.get(id) ?? id,
    )
  const lang = (x: string) => languageNames[x] ?? x
  const person = (field: Role, label: string): RuleFieldInfo => ({
    field,
    label,
    group: 'People',
    type: 'person',
    ops: ['includes', 'excludes'],
    options: people(field),
  })
  const tmdb = movies
    .flatMap((m) => {
      const c = movieMetadata(state, m.id, now)?.collection
      return c ? [c] : []
    })
    .filter((c, i, xs) => xs.findIndex((x) => x.id === c.id) === i)
  return [
    {
      field: 'title',
      label: 'Title',
      group: 'Release',
      type: 'text',
      ops: ['contains'],
    },
    {
      field: 'year',
      label: 'Year',
      group: 'Release',
      type: 'number',
      ops: ['is', 'between', 'before', 'after', 'inLast'],
      unit: 'years',
    },
    {
      field: 'releaseDate',
      label: 'Release date',
      group: 'Release',
      type: 'date',
      ops: ['before', 'after', 'inLast'],
      unit: 'days',
    },
    {
      field: 'decade',
      label: 'Decade',
      group: 'Release',
      type: 'choice',
      ops: ['is', 'isNot'],
      options: decadesOf(all.map((f) => f.year)),
    },
    {
      field: 'rating',
      label: 'Rating',
      group: 'Ratings',
      type: 'number',
      ops: ['atLeast', 'atMost', 'between'],
      unit: 'stars',
    },
    { field: 'votes', label: 'Votes', group: 'Ratings', type: 'number', ops: ['atLeast'] },
    {
      field: 'certification',
      label: 'Certification',
      group: 'Ratings',
      type: 'choice',
      ops: ['is', 'isNot', 'atMost'],
      options: [...certifications, 'NR'].map((c) => ({
        value: c,
        label: c === 'NR' ? 'Not rated' : c,
      })),
    },
    {
      field: 'originalLanguage',
      label: 'Original language',
      group: 'Language',
      type: 'list',
      ops: ['is', 'isNot', 'oneOf'],
      options: opts(
        all.map((f) => f.originalLanguage),
        lang,
      ),
    },
    {
      field: 'audioLanguage',
      label: 'Audio language',
      group: 'Language',
      type: 'list',
      ops: ['includes', 'only', 'excludes'],
      options: opts(
        all.flatMap((f) => f.audio),
        lang,
      ),
    },
    {
      field: 'subtitleLanguage',
      label: 'Subtitle language',
      group: 'Language',
      type: 'list',
      ops: ['includes', 'excludes'],
      options: opts(
        [...all.flatMap((f) => f.subtitles), ...state.languages.map((l) => l.code)],
        lang,
      ),
    },
    {
      field: 'genre',
      label: 'Genre',
      group: 'Content',
      type: 'list',
      ops: ['anyOf', 'allOf', 'noneOf'],
      options: opts(all.flatMap((f) => f.genres)),
    },
    {
      field: 'runtime',
      label: 'Runtime',
      group: 'Content',
      type: 'number',
      ops: ['atLeast', 'atMost', 'between'],
      unit: 'minutes',
    },
    {
      field: 'keyword',
      label: 'Keyword',
      group: 'Content',
      type: 'list',
      ops: ['anyOf', 'noneOf'],
      options: opts(all.flatMap((f) => f.keywords)),
    },
    {
      field: 'studio',
      label: 'Studio',
      group: 'Content',
      type: 'list',
      ops: ['oneOf', 'notOneOf'],
      options: opts(all.flatMap((f) => f.studios)),
    },
    {
      field: 'country',
      label: 'Country',
      group: 'Content',
      type: 'list',
      ops: ['oneOf', 'notOneOf'],
      options: opts(all.flatMap((f) => f.countries)),
    },
    {
      field: 'collection',
      label: 'In a collection',
      group: 'Content',
      type: 'list',
      ops: ['oneOf', 'notOneOf'],
      options: [
        ...tmdb.map((c) => ({ value: c.id, label: c.name })),
        ...others.map((c) => ({ value: c.id, label: c.name })),
      ],
    },
    person('actor', 'Actor'),
    person('director', 'Director'),
    person('writer', 'Writer'),
    person('composer', 'Composer'),
    person('producer', 'Producer'),
    person('cinematographer', 'Cinematographer'),
    person('editor', 'Editor'),
    {
      field: 'person',
      label: 'Anyone in the cast and crew',
      group: 'People',
      type: 'person',
      ops: ['includes', 'excludes'],
      options: people(null),
    },
    {
      field: 'added',
      label: 'Date added',
      group: 'Library',
      type: 'date',
      ops: ['inLast', 'before', 'after'],
      unit: 'days',
    },
    {
      field: 'status',
      label: 'Status',
      group: 'Library',
      type: 'choice',
      ops: ['is', 'isNot'],
      options: [
        { value: 'available', label: 'Available' },
        { value: 'wanted', label: 'Wanted' },
        { value: 'downloading', label: 'Downloading' },
        { value: 'unreleased', label: 'Not released' },
      ],
    },
    {
      field: 'tag',
      label: 'Tag',
      group: 'Library',
      type: 'list',
      ops: ['anyOf', 'allOf', 'noneOf'],
      options: opts(all.flatMap((f) => f.tags)),
    },
    {
      field: 'rootFolder',
      label: 'Root folder',
      group: 'Library',
      type: 'choice',
      ops: ['is', 'isNot'],
      options: opts(all.map((f) => f.rootFolder)),
    },
    {
      field: 'qualityProfile',
      label: 'Quality profile',
      group: 'Library',
      type: 'choice',
      ops: ['is', 'isNot'],
      options: state.qualityProfiles.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      field: 'resolution',
      label: 'Resolution',
      group: 'File',
      type: 'choice',
      ops: ['is', 'atLeast'],
      options: resolutions.map((r) => ({ value: r, label: r === '2160p' ? '4K' : r })),
    },
    {
      field: 'hdr',
      label: 'HDR',
      group: 'File',
      type: 'choice',
      ops: ['is'],
      options: [
        { value: 'any', label: 'Any HDR' },
        { value: 'dolby-vision', label: 'Dolby Vision' },
        { value: 'hdr10', label: 'HDR10' },
        { value: 'none', label: 'None' },
      ],
    },
    {
      field: 'videoCodec',
      label: 'Video codec',
      group: 'File',
      type: 'choice',
      ops: ['is', 'isNot'],
      options: opts(['x264', 'HEVC', 'AV1', ...all.flatMap((f) => f.codecs)]),
    },
    {
      field: 'edition',
      label: 'Edition',
      group: 'File',
      type: 'choice',
      ops: ['is', 'isNot'],
      options: opts(all.flatMap((f) => f.editions)),
    },
    {
      field: 'size',
      label: 'Size',
      group: 'File',
      type: 'number',
      ops: ['atLeast', 'atMost'],
      unit: 'GB',
    },
    {
      field: 'watched',
      label: 'Watched',
      group: 'Playback',
      type: 'choice',
      ops: ['is'],
      disabled: 'Comes with playback',
    },
    {
      field: 'lastPlayed',
      label: 'Last played',
      group: 'Playback',
      type: 'date',
      ops: ['inLast'],
      disabled: 'Comes with playback',
    },
  ]
}

// ---------------------------------------------------------------- the evaluator

const asList = (v: RuleValue): string[] =>
  Array.isArray(v) ? v.map(String) : v === '' ? [] : [String(v)]
const asNumber = (v: RuleValue) => (typeof v === 'number' ? v : Number(v))
const asRange = (v: RuleValue): [number, number] =>
  Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'
    ? [v[0], v[1] as number]
    : [asNumber(v), asNumber(v)]

/** Whether `f` matches one condition. `inCollection` answers for another collection's id. */
function matches(
  c: RuleCondition,
  f: Facts,
  now: number,
  inCollection: (id: string, f: Facts) => boolean,
): boolean {
  const { op, value } = c
  const num = (x: number) => {
    if (op === 'is') return x === asNumber(value)
    if (op === 'atLeast' || op === 'after') return x >= asNumber(value)
    if (op === 'atMost' || op === 'before') return x <= asNumber(value)
    if (op === 'between') {
      const [lo, hi] = asRange(value)
      return x >= Math.min(lo, hi) && x <= Math.max(lo, hi)
    }
    return false
  }
  const date = (t: number, unit: number) => {
    if (op === 'inLast') return t <= now && t >= now - asNumber(value) * unit
    const at = Date.parse(String(value))
    if (Number.isNaN(at)) return false
    return op === 'before' ? t < at : op === 'after' ? t > at : false
  }
  const set = (have: string[]) => {
    const want = asList(value)
    if (op === 'is' || op === 'includes' || op === 'oneOf' || op === 'anyOf')
      return want.some((w) => have.includes(w))
    if (op === 'isNot' || op === 'excludes' || op === 'notOneOf' || op === 'noneOf')
      return !want.some((w) => have.includes(w))
    if (op === 'allOf') return want.every((w) => have.includes(w))
    if (op === 'only') return have.length > 0 && have.every((h) => want.includes(h))
    return false
  }
  switch (c.field) {
    case 'title':
      return f.title.toLowerCase().includes(String(value).trim().toLowerCase())
    case 'status':
      return set([f.status])
    case 'year':
      if (op === 'before') return f.year < asNumber(value)
      if (op === 'after') return f.year > asNumber(value)
      if (op === 'inLast') return f.year >= new Date(now).getFullYear() - asNumber(value)
      return num(f.year)
    case 'releaseDate':
      return date(f.release, DAY)
    case 'decade':
      return set([String(Math.floor(f.year / 10) * 10)])
    case 'rating':
      return f.rating > 0 && num(f.rating)
    case 'votes':
      return num(f.votes)
    case 'certification': {
      if (op !== 'atMost') return set([f.certification])
      const rank = certifications.indexOf(f.certification as (typeof certifications)[number])
      return rank >= 0 && rank <= certifications.indexOf(String(value) as 'G')
    }
    case 'originalLanguage':
      return set([f.originalLanguage])
    case 'audioLanguage':
      return set(f.audio)
    case 'subtitleLanguage':
      return set(f.subtitles)
    case 'genre':
      return set(f.genres)
    case 'runtime':
      return num(f.runtime)
    case 'keyword':
      return set(f.keywords)
    case 'studio':
      return set(f.studios)
    case 'country':
      return set(f.countries)
    case 'collection': {
      const ids = asList(value)
      const inAny = ids.some((id) => f.collections.includes(id) || inCollection(id, f))
      return op === 'notOneOf' ? !inAny : inAny
    }
    case 'actor':
    case 'director':
    case 'writer':
    case 'composer':
    case 'producer':
    case 'cinematographer':
    case 'editor':
      return set(f.people[c.field])
    case 'person':
      return set(Object.values(f.people).flat())
    case 'added':
      return date(f.added, DAY)
    case 'tag':
      return set(f.tags)
    case 'rootFolder':
      return set([f.rootFolder])
    case 'qualityProfile':
      return set(f.qualityProfiles)
    case 'resolution': {
      if (!f.resolution) return false
      const have = resolutions.indexOf(f.resolution as (typeof resolutions)[number])
      const want = resolutions.indexOf(String(value) as '480p')
      return op === 'atLeast' ? have >= want : have === want
    }
    case 'hdr':
      if (!f.hdr.length) return false
      if (value === 'any') return f.hdr.some((h) => h !== 'none')
      if (value === 'none') return f.hdr.every((h) => h === 'none')
      return f.hdr.includes(String(value))
    case 'videoCodec':
      return set(f.codecs)
    case 'edition':
      return set(f.editions)
    case 'size':
      return f.size > 0 && num(f.size)
    // watch state comes with playback (Phase 4); until then nothing matches
    case 'watched':
    case 'lastPlayed':
      return false
  }
}

function matchesGroup(
  g: RuleGroup,
  f: Facts,
  now: number,
  inCollection: (id: string, f: Facts) => boolean,
): boolean {
  // an empty group asks nothing of a film
  if (g.rules.length === 0) return true
  const each = (r: RuleCondition | RuleGroup) =>
    r.kind === 'group' ? matchesGroup(r, f, now, inCollection) : matches(r, f, now, inCollection)
  return g.match === 'all' ? g.rules.every(each) : g.rules.some(each)
}

/** Popularity: how many voted, weighed by how well. */
const popularity = (f: Facts) => f.votes * f.rating

/** Each sort's ascending order: lowest, oldest, shortest, A first. */
const sorters: Record<
  Exclude<CollectionSort, 'manual' | 'random'>,
  (a: Facts, b: Facts) => number
> = {
  rating: (a, b) => a.rating - b.rating || a.votes - b.votes,
  release: (a, b) => a.release - b.release,
  year: (a, b) => a.year - b.year || a.release - b.release,
  added: (a, b) => a.added - b.added,
  title: (a, b) => a.item.sortTitle.localeCompare(b.item.sortTitle),
  runtime: (a, b) => a.runtime - b.runtime,
  popularity: (a, b) => popularity(a) - popularity(b),
}

/** How each sort reads, ascending then descending. */
export const sortLabels: Record<CollectionSort, { label: string; up: string; down: string }> = {
  manual: { label: 'In your order', up: '', down: '' },
  rating: { label: 'Rating', up: 'Lowest first', down: 'Highest first' },
  release: { label: 'Release date', up: 'Oldest first', down: 'Newest first' },
  year: { label: 'Year', up: 'Oldest first', down: 'Newest first' },
  added: { label: 'Date added', up: 'Oldest first', down: 'Newest first' },
  title: { label: 'Title', up: 'A to Z', down: 'Z to A' },
  runtime: { label: 'Runtime', up: 'Shortest first', down: 'Longest first' },
  popularity: { label: 'Popularity', up: 'Least popular first', down: 'Most popular first' },
  random: { label: 'Shuffled, once a day', up: '', down: '' },
}

/**
 * What a collection holds, in its order and after its limit: what its rules match plus Always
 * include, less Never include. Without rules, its picks in their order. Another collection named
 * in a rule is evaluated in turn; a loop back to one already being evaluated matches nothing.
 */
export function evaluate(
  state: ServerState,
  c: SmartCollection,
  now: number,
  all: SmartCollection[],
  visiting: Set<string> = new Set(),
): Facts[] {
  const movies = state.items.filter((m) => m.type === 'movie')
  const facts = new Map(movies.map((m) => [m.id, factsOf(state, m, now)]))
  const seen = new Set([...visiting, c.id])
  const memo = new Map<string, Set<string>>()
  const inCollection = (id: string, f: Facts) => {
    if (seen.has(id)) return false
    let ids = memo.get(id)
    if (!ids) {
      const other = all.find((x) => x.id === id)
      ids = new Set(other ? evaluate(state, other, now, all, seen).map((x) => x.item.id) : [])
      memo.set(id, ids)
    }
    return ids.has(f.item.id)
  }
  const excluded = new Set(c.exclude)
  const picked = c.include.flatMap((id) => {
    const f = facts.get(id)
    return f && !excluded.has(id) ? [f] : []
  })
  if (!c.rules) return c.limit ? picked.slice(0, c.limit) : picked
  const rules = c.rules
  const matched = [...facts.values()].filter(
    (f) => !excluded.has(f.item.id) && matchesGroup(rules, f, now, inCollection),
  )
  const result = [...matched, ...picked.filter((f) => !matched.includes(f))]
  if (c.sort === 'random') {
    // a new order each day, the same all day
    const day = Math.floor(now / DAY)
    result.sort((a, b) => hash(`${day}:${a.item.id}`) - hash(`${day}:${b.item.id}`))
  } else if (c.sort !== 'manual') {
    const by = sorters[c.sort]
    result.sort(c.descending ? (a, b) => by(b, a) : by)
  }
  return c.limit ? result.slice(0, c.limit) : result
}

export function preview(
  state: ServerState,
  c: SmartCollection,
  now: number,
  all: SmartCollection[],
): CollectionPreview {
  const items = evaluate(state, c, now, all)
  return {
    matched: items.length,
    playable: items.filter((f) => f.playable).length,
    items: items.map((f) => ({
      id: f.item.id,
      title: f.item.title,
      year: f.item.year,
      poster: f.item.art.poster,
      playable: f.playable,
    })),
    words: describe(c.rules, fields(state, now, all)),
  }
}

// ---------------------------------------------------------------- in words

const join = (xs: string[], word: 'and' | 'or') =>
  xs.length <= 1
    ? (xs[0] ?? '')
    : `${xs.slice(0, -1).join(', ')} ${word} ${xs[xs.length - 1] as string}`

const shortDate = (v: RuleValue) =>
  new Date(String(v)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

/** One condition in words: "released 2010–2020", "rated 4.5 or more", "scored by Jan Morgenstern". */
export function describeCondition(c: RuleCondition, info: RuleFieldInfo | undefined): string {
  const label = (v: string) => info?.options?.find((o) => o.value === v)?.label ?? v
  const list = (word: 'and' | 'or' = 'or') => join(asList(c.value).map(label), word)
  const [lo, hi] = asRange(c.value)
  const n = asNumber(c.value)
  switch (c.field) {
    case 'title':
      return `called “${String(c.value).trim()}”`
    case 'status':
      return `${c.op === 'isNot' ? 'not ' : ''}${label(String(c.value)).toLowerCase()}`
    case 'year':
      return c.op === 'between'
        ? `released ${lo}–${hi}`
        : c.op === 'before'
          ? `released before ${n}`
          : c.op === 'after'
            ? `released after ${n}`
            : c.op === 'inLast'
              ? `released in the last ${n} years`
              : `released in ${n}`
    case 'releaseDate':
    case 'added': {
      const verb = c.field === 'added' ? 'added' : 'released'
      return c.op === 'inLast'
        ? `${verb} in the last ${n} days`
        : `${verb} ${c.op} ${shortDate(c.value)}`
    }
    case 'decade':
      return `${c.op === 'isNot' ? 'not from' : 'from'} the ${c.value}s`
    case 'rating':
      return c.op === 'between'
        ? `rated ${lo} to ${hi}`
        : c.op === 'atMost'
          ? `rated ${n} or less`
          : `rated ${n} or more`
    case 'votes':
      return `with ${n.toLocaleString('en-GB')} votes or more`
    case 'certification':
      return c.op === 'atMost'
        ? `rated ${c.value} or milder`
        : `${c.op === 'isNot' ? 'not rated' : 'rated'} ${label(String(c.value))}`
    case 'originalLanguage':
      return c.op === 'isNot' ? `not in ${list()}` : `in ${list()}`
    case 'audioLanguage':
      return c.op === 'only'
        ? `with audio only in ${list()}`
        : c.op === 'excludes'
          ? `without ${list()} audio`
          : `with ${list()} audio`
    case 'subtitleLanguage':
      return c.op === 'excludes' ? `without ${list()} subtitles` : `with ${list()} subtitles`
    case 'genre':
    case 'keyword':
    case 'tag': {
      const lead = { genre: '', keyword: 'about ', tag: 'tagged ' }[c.field]
      const names = list(c.op === 'allOf' ? 'and' : 'or')
      return c.op === 'noneOf' ? `not ${lead}${names}` : `${lead}${names}`
    }
    case 'runtime':
      return c.op === 'between'
        ? `${lo}–${hi} minutes long`
        : c.op === 'atMost'
          ? `${n} minutes or shorter`
          : `${n} minutes or longer`
    case 'studio':
      return `${c.op === 'notOneOf' ? 'not from' : 'from'} ${list()}`
    case 'country':
      return `${c.op === 'notOneOf' ? 'not made in' : 'made in'} ${list()}`
    case 'collection':
      return `${c.op === 'notOneOf' ? 'not in' : 'in'} ${list()}`
    case 'actor':
      return `${c.op === 'excludes' ? 'without' : 'with'} ${list()}`
    case 'director':
    case 'writer':
    case 'composer':
    case 'producer':
    case 'cinematographer':
    case 'editor': {
      const verb = {
        director: 'directed',
        writer: 'written',
        composer: 'scored',
        producer: 'produced',
        cinematographer: 'shot',
        editor: 'edited',
      }[c.field]
      return `${c.op === 'excludes' ? `not ${verb}` : verb} by ${list()}`
    }
    case 'person':
      return `${c.op === 'excludes' ? 'without' : 'with'} ${list()} in the cast or crew`
    case 'rootFolder':
      return `${c.op === 'isNot' ? 'not in' : 'in'} ${c.value}`
    case 'qualityProfile':
      return `${c.op === 'isNot' ? 'not on' : 'on'} ${label(String(c.value))}`
    case 'resolution':
      return c.op === 'atLeast'
        ? `in ${label(String(c.value))} or better`
        : `in ${label(String(c.value))}`
    case 'hdr':
      return c.value === 'none' ? 'without HDR' : `in ${label(String(c.value))}`
    case 'videoCodec':
    case 'edition':
      return `${c.op === 'isNot' ? 'not' : ''} ${c.value}`.trim()
    case 'size':
      return c.op === 'atMost' ? `${n} GB or smaller` : `${n} GB or larger`
    case 'watched':
    case 'lastPlayed':
      return 'watch state'
  }
}

/** The rules in words, for the apps and the editor: "Released 2010–2020, rated 4.5 or more, in English". */
export function describe(rules: RuleGroup | null, infos: RuleFieldInfo[]): string | null {
  if (!rules || rules.rules.length === 0) return null
  const info = (f: RuleField) => infos.find((i) => i.field === f)
  const words = (g: RuleGroup): string => {
    const parts = g.rules.map((r) =>
      r.kind === 'group' ? `(${words(r)})` : describeCondition(r, info(r.field)),
    )
    return g.match === 'all' ? parts.join(', ') : join(parts, 'or')
  }
  const text = words(rules)
  return text.charAt(0).toUpperCase() + text.slice(1)
}
