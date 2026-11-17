// SPDX-License-Identifier: AGPL-3.0-only
// A show's page (client-shows.md; the prototypes' web/, mobile/ and tv/show.tsx), laid out as a
// film's page is so the two read as one app, and drawn from its parts (../detail/): the show's
// art, its title, the meta line (its years and seasons, the certification, the genres, the rating
// and Watched), and, where a film has Play, the episode Play plays, named as the Apple TV app and
// Netflix name it: what's next and its place over the button ("Up next · S2, E6 · The Visitor",
// with the progress part way) and "Resume S2, E6" on it. Beside it, as a film's round actions:
// From the start of that episode while resuming, Trailer (not on the TV), and Mark the show as
// watched. Then the episodes: the seasons (line tabs with a pointer, chips by touch and on the
// TV), the season's year and count with Mark season as watched, and its episodes (EpisodeRow by
// touch and with a pointer, two to a row on a wide window; a Row of stills on the TV, where OK
// held on one opens its menu). The season opens on the episode Play plays, or the one the address
// names (`?episode=`, from Search and Continue watching's menu). Then More like this, Cast and
// crew, and About and Information. A show that isn't here says so, with Shows as the way out.
//
// Left for later and listed in B3's report: Audio and subtitles for the whole show (the contract
// has no show-wide picks yet), Download for episodes and seasons (4.6), and the logo where the
// title is (no server has logos yet, as on a film's page).
import type { ClientEpisode, ClientShowDetail } from '@highsea-tv/api-contract'
import { useEpisodeActions, useMarkShowWatched, useShow } from '@highsea-tv/client/data'
import { episodeSource, seasonGroup } from '@highsea-tv/client/downloads'
import { peopleOf } from '@highsea-tv/client/library'
import { episodePlayPath, seasonOf } from '@highsea-tv/client/shows'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { REGULAR_WIDTH, web } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  EpisodeRow,
  FactsCard,
  Menu,
  NamedAction,
  PersonTile,
  Poster,
  ProgressBar,
  ROUND_ACTION_ROOM,
  Row,
  ScrollView,
  Tabs,
  Text,
  TitleBackdrop,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import {
  alpha,
  FocusGuide,
  Kept,
  TV_ROW_GAP,
  TvMessage,
  TvPage,
  TvProgressLine,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView as Scroller, StyleSheet, useWindowDimensions, View } from 'react-native'
import { OverlayBack } from '../detail/back.tsx'
import { FILM_TV } from '../detail/layout.ts'
import { detailMessages } from '../detail/messages.ts'
import {
  CreditLines,
  idOf,
  isMissing,
  MetaLine,
  Middle,
  personPath,
  useHero,
  useRowWidths,
  useTexts,
} from '../detail/parts.tsx'
import { FilmSkeleton } from '../detail/skeletons.tsx'
import { type Trailer, TrailerDialog, trailerOf } from '../detail/trailer.tsx'
import { GroupDownload } from '../downloads/group.tsx'
import { ROW_KEEP } from '../keep.ts'
import { useChromeOverlay, useHeadDown, useSay } from '../kit.tsx'
import { showMessages as messages } from './messages.ts'
import { ShowPoster } from './poster.tsx'
import { SHOW } from './sizes.ts'
import { useShowsText } from './text.ts'

const { space } = tokens
const tv = tokens.tv

export function ShowScreen() {
  const params = useLocalSearchParams<{ id: string; episode?: string }>()
  const id = idOf(params.id)
  const episode = idOf(params.episode) ?? undefined
  if (id === null) return <ShowMissing />
  // another show's page is a new page: its season and focus start afresh
  return <Load key={id} id={id} episode={episode} />
}

function Load({ id, episode }: { id: number; episode?: number }) {
  const input = useFormFactor().input
  const detail = useShow(id)
  if (detail.status === 'loading') return <FilmSkeleton />
  if (detail.status === 'error') return <ShowMissing error={detail.error} />
  const props = { d: detail.data, refresh: detail.refresh, episode }
  if (input === 'tv') return <TvShow {...props} />
  if (input === 'pointer') return <PointerShow {...props} />
  return <TouchShow {...props} />
}

