// SPDX-License-Identifier: AGPL-3.0-only
// Search's text, kept in the address as it settles (client-search.md › Data): `/search?q=…`, so a
// search can be linked and opened again, on the web as `/web/search?q=…`. A query parameter, not a
// path segment as the web prototype's hash needed (`/search/{text}`), so one route serves every
// target and an empty search is plain `/search`. Setting params changes the route's params in
// place (https://docs.expo.dev/router/reference/url-parameters/#updating-query-parameters), which on
// the web replaces the history entry rather than adding one, so typing is never a step for Back.
// It goes through this screen's own navigation (useNavigation, React Navigation's `setParams`,
// https://reactnavigation.org/docs/navigation-object/#setparams), not `router.setParams`, which
// sets the focused screen's: a result opened before the text settles would get the `q`. The screen stays mounted under a result it opens, so Back finds the text as it was;
// an address with another `q` (a link, or the prototypes' chrome) puts its text in the field.
import { useSearch } from '@highsea-tv/client/data'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useEffect, useRef, useState } from 'react'

/** The text in the address, `q`, as one string. */
const textOf = (q: string | string[] | undefined) => (Array.isArray(q) ? (q[0] ?? '') : (q ?? ''))

/**
 * The field's text, starting from the address's, and the search for it (@highsea-tv/client/data's
 * useSearch: the results follow 150 ms after the last change), with the settled text written back
 * to the address.
 */
export function useSearchText() {
  const linked = textOf(useLocalSearchParams<{ q?: string | string[] }>().q)
  const [q, setQ] = useState(linked)
  const search = useSearch(q)
  const navigation = useNavigation()
  // what the address last said, by this screen or from outside
  const written = useRef(linked)
  useEffect(() => {
    if (linked === written.current) return
    written.current = linked
    setQ(linked)
  }, [linked])
  const text = search.settled.trim()
  useEffect(() => {
    if (text === written.current) return
    written.current = text
    navigation.setParams({ q: text || undefined } as never)
  }, [text, navigation])
  return { q, setQ, ...search }
}
