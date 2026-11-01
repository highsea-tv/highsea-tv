// SPDX-License-Identifier: AGPL-3.0-only
// The shows library (Shows on every client): series with their seasons and episodes. Invented
// series across genres, as the music library's artists are, so the library has a spread of A–Z,
// years, lengths and season counts: a miniseries, long-running comedies, a show still airing, one
// with specials. Art is the fixtures' placeholders: a poster per show and per season, a still per
// episode. Each show's watch state is seeded so the pages have every case to show: caught up,
// part way through an episode, between seasons, and not started.
import { backdropArt, logoArt, portraitArt, posterArt, stillArt } from '@highsea-tv/fixtures'
import { personId } from './metadata.ts'
import type { ClientEpisode, ClientSeason, ClientShow, Credit } from './types.ts'

type Seed = {
  title: string
  genres: string[]
  /** First aired, and the last year for a show that has ended. */
  years: [number, number | null]
  /** Episodes in each season, from 1; a show with specials has them as season 0. */
  seasons: number[]
  specials?: number
  /** Minutes an episode runs, about. */
  runtime: number
  certification: string
  rating: number
  /** Days since it was added. */
  added: number
  synopsis: string
  /** Watched up to and including this episode, and the next one part way, if given. */
  watched?: [season: number, episode: number]
  partway?: number
  creators: string[]
  cast: [name: string, character: string][]
  /** Who wrote the score. */
  music?: string[]
}

