// SPDX-License-Identifier: AGPL-3.0-only
// Now playing by touch (the prototype's mobile/now-playing.tsx), as Apple Music's and Spotify's
// iPhone players have it: the mini player opens it over the tabs, the cover blurred behind
// everything. At the top Close, where the music plays from (a link to it) and More, a menu with Go
// to the album, Go to the artist and Stop; then the cover large, smaller while paused; the song and
// its artist (a link); the waveform to scrub, with the time gone and the time left; Shuffle,
// Previous, Play or Pause, Next and Repeat; the volume; AirPlay, and the queue in a sheet. With
// nothing queued, the words and a way to Music.
import { useServes } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import {
  alpha,
  Button,
  EmptyState,
  Icon,
  Menu,
  Press,
  ScrollView,
  Sheet,
  Slider,
  Text,
  tokens,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { type Href, router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { airPlayButton, HAS_AIRPLAY } from '../player/picture'
import { musicPlayerScreenMessages as messages } from './messages.ts'
import {
  albumPath,
  artistPath,
  clock,
  goTo,
  MusicQueue,
  SongWaveform,
  Transport,
} from './parts.tsx'
import { musicPlayer, useMusicPlayer, useMusicPlayerText } from './store.ts'

const { space } = tokens
/** The prototype's mono label, uppercase, which the phone's text scale has no style for. */
const UPPER = { textTransform: 'uppercase' } as const

/** The cover's width in the column, and its scale while paused: the prototype's 88% and 0.86. */
const COVER = { width: '88%', paused: 0.86 } as const
/** The cover behind everything: the prototype's blur-[60px], scale-150 and opacity-50. */
const BACKDROP = { blur: 60, scale: 1.5, opacity: 0.5 } as const

/** Closes Now playing: back to the tab it opened over, or Home when opened by its address. */
const close = () => (router.canGoBack() ? router.back() : router.navigate('/' as Href))

export function TouchNowPlaying() {
  const p = useMusicPlayer()
  return p.song ? <Playing /> : <Nothing />
}

function Nothing() {
  const t = useT(messages)
  const insets = useSafeAreaInsets()
  // the phone's Music is Library's view, where the server serves it
  const music = useServes('music')
  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: space['2'] }}>
        <Button
          variant="ghost"
          iconOnly
          icon="chevron-down"
          accessibilityLabel={t('closeNowPlaying')}
          onPress={close}
        />
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="music"
          title={t('nothingTitle')}
          level={1}
          action={
            music ? (
              <Button icon="music" onPress={() => goTo('/library?view=music')}>
                {t('music')}
              </Button>
            ) : null
          }
        >
          {t('nothingBody')}
        </EmptyState>
      </View>
    </View>
  )
}

