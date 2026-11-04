// SPDX-License-Identifier: AGPL-3.0-only
// A playlist (C3; prototype-gaps.md › 3.8; the prototypes' {web,mobile,tv}/playlist.tsx), laid out
// as an album's page: the first cover blurred behind the head, the mosaic of its first four
// covers, Playlist, the name, the count and length, Play (Pause while it plays), Shuffle and ⋯
// (Rename… and Delete playlist…). Then its songs in its order, dragged by their handles to reorder
// them, as Apple Music's and Spotify's playlists are, each with the song's ⋯ and Remove from this
// playlist in it. Deleting asks first, and says the songs stay in the library. Laid out by the
// form factor:
// - touch (mobile/playlist.tsx): Back over the blurred cover, the mosaic centred with the words
//   under it, Play and Shuffle side by side with ⋯ beside them, then the songs;
// - a pointer (web/playlist.tsx): the mosaic beside the words from medium, the actions in a row;
// - the TV (tv/playlist.tsx): the TV only plays a playlist (it's made, renamed and reordered on
//   the web, the desktop app and the phone): the cover blurred and dimmed behind everything, the
//   mosaic and words in a column at the left with Play and Shuffle, and the songs at the right.
// Every Play goes to the client's one music player (../music-player/store.ts).
import type { ClientPlaylistDetail } from '@highsea-tv/api-contract'
import { usePlaylist } from '@highsea-tv/client/data'
import { shownEntries } from '@highsea-tv/client/music'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  Dialog,
  EmptyState,
  Menu,
  ScrollView,
  Sheet,
  SortableList,
  Text,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { Kept, TV_HEAD_HEIGHT, TV_ROW_GAP, TvPage, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OverlayBack } from '../detail/back.tsx'
import { isMissing } from '../detail/parts.tsx'
import { ROW_KEEP } from '../keep.ts'
import { useChromeOverlay, useConfirm, useHeadDown, useSay } from '../kit.tsx'
import { LibraryLoading } from '../library/parts.tsx'
import { useMusicPlayer } from '../music-player/store.ts'
import { musicScreenMessages as messages } from './messages.ts'
import { BlurredHead, MusicMissing, TvBlurredArt } from './page.tsx'
import { PlaylistMosaic, PlaylistNameForm, SongRow, useMusicText } from './parts.tsx'
import { BLACK, MUSIC, TV_MUSIC } from './sizes.ts'

const { space, radius } = tokens

type Entry = ClientPlaylistDetail['songs'][number]

/** The mosaic's side with a pointer (w-64) and its share of the phone's width. */
const MOSAIC = { pointer: space['16'] * 4, touch: 0.62 }
const WORDS_MAX = space['16'] * 11
const ACTION_MIN = space['16'] * 2

export function PlaylistScreen() {
  const raw = useLocalSearchParams<{ id: string }>().id
  const id = Array.isArray(raw) ? raw[0] : raw
  if (!id) return <PlaylistMissing />
  return <Load key={id} id={id} />
}

function Load({ id }: { id: string }) {
  const input = useFormFactor().input
  const edits = usePlaylistEdits(id)
  const found = edits.found
  if (found.status === 'loading') return <LibraryLoading touch={6} pointer={6} tv={6} />
  if (found.status === 'error') return <PlaylistMissing error={found.error} />
  if (input === 'tv') return <TvPlaylist x={found.data} songs={edits.songs} />
  return <PagePlaylist x={found.data} edits={edits} />
}

function PlaylistMissing({ error }: { error?: Error | null }) {
  const t = useT(messages)
  const title = isMissing(error) ? t('playlistMissing') : (error?.message ?? t('playlistMissing'))
  return <MusicMissing title={title} body={t('playlistGone')} icon="queue" />
}

/**
 * The playlist and its edits, each saying what it did (the prototype's usePlaylistEdits): the
 * songs as dragged until the server answers with the newer playlist (`shownEntries`).
 */
function usePlaylistEdits(id: string) {
  const text = useMusicText()
  const say = useSay()
  const p = usePlaylist(id)
  const data = p.playlist.data
  const [moved, setMoved] = useState<{ on: typeof data; songs: Entry[] } | null>(null)
  const songs = shownEntries(data, data?.songs ?? [], moved)
  return {
    found: p.playlist,
    songs,
    rename: async (name: string) => {
      await p.rename(name)
      say({ title: text.playlistEdits.renamed(name) })
    },
    reorder: (next: Entry[]) => {
      setMoved({ on: data, songs: next })
      void p.reorder(next.map((s) => s.entry))
    },
    remove: async (s: Entry) => {
      await p.remove(s.entry)
      say({
        title: text.playlistEdits.removed(s.title),
        body: text.playlistEdits.removedFrom(data?.playlist.name ?? ''),
      })
    },
    delete: async () => {
      await p.delete()
      say({ title: text.playlistEdits.deleted(data?.playlist.name) })
    },
  }
}

