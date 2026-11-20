// SPDX-License-Identifier: AGPL-3.0-only
// The music player's sound (Phase 5's part D, HT-108; ADR 0065 › The clients' audio): the store
// (./index.ts) says what should be heard, and this makes it so, against the server and through
// one audio output behind a seam. The app's output is expo-audio's player on the phone, the TV and
// the web (apps/client/src/music-player/audio.ts); the tests' is a fake. Nothing here imports a
// platform or React.
//
// For each song that plays, the server is asked for a play with the device's profile
// (`POST /music/tracks/{id}/play`), and the output loads the answer's address, which the server
// sends by byte ranges, or as AAC it makes first when the device can't play the file's codec. The
// place goes to the server every REPORT_MS while a play is open, and at once on pause and play;
// Next, Previous, a song chosen in the queue, the end of a song and Stop each end the play
// (`DELETE /music/plays/{id}`), which is what counts it and puts it in Recently played. A report
// answered 404 with `reason: 'stopped'` is the owner stopping it from Now playing, as a film's
// session is (the film player's `stoppedBy`); a stream answered 503 with `reason: 'no-ffmpeg'` is a
// song that needs making into AAC on a server without ffmpeg. Either pauses the music and says so.
//
// The store stays the one truth for what plays; the output's own controls (the lock screen,
// Control Center, a browser's media keys, headphones taken out) change the store, and the store
// changes the output. Repeat one, or a queue of one with Repeat all, starts a new play of the
// same song, so each time round counts, as Apple Music's play counts do.
import type { MusicPlay, MusicPlayReport } from '@highsea-tv/api-contract'
import type { MusicPlayer, PlayerSong, QueueEntry } from './index.ts'

/** The place goes to the server this often while a play is open, as the film player's does. */
export const MUSIC_REPORT_MS = 10_000

/** What the lock screen, Control Center and a browser's media session show. */
export type NowPlayingInfo = {
  title: string
  artist: string
  album: string
  /** The cover's address, for the lock screen; null when the album has none. */
  artwork: string | null
}

/** What the output says happened: its clock, its own play and pause, the song's end, a failure. */
export type AudioOutputEvent =
  | { type: 'time'; position: number }
  | { type: 'playing'; playing: boolean }
  | { type: 'ended' }
  | { type: 'error'; message: string }
  /** The lock screen's or a media key's Next and Previous, where the platform gives them. */
  | { type: 'next' }
  | { type: 'previous' }

/** The seam: one audio player the engine drives. expo-audio's in the app, a fake in the tests. */
export type AudioOutput = {
  /** A new source, paused at its start, with what the lock screen shows for it. */
  load(url: string, info: NowPlayingInfo): void
  play(): void
  pause(): void
  seekTo(seconds: number): void
  /** 0 to 1, and muted. */
  setVolume(volume: number, muted: boolean): void
  /** Nothing to play: the source goes, and the lock screen's controls with it. */
  unload(): void
  subscribe(listener: (e: AudioOutputEvent) => void): () => void
}

/** The server's side, from the SDK in the app: the profile is the app's to name. */
export type MusicServer = {
  play(trackId: string): Promise<MusicPlay>
  progress(playId: string, report: MusicPlayReport): Promise<void>
  stop(playId: string): Promise<void>
  /**
   * A transcode's address is ready: the server makes the AAC before it sends a byte, and answers
   * 503 with `reason: 'no-ffmpeg'` when it can't. Asked before the output loads it, so the reason
   * reaches the person, which an audio element's error never carries.
   */
  ready(url: string): Promise<void>
}

/** Why the music paused on its own, for the app's message. */
export type MusicNotice =
  | { kind: 'stopped'; by: string; message: string | null }
  | { kind: 'no-ffmpeg' }
  | { kind: 'failed'; message: string }

