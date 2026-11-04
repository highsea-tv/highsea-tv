// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail (client-detail.md), one screen for every client, from the prototypes'
// {web,mobile,tv}/detail.tsx: the film's art, its title, the meta line, Play or Resume (its
// progress above it) as the one strong action and the rest named by their icons (From the start
// while resuming, Audio and subtitles, Mark as watched), three lines of synopsis, the leading cast
// and the director, and the picks it plays with. Then More like this, the collection it's in,
// Cast and crew (each opening the person's page), and About, Information, and Languages and
// quality as cards. The picks are the person's, kept on the server for every device (usePicks).
// Laid out by the form factor:
// - touch (mobile/detail.tsx): the art across the top with Back over it and the words below it,
//   Play across the width, the actions as a row of named circles; Audio and subtitles in a sheet;
// - a pointer (web/detail.tsx): the art full bleed with the words low on the left, Play beside
//   the round actions; Audio and subtitles in a popover hung from its button;
// - the TV (tv/detail.tsx): its own composition, the art sharp across the first screen, Play taking
//   focus, the rows below as the TV's, and Audio and subtitles in the dialog at the right, which
//   Back closes before it leaves the page.
// Trailer opens the film's trailer in a dialog by touch and with a pointer (detail/trailer.tsx); the
// TV has none until the server keeps trailer files (the owner's call of 2026-11-02, and answer 2 at
// B1's review). Download waits for 4.6. Play goes to the player (B2).
import type { ClientDetail } from '@highsea-tv/api-contract'
import { useItem } from '@highsea-tv/client/data'
import { filmsMessages } from '@highsea-tv/client/films'
import { peopleOf, playPath } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  FactsCard,
  FilmRow,
  NamedAction,
  PersonTile,
  Popover,
  ProgressBar,
  ROUND_ACTION_ROOM,
  Row,
  ScrollView,
  Sheet,
  Text,
  TitleBackdrop,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import {
  FocusGuide,
  focusOn,
  Kept,
  TV_ROW_GAP,
  TvPage,
  TvProgressLine,
  useRemote,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { View } from 'react-native'
import { OverlayBack } from '../../../detail/back.tsx'
import { FILM_TV } from '../../../detail/layout.ts'
import { detailMessages } from '../../../detail/messages.ts'
import {
  Below,
  CollectionTile,
  Credits,
  FilmMissing,
  filmPath,
  idOf,
  Meta,
  personPath,
  useFilmCollection,
  useHero,
  useTexts,
  useWatched,
} from '../../../detail/parts.tsx'
import { FilmSkeleton } from '../../../detail/skeletons.tsx'
import { picksLine, TvTracks, useWatchWith, WatchWithFields } from '../../../detail/tracks.tsx'
import { type Trailer, TrailerDialog, trailerOf } from '../../../detail/trailer.tsx'
import { ROW_KEEP } from '../../../keep.ts'
import { Notice, SaidNote, useChromeOverlay, useHeadDown } from '../../../kit.tsx'

const { space } = tokens
const tv = tokens.tv

export default function Film() {
  const id = idOf(useLocalSearchParams<{ id: string }>().id)
  if (id === null) return <FilmMissing />
  // another film's page is a new page: its focus and dialog start afresh
  return <Load key={id} id={id} />
}

function Load({ id }: { id: number }) {
  const input = useFormFactor().input
  const detail = useItem(id)
  if (detail.status === 'loading') return <FilmSkeleton />
  if (detail.status === 'error') return <FilmMissing error={detail.error} />
  const props = { d: detail.data, refresh: detail.refresh }
  if (input === 'tv') return <TvFilm {...props} />
  if (input === 'pointer') return <PointerFilm {...props} />
  return <TouchFilm {...props} />
}

type FilmProps = { d: ClientDetail; refresh: () => void }

// ---------------------------------------------------------------- touch

function TouchFilm({ d, refresh }: FilmProps) {
  const t = useT(detailMessages)
  const films = useT(filmsMessages)
  const theme = useTheme()
  const f = useFormat()
  const media = useMedia()
  const gutter = usePageGutter()
  const w = useWatchWith(d)
  const watched = useWatched(d, refresh)
  const [tracks, setTracks] = useState(false)
  const [trailer, setTrailer] = useState<Trailer | null>(null)
  const preview = trailerOf(d)
  const m = d.item
  const resuming = m.progress !== null
  const line = picksLine(w, t)
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <OverlayBack />
      <ScrollView contentContainerStyle={{ paddingBottom: space['6'], gap: space['5'] }}>
        <TitleBackdrop source={media(m.art.backdrop)} />
        <View style={{ marginTop: -space['16'], paddingHorizontal: gutter, gap: space['3'] }}>
          {/* the title, where the prototype has its logo: no server has logos yet */}
          <Text variant="largeTitle" accessibilityRole="header">
            {m.title}
          </Text>
          <Meta d={d} />
          {resuming ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={(m.progress ?? 0) * 100} label={t('watched')} />
              </View>
              <Text variant="caption" color="text-2">
                {f.left(m) ?? ''}
              </Text>
            </View>
          ) : null}
          {w.version ? (
            <Button
              variant="primary"
              icon="play"
              block
              onPress={() => router.push(playPath(m.id) as Href)}
            >
              {resuming ? films('resume') : films('play')}
            </Button>
          ) : (
            <Text variant="callout" color="text-3">
              {t('notPlayable')}
            </Text>
          )}
          {m.synopsis ? (
            <Text variant="body" numberOfLines={3}>
              {m.synopsis}
            </Text>
          ) : null}
          <Credits d={d} />
          {line ? (
            <Text variant="caption" color="text-3">
              {line}
            </Text>
          ) : null}
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: space['1'] }}
          >
            {w.version && resuming ? (
              <NamedAction
                icon="replay"
                label={t('fromStart')}
                onPress={() => router.push(playPath(m.id, true) as Href)}
              />
            ) : null}
            {preview ? (
              <NamedAction
                icon="trailer"
                label={t('trailer')}
                hasPopup="dialog"
                accessibilityState={{ expanded: trailer !== null }}
                onPress={() => setTrailer(preview)}
              />
            ) : null}
            {w.version ? (
              <NamedAction
                icon="subtitles"
                label={t('tracks')}
                hasPopup="dialog"
                accessibilityState={{ expanded: tracks }}
                onPress={() => setTracks(true)}
              />
            ) : null}
            <NamedAction
              icon="check"
              label={t('watched')}
              pressed={watched.on}
              onPress={() => void watched.toggle()}
            />
          </View>
          {watched.error ? <Notice>{watched.error}</Notice> : <SaidNote />}
        </View>
        <Below d={d} />
      </ScrollView>
      <Sheet open={tracks} onClose={() => setTracks(false)} title={t('tracks')}>
        <WatchWithFields w={w} />
      </Sheet>
      <TrailerDialog video={trailer} onClose={() => setTrailer(null)} />
    </View>
  )
}

