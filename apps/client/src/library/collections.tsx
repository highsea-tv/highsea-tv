// SPDX-License-Identifier: AGPL-3.0-only
// Collections (collections.md#in-the-apps): the owner's collections this person sees, smart ones
// marked, then TMDB's, as a grid of tiles. One composition per form factor:
// - touch (the prototype's mobile/collections.tsx), the body of the phone's Library under its
//   Movies and Collections (./library.tsx): the count, then three a row;
// - a pointer (web/collections.tsx): the title and count, then the grid across the page;
// - the TV (tv/collections.tsx): the title with All, Video and Audio beside it, and a section for
//   each family, seven a row. Until the owner can make collections of music every collection is
//   video, so Audio says there are none. Focus starts on the first collection, once.
import type { LibraryCollection } from '@highsea-tv/api-contract'
import { useCollections } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  Chip,
  EmptyState,
  Text,
  tokens,
  useControl,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { Kept, TV_HEAD_HEIGHT, TvGrid, TvMessage, TvPage, type ViewHandle } from '@highsea-tv/ui/tv'
import { type ReactElement, useCallback, useState } from 'react'
import { type RefreshControlProps, View } from 'react-native'
import { useDeviceClient } from '../host'
import { useChromeOverlay, useHeadDown } from '../kit.tsx'
import { libraryScreenMessages as messages } from './messages.ts'
import { LibraryCollectionTile, LibraryGridList, LibraryLoading, LibraryTitle } from './parts.tsx'
import { TV_LIBRARY } from './sizes.ts'

const { space } = tokens
const tv = tokens.tv

type Collections = ReturnType<typeof useCollections>

/** The grid's place when there are no tiles to draw: loading, an error, or none. */
function CollectionsState({ list }: { list: Collections }) {
  const t = useT(messages)
  if (list.status === 'loading') return <LibraryLoading touch={6} pointer={7} />
  if (list.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('collectionsFailed')}
        action={<Button onPress={list.refetch}>{t('tryAgain')}</Button>}
      >
        {list.error.message}
      </EmptyState>
    )
  return (
    <EmptyState icon="library" title={t('noCollectionsTitle')}>
      {t('noCollections')}
    </EmptyState>
  )
}

/** The phone's Collections, under the Library's title: its count, then the tiles. */
export function TouchCollections({
  list,
  header,
  refreshControl,
}: {
  list: Collections
  /** The Library's title and its views, above the count. */
  header: ReactElement
  refreshControl: ReactElement<RefreshControlProps>
}) {
  const t = useT(messages)
  const f = useFormat()
  const gutter = usePageGutter()
  return (
    <LibraryGridList
      items={list.status === 'success' ? list.data : []}
      keyOf={(c) => c.id}
      label={t('collections')}
      widthClass="compact"
      inset={gutter}
      bottom={space['8']}
      refreshControl={refreshControl}
      header={
        <View style={{ gap: space['4'], paddingBottom: space['4'] }}>
          {header}
          <Text variant="caption" color="text-3">
            {list.status === 'success' ? f.collections(list.data.length) : ''}
          </Text>
        </View>
      }
      empty={<CollectionsState list={list} />}
      render={(c) => <LibraryCollectionTile collection={c} />}
    />
  )
}

export function PointerCollections() {
  const t = useT(messages)
  const f = useFormat()
  const theme = useTheme()
  const gutter = usePageGutter()
  const list = useCollections(useDeviceClient())
  const [across, setAcross] = useState(0)
  // the content is centred at the web's greatest width
  const inset = Math.max(0, (across - web.maxWidth) / 2) + gutter
  return (
    <View
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      onLayout={(e) => setAcross(e.nativeEvent.layout.width)}
    >
      <LibraryGridList
        items={list.status === 'success' ? list.data : []}
        keyOf={(c) => c.id}
        label={t('collections')}
        inset={inset}
        bottom={space['16']}
        header={
          <View style={{ gap: space['1'], paddingTop: space['6'], paddingBottom: space['6'] }}>
            <Text variant="heading" accessibilityRole="header" aria-level={1}>
              {t('collections')}
            </Text>
            {list.status === 'success' ? (
              <Text variant="caption" color="text-3">
                {f.collections(list.data.length)}
              </Text>
            ) : null}
          </View>
        }
        empty={<CollectionsState list={list} />}
        render={(c) => <LibraryCollectionTile collection={c} />}
      />
    </View>
  )
}

