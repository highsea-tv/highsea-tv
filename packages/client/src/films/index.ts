// SPDX-License-Identifier: AGPL-3.0-only
// What the films screens decide, once for every app (one-client-platform-b.md › B1): Home's rows
// and its hero, a card's title and caption, the A–Z index's letters, the film page's picks of
// version, audio and subtitles, its quality and lead line, a person's header, Search's kinds and
// quick picks, a collection tile's label, the words after Mark as watched, and an announcement's
// tone. Until B1 each app and the prototype had its own copy (apps/web, the phone and TV apps,
// and design/prototypes/src/client). Pure functions, in i18n catalogs (ADR 0021).
import { createT, defineMessages } from '@highsea-tv/i18n'
import { createFormat } from '../format/index.ts'
import { letterOf, libraryMessages } from '../library/index.ts'
import { settingsPageMessages } from '../prefs/index.ts'

export const filmsMessages = defineMessages({
  new: 'New',
  play: 'Play',
  resume: 'Resume',
  episodeCaption: '{code} · {rest}',
  markUnwatched: 'Mark as unwatched',
  markedUnwatched: '{title} marked as unwatched',
  startsAgain: 'It plays from the start next time.',
  tileLabel: '{name}, {caption}',
  smartTileLabel: '{name}, smart collection, {caption}',
  smart: 'Smart',
  smartCollection: 'Smart collection',
  collection: 'Collection',
  searchField: 'Search titles, genres and people',
  searchPlaceholder: 'Titles, genres and people',
  searchMovies: 'Movies',
  searchCollections: 'Collections',
  searchPeople: 'People',
  off: 'Off',
  noAudio: 'No sound tracks',
})

// ---------------------------------------------------------------- Home

/** A Home row as the server sends it: built-in rows (`continue`, `recent`) have no title. */
export type Row<I> = { id: string; title: string | null; layout: string; items: I[] }

/** The hero: the first hero row with something in it (client-home.md). */
export const heroOf = <R extends Row<unknown>>(sections: R[]) =>
  sections.find((s) => s.layout === 'hero' && s.items.length > 0)

/** The rows under the hero, each with something in it, in the server's order. */
export const rowsOf = <R extends Row<unknown>>(sections: R[]) =>
  sections.filter((s) => s.layout !== 'hero' && s.items.length > 0)

/** A title added this lately says "New" on the first card of a spotlight (client-home.md). */
export const NEW_FOR_MS = 30 * 24 * 60 * 60 * 1000

/** Whether it's new at `now`: the caller passes the clock, so a seeded screen draws the same. */
export const isNew = (item: { addedAt: string }, now: number) =>
  now - Date.parse(item.addedAt) < NEW_FOR_MS

// ---------------------------------------------------------------- cards

/** What a card reads of a title: a film, or (once shows come) an episode with its show. */
export type Cardable = {
  title: string
  year: number | null
  runtimeMinutes: number | null
  position: number
  progress: number | null
  art: { poster: string | null; backdrop?: string | null; still?: string | null }
  show?: { title: string; code: string; episode?: string } | null
}

export type CardOptions = {
  /** Home's 16:9 card: the still (a film's backdrop) in place of the poster. */
  wide?: boolean
  /** Continue watching: the progress bar under the art and the time left. */
  resume?: boolean
}

// ---------------------------------------------------------------- the film page

/** The subtitle menu's Off, and the audio menu's when there's none. */
export const OFF = 'off'

type Track = { id: string; default?: boolean }
type Version = { id: string; label: string; detail: string | null; playable: boolean }
type Picks = { versionId: string | null; audioId: string | null; subtitleId: string | null }

/**
 * What plays: the version picked (or the first that plays), its audio picked (or its default),
 * and its subtitle picked (or none). A version's own tracks: picks for another don't carry over.
 */
export function picksOf<
  // the tracks' types come from the versions (V['audio'][number]); A and S stay for calls that name
  // all three, and are otherwise only their bounds
  A extends Track = Track,
  S extends Track = Track,
  V extends Version & { audio: A[]; subtitles: S[] } = Version & { audio: A[]; subtitles: S[] },
>(
  versions: V[],
  picks: Picks | null | undefined,
): {
  playable: V[]
  version: V | undefined
  audio: V['audio'][number] | undefined
  subtitle: V['subtitles'][number] | undefined
  audioValue: string
  subtitleValue: string
} {
  const playable = versions.filter((v) => v.playable)
  const version = playable.find((v) => v.id === picks?.versionId) ?? playable[0]
  const audio =
    version?.audio.find((a) => a.id === picks?.audioId) ?? version?.audio.find((a) => a.default)
  const subtitle = version?.subtitles.find((s) => s.id === picks?.subtitleId)
  return {
    playable,
    version,
    audio,
    subtitle,
    /** The menus' values: the audio's id (or the first, or Off) and the subtitle's (or Off). */
    audioValue: audio?.id ?? version?.audio[0]?.id ?? OFF,
    subtitleValue: subtitle?.id ?? OFF,
  }
}

/** A version's short name in a menu: "4K · HDR10" from its label and the last part of its detail. */
export const versionLabel = (v: Pick<Version, 'label' | 'detail'>) =>
  v.detail ? `${v.label} · ${v.detail.split(' · ').slice(-1)[0]}` : v.label

/** The qualities a film plays in, each once ("4K", "1080p"), for the tags by its title. */
export const qualitiesOf = (versions: Pick<Version, 'label' | 'playable'>[]) => [
  ...new Set(versions.filter((v) => v.playable).map((v) => v.label)),
]

// ---------------------------------------------------------------- a person

type PersonCredit = {
  id: number
  inLibrary: boolean
  rating: number
  art: { backdrop: string | null }
}