// ---------------------------------------------------------------- a pointer

function PointerFilm({ d, refresh }: FilmProps) {
  const t = useT(detailMessages)
  const films = useT(filmsMessages)
  const theme = useTheme()
  const c = useControl()
  const f = useFormat()
  const media = useMedia()
  const gutter = usePageGutter()
  const hero = useHero()
  const w = useWatchWith(d)
  const watched = useWatched(d, refresh)
  const [tracks, setTracks] = useState(false)
  const tracksButton = useRef<ViewHandle>(null)
  const [trailer, setTrailer] = useState<Trailer | null>(null)
  const preview = trailerOf(d)
  const m = d.item
  const resuming = m.progress !== null
  const line = picksLine(w, t)
  // from medium the art runs under the top bar, which turns to glass as the page scrolls, as the
  // prototype's
  const chrome = useChromeOverlay(hero.overlay)
  return (
    <ScrollView
      onScroll={chrome.onScroll}
      scrollEventThrottle={chrome.scrollEventThrottle}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ paddingBottom: space['16'], gap: space['10'] }}
    >
      <View style={{ minHeight: hero.minHeight, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <TitleBackdrop source={media(m.art.backdrop)} />
        <View
          style={{
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
            gap: space['4'],
            // clear of the top bar, then the prototype's pt-28 less the bar's height
            paddingTop: chrome.pad + space['8'],
            paddingBottom: space['10'],
            paddingHorizontal: gutter,
          }}
        >
          <View style={{ maxWidth: space['16'] * 10, gap: space['3'] }}>
            {/* the title, where the prototype has its logo: no server has logos yet */}
            <Text variant="display" accessibilityRole="header">
              {m.title}
            </Text>
            <Meta d={d} />
            {m.synopsis ? (
              <Text variant="body" numberOfLines={3}>
                {m.synopsis}
              </Text>
            ) : null}
            <Credits d={d} />
            {line ? (
              <Text variant="caption" color="text-3">
                {line}
              </Text>
            ) : null}
          </View>
          <View style={{ gap: space['2'] + space['0.5'] }}>
            {resuming ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}>
                <View style={{ width: space['10'] * 4 }}>
                  <ProgressBar value={(m.progress ?? 0) * 100} label={t('watched')} />
                </View>
                <Text variant="caption" color="text-2">
                  {f.left(m) ?? ''}
                </Text>
              </View>
            ) : null}
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: c.gap }}
            >
              {w.version ? (
                <View style={{ minWidth: space['16'] * 2 }}>
                  <Button
                    variant="primary"
                    icon="play"
                    block
                    onPress={() => router.push(playPath(m.id) as Href)}
                  >
                    {resuming ? films('resume') : films('play')}
                  </Button>
                </View>
              ) : (
                <Text variant="body" color="text-3">
                  {t('notPlayable')}
                </Text>
              )}
              {w.version && resuming ? (
                <NamedAction
                  icon="replay"
                  label={t('playFromStart')}
                  onPress={() => router.push(playPath(m.id, true) as Href)}
                />
              ) : null}
              {preview ? (
                <NamedAction
                  icon="trailer"
                  label={t('trailer')}
                  hasPopup="dialog"
                  accessibilityState={{ expanded: trailer !== null }}
                  onPress={() => setTrailer(preview)}
                />
              ) : null}
              {w.version ? (
                <NamedAction
                  ref={tracksButton}
                  icon="subtitles"
                  label={t('tracks')}
                  hasPopup="dialog"
                  accessibilityState={{ expanded: tracks }}
                  onPress={() => setTracks(true)}
                />
              ) : null}
              <NamedAction
                icon="check"
                label={watched.label}
                pressed={watched.on}
                onPress={() => void watched.toggle()}
              />
            </View>
            <View style={{ maxWidth: space['16'] * 6 }}>
              {watched.error ? <Notice>{watched.error}</Notice> : <SaidNote />}
            </View>
          </View>
        </View>
      </View>
      <View
        style={{
          width: '100%',
          maxWidth: web.maxWidth,
          alignSelf: 'center',
          gap: space['10'],
        }}
      >
        <Below d={d} />
      </View>
      <Popover
        open={tracks}
        onClose={() => setTracks(false)}
        anchor={tracksButton}
        title={t('tracks')}
      >
        <WatchWithFields w={w} />
      </Popover>
      <TrailerDialog video={trailer} onClose={() => setTrailer(null)} />
    </ScrollView>
  )
}