/** What a server's error says, read from the SDK's `ApiError.details` (and its status). */
export function musicPlayError(e: unknown): MusicNotice | { kind: 'ended' } {
  const err = e as { status?: number; details?: unknown; message?: string } | null
  const d = (err?.details ?? null) as Record<string, unknown> | null
  if (d?.reason === 'stopped' && typeof d.by === 'string')
    return { kind: 'stopped', by: d.by, message: typeof d.message === 'string' ? d.message : null }
  if (d?.reason === 'no-ffmpeg') return { kind: 'no-ffmpeg' }
  // the play went quiet and the server let it go (or the server restarted): a new one starts
  if (err?.status === 404) return { kind: 'ended' }
  return { kind: 'failed', message: err?.message ?? String(e) }
}

export type MusicAudioOptions<S extends PlayerSong> = {
  player: MusicPlayer<S>
  output: AudioOutput
  server: MusicServer
  /** The song as the lock screen shows it. */
  info: (song: S) => NowPlayingInfo
  /** The music paused on its own, and why. */
  notice?: (n: MusicNotice) => void
  reportMs?: number
  /** The report timer, for tests. */
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (id: unknown) => void
}

/** The song the engine has a play for, and what it last gave the output. */
type Current = {
  key: string
  /** Null while the server's answer is awaited. */
  play: MusicPlay | null
  /** The output has the source. */
  loaded: boolean
  /** The output has said it's playing since it loaded. */
  heard: boolean
  playing: boolean
  /** The place the engine last gave or heard, in seconds. */
  position: number
}

/** A jump in the store's place bigger than this is a seek, not the clock. */
const SEEK_S = 1
/** The output's clock is held this far short of the song's end, so the end is the output's. */
const END_MARGIN_S = 0.05

/**
 * Drives `output` from the store and the server, and the store from the output, until the
 * returned function lets go (ending the play).
 */
