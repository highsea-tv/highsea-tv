'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// What this server serves beyond films (one-client-platform-d.md › D3, the owner's answer 5): Shows
// in the admin are drafted, and a server lists `shows` in public info's `sources` only once it has
// them, so the admin hides Shows' pages, its sidebar entry and Discover's Shows until then, as the
// clients do (`useServes` in @highsea-tv/client/data, ADR 0061's 2026-11-04 section). The admin
// reads public info under its own key, as its other screens do. Until it answers, nothing beyond
// films is shown, so a real server's admin looks as it did before.
import type { ClientSource } from '@highsea-tv/api-contract'
import { useQuery } from '@highsea-tv/sdk/react'
import type { ReactNode } from 'react'
import { type Page, pageGroups } from './nav.ts'
import { AdminNotFound } from './not-found.tsx'

const usePublicInfo = () =>
  useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])

export function useServes(source: ClientSource): boolean {
  return usePublicInfo().data?.sources.includes(source) ?? false
}

/** The sidebar's and the palette's pages, without those this server doesn't serve. */
export function usePageGroups(): Page[][] {
  const shows = useServes('shows')
  return pageGroups.map((group) =>
    group.filter((p) => !p.source || (p.source === 'shows' && shows)),
  )
}

/**
 * A page of a drafted kind: drawn when the server serves it, the admin's not-found page when it
 * doesn't (a typed or old address), and nothing while public info is on its way.
 */
export function Served({ source, children }: { source: ClientSource; children: ReactNode }) {
  const info = usePublicInfo()
  if (info.status === 'loading') return null
  if (!info.data?.sources.includes(source)) return <AdminNotFound />
  return <>{children}</>
}
