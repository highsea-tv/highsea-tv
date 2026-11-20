'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Discover's results a page at a time, gathered into one list for the libraries' windowed grid
// (HT-115): the owner asked that Discover's grids load and page as Movies and Shows do, with no
// Show more. The libraries read every page of the server's before drawing; TMDB's search and lists
// answer 20 a page and up to 500 pages (`page`, which the contract takes 1–500;
// https://developer.themoviedb.org/reference/search-movie), so Discover reads the first and asks
// for the next as the grid draws its last row (VirtualGrid's `onEnd`, after FlatList's onEndReached). A result TMDB repeats on a later
// page, as its lists move while they're read, is kept once. Live topics fetch the pages shown
// again quietly, so In library flips in place, as the single query did.
import { RESET_TOPIC } from '@highsea-tv/api-contract'
import type { HighseaClient } from '@highsea-tv/sdk'
import { type Query, useClient } from '@highsea-tv/sdk/react'
import { useCallback, useEffect, useRef, useState } from 'react'

/** The most pages TMDB answers, as the contract's `page` takes them. */
export const TMDB_PAGES = 500

type Answer<T> = { items: T[]; totalPages: number }

type State<T> = {
  key: string
  first: { status: 'loading' } | { status: 'error'; error: Error } | { status: 'success' }
  pages: T[][]
  totalPages: number
  more: { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: Error }
}

export type DiscoverPages<T> = {
  /** The first page's state, with every page read so far as its data, for Loadable. */
  query: Query<T[]>
  /** Ask for the next page, once; nothing while one is on its way, after an error or at the end. */
  more: () => void
  /** The next page is on its way. */
  loading: boolean
  /** The next page failed: its error, and Try again. */
  error: Error | null
  retry: () => void
  /** Every page TMDB has is read. */
  done: boolean
}

const fresh = <T>(key: string): State<T> => ({
  key,
  first: { status: 'loading' },
  pages: [],
  totalPages: 0,
  more: { status: 'idle' },
})

export function useDiscoverPages<T>(
  key: string,
  fetchPage: (client: HighseaClient, page: number) => Promise<Answer<T>>,
  keyOf: (item: T) => string,
  live: string[] = [],
): DiscoverPages<T> {
  const client = useClient()
  const [state, setState] = useState<State<T>>(() => fresh(key))
  const fetchRef = useRef(fetchPage)
  fetchRef.current = fetchPage
  // the state's own key: an answer for another search or list is dropped
  const current = useRef(key)
  current.current = key
  const shown = state.key === key ? state : fresh<T>(key)

  const loadFirst = useCallback(() => {
    const at = key
    setState(fresh(at))
    fetchRef.current(client, 1).then(
      (a) =>
        current.current === at &&
        setState({
          ...fresh<T>(at),
          first: { status: 'success' },
          pages: [a.items],
          totalPages: a.totalPages,
        }),
      (error: Error) =>
        current.current === at && setState({ ...fresh<T>(at), first: { status: 'error', error } }),
    )
  }, [client, key])

  useEffect(loadFirst, [loadFirst])

  const read = Math.min(shown.totalPages, TMDB_PAGES)
  const done = shown.first.status === 'success' && shown.pages.length >= read
  const more = () => {
    if (shown.first.status !== 'success' || shown.more.status !== 'idle' || done) return
    const at = key
    const page = shown.pages.length + 1
    setState((s) => (s.key === at ? { ...s, more: { status: 'loading' } } : s))
    fetchRef.current(client, page).then(
      (a) =>
        setState((s) =>
          s.key === at && s.pages.length === page - 1
            ? {
                ...s,
                pages: [...s.pages, a.items],
                totalPages: a.totalPages,
                more: { status: 'idle' },
              }
            : s,
        ),
      (error: Error) =>
        setState((s) => (s.key === at ? { ...s, more: { status: 'error', error } } : s)),
    )
  }
  const retry = () =>
    setState((s) =>
      s.key === key && s.more.status === 'error' ? { ...s, more: { status: 'idle' } } : s,
    )

  // a library change fetches the pages shown again, quietly
  const count = shown.pages.length
  const liveKey = live.join(',')
  useEffect(() => {
    if (!liveKey || count === 0) return
    const topics = new Set(liveKey.split(','))
    let queued = false
    return client.events.subscribe((e) => {
      if ((!topics.has(e.topic) && e.topic !== RESET_TOPIC) || queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        const at = current.current
        Promise.all(Array.from({ length: count }, (_, i) => fetchRef.current(client, i + 1))).then(
          (answers) =>
            setState((s) =>
              s.key === at && s.pages.length === count
                ? { ...s, pages: answers.map((a) => a.items) }
                : s,
            ),
          () => {},
        )
      })
    })
  }, [client, liveKey, count])

  // every page read so far, each result once
  const seen = new Set<string>()
  const items: T[] = []
  for (const page of shown.pages)
    for (const item of page) {
      const k = keyOf(item)
      if (seen.has(k)) continue
      seen.add(k)
      items.push(item)
    }

  const refresh = () => {
    loadFirst()
    return Promise.resolve(items)
  }
  const query: Query<T[]> =
    shown.first.status === 'loading'
      ? { status: 'loading', data: undefined, error: undefined, refetch: loadFirst, refresh }
      : shown.first.status === 'error'
        ? {
            status: 'error',
            data: undefined,
            error: shown.first.error,
            refetch: loadFirst,
            refresh,
          }
        : { status: 'success', data: items, error: undefined, refetch: loadFirst, refresh }

  return {
    query,
    more,
    loading: shown.more.status === 'loading',
    error: shown.more.status === 'error' ? shown.more.error : null,
    retry,
    done,
  }
}
