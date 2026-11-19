// SPDX-License-Identifier: AGPL-3.0-only
// Chosen artwork (HT-66): staff change a title's poster, backdrop or logo to another of TMDB's, or
// to a file of their own, and Reset puts highsea's automatic choice back. A refresh never replaces
// a chosen image. Owners are addressed as images are (`movie`, `collection`, by TMDB id); shows,
// seasons and episodes join the owner list with Phase 5 part B, on the same routes.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IsoDate, json } from './common.ts'
import { ImageUrl } from './metadata.ts'

export const ARTWORK_OWNERS = ['movie', 'collection'] as const
export const ARTWORK_KINDS = ['poster', 'backdrop', 'logo'] as const

/** At most 10 MB once decoded, base64 in JSON as the mark is (ADR 0028). */
export const ARTWORK_UPLOAD_MAX = Math.ceil((10 * 1024 * 1024) / 3) * 4

/**
 * Why an upload or a choice was refused, in the error's `details.reason`: `type` (not a PNG or
 * JPEG; a logo must be a PNG), `size` (over 10 MB), `too-small`, `too-large` (over 8000 px a side),
 * `shape` (a poster far from 2:3, a backdrop far from 16:9), `damaged`, `empty`, `kind` (the title
 * has no such kind) or `not-an-option` (TMDB has no such image for the title).
 */
export const ARTWORK_REASONS = [
  'type',
  'size',
  'too-small',
  'too-large',
  'shape',
  'damaged',
  'empty',
  'kind',
  'not-an-option',
] as const

export const ArtworkOwner = z.enum(ARTWORK_OWNERS).openapi('ArtworkOwner')
export const ArtworkKind = z.enum(ARTWORK_KINDS).openapi('ArtworkKind')

const OwnerParams = z.object({
  owner: ArtworkOwner.openapi({ param: { name: 'owner', in: 'path' }, example: 'movie' }),
  id: z.coerce
    .number<number>()
    .int()
    .positive()
    .openapi({ param: { name: 'id', in: 'path' }, example: 603 }),
})
const KindParams = OwnerParams.extend({
  kind: ArtworkKind.openapi({ param: { name: 'kind', in: 'path' }, example: 'poster' }),
})

/** Where an option comes from: TMDB, or fanart.tv (HT-74, ADR 0070). */
export const ArtworkSource = z.enum(['tmdb', 'fanart'])