type ShowProps = { d: ClientShowDetail; refresh: () => void; episode?: number }

/** What every form factor's page reads: the words, what Play plays, the season shown, marking. */
function useShowPage({ d, refresh, episode }: ShowProps) {
  const t = useT(messages)
  const text = useShowsText()
  const say = useSay()
  const s = d.show
  const next = s.next
  const opened = seasonOf(d.seasons, episode, next?.episode.season ?? d.seasons[0]?.number ?? 1)
  const [season, setSeason] = useState(opened.season)
  const shown = d.seasons.find((x) => x.number === season) ?? d.seasons[0] ?? null
  const nextSeason = next ? d.seasons.find((x) => x.number === next.episode.season) : undefined
  const markShow = useMarkShowWatched(s.id)
  const mark = async (body: { season: number | null; watched: boolean }) => {
    try {
      await markShow.run(body)
      refresh()
    } catch (e) {
      say({ title: t('markFailed', { message: (e as Error).message }) })
    }
  }
  const seasonWatched =
    !!shown && shown.episodes.length > 0 && shown.episodes.every((e) => e.watched)
  return {
    d,
    t,
    text,
    s,
    next,
    season,
    setSeason,
    shown,
    seasonWatched,
    opened: opened.episode,
    lead: `${text.showYears(s)} · ${text.seasonsCount(s.seasons)}`,
    people: peopleOf({ cast: d.cast, directors: d.creators, crew: d.crew }),
    preview: trailerOf(d),
    playNamed: next
      ? t(next.kind === 'resume' ? 'resumeNamed' : 'playNamed', {
          place: text.episodePlace(next.episode),
          title: next.episode.title,
        })
      : null,
    play: () => next && router.push(episodePlayPath(next.episode.id) as Href),
    fromStart: () => next && router.push(episodePlayPath(next.episode.id, true) as Href),
    markShow: () => void mark({ season: null, watched: !s.watched }),
    markSeason: () => shown && void mark({ season: shown.number, watched: !seasonWatched }),
    /** The season's episodes as downloads, kept under it (C8). */
    seasonSources: shown
      ? shown.episodes.map((e) => episodeSource(e, seasonGroup(s, shown), text.episodeCode(e)))
      : [],
    /** What Play plays, as a download (the phone's head). */
    nextSource:
      next && nextSeason
        ? [episodeSource(next.episode, seasonGroup(s, nextSeason), text.episodeCode(next.episode))]
        : [],
    seasonLine: shown
      ? [shown.year, text.episodesCount(shown.episodes.length)].filter(Boolean).join(' · ')
      : '',
  }
}

type Page = ReturnType<typeof useShowPage>

/** What's next over Play: its line, and the progress part way. */
function NextLine({ p, wide }: { p: Page; wide?: boolean }) {
  const t = useT(detailMessages)
  const { next, text } = p
  if (!next) return null
  return (
    <View style={{ gap: space['2'] }}>
      <Text variant="caption" color="text-2" numberOfLines={1}>
        <Text variant="caption" color="text-3">
          {`${text.nextLine(next)} · `}
        </Text>
        {`${text.episodeCode(next.episode)} · ${next.episode.title}`}
      </Text>
      {next.episode.progress !== null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}>
          <View style={wide ? { flex: 1 } : { width: space['10'] * 4 }}>
            <ProgressBar value={next.episode.progress * 100} label={t('watched')} />
          </View>
          <Text variant="caption" color="text-2">
            {text.episodeTime(next.episode)}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** One episode in a season's list, with its own Mark as watched. */
function Episode({ e, p, refresh }: { e: ClientEpisode; p: Page; refresh: () => void }) {
  const media = useMedia()
  const say = useSay()
  const actions = useEpisodeActions(e.id)
  const { t, text } = p
  return (
    <EpisodeRow
      still={media(e.still)}
      number={e.number}
      title={e.title}
      time={text.episodeTime(e)}
      aired={text.airedDate(e.aired)}
      synopsis={e.synopsis}
      progress={e.progress}
      watched={e.watched}
      playLabel={t('playEpisode', {
        place: text.episodePlace(e),
        title: e.title,
        time: text.episodeTime(e),
        watched: e.watched ? 'yes' : 'no',
      })}
      markLabel={t(e.watched ? 'unmarkEpisode' : 'markEpisode', { title: e.title })}
      onPlay={() => router.push(episodePlayPath(e.id) as Href)}
      onMark={() =>
        void actions.mark
          .run(!e.watched)
          .then(refresh, (err: Error) => say({ title: t('markFailed', { message: err.message }) }))
      }
    />
  )
}

/** The season's year and count, with Mark season as watched. */
function SeasonHead({ p }: { p: Page }) {
  const { t } = p
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: space['3'],
        rowGap: space['2'],
      }}
    >
      <Text variant="caption" color="text-3" style={{ flex: 1 }}>
        {p.seasonLine}
      </Text>
      <Button
        variant="ghost"
        size="sm"
        icon="check"
        accessibilityState={{ checked: p.seasonWatched }}
        onPress={p.markSeason}
      >
        {p.seasonWatched ? t('unmarkSeason') : t('markSeason')}
      </Button>
      {p.shown ? (
        <GroupDownload
          ghost
          size="sm"
          label={t('downloadSeason')}
          name={t('seasonOfShow', { season: p.shown.title, show: p.s.title })}
          sources={p.seasonSources}
        />
      ) : null}
    </View>
  )
}

