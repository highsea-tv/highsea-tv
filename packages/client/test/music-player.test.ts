// SPDX-License-Identifier: AGPL-3.0-only
// The music player's store (@highsea-tv/client/music-player): no audio, a clock the test drives.
import { describe, expect, test } from 'bun:test'
import {
  albumPlaying,
  createMusicPlayer,
  createMusicPlayerText,
  nowPlaying,
  playingFrom,
  RESTART_S,
} from '../src/music-player/index.ts'

const song = (id: string, duration = 10) => ({
  id,
  duration,
  album: { id: 'sintel', title: 'Sintel', artist: { name: 'Jan Morgenstern' } },
})
const songs = ['a', 'b', 'c', 'd'].map((id) => song(id))
const from = { kind: 'album' as const, name: 'Sintel', to: '/music/albums/sintel' }

/** A player whose clock ticks only when the test says. */
function manual() {
  let tick: (() => void) | null = null
  const p = createMusicPlayer({
    tickMs: 1000,
    setInterval: (fn) => {
      tick = fn
      return 1
    },
    clearInterval: () => {
      tick = null
    },
  })
  return { p, tick: (n = 1) => Array.from({ length: n }, () => tick?.()), running: () => !!tick }
}

describe('the queue', () => {
  test('plays on, and stops at the end unless Repeat goes round', () => {
    const { p, tick, running } = manual()
    p.load(songs.slice(0, 2), 0, 0, false, from)
    expect(running()).toBe(true)
    tick(10)
    expect(p.get().index).toBe(1)
    tick(10)
    expect(p.get()).toMatchObject({ index: 0, playing: false })
    expect(running()).toBe(false)
    p.cycleRepeat()
    p.cycleRepeat()
    expect(p.get().repeat).toBe('one')
    p.toggle()
    tick(10)
    expect(p.get().index).toBe(0)
  })

  test('Previous restarts after three seconds, else goes back', () => {
    const { p } = manual()
    p.load(songs, 1, RESTART_S + 1)
    p.previous()
    expect(p.get()).toMatchObject({ index: 1, position: 0 })
    p.previous()
    expect(p.get().index).toBe(0)
  })

  test('Play next, Add, remove, reorder and clear', () => {
    const { p } = manual()
    p.add([song('x')], from)
    expect(p.get().queue.map((e) => e.id)).toEqual(['x'])
    p.load(songs, 0)
    p.playNext([song('x')], from)
    p.add([song('y')], from)
    expect(p.get().queue.map((e) => e.id)).toEqual(['a', 'x', 'b', 'c', 'd', 'y'])
    const keys = p.get().queue.map((e) => e.key)
    p.remove(keys[0] ?? '')
    expect(p.get().queue).toHaveLength(6)
    p.remove(keys[1] ?? '')
    p.reorder([...keys.slice(2)].reverse())
    expect(p.get().queue.map((e) => e.id)).toEqual(['a', 'y', 'd', 'c', 'b'])
    p.clearUpNext()
    expect(nowPlaying(p.get()).upNext).toEqual([])
  })

  test('Shuffle keeps the song and puts the order back when off', () => {
    const { p } = manual()
    p.load(songs, 2)
    p.toggleShuffle()
    expect(p.get().queue[0]?.id).toBe('c')
    expect(
      p
        .get()
        .queue.map((e) => e.id)
        .sort(),
    ).toEqual(['a', 'b', 'c', 'd'])
    p.toggleShuffle()
    expect(p.get().queue.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(p.get().index).toBe(2)
  })

  test('Stop keeps the volume; selectors read the state', () => {
    const { p } = manual()
    p.load(songs, 0, 0, false, from)
    expect(albumPlaying(p.get(), 'sintel')).not.toBeNull()
    expect(playingFrom(p.get(), from.to)).not.toBeNull()
    expect(nowPlaying(p.get())).toMatchObject({ hasNext: true, hasPrevious: false })
    p.setVolume(0.3)
    p.stop()
    expect(p.get()).toMatchObject({ queue: [], volume: 0.3, playing: false })
  })

  test('without the clock, a real player drives the position', () => {
    const p = createMusicPlayer({ clock: false })
    p.load(songs.slice(0, 2))
    p.setPosition(4)
    expect(p.get().position).toBe(4)
    p.setPosition(10)
    expect(p.get()).toMatchObject({ index: 1, position: 0 })
  })
})

describe('the words', () => {
  const text = createMusicPlayerText('en')
  test('Playing from and Repeat', () => {
    expect(text.fromOf({ album: 'sintel' }, songs)).toEqual(from)
    expect(text.fromOf({ playlist: 'p1' }, songs)?.name).toBe('Playlist')
    expect(text.fromOf({ songs: ['a'] }, [])).toBeNull()
    expect(text.playingFromLabel(from)).toBe('Playing from Sintel')
    expect(text.playingFromLabel({ kind: 'search', name: 'bells', to: null })).toBe(
      'Playing from your search for “bells”',
    )
    expect(text.repeatButton.one).toEqual({ label: 'Repeat: this song', icon: 'repeat-one' })
  })
})
