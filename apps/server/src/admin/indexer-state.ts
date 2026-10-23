'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Whether highsea can search for releases: an enabled indexer exists (checkpoint 4 plan,
// decision 2, answered by checkpoint 5). Search controls stay shown but disabled, with the
// reason, while none does. Follows `indexers.updated`, so adding one enables them in place.
import { useQuery } from '@highsea-tv/sdk/react'

export function useSearchable() {
  const indexers = useQuery('indexers', (c) => c.indexers.list(), ['indexers.updated'])
  const enabled = indexers.data?.filter((i) => i.enabled).length ?? 0
  return { ready: indexers.status === 'success', enabled, canSearch: enabled > 0 }
}
