// SPDX-License-Identifier: AGPL-3.0-only
// The metadata source (TMDB simulation) behind the media pages (docs/product/media-pages.md):
// credits, studios, trailers and collections for every title the mock knows, people built from
// those credits, and recommendations from shared people and genres. Titles are looked up by media
// id. Credits are the films' real ones; the ids (TMDB, IMDb, Wikidata) and trailer keys are made up.
import { portraitArt, stillArt } from '@highsea/fixtures'
import { iso } from './clock.ts'
import type { ServerState } from './seed.ts'
import type {
  Collection,
  Credit,
  Department,
  DiscoverMovie,
  MovieMetadata,
  Person,
  PersonCredit,
  Video,
} from './types.ts'

type Entry = {
  directors: string[]
  writers?: string[]
  producers?: string[]
  music?: string[]
  camera?: string[]
  editors?: string[]
  /** [name, character], in billing order. */
  cast?: [string, string][]
  studios: string[]
  /** [original title, ISO 639-1]; default the title, English. */
  original?: [string, string]
  certification?: string
  tagline?: string
  budget?: number
  revenue?: number
  collection?: string
}

/**
 * Composers, cinematographers and editors, the films' real ones, kept apart from `entries` so each
 * entry stays short. Merged into the entry's own lists.
 */
const moreCrew: Record<string, Pick<Entry, 'music' | 'camera' | 'editors'>> = {
  Spring: { music: ['Dan Levy'] },
  'Tears of Steel': { music: ['Joram Letwory'] },
  'Caminandes: Llama Drama': { music: ['Jan Morgenstern'] },
  'Caminandes: Gran Dillama': { music: ['Jan Morgenstern'] },
  'Caminandes: Llamigos': { music: ['Jan Morgenstern'] },
  Nosferatu: { music: ['Hans Erdmann'] },
  'The Cabinet of Dr. Caligari': { camera: ['Willy Hameister'] },
  'The General': { camera: ['Dev Jennings', 'Bert Haines'] },
  'Sherlock Jr.': { camera: ['Elgin Lessley', 'Byron Houck'] },
  'The Kid': { music: ['Charlie Chaplin'], camera: ['Roland Totheroh'] },
  'The Gold Rush': { music: ['Charlie Chaplin'], camera: ['Roland Totheroh'] },
  Metropolis: { music: ['Gottfried Huppertz'], camera: ['Karl Freund', 'Günther Rittau'] },
  'Battleship Potemkin': {
    music: ['Edmund Meisel'],
    camera: ['Eduard Tisse'],
    editors: ['Sergei Eisenstein'],
  },
  'Night of the Living Dead': { camera: ['George A. Romero'], editors: ['George A. Romero'] },
  'Dawn of the Dead': {
    music: ['Goblin'],
    camera: ['Michael Gornick'],
    editors: ['George A. Romero'],
  },
  'Day of the Dead': {
    music: ['John Harrison'],
    camera: ['Michael Gornick'],
    editors: ['Pasquale Buba'],
  },
  'His Girl Friday': { camera: ['Joseph Walker'], editors: ['Gene Havlick'] },
  Charade: { camera: ['Charles Lang'], editors: ['James B. Clark'] },
  Detour: { music: ['Leo Erdody'], editors: ['George McGuire'] },
  'D.O.A.': { music: ['Dimitri Tiomkin'], camera: ['Ernest Laszlo'] },
  'Carnival of Souls': { music: ['Gene Moore'] },
  'The Little Shop of Horrors': { music: ['Fred Katz'] },
  'Plan 9 from Outer Space': { editors: ['Ed Wood'] },
  'The Last Man on Earth': { music: ['Paul Sawtell', 'Bert Shefter'] },
  'Royal Wedding': { camera: ['Robert Planck'] },
  'The Hitch-Hiker': { music: ['Leith Stevens'], camera: ['Nicholas Musuraca'] },
  'Dementia 13': { music: ['Ronald Stein'] },
  'Meet John Doe': { music: ['Dimitri Tiomkin'], camera: ['George Barnes'] },
  'Scarlet Street': { music: ['Hans J. Salter'], camera: ['Milton Krasner'] },
  'The Stranger': { music: ['Bronislau Kaper'], camera: ['Russell Metty'] },
}

