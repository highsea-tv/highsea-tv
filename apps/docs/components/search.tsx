'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Search over the index written at build, run in the browser
// (https://fumadocs.dev/docs/search/orama, its "static" setup).
import { useDocsSearch } from 'fumadocs-core/search/client'
import { staticClient } from 'fumadocs-core/search/client/orama-static'
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search'
import { useMemo } from 'react'

export default function StaticSearchDialog(props: SharedProps) {
  const client = useMemo(() => staticClient({ from: '/api/search' }), [])
  const { search, setSearch, query } = useDocsSearch({ client })
  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  )
}
