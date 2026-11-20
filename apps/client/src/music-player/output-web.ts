// SPDX-License-Identifier: AGPL-3.0-only
// The music player's output in the browser and the desktop app (HT-117; ADR 0065 › Gapless and
// loudness): two HTML audio elements behind the engine's seam (`@highsea-tv/client/music-player`'s
// AudioOutput), one playing and one holding the song prepared after it.
//
// Why not expo-audio's player on the web: its playlist there opens the next song only when the
// last ends (expo-audio's AudioPlaylist.web.ts, `new Audio()` on `ended`), so every join waits
// for a fresh request. Here the prepared element is given its address at once with
// `preload = "auto"`, which asks the browser to fetch it ahead
// (https://html.spec.whatwg.org/multipage/media.html#attr-media-preload), and it's started at the
// playing one's end by that one's clock (`timeJoin`), with `ended` as the fallback.
//
// Why not the Web Audio API, which can join two buffers to the sample: a media element from
// another origin without CORS headers gives a MediaElementAudioSourceNode only silence
// (https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceNode), and the desktop app
// plays from the owner's server, another origin; decoding whole songs with `decodeAudioData`
// instead would hold each in memory as raw samples. The join is a timer's and the next element's
// start: under 1 to 16 ms of silence in Chromium (scripts/sweeps/music-gapless.ts), not
// sample-exact.
//
// Levelling: an element's `volume` is 0 to 1 (HTML's "volume" IDL attribute throws past 1), so a
// song's gain is the person's volume times its gain, at most 1: a quiet song is brought up only
// as far as the volume leaves room.
//
// The Media Session (https://w3c.github.io/mediasession/): the song, its artist, album and cover,
// and Next and Previous from the keyboard's media keys and the browser's controls; play and pause
// are the browser's own on the playing element, heard as its `play` and `pause` events.
import type { AudioOutput, AudioOutputEvent, AudioSource } from '@highsea-tv/client/music-player'
import type { MediaUrl } from './audio.ts'

/** The Media Session's parts used here (MDN), so the app's types needn't include the DOM's. */
type WebMediaSession = {
  metadata: unknown
  playbackState: 'none' | 'paused' | 'playing'
  setActionHandler(action: string, handler: (() => void) | null): void
}
type WebMediaMetadata = new (init: {
  title: string
  artist: string
  album: string
  artwork?: { src: string }[]
}) => unknown

/** The parts of an HTMLAudioElement used here. */
type Element = {
  src: string
  preload: string
  volume: number
  muted: boolean
  currentTime: number
  duration: number
  playbackRate: number
  paused: boolean
  ended: boolean
  error: { code: number; message?: string } | null
  play(): Promise<void>
  pause(): void
  load(): void
  removeAttribute(name: string): void
  addEventListener(type: string, fn: () => void): void
}

const session = () =>
  (globalThis as { navigator?: { mediaSession?: WebMediaSession } }).navigator?.mediaSession

/** How long the elements outlast the music, as on the phone, so Next keeps the media keys. */
const LINGER_MS = 3000