const seeds: Seed[] = [
  {
    title: 'The Lantern Keepers',
    genres: ['Drama', 'Mystery'],
    years: [2019, null],
    seasons: [8, 8, 10],
    runtime: 52,
    certification: 'TV-14',
    rating: 4.4,
    added: 6,
    synopsis:
      'On a remote stretch of coast, the family who has kept its lighthouse for four generations finds that the light was never only for ships.',
    watched: [2, 5],
    partway: 0.42,
    creators: ['Hanna Lindqvist'],
    cast: [
      ['Mara Ellison', 'Wren Halloway'],
      ['Tobias Ferreira', 'Elias Halloway'],
      ['Halina Reijn', 'Margit Halloway'],
      ['June Okafor', 'Constable Ada Reyes'],
      ['Callum Price', 'Father Doyle'],
      ['Ines Marchetti', 'Rosalind Halloway'],
    ],
    music: ['Jan Morgenstern'],
  },
  {
    title: 'Saltmarsh',
    genres: ['Crime', 'Drama'],
    years: [2015, 2021],
    seasons: [6, 6, 6, 6],
    specials: 2,
    runtime: 58,
    certification: 'TV-MA',
    rating: 4.6,
    added: 120,
    synopsis:
      'A detective returns to the estuary town she left at eighteen to work the cases nobody else in the county will take.',
    watched: [4, 6],
    creators: ['Owen Hart', 'Priya Nair'],
    cast: [
      ['Helen Quayle', 'DI Ruth Calder'],
      ['Sam Adebayo', 'DS Tom Inglis'],
      ['Frances Mull', 'Maggie Calder'],
      ['Peter Lowe', 'Superintendent Royce'],
    ],
  },
  {
    title: 'Orbital',
    genres: ['Science fiction', 'Drama'],
    years: [2022, null],
    seasons: [10, 10],
    runtime: 47,
    certification: 'TV-14',
    rating: 4.2,
    added: 2,
    synopsis:
      'Six strangers wake aboard a station circling a planet none of them chose, with a year’s supplies and no word from home.',
    watched: [1, 10],
    creators: ['Daniel Kerr'],
    cast: [
      ['Aiko Tanaka', 'Commander Sato'],
      ['Liam Byrne', 'Dr. Felix Moreau'],
      ['Zara Haddad', 'Noor'],
      ['Ben Achterberg', 'Kaspar'],
      ['Grace Mbeki', 'Lena Ford'],
    ],
  },
  {
    title: 'Paper Kingdoms',
    genres: ['Comedy'],
    years: [2017, 2020],
    seasons: [12, 12, 12],
    runtime: 24,
    certification: 'TV-PG',
    rating: 3.9,
    added: 210,
    synopsis:
      'The staff of a struggling paper merchant keep the business, and each other, going one improbable order at a time.',
    creators: ['Ruth Abernathy'],
    cast: [
      ['Gareth Wynne', 'Martin Pell'],
      ['Sofia Ruiz', 'Dolores'],
      ['Ade Bankole', 'Kwame'],
      ['Lucy Thorne', 'Fiona'],
    ],
  },
  {
    title: 'Night Shift at Hollow Creek',
    genres: ['Comedy', 'Drama'],
    years: [2020, null],
    seasons: [10, 10, 4],
    runtime: 31,
    certification: 'TV-14',
    rating: 4.1,
    added: 1,
    synopsis:
      'In a small-town hospital after dark, the night staff handle whatever comes through the doors, and whatever they bring in with them.',
    watched: [2, 10],
    creators: ['Marcus Bell', 'Tamsin Rowe'],
    cast: [
      ['Nadia Petrova', 'Dr. Ivy Lang'],
      ['Joel Mensah', 'Nurse Theo Banks'],
      ['Eleanor Voss', 'Bernadette'],
      ['Ray Castillo', 'Hector'],
    ],
  },
  {
    title: 'Wildwater',
    genres: ['Documentary'],
    years: [2018, 2018],
    seasons: [6],
    runtime: 50,
    certification: 'TV-G',
    rating: 4.7,
    added: 340,
    synopsis:
      'A year on six of the world’s great rivers, from the glaciers that feed them to the deltas where they meet the sea.',
    creators: ['Imogen Clare'],
    cast: [['Imogen Clare', 'Narrator']],
  },
  {
    title: 'The Cartographers',
    genres: ['Animation', 'Adventure'],
    years: [2014, 2019],
    seasons: [13, 13, 13, 13, 13],
    runtime: 22,
    certification: 'TV-Y7',
    rating: 4.3,
    added: 400,
    synopsis:
      'Two young mapmakers and their grumpy airship chart the floating islands at the edge of the known world.',
    watched: [1, 4],
    creators: ['Lena Whitlock'],
    cast: [
      ['Poppy Sands', 'Juno (voice)'],
      ['Kit Harlan', 'Pip (voice)'],
      ['Morris Doyle', 'Captain Bramble (voice)'],
    ],
  },
  {
    title: 'Iron & Ivy',
    genres: ['Drama', 'History'],
    years: [2021, null],
    seasons: [8, 8],
    runtime: 61,
    certification: 'TV-MA',
    rating: 4.0,
    added: 30,
    synopsis:
      'Two families, one with a foundry and one with a fortune, are bound together as a northern town is remade by the railway.',
    creators: ['Thomas Greaves'],
    cast: [
      ['Catherine Bliss', 'Eliza Thorne'],
      ['Rupert Ash', 'Samuel Cray'],
      ['Annika Holm', 'Margaret Cray'],
      ['David Oyelaran', 'Josiah'],
    ],
  },
  {
    title: 'Ghost Signal',
    genres: ['Horror', 'Mystery'],
    years: [2023, null],
    seasons: [6],
    runtime: 43,
    certification: 'TV-MA',
    rating: 3.8,
    added: 12,
    synopsis:
      'A late-night radio host starts taking calls from listeners who all describe the same house, and the same knock at the door.',
    watched: [1, 2],
    partway: 0.7,
    creators: ['Felix Marsh', 'Colin Levy'],
    cast: [
      ['Rhys Calloway', 'Danny Vance'],
      ['Marisa Chen', 'Detective Lou Park'],
      ['Owen Fitch', 'The Caller'],
    ],
  },
  {
    title: 'Fathom',
    genres: ['Science fiction', 'Thriller'],
    years: [2016, 2018],
    seasons: [10, 10],
    runtime: 48,
    certification: 'TV-14',
    rating: 4.1,
    added: 160,
    synopsis:
      'The crew of a deep-sea research base lose contact with the surface the same night their sonar picks up something that answers.',
    creators: ['Erin Castellano'],
    cast: [
      ['Mateo Alves', 'Dr. Rafael Soto'],
      ['Kiri Tane', 'Hana'],
      ['Thom Hoffman', 'Commander Hale'],
      ['Gemma Lowry', 'Chief Ward'],
    ],
    music: ['Jan Morgenstern'],
  },
  {
    title: 'Small Town Radio',
    genres: ['Comedy'],
    years: [2012, 2016],
    seasons: [20, 22, 22, 22],
    runtime: 22,
    certification: 'TV-PG',
    rating: 4.2,
    added: 600,
    synopsis:
      'The only radio station in Pinewood Falls runs on one transmitter, two volunteers and a morning host who won’t retire.',
    watched: [4, 22],
    creators: ['Bill Dempsey'],
    cast: [
      ['Walter Greene', 'Harold Fisk'],
      ['Mina Park', 'Jess Alvarez'],
      ['Doug Fenwick', 'Earl'],
      ['Patty Moore', 'Marlene'],
    ],
  },
  {
    title: 'A Season of Bees',
    genres: ['Drama', 'Romance'],
    years: [2024, null],
    seasons: [8],
    runtime: 44,
    certification: 'TV-PG',
    rating: 3.7,
    added: 4,
    synopsis:
      'After her grandmother’s death, a city architect inherits a hillside of hives and a village that expects her to keep them.',
    creators: ['Clara Mendes'],
    cast: [
      ['Elena Vidal', 'Sofia Brandt'],
      ['Hugh Carver', 'Aled'],
      ['Moira Keane', 'Nan Brandt'],
    ],
  },
]

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** A title for A–Z: a leading "The" or "A" goes to the end, as Plex and the Apple TV app sort. */
const sortKey = (s: string) => s.replace(/^(the|a)\s+/i, '')

