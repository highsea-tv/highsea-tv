// SPDX-License-Identifier: AGPL-3.0-only
// A collection on the TV (reference, docs/product/client-search.md#collections): the ambient
// backdrop, the name, years and overview, then its titles here as a row, oldest first; a smart one says so and gives its rules in words. Focus
// starts on the first title; Back goes back to wherever it was opened from. A collection holds
// films and shows in any mix, so the row is named by what's in it: Films, Shows, or Films and
// shows, the films first.
import { Skeleton } from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { titlesHere, titlesRow, useCollection } from '../client/data.ts'
import type { ClientItem, ClientShow } from '../mock/types.ts'
import { TvFilmRow, TvFilmRowSkeleton } from './film-row.tsx'
import { TvButton, TvHead, TvMessage, tvHref, useInitialFocus } from './kit.tsx'

export function TvCollection() {
  const { id } = useParams<{ id: string }>()
  const found = useCollection(id, 'tv')
  useInitialFocus(found.status === 'success', id, '[data-group="parts"] [data-focusable]')
  if (found.status === 'loading')
    return (
      <main aria-busy className="absolute inset-0 grid content-start gap-[1.6cqw] overflow-hidden">
        <TvHead className="px-(--tv-safe-x)" />
        <div className="grid max-w-[60cqw] gap-[1cqw] px-(--tv-safe-x)">
          <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[10cqw]" />
          <Skeleton className="my-[0.2cqw] h-[3.4cqw] w-[32cqw] rounded-[0.5cqw]" />
          <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[16cqw]" />
          <div className="grid max-w-[44cqw] gap-[0.6cqw] py-[0.2cqw]">
            <Skeleton className="h-[1.1cqw] w-full" />
            <Skeleton className="h-[1.1cqw] w-3/5" />
          </div>
        </div>
        <TvFilmRowSkeleton />
      </main>
    )
  if (found.status === 'error')
    return (
      <TvMessage
        title={found.error.message}
        actions={
          <TvButton primary initial href={tvHref('/collections')}>
            Collections
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )
  const { collection: c, items, shows } = found.data
  const titles: (ClientItem | ClientShow)[] = [...items, ...shows]
  const row = titlesRow(items.length, shows.length)
  return (
    <>
      <img
        src={c.art.backdrop}
        alt=""
        className={`absolute inset-0 h-full w-full scale-110 object-cover blur-[2.6cqw] brightness-[0.45]`}
      />
      <div
        className={`absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_10%,transparent_70%)]`}
      />
      <main className="absolute inset-0 grid content-start gap-[1.6cqw] overflow-hidden">
        <TvHead down="parts" className="px-(--tv-safe-x)" />
        <section aria-labelledby="title" className="grid max-w-[60cqw] gap-[1cqw] px-(--tv-safe-x)">
          <p className="text-(length:--tv-text-meta) text-text-3">
            {c.smart?.words ? 'Smart collection' : 'Collection'}
          </p>
          <h1 id="title" className="font-semibold text-[3.6cqw] leading-[0.95] tracking-display">
            {c.name}
          </h1>
          <p className="text-(length:--tv-text-meta) text-text-2">
            {titlesHere(items.length, shows.length)} here · {c.years}
          </p>
          {c.smart?.words && (
            <p className="text-(length:--tv-text-pill) text-text-3">{c.smart.words}</p>
          )}
          {c.overview && (
            <p className="line-clamp-3 max-w-[44cqw] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
              {c.overview}
            </p>
          )}
        </section>
        <TvFilmRow
          group="parts"
          title={row}
          goUp="nav"
          items={titles}
          hrefOf={(m) => tvHref('seasons' in m ? `/shows/${m.id}` : `/movies/${m.id}`)}
        />
      </main>
    </>
  )
}
