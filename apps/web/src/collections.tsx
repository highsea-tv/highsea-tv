// SPDX-License-Identifier: AGPL-3.0-only
// Library › Collections and a collection on the web (docs/product/collections.md#in-the-apps,
// client-search.md#collections), ported from design/prototypes/src/web/collections.tsx and
// collection.tsx: the owner's collections this person sees, marked smart, then TMDB's; and one
// collection's titles here, oldest first, over the first part's backdrop.
import { useCollection, useCollections } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { Button, cn, EmptyState, Skeleton, SkeletonText } from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { media } from './host.ts'
import { CollectionTile } from './kit.tsx'
import { ItemPoster, LibraryNav, PosterGridSkeleton } from './library.tsx'
import { library as messages } from './messages.ts'
import { gutter, href, useFormat } from './shell.tsx'

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

export function WebCollections() {
  const t = useT(messages)
  const f = useFormat()
  const list = useCollections('web')
  const xs = list.data ?? []
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <div className="grid gap-3">
        <LibraryNav current="collections" />
        <div className="grid gap-1">
          <h1 className="text-heading">{t('collections')}</h1>
          {list.status === 'success' && (
            <p className="text-caption text-text-3">{f.collections(xs.length)}</p>
          )}
        </div>
      </div>
      {list.status === 'loading' ? (
        <PosterGridSkeleton count={7} />
      ) : list.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title={t('collectionsFailed')}
          action={<Button onClick={list.refetch}>{t('tryAgain')}</Button>}
        >
          {list.error.message}
        </EmptyState>
      ) : xs.length === 0 ? (
        <EmptyState icon="library" title={t('noCollectionsTitle')}>
          {t('noCollections')}
        </EmptyState>
      ) : (
        <ul aria-label={t('collections')} className={grid}>
          {xs.map((c) => {
            const caption = f.caption(c)
            const smart = !!c.smart?.words
            return (
              <li key={c.id}>
                <CollectionTile
                  href={href(`/collections/${c.id}`)}
                  label={t(smart ? 'smartTileLabel' : 'tileLabel', { name: c.name, caption })}
                  name={c.name}
                  caption={caption}
                  poster={media(c.art.poster)}
                  mosaic={c.smart?.mosaic}
                  smart={smart ? t('smart') : null}
                />
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

export function WebCollection() {
  const t = useT(messages)
  const f = useFormat()
  const { id } = useParams<{ id: string }>()
  const found = useCollection(id, 'web')
  if (found.status === 'loading')
    return (
      <main aria-busy className={cn('mx-auto w-full grid max-w-[1680px] gap-4 pt-8', gutter)}>
        <Skeleton className="h-10 w-80" />
        <SkeletonText lines={2} />
      </main>
    )
  if (found.status === 'error')
    return (
      <main className="grid min-h-[70vh] place-items-center px-4">
        <EmptyState
          icon="library"
          tone="error"
          title={t('collectionMissing')}
          action={
            <Button variant="primary" asChild>
              <a href={href('/library/collections')}>{t('collections')}</a>
            </Button>
          }
        >
          {t('collectionGone')}
        </EmptyState>
      </main>
    )
  const { collection: c, items } = found.data
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-16">
      <header className="relative">
        {c.art.backdrop && (
          <img
            src={media(c.art.backdrop)}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent)]" />
        <div className={cn('relative mx-auto w-full grid max-w-[1680px] gap-2 pt-24 pb-6', gutter)}>
          <p className="font-mono text-label text-text-3 uppercase">
            {c.smart?.words ? t('smartCollection') : t('collection')}
          </p>
          <h1 className="text-display">{c.name}</h1>
          <p className="text-text-2 text-ui">
            {c.years
              ? t('hereYears', { movies: f.moviesHere(c.count), years: c.years })
              : f.moviesHere(c.count)}
          </p>
          {c.smart?.words && <p className="text-caption text-text-3">{c.smart.words}</p>}
          {c.overview && <p className="max-w-[60ch] text-body text-text-2">{c.overview}</p>}
        </div>
      </header>
      <ul
        aria-label={t('movies')}
        className={cn('mx-auto w-full w-full max-w-[1680px]', grid, gutter)}
      >
        {items.map((m) => (
          <li key={m.id}>
            <ItemPoster item={m} />
          </li>
        ))}
      </ul>
    </main>
  )
}