// ---------------------------------------------------------------- the TV

/** A person's tile on the TV, in units: PersonTile's own width there, for where the row lands it. */
const PERSON_WIDTH = 8

/**
 * How soon after focus moves a press of Up is taken to be what moved it: within one press, so the
 * row focus was in when it came is the one before. A judgement call: tvOS documents no order between
 * the focus engine's move and the remote's event (UIFocusSystem, TVEventHandler).
 */
const SAME_PRESS_MS = 150

/**
 * Up from any row goes back to the actions, as the prototype's rows' `goUp="actions"`
 * (tv/detail.tsx: each row going up to the actions). tvOS's focus engine has no per-direction
 * target (TVFocusGuideView's destinations take focus arriving from any side), so the page hears
 * the remote's Up and sends focus to Play once the engine has moved. The row the press came from
 * is the one focus was in, or, when the engine has already moved focus within the rows for this
 * press, the one it was in before; a press from the first row or the actions is left to the
 * engine, which goes to the actions or the head.
 */
function useUpToActions(actions: () => ViewHandle | null) {
  const row = useRef(-1)
  const before = useRef(-1)
  const movedAt = useRef(0)
  useRemote((e) => {
    if (e.eventType !== 'up') return
    const from = Date.now() - movedAt.current < SAME_PRESS_MS ? before.current : row.current
    if (from < 1) return
    requestAnimationFrame(() => focusOn(actions()))
  })
  return useCallback((i: number) => {
    if (i === row.current) return
    before.current = row.current
    row.current = i
    movedAt.current = Date.now()
  }, [])
}