/** One of TMDB's or fanart.tv's images for a kind. */
export const ArtworkOption = z
  .object({
    source: ArtworkSource,
    /** The file's name, which choosing sends back; fanart.tv's start `/ftv_`. */
    file: z.string().openapi({ example: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' }),
    /** At a size for the picker's grid. */
    url: ImageUrl,
    /** ISO 639-1 of the text on it; null for none. */
    language: z.string().nullable().openapi({ example: 'en' }),
    width: z.number().int(),
    height: z.number().int(),
    /** TMDB's votes on it, 0 to 10; null for fanart.tv's. */
    voteAverage: z.number().nullable(),
    voteCount: z.number().int().nullable(),
    /** fanart.tv's likes; null for TMDB's. */
    likes: z.number().int().nullable(),
    /** The one shown now. */
    current: z.boolean(),
  })
  .openapi('ArtworkOption')

/** What an admin chose, and who and when. */
export const ArtworkChoice = z
  .object({
    source: z.enum(['tmdb', 'fanart', 'upload']),
    /** Null once their account is removed. */
    by: z.object({ id: z.string(), name: z.string() }).nullable(),
    at: IsoDate,
    language: z.string().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
  })
  .openapi('ArtworkChoice')

export const ArtworkKindView = z
  .object({
    kind: ArtworkKind,
    /** What every app shows now, at the picker's size; null when there's none. */
    current: ImageUrl.nullable(),
    /** highsea's automatic choice, which Reset goes back to; null when TMDB has none. */
    automatic: ImageUrl.nullable(),
    /** Null while the automatic choice shows. */
    chosen: ArtworkChoice.nullable(),
    /**
     * TMDB's images of this kind, best voted first, then fanart.tv's, most liked first, when it's
     * on; SVG files are left out.
     */
    options: z.array(ArtworkOption),
  })
  .openapi('ArtworkKindView')

export const ArtworkView = z
  .object({
    owner: ArtworkOwner,
    id: z.number().int(),
    /** Poster, backdrop and logo. A collection's logo is upload-only: TMDB keeps none. */
    kinds: z.array(ArtworkKindView),
    /**
     * Whether TMDB's images could be listed; when not, `reason` is `no-tmdb-key`,
     * `tmdb-unreachable` or `tmdb-rate-limited`, and uploads and Reset still work.
     */
    tmdb: z.object({ available: z.boolean(), reason: z.string().nullable() }),
  })
  .openapi('ArtworkView')

export const ArtworkPick = z
  .object({ file: z.string().regex(/^\/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/) })
  .openapi('ArtworkPick')

export const ArtworkUpload = z
  .object({ data: z.base64().max(ARTWORK_UPLOAD_MAX) })
  .openapi('ArtworkUpload')

const ARTWORK = `${API_PREFIX}/artwork/{owner}/{id}`

export type ArtworkOwner = z.infer<typeof ArtworkOwner>
export type ArtworkKind = z.infer<typeof ArtworkKind>
export type ArtworkOption = z.infer<typeof ArtworkOption>
export type ArtworkChoice = z.infer<typeof ArtworkChoice>
export type ArtworkKindView = z.infer<typeof ArtworkKindView>
export type ArtworkView = z.infer<typeof ArtworkView>

export const artwork = {
  get: createRoute({
    method: 'get',
    path: ARTWORK,
    tags: ['Artwork'],
    summary: 'A title’s artwork and TMDB’s alternatives',
    description:
      'Each kind’s current and automatic image, who chose it, and every image TMDB has for it in any language. The title is fetched from TMDB when the server hasn’t seen it.',
    ...access('staff'),
    request: { params: OwnerParams },
    responses: {
      200: json(ArtworkView, 'The artwork'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'unavailable'),
    },
  }),
  choose: createRoute({
    method: 'put',
    path: `${ARTWORK}/{kind}`,
    tags: ['Artwork'],
    summary: 'Use another of TMDB’s images',
    description:
      'The file must be one TMDB lists for the title. It stays through every refresh until Reset. Written to the audit log; `metadata.updated` follows.',
    ...access('staff'),
    request: { params: KindParams, ...body(ArtworkPick) },
    responses: {
      200: json(ArtworkView, 'Chosen'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'unavailable'),
    },
  }),
  upload: createRoute({
    method: 'put',
    path: `${ARTWORK}/{kind}/upload`,
    tags: ['Artwork'],
    summary: 'Use an image of your own',
    description:
      'A PNG or JPEG, base64-encoded, at most 10 MB and 8000 px a side; the type is read from the file. A poster at least 500 px wide and near 2:3; a backdrop at least 1280 px wide and near 16:9; a logo a PNG at least 300 px wide. Its address is new, so every app shows it at once. Written to the audit log.',
    ...access('staff'),
    request: { params: KindParams, ...body(ArtworkUpload) },
    responses: {
      200: json(ArtworkView, 'Uploaded'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'unavailable'),
    },
  }),
  reset: createRoute({
    method: 'delete',
    path: `${ARTWORK}/{kind}`,
    tags: ['Artwork'],
    summary: 'Go back to the automatic choice',
    description: 'Removes the chosen image (an upload is deleted). Written to the audit log.',
    ...access('staff'),
    request: { params: KindParams },
    responses: {
      200: json(ArtworkView, 'Reset'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'unavailable'),
    },
  }),
}
