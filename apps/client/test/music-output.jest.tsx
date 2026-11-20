// SPDX-License-Identifier: AGPL-3.0-only
// The music player's two outputs (HT-117), each behind the engine's seam: expo-audio's playlist on
// the iPhone and the Apple TV (output-native.ts), against the jest mock's playlist, which says its
// status as AudioPlaylist.swift does; and the web's two audio elements (output-web.ts), against
// fake elements. The lock screen's Next and Previous, the prepared song and the move onto it, and
// the volume with each song's gain, never past 1.
import type { AudioOutputEvent, AudioSource } from '@highsea-tv/client/music-player'
import { nativePlaylistOutput } from '../src/music-player/output-native.ts'
import { webElementsOutput } from '../src/music-player/output-web.ts'

const media = (path: string) => ({ uri: `https://nas.example${path}`, headers: {} })
const source = (n: number, gain = 1): AudioSource => ({
  url: `/stream/music/tok${n}`,
  info: { title: `Song ${n}`, artist: 'Jan Morgenstern', album: 'Sintel', artwork: null },
  gain,
})

type FakePlaylist = {
  sources: { uri: string }[]
  calls: string[]
  currentIndex: number
  volume: number
  muted: boolean
  lockScreen: { metadata?: { title?: string }; options?: Record<string, boolean> } | null
  status(s: {
    currentIndex?: number
    currentTime?: number
    playing?: boolean
    didJustFinish?: boolean
  }): void
}
// the outputs' linger and load timers, which would outlive the tests
beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const playlists = () => (require('expo-audio') as { playlists: FakePlaylist[] }).playlists

function native() {
  const out = nativePlaylistOutput(media)
  const events: AudioOutputEvent[] = []
  out.subscribe((e) => events.push(e))
  return { out, events, list: () => playlists().at(-1) as FakePlaylist }
}

describe('the playlist output (iPhone, Apple TV)', () => {
  test('a song loads with an item before it, and the lock screen offers Next and Previous', () => {
    const { out, list } = native()
    out.load(source(1))
    const l = list()
    expect(l.sources.map((s) => s.uri)).toEqual([
      'https://nas.example/stream/music/tok1',
      'https://nas.example/stream/music/tok1',
    ])
    expect(l.currentIndex).toBe(1)
    expect(l.lockScreen?.options).toMatchObject({ showNextTrack: true, showPreviousTrack: true })
    expect(l.lockScreen?.metadata).toMatchObject({ title: 'Song 1' })
  })

  test('the prepared song is added after; the playlist moving on to it is `advanced`', () => {
    const { out, events, list } = native()
    out.load(source(1))
    const l = list()
    l.status({ currentIndex: 1, currentTime: 0, playing: true })
    out.prepare(source(2))
    expect(l.sources.at(-1)?.uri).toBe('https://nas.example/stream/music/tok2')
    events.length = 0
    // the end, or the lock screen's Next: the native side moved on by itself
    l.status({ currentIndex: 2, currentTime: 0, playing: true })
    expect(events[0]).toEqual({ type: 'advanced' })
    expect(l.lockScreen?.metadata).toMatchObject({ title: 'Song 2' })
  })

  test('a prepared song let go is removed; with nothing prepared the end is `ended`', () => {
    const { out, events, list } = native()
    out.load(source(1))
    const l = list()
    l.status({ currentIndex: 1, playing: true })
    out.prepare(source(2))
    out.prepare(null)
    expect(l.calls.at(-1)).toBe('remove 2')
    expect(l.sources).toHaveLength(2)
    l.status({ currentIndex: 1, currentTime: 100, didJustFinish: true })
    expect(events.at(-1)).toEqual({ type: 'ended' })
  })

  test('the lock screen’s Previous: the playlist is put back on the song and `previous` is said', () => {
    const { out, events, list } = native()
    out.load(source(1))
    const l = list()
    // a status from before the load settled says index 0: that's not the lock screen
    l.status({ currentIndex: 0 })
    expect(events.filter((e) => e.type === 'previous')).toHaveLength(0)
    l.status({ currentIndex: 1, currentTime: 20, playing: true })
    // the lock screen's Previous: expo-audio goes back an item
    l.status({ currentIndex: 0, currentTime: 0, playing: true })
    expect(events.filter((e) => e.type === 'previous')).toHaveLength(1)
    expect(l.calls.at(-1)).toBe('skipTo 1')
  })

  test('the app’s Next moves the playlist on without an `advanced`', () => {
    const { out, events, list } = native()
    out.load(source(1))
    const l = list()
    l.status({ currentIndex: 1, playing: true })
    out.prepare(source(2))
    out.advance()
    expect(l.calls.at(-1)).toBe('next')
    l.status({ currentIndex: 2, currentTime: 0.2, playing: true })
    expect(events.filter((e) => e.type === 'advanced')).toHaveLength(0)
    expect(events.at(-1)).toEqual({ type: 'time', position: 0.2 })
  })

  test('the volume is the person’s times the song’s gain, never past 1, and changes as songs do', () => {
    const { out, list } = native()
    out.load(source(1, 0.5))
    const l = list()
    out.setVolume(0.8, false)
    expect(l.volume).toBeCloseTo(0.4)
    l.status({ currentIndex: 1, playing: true })
    out.prepare(source(2, 2))
    l.status({ currentIndex: 2, playing: true })
    expect(l.volume).toBe(1)
    out.setVolume(0.25, true)
    expect(l.volume).toBeCloseTo(0.5)
    expect(l.muted).toBe(true)
  })
})

