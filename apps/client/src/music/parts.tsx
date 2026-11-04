// SPDX-License-Identifier: AGPL-3.0-only
// What Music's pages share at every form factor (one-client-platform-b.md › B3), moved from the
// prototype's {web,mobile,tv}/music-lists.tsx, song-menu.tsx, client/song-menu.ts and
// client/playlist-picker.tsx:
// - a song's row, one part with a form per form factor: with a pointer the cover (the play mark
//   over it while the pointer's on the row, the playing mark while it's the song playing), the
//   title and artist, the album from a regular width, the length and ⋯ (web/music-lists.tsx's
//   SongButton); by touch a 48 cover, the title, "artist · album" and ⋯, with a long press for the
//   menu too (mobile/music-lists.tsx's MobileSongRow); on the TV one focus stop, filled with the
//   text's colour while it's focused, whose OK plays and OK held opens the menu (tv/music-lists.tsx's
//   TvSongRow). An album's page numbers its songs instead of drawing their covers;
// - the song's menu, the library's Menu (a popover from ⋯ with a pointer, a sheet by touch, TvMenu
//   on the TV): Play next, Add to queue, Add to playlist (not on the TV, which leaves playlists to
//   the other apps), Go to the album and Go to the artist where the page isn't that already, and on
//   a playlist's page Remove from this playlist, as Apple Music's has them;
// - Add to playlist's picker in a Dialog with a pointer and a Sheet by touch: New playlist first,
//   which asks for the name in place, then the person's playlists with their mosaic and count;
// - New playlist, which asks for a name, makes it and opens it.
// Every Play, Play next and Add to queue goes to the client's one music player
// (../music-player/store.ts); nothing here draws the player.
import type { ClientAlbum, ClientPlaylist, ClientSong } from '@highsea-tv/api-contract'
import { useMusicQueue, usePlaylists } from '@highsea-tv/client/data'
import { createMusicText, songMenuPaths, songTime } from '@highsea-tv/client/music'
import type { PlayingFrom } from '@highsea-tv/client/music-player'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import {
  Button,
  Dialog,
  Field,
  Icon,
  Input,
  Menu,
  type MenuOption,
  PlayingBars,
  Press,
  Sheet,
  Text,
  tokens,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { alpha, Focusable, type ViewHandle } from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { type Href, router } from 'expo-router'
import { type ReactNode, type Ref, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useBack } from '../back.tsx'
import { useSay } from '../kit.tsx'
import { Cover } from '../music-player/parts.tsx'
import { musicPlayer } from '../music-player/store.ts'
import { musicScreenMessages as messages } from './messages.ts'
import { BLACK, MUSIC, TV_MUSIC } from './sizes.ts'

const { space } = tokens

/** Music's words from @highsea-tv/client/music, in the app's language. */
export function useMusicText() {
  const locale = useLocale()
  return useMemo(() => createMusicText(locale), [locale])
}

export const albumPath = (id: string) => `/music/albums/${id}` as Href
export const artistPath = (id: string) => `/music/artists/${id}` as Href
export const playlistPath = (id: string) => `/music/playlists/${id}` as Href

/** Songs, as Music's Songs plays them: what the player says it's playing from. */
export const FROM_SONGS: PlayingFrom = { kind: 'songs', name: 'Songs', to: '/music/songs' }

// ---------------------------------------------------------------- a playlist's mosaic

/**
 * A playlist's first four covers two by two, or its one cover, or the music icon while it's
 * empty (client/playlist-picker.tsx's PlaylistMosaic). `size` undefined fills its parent's width.
 */
export function PlaylistMosaic({
  covers,
  size,
  radius = MUSIC.coverRadius,
}: {
  covers: readonly string[]
  size?: number
  radius?: number
}) {
  const theme = useTheme()
  const media = useMedia()
  const four = covers.length >= 4
  const shown = covers.slice(0, four ? 4 : 1)
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size ?? '100%',
        aspectRatio: 1,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {shown.length === 0 ? (
        <Icon name="music" size={tokens.icon.size.md} color="text-3" />
      ) : (
        shown.map((c) => (
          <Image
            key={c}
            source={media(c)}
            accessibilityIgnoresInvertColors
            style={{ width: four ? '50%' : '100%', height: four ? '50%' : '100%' }}
            contentFit="cover"
          />
        ))
      )}
    </View>
  )
}

// ---------------------------------------------------------------- the song menu