type Edits = ReturnType<typeof usePlaylistEdits>

/** Play, Shuffle and each song, through the one player, saying where they play from. */
function usePlayPlaylist(x: ClientPlaylistDetail) {
  const player = useMusicPlayer()
  const path = `/music/playlists/${x.playlist.id}`
  const from = { kind: 'playlist' as const, name: x.playlist.name, to: path }
  const here = player.from?.to === path
  const play = (start = 0, shuffle = false) =>
    void player.play({ playlist: x.playlist.id }, { start, shuffle, from })
  return {
    whole: here && player.playing,
    playing: player.playing,
    at: (i: number) => here && player.index === i,
    play: () => (here ? player.toggle() : play()),
    shuffle: () => play(0, true),
    song: (i: number) => (here && player.index === i ? player.toggle() : play(i)),
  }
}

// ---------------------------------------------------------------- touch and a pointer

function PagePlaylist({ x, edits }: { x: ClientPlaylistDetail; edits: Edits }) {
  const t = useT(messages)
  const text = useMusicText()
  const theme = useTheme()
  const media = useMedia()
  const insets = useSafeAreaInsets()
  const gutter = usePageGutter()
  const window = useWindowDimensions()
  const { input, widthClass } = useFormFactor()
  const touch = input === 'touch'
  const side = !touch && widthClass !== 'compact'
  const chrome = useChromeOverlay(side)
  const confirm = useConfirm()
  const p = x.playlist
  const songs = edits.songs
  const play = usePlayPlaylist(x)
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const anchor = useRef<ViewHandle>(null)
  const empty = songs.length === 0
  const mosaic = touch
    ? (window.width - 2 * gutter) * MOSAIC.touch
    : side
      ? MOSAIC.pointer
      : Math.min(MOSAIC.pointer, window.width * 0.7)
  const askDelete = () =>
    confirm.ask({
      title: t('deleteTitle', { name: p.name }),
      body: t('deleteBody'),
      cancel: t('cancel'),
      action: t('deleteAction'),
      icon: 'delete',
      run: async () => {
        await edits.delete()
        router.replace((touch ? '/library?view=music&music=playlists' : '/music/playlists') as Href)
      },
    })
  const playButton = (
    <Button
      variant="primary"
      icon={play.whole ? 'pause' : 'play'}
      block
      disabled={empty}
      onPress={play.play}
    >
      {play.whole ? t('pause') : t('play')}
    </Button>
  )
  const shuffleButton = (
    <Button icon="shuffle" block disabled={empty} onPress={play.shuffle}>
      {t('shuffle')}
    </Button>
  )
  const more = (
    <Button
      ref={anchor}
      variant={touch ? 'ghost' : undefined}
      iconOnly
      icon="more"
      hasPopup="menu"
      accessibilityLabel={t('more', { name: p.name })}
      onPress={() => setMenu(true)}
    />
  )
  const form = renaming ? (
    <PlaylistNameForm
      initial={p.name}
      submit={t('renameSubmit')}
      onCancel={() => setRenaming(false)}
      onDone={(name) => {
        setRenaming(false)
        void edits.rename(name)
      }}
    />
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
        <BlurredHead source={p.covers[0] ? media(p.covers[0]) : null}>
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
            <View
              style={{
                marginBottom: touch ? space['3'] : 0,
                boxShadow: `0px ${space['2']}px ${space['8']}px ${alpha(BLACK, 0.35)}`,
                borderRadius: radius.poster,
              }}
            >
              <PlaylistMosaic covers={p.covers} size={mosaic} radius={radius.poster} />
            </View>
            <View
              style={{
                gap: touch ? space['1'] + space['0.5'] : space['3'],
                maxWidth: WORDS_MAX,
                flexShrink: 1,
                alignItems: touch ? 'center' : 'flex-start',
              }}
            >
              <Text variant="label" mono color="text-3" style={{ textTransform: 'uppercase' }}>
                {t('playlist')}
              </Text>
              <Text
                variant={touch ? 'title' : 'display'}
                size={touch ? space['6'] : undefined}
                align={touch ? 'center' : 'left'}
                accessibilityRole="header"
              >
                {p.name}
              </Text>
              <Text
                variant={touch ? 'caption' : 'body'}
                size={touch ? MUSIC.phoneMeta : undefined}
                color={touch ? 'text-3' : 'text-2'}
              >
                {text.playlistSummary(p.songs, p.duration)}
              </Text>
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
                  {more}
                </View>
              )}
            </View>
          </View>
          {touch ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space['3'],
                paddingTop: space['3'],
                paddingHorizontal: gutter,
              }}
            >
              <View style={{ flex: 1 }}>{playButton}</View>
              <View style={{ flex: 1 }}>{shuffleButton}</View>
              {more}
            </View>
          ) : null}
        </BlurredHead>
        <View
          style={{
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
            paddingHorizontal: gutter,
          }}
        >
          {empty ? (
            <EmptyState
              icon="music"
              title={t('playlistEmptyTitle')}
              action={
                <Button
                  onPress={() =>
                    router.push(
                      (touch ? '/library?view=music&music=songs' : '/music/songs') as Href,
                    )
                  }
                >
                  {t('songs')}
                </Button>
              }
            >
              {t('playlistEmptyBody')}
            </EmptyState>
          ) : (
            <View
              style={{
                borderTopWidth: touch ? 0 : StyleSheet.hairlineWidth,
                borderColor: theme.colors.line,
              }}
            >
              <SortableList
                look="line"
                accessibilityLabel={p.name}
                items={songs}
                id={(s) => s.entry}
                label={(s) => s.title}
                onChange={edits.reorder}
                messages={{
                  move: (title) => t('moveSong', { title }),
                  moveUp: (title) => t('moveUp', { title }),
                  moveDown: (title) => t('moveDown', { title }),
                  moved: (title, index, count) => t('moved', { title, index, count }),
                }}
              >
                {(s, handle) => {
                  const i = songs.indexOf(s)
                  return (
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <SongRow
                        song={s}
                        album={s.album}
                        showAlbum
                        on="playlist"
                        handle={handle}
                        here={play.at(i)}
                        playing={play.playing}
                        onPlay={() => play.song(i)}
                        onRemove={() => void edits.remove(s)}
                      />
                    </View>
                  )
                }}
              </SortableList>
            </View>
          )}
        </View>
      </ScrollView>
      <Menu
        title={p.name}
        open={menu}
        anchor={anchor}
        onClose={() => setMenu(false)}
        items={[
          { label: t('rename'), icon: 'edit', onSelect: () => setRenaming(true) },
          { label: t('deletePlaylist'), icon: 'delete', onSelect: askDelete },
        ]}
      />
      {touch ? (
        <Sheet open={renaming} onClose={() => setRenaming(false)} title={t('renamePlaylist')}>
          {form ?? <View />}
        </Sheet>
      ) : (
        <Dialog
          open={renaming}
          onClose={() => setRenaming(false)}
          title={t('renamePlaylist')}
          size="sm"
        >
          {form}
        </Dialog>
      )}
      {confirm.prompt}
    </View>
  )
}

