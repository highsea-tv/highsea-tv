// SPDX-License-Identifier: AGPL-3.0-only
// Library › Collections, web and desktop (docs/product/collections.md#in-the-apps): the owner's
// collections this person sees, marked smart, then TMDB's, as a grid of posters and mosaics.
import { Button, cn, EmptyState, Skeleton } from '@highsea/ui-web'
import { collectionCaption, useCollections } from '../client/data.ts'
import { CollectionTile } from '../kit/collection-art.tsx'
import { gutter, webHref } from './shell.tsx'

const link =
  'rounded-full px-3.5 py-1.5 text-text-2 text-ui outline-none hover:text-text focus-visible:ring-focus aria-[current=page]:bg-text aria-[current=page]:text-bg'

/** Movies or Collections: the library's two views. */
export function LibraryNav({ current }: { current: 'movies' | 'collections' }) {
  return (
    <nav aria-label="Library" className="flex gap-1">
      <a
        href={webHref('/library')}
        aria-current={current === 'movies' ? 'page' : undefined}
        className={link}
      >
        Movies
      </a>
      <a
        href={webHref('/library/collections')}
        aria-current={current === 'collections' ? 'page' : undefined}
        className={link}
      >
        Collections
      </a>
    </nav>
  )
}

export function WebCollections() {
  const list = useCollections('web')
  const xs = list.data ?? []
  return (
    <main className={cn('mx-auto grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <div className="grid gap-3">
        <LibraryNav current="collections" />
        <div className="grid gap-1">
          <h1 className="text-heading">Collections</h1>
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
            <Skeleton key={i} className="aspect-poster rounded-poster" />
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
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
