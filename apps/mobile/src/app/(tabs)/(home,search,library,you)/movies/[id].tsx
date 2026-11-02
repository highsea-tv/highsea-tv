// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail on the phone (client-detail.md#mobile), from the prototype's mobile/detail.tsx,
// laid out as the TV's: the film's art across the top with Back over it, the title low on it, a
// meta line, Play or Resume across the width with the progress bar above it, three lines of
// synopsis, the leading cast and the director, the picks it plays with, and a row of named round
// actions: From the start, Audio and subtitles (Watch with, in a sheet) and Watched. Then More like
// this as stills, the collection it's in, Cast and crew (each opening the person's page), and
// About, Information, and Languages and quality as cards. Picks are remembered per title, across
// devices; their choices open iOS's action sheet. Download waits for 4.6 and trailers for the
// server to fetch files the phone's player can play (the owner's answers at part B's review).
import type { ClientDetail } from '@highsea-tv/api-contract'
import { useCollections, useItem, useMarkWatched, usePicks } from '@highsea-tv/client/data'
import { createLibraryText, peopleOf } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import {
  Button,
  EmptyState,
  FactsCard,
  Icon,
  NamedAction,
  PersonTile,
  Press,
  ProgressBar,
  QualityTag,
  Rating,
  Row,
  Sheet,
  successHaptic,
  Text,
  tokens,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { type ReactNode, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FilmRow } from '../../../../cards.tsx'
import { choose } from '../../../../choose.ts'
import { CollectionTile } from '../../../../collection-art.tsx'
import { Center, Group, GUTTER, TAB_BAR } from '../../../../kit.tsx'
import { detail as messages } from '../../../../messages.ts'

const OFF = 'off'

function Pick({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Press
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 48,
        paddingHorizontal: 12,
      }}
    >
      <Text variant="callout" color="text-3" style={{ width: 84 }}>
        {label}
      </Text>
      <Text variant="body" size={15} style={{ flex: 1 }} numberOfLines={1}>
        {value}
      </Text>
      {onPress && <Icon name="chevron-down" size={16} color="text-3" />}
    </Press>
  )
}

/** What a title plays with: its version, sound and subtitles, each from the person's picks. */
function useWatchWith(d: ClientDetail) {
  const { picks, save } = usePicks(d.item.id)
  const p = picks.data
  const playable = d.versions.filter((v) => v.playable)
  const version = playable.find((v) => v.id === p?.versionId) ?? playable[0]
  const audio =
    version?.audio.find((a) => a.id === p?.audioId) ?? version?.audio.find((a) => a.default)
  const subtitle = version?.subtitles.find((s) => s.id === p?.subtitleId)
  const run = (patch: Parameters<typeof save.run>[0]) => save.run(patch).then(() => picks.refresh())
  return { playable, version, audio, subtitle, run }
}

function WatchWith({ w }: { w: ReturnType<typeof useWatchWith> }) {
  const t = useT(messages)
  const { playable, version, audio, subtitle } = w
  if (!version) return null
  const run = (patch: Parameters<typeof w.run>[0]) =>
    w.run(patch).catch((e: Error) => Alert.alert(t('saveFailed', { message: e.message })))
  return (
    <Group>
      <Pick
        label={t('version')}
        value={version.detail ?? version.label}
        onPress={
          playable.length > 1
            ? async () => {
                const v = await choose(
                  t('version'),
                  playable.map((x) => ({ value: x.id, label: x.label })),
                  t('cancel'),
                  version.id,
                )
                // a new version has its own tracks: the picks for the old one don't carry over
                if (v && v !== version.id)
                  void run({ versionId: v, audioId: null, subtitleId: null })
              }
            : undefined
        }
      />
      <Pick
        label={t('audio')}
        value={audio?.label ?? version.audio[0]?.label ?? t('noAudio')}
        onPress={
          version.audio.length > 1
            ? async () => {
                const v = await choose(
                  t('audio'),
                  version.audio.map((a) => ({ value: a.id, label: a.label })),
                  t('cancel'),
                  audio?.id,
                )
                if (v) void run({ audioId: v })
              }
            : undefined
        }
      />
      <Pick
        label={t('subtitles')}
        value={subtitle?.label ?? t('off')}
        onPress={async () => {
          const v = await choose(
            t('subtitles'),
            [
              { value: OFF, label: t('off') },
              ...version.subtitles.map((s) => ({ value: s.id, label: s.label })),
            ],
            t('cancel'),
            subtitle?.id ?? OFF,
          )
          if (v) void run({ subtitleId: v === OFF ? null : v })
        }}
      />
    </Group>
  )
}

