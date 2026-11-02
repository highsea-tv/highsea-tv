// SPDX-License-Identifier: AGPL-3.0-only
// Library › Collections, mobile (docs/product/collections.md#in-the-apps): the same large title
// as Movies with a switch between the two, then the collections three a row, smart ones marked.
import {
  Button,
  cn,
  controlHit,
  controlPress,
  controlSizes,
  EmptyState,
  Skeleton,
} from '@highsea-tv/ui'
import { collectionCaption, useCollections } from '../client/data.ts'
import { MediaPosterSkeleton } from '../client/media-card.tsx'
import { CollectionTile } from '../kit/collection-art.tsx'
import { PullToRefresh } from './pull.tsx'
import { gutter, Header, mobileHref } from './shell.tsx'

// the library's chip as a link (controls.md › Looks, Chip): its size, hit area and press from the
// control spec; the library's Chip is a button element with no `asChild`, so its look is named here, the
// current page taking the chosen chip's
const link = cn(
  'grid shrink-0 place-items-center whitespace-nowrap rounded-full border border-line-strong bg-s2 font-medium text-text-2 outline-none transition-press focus-visible:ring-focus aria-[current=page]:border-transparent aria-[current=page]:bg-control-selected aria-[current=page]:font-semibold aria-[current=page]:text-text',
  controlSizes.md.h,
  controlSizes.md.pad,
  controlSizes.md.text,
  controlHit,
  controlPress,
)

/** Movies, Shows, Collections or Music: the library's views, scrolling sideways when large text needs it. */
export function LibraryNav({ current }: { current: 'movies' | 'shows' | 'collections' | 'music' }) {
  return (
    <nav
      aria-label="Library"
      className={cn('-my-1 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none]', gutter)}
    >
      <a
        href={mobileHref('/library')}
        aria-current={current === 'movies' ? 'page' : undefined}
        className={link}
      >
        Movies
      </a>
      <a
        href={mobileHref('/library/shows')}
        aria-current={current === 'shows' ? 'page' : undefined}
        className={link}
      >
        Shows
      </a>
      <a
        href={mobileHref('/library/collections')}
        aria-current={current === 'collections' ? 'page' : undefined}
        className={link}
      >
        Collections
      </a>
      <a
        href={mobileHref('/library/music')}
        aria-current={current === 'music' ? 'page' : undefined}
        className={link}
      >
        Music
      </a>
    </nav>
  )
}

export function MobileCollections() {
  const list = useCollections('mobile')
  const xs = list.data ?? []
  return (
    <PullToRefresh onRefresh={list.refetch}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-1">
        <Header title="Library" />
        <LibraryNav current="collections" />
        {list.status === 'loading' ? (
          <div className={gutter}>
            <Skeleton className="my-1 h-3 w-20" />
          </div>
        ) : (
          <p className={cn('text-[13px] text-text-3', gutter)}>
            {list.status === 'success'
              ? `${xs.length} ${xs.length === 1 ? 'collection' : 'collections'}`
              : ' '}
          </p>
        )}
        <div className={gutter}>
          {list.status === 'loading' ? (
            <div aria-busy className="grid grid-cols-3 gap-x-2 gap-y-4">
              {Array.from({ length: 6 }, (_, i) => (
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
    </PullToRefresh>
  )
}
