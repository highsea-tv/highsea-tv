// SPDX-License-Identifier: AGPL-3.0-only
// The music library (Music on every client): artists and their albums. The Blender films' composers
// with their scores, beside invented artists across genres, so the library has a spread of A–Z,
// years, genres and album kinds. Cover art and photos are the fixtures' placeholders.
import { coverArt, portraitArt } from '@highsea-tv/fixtures'
import type { ClientAlbum, ClientArtist, ClientMusic } from './types.ts'

type Kind = ClientAlbum['kind']
type Seed = {
  name: string
  genres: string[]
  /** Title, year, tracks, kind (album when left out), days since it was added. */
  albums: [string, number, number, Kind | null, number][]
}

const seeds: Seed[] = [
  {
    name: 'Jan Morgenstern',
    genres: ['Soundtrack'],
    albums: [
      ['Sintel (Original Score)', 2010, 14, 'soundtrack', 40],
      ['Big Buck Bunny (Original Score)', 2008, 9, 'soundtrack', 40],
      ['Elephants Dream (Original Score)', 2006, 11, 'soundtrack', 41],
      ['Caminandes', 2016, 6, 'soundtrack', 90],
    ],
  },
  {
    name: 'Joram Letwory',
    genres: ['Soundtrack'],
    albums: [['Tears of Steel (Original Score)', 2012, 8, 'soundtrack', 40]],
  },
  {
    name: 'Aurora Fields',
    genres: ['Ambient', 'Electronic'],
    albums: [
      ['Low Tide Hours', 2019, 9, null, 12],
      ['Paper Lanterns', 2021, 10, null, 12],
      ['Northern Glass', 2024, 7, 'ep', 3],
    ],
  },
  {
    name: 'The Hollow Pines',
    genres: ['Folk', 'Indie'],
    albums: [
      ['Kindling', 2014, 11, null, 220],
      ['Field Notes', 2017, 12, null, 220],
      ['A Quiet Year', 2022, 10, null, 18],
    ],
  },
  {
    name: 'Marisol Vega',
    genres: ['Jazz', 'Soul'],
    albums: [
      ['Blue Hour Sessions', 2016, 8, null, 64],
      ['Late Light', 2020, 9, null, 64],
      ['Live at the Corner Room', 2023, 12, null, 5],
    ],
  },
  {
    name: 'Ferrous Loom',
    genres: ['Electronic'],
    albums: [
      ['Machine Weather', 2018, 10, null, 130],
      ['Signal / Noise', 2019, 4, 'ep', 130],
      ['Copper Garden', 2023, 11, null, 9],
    ],
  },
  {
    name: 'Cinder & Ash',
    genres: ['Rock'],
    albums: [
      ['Slow Burn', 2011, 12, null, 300],
      ['Ember Days', 2015, 11, null, 300],
    ],
  },
  {
    name: 'Kestrel & Vane',
    genres: ['Indie', 'Rock'],
    albums: [
      ['Weathervane', 2018, 10, null, 75],
      ['Open Country', 2021, 1, 'single', 75],
    ],
  },
  {
    name: 'Mara Lune',
    genres: ['Pop', 'Electronic'],
    albums: [
      ['Moonlit Streets', 2020, 12, null, 30],
      ['Satellite Heart', 2022, 11, null, 30],
      ['Gravity', 2024, 1, 'single', 1],
    ],
  },
  {
    name: 'Ivory Kettle',
    genres: ['Jazz'],
    albums: [['Steeped', 2013, 9, null, 400]],
  },
  {
    name: 'Halcyon Freight',
    genres: ['Hip-hop'],
    albums: [
      ['Long Haul', 2017, 15, null, 150],
      ['Cargo', 2020, 14, null, 150],
    ],
  },
  {
    name: 'Juniper Wide',
    genres: ['Folk'],
    albums: [
      ['Juniper Wide', 2012, 10, null, 500],
      ['Hollow Bones', 2016, 9, null, 500],
      ['Rivers Run North', 2025, 11, null, 2],
    ],
  },
  {
    name: 'Nocturne Michi',
    genres: ['Classical'],
    albums: [
      ['Chopin: Nocturnes', 2015, 21, null, 180],
      ['Satie: Gymnopédies', 2018, 6, 'ep', 180],
    ],
  },
  {
    name: 'Corvid Line',
    genres: ['Electronic', 'Ambient'],
    albums: [['Murmuration', 2021, 8, null, 45]],
  },
  {
    name: '8 Bit Harbour',
    genres: ['Electronic'],
    albums: [['Pixel Tides', 2019, 12, null, 260]],
  },
  {
    name: 'The Marble Rooms',
    genres: ['Rock', 'Indie'],
    albums: [
      ['Hallways', 2010, 11, null, 360],
      ['Echo Chamber', 2013, 12, null, 360],
      ['Rooms (B-sides)', 2019, 16, 'compilation', 360],
    ],
  },
  {
    name: 'Ollie Ward',
    genres: ['Soul', 'Pop'],
    albums: [['Sunday Kitchen', 2022, 10, null, 14]],
  },
]

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** The name or title for A–Z: a leading "The" or "A" goes to the end, as Plex and Apple Music sort. */
export const sortKey = (s: string) => s.replace(/^(the|a)\s+/i, '')

/** The music library: every artist and album, or none on a server without music. */
export function musicLibrary(kind: 'populated' | 'empty', now: number): ClientMusic {
  if (kind === 'empty') return { artists: [], albums: [] }
  const day = 86_400_000
  const added = (days: number) => new Date(now - days * day).toISOString()
  const albums: ClientAlbum[] = []
  const artists: ClientArtist[] = seeds.map((a) => {
    const id = slug(a.name)
    for (const [title, year, tracks, kind, days] of a.albums)
      albums.push({
        id: slug(`${a.name} ${title}`),
        title,
        sortTitle: sortKey(title),
        artist: { id, name: a.name },
        year,
        cover: coverArt(`${a.name} ${title}`),
        genres: a.genres,
        tracks,
        kind: kind ?? 'album',
        addedAt: added(days),
      })
    return {
      id,
      name: a.name,
      sortName: sortKey(a.name),
      photo: portraitArt(a.name),
      albums: a.albums.length,
      genres: a.genres,
      addedAt: added(Math.min(...a.albums.map((x) => x[4]))),
    }
  })
  return { artists, albums }
}