export default function Detail() {
  const t = useT(messages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const id = Number(useLocalSearchParams<{ id: string }>().id)
  const detail = useItem(id)

  // Back over the backdrop, in the overlay look (controls.md › Looks)
  const back = (
    <View style={{ position: 'absolute', top: insets.top + 8, left: 12, zIndex: 10 }}>
      <Button
        variant="overlay"
        iconOnly
        icon="chevron-left"
        accessibilityLabel={t('back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </View>
  )

  if (detail.status === 'loading')
    return (
      <Center>
        {back}
        <ActivityIndicator color={theme.colors['text-3']} />
      </Center>
    )
  if (detail.status === 'error')
    return (
      <Center>
        {back}
        <EmptyState
          icon="movie"
          tone="error"
          title={detail.error.message}
          action={<Button onPress={() => router.replace('/')}>{t('goHome')}</Button>}
        >
          {t('missingBody')}
        </EmptyState>
      </Center>
    )
  // another film's page is a new page: its sheet starts closed
  return <Item key={id} d={detail.data} refresh={detail.refresh} back={back} />
}

function Item({ d, refresh, back }: { d: ClientDetail; refresh: () => void; back: ReactNode }) {
  const t = useT(messages)
  const locale = useLocale()
  const facts = useMemo(() => createLibraryText(locale), [locale])
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const f = useFormat()
  const media = useMedia()
  const m = d.item
  const mark = useMarkWatched(m.id)
  const w = useWatchWith(d)
  const [tracks, setTracks] = useState(false)
  const personWidth = usePosterWidth(0.24)
  const collectionWidth = usePosterWidth(0.3)
  // the film's collection, with its art when Library › Collections lists it
  const collections = useCollections('ios')
  const resuming = m.progress !== null
  const people = peopleOf(d)
  const collection = d.collection
    ? (collections.data?.find((c) => String(c.id) === String(d.collection?.id)) ?? null)
    : null

  const toggleWatched = () =>
    mark.run(!m.watched).then(
      () => {
        successHaptic()
        refresh()
      },
      (e: Error) => Alert.alert(t('markFailed', { message: e.message })),
    )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {back}
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR + insets.bottom + 24, gap: 20 }}>
        <View>
          <Image
            source={media(m.art.backdrop)}
            style={{ width: '100%', aspectRatio: 16 / 9 }}
            contentFit="cover"
            transition={150}
          />
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(0deg, ${theme.colors.bg} 2%, transparent 55%)`,
            }}
          />
        </View>
        <View style={{ marginTop: -64, paddingHorizontal: GUTTER, gap: 12 }}>
          {/* the title, where the prototype has its logo: no server has logos yet */}
          <Text variant="largeTitle" size={28} accessibilityRole="header">
            {m.title}
          </Text>
          <Meta d={d} />
          {resuming ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={(m.progress ?? 0) * 100} label={t('watched')} />
              </View>
              <Text variant="caption" size={13} color="text-2">
                {f.left(m) ?? ''}
              </Text>
            </View>
          ) : null}
          {w.version ? (
            <Button
              variant="primary"
              icon="play"
              block
              onPress={() => router.push(`/play/${m.id}`)}
            >
              {resuming ? t('resume') : t('play')}
            </Button>
          ) : (
            <Text variant="callout" color="text-3">
              {t('notPlayable')}
            </Text>
          )}
          {m.synopsis ? (
            <Text variant="body" size={15} numberOfLines={3} style={{ lineHeight: 23 }}>
              {m.synopsis}
            </Text>
          ) : null}
          {d.cast.length > 0 || d.directors.length > 0 ? (
            <View style={{ gap: 2 }}>
              {d.cast.length > 0 ? (
                <Text variant="caption" size={13} color="text-2" numberOfLines={2}>
                  <Text variant="caption" size={13} color="text-3">
                    {t('starring')}
                  </Text>
                  {facts.names(d.cast.slice(0, 3))}
                </Text>
              ) : null}
              {d.directors.length > 0 ? (
                <Text variant="caption" size={13} color="text-2" numberOfLines={1}>
                  <Text variant="caption" size={13} color="text-3">
                    {t('directedBy')}
                  </Text>
                  {facts.names(d.directors)}
                </Text>
              ) : null}
            </View>
          ) : null}
          {w.version ? (
            <Text variant="caption" color="text-3">
              {[
                w.version.label,
                w.audio?.label ?? t('defaultAudio'),
                w.subtitle?.label ?? t('subtitlesOff'),
              ].join(' · ')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4 }}>
            {w.version && resuming ? (
              <NamedAction
                icon="replay"
                label={t('fromStart')}
                onPress={() => router.push(`/play/${m.id}?start=1`)}
              />
            ) : null}
            {w.version ? (
              <NamedAction icon="subtitles" label={t('tracks')} onPress={() => setTracks(true)} />
            ) : null}
            <NamedAction
              icon="check"
              label={t('watched')}
              pressed={m.watched}
              onPress={() => void toggleWatched()}
            />
          </View>
        </View>
        {d.related.length > 0 && <FilmRow title={t('moreLike')} items={d.related} />}
        {d.collection ? (
          <Row
            title={t('collections')}
            items={[d.collection]}
            itemWidth={collectionWidth}
            keyOf={(c) => String(c.id)}
            render={(c) => {
              const caption = collection ? f.caption(collection) : ''
              return (
                <View style={{ width: collectionWidth }}>
                  <CollectionTile
                    name={c.name}
                    caption={caption}
                    label={caption ? `${c.name}, ${caption}` : c.name}
                    poster={collection?.art.poster ?? null}
                    mosaic={collection?.smart?.mosaic}
                    smart={null}
                    onPress={() => router.push(`/collections/${c.id}`)}
                  />
                </View>
              )
            }}
          />
        ) : null}
        {people.length > 0 && (
          <Row
            title={t('people')}
            items={people}
            itemWidth={personWidth}
            keyOf={(c) => c.id}
            render={(c) => (
              <PersonTile
                name={c.name}
                role={facts.role(c)}
                photo={media(c.photo)}
                width={personWidth}
                onPress={() => router.push(`/people/${c.personId}`)}
              />
            )}
          />
        )}
        <View style={{ paddingHorizontal: GUTTER, gap: 12 }}>
          <FactsCard title={t('about')}>
            {d.tagline ? (
              <Text variant="body" size={15} weight={600}>
                {d.tagline}
              </Text>
            ) : null}
            {m.synopsis ? (
              <Text variant="body" size={15} color="text-2" style={{ lineHeight: 23 }}>
                {m.synopsis}
              </Text>
            ) : null}
          </FactsCard>
          <FactsCard title={t('information')} facts={facts.informationOf(d)} />
          <FactsCard title={t('languages')} facts={facts.languagesOf(d)} />
        </View>
      </ScrollView>
      <Sheet open={tracks} onClose={() => setTracks(false)} title={t('tracks')}>
        <View style={{ gap: 12 }}>
          <WatchWith w={w} />
          <Text variant="caption" size={13} color="text-3">
            {t('remembered')}
          </Text>
        </View>
      </Sheet>
    </View>
  )
}

/**
 * The prototype's meta line: year and length, the certification in a box, the first genre, the
 * rating in stars, and a pill for each playable version's quality (as the web's page takes them).
 */
function Meta({ d }: { d: ClientDetail }) {
  const f = useFormat()
  const theme = useTheme()
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
        columnGap: 8,
        rowGap: 4,
      }}
    >
      {lead ? (
        <Text variant="callout" color="text-2">
          {lead}
        </Text>
      ) : null}
      {d.certification ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors['text-3'],
            borderRadius: tokens.radius.sm,
            paddingHorizontal: 4,
          }}
        >
          <Text variant="caption" color="text-2">
            {d.certification}
          </Text>
        </View>
      ) : null}
      {m.genres[0] ? (
        <Text variant="callout" color="text-2">
          {m.genres[0]}
        </Text>
      ) : null}
      {m.rating > 0 ? <Rating value={m.rating} size={12} /> : null}
      {[...new Set(d.versions.filter((v) => v.playable).map((v) => v.label))].map((q) => (
        <QualityTag key={q}>{q}</QualityTag>
      ))}
    </View>
  )
}
