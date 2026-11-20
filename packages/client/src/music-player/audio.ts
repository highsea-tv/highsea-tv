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
// Gapless (HT-117; ADR 0065 › Gapless and loudness): as soon as a song's play is open, the song
// that follows it (the store's `ended` rule: the next, the first again with Repeat all, the same
// with Repeat one) is asked for ahead (`ahead: true`, off Now playing until it starts) and handed
// to the output with `prepare`, which opens it beside the playing one. At the song's end the output
// moves on by itself, with no request between (`advanced`), and the engine ends the old play and
// reports the new one's start, which is when the server shows and counts it. The lock screen's
// Next does the same move on the iPhone; the app's own Next, when the prepared song is the next
// one, asks the output to move (`advance`) rather than load. A prepared song that's no longer what
// follows (the queue changed, Shuffle, Repeat) is let go, its play ended unheard.
//
// Loudness: each play's answer carries the song's and its album's level (`MusicPlay.level`), and
// the output is given a gain with each source (`levelGain`): track mode, or album mode when the
// queue is one album with Shuffle off, so an album keeps its own dynamics.
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

/**
 * The loudness every song is brought to: ReplayGain 2.0's reference, -18 LUFS
 * (https://wiki.hydrogenaud.io/index.php?title=ReplayGain_2.0_specification, "Reference level"),
 * which players that honour ReplayGain's tags play at.
 */
export const TARGET_LUFS = -18

/** Track mode, or album mode: the album's one gain for each of its songs. */
export type GainMode = 'track' | 'album'

/**
 * The gain that brings a song to TARGET_LUFS, as a linear factor: from the album's level in album
 * mode (the track's when the album has none yet), never more than takes its peak to full scale,
 * so it never clips; 1 for a song not yet measured, which plays at its own level.
 */
export function levelGain(level: MusicPlay['level'] | undefined, mode: GainMode): number {
  const l = (mode === 'album' ? (level?.album ?? level?.track) : level?.track) ?? null
  if (!l || !Number.isFinite(l.lufs) || !Number.isFinite(l.peak)) return 1
  const gain = 10 ** ((TARGET_LUFS - l.lufs) / 20)
  const headroom = 10 ** (-l.peak / 20)
  return Math.min(gain, headroom)
}

/** Album mode when the queue is one album, in its order: Shuffle off and every song from it. */
export function gainMode<S extends PlayerSong>(s: {
  queue: readonly QueueEntry<S>[]
  shuffle: boolean
}): GainMode {
  const first = s.queue[0]
  return first && !s.shuffle && s.queue.every((e) => e.album.id === first.album.id)
    ? 'album'
    : 'track'
}

/** The song that plays after the one at `index` ends: the store's `ended` rule. */
export function followerOf<S extends PlayerSong>(s: {
  queue: readonly QueueEntry<S>[]
  index: number
  repeat: 'off' | 'all' | 'one'
}): QueueEntry<S> | null {
  if (s.repeat === 'one') return s.queue[s.index] ?? null
  if (s.index + 1 < s.queue.length) return s.queue[s.index + 1] ?? null
  return s.repeat === 'all' ? (s.queue[0] ?? null) : null
}

/** What the output says happened: its clock, its own play and pause, the song's end, a failure. */
export type AudioOutputEvent =
  | { type: 'time'; position: number }
  | { type: 'playing'; playing: boolean }
  /** The song ended with nothing prepared after it. */
  | { type: 'ended' }
  /**
   * The output moved on to the prepared source by itself: the song's end, with no gap, or the
   * lock screen's Next. Its clock is the new song's from here.
   */
  | { type: 'advanced' }
  | { type: 'error'; message: string }
  /** The lock screen's or a media key's Next and Previous, where the platform gives them. */
  | { type: 'next' }
  | { type: 'previous' }

/** A source the output plays: its address, what the lock screen shows, and its levelling gain. */
export type AudioSource = {
  url: string
  info: NowPlayingInfo
  /** A linear factor (`levelGain`) on top of the volume; the output never goes past full scale. */
  gain: number
}

/** The seam: one audio player the engine drives. expo-audio's in the app, a fake in the tests. */
export type AudioOutput = {
  /** A new source, paused at its start; anything prepared goes. */
  load(source: AudioSource): void
  /**
   * The source that follows the current one without a gap, opened ahead; null lets it go. The
   * output moves on to it at the current one's end (or the lock screen's Next) and says `advanced`.
   */
  prepare(source: AudioSource | null): void
  /** Moves on to the prepared source now, as at the end (the app's Next); no `advanced` is said. */
  advance(): void
  play(): void
  pause(): void
  seekTo(seconds: number): void
  /** The person's volume, 0 to 1, and muted; each source's gain goes on top. */
  setVolume(volume: number, muted: boolean): void
  /** Nothing to play: the source goes, and the lock screen's controls with it. */
  unload(): void
  subscribe(listener: (e: AudioOutputEvent) => void): () => void
}

