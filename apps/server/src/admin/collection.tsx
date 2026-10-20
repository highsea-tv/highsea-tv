'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page, `/collections/{tmdbId}` (media-pages.md; checkpoint 4 plan, Addresses are
// TMDB ids, and judgement call 5: the route loses `/metadata/`). The prototype has no page of its
// own for a collection: it shows one as the Collection row on its parts' pages, with the name,
// "{n} of {total} in the library" and Add {n} missing. This page is the smallest addition around
// that row: the media page's summary card (backdrop, poster, overview), then the same row.

import type { DiscoverMovie } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { Poster } from '@highsea/ui-web'
import { useState } from 'react'
import { AddMovieDialog } from './add-dialog.tsx'
import { collection as messages } from './collection-messages.ts'
import { CollectionRow, MetadataError, SummarySkeleton, useCollection } from './media-sections.tsx'
import { media } from './media-sections-messages.ts'
import { parseTmdbId } from './movie-detail.tsx'
import { AdminPage } from './shell.tsx'

export function CollectionPage({ id: raw }: { id: string }) {
  const id = parseTmdbId(raw)
  const t = useT(messages)
  if (id === null)
    return (
      <AdminPage title={t('collection')}>
        <MetadataError
          error={Object.assign(new Error(''), { status: 404 })}
          unknown={{ title: t('unknown.title'), body: t('unknown.body') }}
        />
      </AdminPage>
    )
  return <CollectionById id={id} />
}

function CollectionById({ id }: { id: number }) {
  const t = useT(messages)
  const tm = useT(media)
  // refetched as parts are added, so their badges and the count follow
  const collection = useCollection(id)
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const c = collection.data
  const here = c ? c.parts.filter((p) => p.inLibrary).length : 0

  return (
    <AdminPage title={c?.name ?? t('collection')}>
      {collection.status === 'error' ? (
        <MetadataError
          error={collection.error}
          unknown={{ title: t('unknown.title'), body: t('unknown.body') }}
        />
      ) : !c ? (
        <SummarySkeleton />
      ) : (
        <>
          <section
            aria-label={t('summary')}
            className="relative isolate grid gap-5 overflow-hidden rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[9rem_minmax(0,1fr)] medium:p-5"
          >
            {c.art.backdrop && (
              // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
              <img
                src={c.art.backdrop}
                alt=""
                className="-z-10 absolute inset-0 size-full object-cover opacity-15"
              />
            )}
            <Poster title={c.name} src={c.art.poster ?? undefined} className="w-32 medium:w-full" />
            <div className="grid grid-cols-1 content-start gap-3">
              <p className="text-caption text-text-2">
                {tm('collection.suffix', { here, total: c.parts.length })}
              </p>
              <p className="max-w-[65ch] text-body text-text-2">{c.overview || t('noOverview')}</p>
            </div>
          </section>
          {c.parts.length > 0 && (
            <CollectionRow collection={c} title={t('parts')} onAdd={setAdding} />
          )}
        </>
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}
