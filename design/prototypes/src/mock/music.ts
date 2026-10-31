// SPDX-License-Identifier: AGPL-3.0-only
// The music library (Music on every client): artists and their albums. The Blender films' composers
// with their scores, beside invented artists across genres, so the library has a spread of A–Z,
// years, genres and album kinds. Cover art and photos are the fixtures' placeholders.
import { coverArt, portraitArt } from '@highsea-tv/fixtures'
import type {
  ClientAlbum,
  ClientAlbumDetail,
  ClientArtist,
  ClientArtistDetail,
  ClientMusic,
  ClientSong,
  DiscographyKind,
  QueuedSong,
} from './types.ts'

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

/** A short note for the artists that have one; the rest have none, as many do in MusicBrainz. */
const bios: Record<string, string> = {
  'jan-morgenstern':
    'Jan Morgenstern is a composer who scored the Blender Foundation’s open films Elephants Dream, Big Buck Bunny and Sintel, and the Caminandes shorts.',
  'joram-letwory':
    'Joram Letwory composed the score for Tears of Steel, the Blender Foundation’s 2012 open film.',
  'the-hollow-pines':
    'The Hollow Pines began as two siblings recording in a converted barn, with one microphone and whatever instruments were to hand. Their first album, Kindling, was made over a single winter and passed between friends before a small label picked it up. Field Notes added a rhythm section and a string trio, and A Quiet Year, recorded after a long break, returned to the barn and the one microphone. They tour rarely and play mostly in small rooms.',
  'marisol-vega':
    'Marisol Vega is a singer and pianist whose records move between jazz standards and her own soul songs, most of them cut live with her trio.',
  'aurora-fields':
    'Aurora Fields makes slow, warm ambient records from tape loops and field recordings.',
  'nocturne-michi': 'Nocturne Michi is a pianist known for her recordings of Chopin and Satie.',
}

/** A note for the albums that have one, as Apple Music's editors write them. */
const notes: Record<string, string> = {
  'the-hollow-pines-a-quiet-year':
    'Recorded back in the barn after five years away, with one microphone and the windows open.',
  'marisol-vega-live-at-the-corner-room':
    'Two nights with her trio in a forty-seat room, opening with the standards she starts every set with.',
  'jan-morgenstern-sintel-original-score':
    'Strings, choir and drums for a girl’s long search for the dragon she raised.',
}

/** The invented labels; scores share one. */
const labels = [
  'Harbour Light Records',
  'Low Bridge',
  'Quiet Field',
  'Northern Lantern',
  'Paper Moon',
]

const songWords = [
  'Morning Train',
  'Lanterns',
  'Salt and Iron',
  'Undertow',
  'Glass Houses',
  'Small Hours',
  'Halfway Home',
  'Static',
  'Cold Water',
  'The Long Field',
  'Paper Boats',
  'Ember',
  'Weather Report',
  'Brighter Now',
  'Old Roads',
  'Copper',
  'Slow Motion',
  'Harbour Lights',
  'Second Wind',
  'Echoes',
  'Driftwood',
  'Northern Line',
  'Afterglow',
  'Open Window',
  'Holding Pattern',
  'Wildflowers',
  'Satellites',
  'Night Bus',
  'Tidewater',
  'Common Ground',
  'Fault Lines',
  'Gold Leaf',
  'Low Sun',
  'Riverbend',
  'Headlights',
  'Quiet Rooms',
  'Porch Light',
  'Silver Thread',
  'Overpass',
  'Homecoming',
]
const cueWords = [
  'The Gate',
  'First Light',
  'A Long Way',
  'The Search',
  'Into the Woods',
  'Remembrance',
  'The Chase',
  'Rooftops',
  'Lost and Found',
  'The Storm',
  'Reunion',
  'Ascent',
  'The Last Stand',
  'Farewell',
  'Morning in the Meadow',
  'The Machine',
  'Nightfall',
  'Through the Ice',
  'The Market',
  'Embers',
  'The Climb',
  'Return',
]
const pieces = [
  'Nocturne in E-flat major, Op. 9 No. 2',
  'Nocturne in B-flat minor, Op. 9 No. 1',
  'Nocturne in B major, Op. 9 No. 3',
  'Nocturne in F major, Op. 15 No. 1',
  'Nocturne in F-sharp major, Op. 15 No. 2',
  'Nocturne in G minor, Op. 15 No. 3',
  'Nocturne in C-sharp minor, Op. 27 No. 1',
  'Nocturne in D-flat major, Op. 27 No. 2',
  'Nocturne in B major, Op. 32 No. 1',
  'Nocturne in A-flat major, Op. 32 No. 2',
  'Nocturne in G minor, Op. 37 No. 1',
  'Nocturne in G major, Op. 37 No. 2',
  'Nocturne in C minor, Op. 48 No. 1',
  'Nocturne in F-sharp minor, Op. 48 No. 2',
  'Nocturne in F minor, Op. 55 No. 1',
  'Nocturne in E-flat major, Op. 55 No. 2',
  'Nocturne in B major, Op. 62 No. 1',
  'Nocturne in E major, Op. 62 No. 2',
  'Nocturne in E minor, Op. 72 No. 1',
  'Nocturne in C-sharp minor, Op. posth.',
  'Nocturne in C minor, Op. posth.',
]