export function createMusicAudio<S extends PlayerSong>(o: MusicAudioOptions<S>) {
  const { player, output, server } = o
  const every = o.setInterval ?? ((fn, ms) => setInterval(fn, ms))
  const stopEvery = o.clearInterval ?? ((id) => clearInterval(id as never))
  let current: Current | null = null
  /** Bumped by each start and each let-go, so a slow answer to an older one is ended, not played. */
  let generation = 0
  /** The engine's own writes to the store, reconciled once after. */
  let quiet = false
  let volume: [number, boolean] | null = null
  let released = false

  const song = () => {
    const s = player.get()
    return s.queue[s.index] ?? null
  }

  function report(c: Current) {
    const play = c.play
    if (!play) return
    server
      .progress(play.id, { position: Math.max(0, c.position), paused: !c.playing })
      .catch((e) => {
        if (current !== c) return
        heardError(e)
      })
  }

  /** A server's answer that ends the play: stopped from Now playing, or gone quiet. */
  function heardError(e: unknown) {
    const why = musicPlayError(e)
    const c = current
    if (!c) return
    if (why.kind === 'ended') {
      // a new play starts when the music next plays, from where it was
      letGo(false)
      reconcile()
    } else if (why.kind === 'stopped') {
      letGo(false)
      pause()
      o.notice?.(why)
    }
    // anything else (the network for a moment) leaves the music playing: the next report retries
  }

  /** The play ends: on the server unless it already has, and the output lets go of it. */
  function letGo(end = true) {
    const c = current
    generation++
    current = null
    if (!c) return
    if (end && c.play) server.stop(c.play.id).catch(() => {})
    if (c.loaded) output.unload()
  }

  function pause() {
    quiet = true
    try {
      player.setPlaying(false)
    } finally {
      quiet = false
    }
  }

  async function start(s: QueueEntry<S>, at: number) {
    const gen = ++generation
    const c: Current = {
      key: s.key,
      play: null,
      loaded: false,
      heard: false,
      playing: false,
      position: at,
    }
    current = c
    let play: MusicPlay
    try {
      play = await server.play(s.id)
      if (gen !== generation) {
        server.stop(play.id).catch(() => {})
        return
      }
      c.play = play
      if (play.method === 'transcode') await server.ready(play.url)
    } catch (e) {
      if (gen !== generation) return
      const why = musicPlayError(e)
      letGo()
      pause()
      o.notice?.(why.kind === 'ended' ? { kind: 'failed', message: String(e) } : why)
      return
    }
    if (gen !== generation) return
    output.load(play.url, o.info(s))
    c.loaded = true
    // the output starts at 0; the store's place, if further, is a seek
    c.position = 0
    volume = null
    reconcile()
  }

  /** Brings the output and the server to what the store says. */
  function reconcile() {
    if (quiet || released) return
    const s = player.get()
    const want = song()
    if (!want) {
      letGo()
      return
    }
    if (current && current.key !== want.key) letGo()
    if (!current) {
      // a song that's only queued, paused, has no play yet: one starts when it plays
      if (s.playing) void start(want, s.position)
      return
    }
    const c = current
    if (!c.loaded) return
    const v: [number, boolean] = [s.volume, s.muted]
    if (!volume || volume[0] !== v[0] || volume[1] !== v[1]) {
      output.setVolume(s.volume, s.muted)
      volume = v
    }
    // Previous's restart goes to 0 from anywhere, so 0 is always a seek
    if (Math.abs(s.position - c.position) > SEEK_S || (c.position > 0 && s.position === 0)) {
      c.position = s.position
      output.seekTo(s.position)
      report(c)
    }
    if (s.playing !== c.playing) {
      c.playing = s.playing
      if (s.playing) output.play()
      else output.pause()
      report(c)
    }
  }

  function heard(e: AudioOutputEvent) {
    if (released) return
    const c = current
    if (e.type === 'next') return player.next()
    if (e.type === 'previous') return player.previous()
    if (!c?.loaded) return
    const s = song()
    if (!s || s.key !== c.key) return
    if (e.type === 'time') {
      c.position = Math.min(Math.max(0, e.position), Math.max(0, s.duration - END_MARGIN_S))
      quiet = true
      try {
        player.setPosition(c.position)
      } finally {
        quiet = false
      }
    } else if (e.type === 'playing') {
      if (e.playing) c.heard = true
      if (e.playing === c.playing) return
      // the output paused or played on its own (the lock screen, a media key, an interruption);
      // its pause at a song's end is the end's to handle
      if (!e.playing && (!c.heard || c.position >= s.duration - 1)) return
      c.playing = e.playing
      quiet = true
      try {
        player.setPlaying(e.playing)
      } finally {
        quiet = false
      }
      report(c)
    } else if (e.type === 'ended') {
      // the play ends here, so it's counted; Repeat one plays the song again as a new play
      c.position = s.duration
      letGo()
      quiet = true
      try {
        player.setPlaying(true)
        player.ended()
      } finally {
        quiet = false
      }
      reconcile()
    } else if (e.type === 'error') {
      letGo()
      pause()
      o.notice?.({ kind: 'failed', message: e.message })
    }
  }

  const unsubscribeOutput = output.subscribe(heard)
  const unsubscribePlayer = player.subscribe(reconcile)
  const timer = every(() => {
    if (current?.play && current.loaded) report(current)
  }, o.reportMs ?? MUSIC_REPORT_MS)
  reconcile()

  return {
    /**
     * The server says these plays were stopped (`playback.stopped`, to this person alone): a
     * report at once hears who stopped it, as the film player's does.
     */
    stoppedEvent(ids: readonly string[]) {
      const c = current
      if (c?.play && ids.includes(c.play.id)) report(c)
    },
    /** The play now open, for tests and the app's reports. */
    playId: () => current?.play?.id ?? null,
    /** Lets go: the play ends and the output is emptied. */
    release() {
      if (released) return
      letGo()
      released = true
      unsubscribeOutput()
      unsubscribePlayer()
      stopEvery(timer)
    },
  }
}

export type MusicAudio = ReturnType<typeof createMusicAudio>
