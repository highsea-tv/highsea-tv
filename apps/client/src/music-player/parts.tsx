// SPDX-License-Identifier: AGPL-3.0-only
// What the music player's screens share (the web's bar, the phone's mini player and Now playing,
// the TV's Now playing): the album's cover from the server, the transport's round buttons, the
// time either side of the waveform, and the queue (the prototype's client/music-queue.tsx): what
// it's playing from, the song playing, then Up next, reordered by its handles and each with Remove,
// and Clear. A song in Up next plays from there.
import { createFormat } from '@highsea-tv/client/format'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { adminText, type ColorRole } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  Icon,
  type IconName,
  Press,
  SortableList,
  Text,
  tokens,
  useTheme,
  Waveform,
} from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { type Href, router } from 'expo-router'
import { View } from 'react-native'
import { musicPlayerScreenMessages as messages } from './messages.ts'
import { type Entry, musicPlayer, useMusicPlayer, useMusicPlayerText } from './store.ts'

const { space } = tokens
export const { clock } = createFormat()

/** Goes to a page of Music's: an album, an artist, what's playing from. */
export const goTo = (path: string) => router.navigate(path as Href)
export const albumPath = (id: string) => `/music/albums/${id}`
export const artistPath = (id: string) => `/music/artists/${id}`

/** The album's square cover, rounded by `radius`; the s2 fill until it loads. */
export function Cover({
  uri,
  size,
  radius,
}: {
  uri: string | null
  /** Its side in points, or undefined to fill its parent's width. */
  size?: number
  radius: number
}) {
  const theme = useTheme()
  const media = useMedia()
  return (
    <Image
      source={media(uri)}
      accessibilityIgnoresInvertColors
      style={{
        width: size ?? '100%',
        aspectRatio: 1,
        borderRadius: radius,
        backgroundColor: theme.colors.s2,
      }}
      contentFit="cover"
    />
  )
}

/**
 * A round transport button: the player's own, which stays round (controls.md › Rules). `filled`
 * is Play or Pause's disc in the text's colour; `on` is Shuffle's or Repeat's, in the accent with a
 * dot under it, so it isn't colour alone.
 */
export function Transport({
  icon,
  label,
  size,
  iconSize,
  filled,
  on,
  disabled,
  tint = 'text',
  onPress,
}: {
  icon: IconName
  label: string
  size: number
  iconSize: number
  filled?: boolean
  on?: boolean
  disabled?: boolean
  tint?: ColorRole
  onPress: () => void
}) {
  const theme = useTheme()
  const color: ColorRole = filled ? 'bg' : on ? 'accent-text' : tint
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(on !== undefined ? { checked: on } : {}) }}
      style={({ hovered }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: filled
          ? theme.colors.text
          : hovered && !disabled
            ? alpha(theme.colors.text, 0.08)
            : undefined,
      })}
    >
      <Icon name={icon} size={iconSize} color={color} />
      {on ? (
        <View
          style={{
            position: 'absolute',
            bottom: space['0.5'],
            width: space['1'],
            height: space['1'],
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors['accent-text'],
          }}
        />
      ) : null}
    </Press>
  )
}

/** The song's waveform to scrub, named for VoiceOver and with the pointer's time. */
export function SongWaveform({
  song,
  position,
  playing,
  height,
  bar,
  seek = true,
}: {
  song: Entry
  position: number
  playing: boolean
  height: number
  bar?: { width: number; gap: number } | { count: number; gap: number }
  /** The TV seeks with the remote, round the waveform (its own focus stop). */
  seek?: boolean
}) {
  const t = useT(messages)
  return (
    <Waveform
      key={song.key}
      loudness={song.loudness}
      position={position}
      duration={song.duration}
      playing={playing}
      height={height}
      bar={bar}
      onSeek={seek ? musicPlayer.seekTo : undefined}
      label={t('position', { title: song.title })}
      valueText={t('positionText', { at: clock(position), total: clock(song.duration) })}
      timeAt={clock}
    />
  )
}

/** The queue, in the web's panel and the phone's sheet. `onGo` closes it as a link is followed. */
export function MusicQueue({ onGo }: { onGo: () => void }) {
  const t = useT(messages)
  const text = useMusicPlayerText()
  const p = useMusicPlayer()
  const song = p.song
  if (!song) return null
  const go = (path: string) => {
    onGo()
    goTo(path)
  }
  return (
    <View style={{ gap: space['5'] }}>
      {p.from ? (
        p.from.to ? (
          <Press
            role="link"
            onPress={() => go(p.from?.to ?? '/')}
            style={{ alignSelf: 'flex-start' }}
          >
            <Text variant="caption" color="text-2">
              {text.playingFromLabel(p.from)}
            </Text>
          </Press>
        ) : (
          <Text variant="caption" color="text-2">
            {text.playingFromLabel(p.from)}
          </Text>
        )
      ) : null}
      <View style={{ gap: space['2'] }}>
        <Text variant="label" color="text-3" mono accessibilityRole="header" aria-level={3}>
          {t('nowPlaying')}
        </Text>
        <SongLine song={song} current />
      </View>
      <View style={{ gap: space['2'] }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text variant="label" color="text-3" mono accessibilityRole="header" aria-level={3}>
            {t('upNext')}
          </Text>
          {p.upNext.length > 0 ? (
            <Button size="sm" variant="ghost" onPress={musicPlayer.clearUpNext}>
              {t('clear')}
            </Button>
          ) : null}
        </View>
        {p.upNext.length === 0 ? (
          <Text variant="caption" color="text-3">
            {t('nothingNext')}
          </Text>
        ) : (
          <SortableList
            accessibilityLabel={t('upNext')}
            items={p.upNext}
            id={(x) => x.key}
            label={(x) => x.title}
            onChange={(next) => musicPlayer.reorder(next.map((x) => x.key))}
            messages={{
              move: (title) => t('moveSong', { title }),
              moveUp: (title) => t('moveUp', { title }),
              moveDown: (title) => t('moveDown', { title }),
              moved: (title, index, count) => t('moved', { title, index, count }),
            }}
          >
            {(x, handle) => (
              <>
                {handle}
                <Press
                  onPress={() =>
                    musicPlayer.jump(musicPlayer.get().queue.findIndex((e) => e.key === x.key))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t('playNow', { title: x.title })}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <SongLine song={x} />
                </Press>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="close"
                  accessibilityLabel={t('remove', { title: x.title })}
                  onPress={() => musicPlayer.remove(x.key)}
                />
              </>
            )}
          </SortableList>
        )}
      </View>
    </View>
  )
}

/** A song in the queue: its cover, title, artist and album, and its length. */
function SongLine({ song, current }: { song: Entry; current?: boolean }) {
  const t = useT(messages)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['3'], minWidth: 0 }}>
      <Cover uri={song.album.cover} size={space['10']} radius={tokens.radius.sm} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="body"
          weight={600}
          color={current ? 'accent-text' : 'text'}
          numberOfLines={1}
        >
          {song.title}
        </Text>
        <Text variant="caption" color="text-2" numberOfLines={1}>
          {t('songLine', { artist: song.album.artist.name, album: song.album.title })}
        </Text>
      </View>
      <Text variant="mono" mono color="text-3" size={adminText.figure.size}>
        {clock(song.duration)}
      </Text>
    </View>
  )
}
