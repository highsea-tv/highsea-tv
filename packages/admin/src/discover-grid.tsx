'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Discover's grid, films' and shows' (HT-115): the libraries' own (LibraryPosters, the windowed
// grid Movies and Shows draw), read a page of TMDB's at a time as it reaches its last row, with no
// Show more. While the next page is on its way a row of poster placeholders stands under the grid,
// as the libraries' first load shows them; a page that fails says so with Try again; and the grid
// simply ends once TMDB has no more, as a library's does.
import { useT } from '@highsea-tv/i18n/react'
import { Button, Text, tokens } from '@highsea-tv/ui/native'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { discover as messages } from './discover-messages.ts'
import type { DiscoverPages } from './discover-pages.ts'
import { LibraryPosters } from './library-grid.tsx'
import { PosterSkeletons } from './loadable.tsx'
import { shell } from './messages.ts'

export function DiscoverGrid<T>({
  items,
  pages,
  keyOf,
  label,
  render,
}: {
  items: readonly T[]
  pages: DiscoverPages<T>
  keyOf: (item: T) => string
  label: string
  render: (item: T) => ReactNode
}) {
  const t = useT(messages)
  const s = useT(shell)
  return (
    <View style={{ gap: tokens.space['5'] }}>
      <LibraryPosters
        items={items}
        keyOf={keyOf}
        label={label}
        render={render}
        onEnd={pages.more}
      />
      {pages.loading ? (
        <View aria-busy>
          <PosterSkeletons count={6} />
        </View>
      ) : pages.error ? (
        <View style={{ alignItems: 'flex-start', gap: tokens.space['2'] }}>
          <Text variant="caption" color="text-3">
            {s('load.error', { what: t('more.what') })}
          </Text>
          <Button size="sm" onPress={pages.retry}>
            {s('retry')}
          </Button>
        </View>
      ) : null}
    </View>
  )
}
