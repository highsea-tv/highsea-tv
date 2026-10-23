// SPDX-License-Identifier: AGPL-3.0-only
// A page section's data states in one place: skeleton while loading, an error with Try again, and
// the content once it's in. Each page passes its own skeleton so the layout doesn't jump.
import { Button, EmptyState, Skeleton } from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'
import type { Query } from '../mock/hooks.tsx'

export function Loadable<T>({
  query,
  what,
  skeleton,
  children,
}: {
  query: Query<T>
  /** "the library": the error reads "Couldn’t load the library". */
  what: string
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
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
        title={`Couldn’t load ${what}`}
        action={<Button onClick={query.refetch}>Try again</Button>}
      >
        {query.error.message}
      </EmptyState>
    )
  return <>{children(query.data)}</>
}

/** A grid of poster skeletons, for pages that open on artwork. */
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