/** An HTML audio element as far as the output uses it, with its events fired by the test. */
class FakeElement {
  src = ''
  preload = ''
  volume = 1
  muted = false
  currentTime = 0
  duration = 100
  playbackRate = 1
  paused = true
  ended = false
  error = null
  calls: string[] = []
  listeners = new Map<string, (() => void)[]>()
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn()
  }
  play() {
    this.paused = false
    this.calls.push('play')
    this.fire('play')
    return Promise.resolve()
  }
  pause() {
    if (this.paused) return
    this.paused = true
    this.calls.push('pause')
    this.fire('pause')
  }
  load() {
    this.calls.push(`load ${this.src}`)
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
}

function web() {
  const els: FakeElement[] = []
  const out = webElementsOutput(media, () => {
    const e = new FakeElement()
    els.push(e)
    return e as never
  })
  const events: AudioOutputEvent[] = []
  out.subscribe((e) => events.push(e))
  return { out, events, els }
}

describe('the web output (browser, desktop app)', () => {
  test('the prepared song is fetched ahead in the second element and starts at the first’s end', () => {
    const { out, events, els } = web()
    out.load(source(1))
    out.play()
    const [a, b] = els
    if (!a || !b) throw new Error('no elements')
    expect(a.preload).toBe('auto')
    out.prepare(source(2))
    expect(b.src).toBe('https://nas.example/stream/music/tok2')
    expect(b.calls).toContain('load https://nas.example/stream/music/tok2')
    expect(b.paused).toBe(true)
    // the end: the element pauses itself, then says `ended`
    a.ended = true
    a.paused = true
    a.fire('pause')
    a.fire('ended')
    expect(b.paused).toBe(false)
    expect(events.filter((e) => e.type === 'playing' && !e.playing)).toHaveLength(0)
    expect(events.at(-1)).toEqual({ type: 'advanced' })
    // the new one's clock is heard; the old one's isn't
    b.currentTime = 0.3
    b.fire('timeupdate')
    a.currentTime = 99
    a.fire('timeupdate')
    expect(events.at(-1)).toEqual({ type: 'time', position: 0.3 })
  })

  test('the prepared element is started at the playing one’s end by its clock, before `ended`', () => {
    const { out, els } = web()
    out.load(source(1))
    out.play()
    out.prepare(source(2))
    const [a, b] = els as [FakeElement, FakeElement]
    a.currentTime = 99.75
    a.fire('timeupdate')
    jest.advanceTimersByTime(240)
    expect(b.paused).toBe(true)
    jest.advanceTimersByTime(20)
    expect(b.paused).toBe(false)
    // paused near the end: no early start
    out.prepare(source(3))
    a.pause()
    a.fire('timeupdate')
    jest.advanceTimersByTime(1000)
    expect(b.calls.filter((c) => c === 'play')).toHaveLength(1)
  })

  test('with nothing prepared the end is `ended`; the person’s pause is `playing: false`', () => {
    const { out, events, els } = web()
    out.load(source(1))
    out.play()
    const a = els[0] as FakeElement
    a.pause()
    expect(events.at(-1)).toEqual({ type: 'playing', playing: false })
    out.play()
    a.ended = true
    a.paused = true
    a.fire('pause')
    a.fire('ended')
    expect(events.at(-1)).toEqual({ type: 'ended' })
  })

  test('the app’s Next moves to the prepared element at once', () => {
    const { out, events, els } = web()
    out.load(source(1))
    out.play()
    out.prepare(source(2))
    out.advance()
    const [a, b] = els as [FakeElement, FakeElement]
    expect(a.paused).toBe(true)
    expect(b.paused).toBe(false)
    expect(
      events.filter((e) => e.type === 'advanced' || (e.type === 'playing' && !e.playing)),
    ).toEqual([])
  })

  test('each element’s volume is the person’s times its song’s gain, at most 1', () => {
    const { out, els } = web()
    out.load(source(1, 0.5))
    out.prepare(source(2, 4))
    out.setVolume(0.6, false)
    const [a, b] = els as [FakeElement, FakeElement]
    expect(a.volume).toBeCloseTo(0.3)
    expect(b.volume).toBe(1)
  })
})
