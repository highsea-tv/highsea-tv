'use client'
import type { DiscoverSeries } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useQuery } from '@highsea-tv/sdk/react'
// SPDX-License-Identifier: AGPL-3.0-only
// Discover's shows (docs/product/shows.md#discover), moved from the prototype with D3 of the one
// client platform (one-client-platform-d.md, answer 5): a Movies and Shows choice beside the
// search, and `/discover/shows` with TMDB's trending shows until you type, then results. A show in
// the library opens its page; Add a show for the rest. Drawn only when the server serves shows
// (serves.tsx): the routes are drafts the mock answers and the server answers 501.
import { admin } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  Poster,
  Rating,
  SearchField,
  SegmentedControl,
  Text,
  tokens,
} from '@highsea-tv/ui/native'
import { type ReactNode, useDeferredValue, useState } from 'react'
import { View } from 'react-native'
import { AddShowDialog } from './add-show-dialog.tsx'
import { useAddressParam } from './address.ts'
import { Loadable, PosterSkeletons } from './loadable.tsx'
import { GridItem, InLibraryLink, PosterGrid } from './media-sections.tsx'
import { useRouter } from './navigation.tsx'
import { Served, useServes } from './serves.tsx'
import { AdminPage } from './shell.tsx'
import { showPath } from './show-data.ts'
import { SHOWS_TOPICS } from './shows-library.tsx'
import { shows as messages } from './shows-messages.ts'

type Kind = 'movies' | 'shows'

/** Movies or Shows, beside Discover's search: nothing while the server serves only films. */
export function FindKind({ value }: { value: Kind }) {
  const t = useT(messages)
  const router = useRouter()
  const shows = useServes('shows')
  if (!shows) return null
  return (
    <SegmentedControl
      aria-label={t('find')}
      value={value}
      onValueChange={(v) =>
        v !== value && router.push(v === 'shows' ? '/discover/shows' : '/discover')
      }
      options={[
        { value: 'movies', label: t('find.movies'), icon: 'movie' },
        { value: 'shows', label: t('find.shows'), icon: 'tv' },
      ]}
    />
  )
}

/** The row Discover's choice and search share, wrapping on a narrow window. */
export function FindRow({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: tokens.space['3'],
      }}
    >
      {children}
    </View>
  )
}

/** `/discover/shows`. */
export function DiscoverShows() {
  return (
    <Served source="shows">
      <Page />
    </Served>
  )
}

function Page() {
  const t = useT(messages)
  const [query, setQuery] = useAddressParam<string>('q', '')
  const deferred = useDeferredValue(query.trim())
  const results = useQuery(
    `discover-shows:${deferred}`,
    (c) => c.series.discover({ query: deferred ? { query: deferred } : {} }),
    SHOWS_TOPICS,
  )
  const [adding, setAdding] = useState<DiscoverSeries | null>(null)

  return (
    <AdminPage title={t('discover.title')} description={t('discover.description')}>
      <FindRow>
        <FindKind value="shows" />
        <View style={SEARCH}>
          <SearchField
            label={t('discover.search')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('discover.placeholder')}
            spellCheck={false}
            autoCorrect={false}
          />
        </View>
      </FindRow>
      <Text variant="title" role="heading" aria-level={2}>
        {deferred ? t('discover.results', { query: deferred }) : t('discover.trending')}
      </Text>
      <Loadable query={results} what={t('discover.what')} skeleton={<PosterSkeletons />}>
        {(shows) =>
          shows.length === 0 ? (
            deferred ? (
              <EmptyState icon="search" title={t('discover.nothing', { query: deferred })}>
                {t('discover.queryBody')}
              </EmptyState>
            ) : (
              <EmptyState icon="discover" title={t('discover.empty')}>
                {t('discover.emptyBody')}
              </EmptyState>
            )
          ) : (
            <PosterGrid>
              {shows.map((s) => (
                <Result key={s.id} show={s} onAdd={setAdding} />
              ))}
            </PosterGrid>
          )
        }
      </Loadable>
      <AddShowDialog show={adding} onOpenChange={(o) => !o && setAdding(null)} />
    </AdminPage>
  )
}

function Result({ show: s, onAdd }: { show: DiscoverSeries; onAdd: (s: DiscoverSeries) => void }) {
  const t = useT(messages)
  return (
    <GridItem gap={tokens.space['2']}>
      <View>
        <Poster
          title={s.title}
          src={s.art.poster}
          // a show not here yet has no page in the admin: Add is its one action
          href={s.inLibrary ? showPath(s.id) : undefined}
          showTitle
          titleSize="ui"
        />
        {/* the caption: the year and TMDB's rating, which a Poster's string caption can't hold */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: tokens.space['2'],
            marginTop: tokens.space['0.5'],
          }}
        >
          <Text variant="caption" color="text-3">
            {String(s.year)}
          </Text>
          {s.rating > 0 && <Rating value={s.rating} size={tokens.icon.size['2xs']} />}
        </View>
      </View>
      {s.inLibrary ? (
        <InLibraryLink
          href={showPath(s.id)}
          label={t('discover.inLibraryLabel', { title: s.title })}
          text={t('discover.inLibrary')}
        />
      ) : (
        <Button
          size="sm"
          icon="add"
          onPress={() => onAdd(s)}
          accessibilityLabel={t('discover.addLabel', { title: s.title })}
        >
          {t('discover.add')}
        </Button>
      )}
    </GridItem>
  )
}

/**
 * The search beside the choice: it takes the rest of the row up to the web's max-w-xl (576), and
 * a row of its own below 256 (the prototype's basis-64).
 */
export const SEARCH = {
  flexGrow: 1,
  flexBasis: admin.search.basis,
  minWidth: 0,
  maxWidth: admin.search.maxWidth,
} as const