type Family = 'video' | 'audio'
type FamilyShown = 'all' | Family
const CHOICES = ['all', 'video', 'audio'] as const satisfies FamilyShown[]
const FAMILIES = ['video', 'audio'] as const satisfies Family[]

/** A collection's family: video for every one until the server sends it (music's phase). */
const familyOf = (_c: LibraryCollection): Family => 'video'

export function TvCollections() {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const list = useCollections(useDeviceClient())
  const [show, setShow] = useState<FamilyShown>('all')
  const [arrived, setArrived] = useState(false)
  // the head lies over the page and scrolls away with it, as the prototype's; Down from it lands
  // on the kinds (the prototype's down="kind")
  const chrome = useChromeOverlay()
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((v: ViewHandle | null) => setDown(v), [])
  useHeadDown(down)
  if (list.status === 'error')
    return (
      <TvMessage
        title={t('collectionsFailed')}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={list.refetch}>
            {t('tryAgain')}
          </Button>
        }
      >
        {list.error.message}
      </TvMessage>
    )
  const xs = list.data ?? []
  const shown = FAMILIES.filter((x) => show === 'all' || show === x)
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <TvPage
        keep={0.35}
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
      >
        <View
          style={{
            paddingHorizontal: tv.safe.x * u,
            // clear of the head laid over the page
            paddingTop: (TV_HEAD_HEIGHT + TV_LIBRARY.pageGap) * u,
            paddingBottom: tv.safe.y * u,
            gap: TV_LIBRARY.pageGap * u,
          }}
        >
          <Kept
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: TV_LIBRARY.headGap * u }}
          >
            <LibraryTitle>{t('collections')}</LibraryTitle>
            <View style={{ flexDirection: 'row', gap: m.gap }}>
              {CHOICES.map((c, i) => (
                <Chip
                  key={c}
                  ref={i === 0 ? downRef : undefined}
                  selected={show === c}
                  onPress={() => setShow(c)}
                >
                  {t(`family.${c}`)}
                </Chip>
              ))}
            </View>
          </Kept>
          {list.status === 'loading' ? (
            <LibraryLoading tv={7} />
          ) : (
            <View role="list" accessibilityLabel={t('collections')} style={{ gap: tv.safe.y * u }}>
              {shown.map((family, s) => {
                const mine = xs.filter((c) => familyOf(c) === family)
                return (
                  <View
                    key={family}
                    role="listitem"
                    accessibilityLabel={t(`family.${family}`)}
                    style={{ gap: TV_LIBRARY.sectionGap * u }}
                  >
                    {/* All names each section; a family on its own is named by its choice */}
                    {show === 'all' ? (
                      <Text
                        variant="rowTitle"
                        weight={600}
                        accessibilityRole="header"
                        aria-level={2}
                      >
                        {t(`family.${family}`)}
                      </Text>
                    ) : null}
                    {mine.length === 0 ? (
                      <Text variant="synopsis" color="text-2">
                        {family === 'video' ? t('noVideo') : t('noAudio')}
                      </Text>
                    ) : (
                      <TvGrid
                        items={mine}
                        keyOf={(c) => c.id}
                        render={(c, at) => (
                          <LibraryCollectionTile
                            collection={c}
                            width={at.width}
                            preferred={!arrived && s === 0 && at.index === 0}
                            onFocus={() => setArrived(true)}
                          />
                        )}
                      />
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </TvPage>
    </View>
  )
}