/** A number from a string that's the same every time, for episodes that don't change between loads. */
function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

const episodeTitles = [
  'The Long Way Round',
  'Low Tide',
  'What the Light Saw',
  'Old Debts',
  'A Door Left Open',
  'Harbour Lights',
  'The Visitor',
  'Under the Floorboards',
  'Small Mercies',
  'Crossing Over',
  'The Quiet Part',
  'Half a Map',
  'Second Chances',
  'Northbound',
  'The Last Ferry',
  'Paper Trail',
  'Cold Open',
  'Fair Weather',
  'What Remains',
  'The Inheritance',
  'Signal and Noise',
  'Night Visitors',
  'Homecoming',
  'Turning Tide',
  'Common Ground',
  'The Missing Hour',
  'Strangers',
  'Kindling',
  'A Fine Line',
  'Point of No Return',
  'Driftwood',
  'The Reckoning',
  'Open Water',
  'Leave the Light On',
  'Old Friends',
  'Fault Lines',
  'Breaking Ground',
  'The Ask',
  'Quiet Hours',
  'Everything Changes',
]

const summaries = [
  'An old friend comes back with a favour to ask, and saying yes costs more than anyone expected.',
  'A storm cuts the town off overnight, and the people stuck together have to talk at last.',
  'A letter that should have been sent years ago finally arrives.',
  'A small mistake at work turns into the week’s biggest problem.',
  'Someone who has been watching from the edges makes a choice that changes everything.',
  'A celebration goes ahead, though nobody is quite in the mood.',
  'A stranger arrives with answers to questions nobody has asked yet.',
  'Old rivals are forced to work together, and neither enjoys it.',
  'A promise made in the first season comes due.',
  'The truth about the night of the accident starts to come out.',
  'A quiet day off doesn’t stay quiet for long.',
  'A long-buried secret surfaces, and it isn’t the one everyone feared.',
  'Plans fall apart, and the new ones are better.',
  'A visit home turns into a reckoning with the past.',
  'Everyone has a different idea of what happened, and they can’t all be right.',
  'A decision is made that can’t be taken back.',
]

/** Dated weekly from a season's first episode, on the show's own weekday and month. */
const airedOn = (seed: Seed, season: number, episode: number) => {
  const h = hash(`${seed.title}:${season}`)
  const year = seed.years[0] + Math.max(0, season - 1)
  const start = Date.UTC(year, h % 9, 1 + (h % 20))
  return new Date(start + (episode - 1) * 7 * 86_400_000).toISOString().slice(0, 10)
}