/** What a song's menu or an album's acts on: the songs by id, their name, and the album. */
export type SongMenuTarget = {
  songs: string[]
  /** "Gymnopédie No. 1", or the album's title. */
  name: string
  album: Pick<ClientAlbum, 'id' | 'title' | 'artist'>
}

/** Where the menu is: the page it's on isn't offered as a place to go. */
export type SongMenuOn = 'album' | 'artist' | 'playlist'

/**
 * A song's menu's actions (client/song-menu.ts): Play next and Add to queue line the songs up
 * after the one playing or at the end (and play them when nothing is), with what they say once
 * done; Add to playlist and a new playlist with them in it.
 */
export function useSongMenu({ songs, name, album }: SongMenuTarget) {
  const words = useMusicText().songMenu
  const say = useSay()
  const { tracks } = useMusicQueue()
  const lists = usePlaylists()
  const from: PlayingFrom = { kind: 'songs', name: album.title, to: `/music/albums/${album.id}` }
  return {
    playNext: async () => {
      musicPlayer.playNext(await tracks(songs), from)
      say({ title: words.playsNext(name) })
    },
    addToQueue: async () => {
      musicPlayer.add(await tracks(songs), from)
      say({ title: words.addedToQueue(name) })
    },
    ...songMenuPaths(album),
    addToPlaylist: async (p: Pick<ClientPlaylist, 'id' | 'name'>) => {
      await lists.add(p.id, songs)
      say({ title: words.addedTo(p.name), body: name })
    },
    newPlaylist: async (title: string) => {
      const p = await lists.create(title, songs)
      say({ title: words.made(p.name), body: words.madeWith(name) })
      return p
    },
  }
}

/**
 * ⋯ for a song or an album and its menu. `round` draws it as the header's buttons are (an album's,
 * beside Play and Shuffle) rather than a row's quiet icon.
 */
export function SongMore({
  target,
  on,
  round = false,
  onRemove,
}: {
  target: SongMenuTarget
  on?: SongMenuOn
  round?: boolean
  onRemove?: () => void
}) {
  const t = useT(messages)
  const anchor = useRef<ViewHandle>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* a View, so a row's centring holds: the Button keeps itself at its start (alignSelf) */}
      <View>
        <Button
          ref={anchor}
          variant={round ? 'secondary' : 'ghost'}
          iconOnly
          icon="more"
          hasPopup="menu"
          accessibilityLabel={t('more', { name: target.name })}
          onPress={() => setOpen(true)}
        />
      </View>
      <SongMenu
        target={target}
        on={on}
        open={open}
        onClose={() => setOpen(false)}
        onRemove={onRemove}
        anchor={anchor}
      />
    </>
  )
}

/** A song's or an album's menu, opened from ⋯, a long press or OK held. */
export function SongMenu({
  target,
  on,
  open,
  onClose,
  onRemove,
  anchor,
}: {
  target: SongMenuTarget
  on?: SongMenuOn
  open: boolean
  onClose: () => void
  onRemove?: () => void
  anchor?: { current: ViewHandle | null }
}) {
  const t = useT(messages)
  const input = useFormFactor().input
  const menu = useSongMenu(target)
  const [picking, setPicking] = useState(false)
  const go = (path: string) => router.push(path as Href)
  const items: MenuOption[] = [
    { label: t('playNext'), icon: 'next', onSelect: () => void menu.playNext() },
    { label: t('addToQueue'), icon: 'queue', onSelect: () => void menu.addToQueue() },
    // the TV leaves playlists to the other apps (tv/song-menu.tsx)
    ...(input === 'tv'
      ? []
      : [
          {
            label: t(input === 'pointer' ? 'addToPlaylistMore' : 'addToPlaylist'),
            icon: 'add' as const,
            onSelect: () => setPicking(true),
          },
        ]),
    ...(on === 'album'
      ? []
      : [
          {
            label: t('goToAlbum'),
            icon: 'music' as const,
            closes: 'leave' as const,
            onSelect: () => go(menu.album),
          },
        ]),
    ...(on === 'artist'
      ? []
      : [
          {
            label: t('goToArtist'),
            icon: 'user' as const,
            closes: 'leave' as const,
            onSelect: () => go(menu.artist),
          },
        ]),
    ...(onRemove
      ? [
          {
            label: t('removeFromPlaylist'),
            icon: 'remove' as const,
            closes: 'gone' as const,
            onSelect: onRemove,
          },
        ]
      : []),
  ]
  return (
    <>
      {input === 'tv' && open ? (
        <TvSongMenu
          title={target.name}
          detail={target.album.artist.name}
          items={items}
          onClose={onClose}
        />
      ) : input === 'tv' ? null : (
        <Menu
          open={open}
          title={target.name}
          detail={target.album.artist.name}
          items={items}
          onClose={onClose}
          anchor={anchor}
        />
      )}
      {input === 'tv' ? null : (
        <AddToPlaylist
          name={target.name}
          open={picking}
          onClose={() => setPicking(false)}
          onPick={(p) => {
            setPicking(false)
            void menu.addToPlaylist(p)
          }}
          onNew={(name) => {
            setPicking(false)
            void menu.newPlaylist(name)
          }}
        />
      )}
    </>
  )
}