function Playing() {
  const t = useT(messages)
  const text = useMusicPlayerText()
  const theme = useTheme()
  const media = useMedia()
  const insets = useSafeAreaInsets()
  const gutter = usePageGutter()
  const p = useMusicPlayer()
  const [queue, setQueue] = useState(false)
  const [more, setMore] = useState(false)
  // the cover settles smaller while paused, on the design system's spring
  const scale = useRef(new Animated.Value(p.playing ? 1 : COVER.paused)).current
  useEffect(() => {
    Animated.spring(scale, {
      toValue: p.playing ? 1 : COVER.paused,
      useNativeDriver: true,
      ...tokens.springs.base,
    }).start()
  }, [p.playing, scale])
  const song = p.song
  if (!song) return null
  const volume = p.muted ? 0 : p.volume
  const r = text.repeatButton[p.repeat]
  const fromName =
    p.from?.kind === 'search'
      ? t('search', { name: p.from.name })
      : (p.from?.name ?? song.album.title)
  const from = (
    <>
      <Text variant="mono" mono size={11} color="text-3" align="center" style={UPPER}>
        {t('playingFrom')}
      </Text>
      <Text variant="body" weight={600} size={13} align="center" numberOfLines={1}>
        {fromName}
      </Text>
    </>
  )
  return (
    <View role="main" accessibilityLabel={t('nowPlaying')} style={{ flex: 1, overflow: 'hidden' }}>
      {song.album.cover ? (
        <Image
          source={media(song.album.cover)}
          blurRadius={BACKDROP.blur}
          contentFit="cover"
          accessibilityElementsHidden
          style={[
            StyleSheet.absoluteFill,
            { opacity: BACKDROP.opacity, transform: [{ scale: BACKDROP.scale }] },
          ]}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(theme.colors.bg, 0.4) }]} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + space['4'],
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['2'],
            paddingHorizontal: gutter,
          }}
        >
          <Button
            variant="ghost"
            iconOnly
            icon="chevron-down"
            accessibilityLabel={t('closeNowPlaying')}
            onPress={close}
          />
          {p.from?.to ? (
            <Press
              role="link"
              accessibilityLabel={text.playingFromLabel(p.from)}
              onPress={() => goTo(p.from?.to ?? '/')}
              style={{ flex: 1, minWidth: 0 }}
            >
              {from}
            </Press>
          ) : (
            <View style={{ flex: 1, minWidth: 0 }}>{from}</View>
          )}
          <Button
            variant="ghost"
            iconOnly
            icon="more"
            hasPopup="menu"
            accessibilityLabel={t('more')}
            onPress={() => setMore(true)}
          />
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: space['4'],
            paddingHorizontal: gutter,
          }}
        >
          <Animated.View
            style={{
              width: COVER.width,
              aspectRatio: 1,
              borderRadius: tokens.radius.lg,
              backgroundColor: theme.colors.s2,
              overflow: 'hidden',
              transform: [{ scale }],
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
            }}
          >
            {song.album.cover ? (
              <Image
                source={media(song.album.cover)}
                contentFit="cover"
                accessibilityElementsHidden
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </Animated.View>
        </View>
        <View style={{ gap: space['4'], paddingHorizontal: gutter }}>
          <View style={{ minWidth: 0 }}>
            <Text
              variant="title"
              size={22}
              accessibilityRole="header"
              aria-level={1}
              numberOfLines={1}
            >
              {song.title}
            </Text>
            <Press
              role="link"
              onPress={() => goTo(artistPath(song.album.artist.id))}
              style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
            >
              <Text variant="body" size={18} color="text-2" numberOfLines={1}>
                {song.album.artist.name}
              </Text>
            </Press>
          </View>
          <View style={{ gap: space['1'] + space['0.5'] }}>
            <SongWaveform
              song={song}
              position={p.position}
              playing={p.playing}
              height={space['12']}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="mono" mono size={12} color="text-3">
                {clock(p.position)}
              </Text>
              <Text variant="mono" mono size={12} color="text-3">
                {t('left', { time: clock(song.duration - p.position) })}
              </Text>
            </View>
          </View>
          {/* the player's own transport (controls.md › Rules): round, over the cover's colour */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Transport
              icon="shuffle"
              label={t('shuffle')}
              size={space['10'] + space['1']}
              iconSize={22}
              tint="text-2"
              on={p.shuffle}
              onPress={p.toggleShuffle}
            />
            <Transport
              icon="previous"
              label={t('previous')}
              size={space['12'] + space['2']}
              iconSize={34}
              disabled={!p.hasPrevious}
              onPress={p.previous}
            />
            <Transport
              icon={p.playing ? 'pause' : 'play'}
              label={p.playing ? t('pause') : t('play')}
              size={space['16'] + space['2']}
              iconSize={34}
              filled
              onPress={p.toggle}
            />
            <Transport
              icon="next"
              label={t('next')}
              size={space['12'] + space['2']}
              iconSize={34}
              disabled={!p.hasNext}
              onPress={p.next}
            />
            <Transport
              icon={r.icon}
              label={r.label}
              size={space['10'] + space['1']}
              iconSize={22}
              tint="text-2"
              on={p.repeat !== 'off'}
              onPress={p.cycleRepeat}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}>
            <Icon name="mute" size={16} color="text-3" />
            <View style={{ flex: 1 }}>
              <Slider
                value={volume}
                onChange={p.setVolume}
                label={t('volume')}
                valueText={t('volumeText', { percent: Math.round(volume * 100) })}
                track={space['1'] + space['0.5']}
              />
            </View>
            <Icon name="sound" size={16} color="text-3" />
          </View>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            {HAS_AIRPLAY ? (
              airPlayButton({
                label: t('airplay'),
                tint: theme.colors.text,
                activeTint: theme.colors['accent-text'],
                onOpen: () => {},
              })
            ) : (
              <View />
            )}
            <Button
              variant="ghost"
              iconOnly
              icon="queue"
              hasPopup="dialog"
              accessibilityLabel={
                p.upNext[0] ? t('queueUpNext', { title: p.upNext[0].title }) : t('queueNothing')
              }
              onPress={() => setQueue(true)}
            />
          </View>
        </View>
      </ScrollView>
      <Sheet open={queue} onClose={() => setQueue(false)} title={t('queue')}>
        <MusicQueue onGo={() => setQueue(false)} />
      </Sheet>
      <Menu
        open={more}
        title={song.title}
        onClose={() => setMore(false)}
        items={[
          {
            label: t('goAlbum'),
            icon: 'music',
            closes: 'leave',
            onSelect: () => goTo(albumPath(song.album.id)),
          },
          {
            label: t('goArtist'),
            icon: 'user',
            closes: 'leave',
            onSelect: () => goTo(artistPath(song.album.artist.id)),
          },
          {
            label: t('stop'),
            icon: 'close',
            closes: 'leave',
            onSelect: () => {
              musicPlayer.stop()
              close()
            },
          },
        ]}
      />
    </View>
  )
}
