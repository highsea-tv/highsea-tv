'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Addresses of media pages (the prototype's media/links.ts; docs/product/media-pages.md#addresses):
// a title's address is its TMDB id, the same whether it's in the library or not (ADR 0014,
// amended 2026-10-20). Also the library statuses' tones, and who may add and edit movies.
import type { MovieStatus } from '@highsea/api-contract'
import { useQuery } from '@highsea/sdk/react'
import type { BadgeTone } from '@highsea/ui-web'
import type { library } from './library-messages.ts'
import { isStaff } from './nav.ts'
import { useShell } from './shell.tsx'

export const moviePath = (id: number) => `/movies/${id}`
export const personPath = (id: number) => `/people/${id}`
export const collectionPath = (id: number) => `/collections/${id}`

/** Each library status: its badge tone and its label in library-messages.ts. */
export const movieStatus: Record<
  MovieStatus,
  { tone: BadgeTone; label: `status.${MovieStatus}` & keyof typeof library }
> = {
  // the prototype's tones: wanted is its "Missing", not released its "Not released"
  available: { tone: 'success', label: 'status.available' },
  wanted: { tone: 'danger', label: 'status.wanted' },
  downloading: { tone: 'accent', label: 'status.downloading' },
  'not-released': { tone: 'info', label: 'status.not-released' },
  unmonitored: { tone: 'neutral', label: 'status.unmonitored' },
}

/**
 * Whether this person may add, edit and remove movies: owners and admins, and anyone given
 * "Manage the library" (the API's `library` access, apps/server/src/api/guard.ts).
 */
export function useCanManageLibrary(): boolean {
  const { role } = useShell()
  const session = useQuery('session', (c) => c.auth.session(), ['users.updated'])
  return isStaff(role) || Boolean(session.data?.user.permissions.includes('manageLibrary'))
}
