// SPDX-License-Identifier: AGPL-3.0-only
// An album (C3; the prototypes' {web,mobile,tv}/album.tsx), from Apple Music's and Plexamp's album
// pages: the cover blurred behind the head, the square cover, the kind, the title, the artist (a
// link to their page), the genre, year and length, the album's note, then Play (Pause while this
// album plays, as Apple Music's), Shuffle and ⋯ (the song menu for the whole album), with Download
// where the app keeps downloads. The film it scores, when it's here, is a line under them. Then the
// songs, numbered, each with its length and ⋯; the release date, the summary and ©; and the
// artist's other albums. Laid out by the form factor:
// - touch (mobile/album.tsx): Back over the blurred cover, the cover centred at 62% with the words
//   under it, Play and Shuffle side by side, Download across with ⋯ beside it, then the note and
//   the film's line, the songs, and More by as a row;
// - a pointer (web/album.tsx): the cover beside the words from medium, the actions in a row with
//   the desktop app's Download, and More by as a row with See all;
// - the TV (tv/album.tsx): the cover blurred and dimmed behind everything, the cover and words in
//   a column at the left with Play and Shuffle under it, and the songs at the right, scrolling under
//   focus while the column stays. Focus starts on Play; OK held on Play opens the album's menu.
// Every Play goes to the client's one music player (../music-player/store.ts).
import type { ClientAlbum, ClientAlbumDetail } from '@highsea-tv/api-contract'
import { useAlbum } from '@highsea-tv/client/data'
import { songSource } from '@highsea-tv/client/downloads'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  Icon,
  Poster,
  Press,
  Row,
  ScrollView,
  Text,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import {
  Focusable,
  Kept,
  TV_HEAD_HEIGHT,
  TV_ROW_GAP,
  TvPage,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { type ReactNode, useCallback, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OverlayBack } from '../detail/back.tsx'
import { filmPath, isMissing, useRowWidths } from '../detail/parts.tsx'
import { GroupDownload } from '../downloads/group.tsx'
import { ROW_KEEP } from '../keep.ts'
import { useChromeOverlay, useHeadDown } from '../kit.tsx'
import { LibraryLoading } from '../library/parts.tsx'
import { useAlbumPlaying, useMusicPlayer, usePlayingFrom } from '../music-player/store.ts'
import { musicScreenMessages as messages } from './messages.ts'
import { BlurredHead, MusicMissing, TvBlurredArt } from './page.tsx'
import { albumPath, artistPath, SongMenu, SongMore, SongRow, useMusicText } from './parts.tsx'
import { MUSIC, TV_MUSIC } from './sizes.ts'

const { space, radius } = tokens

/** The cover's side with a pointer (the prototype's w-64), and its share of the phone's width. */
const COVER = { pointer: space['16'] * 4, touch: 0.62 }

/** The words' widest with a pointer (max-w-[44rem]); Play's and Shuffle's narrowest (min-w-32). */
const WORDS_MAX = space['16'] * 11
const ACTION_MIN = space['16'] * 2

export function AlbumScreen() {
  const raw = useLocalSearchParams<{ id: string }>().id
  const id = Array.isArray(raw) ? raw[0] : raw
  if (!id) return <AlbumMissing />
  return <Load key={id} id={id} />
}

function Load({ id }: { id: string }) {
  const input = useFormFactor().input
  const found = useAlbum(id)
  if (found.status === 'loading') return <LibraryLoading touch={6} pointer={6} tv={6} />
  if (found.status === 'error') return <AlbumMissing error={found.error} />
  if (input === 'tv') return <TvAlbum x={found.data} />
  return <PageAlbum x={found.data} />
}

function AlbumMissing({ error }: { error?: Error | null }) {
  const t = useT(messages)
  const title = isMissing(error) ? t('albumMissing') : (error?.message ?? t('albumMissing'))
  return <MusicMissing title={title} body={t('albumGone')} />
}

/** The album's Play, Shuffle and songs, through the one player. */
function usePlayAlbum(a: ClientAlbum) {
  const player = useMusicPlayer()
  const current = useAlbumPlaying(a.id)
  const whole = usePlayingFrom(`/music/albums/${a.id}`)
  const playingId = current ? (current.queue[current.index]?.id ?? null) : null
  return {
    whole: !!whole?.playing,
    playingId,
    playing: !!current?.playing,
    play: () => (whole ? player.toggle() : void player.play({ album: a.id })),
    shuffle: () => void player.play({ album: a.id }, { shuffle: true }),
    song: (i: number, id: string) =>
      id === playingId ? player.toggle() : void player.play({ album: a.id }, { start: i }),
  }
}

/** The artist's name, a link to their page: a heading's size with a pointer, 17 by touch. */
function ArtistLink({ a }: { a: ClientAlbum }) {
  const touch = useFormFactor().input === 'touch'
  return (
    <Press
      accessibilityRole="link"
      onPress={() => router.push(artistPath(a.artist.id))}
      style={{ borderRadius: radius.sm }}
    >
      {({ hovered }) => (
        <Text
          variant={touch ? 'body' : 'heading'}
          size={touch ? MUSIC.phoneAlbumArtist : undefined}
          align={touch ? 'center' : 'left'}
          style={hovered ? { textDecorationLine: 'underline' } : undefined}
        >
          {a.artist.name}
        </Text>
      )}
    </Press>
  )
}

/** "The score for {film}", a link to the film. */
function FilmLine({ film }: { film: NonNullable<ClientAlbumDetail['film']> }) {
  const t = useT(messages)
  const touch = useFormFactor().input === 'touch'
  return (
    <Press
      accessibilityRole="link"
      onPress={() => router.push(filmPath(film.id))}
      style={{
        borderRadius: radius.sm,
        minHeight: touch ? tokens.targets.touch : undefined,
        justifyContent: 'center',
      }}
    >
      {({ hovered }) => (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] + space['0.5'] }}
        >
          <Icon
            name="movie"
            size={touch ? tokens.icon.size.sm : space['3'] + space['0.5']}
            color={hovered || touch ? 'text' : 'text-2'}
          />
          <Text
            variant={touch ? 'callout' : 'caption'}
            color={hovered || touch ? 'text' : 'text-2'}
          >
            {t('scoreFor', { title: film.title })}
          </Text>
          {touch ? <Icon name="chevron-right" size={tokens.icon.size.sm} color="text-3" /> : null}
        </View>
      )}
    </Press>
  )
}

