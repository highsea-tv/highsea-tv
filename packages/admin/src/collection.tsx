'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page, `/collections/{tmdbId}` (media-pages.md; checkpoint 4 plan, Addresses are
// TMDB ids, and judgement call 5: the route loses `/metadata/`). The prototype has no page of its
// own for a collection: it shows one as the Collection row on its parts' pages, with the name,
// "{n} of {total} in the library" and Add {n} missing. This page is the smallest addition around
// that row: the media page's summary card (backdrop, poster, overview), then the same row.

import type { DiscoverMovie } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { breakpoints } from '@highsea-tv/tokens'
import { Image, Poster, Text, tokens, useTheme, useWindowAtLeast } from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
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
          <Summary
            label={t('summary')}
            backdrop={c.art.backdrop}
            poster={c.art.poster}
            name={c.name}
          >
            <Text variant="caption" color="text-2">
              {tm('collection.suffix', { here, total: c.parts.length })}
            </Text>
            <Text variant="body" color="text-2" style={{ maxWidth: MEASURE }}>
              {c.overview || t('noOverview')}
            </Text>
          </Summary>
          {c.parts.length > 0 && (
            <CollectionRow collection={c} title={t('parts')} onAdd={setAdding} />
          )}
        </>
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}

/** The overview's measure (the web's max-w-[65ch] at the body's 15). */
const MEASURE = 600
/** The poster's column from medium (the web's 9rem), and its width in a compact window (w-32). */
const POSTER = { beside: 144, above: 128 }
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const

/** The media page's summary card: the backdrop faint behind, the poster, and the words beside it. */
function Summary({
  label,
  backdrop,
  poster,
  name,
  children,
}: {
  label: string
  backdrop: string | null
  poster: string | null
  name: string
  children: ReactNode
}) {
  const theme = useTheme()
  const beside = useWindowAtLeast(breakpoints.medium)
  const s = tokens.space
  return (
    <View
      role="region"
      aria-label={label}
      style={{
        position: 'relative',
        overflow: 'hidden',
        flexDirection: beside ? 'row' : 'column',
        alignItems: 'flex-start',
        gap: s['5'],
        padding: beside ? s['5'] : s['4'],
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
      }}
    >
      {backdrop ? (
        <Image
          source={{ uri: backdrop }}
          alt=""
          aria-hidden
          contentFit="cover"
          style={[FILL, { opacity: 0.15 }]}
        />
      ) : null}
      <Poster
        title={name}
        src={poster ?? undefined}
        showTitle={false}
        width={beside ? POSTER.beside : POSTER.above}
      />
      <View style={{ flex: beside ? 1 : undefined, minWidth: 0, gap: s['3'] }}>{children}</View>
    </View>
  )
}