/** A person's films here, the best rated (whose art is the page's backdrop), and how many. */
export function personHeaderOf<C extends PersonCredit>(credits: C[]) {
  const films = credits.filter((c) => c.inLibrary)
  const best = [...films].sort((a, b) => b.rating - a.rating)[0]
  return { films, best, count: new Set(films.map((c) => c.id)).size }
}

// ---------------------------------------------------------------- Search

/** The kinds the films apps show, in the server's order of best match. */
export const SEARCH_KINDS = ['movies', 'collections', 'people'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

/** Quick picks for an empty search, as the prototype has them (design/prototypes/src/client/data.ts). */
export const SEARCH_SUGGESTIONS = [
  'Comedy',
  'Animation',
  'Science fiction',
  'Fritz Lang',
  'Saltmarsh',
  'Jazz',
  'Jan Morgenstern',
]

/** Whether the apps show a section of results: `discover` waits for requests. */
export const isShownKind = <S extends { kind: string }>(s: S): s is S & { kind: SearchKind } =>
  (SEARCH_KINDS as readonly string[]).includes(s.kind)

// ---------------------------------------------------------------- announcements

/** A banner's tone: a warning or worse is a warning; everything else an announcement. */
export const toneOf = (severity: string) =>
  severity === 'warning' || severity === 'critical'
    ? ('warning' as const)
    : ('announcement' as const)

// ---------------------------------------------------------------- words

export function createFilmsText(locale = 'en') {
  const t = createT(filmsMessages, locale)
  // the words other subpaths already have: Home's own rows (Settings › Home names them too) and
  // Mark as watched (Continue watching's menu)
  const library = createT(libraryMessages, locale)
  const settings = createT(settingsPageMessages, locale)
  const format = createFormat(locale)

  return {
    /** A row's name: the server's, or this app's for a built-in row. */
    rowTitle: (s: { id: string; title: string | null }) =>
      s.title ??
      (s.id === 'continue'
        ? settings('row.continue')
        : s.id === 'recent'
          ? settings('row.recent')
          : ''),

    /** A spotlight card's kicker: "New · 2010 · Fantasy", "New" only on the first and only lately. */
    kicker: (
      item: { addedAt: string; year: number | null; genres: string[] },
      first: boolean,
      now: number,
    ) =>
      [first && isNew(item, now) ? t('new') : null, item.year, item.genres[0]]
        .filter(Boolean)
        .join(' · '),

    /**
     * A card, the same on every app: the poster with the title and year under it, or Home's still;
     * on Continue watching the bar and the time left. An episode's card is its show and "S2, E6".
     */
    card(item: Cardable, { wide = false, resume = false }: CardOptions = {}) {
      const still = wide || resume
      const { show } = item
      const rest = resume && item.progress !== null ? format.left(item) : null
      const after = rest ?? show?.episode
      return {
        title: show ? show.title : item.title,
        src: still ? (item.art.still ?? item.art.backdrop ?? null) : item.art.poster,
        aspect: still ? ('still' as const) : ('poster' as const),
        caption: show
          ? after
            ? t('episodeCaption', { code: show.code, rest: after })
            : show.code
          : (rest ?? (item.year ? String(item.year) : '')),
        progress: resume ? (item.progress ?? 0) : null,
        progressBelow: resume,
      }
    },

    /** The page's lead line: "2012 · 12m". */
    leadOf: (item: { year: number | null; runtimeMinutes: number | null }) =>
      [item.year ? String(item.year) : '', format.runtime(item.runtimeMinutes)]
        .filter(Boolean)
        .join(' · '),

    /** The toggle's label, and the toast after it. */
    markWatched(item: { title: string; watched: boolean }) {
      const watched = !item.watched
      return {
        label: item.watched ? t('markUnwatched') : library('markWatched'),
        /** The words once it's done: `watched` is what it became. */
        toast: (became = watched) => ({
          title: became
            ? library('marked', { name: item.title })
            : t('markedUnwatched', { title: item.title }),
          description: became ? undefined : t('startsAgain'),
        }),
      }
    },

    /** A collection's tile, as a screen reader names it, and its kind's word. */
    /**
     * The server's own collections carry `smart`; its `words` are null for one picked by hand (no
     * rules, the contract's LibraryCollection). Only a collection with rules in words is drawn as
     * smart: the Smart badge and "smart collection" in its label. One picked by hand is drawn as
     * any other collection, with no badge.
     */
    tileOf(c: {
      name: string
      count: number
      years: string
      smart: { words: string | null } | null
    }) {
      const caption = format.caption(c)
      const smart = !!c.smart?.words
      return {
        caption,
        smart,
        label: t(smart ? 'smartTileLabel' : 'tileLabel', { name: c.name, caption }),
        badge: smart ? t('smart') : null,
        kind: smart ? t('smartCollection') : t('collection'),
      }
    },

    search: {
      field: t('searchField'),
      placeholder: t('searchPlaceholder'),
      kind: (k: SearchKind) =>
        k === 'movies'
          ? t('searchMovies')
          : k === 'collections'
            ? t('searchCollections')
            : t('searchPeople'),
    },

    /** The menus' words for Off and for a version with no sound. */
    off: t('off'),
    noAudio: t('noAudio'),
  }
}

export type FilmsText = ReturnType<typeof createFilmsText>

/** The A–Z index's letters present in a list sorted by title, and the first title of each. */
export function lettersOf<I extends { id: string | number; title: string }>(items: I[]) {
  const present = new Set(items.map((m) => letterOf(m.title)))
  const firsts = new Set<I['id']>()
  items.forEach((m, i) => {
    if (i === 0 || letterOf(items[i - 1]?.title ?? '') !== letterOf(m.title)) firsts.add(m.id)
  })
  return { present, firsts }
}
