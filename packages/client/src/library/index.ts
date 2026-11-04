// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library's arranging, shared by the apps (ADR 0055): Unwatched (client-library.md#unwatched),
// a genre and a sort, over the whole library read a page at a time. Beside it, what the film page
// and a person's page say (client-detail.md), and Continue watching's menu (client-home.md), in
// i18n catalogs (ADR 0021).
import type { ClientItem } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import { languageName } from '@highsea-tv/i18n/languages'
import { createFormat } from '../format/index.ts'

export const SORTS = ['title', 'added', 'year', 'rating'] as const
export type Sort = (typeof SORTS)[number]
export type Show = 'all' | 'unwatched'
export const ALL = 'all'

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** "The Matrix" files under M, as the admin's sort title does. */
export const sortTitle = (title: string) => title.replace(/^(the|a|an)\s+/i, '')

/** The genre, then Unwatched, then the sort. Titles without a year sort last by year. */
/** What arranging reads of a title: the API's `ClientItem`, or anything wider. */
type Arrangeable = Pick<ClientItem, 'title' | 'genres' | 'watched' | 'addedAt' | 'year' | 'rating'>

export function arrange<T extends Arrangeable>(
  items: T[],
  genre: string,
  sort: Sort,
  unwatched = false,
): T[] {
  const shown = items.filter(
    (m) => (genre === ALL || m.genres.includes(genre)) && !(unwatched && m.watched),
  )
  return [...shown].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.addedAt) - Date.parse(a.addedAt)
      : sort === 'year'
        ? (b.year ?? 0) - (a.year ?? 0)
        : sort === 'rating'
          ? b.rating - a.rating
          : collator.compare(sortTitle(a.title), sortTitle(b.title)),
  )
}

export const genresOf = (items: Pick<ClientItem, 'genres'>[]) =>
  [...new Set(items.flatMap((m) => m.genres))].sort((a, b) => collator.compare(a, b))

/** The A–Z index beside a library sorted by title. Titles that don't start with a letter file under #. */
export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] as const
export type Letter = (typeof LETTERS)[number]

/** The letter a title files under, by its sort title ("The Matrix" under M). */
export const letterOf = (title: string): Letter => {
  const c = sortTitle(title).charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? (c as Letter) : '#'
}

// ---------------------------------------------------------------------------------------------
// Continue watching's menu (client-home.md › Continue watching), the same on every app: ⋯ on the
// card on the web and desktop, a long press on the phone, OK held on the TV. Go to the film (or
// the show at the episode, once shows come), Mark as watched, and Remove from Continue watching,
// which forgets the place without marking the title watched (prototype-gaps.md › 2.4).

/** How long a press is held before it opens a card's menu: the film page's hold of OK. */
export const LONG_PRESS_MS = 600

/** What a Continue watching card is: a film, or an episode with its show. */
export type ContinueCard = {
  id: string | number
  title: string
  show?: { id: string | number; title: string; code: string } | null
}

/** The film's page, or the show's at the episode. */
export const cardPage = (c: ContinueCard) =>
  c.show ? `/shows/${c.show.id}/episodes/${c.id}` : `/movies/${c.id}`

/** The player at a title (Play, Resume, Continue watching's cards); `start` plays from the start. */
export const playPath = (id: string | number, start = false) =>
  `/play/${id}${start ? '?start=1' : ''}`

export const libraryMessages = defineMessages({
  sortByTitle: 'Title',
  sortByAdded: 'Recently added',
  sortByYear: 'Newest first',
  sortByRating: 'Highest rated',
  allMovies: 'All movies',
  unwatched: 'Unwatched',
  goToFilm: 'Go to the film',
  goToShow: 'Go to the show',
  markWatched: 'Mark as watched',
  remove: 'Remove from Continue watching',
  marked: '{name} marked as watched',
  removed: '{name} removed from Continue watching',
  removedDetail: 'It isn’t marked as watched.',
  episodeName: '{show}, {code}',
  released: 'Released',
  runtime: 'Runtime',
  rated: 'Rated',
  notRated: 'Not rated',
  genres: 'Genres',
  directedBy: 'Directed by',
  writtenBy: 'Written by',
  studio: 'Studio',
  originalTitle: 'Original title',
  soundtrack: 'Soundtrack',
  versions: 'Versions',
  audio: 'Audio',
  subtitles: 'Subtitles',
  noneListed: 'None listed',
  none: 'None',
  roleWriter: 'Writer',
  roleMusic: 'Music',
  roleCamera: 'Cinematography',
  deptActing: 'Acting',
  deptDirecting: 'Directing',
  deptWriting: 'Writing',
  deptProduction: 'Producing',
  deptSound: 'Music and sound',
  deptCamera: 'Cinematography',
  deptEditing: 'Editing',
  movies: '{count, plural, one {# movie} other {# movies}}',
  shows: '{count, plural, one {# show} other {# shows}}',
  albums: '{count, plural, one {# album} other {# albums}}',
  and: '{list} and {last}',
  here: '{list} here',
  born: 'Born {date}',
  bornIn: 'Born {date} in {place}',
  died: 'Died {date}',
})