function TvFilm({ d, refresh }: FilmProps) {
  const t = useT(detailMessages)
  const films = useT(filmsMessages)
  const { facts } = useTexts()
  const f = useFormat()
  const theme = useTheme()
  const c = useControl()
  const u = theme.u
  const media = useMedia()
  const w = useWatchWith(d)
  const watched = useWatched(d, refresh)
  const [panel, setPanel] = useState(false)
  const tracksButton = useRef<ViewHandle>(null)
  const playButton = useRef<ViewHandle>(null)
  const watchedButton = useRef<ViewHandle>(null)
  const collection = useFilmCollection(d)
  const inRow = useUpToActions(() => playButton.current ?? watchedButton.current)
  // the head lies over the art, and Down from it goes to the actions (the prototype's down="actions")
  const [first, setFirst] = useState<ViewHandle | null>(null)
  const firstRef = useCallback((v: ViewHandle | null) => {
    playButton.current = v
    setFirst(v)
  }, [])
  const watchedRef = useCallback((v: ViewHandle | null) => {
    watchedButton.current = v
    if (v) setFirst((x) => x ?? v)
  }, [])
  // the head lies over the page and scrolls away with it, as the prototype's
  const chrome = useChromeOverlay()
  useHeadDown(first)
  const open = (to: string) => router.push(to as Href)
  const m = d.item
  const resuming = m.progress !== null
  const people = peopleOf(d)
  // each row's place under the actions, for Up from it
  const rows = (() => {
    let n = 0
    const next = (shown: boolean) => (shown ? n++ : -1)
    const related = next(d.related.length > 0)
    const collectionRow = next(d.collection !== null)
    const peopleRow = next(people.length > 0)
    return { related, collection: collectionRow, people: peopleRow, about: n }
  })()
  const error = watched.error ?? w.error
  const closePanel = () => {
    setPanel(false)
    focusOn(tracksButton.current)
  }
  return (
    <View style={{ flex: 1 }}>
      <TvPage
        keep={ROW_KEEP}
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
      >
        {/* the art lies behind the first screen and past it, without holding the rows below it
            (the prototype's art is absolute in the page's grid): the head, then the words, then
            More like this, a row's gap apart as the prototype's grid has them, so the next row's
            title peeks at the foot */}
        <Kept rest>
          <TitleBackdrop source={media(m.art.backdrop)} />
          <View
            style={{
              // under the head, which lies over the page (the prototype's TvHead in the grid's
              // flow): the words' block is the first screen less the next row's title (40.5u).
              // React Native's boxes are border-box, so the height holds the padding
              // (https://reactnative.dev/docs/layout-props#boxsizing)
              height: (FILM_TV.top + FILM_TV.words) * u,
              paddingTop: FILM_TV.top * u,
              maxWidth: '50%',
              justifyContent: 'flex-end',
              gap: tv.poster.gap * u,
              paddingHorizontal: tv.safe.x * u,
            }}
          >
            {/* the title, where the prototype has its logo: no server has logos yet */}
            <Text variant="heroTitle" numberOfLines={2} accessibilityRole="header">
              {m.title}
            </Text>
            <Meta d={d} />
            {m.synopsis ? (
              <Text variant="synopsis" numberOfLines={3}>
                {m.synopsis}
              </Text>
            ) : null}
            <Credits d={d} />
            <Text variant="pill" color={error ? 'badge-danger' : 'text-3'}>
              {error ?? picksLine(w, t) ?? t('notPlayable')}
            </Text>
            {/* the actions keep room under them for the name a round button shows on focus */}
            <View style={{ gap: c.gap, paddingBottom: ROUND_ACTION_ROOM * u }}>
              {resuming ? (
                <TvProgressLine progress={m.progress ?? 0} label={f.left(m) ?? ''} />
              ) : null}
              <FocusGuide
                autoFocus
                style={{ flexDirection: 'row', alignItems: 'center', gap: c.rowGap }}
              >
                {w.version ? (
                  <View style={{ minWidth: tv.poster.width * u }}>
                    <Button
                      ref={firstRef}
                      onFocus={() => inRow(-1)}
                      variant="primary"
                      hasTVPreferredFocus
                      icon="play"
                      block
                      onPress={() => router.push(playPath(m.id) as Href)}
                    >
                      {resuming ? films('resume') : films('play')}
                    </Button>
                  </View>
                ) : null}
                {w.version && resuming ? (
                  <NamedAction
                    icon="replay"
                    label={t('fromStart')}
                    onFocus={() => inRow(-1)}
                    onPress={() => router.push(playPath(m.id, true) as Href)}
                  />
                ) : null}
                {w.version ? (
                  <NamedAction
                    ref={tracksButton}
                    onFocus={() => inRow(-1)}
                    icon="subtitles"
                    label={t('tracks')}
                    hasPopup="dialog"
                    accessibilityState={{ expanded: panel }}
                    onPress={() => setPanel(true)}
                  />
                ) : null}
                <NamedAction
                  ref={watchedRef}
                  icon="check"
                  label={watched.label}
                  pressed={watched.on}
                  onFocus={() => inRow(-1)}
                  onPress={() => void watched.toggle()}
                />
              </FocusGuide>
            </View>
          </View>
        </Kept>
        <View
          style={{
            gap: tv.poster.gap * u,
            paddingTop: TV_ROW_GAP * u,
            paddingBottom: tv.safe.y * u,
          }}
        >
          {d.related.length > 0 ? (
            <Kept>
              <FilmRow
                title={t('moreLike')}
                items={d.related}
                art={(r) => ({ poster: media(r.art.poster), backdrop: media(r.art.backdrop) })}
                meta={f.meta}
                onFocus={() => inRow(rows.related)}
                onOpen={(r) => router.push(filmPath(r.id))}
                onPlay={(r) => router.push(playPath(r.id) as Href)}
              />
            </Kept>
          ) : null}
          {d.collection ? (
            <Kept>
              <Row
                title={t('collections')}
                items={[d.collection]}
                keyOf={(x) => x.id}
                render={(x, at) => (
                  <CollectionTile
                    of={x}
                    collection={collection}
                    onFocus={() => {
                      inRow(rows.collection)
                      at.onFocus()
                    }}
                  />
                )}
              />
            </Kept>
          ) : null}
          {people.length > 0 ? (
            <Kept>
              <Row
                title={t('people')}
                items={people}
                keyOf={(x) => x.id}
                itemWidth={PERSON_WIDTH}
                render={(x, at) => (
                  <PersonTile
                    name={x.name}
                    role={facts.role(x)}
                    photo={media(x.photo)}
                    onFocus={() => {
                      inRow(rows.people)
                      at.onFocus()
                    }}
                    onPress={() => router.push(personPath(x.personId))}
                  />
                )}
              />
            </Kept>
          ) : null}
          <Kept
            style={{
              flexDirection: 'row',
              alignItems: 'stretch',
              gap: tv.poster.gap * u,
              paddingHorizontal: tv.safe.x * u,
              paddingVertical: c.gap,
            }}
          >
            <FactsCard
              title={t('about')}
              says={[d.tagline, m.synopsis].filter(Boolean).join(' ')}
              grow={1.2}
              onFocus={() => inRow(rows.about)}
            >
              {d.tagline ? (
                <Text variant="synopsis" weight={600}>
                  {d.tagline}
                </Text>
              ) : null}
              <Text variant="synopsis" color="text-2" numberOfLines={8}>
                {m.synopsis}
              </Text>
            </FactsCard>
            <FactsCard
              title={t('information')}
              facts={facts.informationOf(d)}
              onOpen={open}
              onFocus={() => inRow(rows.about)}
            />
            <FactsCard
              title={t('languages')}
              facts={facts.languagesOf(d)}
              onOpen={open}
              onFocus={() => inRow(rows.about)}
            />
          </Kept>
        </View>
      </TvPage>
      {panel ? <TvTracks w={w} onClose={closePanel} /> : null}
    </View>
  )
}