const blender = ['Blender Studio']
const ton = ['Ton Roosendaal']

const entries: Record<string, Entry> = {
  Sintel: {
    directors: ['Colin Levy'],
    writers: ['Esther Wouda'],
    producers: ton,
    music: ['Jan Morgenstern'],
    cast: [
      ['Halina Reijn', 'Sintel'],
      ['Thom Hoffman', 'Shaman'],
    ],
    studios: blender,
  },
  Spring: { directors: ['Andy Goralczyk'], producers: ton, studios: blender },
  'Cosmos Laundromat': {
    directors: ['Mathieu Auvray'],
    producers: ton,
    cast: [
      ['Pierre Bokma', 'Victor'],
      ['Reinout Scholten van Aschat', 'Franck'],
    ],
    studios: blender,
  },
  'Tears of Steel': {
    directors: ['Ian Hubert'],
    writers: ['Ian Hubert'],
    producers: ton,
    cast: [
      ['Derek de Lint', 'Old Thom'],
      ['Sergio Hasselbaink', 'Captain'],
      ['Rogier Schippers', 'Thom'],
      ['Vanja Rukavina', 'Barley'],
      ['Denise Rebergen', 'Celia'],
    ],
    studios: blender,
  },
  'Big Buck Bunny': {
    directors: ['Sacha Goedegebure'],
    producers: ton,
    music: ['Jan Morgenstern'],
    studios: blender,
  },
  'Agent 327': {
    directors: ['Colin Levy', 'Hjalti Hjálmarsson'],
    producers: ton,
    studios: blender,
  },
  'Agent 327: Operation Barbershop': {
    directors: ['Colin Levy', 'Hjalti Hjálmarsson'],
    producers: ton,
    studios: blender,
  },
  'Sprite Fright': {
    directors: ['Matthew Luhn', 'Hjalti Hjálmarsson'],
    producers: ton,
    studios: blender,
  },
  Charge: { directors: ['Hjalti Hjálmarsson'], producers: ton, studios: blender },
  'Elephants Dream': {
    directors: ['Bassam Kurdali'],
    producers: ton,
    music: ['Jan Morgenstern'],
    cast: [
      ['Tygo Gernandt', 'Proog'],
      ['Cas Jansen', 'Emo'],
    ],
    studios: blender,
  },
  'Wing It!': { directors: ['Rik Schutte'], producers: ton, studios: blender },
  'Caminandes: Llama Drama': {
    directors: ['Pablo Vazquez'],
    studios: blender,
    collection: 'caminandes',
  },
  'Caminandes: Gran Dillama': {
    directors: ['Pablo Vazquez'],
    studios: blender,
    collection: 'caminandes',
  },
  'Caminandes: Llamigos': {
    directors: ['Pablo Vazquez'],
    studios: blender,
    // a llama and a penguin, and no words: TMDB's "no linguistic content"
    original: ['Caminandes: Llamigos', 'zxx'],
    collection: 'caminandes',
  },
  'Glass Half': { directors: ['Beorn Leonard'], studios: blender },
  'The Daily Dweebs': { directors: [], studios: blender },
  Hero: { directors: ['Daniel Martínez Lara'], studios: blender },
  'Coffee Run': { directors: ['Hjalti Hjálmarsson'], producers: ton, studios: blender },
  'Sita Sings the Blues': {
    directors: ['Nina Paley'],
    writers: ['Nina Paley'],
    producers: ['Nina Paley'],
    cast: [
      ['Annette Hanshaw', 'Sita (singing voice)'],
      ['Reena Shah', 'Sita (voice)'],
    ],
    studios: ['Nina Paley'],
  },
  Nosferatu: {
    directors: ['F. W. Murnau'],
    writers: ['Henrik Galeen'],
    camera: ['Fritz Arno Wagner'],
    cast: [
      ['Max Schreck', 'Count Orlok'],
      ['Gustav von Wangenheim', 'Thomas Hutter'],
      ['Greta Schröder', 'Ellen Hutter'],
    ],
    studios: ['Prana Film'],
    original: ['Nosferatu, eine Symphonie des Grauens', 'de'],
  },
  'The Cabinet of Dr. Caligari': {
    directors: ['Robert Wiene'],
    writers: ['Hans Janowitz', 'Carl Mayer'],
    producers: ['Erich Pommer'],
    cast: [
      ['Werner Krauss', 'Dr. Caligari'],
      ['Conrad Veidt', 'Cesare'],
      ['Lil Dagover', 'Jane'],
    ],
    studios: ['Decla-Bioscop'],
    original: ['Das Cabinet des Dr. Caligari', 'de'],
  },
  'A Trip to the Moon': {
    directors: ['Georges Méliès'],
    writers: ['Georges Méliès'],
    cast: [
      ['Georges Méliès', 'Professor Barbenfouillis'],
      ['Bleuette Bernon', 'Phoebe'],
    ],
    studios: ['Star Film'],
    original: ['Le Voyage dans la Lune', 'fr'],
  },
  'The General': {
    directors: ['Clyde Bruckman', 'Buster Keaton'],
    cast: [
      ['Buster Keaton', 'Johnnie Gray'],
      ['Marion Mack', 'Annabelle Lee'],
    ],
    studios: ['Buster Keaton Productions'],
  },
  'Sherlock Jr.': {
    directors: ['Buster Keaton'],
    cast: [
      ['Buster Keaton', 'Projectionist'],
      ['Kathryn McGuire', 'The Girl'],
    ],
    studios: ['Buster Keaton Productions'],
  },
  'Safety Last!': {
    directors: ['Fred C. Newmeyer', 'Sam Taylor'],
    producers: ['Hal Roach'],
    cast: [
      ['Harold Lloyd', 'The Boy'],
      ['Mildred Davis', 'The Girl'],
    ],
    studios: ['Hal Roach Studios'],
  },
  'The Kid': {
    directors: ['Charlie Chaplin'],
    writers: ['Charlie Chaplin'],
    producers: ['Charlie Chaplin'],
    cast: [
      ['Charlie Chaplin', 'The Tramp'],
      ['Jackie Coogan', 'The Kid'],
      ['Edna Purviance', 'The Woman'],
    ],
    studios: ['Charles Chaplin Productions'],
  },
  'The Gold Rush': {
    directors: ['Charlie Chaplin'],
    writers: ['Charlie Chaplin'],
    producers: ['Charlie Chaplin'],
    cast: [
      ['Charlie Chaplin', 'The Lone Prospector'],
      ['Georgia Hale', 'Georgia'],
      ['Mack Swain', 'Big Jim McKay'],
    ],
    studios: ['Charles Chaplin Productions'],
  },
  'The Phantom of the Opera': {
    directors: ['Rupert Julian'],
    cast: [
      ['Lon Chaney', 'The Phantom'],
      ['Mary Philbin', 'Christine Daaé'],
      ['Norman Kerry', 'Raoul de Chagny'],
    ],
    studios: ['Universal Pictures'],
  },
  Metropolis: {
    directors: ['Fritz Lang'],
    writers: ['Thea von Harbou', 'Fritz Lang'],
    producers: ['Erich Pommer'],
    cast: [
      ['Brigitte Helm', 'Maria'],
      ['Gustav Fröhlich', 'Freder'],
      ['Alfred Abel', 'Joh Fredersen'],
      ['Rudolf Klein-Rogge', 'Rotwang'],
    ],
    studios: ['UFA'],
    original: ['Metropolis', 'de'],
  },
  'Battleship Potemkin': {
    directors: ['Sergei Eisenstein'],
    writers: ['Nina Agadzhanova'],
    cast: [
      ['Aleksandr Antonov', 'Grigory Vakulinchuk'],
      ['Vladimir Barsky', 'Commander Golikov'],
    ],
    studios: ['Goskino'],
    original: ['Броненосец «Потёмкин»', 'ru'],
  },
  'Night of the Living Dead': {
    directors: ['George A. Romero'],
    writers: ['John A. Russo', 'George A. Romero'],
    cast: [
      ['Duane Jones', 'Ben'],
      ['Judith O’Dea', 'Barbra'],
      ['Karl Hardman', 'Harry Cooper'],
    ],
    studios: ['Image Ten'],
    tagline: 'They won’t stay dead!',
    budget: 114_000,
    revenue: 30_000_000,
    collection: 'living-dead',
  },
  'Dawn of the Dead': {
    directors: ['George A. Romero'],
    writers: ['George A. Romero'],
    producers: ['Richard P. Rubinstein'],
    cast: [
      ['David Emge', 'Stephen'],
      ['Ken Foree', 'Peter'],
      ['Scott H. Reiniger', 'Roger'],
      ['Gaylen Ross', 'Francine'],
    ],
    studios: ['Laurel Group'],
    tagline: 'When there’s no more room in hell, the dead will walk the earth.',
    collection: 'living-dead',
  },
  'Day of the Dead': {
    directors: ['George A. Romero'],
    writers: ['George A. Romero'],
    producers: ['Richard P. Rubinstein'],
    cast: [
      ['Lori Cardille', 'Sarah'],
      ['Terry Alexander', 'John'],
      ['Joseph Pilato', 'Captain Rhodes'],
    ],
    studios: ['Laurel Entertainment'],
    collection: 'living-dead',
  },
  'His Girl Friday': {
    directors: ['Howard Hawks'],
    writers: ['Charles Lederer'],
    cast: [
      ['Cary Grant', 'Walter Burns'],
      ['Rosalind Russell', 'Hildy Johnson'],
      ['Ralph Bellamy', 'Bruce Baldwin'],
    ],
    studios: ['Columbia Pictures'],
  },
  Charade: {
    directors: ['Stanley Donen'],
    writers: ['Peter Stone'],
    music: ['Henry Mancini'],
    cast: [
      ['Cary Grant', 'Peter Joshua'],
      ['Audrey Hepburn', 'Regina Lampert'],
      ['Walter Matthau', 'Hamilton Bartholomew'],
      ['James Coburn', 'Tex Panthollow'],
    ],
    studios: ['Universal Pictures'],
  },
  Detour: {
    directors: ['Edgar G. Ulmer'],
    writers: ['Martin Goldsmith'],
    cast: [
      ['Tom Neal', 'Al Roberts'],
      ['Ann Savage', 'Vera'],
    ],
    studios: ['Producers Releasing Corporation'],
  },
  'D.O.A.': {
    directors: ['Rudolph Maté'],
    writers: ['Russell Rouse', 'Clarence Greene'],
    cast: [
      ['Edmond O’Brien', 'Frank Bigelow'],
      ['Pamela Britton', 'Paula Gibson'],
    ],
    studios: ['Cardinal Pictures'],
  },
  'Carnival of Souls': {
    directors: ['Herk Harvey'],
    writers: ['John Clifford'],
    cast: [
      ['Candace Hilligoss', 'Mary Henry'],
      ['Herk Harvey', 'The Man'],
    ],
    studios: ['Harcourt Productions'],
  },
  'The Little Shop of Horrors': {
    directors: ['Roger Corman'],
    writers: ['Charles B. Griffith'],
    producers: ['Roger Corman'],
    cast: [
      ['Jonathan Haze', 'Seymour Krelboyne'],
      ['Jackie Joseph', 'Audrey Fulquard'],
      ['Jack Nicholson', 'Wilbur Force'],
    ],
    studios: ['Santa Clara Productions'],
  },
  'Plan 9 from Outer Space': {
    directors: ['Ed Wood'],
    writers: ['Ed Wood'],
    producers: ['Ed Wood'],
    cast: [
      ['Bela Lugosi', 'Ghoul Man'],
      ['Vampira', 'Vampire Girl'],
      ['Tor Johnson', 'Inspector Clay'],
    ],
    studios: ['Reynolds Pictures'],
    tagline: 'Unspeakable horrors from outer space paralyze the living and resurrect the dead!',
    budget: 60_000,
  },
  'The Last Man on Earth': {
    directors: ['Ubaldo Ragona', 'Sidney Salkow'],
    writers: ['Richard Matheson', 'William Leicester'],
    cast: [
      ['Vincent Price', 'Dr. Robert Morgan'],
      ['Franca Bettoia', 'Ruth Collins'],
    ],
    studios: ['Associated Producers'],
  },
  'Royal Wedding': {
    directors: ['Stanley Donen'],
    writers: ['Alan Jay Lerner'],
    music: ['Burton Lane'],
    cast: [
      ['Fred Astaire', 'Tom Bowen'],
      ['Jane Powell', 'Ellen Bowen'],
      ['Peter Lawford', 'Lord John Brindale'],
    ],
    studios: ['Metro-Goldwyn-Mayer'],
  },
  'The Hitch-Hiker': {
    directors: ['Ida Lupino'],
    writers: ['Collier Young', 'Ida Lupino'],
    cast: [
      ['Edmond O’Brien', 'Roy Collins'],
      ['Frank Lovejoy', 'Gilbert Bowen'],
      ['William Talman', 'Emmett Myers'],
    ],
    studios: ['The Filmakers'],
  },
  'Nanook of the North': {
    directors: ['Robert J. Flaherty'],
    writers: ['Robert J. Flaherty'],
    camera: ['Robert J. Flaherty'],
    cast: [['Allakariallak', 'Nanook']],
    studios: ['Les Frères Revillon'],
  },
  'The Lost World': {
    directors: ['Harry O. Hoyt'],
    writers: ['Marion Fairfax'],
    cast: [
      ['Wallace Beery', 'Professor Challenger'],
      ['Bessie Love', 'Paula White'],
      ['Lewis Stone', 'Sir John Roxton'],
    ],
    studios: ['First National Pictures'],
  },
  'The Great Train Robbery': {
    directors: ['Edwin S. Porter'],
    camera: ['Edwin S. Porter'],
    cast: [
      ['Justus D. Barnes', 'Bandit'],
      ['Broncho Billy Anderson', 'Bandit'],
    ],
    studios: ['Edison Manufacturing Company'],
  },
  'Dementia 13': {
    directors: ['Francis Ford Coppola'],
    writers: ['Francis Ford Coppola'],
    producers: ['Roger Corman'],
    cast: [
      ['William Campbell', 'Richard Haloran'],
      ['Luana Anders', 'Louise Haloran'],
      ['Patrick Magee', 'Justin Caleb'],
    ],
    studios: ['Filmgroup'],
  },
  'Meet John Doe': {
    directors: ['Frank Capra'],
    writers: ['Robert Riskin'],
    cast: [
      ['Gary Cooper', 'John Willoughby'],
      ['Barbara Stanwyck', 'Ann Mitchell'],
      ['Edward Arnold', 'D. B. Norton'],
    ],
    studios: ['Frank Capra Productions'],
  },
  'Scarlet Street': {
    directors: ['Fritz Lang'],
    writers: ['Dudley Nichols'],
    cast: [
      ['Edward G. Robinson', 'Christopher Cross'],
      ['Joan Bennett', 'Kitty March'],
      ['Dan Duryea', 'Johnny Prince'],
    ],
    studios: ['Diana Productions'],
  },
  'The Stranger': {
    directors: ['Orson Welles'],
    writers: ['Anthony Veiller'],
    cast: [
      ['Edward G. Robinson', 'Mr. Wilson'],
      ['Loretta Young', 'Mary Longstreet'],
      ['Orson Welles', 'Franz Kindler'],
    ],
    studios: ['International Pictures'],
  },
  'The Last Time I Saw Paris': {
    directors: ['Richard Brooks'],
    writers: ['Julius J. Epstein', 'Philip G. Epstein', 'Richard Brooks'],
    cast: [
      ['Elizabeth Taylor', 'Helen Ellswirth'],
      ['Van Johnson', 'Charles Wills'],
      ['Walter Pidgeon', 'James Ellswirth'],
      ['Donna Reed', 'Marion Ellswirth'],
    ],
    studios: ['Metro-Goldwyn-Mayer'],
  },
}

