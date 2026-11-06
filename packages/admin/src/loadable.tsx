'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A section's data states in one place (the prototype's loadable.tsx): a skeleton while loading,
// an error with Try again, and the content once it's in. Drawn with the library's native renderer
// since D2 (one-client-platform-d.md).
import { useT } from '@highsea-tv/i18n/react'
import type { Query } from '@highsea-tv/sdk/react'
import { Button, EmptyState, Skeleton, tokens } from '@highsea-tv/ui/native'
import type { ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { shell } from './messages.ts'

export function Loadable<T>({
  query,
  what,
  skeleton,
  children,
}: {
  query: Query<T>
  /** "the people on this server": the error reads "Couldn’t load the people on this server". */
  what: string
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  const t = useT(shell)
  if (query.status === 'loading')
    return (
      <View aria-busy style={{ gap: tokens.space['3'] }}>
        {skeleton ?? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={48} />)}
      </View>
    )
  if (query.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('load.error', { what })}
        action={<Button onPress={query.refetch}>{t('retry')}</Button>}
      >
        {query.error.message}
      </EmptyState>
    )
  return <>{children(query.data)}</>
}

/**
 * A poster grid's placeholders (the prototype's loadable.tsx), for Discover and the library: as
 * many 136-wide columns as fit (CSS grid's `auto-fill`, https://drafts.csswg.org/css-grid-2/#auto-repeat).
 */
export function PosterSkeletons({ count = 12 }: { count?: number }) {
  return (
    <View
      style={
        {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))',
          gap: tokens.space['4'],
        } as unknown as ViewStyle
      }
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        <View key={i} style={{ aspectRatio: 2 / 3 }}>
          <Skeleton height="100%" radius={tokens.radius.poster} />
        </View>
      ))}
    </View>
  )
}
