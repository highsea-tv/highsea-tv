// SPDX-License-Identifier: AGPL-3.0-only
// The music player's state, the same on every app (the universal player): what's queued, which
// song, whether it's playing, where in it, and the volume. It lives above the routes, so music
// goes on playing as the app moves from page to page, as Plex's, Emby's, Apple Music's and
// Spotify's players do. There's no audio in the prototype: the position runs on a real-time
// timer, and the song's loudness from the server's analysis stands in for what's heard.

import type { MusicSource, QueuedSong } from '@highsea-tv/mock/types'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useClient } from '../mock/hooks.tsx'
import { useMusicState } from './data.ts'

/** Previous restarts the song after this many seconds of it, as every music app's does. */
export const RESTART_S = 3
/** Left and Right on the scrubber, in seconds. */
export const MUSIC_SEEK_S = 5
/** How often the position moves, in ms: often enough for the waveform to fill smoothly. */
const TICK_MS = 250

export type { MusicSource }

/** Off, then the whole queue, then the one song, as Apple Music's and Spotify's Repeat go. */
export type Repeat = 'off' | 'all' | 'one'

/**
 * What was played, for "Playing from": an album, an artist, a playlist, a search or a song on
 * its own (Songs, or a song's Play next with nothing playing). `to` is the page, on every app's
 * routes.
 */
export type PlayingFrom = {
  kind: 'album' | 'artist' | 'playlist' | 'search' | 'songs'
  name: string
  to: string | null
}

/** A song in the queue: `key` tells two of the same song apart. */
export type QueueEntry = QueuedSong & { key: string }

export type MusicPlayerState = {
  queue: QueueEntry[]
  index: number
  playing: boolean
  /** Seconds into the song. */
  position: number
  /** 0 to 1. */
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: Repeat
  from: PlayingFrom | null
}

const empty: MusicPlayerState = {
  queue: [],
  index: 0,
  playing: false,
  position: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  from: null,
}

let state = empty
/** The queue's order before Shuffle, so turning it off puts the songs back. */
let unshuffled: QueueEntry[] = []
let keys = 0
const entries = (songs: QueuedSong[]): QueueEntry[] =>
  songs.map((s) => ({ ...s, key: `q${++keys}` }))
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function set(next: Partial<MusicPlayerState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
  // the clock runs only while a song plays
  if (state.playing && state.queue.length > 0 && !timer) timer = setInterval(tick, TICK_MS)
  if ((!state.playing || state.queue.length === 0) && timer) {
    clearInterval(timer)
    timer = undefined
  }
}

