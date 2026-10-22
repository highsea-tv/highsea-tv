// SPDX-License-Identifier: AGPL-3.0-only
// Library › Collections, mobile (docs/product/collections.md#in-the-apps): the same large title
// as Movies with a switch between the two, then the collections three a row, smart ones marked.
import { Button, cn, EmptyState, Skeleton } from '@highsea/ui-web'
import { collectionCaption, useCollections } from '../client/data.ts'
import { CollectionTile } from '../kit/collection-art.tsx'
import { gutter, Header, mobileHref } from './shell.tsx'

const link =
  'grid min-h-9 place-items-center rounded-full border border-line px-3.5 text-[14px] text-text-2 outline-none focus-visible:ring-focus aria-[current=page]:border-transparent aria-[current=page]:bg-text aria-[current=page]:text-bg'

/** Movies or Collections: the library's two views. */
export function LibraryNav({ current }: { current: 'movies' | 'collections' }) {
  return (
    <nav aria-label="Library" className={cn('flex gap-2', gutter)}>
      <a
        href={mobileHref('/library')}
        aria-current={current === 'movies' ? 'page' : undefined}
        className={link}
      >
        Movies
      </a>
      <a
        href={mobileHref('/library/collections')}
        aria-current={current === 'collections' ? 'page' : undefined}
        className={link}
      >
        Collections
      </a>
    </nav>
  )
}

export function MobileCollections() {
  const list = useCollections('mobile')
  const xs = list.data ?? []
  return (
    <div className="grid gap-4 pt-1">
      <Header title="Library" />
      <LibraryNav current="collections" />
      <p className={cn('text-[13px] text-text-3', gutter)}>
        {list.status === 'success'
          ? `${xs.length} ${xs.length === 1 ? 'collection' : 'collections'}`
          : ' '}
      </p>
      <div className={gutter}>
        {list.status === 'loading' ? (
          <div aria-busy className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
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
            When the server’s owner makes collections, or films here belong to one, they show up
            here.
          </EmptyState>
        ) : (
          <ul aria-label="Collections" className="grid grid-cols-3 gap-x-2 gap-y-4">
            {xs.map((c) => (
              <li key={c.id}>
                <CollectionTile
                  href={mobileHref(`/collections/${c.id}`)}
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
      </div>
    </div>
  )
}
