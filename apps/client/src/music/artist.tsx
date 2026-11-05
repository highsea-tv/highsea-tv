// SPDX-License-Identifier: AGPL-3.0-only
// An artist (C3; the prototypes' {web,mobile,tv}/artist.tsx), laid out as a person's page is: their
// newest cover blurred behind a round photo, the name, the genres and counts, Play (Pause while
// they play) and Shuffle, as Apple Music's and Plexamp's artist pages have them, and the note cut
// with More. A composer credited on a film here links to their person page (Their films and
// shows). Then their albums in a row for each kind, newest first, as Apple Music groups them
// (Albums, Singles and EPs, Soundtracks, Compilations), and artists who share a genre with them.
// The photo is the person page's PersonPortrait, which has the prototypes' sizes (128 by touch,
// 144 and 192 with a pointer, 13u on the TV). Laid out by the form factor:
// - touch (mobile/artist.tsx): Back over the blurred cover, the photo centred with the words under
//   it, Play and Shuffle side by side, the note cut at four lines, and rows at 40% of the width
//   (similar artists at 28%);
// - a pointer (web/artist.tsx): the photo beside the words from medium, the note cut at three;
// - the TV (tv/artist.tsx): the cover blurred and dimmed behind everything, the photo beside the
//   words, and a row for each kind; focus starts on Play.
import type { ClientArtistDetail } from '@highsea-tv/api-contract'
import { useArtist } from '@highsea-tv/client/data'
import { LONG_BIO } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  PersonPortrait,
  Poster,
  Row,
  ScrollView,
  Text,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { Kept, TV_HEAD_HEIGHT, TV_ROW_GAP, TvPage, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { type ReactElement, type ReactNode, type Ref, useCallback, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OverlayBack } from '../detail/back.tsx'
import { isMissing, useRowWidths } from '../detail/parts.tsx'
import { ROW_KEEP } from '../keep.ts'
import { useChromeOverlay, useHeadDown } from '../kit.tsx'
import { LibraryLoading } from '../library/parts.tsx'
import { useMusicPlayer, usePlayingFrom } from '../music-player/store.ts'
import { ArtistTile } from './library.tsx'
import { musicScreenMessages as messages } from './messages.ts'
import { BlurredHead, MusicMissing, TvBlurredArt } from './page.tsx'
import { albumPath, useMusicText } from './parts.tsx'
import { MUSIC, TV_MUSIC } from './sizes.ts'

const { space } = tokens

/** The words' widest with a pointer (max-w-[44rem]); Play's and Shuffle's narrowest (min-w-32). */
const WORDS_MAX = space['16'] * 11
const ACTION_MIN = space['16'] * 2
/** The note's line with a pointer (`max-w-[60ch]`): 624 at the body's 15, in Geist's figures. */
const BIO_MAX = space['16'] * 9.75

/** The phone's rows: albums at 40% of the width, similar artists at 28% (mobile/artist.tsx). */
const PHONE_ROW = { album: 0.4, artist: 0.28 }

export function ArtistScreen() {
  const raw = useLocalSearchParams<{ id: string }>().id
  const id = Array.isArray(raw) ? raw[0] : raw
  if (!id) return <ArtistMissing />
  return <Load key={id} id={id} />
}

function Load({ id }: { id: string }) {
  const input = useFormFactor().input
  const found = useArtist(id)
  if (found.status === 'loading') return <LibraryLoading touch={6} pointer={6} tv={7} />
  if (found.status === 'error') return <ArtistMissing error={found.error} />
  if (input === 'tv') return <TvArtist x={found.data} />
  return <PageArtist x={found.data} />
}

function ArtistMissing({ error }: { error?: Error | null }) {
  const t = useT(messages)
  const title = isMissing(error) ? t('artistMissing') : (error?.message ?? t('artistMissing'))
  return <MusicMissing title={title} body={t('artistGone')} />
}

/** Play, Shuffle and the words shared by every form factor. */
function useArtistHead(x: ClientArtistDetail) {
  const t = useT(messages)
  const text = useMusicText()
  const player = useMusicPlayer()
  const current = usePlayingFrom(`/music/artists/${x.artist.id}`)
  return {
    playing: !!current?.playing,
    play: () => (current ? player.toggle() : void player.play({ artist: x.artist.id })),
    shuffle: () => void player.play({ artist: x.artist.id }, { shuffle: true }),
    genres: x.artist.genres.join(' · '),
    counts: t('artistMeta', {
      albums: text.albumsCount(x.artist.albums),
      songs: text.songsCount(x.songs),
    }),
    person: x.person === null ? null : () => router.push(`/people/${x.person}` as Href),
  }
}

/** The note, cut at `lines` when it's long, with More to show the rest in place. */
function ArtistBio({ text, lines, ref }: { text: string; lines: number; ref?: Ref<ViewHandle> }) {
  const t = useT(messages)
  const input = useFormFactor().input
  const tv = input === 'tv'
  const [open, setOpen] = useState(false)
  const long = text.length >= LONG_BIO
  return (
    <View style={{ gap: space['2'], alignItems: 'flex-start' }}>
      <Text
        variant={tv ? 'synopsis' : 'body'}
        color={input === 'pointer' ? 'text' : 'text-2'}
        size={input === 'touch' ? tokens.text.web.body.size : undefined}
        leading={input === 'touch' ? 1.45 : undefined}
        numberOfLines={long && !open ? lines : undefined}
        style={input === 'pointer' ? { maxWidth: BIO_MAX } : undefined}
      >
        {text}
      </Text>
      {long ? (
        <Button
          ref={ref}
          variant={tv ? 'overlay' : 'ghost'}
          size={tv ? 'md' : 'sm'}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
        >
          {open ? t('less') : t('moreBio')}
        </Button>
      ) : null}
    </View>
  )
}

/** A row for each kind of album, then similar artists, at every form factor. */
function Rows({
  x,
  widths,
  wrap = (_, row) => row,
}: {
  x: ClientArtistDetail
  widths: { album: number; artist: number }
  /** The TV keeps each row in its own Kept part. */
  wrap?: (key: string, row: ReactElement) => ReactNode
}) {
  const t = useT(messages)
  const text = useMusicText()
  const media = useMedia()
  return (
    <>
      {x.sections.map(({ kind, albums }) =>
        wrap(
          kind,
          <Row
            key={kind}
            title={text.discographyTitle[kind]}
            items={albums}
            itemWidth={widths.album}
            keyOf={(m) => m.id}
            render={(m) => (
              <Poster
                aspect="square"
                title={m.title}
                src={media(m.cover)}
                width={widths.album}
                showTitle
                caption={kind === 'singles' ? text.albumMeta(m) : String(m.year)}
                onPress={() => router.push(albumPath(m.id))}
              />
            )}
          />,
        ),
      )}
      {x.similar.length > 0
        ? wrap(
            'similar',
            <Row
              title={t('similar')}
              items={x.similar}
              itemWidth={widths.artist}
              keyOf={(m) => m.id}
              render={(m) => <ArtistTile artist={m} width={widths.artist} />}
            />,
          )
        : null}
    </>
  )
}

// ---------------------------------------------------------------- touch and a pointer

function PageArtist({ x }: { x: ClientArtistDetail }) {
  const t = useT(messages)
  const theme = useTheme()
  const media = useMedia()
  const insets = useSafeAreaInsets()
  const gutter = usePageGutter()
  const window = useWindowDimensions()
  const { input, widthClass } = useFormFactor()
  const touch = input === 'touch'
  const side = !touch && widthClass !== 'compact'
  const chrome = useChromeOverlay(side)
  const poster = useRowWidths().poster
  const h = useArtistHead(x)
  const a = x.artist
  const play = (
    <Button variant="primary" icon={h.playing ? 'pause' : 'play'} block onPress={h.play}>
      {h.playing ? t('pause') : t('play')}
    </Button>
  )
  const shuffle = (
    <Button icon="shuffle" block onPress={h.shuffle}>
      {t('shuffle')}
    </Button>
  )
  const theirs = h.person ? (
    <Button variant="ghost" icon="movie" onPress={h.person}>
      {t('theirFilms')}
    </Button>
  ) : null
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
        <BlurredHead source={media(x.backdrop)}>
          <View
            style={{
              width: '100%',
              maxWidth: web.maxWidth,
              alignSelf: 'center',
              flexDirection: side ? 'row' : 'column',
              alignItems: touch ? 'center' : side ? 'center' : 'flex-start',
              columnGap: space['10'],
              rowGap: touch ? space['2'] : space['6'],
              paddingTop: touch ? insets.top + space['12'] + space['2'] : chrome.pad + space['8'],
              paddingBottom: touch ? space['2'] : space['10'],
              paddingHorizontal: gutter,
            }}
          >
            <View style={{ marginBottom: touch ? space['3'] : 0 }}>
              <PersonPortrait photo={media(a.photo)} />
            </View>
            <View
              style={{
                gap: touch ? space['2'] : space['3'],
                maxWidth: WORDS_MAX,
                flexShrink: 1,
                alignItems: touch ? 'center' : 'flex-start',
              }}
            >
              <Text
                variant={touch ? 'largeTitle' : 'display'}
                size={touch ? MUSIC.phoneArtistName : undefined}
                align={touch ? 'center' : 'left'}
                accessibilityRole="header"
              >
                {a.name}
              </Text>
              {touch ? (
                <>
                  <Text variant="callout" color="text-2" align="center">
                    {h.genres}
                  </Text>
                  <Text variant="caption" size={MUSIC.phoneMeta} color="text-3" align="center">
                    {h.counts}
                  </Text>
                </>
              ) : (
                <Text variant="body" color="text-2">
                  {[h.genres, h.counts].filter(Boolean).join(' · ')}
                </Text>
              )}
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
                  <View style={{ minWidth: ACTION_MIN }}>{play}</View>
                  <View style={{ minWidth: ACTION_MIN }}>{shuffle}</View>
                  {theirs}
                </View>
              )}
              {!touch && x.bio ? <ArtistBio text={x.bio} lines={3} /> : null}
            </View>
          </View>
          {touch ? (
            <View
              style={{
                flexDirection: 'row',
                gap: space['3'],
                paddingTop: space['3'],
                paddingHorizontal: gutter,
              }}
            >
              <View style={{ flex: 1 }}>{play}</View>
              <View style={{ flex: 1 }}>{shuffle}</View>
            </View>
          ) : null}
        </BlurredHead>
        {touch && (x.bio || theirs) ? (
          <View style={{ paddingHorizontal: gutter, gap: space['2'], alignItems: 'flex-start' }}>
            {x.bio ? <ArtistBio text={x.bio} lines={4} /> : null}
            {theirs}
          </View>
        ) : null}
        <View
          style={{ width: '100%', maxWidth: web.maxWidth, alignSelf: 'center', gap: space['10'] }}
        >
          <Rows
            x={x}
            widths={
              touch
                ? {
                    album: window.width * PHONE_ROW.album,
                    artist: window.width * PHONE_ROW.artist,
                  }
                : { album: poster, artist: poster }
            }
          />
        </View>
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------- the TV