/** A person's credit on a title, as the page names it. */
export type FactCredit = {
  personId: number | string
  name: string
  character: string | null
  job: string | null
}

/** A line of facts; with a path, its value opens that page (Soundtrack opens the album). */
export type Fact = [label: string, value: string, to?: string]

/** What the film page's facts read: the server's `ClientDetail` (crew once it has it). */
export type FactsOf = {
  item: {
    title: string
    releaseDate: string | null
    runtimeMinutes: number | null
    genres: string[]
  }
  certification: string | null
  directors: FactCredit[]
  crew?: FactCredit[]
  studios: string[]
  originalTitle: string
  /** The film's score, when it's an album here (music phase). */
  soundtrack?: { id: string | number; title: string } | null
  versions: {
    label: string
    audio: { language: string }[]
    subtitles: { language: string }[]
  }[]
}

/** TMDB's departments, as a person's page heads each row (client-people.md). */
export type Department =
  | 'Acting'
  | 'Directing'
  | 'Writing'
  | 'Production'
  | 'Sound'
  | 'Camera'
  | 'Editing'

/** The order a person's rows come in after the one they're known for: TMDB's departments'. */
const DEPARTMENT_ORDER: readonly Department[] = [
  'Acting',
  'Directing',
  'Writing',
  'Production',
  'Sound',
  'Camera',
  'Editing',
]

/** A biography this long or longer is cut, with More to show the rest (client-people.md). */
export const LONG_BIO = 240

/**
 * A person's films here, a row per department (client-people.md): the one they're known for first,
 * then TMDB's order, each newest first, a film's roles in one department joined ("Director,
 * Writer"). Credits for films not here are left out; a department with none is too. Its title is
 * `departmentTitle`'s.
 */
export function filmographyOf<
  C extends {
    id: number
    year: number | null
    inLibrary: boolean
    role: string
    department: string
  },
>(credits: C[], knownFor: string | null) {
  const here = credits.filter((c) => c.inLibrary)
  // TMDB's other departments (Art, Lighting, Crew) come last, as they first appear
  const known: readonly string[] = DEPARTMENT_ORDER
  const others = [...new Set(here.map((c) => c.department))].filter((d) => !known.includes(d))
  const order = [knownFor, ...known, ...others].filter(
    (d, i, all): d is string => !!d && all.indexOf(d) === i,
  )
  return order.flatMap((department) => {
    const films = new Map<number, { item: C; role: string }>()
    for (const c of here) {
      if (c.department !== department) continue
      const had = films.get(c.id)
      films.set(
        c.id,
        had ? { item: had.item, role: `${had.role}, ${c.role}` } : { item: c, role: c.role },
      )
    }
    const list = [...films.values()].sort((a, b) => (b.item.year ?? 0) - (a.item.year ?? 0))
    return list.length > 0 ? [{ department, credits: list }] : []
  })
}

/** The trailer the page's Trailer button plays: the first trailer, or a teaser before release. */
export const previewOf = <V extends { kind: string }>(d: { videos: V[] }): V | undefined =>
  d.videos.find((x) => x.kind === 'Trailer' || x.kind === 'Teaser')

/** Cast and crew in one row: the cast in billing order, the directors, then the rest of the crew. */
export const peopleOf = <C extends FactCredit>(d: { cast: C[]; directors: C[]; crew?: C[] }) => [
  ...d.cast,
  ...d.directors,
  ...(d.crew ?? []).filter((c) => !d.directors.some((x) => x.personId === c.personId)),
]

