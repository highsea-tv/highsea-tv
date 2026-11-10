// SPDX-License-Identifier: AGPL-3.0-only
// The music player by touch (the prototype's mobile/now-playing.tsx MiniPlayer), as Apple Music's
// and Spotify's iPhone apps have it: above the tab bar on every tab while music is queued, the
// cover, the song and the artist, Play or Pause and Next, with the song's progress along its foot.
// Tapping it opens Now playing; swiping it down past SWIPE_STOP and letting go stops the music, as
// Spotify's does, and short of it the player springs back. The drag is React Native's
// PanResponder (https://reactnative.dev/docs/panresponder), as the library's SortableList's.
import { useT } from '@highsea-tv/i18n/react'
import { adminText, mobileText, player } from '@highsea-tv/tokens'
import { alpha, Press, Text, tokens, useTheme } from '@highsea-tv/ui'
import { router } from 'expo-router'
import { useRef } from 'react'
import { Animated, PanResponder, StyleSheet, View } from 'react-native'
import { useSay } from '../kit.tsx'
import { musicPlayerScreenMessages as messages } from './messages.ts'
import { Cover, Transport } from './parts.tsx'
import { musicPlayer, useMusicPlayer } from './store.ts'

const { space } = tokens

/** How far the mini player is swiped down before letting go stops the music, in points. */
const SWIPE_STOP = space['10']
/** Its height: the prototype's 56 (64 less the 8 above it). */
const HEIGHT = space['12'] + space['2']

export function MiniPlayer() {
  const t = useT(messages)
  const theme = useTheme()
  const say = useSay()
  const p = useMusicPlayer()
  const drag = useRef(new Animated.Value(0)).current
  const pan = useRef(
    PanResponder.create({
      // a downward swipe only, so a tap still reaches the buttons
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > SWIPE_STOP) {
          musicPlayer.stop()
          say({ title: t('stopped') })
          drag.setValue(0)
        } else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start()
      },
      onPanResponderTerminate: () =>
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
    }),
  ).current
  const song = p.song
  if (!song) return null
  const fraction = Math.min(1, p.position / Math.max(1, song.duration))
  return (
    <Animated.View
      {...pan.panHandlers}
      role="region"
      accessibilityLabel={t('player')}
      style={{
        marginHorizontal: space['2'],
        marginBottom: space['2'],
        height: HEIGHT,
        borderRadius: tokens.radius.md + space['0.5'],
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s2,
        overflow: 'hidden',
        transform: [{ translateY: drag }],
        opacity: drag.interpolate({
          inputRange: [0, 80],
          outputRange: [1, 0.33],
          extrapolate: 'clamp',
        }),
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['1'],
          paddingStart: space['2'],
          paddingEnd: space['1'],
        }}
      >
        <Press
          role="link"
          accessibilityLabel={t('nowPlayingSong', {
            title: song.title,
            artist: song.album.artist.name,
          })}
          onPress={() => router.push('/now-playing')}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['2'] + space['0.5'],
          }}
        >
          <Cover uri={song.album.cover} size={space['10']} radius={space['1'] + space['0.5']} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="body" weight={600} size={mobileText.subheadline.size} numberOfLines={1}>
              {song.title}
            </Text>
            <Text variant="caption" color="text-2" size={adminText.ui.size} numberOfLines={1}>
              {song.album.artist.name}
            </Text>
          </View>
        </Press>
        <Transport
          icon={p.playing ? 'pause' : 'play'}
          label={p.playing ? t('pause') : t('play')}
          size={space['10'] + space['1']}
          iconSize={player.icon.md}
          onPress={p.toggle}
        />
        <Transport
          icon="next"
          label={t('next')}
          size={space['10'] + space['1']}
          iconSize={player.icon.md}
          disabled={!p.hasNext}
          onPress={p.next}
        />
      </View>
      {/* the song's progress along the foot; the waveform to scrub is in Now playing */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          start: space['3'],
          end: space['3'],
          bottom: 0,
          height: space['0.5'],
          borderRadius: tokens.radius.pill,
          backgroundColor: alpha(theme.colors.text, 0.15),
        }}
      >
        <View
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
    </Animated.View>
  )
}