function TvArtist({ x }: { x: ClientArtistDetail }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const tv = tokens.tv
  const h = useArtistHead(x)
  const a = x.artist
  // Down from the head goes to Play, where focus starts
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((v: ViewHandle | null) => setDown(v), [])
  useHeadDown(down)
  const chrome = useChromeOverlay()
  return (
    <View style={{ flex: 1 }}>
      <TvBlurredArt source={media(x.backdrop)} />
      <TvPage
        keep={ROW_KEEP}
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
      >
        <Kept rest>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: TV_MUSIC.artistGap * u,
              paddingHorizontal: tv.safe.x * u,
              paddingTop: (TV_HEAD_HEIGHT + TV_ROW_GAP) * u,
              paddingBottom: tv.safe.y * u,
            }}
          >
            <PersonPortrait photo={media(a.photo)} />
            <View
              style={{
                maxWidth: TV_MUSIC.artistWords * u,
                gap: tv.poster.gap * u,
                alignItems: 'flex-start',
              }}
            >
              <Text variant="heroTitle" size={TV_MUSIC.artistName} accessibilityRole="header">
                {a.name}
              </Text>
              <Text variant="meta" color="text-2">
                {[h.genres, h.counts].filter(Boolean).join(' · ')}
              </Text>
              <View style={{ flexDirection: 'row', gap: TV_MUSIC.actionsGap * u }}>
                <Button
                  ref={downRef}
                  variant="primary"
                  hasTVPreferredFocus
                  icon={h.playing ? 'pause' : 'play'}
                  onPress={h.play}
                >
                  {h.playing ? t('pause') : t('play')}
                </Button>
                <Button icon="shuffle" onPress={h.shuffle}>
                  {t('shuffle')}
                </Button>
                {h.person ? (
                  <Button icon="movie" onPress={h.person}>
                    {t('theirFilms')}
                  </Button>
                ) : null}
              </View>
              {x.bio ? <ArtistBio text={x.bio} lines={4} /> : null}
            </View>
          </View>
        </Kept>
        <View style={{ gap: tv.poster.gap * u, paddingBottom: tv.safe.y * u }}>
          <Rows
            x={x}
            widths={{ album: tv.poster.width, artist: tv.poster.width }}
            wrap={(key, row) => <Kept key={key}>{row}</Kept>}
          />
        </View>
      </TvPage>
    </View>
  )
}