/** The TV's menu over the page, which the remote's Back closes (tv/song-menu.tsx). */
function TvSongMenu({
  title,
  detail,
  items,
  onClose,
}: {
  title: string
  detail: string
  items: MenuOption[]
  onClose: () => void
}) {
  useBack(() => {
    onClose()
    return true
  })
  return <Menu open title={title} detail={detail} items={items} onClose={onClose} />
}

// ---------------------------------------------------------------- Add to playlist

/** Add to playlist: the picker in a Dialog with a pointer, in a Sheet by touch. */
function AddToPlaylist({
  name,
  open,
  onClose,
  onPick,
  onNew,
}: {
  name: string
  open: boolean
  onClose: () => void
  onPick: (p: ClientPlaylist) => void
  onNew: (name: string) => void
}) {
  const t = useT(messages)
  const pointer = useFormFactor().input === 'pointer'
  const body = (
    <View style={{ gap: space['3'] }}>
      <Text variant="caption" color="text-3" numberOfLines={1}>
        {name}
      </Text>
      {open ? <PlaylistPicker onPick={onPick} onNew={onNew} /> : null}
    </View>
  )
  return pointer ? (
    <Dialog open={open} onClose={onClose} title={t('addToPlaylist')} size="sm" closable>
      {body}
    </Dialog>
  ) : (
    <Sheet open={open} onClose={onClose} title={t('addToPlaylist')}>
      {body}
    </Sheet>
  )
}

/** A form for a playlist's name: New playlist, and Rename. */
export function PlaylistNameForm({
  initial = '',
  submit,
  onDone,
  onCancel,
}: {
  initial?: string
  submit: string
  onDone: (name: string) => void
  onCancel?: () => void
}) {
  const t = useT(messages)
  const [name, setName] = useState(initial)
  const done = () => {
    if (name.trim()) onDone(name.trim())
  }
  return (
    <View style={{ gap: space['3'] }}>
      <Field label={t('name')}>
        <Input
          value={name}
          onChangeText={setName}
          maxLength={100}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={done}
        />
      </Field>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: space['2'],
        }}
      >
        {onCancel ? (
          <Button variant="ghost" onPress={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
        <Button variant="primary" disabled={!name.trim()} onPress={done}>
          {submit}
        </Button>
      </View>
    </View>
  )
}

/** New playlist first, which asks for the name in place, then the person's playlists. */
function PlaylistPicker({
  onPick,
  onNew,
}: {
  onPick: (p: ClientPlaylist) => void
  onNew: (name: string) => void
}) {
  const t = useT(messages)
  const text = useMusicText()
  const touch = useFormFactor().input === 'touch'
  const lists = usePlaylists().list
  const [naming, setNaming] = useState(false)
  // the phone's 44 art in 56 rows, a pointer's 40 in 48 (client/playlist-picker.tsx)
  const art = touch ? space['10'] + space['1'] : space['10']
  const height = touch ? space['12'] + space['2'] : space['12']
  if (naming)
    return (
      <PlaylistNameForm
        submit={t('makePlaylist')}
        onDone={onNew}
        onCancel={() => setNaming(false)}
      />
    )
  return (
    <View role="list" style={{ gap: space['0.5'], marginHorizontal: -space['3'] }}>
      <PickerRow height={height} onPress={() => setNaming(true)} label={t('newPlaylist')}>
        <View
          style={{
            width: art,
            height: art,
            borderRadius: MUSIC.coverRadius,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AddTile size={art} />
        </View>
        <Text variant="body" weight={600}>
          {t('newPlaylist')}
        </Text>
      </PickerRow>
      {(lists.data ?? []).map((p) => (
        <PickerRow
          key={p.id}
          height={height}
          onPress={() => onPick(p)}
          label={`${p.name}, ${text.songsCount(p.songs)}`}
        >
          <PlaylistMosaic covers={p.covers} size={art} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="body" weight={600} numberOfLines={1}>
              {p.name}
            </Text>
            <Text variant="caption" color="text-3">
              {text.songsCount(p.songs)}
            </Text>
          </View>
        </PickerRow>
      ))}
    </View>
  )
}

function PickerRow({
  height,
  label,
  onPress,
  children,
}: {
  height: number
  label: string
  onPress: () => void
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <View role="listitem">
      <Press
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ hovered, pressed }) => ({
          minHeight: height,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['3'],
          paddingHorizontal: space['3'],
          borderRadius: tokens.radius.md,
          backgroundColor: hovered || pressed ? alpha(theme.colors.text, 0.06) : undefined,
        })}
      >
        {children}
      </Press>
    </View>
  )
}

