// SPDX-License-Identifier: AGPL-3.0-only
// A collection on the TV (reference, docs/product/client-search.md#collections): the ambient
// backdrop, the name, years and overview, then its titles here as a row, oldest first; a smart one says so and gives its rules in words. Focus
// starts on the first title; Back goes back to wherever it was opened from.
import { Icon } from '@highsea/ui-web'
import { useParams } from 'wouter'
import { useCollection } from '../client/data.ts'
import {
  ServerIdentity,
  TvButton,
  TvMessage,
  TvPoster,
  TvRow,
  tvHref,
  useInitialFocus,
} from './kit.tsx'

export function TvCollection() {
  const { id } = useParams<{ id: string }>()
  const found = useCollection(id, 'tv')
  useInitialFocus(found.status === 'success', id, '[data-group="parts"] [data-focusable]')
  if (found.status === 'loading')
    return (
      <main aria-busy className="grid h-full place-items-center">
        <Icon name="loading" size={48} className="size-[3cqw] animate-spin text-text-3" />
      </main>
    )
  if (found.status === 'error')
    return (
      <TvMessage
        title={found.error.message}
        actions={
          <TvButton primary initial href={tvHref('/search')}>
            Search
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )
  const { collection: c, items } = found.data
  return (
    <>
      <img
        src={c.art.backdrop}
        alt=""
        className="absolute inset-0 size-full scale-110 object-cover blur-[2.6cqw] brightness-[0.45]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_10%,transparent_70%)]" />
      <main className="absolute inset-0 grid content-start gap-[2.4cqw] overflow-hidden pt-[8cqw]">
        <ServerIdentity />
        <section aria-labelledby="title" className="grid max-w-[60cqw] gap-[1cqw] px-(--tv-safe-x)">
          <p className="text-(length:--tv-text-meta) text-text-3">
            {c.smart?.words ? 'Smart collection' : 'Collection'}
          </p>
          <h1 id="title" className="font-semibold text-[3.6cqw] leading-[0.95] tracking-display">
            {c.name}
          </h1>
          <p className="text-(length:--tv-text-meta) text-text-2">
            {c.count} {c.count === 1 ? 'movie' : 'movies'} here · {c.years}
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
        <TvRow group="parts" title="Movies">
          {items.map((m) => (
            <li key={m.id} className="w-(--tv-poster-width) shrink-0">
              <TvPoster item={m} href={tvHref(`/movies/${m.id}`)} />
            </li>
          ))}
        </TvRow>
      </main>
    </>
  )
}
