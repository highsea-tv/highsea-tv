// SPDX-License-Identifier: AGPL-3.0-only
// The music player on the TV (the prototype's tv/now-playing.tsx). A bar along the screen's foot
// would sit under the rows the remote moves through, so the TV does as the Apple TV's Music app
// does: while music is queued, Now playing joins the head before the bell (the song's cover with
// the playing mark), and opens a screen of its own: the cover blurred behind everything, the cover
// large at the left, the album, the song and the artist, the waveform to scrub with Left and Right
// (OK plays and pauses, as the film's scrubber does), Shuffle, Previous, Play or Pause, Next and
// Repeat, then Album, Artist and Stop, and Up next as a row of covers under them: OK plays a song
// there now, OK held offers Play now and Remove from the queue. The remote's focus is react-native-
// tvos's (@highsea-tv/ui/tv's Focusable, FocusGuide and useRemote).
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import {
  alpha,
  Button,
  Icon,
  type IconName,
  Menu,
  PlayingBars,
  Text,
  tokens,
  useTheme,
  Waveform,
} from '@highsea-tv/ui'
import {
  Focusable,
  FocusGuide,
  TV_HEAD_HEIGHT,
  TvMessage,
  useRemote,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { type Href, router } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useBack } from '../back.tsx'
import { useChromeOverlay, useHeadDown } from '../kit.tsx'
import { musicPlayerScreenMessages as messages } from './messages.ts'
import { albumPath, artistPath, clock, goTo } from './parts.tsx'
import { type Entry, musicPlayer, useMusicPlayer, useMusicPlayerText } from './store.ts'

const tv = tokens.tv

/** Left and Right on the TV's scrubber, in seconds: further than a pointer's, as the film's is. */
const TV_SEEK_S = 10
/** The head's stop for a cover: its height in units, the cover inside it, the bars beside it. */
const STOP = { height: 2.6, cover: 2, gap: 0.7 } as const
/** The prototype's sizes, in units: the cover's column, the title, the round controls, Up next's covers. */
const SIZES = { cover: 24, gap: 4, title: 3, round: 3.6, play: 5, upNext: 9, bars: 96 } as const
/** The blurred cover behind it all: the prototype's blur-[3cqw] and brightness-[0.45]. */
const BACKDROP = { blur: 3, dim: 0.55, scale: 1.1 } as const

/** Now playing in the head, before the bell, while music is queued: the cover and the playing mark. */
export function NowPlayingStop({ here, disabled }: { here: boolean; disabled?: boolean }) {
  const t = useT(messages)
  const theme = useTheme()
  const media = useMedia()
  const u = theme.u
  const p = useMusicPlayer()
  const song = p.song
  if (!song) return null
  const h = STOP.height * u
  return (
    <Focusable
      role="link"
      selected={here}
      label={t('nowPlayingSong', { title: song.title, artist: song.album.artist.name })}
      ring={false}
      lift="none"
      radius={h / 2}
      disabled={disabled}
      onPress={() => (here ? undefined : router.navigate('/now-playing' as Href))}
    >
      {(focused) => (
        <View
          style={{
            height: h,
            flexDirection: 'row',
            alignItems: 'center',
            gap: STOP.gap * u,
            paddingStart: 0.3 * u,
            paddingEnd: 1 * u,
            borderRadius: h / 2,
            backgroundColor: focused ? theme.colors.text : alpha(theme.colors.text, 0.12),
          }}
        >
          <View
            style={{
              width: STOP.cover * u,
              height: STOP.cover * u,
              borderRadius: (STOP.cover * u) / 2,
              overflow: 'hidden',
              backgroundColor: theme.colors.s2,
            }}
          >
            {song.album.cover ? (
              <Image
                source={media(song.album.cover)}
                contentFit="cover"
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
          <PlayingBars playing={p.playing} size={1.2 * u} color={focused ? 'bg' : 'text'} />
        </View>
      )}
    </Focusable>
  )
}

export function TvNowPlaying() {
  return useMusicPlayer().song ? <Playing /> : <Nothing />
}

function Nothing() {
  const t = useT(messages)
  const u = useTheme().u
  const [first, setFirst] = useState<ViewHandle | null>(null)
  useHeadDown(first)
  return (
    <View style={{ flex: 1, paddingTop: TV_HEAD_HEIGHT * u }}>
      <TvMessage
        title={t('nothingTitle')}
        actions={
          <Button
            ref={setFirst}
            variant="primary"
            icon="music"
            hasTVPreferredFocus
            onPress={() => goTo('/music')}
          >
            {t('music')}
          </Button>
        }
      >
        {t('nothingBody')}
      </TvMessage>
    </View>
  )
}

/** A round control of the player's own (controls.md › Rules), focus filling it with `text`. */
function Round({
  icon,
  label,
  big = false,
  on,
  disabled,
  preferred,
  onPress,
  ref,
}: {
  icon: IconName
  label: string
  big?: boolean
  /** Shuffle and Repeat: on, in the accent with a dot under it, so it isn't colour alone. */
  on?: boolean
  disabled?: boolean
  preferred?: boolean
  onPress: () => void
  ref?: (handle: ViewHandle | null) => void
}) {
  const theme = useTheme()
  const u = theme.u
  const size = (big ? SIZES.play : SIZES.round) * u
  return (
    <Focusable
      ref={ref}
      label={label}
      role="button"
      state={on !== undefined ? { checked: on } : undefined}
      ring={false}
      lift="button"
      radius={size / 2}
      disabled={disabled}
      preferred={preferred}
      onPress={onPress}
    >
      {(focused) => (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.4 : 1,
            backgroundColor: focused
              ? theme.colors.text
              : big
                ? alpha(theme.colors.text, 0.12)
                : 'transparent',
          }}
        >
          <Icon
            name={icon}
            size={big ? 2 : 1.6}
            color={focused ? 'bg' : on ? 'accent-text' : 'text'}
          />
          {on ? (
            <View
              style={{
                position: 'absolute',
                bottom: 0.3 * u,
                width: 0.3 * u,
                height: 0.3 * u,
                borderRadius: 0.15 * u,
                backgroundColor: theme.colors[focused ? 'bg' : 'accent-text'],
              }}
            />
          ) : null}
        </View>
      )}
    </Focusable>
  )
}