/** A show's seeded watch state for one episode: watched, part way (seconds in), or neither. */
function seededWatch(seed: Seed, season: number, episode: number, runtime: number) {
  const [ws, we] = seed.watched ?? [0, 0]
  if (season === 0) return 0
  if (season < ws || (season === ws && episode <= we)) return runtime * 60
  const next = seed.seasons[ws - 1] === we ? [ws + 1, 1] : [ws, we + 1]
  if (seed.partway && season === next[0] && episode === next[1])
    return Math.round(runtime * 60 * seed.partway)
  return null
}

/** One episode, watch state left out: the server lays the person's own on it. */
export type EpisodeSeed = Omit<ClientEpisode, 'progress' | 'position' | 'watched'> & {
  /** Seconds watched in the seeded state, or null. */
  seeded: number | null
}

export type ShowSeed = {
  show: Omit<ClientShow, 'unwatched' | 'watched' | 'next'>
  seasons: (Omit<ClientSeason, 'episodes'> & { episodes: EpisodeSeed[] })[]
  cast: Credit[]
  creators: Credit[]
  /** The rest of the crew: who wrote the score. */
  crew: Credit[]
}

/** Every show and its episodes, or none on a server without shows. */
export function showsLibrary(kind: 'populated' | 'empty', now: number): ShowSeed[] {
  if (kind === 'empty') return []
  return seeds.map((seed) => {
    const id = slug(seed.title)
    const numbers = [...(seed.specials ? [0] : []), ...seed.seasons.map((_, i) => i + 1)]
    const seasons = numbers.map((n) => {
      const count = n === 0 ? (seed.specials ?? 0) : (seed.seasons[n - 1] as number)
      const episodes: EpisodeSeed[] = Array.from({ length: count }, (_, i) => {
        const e = i + 1
        const h = hash(`${id}:${n}:${e}`)
        // a pilot opens the first season; the rest take titles from the pool, none twice in a show
        const title =
          n === 1 && e === 1
            ? 'Pilot'
            : n === 0
              ? e === 1
                ? 'Christmas Special'
                : 'The Making Of'
              : (episodeTitles[(hash(id) + n * 17 + e * 7) % episodeTitles.length] as string)
        const runtime = seed.runtime - 3 + (h % 7)
        return {
          id: `${id}-s${n}e${e}`,
          show: id,
          season: n,
          number: e,
          title,
          synopsis: summaries[h % summaries.length] as string,
          runtimeMinutes: runtime,
          aired: n === 0 ? airedOn(seed, seed.seasons.length, 12 + e) : airedOn(seed, n, e),
          still: stillArt(`${seed.title} S${n}E${e}`),
          seeded: seededWatch(seed, n, e, runtime),
        }
      })
      return {
        number: n,
        title: n === 0 ? 'Specials' : `Season ${n}`,
        year: n === 0 ? null : seed.years[0] + n - 1,
        poster: posterArt(`${seed.title} ${n === 0 ? 'Specials' : `Season ${n}`}`),
        episodes,
      }
    })
    const all = seasons.flatMap((s) => (s.number === 0 ? [] : s.episodes))
    const person = (name: string, department: Credit['department']) => ({
      // the films' ids, so someone in both has one page with everything they're in
      personId: personId(name),
      name,
      photo: portraitArt(name),
      department,
    })
    return {
      show: {
        id,
        title: seed.title,
        sortTitle: sortKey(seed.title),
        year: seed.years[0],
        endYear: seed.years[1],
        genres: seed.genres,
        rating: seed.rating,
        certification: seed.certification,
        synopsis: seed.synopsis,
        runtimeMinutes: seed.runtime,
        seasons: seed.seasons.length,
        episodes: all.length,
        addedAt: new Date(now - seed.added * 86_400_000).toISOString(),
        art: {
          poster: posterArt(seed.title),
          backdrop: backdropArt(seed.title),
          logo: logoArt(seed.title),
        },
      },
      seasons,
      cast: seed.cast.map(([name, character]) => ({
        ...person(name, 'Acting'),
        character,
        job: null,
      })),
      creators: seed.creators.map((name) => ({
        ...person(name, 'Writing'),
        character: null,
        job: 'Creator',
      })),
      crew: (seed.music ?? []).map((name) => ({
        ...person(name, 'Sound'),
        character: null,
        job: 'Original Music Composer',
      })),
    }
  })
}
