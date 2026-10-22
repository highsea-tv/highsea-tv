// SPDX-License-Identifier: AGPL-3.0-only
// Library › Collections, TV (docs/product/collections.md#in-the-apps): Movies and Collections as a
// pair of choices under the global nav, then the collections as a poster grid, smart ones marked.
// Up from the grid reaches the choices, Up again the nav; focus starts on the first collection.
import { Icon } from '@highsea/ui-web'
import { collectionCaption, useCollections } from '../client/data.ts'
import { CollectionTile } from '../kit/collection-art.tsx'
import { GlobalNav, ServerIdentity, TvButton, TvMessage, tvHref, useInitialFocus } from './kit.tsx'

export const pill =
  'rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-[current=page]:bg-text/12 aria-[current=page]:text-text'

/** Movies or Collections: the library's two views, a D-pad group of their own. */
export function LibraryKind({
  current,
  down,
  right,
}: {
  current: 'movies' | 'collections'
  down: string
  right?: string
}) {
  return (
    <nav
      aria-label="Library"
      data-group="kind"
      data-go-up="nav"
      data-go-down={down}
      data-go-right={right}
      className="flex gap-[0.8cqw]"
    >
      <a
        href={tvHref('/library')}
        data-focusable=""
        aria-current={current === 'movies' ? 'page' : undefined}
        className={pill}
      >
        Movies
      </a>
      <a
        href={tvHref('/library/collections')}
        data-focusable=""
        aria-current={current === 'collections' ? 'page' : undefined}
        className={pill}
      >
        Collections
      </a>
    </nav>
  )
}

export function TvCollections() {
  const list = useCollections('tv')
  useInitialFocus(list.status === 'success', null, '[data-group="grid"] [data-focusable]')
  if (list.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the collections"
        actions={
          <TvButton primary initial onClick={list.refetch}>
            Try again
          </TvButton>
        }
      >
        {list.error.message}
      </TvMessage>
    )
  const xs = list.data ?? []
  return (
    <>
      <GlobalNav down="kind" />
      <main className="absolute inset-0 overflow-hidden [mask-image:linear-gradient(transparent,black_3.2cqw)]">
        <div
          data-scroll="y"
          data-keep="0.35"
          className="relative grid grid-cols-1 gap-[1.6cqw] px-(--tv-safe-x) pt-[7cqw] pb-[4cqw] transition-lift"
        >
          <ServerIdentity />
          <div className="flex items-end gap-[2cqw]">
            <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">
              Collections
            </h1>
            <LibraryKind current="collections" down="grid" />
          </div>
          {list.status === 'loading' ? (
            <div aria-busy className="grid place-items-center py-[6cqw]">
              <Icon name="loading" size={48} className="size-[3cqw] animate-spin text-text-3" />
            </div>
          ) : xs.length === 0 ? (
            <p className="text-(length:--tv-text-synopsis) text-text-2">
              No collections yet. When the server’s owner makes collections, they show up here.
            </p>
          ) : (
            <ul
              aria-label="Collections"
              data-group="grid"
              data-go-up="kind"
              className="grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]"
            >
              {xs.map((c) => (
                <li key={c.id}>
                  <CollectionTile
                    tv
                    href={tvHref(`/collections/${c.id}`)}
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
      </main>
    </>
  )
}