// ---------------------------------------------------------------- touch and a pointer

function PageAlbum({ x }: { x: ClientAlbumDetail }) {
  const t = useT(messages)
  const text = useMusicText()
  const theme = useTheme()
  const media = useMedia()
  const insets = useSafeAreaInsets()
  const gutter = usePageGutter()
  const window = useWindowDimensions()
  const klass = useFormFactor().widthClass
  const touch = useFormFactor().input === 'touch'
  const side = !touch && klass !== 'compact'
  const chrome = useChromeOverlay(!touch && side)
  const poster = useRowWidths().poster
  const { album: a, songs, duration, released, label, about, film, more } = x
  const p = usePlayAlbum(a)
  const cover = touch
    ? (window.width - 2 * gutter) * COVER.touch
    : side
      ? COVER.pointer
      : Math.min(COVER.pointer, window.width * 0.7)
  const target = { songs: songs.map((s) => s.id), name: a.title, album: a }
  const sources = songs.map((s) => songSource(s, a))
  const summary = text.albumSummary(songs.length, duration)
  const playButton = (
    <Button variant="primary" icon={p.whole ? 'pause' : 'play'} block onPress={p.play}>
      {p.whole ? t('pause') : t('play')}
    </Button>
  )
  const shuffleButton = (
    <Button icon="shuffle" block onPress={p.shuffle}>
      {t('shuffle')}
    </Button>
  )
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {touch ? <OverlayBack /> : null}
      <ScrollView
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
        contentContainerStyle={{
          paddingBottom: touch ? space['6'] : space['16'],
          gap: touch ? space['6'] + space['1'] : space['10'],
        }}
      >
        <BlurredHead source={media(a.cover)}>
          <View
            style={{
              width: '100%',
              maxWidth: web.maxWidth,
              alignSelf: 'center',
              flexDirection: side ? 'row' : 'column',
              alignItems: side ? 'flex-end' : touch ? 'center' : 'flex-start',
              columnGap: space['10'],
              rowGap: touch ? space['1'] + space['0.5'] : space['6'],
              paddingTop: touch ? insets.top + space['12'] + space['2'] : chrome.pad + space['8'],
              paddingBottom: touch ? space['2'] : space['10'],
              paddingHorizontal: gutter,
            }}
          >
            <Image
              source={media(a.cover)}
              accessible={false}
              style={{
                width: cover,
                height: cover,
                borderRadius: radius.poster,
                marginBottom: touch ? space['3'] : 0,
                backgroundColor: theme.colors.s1,
              }}
              contentFit="cover"
            />
            <View
              style={{
                gap: touch ? space['1'] + space['0.5'] : space['3'],
                maxWidth: WORDS_MAX,
                flexShrink: 1,
                alignItems: touch ? 'center' : 'flex-start',
              }}
            >
              <Text variant="label" mono color="text-3" style={{ textTransform: 'uppercase' }}>
                {text.albumKind[a.kind]}
              </Text>
              <Text
                variant={touch ? 'title' : 'display'}
                size={touch ? space['6'] : undefined}
                align={touch ? 'center' : 'left'}
                accessibilityRole="header"
              >
                {a.title}
              </Text>
              <ArtistLink a={a} />
              <Text
                variant={touch ? 'caption' : 'body'}
                size={touch ? MUSIC.phoneMeta : undefined}
                color={touch ? 'text-3' : 'text-2'}
              >
                {(touch ? [a.genres[0], a.year] : [a.genres[0], a.year, summary])
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {!touch && about ? (
                <Text variant="body" style={{ maxWidth: space['16'] * 10 }}>
                  {about}
                </Text>
              ) : null}
              {touch ? null : (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: space['2'],
                    paddingTop: space['1'],
                  }}
                >
                  <View style={{ minWidth: ACTION_MIN }}>{playButton}</View>
                  <View style={{ minWidth: ACTION_MIN }}>{shuffleButton}</View>
                  <SongMore target={target} on="album" round />
                  <View style={{ marginStart: space['2'] }}>
                    <GroupDownload name={a.title} sources={sources} />
                  </View>
                </View>
              )}
              {!touch && film ? <FilmLine film={film} /> : null}
            </View>
          </View>
          {touch ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: space['3'], gap: space['3'] }}>
              <View style={{ flexDirection: 'row', gap: space['3'] }}>
                <View style={{ flex: 1 }}>{playButton}</View>
                <View style={{ flex: 1 }}>{shuffleButton}</View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
                <View style={{ flex: 1 }}>
                  <GroupDownload name={a.title} sources={sources} wide />
                </View>
                <SongMore target={target} on="album" />
              </View>
            </View>
          ) : null}
        </BlurredHead>
        {touch && (about || film) ? (
          <View style={{ paddingHorizontal: gutter, gap: space['2'], alignItems: 'flex-start' }}>
            {about ? (
              <Text variant="body" size={tokens.text.web.body.size} leading={1.45} color="text-2">
                {about}
              </Text>
            ) : null}
            {film ? <FilmLine film={film} /> : null}
          </View>
        ) : null}
        <View
          role="region"
          accessibilityLabel={t('songs')}
          style={{
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
            paddingHorizontal: gutter,
            gap: touch ? space['3'] : space['4'],
          }}
        >
          <View
            style={{
              borderTopWidth: touch ? 0 : StyleSheet.hairlineWidth,
              borderColor: theme.colors.line,
            }}
          >
            {songs.map((s, i) => (
              <View key={s.id}>
                <SongRow
                  song={s}
                  album={a}
                  numbered
                  on="album"
                  here={s.id === p.playingId}
                  playing={p.playing}
                  onPlay={() => p.song(i, s.id)}
                />
                {/* the divider over the row's foot, taking no height: a hairline is 1 pt on the web
                    and a third of one on an iPhone, so as a border it moved each row down by a
                    different amount on each */}
                {touch && i === songs.length - 1 ? null : (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      start: 0,
                      end: 0,
                      bottom: 0,
                      height: StyleSheet.hairlineWidth,
                      backgroundColor: theme.colors.line,
                    }}
                  />
                )}
              </View>
            ))}
          </View>
          <View style={{ gap: space['0.5'] }}>
            {[text.releasedOn(released), summary, t('copyright', { year: a.year, label })].map(
              (line) => (
                <Text
                  key={line}
                  variant="caption"
                  size={touch ? MUSIC.phoneMeta : undefined}
                  color="text-3"
                >
                  {line}
                </Text>
              ),
            )}
          </View>
        </View>
        {more.length > 0 ? (
          <View style={{ width: '100%', maxWidth: web.maxWidth, alignSelf: 'center' }}>
            <Row
              title={t('moreBy', { artist: a.artist.name })}
              items={more}
              itemWidth={touch ? window.width * 0.4 : poster}
              keyOf={(m) => m.id}
              action={
                touch ? undefined : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push(artistPath(a.artist.id))}
                  >
                    {t('seeAll')}
                  </Button>
                )
              }
              render={(m) => (
                <Poster
                  aspect="square"
                  title={m.title}
                  src={media(m.cover)}
                  width={touch ? window.width * 0.4 : poster}
                  showTitle
                  caption={text.albumMeta(m)}
                  onPress={() => router.push(albumPath(m.id))}
                />
              )}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------- the TV