/** A number from a string that's the same every time, for songs that don't change between loads. */
function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

/** An album's songs: a single is its own title; an album has its title song third, as many do. */
function songsOf(a: ClientAlbum): ClientSong[] {
  const h = hash(a.id)
  const classical = a.genres.includes('Classical')
  const pool = classical
    ? a.title.startsWith('Satie')
      ? [
          'Gymnopédie No. 1',
          'Gymnopédie No. 2',
          'Gymnopédie No. 3',
          'Gnossienne No. 1',
          'Gnossienne No. 2',
          'Gnossienne No. 3',
        ]
      : pieces
    : a.kind === 'soundtrack'
      ? cueWords
      : songWords
  // a step that shares no factor with the pool's size, so no title comes round twice
  let step = 7
  while (pool.length % step === 0) step += 2
  return Array.from({ length: a.tracks }, (_, i) => {
    const own = a.kind === 'single' || (a.kind === 'album' && !classical && i === 2)
    // a score opens on its titles and closes on its credits
    const cue =
      a.kind === 'soundtrack' && i === 0
        ? 'Opening Titles'
        : a.kind === 'soundtrack' && i === a.tracks - 1
          ? 'End Credits'
          : null
    const title = own
      ? a.title
      : cue
        ? cue
        : classical
          ? (pool[i % pool.length] as string)
          : (pool[(h + i * step) % pool.length] as string)
    const spread = classical ? [150, 360] : a.kind === 'soundtrack' ? [70, 240] : [150, 300]
    const n = hash(`${a.id}:${i}`)
    return {
      id: `${a.id}-${i + 1}`,
      number: i + 1,
      title,
      duration: (spread[0] as number) + (n % ((spread[1] as number) - (spread[0] as number))),
    }
  })
}

/** How many loudness steps a track carries: enough for the widest scrubber's bars. */
export const LOUDNESS_STEPS = 160

/**
 * A song's loudness, the same on every load: a soft start, sections that rise and fall (a song's
 * verses and choruses, a cue's swells) and a fade at the end, with the grain of a real envelope.
 * Scores and classical pieces move more slowly and sit quieter.
 */
function loudnessOf(a: ClientAlbum, s: ClientSong): number[] {
  const h = hash(s.id)
  const calm =
    a.kind === 'soundtrack' || a.genres.includes('Classical') || a.genres.includes('Ambient')
  const sections = 3 + (h % 4)
  // a level per section, between quiet and loud
  const levels = Array.from({ length: sections }, (_, i) => {
    const n = hash(`${s.id}:section:${i}`)
    return (calm ? 0.3 : 0.55) + ((n % 1000) / 1000) * (calm ? 0.55 : 0.4)
  })
  return Array.from({ length: LOUDNESS_STEPS }, (_, i) => {
    const t = i / (LOUDNESS_STEPS - 1)
    // between sections the level eases from one to the next
    const at = t * (sections - 1)
    const k = Math.floor(at)
    const f = at - k
    const ease = f * f * (3 - 2 * f)
    const from = levels[k] as number
    const to = (levels[Math.min(k + 1, sections - 1)] as number) ?? from
    const level = from + (to - from) * ease
    const edge = Math.min(1, t / 0.04, (1 - t) / (calm ? 0.12 : 0.06))
    const grain = ((hash(`${s.id}:${i}`) % 1000) / 1000 - 0.5) * (calm ? 0.16 : 0.3)
    return Math.round(Math.max(0.06, Math.min(1, level * edge + grain)) * 100) / 100
  })
}