/** Editions the library tracks under their own titles, credited like the original. */
const aliases: Record<string, string> = {
  'Wing It! Director’s Cut': 'Wing It!',
  'Sprite Fright Extended': 'Sprite Fright',
}

const collections: Record<string, { name: string; overview: string; titles: string[] }> = {
  caminandes: {
    name: 'Caminandes Collection',
    overview: 'Koro the llama against everything Patagonia puts between him and the grass.',
    titles: ['Caminandes: Llama Drama', 'Caminandes: Gran Dillama', 'Caminandes: Llamigos'],
  },
  'living-dead': {
    name: 'Night of the Living Dead Collection',
    overview: 'George A. Romero’s films of the living dead.',
    titles: ['Night of the Living Dead', 'Dawn of the Dead', 'Day of the Dead'],
  },
}

type Bio = Pick<Person, 'bio' | 'born' | 'died'>

const bios: Record<string, Bio> = {
  'fritz-lang': {
    bio: 'Austrian-German director whose silent epics, Metropolis among them, shaped science fiction and film noir. He left Germany in 1934 and went on to make thrillers and noirs in Hollywood.',
    born: { date: '1890-12-05', place: 'Vienna, Austria-Hungary' },
    died: { date: '1976-08-02', place: 'Beverly Hills, California, USA' },
  },
  'buster-keaton': {
    bio: 'Comedian, director and stuntman, called “The Great Stone Face” for his deadpan, who did his own stunts in silent features such as The General and Sherlock Jr.',
    born: { date: '1895-10-04', place: 'Piqua, Kansas, USA' },
    died: { date: '1966-02-01', place: 'Woodland Hills, California, USA' },
  },
  'charlie-chaplin': {
    bio: 'English comic actor and filmmaker who created the Tramp, and wrote, directed, produced and scored most of the films he starred in.',
    born: { date: '1889-04-16', place: 'London, England' },
    died: { date: '1977-12-25', place: 'Corsier-sur-Vevey, Switzerland' },
  },
  'george-a-romero': {
    bio: 'American director and writer whose Night of the Living Dead (1968) defined the modern zombie film, a world he went back to for five more films.',
    born: { date: '1940-02-04', place: 'New York City, New York, USA' },
    died: { date: '2017-07-16', place: 'Toronto, Ontario, Canada' },
  },
  'ton-roosendaal': {
    bio: 'Dutch software developer and producer, the creator of Blender and chairman of the Blender Foundation, who produced the Blender Studio open movies.',
    born: null,
    died: null,
  },
  'edward-g-robinson': {
    bio: 'Romanian-born American actor, a star of gangster pictures who later played against type in noirs such as Scarlet Street and The Stranger.',
    born: { date: '1893-12-12', place: 'Bucharest, Romania' },
    died: { date: '1973-01-26', place: 'Los Angeles, California, USA' },
  },
  'cary-grant': {
    bio: 'English-born American actor, the leading man of screwball comedies and Hitchcock thrillers.',
    born: { date: '1904-01-18', place: 'Bristol, England' },
    died: { date: '1986-11-29', place: 'Davenport, Iowa, USA' },
  },
  'audrey-hepburn': {
    bio: 'British actress and humanitarian, a star of Roman Holiday, Charade and Breakfast at Tiffany’s, and later a UNICEF Goodwill Ambassador.',
    born: { date: '1929-05-04', place: 'Ixelles, Belgium' },
    died: { date: '1993-01-20', place: 'Tolochenaz, Switzerland' },
  },
}

