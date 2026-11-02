// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library, TV (client-library.md#tv, the prototype's tv/library.tsx): Movies is its own
// destination in the head, so the title stands alone, with the sort, Unwatched and the genre as a
// row of choices on its right; Up from the grid reaches them. The poster grid, seven a row with
// each title and year, follows focus. Sorted A–Z, the alphabet rail has a column of its own at the
// left (@highsea-tv/ui/tv's TvLetterRail): Left from the grid's first column reaches it, and OK
// moves focus to that letter's first title. Focus starts on the grid's first title; after that,
// choosing a sort or a view keeps focus on the choice, so the next one is a press away (the owner,
// 2026-10-31). An empty library says so, and choices that match nothing offer Show everything.
import type { ClientItem } from '@highsea-tv/api-contract'
import { useLibrary } from '@highsea-tv/client/data'
import { ALL, arrange, genresOf, LETTERS, letterOf, type Sort } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { Button, Chip, Text, tokens, useTheme } from '@highsea-tv/ui'
import {
  alpha,
  focusOn,
  Kept,
  RAIL_WIDTH,
  TvGrid,
  TvLetterRail,
  TvMenu,
  TvMessage,
  TvPage,
  TvTile,
  TvWords,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { router } from 'expo-router'
import { type ReactNode, useRef, useState } from 'react'
import { ActivityIndicator, Modal, useWindowDimensions, View } from 'react-native'
import { TvHead } from '../../kit.tsx'
import { library as messages } from '../../messages.ts'

const tv = tokens.tv

/** The TV's sorts: the prototype's three, without the phone's and web's Highest rated. */
const SORTS = ['title', 'added', 'year'] as const satisfies Sort[]

export default function Movies() {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const { width } = useWindowDimensions()
  const library = useLibrary()
  const [sort, setSort] = useState<Sort>('title')
  const [unwatched, setUnwatched] = useState(false)
  const [genre, setGenre] = useState(ALL)
  // focus starts on the grid once; Show everything starts it there again
  const [arrived, setArrived] = useState(false)
  const firsts = useRef(new Map<string, ViewHandle | null>())
  const [at, setAt] = useState('')
  const [railTop, setRailTop] = useState(0)
  const gridBox = useRef<ViewHandle>(null)
  const firstChoice = useRef<ViewHandle>(null)

  if (library.status === 'error')
    return (
      <TvMessage
        title={t('failed')}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={library.refetch}>
            {t('tryAgain')}
          </Button>
        }
      >
        {library.error.message}
      </TvMessage>
    )
  const all = library.data ?? []
  const none = library.status === 'success' && all.length === 0
  const items = arrange(all, genre, sort, unwatched)
  const present = new Set(items.map((m) => letterOf(m.title)))
  const titled = sort === 'title' && items.length > 0
  const room = titled ? RAIL_WIDTH + tv.poster.gap : 0

  return (
    <View style={{ flex: 1 }}>
      <TvPage keep={0.4}>
        <TvHead down={none ? null : firstChoice.current} />
        <View
          style={{
            paddingHorizontal: tv.safe.x * u,
            paddingTop: 1.6 * u,
            paddingBottom: tv.safe.y * u,
            gap: 1.6 * u,
          }}
        >
          <Kept style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 * u }}>
            <Text
              size={2.6}
              weight={600}
              accessibilityRole="header"
              style={{ lineHeight: 2.6 * u }}
            >
              {t('movies')}
            </Text>
            {/* nothing to sort or filter in an empty library */}
            {none ? null : (
              <View
                style={{
                  marginLeft: 'auto',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 0.8 * u,
                }}
              >
                {SORTS.map((s, i) => (
                  <Chip
                    key={s}
                    ref={i === 0 ? firstChoice : undefined}
                    selected={sort === s}
                    onPress={() => setSort(s)}
                  >
                    {t(`sort.${s}`)}
                  </Chip>
                ))}
                <View
                  style={{
                    width: 1,
                    alignSelf: 'stretch',
                    marginHorizontal: 0.4 * u,
                    backgroundColor: alpha(theme.colors.text, 0.2),
                  }}
                />
                <Chip selected={unwatched} onPress={() => setUnwatched((x) => !x)}>
                  {t('unwatched')}
                </Chip>
                <GenreChoice genres={genresOf(all)} value={genre} onPick={setGenre} />
              </View>
            )}
          </Kept>
          {library.status === 'loading' ? (
            <View accessibilityState={{ busy: true }} style={{ paddingVertical: 6 * u }}>
              <ActivityIndicator size="large" color={theme.colors['text-3']} />
            </View>
          ) : none ? (
            <TvWords title={t('emptyTitle')}>{t('emptyBody')}</TvWords>
          ) : items.length === 0 ? (
            <TvWords title={t('nothingTitle')}>
              <Text variant="meta" color="text-3">
                {genre === ALL
                  ? t('noUnwatched')
                  : unwatched
                    ? t('watchedAllIn', { genre })
                    : t('nothingIn', { genre })}
              </Text>
              <Button
                variant="overlay"
                onPress={() => {
                  setGenre(ALL)
                  setUnwatched(false)
                  setArrived(false)
                }}
              >
                {t('showEverything')}
              </Button>
            </TvWords>
          ) : (
            <View
              // the rail is placed over the screen, so the grid's top is measured on the screen,
              // not in its parent (onLayout's y)
              ref={gridBox}
              onLayout={() =>
                gridBox.current?.measureInWindow((_x, y) => setRailTop((was) => was || y))
              }
              style={{ paddingLeft: room * u }}
            >
              <Grid
                items={items}
                sort={sort}
                span={width / u - 2 * tv.safe.x - room}
                firsts={firsts.current}
                preferred={!arrived}
                onArrive={() => setArrived(true)}
                onLetter={setAt}
              />
            </View>
          )}
        </View>
      </TvPage>
      {titled && railTop ? (
        <TvLetterRail
          letters={LETTERS}
          present={present}
          at={at}
          top={railTop}
          label={t('letters')}
          onLetter={(l) => focusOn(firsts.current.get(l))}
        />
      ) : null}
    </View>
  )
}