/** The server's side, from the SDK in the app: the profile is the app's to name. */
export type MusicServer = {
  /** A play; `ahead` for the song prepared to follow, off Now playing until its first report. */
  play(trackId: string, options?: { ahead?: boolean }): Promise<MusicPlay>
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

/** The song asked for ahead to follow the current one. */
type Prepared = {
  key: string
  /** Null while the server's answer (and a transcode's first byte) is awaited. */
  play: MusicPlay | null
  /** The output has it. */
  given: boolean
}

/** A jump in the store's place bigger than this is a seek, not the clock. */
const SEEK_S = 1
/** The output's clock is held this far short of the song's end, so the end is the output's. */
const END_MARGIN_S = 0.05
/** A hand-over further than this from the song's end is the lock screen's Next, not the end. */
const SKIP_S = 2

/**
 * Drives `output` from the store and the server, and the store from the output, until the
 * returned function lets go (ending the play).
 */
export function createMusicAudio<S extends PlayerSong>(o: MusicAudioOptions<S>) {
  const { player, output, server } = o
  const every = o.setInterval ?? ((fn, ms) => setInterval(fn, ms))
  const stopEvery = o.clearInterval ?? ((id) => clearInterval(id as never))
  let current: Current | null = null
  let prepared: Prepared | null = null
  /** Bumped by each start and each let-go, so a slow answer to an older one is ended, not played. */
  let generation = 0
  /** The same for the prepared song. */
  let preparing = 0
  /** The engine's own writes to the store, reconciled once after. */
  let quiet = false
  let volume: [number, boolean] | null = null
  let released = false

  const song = () => {
    const s = player.get()
    return s.queue[s.index] ?? null
  }

  const source = (play: MusicPlay, s: S): AudioSource => ({
    url: play.url,
    info: o.info(s),
    gain: levelGain(play.level, gainMode(player.get())),
  })

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

  /** The prepared song goes: its play ends unheard, and the output lets go of it. */
  function dropPrepared(tellOutput = true) {
    const p = prepared
    preparing++
    prepared = null
    if (!p) return
    if (p.play) server.stop(p.play.id).catch(() => {})
    if (p.given && tellOutput) output.prepare(null)
  }

  /** The play ends: on the server unless it already has, and the output lets go of it. */
  function letGo(end = true) {
    const c = current
    generation++
    current = null
    dropPrepared(!c?.loaded)
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
    output.load(source(play, s))
    c.loaded = true
    // the output starts at 0; the store's place, if further, is a seek
    c.position = 0
    volume = null
    reconcile()
  }

  /** Asks for the song that follows ahead and hands it to the output, once it's ready. */
  async function prepare(next: QueueEntry<S>) {
    const gen = ++preparing
    const p: Prepared = { key: next.key, play: null, given: false }
    prepared = p
    try {
      const play = await server.play(next.id, { ahead: true })
      if (gen !== preparing) {
        server.stop(play.id).catch(() => {})
        return
      }
      p.play = play
      if (play.method === 'transcode') await server.ready(play.url)
    } catch {
      // not joined: it's asked for, as any song is, when it comes to play. The record stays, with
      // no play, so it isn't asked for again with each tick of the clock
      if (gen === preparing && p.play) {
        server.stop(p.play.id).catch(() => {})
        p.play = null
      }
      return
    }
    if (gen !== preparing || !current?.loaded) return
    output.prepare(source(p.play, next))
    p.given = true
  }

  /** The prepared song is the one playing now: the old play ends (and counts), the new starts. */
  function adopt() {
    const old = current
    const p = prepared
    if (!old || !p?.play) return
    if (old.play) server.stop(old.play.id).catch(() => {})
    generation++
    preparing++
    prepared = null
    current = {
      key: p.key,
      play: p.play,
      loaded: true,
      heard: false,
      playing: old.playing,
      position: 0,
    }
    // its first report is its start on the server: shown on Now playing, its time from now
    report(current)
    volume = null
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
    if (current && current.key !== want.key) {
      // the app's Next onto the prepared song: the output moves on, as at the end
      if (prepared?.given && prepared.key === want.key && current.loaded) {
        adopt()
        output.advance()
      } else letGo()
    }
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
    // what follows this song, asked for ahead; let go when it's no longer what follows
    const next = c.play ? followerOf(s) : null
    if (prepared && prepared.key !== next?.key) dropPrepared()
    if (next && !prepared) void prepare(next)
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
    } else if (e.type === 'advanced') {
      if (!prepared?.given) return
      // the end, with no gap; or the lock screen's Next, well before it
      const skipped = c.position < s.duration - SKIP_S
      adopt()
      quiet = true
      try {
        player.setPlaying(true)
        if (skipped) player.next()
        else player.ended()
      } finally {
        quiet = false
      }
      reconcile()
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
    /** The play asked for ahead to follow it, for tests. */
    preparedId: () => prepared?.play?.id ?? null,
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