/** New playlist's tile: the add icon on s2. */
function AddTile({ size, accent = false }: { size: number; accent?: boolean }) {
  const theme = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: MUSIC.coverRadius,
        backgroundColor: theme.colors.s2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="add" size={tokens.icon.size.md} color={accent ? 'accent-text' : 'text'} />
    </View>
  )
}

// ---------------------------------------------------------------- New playlist

/**
 * New playlist: asks for a name (a Dialog with a pointer, a Sheet by touch), makes it and opens
 * it. `ask` opens it; `prompt` is drawn where the screen puts it, as kit's useConfirm.
 */
export function useNewPlaylist() {
  const t = useT(messages)
  const pointer = useFormFactor().input === 'pointer'
  const { create } = usePlaylists()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const form = open ? (
    <PlaylistNameForm
      submit={t('makePlaylist')}
      onCancel={close}
      onDone={async (name) => {
        const p = await create(name, [])
        close()
        router.push(playlistPath(p.id))
      }}
    />
  ) : null
  const prompt = pointer ? (
    <Dialog open={open} onClose={close} title={t('newPlaylist')} size="sm">
      {form}
    </Dialog>
  ) : (
    <Sheet open={open} onClose={close} title={t('newPlaylist')}>
      {form ?? <View />}
    </Sheet>
  )
  return { ask: () => setOpen(true), prompt }
}

/** The web's New playlist button (web/music-lists.tsx), primary in Playlists' empty view. */
export function NewPlaylistButton({ primary = false }: { primary?: boolean }) {
  const t = useT(messages)
  const n = useNewPlaylist()
  return (
    <>
      <Button icon="add" variant={primary ? 'primary' : 'secondary'} onPress={n.ask}>
        {t('newPlaylist')}
      </Button>
      {n.prompt}
    </>
  )
}

/** The phone's New playlist row, first in Playlists (mobile/music-lists.tsx): an accent add tile. */
export function NewPlaylistRow({ onPress }: { onPress: () => void }) {
  const t = useT(messages)
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('newPlaylist')}
      style={{
        minHeight: space['16'],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['3'],
        paddingVertical: space['1'],
        borderRadius: tokens.radius.sm,
      }}
    >
      <AddTile size={space['12'] + space['2']} accent />
      <Text variant="callout" weight={600} color="accent-text">
        {t('newPlaylist')}
      </Text>
    </Press>
  )
}

// ---------------------------------------------------------------- a song's row

export type SongRowProps = {
  song: ClientSong
  album: ClientAlbum
  /** Is it the song playing (or paused)? */
  here: boolean
  /** Is the player playing? */
  playing: boolean
  onPlay: () => void
  /** An album's page: the song's number in the cover's place, and no album or artist under it. */
  numbered?: boolean
  /** Songs and a playlist: the album beside the artist. */
  showAlbum?: boolean
  on?: SongMenuOn
  onRemove?: () => void
  /** A playlist's page: the handle that reorders it, first. */
  handle?: ReactNode
  /** The TV: it takes focus when the screen appears. */
  preferred?: boolean
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}

/** A song's row, as each form factor draws it. */
export function SongRow(props: SongRowProps) {
  const input = useFormFactor().input
  if (input === 'tv') return <TvSongRow {...props} />
  if (input === 'touch') return <TouchSongRow {...props} />
  return <PointerSongRow {...props} />
}