function Playing() {
  const t = useT(messages)
  const text = useMusicPlayerText()
  const theme = useTheme()
  const media = useMedia()
  const u = theme.u
  const p = useMusicPlayer()
  const [play, setPlay] = useState<ViewHandle | null>(null)
  const [onScrubber, setOnScrubber] = useState(false)
  useChromeOverlay()
  useHeadDown(play)
  useRemote((e) => {
    if (!onScrubber) return
    if (e.eventType === 'left') musicPlayer.seekBy(-TV_SEEK_S)
    else if (e.eventType === 'right') musicPlayer.seekBy(TV_SEEK_S)
  })
  const song = p.song
  if (!song) return null
  const r = text.repeatButton[p.repeat]
  const fraction = p.position / Math.max(1, song.duration)
  const stop = () => {
    musicPlayer.stop()
    router.canGoBack() ? router.back() : router.navigate('/' as Href)
  }
  return (
    <View role="main" accessibilityLabel={t('nowPlaying')} style={{ flex: 1, overflow: 'hidden' }}>
      {song.album.cover ? (
        <Image
          source={media(song.album.cover)}
          blurRadius={BACKDROP.blur * u}
          contentFit="cover"
          accessibilityElementsHidden
          style={[StyleSheet.absoluteFill, { transform: [{ scale: BACKDROP.scale }] }]}
        />
      ) : null}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: alpha(theme.colors.bg, BACKDROP.dim) }]}
      />
      <View
        style={{
          flex: 1,
          paddingTop: TV_HEAD_HEIGHT * u,
          paddingHorizontal: tv.safe.x * u,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SIZES.gap * u,
        }}
      >
        <View
          style={{
            width: SIZES.cover * u,
            aspectRatio: 1,
            borderRadius: tv.radius.poster * u,
            overflow: 'hidden',
            backgroundColor: theme.colors.s1,
            transform: [{ scale: p.playing ? 1 : 0.9 }],
            boxShadow: `0 ${1.5 * u}px ${4 * u}px rgba(0,0,0,0.5)`,
          }}
        >
          {song.album.cover ? (
            <Image
              source={media(song.album.cover)}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 1.6 * u }}>
          <View style={{ gap: 0.4 * u }}>
            <Text variant="eyebrow" color="text-3" numberOfLines={1}>
              {song.album.title}
            </Text>
            <Text
              variant="heroTitle"
              size={SIZES.title}
              numberOfLines={1}
              accessibilityRole="header"
              aria-level={1}
            >
              {song.title}
            </Text>
            <Text variant="meta" color="text-2" numberOfLines={1}>
              {song.album.artist.name}
            </Text>
          </View>
          <View style={{ gap: 0.6 * u }}>
            {/* Left and Right stay here, to seek; OK plays and pauses */}
            <FocusGuide trapFocusLeft trapFocusRight>
              {/* biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, not ARIA */}
              <Focusable
                role="adjustable"
                label={t('position', { title: song.title })}
                lift="none"
                radius={0.6 * u}
                onPress={p.toggle}
                onFocus={() => setOnScrubber(true)}
                onBlur={() => setOnScrubber(false)}
              >
                {(focused) => (
                  <View
                    accessibilityValue={{
                      text: t('positionText', {
                        at: clock(p.position),
                        total: clock(song.duration),
                      }),
                    }}
                    style={{
                      padding: 0.6 * u,
                      borderRadius: 0.6 * u,
                      backgroundColor: focused ? alpha(theme.colors.text, 0.12) : 'transparent',
                    }}
                  >
                    <Waveform
                      key={song.key}
                      loudness={song.loudness}
                      position={p.position}
                      duration={song.duration}
                      playing={p.playing}
                      bar={{ count: SIZES.bars, gap: 0.25 * u }}
                      height={5 * u}
                    />
                    {/* the playhead shows while the scrubber has focus, so Left and Right read as moving it */}
                    {focused ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0.2 * u,
                          bottom: 0.2 * u,
                          left: `${fraction * 100}%`,
                          marginLeft: 0.6 * u - 0.1 * u,
                          width: 0.2 * u,
                          borderRadius: 0.1 * u,
                          backgroundColor: theme.colors.text,
                        }}
                      />
                    ) : null}
                  </View>
                )}
              </Focusable>
            </FocusGuide>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingHorizontal: 0.6 * u,
              }}
            >
              <Text variant="meta" color="text-2" mono>
                {clock(p.position)}
              </Text>
              <Text variant="meta" color="text-2" mono>
                {t('left', { time: clock(song.duration - p.position) })}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1.2 * u }}>
            <Round icon="shuffle" label={t('shuffle')} on={p.shuffle} onPress={p.toggleShuffle} />
            <Round
              icon="previous"
              label={t('previous')}
              disabled={!p.hasPrevious}
              onPress={p.previous}
            />
            <Round
              ref={setPlay}
              icon={p.playing ? 'pause' : 'play'}
              label={p.playing ? t('pause') : t('play')}
              big
              preferred
              onPress={p.toggle}
            />
            <Round icon="next" label={t('next')} disabled={!p.hasNext} onPress={p.next} />
            <Round icon={r.icon} label={r.label} on={p.repeat !== 'off'} onPress={p.cycleRepeat} />
            <View style={{ flexDirection: 'row', gap: 0.8 * u, marginStart: 1 * u }}>
              <Button icon="music" onPress={() => goTo(albumPath(song.album.id))}>
                {t('album')}
              </Button>
              <Button icon="user" onPress={() => goTo(artistPath(song.album.artist.id))}>
                {t('artist')}
              </Button>
              {/* Stop closes the player: Now playing leaves the head */}
              <Button icon="close" onPress={stop}>
                {t('stop')}
              </Button>
            </View>
          </View>
        </View>
      </View>
      <UpNext />
    </View>
  )
}