/**
 * The genre, the last of the choices, as the web and phone have it: OK opens the genres over the
 * page in three columns, with the one in force focused; choosing one closes them and focus stays
 * on this choice, as it does on the sorts (the owner, 2026-10-31).
 */
function GenreChoice({
  genres,
  value,
  onPick,
}: {
  genres: string[]
  value: string
  onPick: (genre: string) => void
}) {
  const t = useT(messages)
  const [open, setOpen] = useState(false)
  const chip = useRef<ViewHandle>(null)
  const label = value === ALL ? t('allGenres') : value
  const close = () => {
    setOpen(false)
    setTimeout(() => focusOn(chip.current), 0)
  }
  return (
    <>
      <Chip
        ref={chip}
        selected={value !== ALL}
        iconEnd="chevron-down"
        accessibilityLabel={t('genreIs', { genre: label })}
        onPress={() => setOpen(true)}
      >
        {label}
      </Chip>
      {open ? (
        <Overlay onClose={close}>
          <TvMenu
            title={t('genre')}
            columns={3}
            options={[ALL, ...genres].map((g) => ({
              label: g === ALL ? t('allGenres') : g,
              current: g === value,
              onPress: () => {
                onPick(g)
                close()
              },
            }))}
          />
        </Overlay>
      ) : null}
    </>
  )
}

/**
 * The menu over the whole screen, not inside the row of choices it opens from. Back closes it: a
 * Modal's `onRequestClose` answers tvOS's Menu key and Android TV's Back
 * (https://reactnative.dev/docs/modal#onrequestclose).
 */
function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      {children}
    </Modal>
  )
}

function Grid({
  items,
  sort,
  span,
  firsts,
  preferred,
  onArrive,
  onLetter,
}: {
  items: ClientItem[]
  sort: Sort
  span: number
  firsts: Map<string, ViewHandle | null>
  preferred: boolean
  onArrive: () => void
  onLetter: (letter: string) => void
}) {
  const media = useMedia()
  firsts.clear()
  return (
    <TvGrid
      items={items}
      span={span}
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
            preferred={preferred && at.index === 0}
            title={m.title}
            caption={m.year ? String(m.year) : ''}
            src={media(m.art.poster)}
            width={at.width}
            progress={m.progress}
            onFocus={() => {
              onArrive()
              onLetter(l)
            }}
            onPress={() => router.push(`/movies/${m.id}`)}
            onPlay={() => router.push(`/play/${m.id}`)}
          />
        )
      }}
    />
  )
}