// ---------------------------------------------------------------- the TV

function TvPlaylist({ x, songs }: { x: ClientPlaylistDetail; songs: Entry[] }) {
  const t = useT(messages)
  const text = useMusicText()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const tv = tokens.tv
  const p = x.playlist
  const play = usePlayPlaylist(x)
  const empty = songs.length === 0
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((v: ViewHandle | null) => setDown(v), [])
  useHeadDown(down)
  const chrome = useChromeOverlay()
  const half = ((TV_MUSIC.cover - TV_MUSIC.actionsGap) * u) / 2
  return (
    <View style={{ flex: 1 }}>
      <TvBlurredArt source={p.covers[0] ? media(p.covers[0]) : null} />
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
          <View style={{ marginBottom: TV_MUSIC.coverBelow * u }}>
            <PlaylistMosaic
              covers={p.covers}
              size={TV_MUSIC.cover * u}
              radius={tv.radius.poster * u}
            />
          </View>
          <Text variant="pill" mono color="text-3">
            {t('playlist').toUpperCase()}
          </Text>
          <Text variant="heroTitle" size={TV_MUSIC.title} accessibilityRole="header">
            {p.name}
          </Text>
          <Text variant="pill" color="text-2">
            {text.playlistSummary(p.songs, p.duration)}
          </Text>
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
                disabled={empty}
                icon={play.whole ? 'pause' : 'play'}
                onPress={play.play}
              >
                {play.whole ? t('pause') : t('play')}
              </Button>
            </View>
            <View style={{ width: half }}>
              <Button block icon="shuffle" disabled={empty} onPress={play.shuffle}>
                {t('shuffle')}
              </Button>
            </View>
          </View>
        </View>
        <View style={{ flex: 1, marginStart: -TV_MUSIC.songsInset * u }}>
          {empty ? (
            <View style={{ paddingTop: TV_MUSIC.songsInset * u, paddingEnd: tv.safe.x * u }}>
              <Text variant="synopsis" color="text-2">
                {t('playlistEmptyBody')}
              </Text>
            </View>
          ) : (
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
                  <Kept key={s.entry}>
                    <SongRow
                      song={s}
                      album={s.album}
                      showAlbum
                      on="playlist"
                      here={play.at(i)}
                      playing={play.playing}
                      onPlay={() => play.song(i)}
                    />
                  </Kept>
                ))}
              </View>
            </TvPage>
          )}
        </View>
      </View>
    </View>
  )
}