/** Up next, as a row of covers under the controls; OK plays a song now, OK held offers Remove. */
function UpNext() {
  const t = useT(messages)
  const text = useMusicPlayerText()
  const u = useTheme().u
  const p = useMusicPlayer()
  const [menu, setMenu] = useState<Entry | null>(null)
  useBack(() => {
    if (!menu) return false
    setMenu(null)
    return true
  })
  const from = p.from ? text.playingFromLabel(p.from) : null
  const pad = { paddingHorizontal: tv.safe.x * u }
  if (p.upNext.length === 0)
    return (
      <Text variant="pill" color="text-3" style={{ ...pad, paddingBottom: tv.safe.y * u }}>
        {from ? `${from} · ${t('lastSong')}` : t('lastSong')}
      </Text>
    )
  const at = (key: string) => musicPlayer.get().queue.findIndex((e) => e.key === key)
  return (
    <View accessibilityLabel={t('upNext')} style={{ gap: 0.8 * u, paddingBottom: tv.safe.y * u }}>
      <Text variant="eyebrow" color="text-3" style={pad}>
        {from ? t('upNextFrom', { from }) : t('upNext')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ ...pad, gap: 1.2 * u, paddingVertical: 0.4 * u }}
      >
        {p.upNext.slice(0, 10).map((song) => (
          <UpNextSong
            key={song.key}
            song={song}
            onPress={() => musicPlayer.jump(at(song.key))}
            onMenu={() => setMenu(song)}
          />
        ))}
      </ScrollView>
      <Menu
        open={menu !== null}
        title={menu?.title ?? ''}
        detail={menu ? `${menu.album.artist.name} · ${menu.album.title}` : null}
        onClose={() => setMenu(null)}
        items={
          menu
            ? [
                {
                  label: t('playNowShort'),
                  icon: 'play',
                  onSelect: () => musicPlayer.jump(at(menu.key)),
                },
                {
                  label: t('removeShort'),
                  icon: 'remove',
                  closes: 'gone',
                  onSelect: () => musicPlayer.remove(menu.key),
                },
              ]
            : []
        }
      />
    </View>
  )
}

function UpNextSong({
  song,
  onPress,
  onMenu,
}: {
  song: Entry
  onPress: () => void
  onMenu: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const media = useMedia()
  const u = theme.u
  const width = SIZES.upNext * u
  return (
    <Focusable
      label={t('holdForMore', { title: song.title, artist: song.album.artist.name })}
      lift="poster"
      radius={tv.radius.poster * u}
      width={width}
      onPress={onPress}
      onLongPress={onMenu}
    >
      {(focused) => (
        <View style={{ gap: 0.5 * u }}>
          <View
            style={{
              width,
              aspectRatio: 1,
              borderRadius: tv.radius.poster * u,
              overflow: 'hidden',
              backgroundColor: theme.colors.s1,
            }}
          >
            {song.album.cover ? (
              <Image
                source={media(song.album.cover)}
                contentFit="cover"
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
          <Text variant="pill" color={focused ? 'text' : 'text-2'} numberOfLines={1}>
            {song.title}
          </Text>
        </View>
      )}
    </Focusable>
  )
}