// ---------------------------------------------------------------- helpers

function hash(s: string): number {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

export const personId = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const slug = personId

const entryFor = (title: string): Entry | undefined => entries[aliases[title] ?? title]

function credit(
  name: string,
  department: Department,
  character: string | null,
  job: string | null,
) {
  return {
    personId: personId(name),
    name,
    photo: portraitArt(name),
    department,
    character,
    job,
  } satisfies Credit
}

function creditsFor(title: string): { cast: Credit[]; crew: Credit[] } {
  const e = entryFor(title)
  if (!e) return { cast: [], crew: [] }
  const more = moreCrew[aliases[title] ?? title] ?? {}
  const merged = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])]
  const crew = [
    ...e.directors.map((n) => credit(n, 'Directing', null, 'Director')),
    ...(e.writers ?? []).map((n) => credit(n, 'Writing', null, 'Screenplay')),
    ...(e.producers ?? []).map((n) => credit(n, 'Production', null, 'Producer')),
    ...merged(e.camera, more.camera).map((n) =>
      credit(n, 'Camera', null, 'Director of Photography'),
    ),
    ...merged(e.music, more.music).map((n) => credit(n, 'Sound', null, 'Original Music Composer')),
    ...merged(e.editors, more.editors).map((n) => credit(n, 'Editing', null, 'Editor')),
  ]
  const cast = (e.cast ?? []).map(([n, character]) => credit(n, 'Acting', character, null))
  return { cast, crew }
}

