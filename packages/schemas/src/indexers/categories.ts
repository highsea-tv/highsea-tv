// SPDX-License-Identifier: AGPL-3.0-only
// The standard categories every Newznab and Torznab indexer shares, from the Newznab API's
// "Predefined categories" table (torznab.github.io/spec-1.3-draft/external/newznab/api.html).
// Definitions map their site's own categories onto these; search asks for the movie ones.
// Only the groups highsea searches are listed; checkpoint 9 adds TV.
export const STANDARD_CATEGORIES = {
  2000: 'Movies',
  2010: 'Movies/Foreign',
  2020: 'Movies/Other',
  2030: 'Movies/SD',
  2040: 'Movies/HD',
  2045: 'Movies/UHD',
  2050: 'Movies/BluRay',
  2060: 'Movies/3D',
  5000: 'TV',
  5020: 'TV/Foreign',
  5030: 'TV/SD',
  5040: 'TV/HD',
  5045: 'TV/UHD',
  5050: 'TV/Other',
  5060: 'TV/Sport',
  5070: 'TV/Anime',
  5080: 'TV/Documentary',
  8000: 'Other',
  8010: 'Other/Misc',
} as const satisfies Record<number, string>

export type StandardCategory = keyof typeof STANDARD_CATEGORIES

export const MOVIE_CATEGORIES: readonly StandardCategory[] = [
  2000, 2010, 2020, 2030, 2040, 2045, 2050, 2060,
]

export function isStandardCategory(id: number): id is StandardCategory {
  return id in STANDARD_CATEGORIES
}

/** A subcategory's parent: 2040 → 2000. Site-specific ids (above 99999) have none. */
export function parentCategory(id: number): number | null {
  if (id > 99_999) return null
  const parent = Math.floor(id / 1000) * 1000
  return parent === id ? null : parent
}

export function isMovieCategory(id: number): boolean {
  return id >= 2000 && id < 3000
}

export function categoryName(id: number): string {
  return isStandardCategory(id) ? STANDARD_CATEGORIES[id] : String(id)
}
