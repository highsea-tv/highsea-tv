// SPDX-License-Identifier: AGPL-3.0-only
// The fake indexer's catalogue: invented releases for three open movies, written for highsea
// from the protocols' documented shapes. No real tracker's answer or passkey is recorded here.

export type FakeRelease = {
  id: number
  name: string
  /** Bytes. */
  size: number
  seeders: number
  leechers: number
  /** Standard category. */
  category: number
  tmdbId: number | null
  imdbId: string | null
  /** Minutes before the fake's "now" it was posted. */
  ageMinutes: number
  freeleech: boolean
  grabs: number
}

const GB = 1024 ** 3
const MB = 1024 ** 2

export const MOVIES = {
  sintel: { tmdbId: 45745, imdbId: 'tt1727587', title: 'Sintel', year: 2010 },
  bunny: { tmdbId: 10378, imdbId: 'tt1254207', title: 'Big Buck Bunny', year: 2008 },
  tears: { tmdbId: 133701, imdbId: 'tt2285752', title: 'Tears of Steel', year: 2012 },
} as const

const sintel = { tmdbId: MOVIES.sintel.tmdbId, imdbId: MOVIES.sintel.imdbId }
const bunny = { tmdbId: MOVIES.bunny.tmdbId, imdbId: MOVIES.bunny.imdbId }

export const RELEASES: FakeRelease[] = [
  {
    id: 101,
    name: 'Sintel.2010.1080p.BluRay.x264-GRP',
    size: 8 * GB,
    seeders: 120,
    leechers: 10,
    category: 2040,
    ...sintel,
    ageMinutes: 60 * 24 * 30,
    freeleech: true,
    grabs: 900,
  },
  {
    id: 102,
    name: 'Sintel.2010.2160p.UHD.BluRay.x265-GRP',
    size: 17 * GB,
    seeders: 40,
    leechers: 4,
    category: 2045,
    ...sintel,
    ageMinutes: 60 * 24 * 10,
    freeleech: false,
    grabs: 210,
  },
  {
    id: 103,
    name: 'Sintel.2010.720p.WEB-DL.DDP5.1.H.264-GRP',
    size: 3 * GB,
    seeders: 0,
    leechers: 2,
    category: 2040,
    ...sintel,
    ageMinutes: 60 * 5,
    freeleech: false,
    grabs: 12,
  },
  {
    id: 104,
    name: 'Sintel.2010.DVDRip.XviD-OLD',
    size: 700 * MB,
    seeders: 5,
    leechers: 0,
    category: 2030,
    ...sintel,
    ageMinutes: 60 * 24 * 900,
    freeleech: false,
    grabs: 3000,
  },
  {
    id: 105,
    name: 'Big.Buck.Bunny.2008.1080p.BluRay.x264-GRP',
    size: 6 * GB,
    seeders: 300,
    leechers: 12,
    category: 2040,
    ...bunny,
    ageMinutes: 60 * 24 * 60,
    freeleech: false,
    grabs: 5000,
  },
  {
    // a TV result a movie search must leave out
    id: 106,
    name: 'Sintel.Behind.The.Scenes.S01E01.1080p.WEB-DL-GRP',
    size: 1 * GB,
    seeders: 8,
    leechers: 1,
    category: 5040,
    tmdbId: null,
    imdbId: null,
    ageMinutes: 60 * 24,
    freeleech: false,
    grabs: 4,
  },
]

/** Fixed, so ages in tests don't drift: 2026-10-20T12:00:00Z. */
export const FAKE_NOW = Date.UTC(2026, 9, 20, 12, 0)

/** The credentials the fake accepts. */
export const FAKE_CREDENTIALS = {
  torznabKey: 'fake-torznab-key-0001',
  newznabKey: 'fake-newznab-key-0002',
  jsonPasskey: 'fake-json-passkey-0003',
  rssPasskey: 'fake-rss-passkey-0004',
  username: 'captain',
  password: 'fake-password-0005',
} as const

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/** What a search finds: by TMDB id, by IMDb id (with or without "tt"), or by every word of `q`. */
export function find(params: {
  q?: string | null
  tmdbId?: string | null
  imdbId?: string | null
  categories?: number[]
}): FakeRelease[] {
  return RELEASES.filter((r) => {
    if (params.tmdbId) return r.tmdbId === Number(params.tmdbId)
    if (params.imdbId) return r.imdbId?.replace(/^tt/, '') === params.imdbId.replace(/^tt/, '')
    if (params.q) {
      const name = words(r.name)
      if (!words(params.q).every((w) => name.includes(w))) return false
    }
    if (params.categories?.length)
      return params.categories.some(
        (c) => c === r.category || c === Math.floor(r.category / 1000) * 1000,
      )
    return true
  })
}