/** Every title the metadata source knows: the library's, then the catalog's not yet added. */
export function knownTitles(state: ServerState): DiscoverMovie[] {
  const library: DiscoverMovie[] = state.items
    .filter((m) => m.type === 'movie')
    .map((m) => ({
      id: m.id,
      tmdbId: m.tmdbId,
      title: m.title,
      year: m.year,
      runtimeMinutes: m.runtimeMinutes,
      genres: m.genres,
      synopsis: m.synopsis,
      rating: m.rating,
      releaseDate: m.releaseDate,
      art: m.art,
      inLibrary: true,
    }))
  // the library's own entries stand for anything already added
  const unadded = state.discoverCatalog.filter(
    (d) =>
      !state.items.some(
        (m) => m.tmdbId === d.tmdbId || m.title.toLowerCase() === d.title.toLowerCase(),
      ),
  )
  return [...unadded, ...library]
}

const byId = (state: ServerState, id: string) => knownTitles(state).find((t) => t.id === id) ?? null

function videos(t: DiscoverMovie, upcoming: boolean): Video[] {
  const h = hash(t.title)
  const e = entryFor(t.title)
  const open = e?.studios.includes('Blender Studio') ?? false
  const video = (kind: Video['kind'], name: string, n: number, published: number): Video => ({
    id: `${slug(t.title)}-${n}`,
    name,
    kind,
    site: 'YouTube',
    key: `mock-${slug(t.title)}-${n}`,
    lengthSeconds: 60 + ((h >> (n * 4)) % 120),
    publishedAt: iso(published),
    still: stillArt(`${t.title} ${name}`),
  })
  const released = Date.parse(t.releaseDate)
  if (upcoming) return [video('Teaser', 'Teaser', 1, released - 40 * 86_400_000)]
  if (open)
    return [
      video('Trailer', 'Official trailer', 1, released - 20 * 86_400_000),
      video('Featurette', 'Making of', 2, released + 30 * 86_400_000),
    ]
  // a restoration's re-release trailer, some time in the last decade
  return [video('Trailer', 'Restoration trailer', 1, Date.UTC(2015 + (h % 9), h % 12, 1))]
}

