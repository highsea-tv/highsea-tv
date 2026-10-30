// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail on the phone (client-detail.md#mobile), from the prototype's mobile/detail.tsx:
// the backdrop with Back over it; the title, Play or Resume across the width, Play from the start,
// More (Mark as watched); then Watch with, the synopsis, the cast and More like this. Picks are
// remembered per title, across devices. Choices open iOS's action sheet
// (https://reactnative.dev/docs/actionsheetios). Downloading waits for 4.6, so there's no
// Download button yet.
import type { ClientDetail } from '@highsea-tv/api-contract'
import { useItem, useMarkWatched, usePicks } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Poster,
  Press,
  Row,
  successHaptic,
  Text,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { ActionSheetIOS, ActivityIndicator, Alert, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Center, Group, GUTTER, TAB_BAR } from '../../../../kit.tsx'
import { detail as messages } from '../../../../messages.ts'
import { PosterRow } from '../../(home)/index.tsx'

const OFF = 'off'

/** An action sheet of choices; resolves with the chosen value, or nothing on Cancel. */
export function choose(
  title: string,
  options: { value: string; label: string }[],
  cancel: string,
  chosen?: string,
): Promise<string | undefined> {
  return new Promise((resolve) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => (o.value === chosen ? `${o.label} ✓` : o.label)), cancel],
        cancelButtonIndex: options.length,
        userInterfaceStyle: 'dark',
      },
      (i) => resolve(options[i]?.value),
    ),
  )
}

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

function WatchWith({ detail }: { detail: ClientDetail }) {
  const t = useT(messages)
  const { picks, save } = usePicks(detail.item.id)
  const p = picks.data
  const playable = detail.versions.filter((v) => v.playable)
  const version = playable.find((v) => v.id === p?.versionId) ?? playable[0]
  if (!version)
    return (
      <Text variant="callout" color="text-3">
        {t('notPlayable')}
      </Text>
    )
  const run = (patch: Parameters<typeof save.run>[0]) =>
    save
      .run(patch)
      .then(() => picks.refetch())
      .catch((e: Error) => Alert.alert(t('saveFailed', { message: e.message })))
  const audio =
    version.audio.find((a) => a.id === p?.audioId) ?? version.audio.find((a) => a.default)
  const subtitle = version.subtitles.find((s) => s.id === p?.subtitleId)
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
  const f = useFormat()
  const media = useMedia()
  const id = Number(useLocalSearchParams<{ id: string }>().id)
  const detail = useItem(id)
  const mark = useMarkWatched(id)
  const castWidth = usePosterWidth(0.26)

  const back = (
    <Press
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      accessibilityLabel={t('back')}
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 12,
        zIndex: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(11,11,12,0.62)',
      }}
    >
      <Icon name="chevron-left" size={20} color="text" />
    </Press>
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

  const d = detail.data
  const m = d.item
  const resuming = m.progress !== null
  const more = async () => {
    const v = await choose(
      m.title,
      [{ value: 'mark', label: m.watched ? t('markUnwatched') : t('markWatched') }],
      t('cancel'),
    )
    if (v !== 'mark') return
    mark.run(!m.watched).then(
      () => {
        successHaptic()
        detail.refetch()
      },
      (e: Error) => Alert.alert(t('markFailed', { message: e.message })),
    )
  }

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
              backgroundImage: `linear-gradient(0deg, ${theme.colors.bg}, transparent 60%)`,
            }}
          />
        </View>
        <View style={{ marginTop: -48, paddingHorizontal: GUTTER, gap: 12 }}>
          <Text variant="largeTitle" size={28} accessibilityRole="header">
            {m.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text variant="callout" color="text-2">
              {f.meta(m)}
            </Text>
            {m.watched && <Badge tone="success">{t('watched')}</Badge>}
          </View>
          {m.playable ? (
            <>
              <Button
                variant="primary"
                icon="play"
                block
                onPress={() => router.push(`/play/${m.id}`)}
              >
                {resuming ? `${t('resume')} · ${f.left(m) ?? ''}` : t('play')}
              </Button>
              {resuming && (
                <Button icon="replay" block onPress={() => router.push(`/play/${m.id}?start=1`)}>
                  {t('fromStart')}
                </Button>
              )}
            </>
          ) : (
            <Text variant="callout" color="text-3">
              {t('notPlayable')}
            </Text>
          )}
          <View style={{ flexDirection: 'row' }}>
            <Button icon="more" label={t('more')} onPress={() => void more()} />
          </View>
          {m.synopsis ? (
            <Text variant="body" size={15} color="text-2" style={{ lineHeight: 23 }}>
              {m.synopsis}
            </Text>
          ) : null}
          {d.directors.length > 0 && (
            <Text variant="caption" size={13} color="text-3">
              {t('directedBy', { names: d.directors.map((x) => x.name).join(' · ') })}
            </Text>
          )}
        </View>
        {m.playable && (
          <View style={{ paddingHorizontal: GUTTER, gap: 12 }}>
            <Text variant="title" size={17} accessibilityRole="header">
              {t('watchWith')}
            </Text>
            <WatchWith detail={d} />
            <Text variant="caption" size={13} color="text-3">
              {t('remembered')}
            </Text>
          </View>
        )}
        {d.cast.length > 0 && (
          <Row
            title={t('cast')}
            items={d.cast}
            itemWidth={castWidth}
            keyOf={(c) => `${c.personId}:${c.character}`}
            render={(c) => (
              <Poster
                title={c.name}
                src={media(c.photo)}
                width={castWidth}
                showTitle
                caption={c.character ?? undefined}
              />
            )}
          />
        )}
        {d.related.length > 0 && <PosterRow title={t('moreLike')} items={d.related} />}
      </ScrollView>
    </View>
  )
}
