// SPDX-License-Identifier: AGPL-3.0-only
// What the film page says about a title, the same on web, desktop, the phone and the TV
// (client-detail.md): the people by name and role, the trailer to offer, the facts for the
// Information card and the languages for Languages and quality.
import type {
  ClientDetail,
  ClientPerson,
  ClientTrack,
  Credit,
  Department,
  Video,
} from '../mock/types.ts'
import { runtime } from './data.ts'

export const names = (people: Credit[]) => people.map((x) => x.name).join(', ')

/** "2:04". */
export const videoLength = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
const languageName = (code: string) => languageNames.of(code) ?? code

/** A crew member's job as the page names it: plainer than TMDB's titles. */
const roles: Record<string, string> = {
  Screenplay: 'Writer',
  'Original Music Composer': 'Music',
  'Director of Photography': 'Cinematography',
}
export const role = (c: Credit) => c.character ?? (c.job ? (roles[c.job] ?? c.job) : '')

/** A person's roles in one film, as the page names them ("Director, Writer"). */
export const roleNames = (joined: string) =>
  joined
    .split(', ')
    .map((x) => roles[x] ?? x)
    .join(', ')

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/** Each department's row on a person's page, named by what they did. */
export const departmentTitle: Record<Department, string> = {
  Acting: 'Acting',
  Directing: 'Directing',
  Writing: 'Writing',
  Production: 'Producing',
  Sound: 'Music and sound',
  Camera: 'Cinematography',
  Editing: 'Editing',
}

/** "Born 4 October 1895 in Piqua, Kansas, USA · Died 1 February 1966", as much as is known. */
export function lifeOf(p: ClientPerson): string | null {
  const parts = [
    p.born && `Born ${longDate(p.born.date)}${p.born.place ? ` in ${p.born.place}` : ''}`,
    p.died && `Died ${longDate(p.died.date)}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** The trailer the page's Trailer button plays: the first trailer, or a teaser before release. */
export const previewOf = (d: ClientDetail): Video | undefined =>
  d.videos.find((x) => x.kind === 'Trailer' || x.kind === 'Teaser')

/** Cast and crew in one row: the cast in billing order, the directors, then the rest of the crew. */
export const peopleOf = (d: ClientDetail): Credit[] => [
  ...d.cast,
  ...d.directors,
  ...d.crew.filter((c) => !d.directors.some((x) => x.personId === c.personId)),
]

export type Fact = [label: string, value: string]

/** Information: when, how long, the rating, the genres and who made it. */
export function informationOf(d: ClientDetail): Fact[] {
  const m = d.item
  const writers = d.crew.filter((c) => c.job === 'Screenplay')
  const facts: (Fact | false)[] = [
    ['Released', longDate(m.releaseDate)],
    ['Runtime', runtime(m.runtimeMinutes)],
    ['Rated', d.certification ?? 'Not rated'],
    ['Genres', m.genres.join(', ')],
    d.directors.length > 0 && ['Directed by', names(d.directors)],
    writers.length > 0 && ['Written by', names(writers)],
    d.studios.length > 0 && ['Studio', d.studios.join(', ')],
    d.originalTitle !== m.title && ['Original title', d.originalTitle],
  ]
  return facts.filter((x) => x !== false)
}

/** Languages and quality: each language once, by name, whichever versions it comes in. */
export function languagesOf(d: ClientDetail): Fact[] {
  const spoken = (tracks: ClientTrack[]) =>
    [...new Set(tracks.map((t) => languageName(t.language)))].join(', ')
  return [
    ['Versions', d.versions.map((v) => v.label).join(', ')],
    ['Audio', spoken(d.versions.flatMap((v) => v.audio)) || 'None listed'],
    ['Subtitles', spoken(d.versions.flatMap((v) => v.subtitles)) || 'None'],
  ]
}
