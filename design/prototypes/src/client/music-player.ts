// SPDX-License-Identifier: AGPL-3.0-only
// The music player's state, the same on every app (the universal player): what's queued, which
// song, whether it's playing, where in it, and the volume. It lives above the routes, so music
// goes on playing as the app moves from page to page, as Plex's, Emby's, Apple Music's and
// Spotify's players do. There's no audio in the prototype: the position runs on a real-time
// timer, and the song's loudness from the server's analysis stands in for what's heard.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useClient } from '../mock/hooks.tsx'
import type { QueuedSong } from '../mock/types.ts'
import { useMusicState } from './data.ts'

/** Previous restarts the song after this many seconds of it, as every music app's does. */
export const RESTART_S = 3
/** Left and Right on the scrubber, in seconds. */
export const MUSIC_SEEK_S = 5
/** How often the position moves, in ms: often enough for the waveform to fill smoothly. */
const TICK_MS = 250

export type MusicSource = { album: string } | { artist: string }

export type MusicPlayerState = {
  queue: QueuedSong[]
  index: number
  playing: boolean
  /** Seconds into the song. */
  position: number
  /** 0 to 1. */
  volume: number
  muted: boolean
  shuffle: boolean
}

const empty: MusicPlayerState = {
  queue: [],
  index: 0,
  playing: false,
  position: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
}

let state = empty
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
  // at the song's end the next one starts; after the last, the queue stops at its start
  if (state.index + 1 < state.queue.length) set({ index: state.index + 1, position: 0 })
  else set({ index: 0, position: 0, playing: false })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const musicPlayer = {
  get: () => state,
  load(queue: QueuedSong[], start = 0, position = 0, shuffle = false) {
    set({ queue, index: Math.min(start, queue.length - 1), position, playing: true, shuffle })
  },
  toggle: () => set({ playing: !state.playing }),
  next() {
    if (state.index + 1 < state.queue.length) set({ index: state.index + 1, position: 0 })
  },
  previous() {
    if (state.position > RESTART_S || state.index === 0) set({ position: 0 })
    else set({ index: state.index - 1, position: 0 })
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
  /** Closes the player: the queue is cleared and the bar goes. */
  stop: () => set(empty),
}

/** The player, for the bar, the Now playing screen and the pages' Play buttons. */
export function useMusicPlayer() {
  const s = useSyncExternalStore(subscribe, musicPlayer.get, musicPlayer.get)
  const client = useClient()
  /** Plays an album or an artist from a song (the first by default), or shuffled. */
  const play = useCallback(
    async (source: MusicSource, opts: { start?: number; shuffle?: boolean } = {}) => {
      const queue = await client.library.queue(source, opts.shuffle ?? false)
      musicPlayer.load(queue, opts.start ?? 0, 0, opts.shuffle ?? false)
    },
    [client],
  )
  const song = s.queue[s.index] ?? null
  return {
    ...s,
    song,
    /** The song after this one, for Up next. */
    upNext: s.queue[s.index + 1] ?? null,
    hasPrevious: s.index > 0 || s.position > RESTART_S,
    hasNext: s.index + 1 < s.queue.length,
    play,
    ...musicPlayer,
  }
}

/** Is this album the one playing? Its Play button shows Pause while it is. */
export function useAlbumPlaying(album: string) {
  const s = useSyncExternalStore(subscribe, musicPlayer.get, musicPlayer.get)
  const song = s.queue[s.index]
  return song?.album.id === album && !s.shuffle ? s : null
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