/** What a song's row is read as: Pause while it's playing, else Play with the artist and length. */
function useSongLabel({ song, album, here, playing }: SongRowProps) {
  const t = useT(messages)
  return here && playing
    ? t('pauseSong', { title: song.title })
    : t('playSong', { title: song.title, artist: album.artist.name, time: songTime(song.duration) })
}

const targetOf = (p: SongRowProps): SongMenuTarget => ({
  songs: [p.song.id],
  name: p.song.title,
  album: p.album,
})

function PointerSongRow(p: SongRowProps) {
  const theme = useTheme()
  const regular = useFormFactor().widthClass !== 'compact'
  const label = useSongLabel(p)
  const lead = space['10']
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['1'],
        paddingEnd: space['1'],
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.line,
      }}
    >
      {p.handle}
      <Press
        ref={p.ref}
        onPress={p.onPlay}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: p.here }}
        style={({ hovered }) => ({
          flex: 1,
          minWidth: 0,
          minHeight: p.numbered ? space['12'] : space['12'] + space['2'],
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['3'],
          paddingHorizontal: space['2'],
          borderRadius: tokens.radius.sm,
          backgroundColor: hovered ? theme.colors.s1 : undefined,
        })}
      >
        {({ hovered }) => (
          <>
            <View
              style={{
                width: lead,
                height: p.numbered ? undefined : lead,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {p.numbered ? null : (
                <Cover uri={p.album.cover} size={lead} radius={MUSIC.coverRadius} />
              )}
              <PlayMark
                here={p.here}
                playing={p.playing}
                hovered={hovered}
                over={!p.numbered}
                number={p.numbered ? p.song.number : undefined}
              />
            </View>
            <View style={{ flex: 3, minWidth: 0 }}>
              <Text variant="body" color={p.here ? 'accent-text' : 'text'} numberOfLines={1}>
                {p.song.title}
              </Text>
              {p.numbered ? null : (
                <Text variant="caption" color="text-3" numberOfLines={1}>
                  {p.album.artist.name}
                </Text>
              )}
            </View>
            {p.showAlbum && regular ? (
              <View style={{ flex: 2, minWidth: 0 }}>
                <Text variant="caption" color="text-2" numberOfLines={1}>
                  {p.album.title}
                </Text>
              </View>
            ) : null}
            <Text variant="caption" color="text-3" style={{ fontVariant: ['tabular-nums'] }}>
              {songTime(p.song.duration)}
            </Text>
          </>
        )}
      </Press>
      <SongMore target={targetOf(p)} on={p.on} onRemove={p.onRemove} />
    </View>
  )
}

/**
 * Where a row's cover or number is: the playing mark while it's the song playing, the play or
 * pause icon while the pointer's on it, else the number (an album's) or nothing over the cover.
 */
function PlayMark({
  here,
  playing,
  hovered,
  over,
  number,
}: {
  here: boolean
  playing: boolean
  hovered: boolean
  /** Over a cover, on its dimmed shade. */
  over: boolean
  number?: number
}) {
  const shown = here || hovered
  if (!shown)
    return number === undefined ? null : (
      <Text variant="caption" color="text-3" style={{ fontVariant: ['tabular-nums'] }}>
        {String(number)}
      </Text>
    )
  return (
    <View
      style={[
        { alignItems: 'center', justifyContent: 'center' },
        over
          ? {
              position: 'absolute',
              inset: 0,
              borderRadius: MUSIC.coverRadius,
              backgroundColor: alpha(BLACK, 0.5),
            }
          : null,
      ]}
    >
      {here && !hovered ? (
        <PlayingBars playing={playing} color="accent-text" />
      ) : (
        <Icon
          name={here && playing ? 'pause' : 'play'}
          size={tokens.icon.size.sm}
          color={over ? 'accent-text' : 'text'}
        />
      )}
    </View>
  )
}