function tick() {
  const song = state.queue[state.index]
  if (!song) return
  const position = state.position + TICK_MS / 1000
  if (position < song.duration) return set({ position })
  // at the song's end: Repeat one plays it again; the next one starts; after the last, Repeat
  // all goes round, otherwise the queue stops at its start
  if (state.repeat === 'one') set({ position: 0 })
  else if (state.index + 1 < state.queue.length) set({ index: state.index + 1, position: 0 })
  else set({ index: 0, position: 0, playing: state.repeat === 'all' })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** A string's hash, for a shuffle that's the same every time in the prototype's reviews. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)

export const musicPlayer = {
  get: () => state,
  load(
    queue: QueuedSong[],
    start = 0,
    position = 0,
    shuffle = false,
    from: PlayingFrom | null = null,
  ) {
    const q = entries(queue)
    unshuffled = q
    set({ queue: q, index: Math.min(start, q.length - 1), position, playing: true, shuffle, from })
  },
  toggle: () => set({ playing: !state.playing }),
  next() {
    if (state.index + 1 < state.queue.length) set({ index: state.index + 1, position: 0 })
    else if (state.repeat === 'all' && state.queue.length > 0) set({ index: 0, position: 0 })
  },
  previous() {
    if (state.position > RESTART_S || (state.index === 0 && state.repeat !== 'all'))
      set({ position: 0 })
    else set({ index: (state.index || state.queue.length) - 1, position: 0 })
  },
  seekTo(seconds: number) {
    const song = state.queue[state.index]
    if (song) set({ position: Math.max(0, Math.min(song.duration - 0.5, seconds)) })
  },
  seekBy: (seconds: number) => musicPlayer.seekTo(state.position + seconds),
  /** A song in the queue, from its start. */
  jump: (index: number) => set({ index, position: 0, playing: true }),
  setVolume: (volume: number) => set({ volume, muted: volume === 0 }),
  toggleMute: () => set({ muted: !state.muted }),
  /** Off, all, one, off. */
  cycleRepeat: () =>
    set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' }),
  /**
   * Shuffle on keeps the song playing and shuffles what's after it; off puts the queue back in
   * its order, at the same song.
   */
  toggleShuffle() {
    const current = state.queue[state.index]
    if (!current) return set({ shuffle: !state.shuffle })
    if (state.shuffle) {
      const index = unshuffled.findIndex((e) => e.key === current.key)
      return set({ shuffle: false, queue: unshuffled, index: Math.max(0, index) })
    }
    unshuffled = state.queue
    const rest = state.queue
      .filter((e) => e.key !== current.key)
      .sort((a, b) => hash(`shuffle:${a.id}`) - hash(`shuffle:${b.id}`))
    set({ shuffle: true, queue: [current, ...rest], index: 0 })
  },
  /** Songs after the one playing; with nothing playing, they play. */
  playNext(songs: QueuedSong[], from: PlayingFrom) {
    if (state.queue.length === 0) return musicPlayer.load(songs, 0, 0, false, from)
    const added = entries(songs)
    const at = state.index + 1
    unshuffled = [...unshuffled, ...added]
    set({ queue: [...state.queue.slice(0, at), ...added, ...state.queue.slice(at)] })
  },
  /** Songs at the end of the queue; with nothing playing, they play. */
  add(songs: QueuedSong[], from: PlayingFrom) {
    if (state.queue.length === 0) return musicPlayer.load(songs, 0, 0, false, from)
    const added = entries(songs)
    unshuffled = [...unshuffled, ...added]
    set({ queue: [...state.queue, ...added] })
  },
  /** Takes a song out of Up next. The one playing isn't removed: Next or Stop does that. */
  remove(key: string) {
    const at = state.queue.findIndex((e) => e.key === key)
    if (at < 0 || at === state.index) return
    unshuffled = unshuffled.filter((e) => e.key !== key)
    set({
      queue: state.queue.filter((e) => e.key !== key),
      index: at < state.index ? state.index - 1 : state.index,
    })
  },
  /** Moves a song in Up next to another place there, by the keys' new order. */
  reorder(upNext: string[]) {
    const by = new Map(state.queue.map((e) => [e.key, e]))
    const after = upNext.flatMap((k) => by.get(k) ?? [])
    const queue = [...state.queue.slice(0, state.index + 1), ...after]
    if (!state.shuffle) unshuffled = queue
    set({ queue })
  },
  /** Clears what's after the song playing. */
  clearUpNext() {
    const queue = state.queue.slice(0, state.index + 1)
    unshuffled = unshuffled.filter((e) => queue.includes(e))
    set({ queue })
  },
  /** Stops the music: the queue is cleared and the bar or the mini player goes. */
  stop() {
    unshuffled = []
    set({ ...empty, volume: state.volume, muted: state.muted })
  },
}

/** "Playing from" for what a source names, read from the queue it gave. */
function fromOf(source: MusicSource, queue: QueuedSong[]): PlayingFrom | null {
  const first = queue[0]
  if (!first) return null
  if ('album' in source)
    return { kind: 'album', name: first.album.title, to: `/music/albums/${source.album}` }
  if ('artist' in source)
    return { kind: 'artist', name: first.album.artist.name, to: `/music/artists/${source.artist}` }
  if ('playlist' in source)
    return { kind: 'playlist', name: 'Playlist', to: `/music/playlists/${source.playlist}` }
  return { kind: 'songs', name: 'Songs', to: '/music/songs' }
}

/** The player, for the bar, the Now playing screen and the pages' Play buttons. */
export function useMusicPlayer() {
  const s = useSyncExternalStore(subscribe, musicPlayer.get, musicPlayer.get)
  const client = useClient()
  /**
   * Plays an album, an artist, a playlist or songs from a song (the first by default), or
   * shuffled. `from` names it where the source doesn't: a playlist's name, or a search.
   */
  const play = useCallback(
    async (
      source: MusicSource,
      opts: { start?: number; shuffle?: boolean; from?: PlayingFrom } = {},
    ) => {
      const queue = await client.library.queue(source, opts.shuffle ?? false)
      musicPlayer.load(
        queue,
        opts.start ?? 0,
        0,
        opts.shuffle ?? false,
        opts.from ?? fromOf(source, queue),
      )
    },
    [client],
  )
  const song = s.queue[s.index] ?? null
  const looping = s.repeat === 'all' && s.queue.length > 0
  return {
    ...s,
    song,
    /** The songs after this one, for Up next. */
    upNext: s.queue.slice(s.index + 1),
    hasPrevious: s.index > 0 || s.position > RESTART_S || looping,
    hasNext: s.index + 1 < s.queue.length || looping,
    play,
    ...musicPlayer,
  }
}

/** "Playing from" in words, for the Now playing screens: "Playing from Sintel (Original Score)". */
export const playingFromLabel = (from: PlayingFrom) =>
  from.kind === 'search'
    ? `Playing from your search for “${from.name}”`
    : `Playing from ${from.name}`

/** Repeat's name and icon in each of its states, for its button on every Now playing. */
export const repeatButton: Record<Repeat, { label: string; icon: 'repeat' | 'repeat-one' }> = {
  off: { label: 'Repeat: off', icon: 'repeat' },
  all: { label: 'Repeat: the queue', icon: 'repeat' },
  one: { label: 'Repeat: this song', icon: 'repeat-one' },
}

/** Is a song from this album playing? Its row has the playing mark while it is. */
export function useAlbumPlaying(album: string) {
  const s = useSyncExternalStore(subscribe, musicPlayer.get, musicPlayer.get)
  const song = s.queue[s.index]
  return song?.album.id === album ? s : null
}

/**
 * Is this album, artist or playlist what's playing, in its order, by the page `from` names? Its
 * Play button shows Pause while it is, as Apple Music's does; a song from it played on its own
 * (Play next, Search) leaves Play as it is.
 */
export function usePlayingFrom(to: string) {
  const s = useSyncExternalStore(subscribe, musicPlayer.get, musicPlayer.get)
  return s.queue.length > 0 && s.from?.to === to && s.from.kind !== 'songs' && !s.shuffle ? s : null
}

/**
 * The toolbar's Music state: "A song playing" queues Sintel’s score at its fourth cue, a minute in,
 * so any page can be reviewed with the player showing; "Nothing playing" closes it.
 */
export function SeedMusic() {
  const music = useMusicState()
  const client = useClient()
  useEffect(() => {
    if (music === 'none') return musicPlayer.stop()
    if (musicPlayer.get().queue.length > 0) return
    let live = true
    Promise.resolve(client.library.queue({ album: 'jan-morgenstern-sintel-original-score' })).then(
      (q) => live && musicPlayer.load(q, 3, 64),
      () => {},
    )
    return () => {
      live = false
    }
  }, [music, client])
  return null
}
