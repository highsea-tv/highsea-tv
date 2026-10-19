// SPDX-License-Identifier: AGPL-3.0-only
// Addresses of media pages and people (docs/product/media-pages.md#addresses). A title's address
// is its media id, the same whether it's in the library or not.
import { adminHref } from '../shell.tsx'

/** The path inside the admin, for `navigate`. */
export const moviePath = (t: { id: string }) => `/movies/${t.id}`

export const movieHref = (t: { id: string }) => adminHref(moviePath(t))

export const personHref = (id: string) => adminHref(`/people/${id}`)
