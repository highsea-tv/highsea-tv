// SPDX-License-Identifier: AGPL-3.0-only
// The music player with a pointer, on the web and in the desktop app (the prototype's
// web/music-bar.tsx): a bar along the window's foot while music is queued, on every page, as Plex's,
// Emby's, Jellyfin's and Spotify's web players have one. At the start the cover, the song and the
// artist, each a link; in the middle Shuffle, Previous, Play or Pause, Next and Repeat over the
// song's waveform, with the time gone and the time left either side; at the end the queue, the
// volume, then Close after a rule. The queue opens as a panel from the window's end. Narrow (below
// 768), Shuffle, Repeat and the volume go, the transport sits at the end, and the waveform runs the
// bar's width under the song. The shell lays it under the page, so the page's foot stays clear of
// it as the prototype's padding kept it.

import { useT } from '@highsea-tv/i18n/react'
import { adminText, blur, musicPlayer as sizes, web } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  Press,
  ScrollView,
  Slider,
  scrimOf,
  Text,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { useState } from 'react'
import { Modal, Platform, StyleSheet, View } from 'react-native'
import { musicPlayerScreenMessages as messages } from './messages.ts'
import {
  albumPath,
  artistPath,
  Cover,
  clock,
  goTo,
  MusicQueue,
  SongWaveform,
  Transport,
} from './parts.tsx'
import { useMusicPlayer, useMusicPlayerText } from './store.ts'

const { space } = tokens
/** The transport's round buttons: the prototype's size-9 and its cover's size-14. */
const ROUND = space['10'] - space['1']
const COVER_WIDE = space['12'] + space['2']

/** The bar's height on a wide window: the prototype's medium:h-24. */
const WIDE_HEIGHT = space['16'] + space['8']
/** The queue's panel: the web renderer's SheetContent from the side (sm:max-w-sm). */
const PANEL_WIDTH = sizes.queueWidth

/** Only the web draws a blur behind the bar (react-native-web's backdropFilter), as the top bar's. */
const BLUR =
  Platform.OS === 'web'
    ? ({ backdropFilter: `blur(${blur.bar.radius}px) saturate(${blur.bar.saturate})` } as object)
    : null

export function MusicBar() {
  const t = useT(messages)
  const theme = useTheme()
  const p = useMusicPlayer()
  const gutter = usePageGutter()
  const wide = useFormFactor().widthClass === 'regular'
  const [queue, setQueue] = useState(false)
  const song = p.song
  if (!song) return null
  const volume = p.muted ? 0 : p.volume
  const info = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['3'],
        minWidth: 0,
        flexShrink: 1,
      }}
    >
      <Press
        role="link"
        accessibilityLabel={t('theAlbum', { album: song.album.title })}
        onPress={() => goTo(albumPath(song.album.id))}
      >
        <Cover
          uri={song.album.cover}
          size={wide ? COVER_WIDE : space['12']}
          radius={tokens.radius.sm}
        />
      </Press>
      <View style={{ minWidth: 0, flexShrink: 1 }}>
        <Press role="link" onPress={() => goTo(albumPath(song.album.id))}>
          <Text variant="body" weight={600} numberOfLines={1}>
            {song.title}
          </Text>
        </Press>
        <Press role="link" onPress={() => goTo(artistPath(song.album.artist.id))}>
          <Text variant="caption" color="text-2" numberOfLines={1}>
            {song.album.artist.name}
          </Text>
        </Press>
      </View>
    </View>
  )
  const scrub = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'] }}>
      <Text
        variant="mono"
        mono
        size={adminText.figure.size}
        color="text-3"
        align="right"
        style={{ width: space['10'] }}
      >
        {clock(p.position)}
      </Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <SongWaveform song={song} position={p.position} playing={p.playing} height={space['8']} />
      </View>
      <Text
        variant="mono"
        mono
        size={adminText.figure.size}
        color="text-3"
        style={{ width: space['10'] }}
      >
        {t('left', { time: clock(song.duration - p.position) })}
      </Text>
    </View>
  )
  const end = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: space['1'],
      }}
    >
      {wide ? null : <Controls wide={false} />}
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="queue"
        accessibilityLabel={t('queue')}
        hasPopup="dialog"
        accessibilityState={{ expanded: queue }}
        onPress={() => setQueue(true)}
      />
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] }}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={volume === 0 ? 'mute' : 'sound'}
            accessibilityLabel={p.muted ? t('unmute') : t('mute')}
            onPress={p.toggleMute}
          />
          <Slider
            value={volume}
            onChange={p.setVolume}
            label={t('volume')}
            valueText={t('volumeText', { percent: Math.round(volume * 100) })}
            width={space['16'] + space['8']}
            thumb={space['3']}
          />
        </View>
      ) : null}
      {/* Close stands apart from the volume, after a rule, so it reads as closing the bar */}
      <View
        style={{
          width: StyleSheet.hairlineWidth,
          height: space['6'],
          marginStart: space['2'],
          marginEnd: space['1'],
          backgroundColor: theme.colors.line,
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="close"
        accessibilityLabel={t('closePlayer')}
        onPress={p.stop}
      />
    </View>
  )
  return (
    <View
      role="region"
      accessibilityLabel={t('player')}
      style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.line,
        backgroundColor: alpha(theme.colors.bg, BLUR ? blur.bar.opacity : blur.fallbackOpacity),
        ...BLUR,
      }}
    >
      {wide ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['4'],
            height: WIDE_HEIGHT,
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
            paddingHorizontal: gutter,
          }}
        >
          {/* the prototype's three columns, 1fr 2fr 1fr */}
          <View style={{ flex: 1, minWidth: 0 }}>{info}</View>
          <View style={{ flex: 2, minWidth: 0, gap: space['1'] }}>
            <Controls wide />
            {scrub}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>{end}</View>
        </View>
      ) : (
        <View style={{ paddingHorizontal: gutter, paddingVertical: space['3'], gap: space['2'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['4'] }}>
            <View style={{ flex: 1, minWidth: 0 }}>{info}</View>
            {end}
          </View>
          {scrub}
        </View>
      )}
      <QueuePanel open={queue} onClose={() => setQueue(false)} />
    </View>
  )
}

