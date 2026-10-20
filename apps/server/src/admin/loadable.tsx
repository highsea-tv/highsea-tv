'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A section's data states in one place (the prototype's loadable.tsx): a skeleton while loading,
// an error with Try again, and the content once it's in.
import { useT } from '@highsea/i18n/react'
import type { Query } from '@highsea/sdk/react'
import { Button, EmptyState, Skeleton } from '@highsea/ui-web'
import type { ReactNode } from 'react'
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
      <div aria-busy className="grid gap-3">
        {skeleton ?? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
      </div>
    )
  if (query.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('load.error', { what })}
        action={<Button onClick={query.refetch}>{t('retry')}</Button>}
      >
        {query.error.message}
      </EmptyState>
    )
  return <>{children(query.data)}</>
}

/** A poster grid's placeholders (the prototype's loadable.tsx), for Discover and the library. */
export function PosterSkeletons({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        <Skeleton key={i} className="aspect-poster rounded-poster" />
      ))}
    </div>
  )
}