/** Text that takes focus as a button would, filling with the text's colour (tv/album.tsx's quiet). */
function TvQuiet({
  onPress,
  label,
  children,
}: {
  onPress: () => void
  label: string
  children: (focused: boolean) => ReactNode
}) {
  const theme = useTheme()
  const u = theme.u
  const q = TV_MUSIC.quiet
  return (
    <Focusable onPress={onPress} label={label} lift="button" ring={false} radius={q.radius * u}>
      {(focused) => (
        <View
          style={{
            marginHorizontal: -q.x * u,
            paddingHorizontal: q.x * u,
            paddingVertical: q.y * u,
            borderRadius: q.radius * u,
            backgroundColor: focused ? theme.colors.text : undefined,
          }}
        >
          {children(focused)}
        </View>
      )}
    </Focusable>
  )
}

function TvAlbum({ x }: { x: ClientAlbumDetail }) {
  const t = useT(messages)
  const text = useMusicText()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const tv = tokens.tv
  const { album: a, songs, duration, about, film } = x
  const p = usePlayAlbum(a)
  const [menu, setMenu] = useState(false)
  // Down from the head goes to Play, where focus starts, as the prototype's down="actions"
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((v: ViewHandle | null) => setDown(v), [])
  useHeadDown(down)
  const chrome = useChromeOverlay()
  const half = ((TV_MUSIC.cover - TV_MUSIC.actionsGap) * u) / 2
  return (
    <View style={{ flex: 1 }}>
      <TvBlurredArt source={media(a.cover)} />
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          gap: TV_MUSIC.columnsGap * u,
          paddingStart: tv.safe.x * u,
          paddingTop: (TV_HEAD_HEIGHT + TV_ROW_GAP) * u,
        }}
      >
        <View
          style={{
            width: TV_MUSIC.column * u,
            gap: TV_MUSIC.columnGap * u,
            alignItems: 'flex-start',
          }}
        >
          <Image
            source={media(a.cover)}
            accessible={false}
            style={{
              width: TV_MUSIC.cover * u,
              height: TV_MUSIC.cover * u,
              borderRadius: tv.radius.poster * u,
              marginBottom: TV_MUSIC.coverBelow * u,
              backgroundColor: theme.colors.s1,
            }}
            contentFit="cover"
          />
          <Text variant="pill" mono color="text-3">
            {text.albumKind[a.kind].toUpperCase()}
          </Text>
          <Text variant="heroTitle" size={TV_MUSIC.title} accessibilityRole="header">
            {a.title}
          </Text>
          <TvQuiet label={a.artist.name} onPress={() => router.push(artistPath(a.artist.id))}>
            {(focused) => (
              <Text variant="meta" color={focused ? 'bg' : 'text'}>
                {a.artist.name}
              </Text>
            )}
          </TvQuiet>
          <Text variant="pill" color="text-2">
            {[a.genres[0], a.year, text.albumSummary(songs.length, duration)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {about ? (
            <Text variant="pill" color="text-2" leading={1.45} numberOfLines={3}>
              {about}
            </Text>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              gap: TV_MUSIC.actionsGap * u,
              paddingTop: TV_MUSIC.actionsAbove * u,
            }}
          >
            <View style={{ width: half }}>
              <Button
                ref={downRef}
                variant="primary"
                block
                hasTVPreferredFocus
                icon={p.whole ? 'pause' : 'play'}
                onPress={p.play}
                onLongPress={() => setMenu(true)}
              >
                {p.whole ? t('pause') : t('play')}
              </Button>
            </View>
            <View style={{ width: half }}>
              <Button block icon="shuffle" onPress={p.shuffle}>
                {t('shuffle')}
              </Button>
            </View>
          </View>
          {film ? (
            <TvQuiet
              label={t('scoreFor', { title: film.title })}
              onPress={() => router.push(filmPath(film.id))}
            >
              {(focused) => (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: TV_MUSIC.filmGap * u }}
                >
                  <Icon name="movie" size={TV_MUSIC.filmIcon} color={focused ? 'bg' : 'text-2'} />
                  <Text variant="pill" color={focused ? 'bg' : 'text-2'}>
                    {t('scoreFor', { title: film.title })}
                  </Text>
                </View>
              )}
            </TvQuiet>
          ) : null}
        </View>
        {/* the songs' own frame, so they scroll under focus while the column stays */}
        <View style={{ flex: 1, marginStart: -TV_MUSIC.songsInset * u }}>
          <TvPage
            keep={ROW_KEEP}
            fade={2}
            onScroll={chrome.onScroll}
            scrollEventThrottle={chrome.scrollEventThrottle}
          >
            <View
              style={{
                gap: TV_MUSIC.songsGap * u,
                paddingStart: TV_MUSIC.songsInset * u,
                paddingEnd: tv.safe.x * u,
                paddingTop: TV_MUSIC.songsInset * u,
                paddingBottom: tv.safe.y * u,
              }}
            >
              {songs.map((s, i) => (
                <Kept key={s.id}>
                  <SongRow
                    song={s}
                    album={a}
                    numbered
                    on="album"
                    here={s.id === p.playingId}
                    playing={p.playing}
                    onPlay={() => p.song(i, s.id)}
                  />
                </Kept>
              ))}
            </View>
          </TvPage>
        </View>
      </View>
      <SongMenu
        target={{ songs: songs.map((s) => s.id), name: a.title, album: a }}
        on="album"
        open={menu}
        onClose={() => setMenu(false)}
      />
    </View>
  )
}
