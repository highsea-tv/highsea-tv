// SPDX-License-Identifier: AGPL-3.0-only
// Art is served by the server, never hotlinked (owner's decision 4): a cached image's address is
// `/api/v1/images/{owner}/{ownerId}/{kind}/{size}/{file}`, for example
// `/api/v1/images/movie/19/poster/w342/kr9wXRN23zLuWJIelahas1mtnYj.jpg`. The owner is what the
// image shows (a movie's poster, a person's portrait), so images are purged with it; the kind and
// size pick one of TMDB's sizes (`/3/configuration`). Nothing in the address is trusted: each part
// is checked against these lists before it reaches the disk or TMDB.

export const IMAGE_ROUTE = '/api/v1/images'

export const IMAGE_OWNERS = ['movie', 'person', 'collection'] as const
export type ImageOwner = (typeof IMAGE_OWNERS)[number]

export const IMAGE_KINDS = ['poster', 'backdrop', 'profile', 'still', 'logo'] as const
export type ImageKind = (typeof IMAGE_KINDS)[number]

/**
 * The sizes highsea serves, by kind: TMDB's documented sizes (`/3/configuration`) without
 * `original`, which can be several megabytes and no screen needs.
 */
export const IMAGE_SIZES: Record<ImageKind, readonly string[]> = {
  poster: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780'],
  backdrop: ['w300', 'w780', 'w1280'],
  profile: ['w45', 'w185', 'h632'],
  still: ['w92', 'w185', 'w300'],
  logo: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500'],
}

/** The sizes the domain types link to; clients may swap the size for another of the kind's. */
export const DEFAULT_SIZES = {
  poster: 'w342',
  backdrop: 'w1280',
  /** A backdrop at card size: trailer stills and wide cards. */
  still: 'w780',
  profile: 'w185',
  portrait: 'h632',
} as const

/**
 * TMDB's `file_path`: a slash, then letters, digits and a raster extension. SVG (some logos) is left
 * out: served from the server's own origin, an SVG could carry script.
 */
const FILE = /^\/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/

export const contentTypeOf = (file: string) =>
  file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'

export type ImageRef = {
  owner: ImageOwner
  ownerId: number
  kind: ImageKind
  size: string
  /** TMDB's `file_path`, with its leading slash. */
  file: string
}

export function imageUrl(
  owner: ImageOwner,
  ownerId: number,
  kind: ImageKind,
  size: string,
  file: string | null | undefined,
): string | null {
  if (!file || !FILE.test(file)) return null
  return `${IMAGE_ROUTE}/${owner}/${ownerId}/${kind}/${size}${file}`
}

/**
 * Checks an image address's parts (as a route hands them over) and returns them, or null when
 * any part isn't one highsea serves.
 */
export function parseImageRef(parts: {
  owner: string
  ownerId: string | number
  kind: string
  size: string
  file: string
}): ImageRef | null {
  const owner = IMAGE_OWNERS.find((o) => o === parts.owner)
  const kind = IMAGE_KINDS.find((k) => k === parts.kind)
  const ownerId = Number(parts.ownerId)
  if (!owner || !kind || !Number.isSafeInteger(ownerId) || ownerId <= 0) return null
  if (!IMAGE_SIZES[kind].includes(parts.size)) return null
  const file = parts.file.startsWith('/') ? parts.file : `/${parts.file}`
  if (!FILE.test(file)) return null
  return { owner, ownerId, kind, size: parts.size, file }
}

/** The same check on a whole address (`/api/v1/images/movie/19/poster/w342/abc.jpg`). */
export function parseImageUrl(url: string): ImageRef | null {
  if (!url.startsWith(`${IMAGE_ROUTE}/`)) return null
  const [owner, ownerId, kind, size, file, ...rest] = url.slice(IMAGE_ROUTE.length + 1).split('/')
  if (!owner || !ownerId || !kind || !size || !file || rest.length) return null
  return parseImageRef({ owner, ownerId, kind, size, file })
}