// ---------------------------------------------------------------- the API

export function movieMetadata(state: ServerState, id: string, now: number) {
  const t = byId(state, id)
  if (!t) return null
  const e = entryFor(t.title)
  const h = hash(t.title)
  const { cast, crew } = creditsFor(t.title)
  const collection = e?.collection
  return {
    ...t,
    originalTitle: e?.original?.[0] ?? t.title,
    originalLanguage: e?.original?.[1] ?? 'en',
    tagline: e?.tagline ?? null,
    certification: e?.certification ?? null,
    budget: e?.budget ?? null,
    revenue: e?.revenue ?? null,
    studios: e?.studios ?? [],
    imdbId: `tt${(1_000_000 + (h % 8_999_999)).toString().padStart(7, '0')}`,
    wikidataId: `Q${100_000 + (h % 900_000)}`,
    cast,
    crew,
    videos: videos(t, Date.parse(t.releaseDate) > now),
    collection: collection
      ? { id: collection, name: collections[collection]?.name ?? collection }
      : null,
  } satisfies MovieMetadata
}

/** Every collection the metadata knows, for rule sources (A11). */
export const collectionRefs = () =>
  Object.entries(collections).map(([id, c]) => ({ id, name: c.name }))

export function collection(state: ServerState, id: string): Collection | null {
  const c = collections[id]
  if (!c) return null
  const known = knownTitles(state)
  return {
    id,
    name: c.name,
    overview: c.overview,
    parts: c.titles.flatMap((title) => known.filter((t) => t.title === title)),
  }
}

