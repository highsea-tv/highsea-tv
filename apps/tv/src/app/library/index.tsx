// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library, TV (client-library.md#tv, the prototype's tv/library.tsx): the poster grid, seven a
// row with each title and year, under the heading with Movies or Collections and the sort's
// choices. Sorted A–Z, an alphabet rail sits on the left: Left from the grid's first column
// reaches it on the focused title's letter, only letters with titles take focus, and OK moves
// focus to that letter's first title. The page follows focus, keeping it 35% down the screen.
import type { ClientItem } from '@highsea-tv/api-contract'
import { useLibrary } from '@highsea-tv/client/data'
import { arrange, type Sort, sortTitle } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { Text, tokens, useTheme } from '@highsea-tv/ui-native'
import {
  alpha,
  Focusable,
  focusOn,
  TvButton,
  TvChip,
  TvMessage,
  TvTile,
  type ViewHandle,
} from '@highsea-tv/ui-native/tv'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, TVFocusGuideView, View } from 'react-native'
import { GlobalNav, LibraryHeader, ServerIdentity, TvGrid, TvPage, Words } from '../../kit.tsx'
import { library as messages } from '../../messages.ts'

const tv = tokens.tv

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
/** The rail's letter for a title, filed as the sort files it ("The Matrix" under M). */
const letterOf = (title: string) => {
  const c = sortTitle(title).charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

const SORTS = ['title', 'added', 'year'] as const satisfies Sort[]

export default function Library() {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const library = useLibrary()
  const [sort, setSort] = useState<Sort>('title')
  const [unwatched, setUnwatched] = useState(false)
  const firsts = useRef(new Map<string, ViewHandle | null>())
  const [at, setAt] = useState('')

  if (library.status === 'error')
    return (
      <TvMessage
        title={t('failed')}
        actions={
          <TvButton primary preferred onPress={library.refetch}>
            {t('tryAgain')}
          </TvButton>
        }
      >
        {library.error.message}
      </TvMessage>
    )
  const all = library.data ?? []
  const items = arrange(all, 'all', sort, unwatched)
  const present = new Set(items.map((m) => letterOf(m.title)))
  const rail = sort === 'title' && items.length > 0

  return (
    <View style={{ flex: 1 }}>
      <TvPage keep={0.35}>
        <ServerIdentity />
        <View
          style={{
            paddingHorizontal: tv.safe.x * u,
            paddingTop: 7 * u,
            paddingBottom: 4 * u,
            gap: 1.6 * u,
          }}
        >
          <LibraryHeader current="movies">
            <Choices
              sort={sort}
              unwatched={unwatched}
              onSort={setSort}
              onUnwatched={() => setUnwatched((x) => !x)}
            />
          </LibraryHeader>
          {library.status === 'loading' ? (
            <View accessibilityState={{ busy: true }} style={{ paddingVertical: 6 * u }}>
              <ActivityIndicator size="large" color={theme.colors['text-3']} />
            </View>
          ) : all.length === 0 ? (
            <Words title={t('emptyTitle')}>{t('emptyBody')}</Words>
          ) : items.length === 0 ? (
            <Words title={t('noUnwatched')}>
              <TvButton onPress={() => setUnwatched(false)}>{t('allMovies')}</TvButton>
            </Words>
          ) : (
            <Grid items={items} sort={sort} firsts={firsts.current} onLetter={setAt} />
          )}
        </View>
      </TvPage>
      {rail ? (
        <Rail
          present={present}
          at={at}
          label={t('letters')}
          onLetter={(l) => focusOn(firsts.current.get(l))}
        />
      ) : null}
      <GlobalNav />
    </View>
  )
}

function Choices({
  sort,
  unwatched,
  onSort,
  onUnwatched,
}: {
  sort: Sort
  unwatched: boolean
  onSort: (s: Sort) => void
  onUnwatched: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  return (
    <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 0.8 * u }}>
      {SORTS.map((s) => (
        <TvChip key={s} chosen={sort === s} onPress={() => onSort(s)}>
          {t(`sort.${s}`)}
        </TvChip>
      ))}
      <View
        style={{
          width: 1,
          alignSelf: 'stretch',
          marginHorizontal: 0.4 * u,
          backgroundColor: alpha(theme.colors.text, 0.2),
        }}
      />
      <TvChip chosen={unwatched} onPress={onUnwatched}>
        {t('unwatched')}
      </TvChip>
    </View>
  )
}

function Grid({
  items,
  sort,
  firsts,
  onLetter,
}: {
  items: ClientItem[]
  sort: Sort
  firsts: Map<string, ViewHandle | null>
  onLetter: (letter: string) => void
}) {
  const media = useMedia()
  firsts.clear()
  return (
    <TvGrid
      items={items}
      keyOf={(m) => m.id}
      render={(m, at) => {
        const l = letterOf(m.title)
        const first =
          sort === 'title' && (at.index === 0 || letterOf(items[at.index - 1]?.title ?? '') !== l)
        return (
          <TvTile
            ref={
              first
                ? (node) => {
                    firsts.set(l, node)
                  }
                : undefined
            }
            preferred={at.index === 0}
            title={m.title}
            caption={m.year ? String(m.year) : ''}
            src={media(m.art.poster)}
            width={at.width}
            progress={m.progress}
            onFocus={() => onLetter(l)}
            onPress={() => router.push(`/movies/${m.id}`)}
            onPlay={() => router.push(`/play/${m.id}`)}
          />
        )
      }}
    />
  )
}

/**
 * The alphabet rail: fixed at the left edge, outside the page, so it never scrolls away. The
 * focus engine would enter it at whichever letter lies level with the tile, so its guide sends
 * focus to the focused title's letter instead (TVFocusGuideView `destinations`).
 */
function Rail({
  present,
  at,
  label,
  onLetter,
}: {
  present: Set<string>
  at: string
  label: string
  onLetter: (letter: string) => void
}) {
  const theme = useTheme()
  const u = theme.u
  const stops = useRef(new Map<string, ViewHandle | null>())
  const to = stops.current.get(at)
  return (
    <TVFocusGuideView
      destinations={to ? [to] : []}
      accessibilityLabel={label}
      style={{
        position: 'absolute',
        top: 7 * u,
        left: 1.2 * u,
        gap: 0.1 * u,
        zIndex: 10,
      }}
    >
      {LETTERS.map((l) => {
        const has = present.has(l)
        return (
          <Focusable
            key={l}
            ref={(node) => {
              stops.current.set(l, node)
            }}
            disabled={!has}
            ring={false}
            radius={0.3 * u}
            label={l}
            onPress={() => onLetter(l)}
          >
            {(focused) => (
              <View
                style={{
                  height: 1.55 * u,
                  width: 2.2 * u,
                  borderRadius: 0.3 * u,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? theme.colors.text : 'transparent',
                  transform: [{ scale: focused ? 1.25 : 1 }],
                }}
              >
                <Text
                  variant="quality"
                  color={focused ? 'bg' : has ? 'text-2' : 'text-3'}
                  style={{ opacity: has ? 1 : 0.4 }}
                >
                  {l}
                </Text>
              </View>
            )}
          </Focusable>
        )
      })}
    </TVFocusGuideView>
  )
}
