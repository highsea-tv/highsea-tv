// SPDX-License-Identifier: AGPL-3.0-only
// Fetching ahead what a card opens (HT-116): a pointer over a card or a touch beginning on it asks
// for its page at once, and on the TV a card that keeps the focus for a moment does, so a remote
// sweeping across a grid doesn't send a request per card. The cache bounds the rest (two at a
// time, the newest first: @highsea-tv/sdk's cache.ts).
import { libraryQuery, showsQuery, usePrefetch, useServes } from '@highsea-tv/client/data'
import { useFormFactor } from '@highsea-tv/ui'
import { useEffect, useMemo } from 'react'

/** How long the TV's focus rests on a card before its page is fetched. */
export const FOCUS_REST_MS = 300

let resting: ReturnType<typeof setTimeout> | null = null

/** What a card stands for: a film, an episode (its show's page opens) or a show. */
type Card = { id: number; type?: string; show?: { id: number } | null }

export function useAhead() {
  const p = usePrefetch()
  const tv = useFormFactor().input === 'tv'
  return useMemo(() => {
    const soon = (fetch: () => void) => {
      if (!tv) return fetch()
      if (resting) clearTimeout(resting)
      resting = setTimeout(fetch, FOCUS_REST_MS)
    }
    return {
      /** A card's page: a film's, or the show's for an episode or a show. */
      card: (c: Card) =>
        soon(() => {
          if (c.show) p.show(c.show.id)
          else if (c.type === 'show') p.show(c.id)
          else if (c.type === undefined || c.type === 'movie') p.title(c.id)
        }),
      show: (id: number) => soon(() => p.show(id)),
    }
  }, [p, tv])
}

/** How long Home has been on view, settled, before the tabs' first pages are fetched. */
export const TABS_AFTER_MS = 1000

/**
 * The destinations' first pages once Home has settled (HT-116): the library behind Movies and the
 * phone's Library, and Shows where the server serves them, one after the other through the cache's
 * prefetch, and only those the cache has no answer for yet.
 */
export function useTabsAhead(settled: boolean) {
  const p = usePrefetch()
  const shows = useServes('shows')
  useEffect(() => {
    if (!settled) return
    const t = setTimeout(() => {
      // only what's never been read: a tab read before draws from the cache and asks again itself
      if (!p.has(libraryQuery)) p.query(libraryQuery)
      if (shows && !p.has(showsQuery)) p.query(showsQuery)
    }, TABS_AFTER_MS)
    return () => clearTimeout(t)
  }, [settled, shows, p])
}