/** Previous, Play or Pause and Next; wide, between Shuffle and Repeat, as Spotify's are. */
function Controls({ wide }: { wide: boolean }) {
  const t = useT(messages)
  const text = useMusicPlayerText()
  const p = useMusicPlayer()
  const r = text.repeatButton[p.repeat]
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space['2'],
      }}
    >
      {wide ? (
        <Transport
          icon="shuffle"
          label={t('shuffle')}
          size={ROUND}
          iconSize={sizes.bar.skipIcon}
          tint="text-2"
          on={p.shuffle}
          onPress={p.toggleShuffle}
        />
      ) : null}
      <Transport
        icon="previous"
        label={t('previous')}
        size={ROUND}
        iconSize={sizes.bar.icon}
        tint="text-2"
        disabled={!p.hasPrevious}
        onPress={p.previous}
      />
      <Transport
        icon={p.playing ? 'pause' : 'play'}
        label={p.playing ? t('pause') : t('play')}
        size={space['10']}
        iconSize={sizes.bar.icon}
        filled
        onPress={p.toggle}
      />
      <Transport
        icon="next"
        label={t('next')}
        size={ROUND}
        iconSize={sizes.bar.icon}
        tint="text-2"
        disabled={!p.hasNext}
        onPress={p.next}
      />
      {wide ? (
        <Transport
          icon={r.icon}
          label={r.label}
          size={ROUND}
          iconSize={sizes.bar.skipIcon}
          tint="text-2"
          on={p.repeat !== 'off'}
          onPress={p.cycleRepeat}
        />
      ) : null}
    </View>
  )
}

/** The queue as a panel from the window's end, over a scrim that closes it, as a side sheet. */
function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(messages)
  const theme = useTheme()
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* the scrim: a press outside closes it, as a sheet's does; Close and Escape are the
            keyboard's and the screen reader's */}
        <Press
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: scrimOf(50) }}
        >
          {null}
        </Press>
        <View
          accessibilityViewIsModal
          role="dialog"
          accessibilityLabel={t('queue')}
          style={{
            width: PANEL_WIDTH,
            maxWidth: '100%',
            backgroundColor: theme.colors.s1,
            borderStartWidth: StyleSheet.hairlineWidth,
            borderStartColor: theme.colors.line,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: space['6'],
              paddingTop: space['4'],
              minHeight: COVER_WIDE,
            }}
          >
            <Text variant="title" accessibilityRole="header" aria-level={2} style={{ flex: 1 }}>
              {t('queue')}
            </Text>
            <Button
              variant="ghost"
              iconOnly
              icon="close"
              accessibilityLabel={t('close')}
              onPress={onClose}
            />
          </View>
          <ScrollView contentContainerStyle={{ padding: space['6'], paddingTop: space['3'] }}>
            <MusicQueue onGo={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