/**
 * The episodes by touch and with a pointer: the seasons (line tabs with a pointer, chips by touch
 * when there's more than one), the season's head, and its episodes, two to a row on a pointer's
 * wide window.
 */
function Episodes({ p, refresh }: { p: Page; refresh: () => void }) {
  const t = p.t
  const input = useFormFactor().input
  const gutter = usePageGutter()
  const c = useControl()
  const { width } = useWindowDimensions()
  const seasons = p.d.seasons
  const two = input === 'pointer' && width >= REGULAR_WIDTH
  const episodes = p.shown?.episodes ?? []
  return (
    <View style={{ gap: input === 'pointer' ? space['4'] : space['3'] }}>
      <Text
        variant="rowTitle"
        weight={600}
        aria-level={2}
        accessibilityRole="header"
        style={{ paddingHorizontal: gutter }}
      >
        {t('episodes')}
      </Text>
      {input === 'pointer' ? (
        <View style={{ paddingHorizontal: gutter }}>
          <Tabs
            variant="line"
            aria-label={t('season')}
            value={String(p.season)}
            onValueChange={(v) => p.setSeason(Number(v))}
            options={seasons.map((x) => ({ value: String(x.number), label: x.title }))}
          />
        </View>
      ) : seasons.length > 1 ? (
        <Scroller
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('season')}
          contentContainerStyle={{ paddingHorizontal: gutter, gap: c.gap }}
        >
          {seasons.map((x) => (
            <Chip
              key={x.number}
              selected={x.number === p.shown?.number}
              onPress={() => p.setSeason(x.number)}
            >
              {x.title}
            </Chip>
          ))}
        </Scroller>
      ) : null}
      <View
        style={{ paddingHorizontal: gutter, gap: input === 'pointer' ? space['4'] : space['3'] }}
      >
        <SeasonHead p={p} />
        <View
          accessibilityRole="list"
          accessibilityLabel={p.shown?.title}
          style={
            two
              ? {
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  columnGap: space['6'],
                  rowGap: space['2'],
                }
              : { gap: input === 'pointer' ? space['2'] : space['4'] }
          }
        >
          {episodes.map((e) => (
            <View
              key={e.id}
              style={two ? { flexBasis: '45%', flexGrow: 1, minWidth: 0 } : undefined}
            >
              <Episode e={e} p={p} refresh={refresh} />
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

/** More like this, Cast and crew, and About and Information, by touch and with a pointer. */
function Below({ p, d }: { p: Page; d: ClientShowDetail }) {
  const t = useT(detailMessages)
  const { facts } = useTexts()
  const media = useMedia()
  const w = useRowWidths()
  const input = useFormFactor().input
  const gutter = usePageGutter()
  const { width } = useWindowDimensions()
  const side = input === 'pointer' && width >= REGULAR_WIDTH
  return (
    <>
      {d.related.length > 0 ? (
        // stills with a pointer, as on a film's page (the owner's answer 10, prototype-gaps.md);
        // posters by touch, as the phone's prototype has them
        <Row
          title={t('moreLike')}
          items={d.related}
          itemWidth={input === 'pointer' ? w.still : w.poster}
          keyOf={(x) => x.id}
          render={(x) => (
            <ShowPoster
              show={x}
              wide={input === 'pointer'}
              width={input === 'pointer' ? w.still : w.poster}
            />
          )}
        />
      ) : null}
      {p.people.length > 0 ? (
        <Row
          title={t('people')}
          items={p.people}
          itemWidth={w.person}
          keyOf={(c) => c.id}
          render={(c) => (
            <PersonTile
              name={c.name}
              role={facts.role(c)}
              photo={media(c.photo)}
              width={w.person}
              onPress={() => router.push(personPath(c.personId))}
            />
          )}
        />
      ) : null}
      <View
        style={{
          paddingHorizontal: gutter,
          gap: input === 'pointer' ? space['4'] : space['3'],
          ...(side ? { flexDirection: 'row', alignItems: 'stretch' } : null),
        }}
      >
        <View style={side ? { flex: 1 } : undefined}>
          <FactsCard title={t('about')}>
            <Text variant="body" color="text-2">
              {d.show.synopsis}
            </Text>
          </FactsCard>
        </View>
        <View style={side ? { flex: 1 } : undefined}>
          <FactsCard title={t('information')} facts={facts.showInformationOf(d)} />
        </View>
      </View>
    </>
  )
}

// ---------------------------------------------------------------- touch

function TouchShow(props: ShowProps) {
  const { d, refresh } = props
  const p = useShowPage(props)
  const t = p.t
  const words = useT(detailMessages)
  const theme = useTheme()
  const media = useMedia()
  const gutter = usePageGutter()
  const [trailer, setTrailer] = useState<Trailer | null>(null)
  const { s, next } = p
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <OverlayBack />
      <ScrollView contentContainerStyle={{ paddingBottom: space['6'], gap: space['5'] }}>
        <TitleBackdrop source={media(s.art.backdrop)} />
        <View style={{ marginTop: -space['16'], paddingHorizontal: gutter, gap: space['3'] }}>
          {/* the title, where the prototype has its logo: no server has logos yet */}
          <Text variant="largeTitle" accessibilityRole="header">
            {s.title}
          </Text>
          <MetaLine
            lead={p.lead}
            certification={s.certification}
            genres={s.genres}
            rating={s.rating}
            watched={s.watched}
          />
          <NextLine p={p} wide />
          {next ? (
            <Button
              variant="primary"
              icon="play"
              block
              accessibilityLabel={p.playNamed ?? undefined}
              onPress={p.play}
            >
              {p.text.playLabel(next)}
            </Button>
          ) : null}
          {next ? (
            <GroupDownload
              wide
              label={t('downloadEpisode', { code: p.text.episodeCode(next.episode) })}
              name={`${p.text.episodeCode(next.episode)}, ${next.episode.title}`}
              sources={p.nextSource}
            />
          ) : null}
          {s.synopsis ? (
            <Text variant="body" numberOfLines={3}>
              {s.synopsis}
            </Text>
          ) : null}
          <CreditLines cast={d.cast} makers={d.creators} madeBy={t('createdBy')} />
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: space['1'] }}
          >
            {next?.kind === 'resume' ? (
              <NamedAction icon="replay" label={t('fromStart')} onPress={p.fromStart} />
            ) : null}
            {p.preview ? (
              <NamedAction
                icon="trailer"
                label={words('trailer')}
                hasPopup="dialog"
                accessibilityState={{ expanded: trailer !== null }}
                onPress={() => setTrailer(p.preview ?? null)}
              />
            ) : null}
            <NamedAction
              icon="check"
              label={t('watched')}
              pressed={s.watched}
              onPress={p.markShow}
            />
          </View>
        </View>
        <Episodes p={p} refresh={refresh} />
        <Below p={p} d={d} />
      </ScrollView>
      <TrailerDialog video={trailer} onClose={() => setTrailer(null)} />
    </View>
  )
}

// ---------------------------------------------------------------- a pointer

function PointerShow(props: ShowProps) {
  const { d, refresh } = props
  const p = useShowPage(props)
  const t = p.t
  const words = useT(detailMessages)
  const theme = useTheme()
  const c = useControl()
  const media = useMedia()
  const gutter = usePageGutter()
  const hero = useHero()
  const [trailer, setTrailer] = useState<Trailer | null>(null)
  const { s, next } = p
  // from 768 the art runs under the top bar, which turns to glass as the page scrolls
  const chrome = useChromeOverlay(hero.overlay)
  return (
    <ScrollView
      onScroll={chrome.onScroll}
      scrollEventThrottle={chrome.scrollEventThrottle}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ paddingBottom: space['16'], gap: space['10'] }}
    >
      <View style={{ minHeight: hero.minHeight, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <TitleBackdrop source={media(s.art.backdrop)} />
        <View
          style={{
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
            gap: space['4'],
            paddingTop: chrome.pad + space['8'],
            paddingBottom: space['10'],
            paddingHorizontal: gutter,
          }}
        >
          <View style={{ maxWidth: space['16'] * 10, gap: space['3'] }}>
            {/* the title, where the prototype has its logo: no server has logos yet */}
            <Text variant="display" accessibilityRole="header">
              {s.title}
            </Text>
            <MetaLine
              lead={p.lead}
              certification={s.certification}
              genres={s.genres}
              rating={s.rating}
              watched={s.watched}
            />
            {s.synopsis ? (
              <Text variant="body" numberOfLines={3}>
                {s.synopsis}
              </Text>
            ) : null}
            <CreditLines cast={d.cast} makers={d.creators} madeBy={t('createdBy')} />
          </View>
          <View style={{ gap: space['2'] + space['0.5'] }}>
            <NextLine p={p} />
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: c.gap }}
            >
              {next ? (
                <View style={{ minWidth: space['16'] * 2 }}>
                  <Button
                    variant="primary"
                    icon="play"
                    block
                    accessibilityLabel={p.playNamed ?? undefined}
                    onPress={p.play}
                  >
                    {p.text.playLabel(next)}
                  </Button>
                </View>
              ) : null}
              {next?.kind === 'resume' ? (
                <NamedAction icon="replay" label={words('playFromStart')} onPress={p.fromStart} />
              ) : null}
              {p.preview ? (
                <NamedAction
                  icon="trailer"
                  label={words('trailer')}
                  hasPopup="dialog"
                  accessibilityState={{ expanded: trailer !== null }}
                  onPress={() => setTrailer(p.preview ?? null)}
                />
              ) : null}
              <NamedAction
                icon="check"
                label={s.watched ? t('unmarkShow') : t('markShow')}
                pressed={s.watched}
                onPress={p.markShow}
              />
            </View>
          </View>
        </View>
      </View>
      <View
        style={{ width: '100%', maxWidth: web.maxWidth, alignSelf: 'center', gap: space['10'] }}
      >
        <Episodes p={p} refresh={refresh} />
        <Below p={p} d={d} />
      </View>
      <TrailerDialog video={trailer} onClose={() => setTrailer(null)} />
    </ScrollView>
  )
}