export function webElementsOutput(
  media: MediaUrl,
  make: () => Element = () => new (globalThis as unknown as { Audio: new () => Element }).Audio(),
): AudioOutput {
  const listeners = new Set<(e: AudioOutputEvent) => void>()
  const emit = (e: AudioOutputEvent) => {
    for (const l of listeners) l(e)
  }
  type Slot = { el: Element; source: AudioSource | null }
  let slots: [Slot, Slot] | null = null
  /** The playing slot is `slots[current]`, the prepared the other. */
  let current = 0
  let prepared = false
  let volume = 1
  let muted = false
  let wasPlaying = false
  let lastTime = -1
  let linger: ReturnType<typeof setTimeout> | undefined
  /** The prepared element's start, timed for the playing one's end. */
  let joinAt: ReturnType<typeof setTimeout> | undefined

  const playing = () => slots?.[current]
  const other = () => slots?.[1 - current]

  function apply(slot: Slot) {
    slot.el.volume = Math.max(0, Math.min(1, volume * (slot.source?.gain ?? 1)))
    slot.el.muted = muted
  }

  function mediaSession(source: AudioSource | null) {
    const s = session()
    if (!s) return
    const Metadata = (globalThis as { MediaMetadata?: WebMediaMetadata }).MediaMetadata
    const set = (action: string, fn: (() => void) | null) => {
      try {
        s.setActionHandler(action, fn)
      } catch {}
    }
    if (!source) {
      s.metadata = null
      s.playbackState = 'none'
      set('nexttrack', null)
      set('previoustrack', null)
      return
    }
    const art = source.info.artwork ? media(source.info.artwork)?.uri : undefined
    if (Metadata)
      s.metadata = new Metadata({
        title: source.info.title,
        artist: source.info.artist,
        album: source.info.album,
        ...(art ? { artwork: [{ src: art }] } : {}),
      })
    set('nexttrack', () => emit({ type: 'next' }))
    set('previoustrack', () => emit({ type: 'previous' }))
  }

  /** The element's own events, heard only while it's the playing one. */
  function wire(slot: Slot, index: number) {
    const mine = () => slots?.[current] === slot && index === current
    slot.el.addEventListener('timeupdate', () => {
      if (!mine()) return
      const t = slot.el.currentTime
      if (t !== lastTime) {
        lastTime = t
        emit({ type: 'time', position: t })
      }
      timeJoin(slot)
    })
    slot.el.addEventListener('play', () => {
      if (!mine() || wasPlaying) return
      wasPlaying = true
      const s = session()
      if (s) s.playbackState = 'playing'
      emit({ type: 'playing', playing: true })
    })
    slot.el.addEventListener('pause', () => {
      // an element pauses itself at its end, before `ended` (HTML's "reaches the end" steps):
      // that's the end's to say
      if (!mine() || !wasPlaying || slot.el.ended) return
      wasPlaying = false
      const s = session()
      if (s) s.playbackState = 'paused'
      emit({ type: 'playing', playing: false })
    })
    slot.el.addEventListener('ended', () => {
      if (!mine()) return
      if (prepared) {
        handOver()
        emit({ type: 'advanced' })
        return
      }
      wasPlaying = false
      emit({ type: 'ended' })
    })
    slot.el.addEventListener('error', () => {
      if (!slot.source) return
      if (mine())
        emit({ type: 'error', message: slot.el.error?.message || 'The song didn’t load.' })
      else if (prepared) {
        // the prepared song failed to load: it isn't joined, and plays as any song when it comes
        prepared = false
        clear(slot)
      }
    })
  }

  function made(): [Slot, Slot] {
    if (slots) return slots
    const a: Slot = { el: make(), source: null }
    const b: Slot = { el: make(), source: null }
    a.el.preload = 'auto'
    b.el.preload = 'auto'
    slots = [a, b]
    wire(a, 0)
    wire(b, 1)
    return slots
  }

  function clear(slot: Slot) {
    slot.source = null
    slot.el.pause()
    slot.el.removeAttribute('src')
    slot.el.load()
  }

  function give(slot: Slot, source: AudioSource): boolean {
    const src = media(source.url)
    if (!src) return false
    slot.source = source
    slot.el.src = src.uri
    apply(slot)
    slot.el.load()
    return true
  }

  /**
   * The prepared element is started at the playing one's end, by its clock, rather than when its
   * `ended` has been dispatched: a media element's `timeupdate` comes every 15 to 250 ms (HTML's
   * "time marches on"), so within the last second a timer is set for the time that's left, and
   * set again at each one. `ended` still makes the hand-over; if the timer hasn't fired by then,
   * the hand-over starts the element itself.
   */
  function timeJoin(slot: Slot) {
    clearTimeout(joinAt)
    const next = other()
    if (!prepared || !next?.source || slot.el.paused) return
    const left = (slot.el.duration - slot.el.currentTime) / (slot.el.playbackRate || 1)
    if (!Number.isFinite(left) || left > 1) return
    joinAt = setTimeout(
      () => {
        if (prepared && other() === next && !slot.el.paused) void next.el.play().catch(() => {})
      },
      Math.max(0, left * 1000),
    )
  }

  /**
   * The prepared element becomes the playing one, then the old one is emptied, so its pause is
   * no longer the playing element's and isn't heard as the person's.
   */
  function handOver() {
    clearTimeout(joinAt)
    const old = playing()
    const next = other()
    if (!old || !next?.source) return
    current = 1 - current
    prepared = false
    lastTime = -1
    if (wasPlaying) void next.el.play().catch(() => {})
    clear(old)
    mediaSession(next.source)
  }

  return {
    load(source) {
      clearTimeout(linger)
      clearTimeout(joinAt)
      const [a, b] = made()
      clear(a)
      clear(b)
      current = 0
      prepared = false
      wasPlaying = false
      lastTime = -1
      if (!give(a, source)) return emit({ type: 'error', message: 'Can’t reach the server.' })
      mediaSession(source)
    },
    prepare(source) {
      clearTimeout(joinAt)
      const slot = other()
      if (!slot) return
      if (prepared) {
        prepared = false
        clear(slot)
      }
      if (source && give(slot, source)) prepared = true
    },
    advance() {
      if (prepared) handOver()
    },
    play() {
      const p = playing()
      if (p)
        void p.el.play().catch((e: unknown) => {
          // a browser that won't start sound without a gesture: the music shows paused
          if ((e as { name?: string })?.name === 'NotAllowedError' && wasPlaying) {
            wasPlaying = false
            emit({ type: 'playing', playing: false })
          }
        })
    },
    pause() {
      clearTimeout(joinAt)
      playing()?.el.pause()
    },
    seekTo(seconds) {
      clearTimeout(joinAt)
      const p = playing()
      if (p) p.el.currentTime = seconds
    },
    setVolume(v, m) {
      volume = v
      muted = m
      for (const s of slots ?? []) apply(s)
    },
    unload() {
      clearTimeout(joinAt)
      wasPlaying = false
      const p = playing()
      p?.el.pause()
      clearTimeout(linger)
      linger = setTimeout(() => {
        for (const s of slots ?? []) clear(s)
        prepared = false
        mediaSession(null)
      }, LINGER_MS)
    },
    subscribe(l) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}
