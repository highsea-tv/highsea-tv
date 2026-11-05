// SPDX-License-Identifier: AGPL-3.0-only
// Search's music kinds (client-search.md; the prototypes' web/search.tsx and tv/search.tsx), which
// only a server that serves music sends: artists as their round photo and albums as their square
// cover, each opening its page, and songs, each playing its album from it as a song's row on the
// album's page does, said to play from the search. With a pointer artists and albums are the
// results' grid and songs a list of the cover, the title, "artist · album" and the length; by touch
// artists and albums scroll sideways as the other kinds' rows do; on the TV they're the results'
// grid, five a row, and songs are buttons with their cover before the title and the artist.
// ../app/(in)/search.tsx draws them in their sections' place among the films'.
import type { ClientAlbum, ClientArtist, SearchSong } from '@highsea-tv/api-contract'
import { songTime } from '@highsea-tv/client/music'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import {
  Button,
  Poster,
  Press,
  ScrollView,
  Text,
  tokens,
  useControl,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui'
import { TvGrid, type ViewHandle } from '@highsea-tv/ui/tv'
import { router, useLocalSearchParams } from 'expo-router'
import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import { LibraryGrid } from '../library/parts.tsx'
import { Cover } from '../music-player/parts.tsx'
import { useMusicPlayer } from '../music-player/store.ts'
import { ArtistTile } from './library.tsx'
import { musicScreenMessages as messages } from './messages.ts'
import { albumPath } from './parts.tsx'

const { space, radius } = tokens

/** A song list's widest with a pointer (max-w-[48rem]) and its cover (size-11). */
const SONGS_MAX = space['16'] * 12
const SONG_COVER = space['10'] + space['1']

export type MusicSection =
  | { kind: 'artists'; items: ClientArtist[] }
  | { kind: 'albums'; items: ClientAlbum[] }
  | { kind: 'songs'; items: SearchSong[] }

/** A song found: its album plays from it, said to come from the search. */
function usePlayFound() {
  const player = useMusicPlayer()
  const raw = useLocalSearchParams<{ q?: string | string[] }>().q
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? ''
  return {
    current: player.song?.id ?? null,
    play: (x: SearchSong) =>
      void player.play(
        { album: x.album.id },
        { start: x.number - 1, from: { kind: 'search', name: q, to: null } },
      ),
  }
}

function useSongLabel() {
  const t = useT(messages)
  return (x: SearchSong) =>
    t('playSong', { title: x.title, artist: x.album.artist.name, time: songTime(x.duration) })
}

/** By touch and with a pointer. */
export function MusicResults({
  section,
  touch,
  gutter,
}: {
  section: MusicSection
  touch: boolean
  gutter: number
}) {
  const media = useMedia()
  const rowWidth = usePosterWidth()
  switch (section.kind) {
    case 'artists': {
      if (touch)
        return (
          <Sideways gutter={gutter}>
            {section.items.map((a) => (
              <ArtistTile key={a.id} artist={a} width={rowWidth} />
            ))}
          </Sideways>
        )
      return (
        <LibraryGrid
          items={section.items}
          keyOf={(a) => a.id}
          render={(a, width) => <ArtistTile artist={a} width={width} />}
        />
      )
    }
    case 'albums': {
      const cover = (a: (typeof section.items)[number], width: number) => (
        <Poster
          key={a.id}
          aspect="square"
          title={a.title}
          src={media(a.cover)}
          width={width}
          showTitle
          caption={a.artist.name}
          onPress={() => router.push(albumPath(a.id))}
        />
      )
      if (touch)
        return <Sideways gutter={gutter}>{section.items.map((a) => cover(a, rowWidth))}</Sideways>
      return <LibraryGrid items={section.items} keyOf={(a) => a.id} render={cover} />
    }
    case 'songs':
      return <Songs songs={section.items} gutter={touch ? gutter : 0} />
  }
}

function Sideways({ gutter, children }: { gutter: number; children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: gutter, gap: tokens.mobile.posterGap }}
    >
      {children}
    </ScrollView>
  )
}

/** Songs: the cover, the title (in the accent while it plays), "artist · album", the length. */
function Songs({ songs, gutter }: { songs: SearchSong[]; gutter: number }) {
  const theme = useTheme()
  const found = usePlayFound()
  const label = useSongLabel()
  return (
    <View style={{ maxWidth: SONGS_MAX, gap: space['1'], paddingHorizontal: gutter }}>
      {songs.map((x) => (
        <Press
          key={x.id}
          accessibilityRole="button"
          accessibilityLabel={label(x)}
          onPress={() => found.play(x)}
          style={({ hovered }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['3'],
            padding: space['1'] + space['0.5'],
            borderRadius: radius.md,
            backgroundColor: hovered ? theme.colors.s1 : undefined,
          })}
        >
          <Cover uri={x.album.cover} size={SONG_COVER} radius={radius.sm} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              variant="body"
              color={found.current === x.id ? 'accent-text' : 'text'}
              numberOfLines={1}
            >
              {x.title}
            </Text>
            <Text variant="caption" color="text-3" numberOfLines={1}>
              {`${x.album.artist.name} · ${x.album.title}`}
            </Text>
          </View>
          <Text variant="caption" color="text-3" style={{ fontVariant: ['tabular-nums'] }}>
            {songTime(x.duration)}
          </Text>
        </Press>
      ))}
    </View>
  )
}

/** On the TV: the results' grid, five a row, and songs as buttons. */
export function TvMusicResults({
  section,
  span,
  first,
  arrive,
}: {
  section: MusicSection
  span: number
  first?: Ref<ViewHandle>
  arrive: boolean
}) {
  const media = useMedia()
  const m = useControl()
  const found = usePlayFound()
  const label = useSongLabel()
  switch (section.kind) {
    case 'artists':
      return (
        <TvGrid
          items={section.items}
          keyOf={(a) => a.id}
          columns={5}
          span={span}
          render={(a, at) => (
            <ArtistTile
              artist={a}
              width={at.width}
              ref={at.index === 0 ? (first as (v: ViewHandle | null) => void) : undefined}
              preferred={arrive && at.index === 0}
            />
          )}
        />
      )
    case 'albums':
      return (
        <TvGrid
          items={section.items}
          keyOf={(a) => a.id}
          columns={5}
          span={span}
          render={(a, at) => (
            <Poster
              ref={at.index === 0 ? first : undefined}
              preferred={arrive && at.index === 0}
              aspect="square"
              title={a.title}
              caption={a.artist.name}
              src={media(a.cover)}
              width={at.width}
              showTitle
              onPress={() => router.push(albumPath(a.id))}
            />
          )}
        />
      )
    case 'songs':
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: m.gap }}>
          {section.items.map((x, i) => (
            <Button
              key={x.id}
              ref={i === 0 ? first : undefined}
              hasTVPreferredFocus={arrive && i === 0}
              accessibilityLabel={label(x)}
              onPress={() => found.play(x)}
            >
              {`${x.title} · ${x.album.artist.name}`}
            </Button>
          ))}
        </View>
      )
  }
}