/**
 * What the player queues: an album's songs in order, or an artist's, newest album first;
 * shuffled, the same songs in an order that's the same every time for the prototype's reviews.
 */
export function queueOf(
  music: ClientMusic,
  source: { album: string } | { artist: string },
  shuffle: boolean,
): QueuedSong[] | null {
  const albums =
    'album' in source
      ? music.albums.filter((a) => a.id === source.album)
      : music.albums
          .filter((a) => a.artist.id === source.artist)
          .sort((a, b) => b.year - a.year || a.sortTitle.localeCompare(b.sortTitle))
  if (albums.length === 0) return null
  const tracks = albums.flatMap((album) =>
    songsOf(album).map((s) => ({ ...s, album, loudness: loudnessOf(album, s) })),
  )
  return shuffle ? tracks.sort((a, b) => hash(`shuffle:${a.id}`) - hash(`shuffle:${b.id}`)) : tracks
}

/** The film an album scores, by title: "Sintel (Original Score)" scores Sintel. */
export const scoreOf = (a: ClientAlbum) =>
  a.kind === 'soundtrack' ? a.title.replace(/\s*\(Original Score\)$/, '') : null

/** An album with its songs, release and label; the film is looked up by the server. */
export function albumDetail(
  music: ClientMusic,
  id: string,
): Omit<ClientAlbumDetail, 'film'> | null {
  const album = music.albums.find((a) => a.id === id)
  if (!album) return null
  const songs = songsOf(album)
  const h = hash(album.id)
  const month = String((h % 12) + 1).padStart(2, '0')
  const day = String((h % 27) + 1).padStart(2, '0')
  return {
    album,
    songs,
    duration: songs.reduce((t, s) => t + s.duration, 0),
    released: `${album.year}-${month}-${day}`,
    label:
      album.kind === 'soundtrack'
        ? 'Open Movie Records'
        : (labels[hash(album.artist.id) % labels.length] as string),
    about: notes[album.id] ?? null,
    more: music.albums
      .filter((a) => a.artist.id === album.artist.id && a.id !== album.id)
      .sort((a, b) => b.year - a.year),
  }
}

const groupOf: Record<ClientAlbum['kind'], DiscographyKind> = {
  album: 'albums',
  ep: 'singles',
  single: 'singles',
  soundtrack: 'soundtracks',
  compilation: 'compilations',
}

/** An artist with their albums by kind and those who share a genre; the person is the server's. */
export function artistDetail(
  music: ClientMusic,
  id: string,
): Omit<ClientArtistDetail, 'person'> | null {
  const artist = music.artists.find((a) => a.id === id)
  if (!artist) return null
  const albums = music.albums
    .filter((a) => a.artist.id === id)
    .sort((a, b) => b.year - a.year || a.sortTitle.localeCompare(b.sortTitle))
  const order: DiscographyKind[] = ['albums', 'singles', 'soundtracks', 'compilations']
  return {
    artist,
    bio: bios[id] ?? null,
    backdrop: (albums[0] as ClientAlbum).cover,
    songs: albums.reduce((t, a) => t + a.tracks, 0),
    sections: order.flatMap((kind) => {
      const shown = albums.filter((a) => groupOf[a.kind] === kind)
      return shown.length > 0 ? [{ kind, albums: shown }] : []
    }),
    // most genres in common first, then by name
    similar: music.artists
      .filter((a) => a.id !== id && a.genres.some((g) => artist.genres.includes(g)))
      .map((a) => ({ a, n: a.genres.filter((g) => artist.genres.includes(g)).length }))
      .sort((x, y) => y.n - x.n || x.a.sortName.localeCompare(y.a.sortName))
      .slice(0, 12)
      .map((x) => x.a),
  }
}
