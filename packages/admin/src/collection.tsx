'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page, `/collections/{tmdbId}` (media-pages.md; checkpoint 4 plan, Addresses are
// TMDB ids, and judgement call 5: the route loses `/metadata/`). The prototype has no page of its
// own for a collection: it shows one as the Collection row on its parts' pages, with the name,
// "{n} of {total} in the library" and Add {n} missing. This page is the smallest addition around
// that row: the media page's hero (HT-105, the clients' treatment: the backdrop full bleed behind
// the top row, the logo when there is one, the count and the overview), then the same row.

import type { DiscoverMovie } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { Button, Text } from '@highsea-tv/ui/native'
import { useState } from 'react'
import { AddMovieDialog } from './add-dialog.tsx'
import { ArtworkDialog } from './artwork-dialog.tsx'
import { artwork as artworkMessages } from './artwork-messages.ts'
import { collection as messages } from './collection-messages.ts'
import {
  CollectionRow,
  HeroWords,
  MetadataError,
  SummarySkeleton,
  useCollection,
} from './media-sections.tsx'
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
  const [changingArt, setChangingArt] = useState(false)
  const ta = useT(artworkMessages)
  const c = collection.data
  const here = c ? c.parts.filter((p) => p.inLibrary).length : 0

  return (
    <AdminPage
      title={c?.name ?? t('collection')}
      actions={
        c ? (
          <Button icon="grid" onPress={() => setChangingArt(true)}>
            {ta('open')}
          </Button>
        ) : undefined
      }
      backdrop={c?.art.backdrop ?? null}
      hero={
        c ? (
          <HeroWords label={t('summary')} logo={c.art.logo ?? null} title={c.name}>
            <Text variant="caption" color="text-2">
              {tm('collection.suffix', { here, total: c.parts.length })}
            </Text>
            <Text variant="body" color="text-2">
              {c.overview || t('noOverview')}
            </Text>
          </HeroWords>
        ) : undefined
      }
    >
      {collection.status === 'error' ? (
        <MetadataError
          error={collection.error}
          unknown={{ title: t('unknown.title'), body: t('unknown.body') }}
        />
      ) : !c ? (
        <SummarySkeleton />
      ) : (
        c.parts.length > 0 && <CollectionRow collection={c} title={t('parts')} onAdd={setAdding} />
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
      {c ? (
        <ArtworkDialog
          owner="collection"
          id={id}
          title={c.name}
          open={changingArt}
          onOpenChange={setChangingArt}
        />
      ) : null}
    </AdminPage>
  )
}