const peopleOf = (title: string) => {
  const { cast, crew } = creditsFor(title)
  return new Set([...cast, ...crew].map((c) => c.personId))
}

/** Titles sharing people, a genre or a collection, closest first. */
export function recommendations(state: ServerState, id: string, limit = 12) {
  const self = byId(state, id)
  if (!self) return []
  const people = peopleOf(self.title)
  const coll = entryFor(self.title)?.collection
  return knownTitles(state)
    .filter((t) => t.id !== id && t.title !== self.title)
    .map((t) => {
      const shared = [...peopleOf(t.title)].filter((p) => people.has(p)).length
      const genre = t.genres.some((g) => self.genres.includes(g)) ? 2 : 0
      const same = coll && entryFor(t.title)?.collection === coll ? 3 : 0
      return { t, score: shared * 3 + genre + same }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.t.rating - a.t.rating)
    .slice(0, limit)
    .map((x) => x.t)
}

export function person(state: ServerState, id: string): Person | null {
  const credits: PersonCredit[] = []
  let name: string | null = null
  const departments: Partial<Record<Department, number>> = {}
  for (const t of knownTitles(state)) {
    const { cast, crew } = creditsFor(t.title)
    const mine = [...cast, ...crew].filter((c) => c.personId === id)
    if (mine.length === 0) continue
    name = mine[0]?.name ?? name
    for (const c of mine) departments[c.department] = (departments[c.department] ?? 0) + 1
    const first = mine[0] as Credit
    credits.push({
      ...t,
      department: first.department,
      role: mine.map((c) => c.character ?? c.job).join(', '),
    })
  }
  if (!name) return null
  const knownFor = (Object.entries(departments) as [Department, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] as Department
  credits.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title))
  return {
    id,
    name,
    photo: portraitArt(name),
    knownFor,
    ...(bios[id] ?? { bio: null, born: null, died: null }),
    credits,
  }
}