// ---------------------------------------------------------------- the TV

const PERSON_WIDTH = SHOW.tvPersonWidth
const EPISODE_WIDTH = SHOW.tvEpisodeWidth

function TvShow(props: ShowProps) {
  const { d, refresh } = props
  const p = useShowPage(props)
  const t = p.t
  const { facts } = useTexts()
  const theme = useTheme()
  const c = useControl()
  const u = theme.u
  const media = useMedia()
  const say = useSay()
  const { s, next, text } = p
  // OK held on an episode: its menu
  const [held, setHeld] = useState<ClientEpisode | null>(null)
  const heldActions = useEpisodeActions(held?.id ?? 0)
  // the head lies over the art, and Down from it goes to the actions
  const [first, setFirst] = useState<ViewHandle | null>(null)
  const firstRef = useCallback((v: ViewHandle | null) => setFirst((x) => x ?? v), [])
  const chrome = useChromeOverlay()
  useHeadDown(first)
  // opened at an episode, focus starts on it; otherwise on Play
  const entry = p.opened ?? null
  const words = useT(detailMessages)
  const open = (to: string) => router.push(to as Href)
  return (
    <View style={{ flex: 1 }}>
      <TvPage
        keep={ROW_KEEP}
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
      >
        <Kept rest>
          <TitleBackdrop source={media(s.art.backdrop)} />
          <View
            style={{
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
              {s.title}
            </Text>
            <MetaLine
              lead={p.lead}
              certification={s.certification}
              genres={s.genres}
              rating={s.rating}
              watched={s.watched}
            />
            {s.synopsis ? (
              <Text variant="synopsis" numberOfLines={3}>
                {s.synopsis}
              </Text>
            ) : null}
            <CreditLines cast={d.cast} makers={d.creators} madeBy={t('createdBy')} />
            <View style={{ gap: c.gap, paddingBottom: ROUND_ACTION_ROOM * u }}>
              {next ? (
                next.episode.progress !== null ? (
                  <TvProgressLine
                    progress={next.episode.progress}
                    label={`${text.nextLine(next)} · ${text.episodeCode(next.episode)} · ${next.episode.title} · ${text.episodeTime(next.episode)}`}
                  />
                ) : (
                  <Text variant="pill" color="text-2" numberOfLines={1}>
                    {`${text.nextLine(next)} · ${text.episodeCode(next.episode)} · ${next.episode.title}`}
                  </Text>
                )
              ) : null}
              <FocusGuide
                autoFocus
                style={{ flexDirection: 'row', alignItems: 'center', gap: c.rowGap }}
              >
                {next ? (
                  <View style={{ minWidth: tv.poster.width * u }}>
                    <Button
                      ref={firstRef}
                      variant="primary"
                      hasTVPreferredFocus={entry === null}
                      icon="play"
                      block
                      accessibilityLabel={p.playNamed ?? undefined}
                      onPress={p.play}
                    >
                      {text.playLabel(next)}
                    </Button>
                  </View>
                ) : null}
                {next?.kind === 'resume' ? (
                  <NamedAction icon="replay" label={t('fromStart')} onPress={p.fromStart} />
                ) : null}
                <NamedAction
                  ref={firstRef}
                  icon="check"
                  label={s.watched ? t('markUnwatched') : t('markWatched')}
                  pressed={s.watched}
                  onPress={p.markShow}
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
          {/* the seasons as choices, then Mark season as watched after a rule; choosing a season
              keeps focus on the choice (the owner, 2026-10-31) */}
          <Kept
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: c.gap,
              paddingHorizontal: tv.safe.x * u,
            }}
          >
            {d.seasons.map((x) => (
              <Chip
                key={x.number}
                selected={x.number === p.shown?.number}
                onPress={() => p.setSeason(x.number)}
              >
                {x.title}
              </Chip>
            ))}
            <View
              style={{
                width: StyleSheet.hairlineWidth,
                alignSelf: 'stretch',
                marginHorizontal: c.inset,
                backgroundColor: alpha(theme.colors.text, 0.2),
              }}
            />
            {p.shown ? (
              <Chip icon="check" selected={p.seasonWatched} onPress={p.markSeason}>
                {p.seasonWatched ? t('unmarkSeason') : t('markSeason')}
              </Chip>
            ) : null}
          </Kept>
          {p.shown ? (
            <Kept>
              <Row
                key={p.shown.number}
                title={p.shown.title}
                suffix={p.seasonLine}
                items={p.shown.episodes}
                keyOf={(e) => e.id}
                itemWidth={EPISODE_WIDTH}
                render={(e, at) => (
                  <TvEpisode
                    e={e}
                    p={p}
                    preferred={e.id === entry}
                    onFocus={at.onFocus}
                    onMenu={() => setHeld(e)}
                  />
                )}
              />
            </Kept>
          ) : null}
          {d.related.length > 0 ? (
            <Kept>
              <Row
                title={words('moreLike')}
                items={d.related}
                keyOf={(x) => x.id}
                render={(x, at) => <ShowPoster show={x} onFocus={at.onFocus} />}
              />
            </Kept>
          ) : null}
          {p.people.length > 0 ? (
            <Kept>
              <Row
                title={words('people')}
                items={p.people}
                keyOf={(x) => x.id}
                itemWidth={PERSON_WIDTH}
                render={(x, at) => (
                  <PersonTile
                    name={x.name}
                    role={facts.role(x)}
                    photo={media(x.photo)}
                    onFocus={at.onFocus}
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
            <FactsCard title={words('about')} says={s.synopsis} grow={1.2}>
              <Text variant="synopsis" color="text-2" numberOfLines={8}>
                {s.synopsis}
              </Text>
            </FactsCard>
            <FactsCard
              title={words('information')}
              facts={facts.showInformationOf(d)}
              onOpen={open}
            />
          </Kept>
        </View>
      </TvPage>
      <Menu
        open={held !== null}
        title={held ? `${text.episodeCode(held)} · ${held.title}` : ''}
        detail={s.title}
        items={
          held
            ? [
                {
                  icon: 'check',
                  label: held.watched ? t('markUnwatched') : t('markWatched'),
                  onSelect: () =>
                    void heldActions.mark
                      .run(!held.watched)
                      .then(refresh, (err: Error) =>
                        say({ title: t('markFailed', { message: err.message }) }),
                      ),
                },
                ...(held.progress !== null
                  ? [
                      {
                        icon: 'replay' as const,
                        label: t('fromStart'),
                        closes: 'leave' as const,
                        onSelect: () => router.push(episodePlayPath(held.id, true) as Href),
                      },
                    ]
                  : []),
              ]
            : []
        }
        onClose={() => setHeld(null)}
      />
    </View>
  )
}

/**
 * An episode on the TV: its still, lifting on focus, with the progress along its foot and Watched
 * once it's watched; under it its number, title and length. OK plays it; OK held opens its menu.
 */
function TvEpisode({
  e,
  p,
  preferred,
  onFocus,
  onMenu,
}: {
  e: ClientEpisode
  p: Page
  preferred: boolean
  onFocus: () => void
  onMenu: () => void
}) {
  const media = useMedia()
  const { t, text } = p
  const label = t('playEpisode', {
    place: text.episodePlace(e),
    title: e.title,
    time: text.episodeTime(e),
    watched: e.watched ? 'yes' : 'no',
  })
  return (
    <Poster
      title={e.title}
      src={media(e.still)}
      aspect="still"
      width={EPISODE_WIDTH}
      showTitle
      caption={`${e.season === 0 ? text.episodeCode(e) : t('episodeNumber', { number: e.number })} · ${text.episodeTime(e)} · ${text.airedDate(e.aired)}`}
      progress={e.progress === null ? undefined : e.progress * 100}
      status={e.watched ? <WatchedMark /> : undefined}
      preferred={preferred}
      onFocus={onFocus}
      accessibilityLabel={t('holdForMore', { label })}
      onPress={() => router.push(episodePlayPath(e.id) as Href)}
      onLongPress={onMenu}
    />
  )
}

/** Watched, on an episode's still on the TV. */
function WatchedMark() {
  const t = useT(messages)
  return (
    <Badge overlay tone="success">
      {t('watched')}
    </Badge>
  )
}

// ---------------------------------------------------------------- not here

/**
 * Not found, or a read that failed: the server's words (or ours for a show that isn't here), what
 * may have happened, and Shows as the way out, as the prototypes give it.
 */
export function ShowMissing({ error }: { error?: Error | null }) {
  const t = useT(messages)
  const input = useFormFactor().input
  const title = isMissing(error) ? t('missingTitle') : (error?.message ?? t('missingTitle'))
  const shows = () => router.replace((input === 'touch' ? '/library?view=shows' : '/shows') as Href)
  if (input === 'tv')
    return (
      <TvMessage
        title={title}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={shows}>
            {t('shows')}
          </Button>
        }
      >
        {t('missingBody')}
      </TvMessage>
    )
  return (
    <Middle back={input === 'touch'}>
      <EmptyState
        icon="series"
        tone="error"
        title={title}
        action={<Button onPress={shows}>{t('shows')}</Button>}
      >
        {input === 'pointer' ? t('missingBodyWeb') : t('missingBody')}
      </EmptyState>
    </Middle>
  )
}
