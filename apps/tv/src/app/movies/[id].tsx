// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, TV (client-detail.md#tv, the prototype's tv/detail.tsx): the film's art sharp and
// full bleed across the first screen, faded where the words stand; the title low on the left, the
// meta line, the synopsis, the leading cast and the director, and the picks it plays with; Play (or
// Resume, its progress over it) and the round actions: From the start, Audio and subtitles, and
// Mark as watched. Under it the rows: More like this, the collection it's in, Cast and crew (each
// opening the person's page), then About, Information and Languages as three cards. The page rests
// at its top while focus is in the first screen, and lifts each row to the safe area's top as
// focus reaches it (Home's rule). Audio and subtitles opens the shared dialog; Back closes it, then
// leaves. The picks are the person's, kept on the server for every device (usePicks).
import type { ClientDetail } from '@highsea-tv/api-contract'
import { useItem, useMarkWatched, usePicks } from '@highsea-tv/client/data'
import { createLibraryText, peopleOf } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Button, Text, tokens, useTheme } from '@highsea-tv/ui'
import {
  BACKDROP_HEIGHT,
  focusOn,
  ROUND_ACTION_ROOM,
  TvBackdrop,
  TvFilmRow,
  TvInfoCard,
  TvMessage,
  TvPersonTile,
  TvProgressLine,
  TvRoundAction,
  TvRow,
  TvTile,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, TVFocusGuideView, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { TvHead } from '../../kit.tsx'
import { detail as messages } from '../../messages.ts'
import { TvTracksPanel } from '../../tracks.tsx'

const tv = tokens.tv

/** The first screen less the next row's title, which peeks under it, in units. */
const HERO = 40.5

export default function Detail() {
  const t = useT(messages)
  const theme = useTheme()
  const id = Number(useLocalSearchParams<{ id: string }>().id)
  const detail = useItem(id)
  if (detail.status === 'loading')
    return (
      <View
        accessibilityState={{ busy: true }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator size="large" color={theme.colors['text-3']} />
      </View>
    )
  if (detail.status === 'error')
    return (
      <TvMessage
        title={detail.error.message}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={() => router.replace('/movies')}>
            {t('movies')}
          </Button>
        }
      >
        {t('gone')}
      </TvMessage>
    )
  // another film's page is a new page: its focus and dialog start afresh
  return <Item key={id} d={detail.data} refresh={detail.refresh} />
}

function Item({ d, refresh }: { d: ClientDetail; refresh: () => void }) {
  const t = useT(messages)
  const f = useFormat()
  const locale = useLocale()
  const facts = useMemo(() => createLibraryText(locale), [locale])
  const theme = useTheme()
  const u = theme.u
  const reduced = useReducedMotion()
  const media = useMedia()
  const m = d.item
  const { picks, save } = usePicks(m.id)
  const mark = useMarkWatched(m.id)
  const [panel, setPanel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // the first action, kept as state too: the head's Down goes to it
  const [first, setFirst] = useState<ViewHandle | null>(null)
  const firstRef = useCallback((node: ViewHandle | null) => setFirst(node), [])
  // the head takes Up only while the page rests at its top
  const [atTop, setAtTop] = useState(true)
  const top = () => setAtTop(true)
  const below = () => setAtTop(false)
  const tracksButton = useRef<ViewHandle>(null)

  const p = picks.data
  const playable = d.versions.filter((v) => v.playable)
  const version = playable.find((v) => v.id === p?.versionId) ?? playable[0]
  const audio =
    version?.audio.find((a) => a.id === p?.audioId) ?? version?.audio.find((a) => a.default) ?? null
  const subtitle = version?.subtitles.find((s) => s.id === p?.subtitleId) ?? null
  const resuming = m.progress !== null
  const people = peopleOf(d)
  const pick = (patch: Parameters<typeof save.run>[0]) =>
    save.run(patch).then(
      () => picks.refresh(),
      (e: Error) => setError(t('saveFailed', { message: e.message })),
    )
  const toggleWatched = () =>
    mark.run(!m.watched).then(
      () => {
        setError(null)
        refresh()
      },
      (e: Error) => setError(t('markFailed', { message: e.message })),
    )
  const closePanel = () => {
    setPanel(false)
    focusOn(tracksButton.current)
  }
  const row = { scrollSnapOffset: tv.safe.y * u }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        snapToAlignment="item"
        scrollAnimationEnabled={!reduced}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={{ minHeight: BACKDROP_HEIGHT * u }}>
          <TvBackdrop source={media(m.art.backdrop)} />
          <TvHead down={first} reachable={atTop} />
          <View
            scrollSnapOffset={0}
            accessibilityLabel={m.title}
            style={{
              height: HERO * u,
              maxWidth: 50 * u,
              justifyContent: 'flex-end',
              gap: 1.1 * u,
              paddingHorizontal: tv.safe.x * u,
            }}
          >
            {/* the title, where the prototype has its logo: no server has logos yet */}
            <Text variant="heroTitle" numberOfLines={2} accessibilityRole="header">
              {m.title}
            </Text>
            <Meta d={d} />
            {m.synopsis ? (
              <Text variant="synopsis" numberOfLines={3} style={{ maxWidth: 42 * u }}>
                {m.synopsis}
              </Text>
            ) : null}
            {d.cast.length > 0 || d.directors.length > 0 ? (
              <View style={{ maxWidth: 42 * u, gap: 0.2 * u }}>
                {d.cast.length > 0 ? (
                  <Text variant="meta" color="text-2" numberOfLines={1}>
                    <Text variant="meta" color="text-3">
                      {t('starring')}
                    </Text>
                    {facts.names(d.cast.slice(0, 3))}
                  </Text>
                ) : null}
                {d.directors.length > 0 ? (
                  <Text variant="meta" color="text-2" numberOfLines={1}>
                    <Text variant="meta" color="text-3">
                      {t('directedBy')}
                    </Text>
                    {facts.names(d.directors)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Text variant="pill" color={error ? 'danger' : 'text-3'}>
              {error ??
                (version
                  ? [
                      version.label,
                      audio?.label ?? t('defaultAudio'),
                      subtitle?.label ?? t('subtitlesOff'),
                    ].join(' · ')
                  : t('notPlayable'))}
            </Text>
            {/* the actions keep room under them for the name a round button shows on focus */}
            <View style={{ gap: 0.7 * u, paddingBottom: ROUND_ACTION_ROOM * u }}>
              {resuming ? (
                <TvProgressLine progress={m.progress ?? 0} label={f.left(m) ?? ''} />
              ) : null}
              <TVFocusGuideView
                // without destinations a guide only takes focus with autoFocus (TVFocusGuideView.js)
                autoFocus
                onFocusEnter={top}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 1 * u }}
              >
                {version ? (
                  <View style={{ minWidth: 11 * u }}>
                    <Button
                      ref={firstRef}
                      variant="primary"
                      hasTVPreferredFocus
                      icon="play"
                      block
                      onPress={() => router.push(`/play/${m.id}`)}
                    >
                      {resuming ? t('resume') : t('play')}
                    </Button>
                  </View>
                ) : null}
                {version && resuming ? (
                  <TvRoundAction
                    icon="replay"
                    label={t('fromStart')}
                    onPress={() => router.push(`/play/${m.id}?start=1`)}
                  />
                ) : null}
                {version ? (
                  <TvRoundAction
                    ref={tracksButton}
                    icon="subtitles"
                    label={t('tracks')}
                    onPress={() => setPanel(true)}
                  />
                ) : null}
                <TvRoundAction
                  // with nothing to play, focus starts here
                  ref={version ? undefined : firstRef}
                  icon="check"
                  label={m.watched ? t('markUnwatched') : t('markWatched')}
                  pressed={m.watched}
                  onPress={() => void toggleWatched()}
                />
              </TVFocusGuideView>
            </View>
          </View>
        </View>
        <View style={{ gap: 1.6 * u, paddingTop: 1.6 * u, paddingBottom: tv.safe.y * u }}>
          {d.related.length > 0 ? (
            <View {...row}>
              <TvFilmRow
                title={t('moreLike')}
                items={d.related}
                art={(r) => ({ poster: media(r.art.poster), backdrop: media(r.art.backdrop) })}
                meta={f.meta}
                onFocus={below}
                onOpen={(r) => router.push(`/movies/${r.id}`)}
                onPlay={(r) => router.push(`/play/${r.id}`)}
              />
            </View>
          ) : null}
          {d.collection ? (
            <View {...row}>
              <TvRow
                title={t('collections')}
                items={[d.collection]}
                keyOf={(c) => c.id}
                onFocusItem={below}
                render={(c, at) => (
                  <TvTile
                    title={c.name}
                    caption={t('collection')}
                    // a collection's art isn't on the title's page: its tile draws its name
                    src={undefined}
                    width={12}
                    onFocus={at.onFocus}
                    onPress={() => router.push(`/collections/${c.id}`)}
                  />
                )}
              />
            </View>
          ) : null}
          {people.length > 0 ? (
            <View {...row}>
              <TvRow
                title={t('people')}
                items={people}
                keyOf={(c) => c.id}
                itemWidth={8}
                onFocusItem={below}
                render={(c, at) => (
                  <TvPersonTile
                    name={c.name}
                    role={facts.role(c)}
                    photo={media(c.photo)}
                    onFocus={at.onFocus}
                    onPress={() => router.push(`/people/${c.personId}`)}
                  />
                )}
              />
            </View>
          ) : null}
          <View
            {...row}
            style={{
              flexDirection: 'row',
              alignItems: 'stretch',
              gap: tv.poster.gap * u,
              paddingHorizontal: tv.safe.x * u,
              paddingVertical: 1 * u,
            }}
          >
            <TvInfoCard title={t('about')} grow={1.2} onFocus={below}>
              {d.tagline ? (
                <Text variant="synopsis" weight={600}>
                  {d.tagline}
                </Text>
              ) : null}
              <Text variant="synopsis" color="text-2" numberOfLines={8}>
                {m.synopsis}
              </Text>
            </TvInfoCard>
            <TvInfoCard title={t('information')} facts={facts.informationOf(d)} onFocus={below} />
            <TvInfoCard title={t('languages')} facts={facts.languagesOf(d)} onFocus={below} />
          </View>
        </View>
      </ScrollView>
      {panel && version ? (
        <TvTracksPanel
          versions={playable}
          version={version}
          audio={audio}
          subtitle={subtitle}
          // a new version has its own tracks: the picks for the old one don't carry over
          onVersion={(v) => {
            if (v !== version.id) void pick({ versionId: v, audioId: null, subtitleId: null })
          }}
          onAudio={(a) => void pick({ audioId: a })}
          onSubtitle={(s) => {
            void pick({ subtitleId: s })
            closePanel()
          }}
          onClose={closePanel}
        />
      ) : null}
    </View>
  )
}

/** Year and length, the certification as a badge, two genres, the rating, and Watched. */
function Meta({ d }: { d: ClientDetail }) {
  const t = useT(messages)
  const f = useFormat()
  const theme = useTheme()
  const u = theme.u
  const m = d.item
  const lead = [m.year, m.runtimeMinutes ? f.runtime(m.runtimeMinutes) : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 0.8 * u,
        rowGap: 0.4 * u,
      }}
    >
      {lead ? (
        <Text variant="meta" color="text-2">
          {lead}
        </Text>
      ) : null}
      {d.certification ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors['text-3'],
            borderRadius: tv.radius.pill * u,
            paddingHorizontal: 0.4 * u,
          }}
        >
          <Text variant="quality" color="text-2">
            {d.certification}
          </Text>
        </View>
      ) : null}
      {m.genres.length > 0 ? (
        <Text variant="meta" color="text-2">
          {m.genres.slice(0, 2).join(' · ')}
        </Text>
      ) : null}
      {m.rating > 0 ? (
        <Text variant="meta" color="text-2">
          {`★ ${m.rating.toFixed(1)}`}
        </Text>
      ) : null}
      {m.watched ? (
        <Text variant="meta" color="text-2">
          {t('watched')}
        </Text>
      ) : null}
    </View>
  )
}
