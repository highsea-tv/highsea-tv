// SPDX-License-Identifier: AGPL-3.0-only
// Collections, web and desktop, a destination of its own since the TV's nav came to the web (the
// owner, 2026-10-30) (docs/product/collections.md#in-the-apps): the owner's
// collections this person sees, marked smart, then TMDB's, as a grid of posters and mosaics.
import { Button, cn, EmptyState, Skeleton } from '@highsea-tv/ui'
import { collectionCaption, useCollections } from '../client/data.ts'
import { MediaPosterSkeleton } from '../client/media-card.tsx'
import { CollectionTile } from '../kit/collection-art.tsx'
import { gutter, webHref } from './shell.tsx'

export function WebCollections() {
  const list = useCollections('web')
  const xs = list.data ?? []
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <h1 className="text-heading">Collections</h1>
          {list.status === 'loading' && <Skeleton className="my-0.5 h-3 w-20" />}
          {list.status === 'success' && (
            <p className="text-caption text-text-3">
              {xs.length} {xs.length === 1 ? 'collection' : 'collections'}
            </p>
          )}
        </div>
      </div>
      {list.status === 'loading' ? (
        <div
          aria-busy
          className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6"
        >
          {Array.from({ length: 7 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <MediaPosterSkeleton key={i} />
          ))}
        </div>
      ) : list.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title="Couldn’t load the collections"
          action={<Button onClick={list.refetch}>Try again</Button>}
        >
          {list.error.message}
        </EmptyState>
      ) : xs.length === 0 ? (
        <EmptyState icon="library" title="No collections yet">
          When the server’s owner makes collections, or films here belong to one, they show up here.
        </EmptyState>
      ) : (
        <ul
          aria-label="Collections"
          className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6"
        >
          {xs.map((c) => (
            <li key={c.id}>
              <CollectionTile
                href={webHref(`/collections/${c.id}`)}
                name={c.name}
                caption={collectionCaption(c)}
                poster={c.art.poster}
                mosaic={c.smart?.mosaic}
                smart={!!c.smart?.words}
                titleSize="body"
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