function TouchSongRow(p: SongRowProps) {
  const t = useT(messages)
  const label = useSongLabel(p)
  const [menu, setMenu] = useState(false)
  // a number's column is 1.75rem (mobile/album.tsx), a cover 3rem
  const cover = p.numbered ? space['6'] + space['1'] : space['12']
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] }}>
      {p.handle}
      <Press
        ref={p.ref}
        onPress={p.onPlay}
        onLongPress={() => setMenu(true)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: p.here }}
        accessibilityActions={[{ name: 'longpress', label: t('more', { name: p.song.title }) }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'longpress') setMenu(true)
        }}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: p.numbered ? space['12'] : space['12'] + space['2'],
          flexDirection: 'row',
          alignItems: 'center',
          gap: p.numbered ? space['2'] : space['3'],
          paddingVertical: space['1'],
          borderRadius: tokens.radius.sm,
        }}
      >
        <View
          style={{
            width: cover,
            height: p.numbered ? undefined : cover,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {p.numbered ? null : (
            <Cover uri={p.album.cover} size={cover} radius={MUSIC.coverRadius} />
          )}
          <PlayMark
            here={p.here}
            playing={p.playing}
            hovered={false}
            over={!p.numbered}
            number={p.numbered ? p.song.number : undefined}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="callout" color={p.here ? 'accent-text' : 'text'} numberOfLines={1}>
            {p.song.title}
          </Text>
          {p.numbered ? null : (
            <Text variant="caption" color="text-3" numberOfLines={1}>
              {p.showAlbum === false
                ? p.album.artist.name
                : `${p.album.artist.name} · ${p.album.title}`}
            </Text>
          )}
        </View>
        {p.numbered ? (
          <Text variant="caption" color="text-3" style={{ fontVariant: ['tabular-nums'] }}>
            {songTime(p.song.duration)}
          </Text>
        ) : null}
      </Press>
      <View>
        <Button
          variant="ghost"
          icon="more"
          iconOnly
          hasPopup="dialog"
          accessibilityLabel={t('more', { name: p.song.title })}
          onPress={() => setMenu(true)}
        />
      </View>
      <SongMenu
        target={targetOf(p)}
        on={p.on}
        open={menu}
        onClose={() => setMenu(false)}
        onRemove={p.onRemove}
      />
    </View>
  )
}

function TvSongRow(p: SongRowProps) {
  const theme = useTheme()
  const u = theme.u
  const label = useSongLabel(p)
  const [menu, setMenu] = useState(false)
  const row = TV_MUSIC.row
  const cover = (p.numbered ? row.number : row.cover) * u
  return (
    <>
      <Focusable
        ref={p.ref}
        onPress={p.onPlay}
        onLongPress={() => setMenu(true)}
        onFocus={p.onFocus}
        preferred={p.preferred}
        lift="button"
        ring={false}
        radius={row.radius * u}
        label={label}
        selected={p.here}
      >
        {(focused) => {
          const color = focused ? 'bg' : p.here ? 'accent-text' : 'text-2'
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: row.gap * u,
                paddingHorizontal: row.x * u,
                paddingVertical: (p.numbered ? row.yNumbered : row.y) * u,
                borderRadius: row.radius * u,
                backgroundColor: focused ? theme.colors.text : undefined,
              }}
            >
              <View
                style={{
                  width: cover,
                  height: p.numbered ? undefined : cover,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {p.numbered ? (
                  p.here ? (
                    <PlayingBars playing={p.playing} color={focused ? 'bg' : 'accent-text'} />
                  ) : (
                    <Text variant="button" color={color} style={{ fontVariant: ['tabular-nums'] }}>
                      {String(p.song.number)}
                    </Text>
                  )
                ) : (
                  <>
                    <Cover uri={p.album.cover} size={cover} radius={TV_MUSIC.coverRadius * u} />
                    {p.here ? (
                      <View
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: TV_MUSIC.coverRadius * u,
                          backgroundColor: alpha(BLACK, 0.5),
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <PlayingBars playing={p.playing} color="accent-text" />
                      </View>
                    ) : null}
                  </>
                )}
              </View>
              <View style={{ flex: 3, minWidth: 0 }}>
                <Text variant="button" color={color} numberOfLines={1}>
                  {p.song.title}
                </Text>
                {p.numbered ? null : (
                  <Text variant="pill" color={color} numberOfLines={1} style={{ opacity: 0.7 }}>
                    {p.album.artist.name}
                  </Text>
                )}
              </View>
              {p.showAlbum ? (
                <View style={{ flex: 2, minWidth: 0 }}>
                  <Text variant="pill" color={color} numberOfLines={1} style={{ opacity: 0.7 }}>
                    {p.album.title}
                  </Text>
                </View>
              ) : null}
              <Text
                variant="pill"
                color={color}
                style={{ opacity: 0.7, fontVariant: ['tabular-nums'] }}
              >
                {songTime(p.song.duration)}
              </Text>
            </View>
          )
        }}
      </Focusable>
      <SongMenu target={targetOf(p)} on={p.on} open={menu} onClose={() => setMenu(false)} />
    </>
  )
}
