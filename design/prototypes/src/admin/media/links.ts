// SPDX-License-Identifier: AGPL-3.0-only
// Addresses of media pages and people (docs/product/media-pages.md#addresses). A title not in the
// library is addressed by its metadata id; its page redirects to the library id once added.
import { adminHref } from '../shell.tsx'

type Addressable = { libraryId: string | null; tmdbId: number }

/** The path inside the admin, for `navigate`. */
export const moviePath = (t: Addressable) => `/movies/${t.libraryId ?? `tmdb-${t.tmdbId}`}`

export const movieHref = (t: Addressable) => adminHref(moviePath(t))

export const personHref = (id: string) => adminHref(`/people/${id}`)