/** "2:04". */
export const videoLength = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function createLibraryText(locale = 'en') {
  const t = createT(libraryMessages, locale)
  const format = createFormat(locale)
  const longDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  const list = (parts: string[]) =>
    parts.length > 1
      ? t('and', { list: parts.slice(0, -1).join(', '), last: parts.at(-1) ?? '' })
      : (parts[0] ?? '')
  /** A crew member's job as the page names it: plainer than TMDB's titles. */
  const roles: Record<string, string> = {
    Screenplay: t('roleWriter'),
    'Original Music Composer': t('roleMusic'),
    'Director of Photography': t('roleCamera'),
  }
  const names = (people: FactCredit[]) => people.map((x) => x.name).join(', ')
  const departments: Record<Department, string> = {
    Acting: t('deptActing'),
    Directing: t('deptDirecting'),
    Writing: t('deptWriting'),
    Production: t('deptProduction'),
    Sound: t('deptSound'),
    Camera: t('deptCamera'),
    Editing: t('deptEditing'),
  }

  const sortWords: Record<Sort, string> = {
    title: t('sortByTitle'),
    added: t('sortByAdded'),
    year: t('sortByYear'),
    rating: t('sortByRating'),
  }

  return {
    /** The library's sorts, in the order its menu lists them. */
    sorts: SORTS.map((value) => ({ value, label: sortWords[value] })),
    /** All, or only what the person hasn't watched (client-library.md#unwatched). */
    shows: [
      { value: 'all' as Show, label: t('allMovies') },
      { value: 'unwatched' as Show, label: t('unwatched') },
    ],
    /** A language by name, from the catalog (Hermes has no Intl.DisplayNames). */
    languageName,
    names,
    /** Who they play, or their job in plain words. */
    role: (c: FactCredit) => c.character ?? (c.job ? (roles[c.job] ?? c.job) : ''),
    /** A person's roles in one film, as the page names them ("Director, Writer"). */
    roleNames: (joined: string) =>
      joined
        .split(', ')
        .map((x) => roles[x] ?? x)
        .join(', '),
    /** Each department's row on a person's page, named by what they did. */
    departmentTitle: (d: string) => departments[d as Department] ?? d,

    /** Information: when, how long, the rating, the genres and who made it. */
    informationOf(d: FactsOf): Fact[] {
      const m = d.item
      const crew = d.crew ?? []
      const writers = crew.filter((c) => c.job === 'Screenplay')
      const facts: (Fact | false)[] = [
        !!m.releaseDate && [t('released'), longDate(m.releaseDate)],
        !!m.runtimeMinutes && [t('runtime'), format.runtime(m.runtimeMinutes)],
        [t('rated'), d.certification ?? t('notRated')],
        m.genres.length > 0 && [t('genres'), m.genres.join(', ')],
        d.directors.length > 0 && [t('directedBy'), names(d.directors)],
        writers.length > 0 && [t('writtenBy'), names(writers)],
        d.studios.length > 0 && [t('studio'), d.studios.join(', ')],
        d.originalTitle !== m.title && [t('originalTitle'), d.originalTitle],
        !!d.soundtrack && [t('soundtrack'), d.soundtrack.title, `/music/albums/${d.soundtrack.id}`],
      ]
      return facts.filter((x) => x !== false)
    },

    /** Languages and quality: each language once, by name, whichever versions it comes in. */
    languagesOf(d: Pick<FactsOf, 'versions'>): Fact[] {
      const spoken = (tracks: { language: string }[]) =>
        [...new Set(tracks.filter((x) => x.language).map((x) => languageName(x.language)))].join(
          ', ',
        )
      return [
        [t('versions'), d.versions.map((v) => v.label).join(', ')],
        [t('audio'), spoken(d.versions.flatMap((v) => v.audio)) || t('noneListed')],
        [t('subtitles'), spoken(d.versions.flatMap((v) => v.subtitles)) || t('none')],
      ]
    },

    /** "3 movies, 2 shows and 4 albums here": what a person's page has, leaving out what's none. */
    hereOf(counts: { films: number; shows?: number; albums?: number }) {
      const parts = [
        counts.films > 0 && t('movies', { count: counts.films }),
        !!counts.shows && t('shows', { count: counts.shows }),
        !!counts.albums && t('albums', { count: counts.albums }),
      ].filter((x): x is string => typeof x === 'string')
      return t('here', { list: list(parts) })
    },

    /** "Born 4 October 1895 in Piqua, Kansas, USA · Died 1 February 1966", as much as is known. */
    lifeOf(p: {
      born: { date: string | null; place: string | null } | null
      died: { date: string } | null
    }): string | null {
      const parts = [
        p.born?.date &&
          (p.born.place
            ? t('bornIn', { date: longDate(p.born.date), place: p.born.place })
            : t('born', { date: longDate(p.born.date) })),
        p.died && t('died', { date: longDate(p.died.date) }),
      ].filter((x): x is string => !!x)
      return parts.length > 0 ? parts.join(' · ') : null
    },

    /** Continue watching's menu for a card: where Go to opens, and the toasts' words. */
    continueMenu(c: ContinueCard) {
      const name = c.show ? t('episodeName', { show: c.show.title, code: c.show.code }) : c.title
      return {
        goTo: { label: c.show ? t('goToShow') : t('goToFilm'), path: cardPage(c) },
        markWatched: t('markWatched'),
        remove: t('remove'),
        marked: t('marked', { name }),
        removed: { title: t('removed', { name }), description: t('removedDetail') },
      }
    },
  }
}

export type LibraryText = ReturnType<typeof createLibraryText>
