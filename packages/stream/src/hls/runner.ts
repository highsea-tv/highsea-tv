// SPDX-License-Identifier: AGPL-3.0-only
// HLS made on demand (ADR 0051): one folder per play session in the cache, and at most one ffmpeg
// per session, run as a child process (https://nodejs.org/api/child_process.html#child_processspawncommand-args-options),
// never in the server's thread.
//
// - **A run** starts at a segment's first piece and writes pieces in order (`args.ts`). A request
//   is answered from the pieces on disk, whichever run wrote them.
// - **Ahead:** a run that's `aheadSeconds` past the furthest segment asked for is paused with
//   SIGSTOP and continued with SIGCONT (POSIX job control, https://nodejs.org/api/process.html#processkillpid-signal),
//   so it makes a few segments ahead of the player and no more.
// - **Seeking:** a segment far past what the run has made, or before where it started, kills it
//   and starts another there.
// - **Idle:** a run nobody has asked anything of for `idleMs` is stopped; the next request starts
//   one where it's needed. Ending the session removes its folder; the runtime empties the cache on
//   boot.
// - **Failures:** a run that exits with an error keeps the last lines of its log, which the caller
//   logs, and the request gets `TranscodeError`.
// - **Transcodes at once** (4.3): a run that makes the picture again holds one of
//   `maxTranscodes` slots while it runs; a direct stream's copy costs little and doesn't count.
//   Past the limit a run waits for a slot, and gives up after `waitMs` with a `limit` error.
// - **The cache's limit** (4.3): checked as pieces are written. Past it, the pieces furthest
//   behind the players go first, keeping `keepBehindSeconds` behind each one, and never a piece
//   ffmpeg may still be writing. A piece asked for again is made again.
// - **Speed** (4.3, Now playing): ffmpeg writes `key=value` lines to `-progress pipe:1` every
//   `-stats_period` (https://ffmpeg.org/ffmpeg.html#Main-options). ffmpeg's own `speed=` counts
//   from the run's start, paused time and all, so the runner measures its own: the film's seconds
//   (`out_time_us`) made per second, over the last few reports while the run wasn't paused.
// - **Hardware** (4.3b, ADR 0056): each transcode run takes the GPU path `hardware()` names, and
//   tone maps where `toneMapOn` says. A run on a GPU that fails goes on on the processor from the
//   first piece it hadn't made, for the rest of the session, and `onHardwareFailure` lets the
//   runtime mark the path's check failed.
// - **Timings** (phase 5, A1's finding of 2026-11-17): where a start's time goes, a few lines a
//   play through `timings`: how long the segments took to work out, each ffmpeg's start with its
//   position (so a resume, and a player that asks from the film's start first, are visible), its
//   first segment being whole, and each subtitle's conversion.
// - **Subtitles in step** (HT-49): each run also writes the film's own text subtitles as WebVTT,
//   an output each, from the same read (`runArgs`), and a subtitle segment is cut from what the
//   runs have read (`webvtt.ts`) once they've read past it. A run that starts past the beginning
//   reads the few seconds before its start for the cues showing there, once its first segment is
//   out (`leadInArgs`). A subtitle never starts, moves or holds up a run: it waits for the
//   picture's.

import { type ChildProcess, execFile, spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { setPriority } from 'node:os'
import { join } from 'node:path'
import { endWithProcess } from '@highsea-tv/core/children'
import { unref } from '@highsea-tv/core/timers'
import type { PlaybackDecision } from '../decision/index.ts'
import { type Accel, type AccelPath, toneMapOn } from '../hardware/index.ts'
import {
  assArgs,
  attachmentArgs,
  type BurnIn,
  type EncoderPreset,
  fromFilmStart,
  INIT_NAME,
  indexProbeArgs,
  keyframeArgs,
  LEAD_IN_SECONDS,
  leadInArgs,
  parseFonts,
  parseIndexProbe,
  parseKeyframes,
  parseWindow,
  pieceName,
  type RunInput,
  runArgs,
  type SubtitleOutput,
  subtitleArgs,
  subtitlesArgs,
  windowArgs,
} from './args.ts'
import {
  agrees,
  fileReader,
  matroskaKeyframes,
  mp4Keyframes,
  NoIndex,
  windows,
} from './keyframe-index.ts'
import {
  gridSegments,
  keyframeSegments,
  pieceStarts,
  SEGMENT_SECONDS,
  type Segment,
  segmentAt,
} from './playlist.ts'
import { type CueBlock, covers, cueBlocks, type Span, webvttSegment } from './webvtt.ts'

/** How far a run makes segments past the furthest asked for, before it's paused. */
export const AHEAD_SECONDS = 30
/** A segment more than this past what the run has made starts a new run there. */
export const FAR_SECONDS = 18
/** A run nobody has asked anything of for this long is stopped. */
export const RUN_IDLE_MS = 60_000
/** How long a transcode waits for a slot before it gives up (4.3's answer 7). */
export const SLOT_WAIT_MS = 60_000
/** Pieces this close behind a player are kept past the cache's limit: it may seek back to them. */
export const KEEP_BEHIND_SECONDS = 60
/** A session's folder: its id, a UUID (`crypto.randomUUID()`). */
const SESSION_FOLDER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** The cache's limit is checked at most this often. */
const ENFORCE_MS = 2_000
/** How often a run's folder is looked at for new pieces. */
const POLL_MS = 100
/** The reports a run's speed is measured over: a few seconds, at one a second. */
const SPEED_SAMPLES = 5
/** The lines of a run's log kept for System › Logs when it fails. */
const LOG_LINES = 20

/** The initialization section highsea serves: the first run's, copied once, never rewritten. */
const HEADER = 'header.mp4'
/** How long a subtitle segment waits for the runs to read past it before it's answered later. */
export const SUBTITLE_WAIT_MS = 60_000

/** A subtitle segment the runs haven't read yet: the player asks again (HT-49). */
export class NotReadYet extends Error {
  constructor() {
    super('That part of the film hasn’t been read yet.')
    this.name = 'NotReadYet'
  }
}

export class TranscodeError extends Error {
  /** The last lines ffmpeg wrote, for the log. */
  readonly log: string[]
  /** `limit`: it waited for a slot and none came free. */
  readonly reason: 'limit' | null
  constructor(message: string, log: string[] = [], reason: 'limit' | null = null) {
    super(message)
    this.name = 'TranscodeError'
    this.log = log
    this.reason = reason
  }
}

export type HlsSource = {
  /** The film's absolute path. */
  input: string
  /** Seconds. */
  duration: number
  decision: PlaybackDecision
  /**
   * `hdr` is the probe's HDR format, for where it's tone mapped (`toneMapOn`); `bitDepth` the
   * picture's, which a GPU's frames come down to memory in.
   */
  video: {
    index: number
    codec: string
    width: number
    height: number
    hdr?: string
    bitDepth?: number
  } | null
  /** Where the player starts, in seconds: the first run starts there. */
  start: number
  /** The picture's keyframes, seconds from the film's start; a direct stream's segments need them. */
  keyframes: () => Promise<number[]>
  /** The sound track's own channels and layout, for the downmix to stereo. */
  audio?: { channels: number; layout: string | null } | null
  /**
   * A subtitle the decision burns in (4.3): a picture track of the film's, or ASS, the film's own
   * stream by index or a sidecar file.
   */
  burnIn?:
    | { kind: 'picture'; index: number }
    | { kind: 'text'; input: string; index: number | null }
    | null
  /** The film's own text subtitles, by stream index: each run writes them as WebVTT (HT-49). */
  subtitles?: number[]
}

type Run = {
  child: ChildProcess
  /** Its first piece. */
  first: number
  /** The first piece it hasn't written yet, as far as the folder shows. */
  next: number
  paused: boolean
  /** Killed by highsea: its exit isn't a failure. */
  stopped: boolean
  exited: boolean
  log: string[]
  /** Its last progress reports since it last paused or continued: when, and the film's time. */
  samples: { at: number; out: number }[]
  /** Film seconds made per second, as last measured; null until measured. */
  speed: number | null
  /** The GPU path it runs on; null on the processor. */
  accel: Accel | null
  /** When it was spawned, and the last piece of its first segment: for the timings. */
  spawnedAt: number
  firstEnd: number
  /** Its first segment's timing line is written. */
  timed: boolean
  /** It reached the film's end. */
  done: boolean
}

type Waiter = {
  piece: number
  resolve: () => void
  reject: (e: Error) => void
  /** Waiting for the initialization section, which any run writes with its first piece. */
  init?: boolean
}

/** What a run, or a read before one's start, has read of the subtitles: its span, its files. */
type SubtitleRead = { from: number; to: () => number; files: Map<number, string> }

type SubtitleWaiter = Span & {
  resolve: () => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type Spawn = (command: string, args: string[]) => ChildProcess
export type RunLogger = {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export type TranscodesOptions = {
  /** The cache: the data folder's `transcodes/`. */
  root: string
  ffmpeg: string
  ffprobe: string
  logger: RunLogger
  now?: () => number
  spawn?: Spawn
  aheadSeconds?: number
  farSeconds?: number
  idleMs?: number
  /** Settings › Playback's limits and encoder, read as each run starts. */
  limits?: () => Limits
  waitMs?: number
  keepBehindSeconds?: number
  /** The GPU path transcodes take, and tone mapping (4.3b), read as each run starts. */
  hardware?: () => Hardware
  /** A run on a GPU path failed, and went on on the processor. */
  onHardwareFailure?: (path: AccelPath, log: string[]) => void
  /** Where a start's time went, a few lines a play; nothing when left out. */
  timings?: Timings
}

export type Timings = (message: string, data: Record<string, unknown>) => void

export type Hardware = {
  /** The path whose check passed and Settings › Playback allows; null for the processor. */
  accel: Accel | null
  /** Settings › Playback's tone mapping. */
  toneMapping: boolean
  /** The processor can tone map: this ffmpeg has `zscale` and `tonemap`. */
  cpuToneMap: boolean
}

const NO_HARDWARE: Hardware = { accel: null, toneMapping: false, cpuToneMap: false }

export type Limits = {
  maxTranscodes: number
  /** The cache's limit in bytes; null for none. */
  cacheBytes: number | null
  preset: EncoderPreset
}

const NO_LIMITS: Limits = {
  maxTranscodes: Number.POSITIVE_INFINITY,
  cacheBytes: null,
  preset: 'balanced',
}

/** The slots transcodes hold while they run; more wait, first come first served. */
function createSlots(limit: () => number, waitMs: number) {
  const holders = new Set<string>()
  const queue: {
    id: string
    resolve: () => void
    reject: (e: Error) => void
    timer: ReturnType<typeof setTimeout>
  }[] = []
  const pending = new Map<string, Promise<void>>()

  function pump() {
    while (queue.length && holders.size < limit()) {
      const next = queue.shift() as (typeof queue)[number]
      clearTimeout(next.timer)
      holders.add(next.id)
      pending.delete(next.id)
      next.resolve()
    }
  }

  return {
    acquire(id: string): Promise<void> {
      if (holders.has(id)) return Promise.resolve()
      const waiting = pending.get(id)
      if (waiting) return waiting
      if (holders.size < limit()) {
        holders.add(id)
        return Promise.resolve()
      }
      const p = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = queue.findIndex((q) => q.id === id)
          if (i >= 0) queue.splice(i, 1)
          pending.delete(id)
          reject(
            new TranscodeError(
              `highsea is already transcoding ${limit()} at once, its limit.`,
              [],
              'limit',
            ),
          )
        }, waitMs)
        unref(timer)
        queue.push({ id, resolve, reject, timer })
      })
      pending.set(id, p)
      return p
    },
    release(id: string) {
      holders.delete(id)
      const i = queue.findIndex((q) => q.id === id)
      if (i >= 0) {
        const [q] = queue.splice(i, 1)
        clearTimeout(q?.timer)
        pending.delete(id)
        q?.reject(new TranscodeError('The stream has ended.'))
      }
      pump()
    },
    /** A limit raised in Settings lets waiting runs start. */
    pump,
    waiting: (id: string) => queue.some((q) => q.id === id),
    holding: (id: string) => holders.has(id),
    count: () => holders.size,
  }
}

type Slots = ReturnType<typeof createSlots>

/** Every file under a folder and its size; nothing when it's gone. */
async function filesIn(dir: string): Promise<{ name: string; size: number }[]> {
  const names = await readdir(dir).catch(() => [] as string[])
  const sized = await Promise.all(
    names.map(async (name) => {
      const s = await stat(join(dir, name)).catch(() => null)
      return s?.isFile() ? { name, size: s.size } : null
    }),
  )
  return sized.filter((f) => f !== null)
}

const defaultSpawn: Spawn = (command, args) =>
  nodeSpawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

const signal = (child: ChildProcess, name: NodeJS.Signals) => {
  try {
    return child.kill(name)
  } catch {
    return false
  }
}

/**
 * A read made ahead of a play, in the background: at the lowest priority, as trickplay's is
 * (`nice` 19; https://nodejs.org/api/os.html#ossetprioritypid-priority), and stopped by `signal`.
 */
export type Background = { low?: boolean; signal?: AbortSignal }

const exec = (command: string, args: string[], timeoutMs: number, background: Background = {}) =>
  new Promise<string>((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 256 * 1024 * 1024,
        windowsHide: true,
        signal: background.signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          const lines = String(stderr).trim().split('\n').slice(-LOG_LINES)
          reject(new TranscodeError(error.message.split('\n')[0] ?? 'ffmpeg failed', lines))
        } else resolve(String(stdout))
      },
    )
    if (background.low && child.pid)
      try {
        setPriority(child.pid, 19)
      } catch {
        // a platform without priorities still reads it
      }
  })

/** A film's keyframes, and whether they came from its index or from every packet, and why. */
export type Keyframes = { times: number[]; from: 'index' | 'packets'; why?: string }

/**
 * Reads a film's keyframes: from the container's index where it has one that agrees with the
 * film's own packets (`keyframe-index.ts`), a few megabytes; else with ffprobe from every packet
 * of the picture, without decoding (`keyframeArgs`), which reads the whole file: seconds from an
 * SSD, minutes for a large film on spinning disks. The runtime does it after the import, ahead of
 * the first play.
 */
export async function readKeyframesFrom(
  ffprobe: string,
  input: string,
  index: number,
  background?: Background,
): Promise<Keyframes> {
  let why: string
  try {
    return { times: await fromIndex(ffprobe, input, index, background), from: 'index' }
  } catch (e) {
    if (background?.signal?.aborted) throw e
    why = (e as Error).message
  }
  const output = await exec(ffprobe, keyframeArgs(input, index), 60 * 60_000, background)
  return { times: parseKeyframes(output), from: 'packets', why }
}

/** `readKeyframesFrom`'s times alone. */
export async function readKeyframes(
  ffprobe: string,
  input: string,
  index: number,
  background?: Background,
) {
  return (await readKeyframesFrom(ffprobe, input, index, background)).times
}

/**
 * The keyframes from the film's index, checked against ffprobe's packets at its start, its middle
 * and its end (`windows`, `agrees`); throws when there's no index or it disagrees.
 */
async function fromIndex(ffprobe: string, input: string, index: number, background?: Background) {
  const probe = parseIndexProbe(
    await exec(ffprobe, indexProbeArgs(input), 2 * 60_000, background),
    index,
  )
  if (!probe?.container) throw new NoIndex('Only Matroska and MP4 indexes are read.')
  const reader = await fileReader(input)
  let keys: number[]
  try {
    keys =
      probe.container === 'matroska'
        ? await matroskaKeyframes(reader, probe.nth)
        : await mp4Keyframes(reader, probe.id, probe.nth)
  } finally {
    await reader.close()
  }
  keys = [...new Set(keys)].sort((a, b) => a - b)
  const checks = windows(keys)
  if (!checks) throw new NoIndex('The index has too few keyframes to check.')
  for (const w of checks) {
    const seen = parseWindow(
      await exec(ffprobe, windowArgs(input, index, w.interval), 10 * 60_000, background),
    )
    if (!agrees(keys, seen, w.edge))
      throw new NoIndex(`The index disagrees with the film’s packets at its ${w.edge}.`)
  }
  return fromFilmStart(keys, probe.start)
}

/**
 * A film's text subtitles as WebVTT, all in one pass over the file (`subtitlesArgs`), each written
 * beside its place and moved in when whole, so a file that's there is complete.
 */
export async function convertSubtitles(
  ffmpeg: string,
  input: string,
  tracks: { index: number; output: string }[],
  background?: Background,
) {
  if (!tracks.length) return
  const parts = tracks.map((t) => ({ index: t.index, output: `${t.output}.part` }))
  try {
    await exec(ffmpeg, subtitlesArgs(input, parts), 60 * 60_000, background)
    await Promise.all(tracks.map((t) => rename(`${t.output}.part`, t.output)))
  } finally {
    await Promise.all(parts.map((p) => rm(p.output, { force: true })))
  }
}

type Context = {
  options: TranscodesOptions
  now: () => number
  spawn: Spawn
  ahead: number
  far: number
  idleMs: number
  log: RunLogger
  root: string
  limits: () => Limits
  hardware: () => Hardware
  slots: Slots
  /** A piece was written: the cache's limit is checked soon. */
  grew: () => void
}

function createTranscode(id: string, source: HlsSource, ctx: Context) {
  const { options, now, spawn, ahead, far, idleMs, log, slots } = ctx
  const timings: Timings = options.timings ?? (() => {})
  const opened = now()
  /** How long the segments took to work out: a direct stream's wait for its keyframes. */
  let playlistMs: number | null = null
  /** The ffmpeg runs started so far. */
  let runs = 0
  // a session keeps the folder it started in, if Settings moves the cache meanwhile
  const dir = join(ctx.root, id)
  const copy = source.decision.video?.action !== 'transcode'
  /** A run that makes the picture again holds a slot; a copy doesn't. */
  const counts = !copy && !!source.video
  /** Each start's number: a start that waited for a slot while a later one came gives way. */
  let generation = 0
  const { decision } = source
  let run: Run | null = null
  let waiters: Waiter[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  /** The furthest segment asked for lately: what `ahead` counts from. */
  let asked = 0
  let heardAt = now()
  let ended = false
  let failure: TranscodeError | null = null
  /** A run on the GPU failed: the rest of the session runs on the processor. */
  let fellBack = false
  /** The GPU path the last run took, kept after it reaches the film's end. */
  let made: AccelPath | null = null
  const subtitles = new Map<string, Promise<string>>()
  /** The film's own text subtitles, which each run writes; what they've read, and who waits. */
  const tracks = source.subtitles ?? []
  const reads: SubtitleRead[] = []
  let subtitleWaiters: SubtitleWaiter[] = []
  /** The reads before a run's start, numbered for their files, and stopped with the session. */
  let leadIns = 0
  const reading = new AbortController()

  /**
   * The segments, and when each piece starts: a direct stream's keyframes, a transcode's grid.
   * Worked out when first needed, so a session that only converts subtitles never reads keyframes.
   */
  let prepared: Promise<{ segments: Segment[]; times: number[] }> | null = null
  const ready = () =>
    (prepared ??= (async () => {
      await mkdir(tracks.length ? join(dir, 'subs') : dir, { recursive: true })
      if (copy && source.video) {
        const keyframes = await source.keyframes()
        playlistMs = now() - opened
        return {
          // shorter where this session starts, so its first frame waits for less (`playlist.ts`)
          segments: keyframeSegments(keyframes, source.duration, SEGMENT_SECONDS, source.start),
          times: pieceStarts(keyframes),
        }
      }
      const segments = gridSegments(source.duration)
      playlistMs = now() - opened
      return { segments, times: segments.map((s) => s.start) }
    })())

  /**
   * The subtitle to burn in, as runs take it: the film's ASS taken out once, with its fonts, when
   * the first run starts, so the playlists don't wait for it.
   */
  let burnt: Promise<BurnIn | null> | null = null
  const burnIn = () => (burnt ??= burning())
  async function burning(): Promise<BurnIn | null> {
    const b = source.burnIn
    if (!b) return null
    if (b.kind === 'picture') return b
    if (b.index === null) return { kind: 'text', path: b.input, fontsDir: null }
    const fontsDir = join(dir, 'fonts')
    await mkdir(fontsDir, { recursive: true })
    const fonts = parseFonts(await exec(options.ffprobe, attachmentArgs(b.input), 60_000)).map(
      (index, n) => ({ index, path: join(fontsDir, `${n}.font`) }),
    )
    const path = join(dir, 'burn.ass')
    await exec(options.ffmpeg, assArgs(b.input, b.index, path, fonts), 10 * 60_000)
    return { kind: 'text', path, fontsDir: fonts.length ? fontsDir : null }
  }

  const has = (piece: number) => existsSync(join(dir, pieceName(piece)))

  // The header is ffmpeg's init.mp4, copied once its first piece is out. A copy isn't atomic:
  // libuv's copy (uv__fs_copyfile in src/unix/fs.c, behind Node's fs.copyFile) opens the
  // destination with O_CREAT and only then writes the bytes, so a header copied in place exists
  // empty or half written for a moment. init() once found it so, between the first piece's
  // arrival and the end of its copy, and the player was sent a header of fewer bytes than the
  // film's, which AVPlayer refuses as `fmt?`, a format it doesn't know (HT-64, ADR 0051). So the copy goes
  // to a file of its own and is renamed into place, which is atomic (rename(2), POSIX): header.mp4
  // exists only whole. Callers share the one copy in flight.
  let headerCopy: Promise<void> | null = null
  function copyHeader(): Promise<void> {
    if (headerCopy) return headerCopy
    const part = join(dir, `${HEADER}.part`)
    const copy = copyFile(join(dir, INIT_NAME), part)
      .then(() => rename(part, join(dir, HEADER)))
      .finally(() => {
        if (headerCopy === copy) headerCopy = null
      })
    headerCopy = copy
    return copy
  }

  function settle() {
    if (!run) return
    const was = run.next
    while (has(run.next)) run.next++
    if (run.next > was) ctx.grew()
    if (!run.timed && run.next >= run.firstEnd) {
      run.timed = true
      timings('first segment ready', {
        session: id,
        run: runs,
        piece: run.first,
        ffmpegMs: now() - run.spawnedAt,
        playlistMs,
        sinceOpenMs: now() - opened,
      })
      // the cues already showing where it starts, once the picture's first segment is out
      const first = run.first
      void ready().then(({ times }) => leadIn(times[first] ?? 0))
    }
    wakeSubtitles()
    const done = waiters.filter((w) => has(w.piece))
    waiters = waiters.filter((w) => !done.includes(w))
    for (const w of done) w.resolve()
    void throttle()
    if (!existsSync(join(dir, HEADER)) && existsSync(join(dir, INIT_NAME)) && has(run.first))
      void copyHeader().catch(() => {})
    if (now() - heardAt >= idleMs) stop('idle')
  }

  async function throttle() {
    const r = run
    if (!r || r.exited) return
    const { segments, times } = await ready()
    const end = (segments[asked]?.start ?? 0) + (segments[asked]?.duration ?? 0)
    const madeTo = times[r.next] ?? Number.POSITIVE_INFINITY
    const pause = madeTo - end > ahead && waiters.length === 0
    if (pause && !r.paused) r.paused = signal(r.child, 'SIGSTOP')
    else if (!pause && r.paused) r.paused = !signal(r.child, 'SIGCONT')
    else return
    // a pause isn't slowness: the speed is measured again once it runs
    r.samples = []
  }

  function stop(why: 'idle' | 'seek' | 'ended') {
    const r = run
    if (!r) return
    run = null
    r.stopped = true
    if (r.paused) signal(r.child, 'SIGCONT')
    signal(r.child, 'SIGKILL')
    if (timer) clearInterval(timer)
    timer = null
    if (why !== 'seek') {
      if (counts) slots.release(id)
      for (const w of waiters.splice(0)) w.reject(new TranscodeError('The stream stopped.'))
    }
  }

  async function start(segment: number) {
    const { segments, times } = await ready()
    const s = segments[segment]
    if (!s || ended) return
    const mine = ++generation
    let burn: BurnIn | null = null
    if (!copy) {
      try {
        burn = await burnIn()
      } catch (e) {
        if (mine !== generation || ended) return
        failure = new TranscodeError(
          'The subtitle couldn’t be drawn into the picture.',
          (e as TranscodeError).log ?? [],
        )
        log.warn('a subtitle to burn in couldn’t be read', {
          session: id,
          error: (e as Error).message,
        })
        for (const w of waiters.splice(0)) w.reject(failure)
        throw failure
      }
      if (mine !== generation || ended) return
    }
    if (counts) {
      try {
        await slots.acquire(id)
      } catch (e) {
        if (mine !== generation || ended) return
        failure = e as TranscodeError
        log.warn('a transcode waited for a slot and gave up', { session: id })
        for (const w of waiters.splice(0)) w.reject(failure)
        throw failure
      }
      // a later start took over while this one waited, or the session ended
      if (mine !== generation) return
      if (ended) return slots.release(id)
    }
    stop('seek')
    // what the stopped run was making before this one's start won't come now; the init will, with
    // this run's first piece
    for (const w of waiters.filter((w) => w.piece < s.first)) {
      if (w.init) w.piece = s.first
      else w.reject(new TranscodeError('The stream moved on.'))
    }
    waiters = waiters.filter((w) => w.piece >= s.first)
    const plan = decision.video
    const hw = ctx.hardware()
    let accel = plan?.action === 'transcode' && source.video && !fellBack ? hw.accel : null
    let toneMap: RunInput['toneMap'] = null
    if (plan?.action === 'transcode' && plan.toSdr && hw.toneMapping) {
      toneMap = toneMapOn(source.video?.hdr ?? 'none', accel, hw.cpuToneMap)
      // a GPU that can't tone map this film leaves it to the processor altogether
      if (toneMap === 'cpu') accel = null
    }
    const at = times[s.first] ?? s.start
    const files = new Map(
      tracks.map((index) => [index, join(dir, 'subs', `run-${runs + 1}-${index}.vtt`)]),
    )
    const input: RunInput = {
      input: source.input,
      dir,
      start: at,
      startNumber: s.first,
      nextStart: times[s.first + 1] ?? source.duration,
      video: source.video && decision.video ? { ...source.video, plan: decision.video } : null,
      audio: decision.audio
        ? {
            index: decision.audio.index,
            plan: decision.audio,
            channels: source.audio?.channels,
            layout: source.audio?.layout,
          }
        : null,
      preset: ctx.limits().preset,
      burnIn: burn,
      accel,
      toneMap,
      subtitles: [...files].map(([index, output]): SubtitleOutput => ({ index, output })),
    }
    // killed if this process ends first: a paused run would otherwise outlive it, stopped
    const child = endWithProcess(spawn(options.ffmpeg, runArgs(input)))
    const r: Run = {
      child,
      first: s.first,
      next: s.first,
      paused: false,
      stopped: false,
      exited: false,
      log: [],
      samples: [],
      speed: null,
      accel,
      spawnedAt: now(),
      firstEnd: s.last,
      timed: false,
      done: false,
    }
    run = r
    runs++
    // read up to the start of its last whole piece: by then ffmpeg has read every cue before it,
    // since a file's blocks come in time order, and written it, a cue at a time; all of it once
    // the run has reached the film's end
    if (files.size)
      reads.push({
        from: at,
        to: () => (r.done ? source.duration : (times[Math.max(r.first, r.next - 1)] ?? at)),
        files,
      })
    timings('ffmpeg started', {
      session: id,
      run: runs,
      method: decision.method,
      // where in the film it starts: past 0 on the first run is a resume
      start: input.start,
      piece: s.first,
      sinceOpenMs: now() - opened,
    })
    made = accel?.path ?? null
    failure = null
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      r.log.push(...chunk.split('\n').filter((l) => l.trim()))
      if (r.log.length > LOG_LINES) r.log.splice(0, r.log.length - LOG_LINES)
    })
    let partial = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      const lines = (partial + chunk).split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) {
        const out = /^out_time_us=(\d+)$/.exec(line.trim())
        if (out) measure(r, Number(out[1]) / 1e6)
      }
    })
    child.on('error', (e) => finish(r, null, e))
    child.on('exit', (code) => finish(r, code))
    timer ??= setInterval(settle, POLL_MS)
    unref(timer)
  }

  /** A progress report: the run's speed over its last few, while it wasn't paused. */
  function measure(r: Run, out: number) {
    if (r.paused) return
    r.samples.push({ at: now(), out })
    if (r.samples.length > SPEED_SAMPLES) r.samples.shift()
    const first = r.samples[0]
    const last = r.samples[r.samples.length - 1]
    if (first && last && last.at > first.at)
      r.speed = (last.out - first.out) / ((last.at - first.at) / 1000)
  }

  function finish(r: Run, code: number | null, error?: Error) {
    if (r.exited) return
    r.exited = true
    if (run === r) settle()
    if (r.stopped || run !== r) return
    run = null
    if (timer) clearInterval(timer)
    timer = null
    if (counts) slots.release(id)
    if (code === 0 && !error) {
      r.done = true
      wakeSubtitles()
      // the film's end: anything still waited for isn't coming
      for (const w of waiters.splice(0))
        has(w.piece) ? w.resolve() : w.reject(new TranscodeError('That segment isn’t there.'))
      return
    }
    if (r.accel && !ended) {
      // the GPU failed: the processor makes the rest, from the first piece this run hadn't made,
      // and what's waited for is made there
      fellBack = true
      log.warn('a transcode on the GPU failed, and goes on on the processor', {
        session: id,
        path: r.accel.path,
        code,
        log: r.log.join('\n'),
      })
      options.onHardwareFailure?.(r.accel.path, r.log)
      void ready()
        .then(({ segments }) => {
          const at = segments.findIndex((s) => s.first <= r.next && r.next < s.last)
          if (at >= 0) return start(at)
          for (const w of waiters.splice(0))
            has(w.piece) ? w.resolve() : w.reject(new TranscodeError('That segment isn’t there.'))
        })
        .catch(() => {})
      return
    }
    failure = new TranscodeError(
      error ? `ffmpeg didn’t start: ${error.message}` : `ffmpeg stopped with code ${code}`,
      r.log,
    )
    log.error('a stream’s ffmpeg failed', {
      session: id,
      method: decision.method,
      code,
      log: r.log.join('\n'),
    })
    for (const w of waiters.splice(0)) w.reject(failure)
  }

  const wait = (piece: number) =>
    has(piece)
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          waiters.push({ piece, resolve, reject })
        })

  /** The pieces of segment `i`, made if they aren't yet, in order. */
  async function segment(i: number): Promise<string[]> {
    if (ended) throw new TranscodeError('The stream has ended.')
    heardAt = now()
    const { segments, times } = await ready()
    const s = segments[i]
    if (!s) throw new TranscodeError('That segment isn’t there.')
    asked = i
    const missing = [...Array(s.last - s.first).keys()]
      .map((k) => s.first + k)
      .filter((p) => !has(p))
    if (missing.length) {
      const r = run
      const first = missing[0] as number
      const madeTo = r ? (times[r.next] ?? Number.POSITIVE_INFINITY) : 0
      // a piece the run made that's missing now went to the cache's limit: it's made again
      const near =
        r && !r.exited && r.first <= first && first >= r.next && (times[first] ?? 0) - madeTo <= far
      if (!near) {
        if (failure && run === null && i === lastFailed) throw failure
        lastFailed = i
        await start(i)
      }
      void throttle()
      for (const p of missing) await wait(p)
    }
    void throttle()
    return [...Array(s.last - s.first).keys()].map((k) => join(dir, pieceName(s.first + k)))
  }
  let lastFailed = -1

  /** The initialization section, once a run has written it. */
  async function init(): Promise<string> {
    heardAt = now()
    const header = join(dir, HEADER)
    if (headerCopy) await headerCopy.catch(() => {})
    if (existsSync(header)) return header
    const { segments } = await ready()
    if (!run) await start(segmentAt(segments, source.start))
    const r = run as Run | null
    if (!r) throw new TranscodeError('The stream has ended.')
    if (!has(r.first))
      await new Promise<void>((resolve, reject) => {
        waiters.push({ piece: r.first, resolve, reject, init: true })
      })
    // the copy settle() started as the piece came, or one of this call's own
    if (!existsSync(header)) await copyHeader()
    return header
  }

  /**
   * A text subtitle as WebVTT, converted once and kept in the session's folder: the film's own
   * stream by index, or a sidecar file.
   */
  function subtitle(key: string, input: string, index: number | null): Promise<string> {
    heardAt = now()
    const existing = subtitles.get(key)
    if (existing) return existing
    const out = join(dir, `sub-${key.replace(/[^\w-]/g, '_')}.vtt`)
    const made = (async () => {
      const from = now()
      await mkdir(dir, { recursive: true })
      await exec(options.ffmpeg, subtitleArgs(input, index, out), 10 * 60_000)
      timings('subtitle converted', { session: id, track: key, ms: now() - from })
      return out
    })()
    made.catch((e: TranscodeError) => {
      subtitles.delete(key)
      log.warn('a subtitle couldn’t be converted', {
        session: id,
        error: e.message,
        log: e.log?.join('\n'),
      })
    })
    subtitles.set(key, made)
    return made
  }

  /** The spans the runs, and the reads before their starts, have read of the subtitles. */
  const spans = (): Span[] => reads.map((r) => ({ from: r.from, to: r.to() }))

  /** Subtitle segments waited for that the reads now cover. */
  function wakeSubtitles() {
    if (!subtitleWaiters.length) return
    const read = spans()
    const done = subtitleWaiters.filter((w) => covers(read, w.from, w.to))
    subtitleWaiters = subtitleWaiters.filter((w) => !done.includes(w))
    for (const w of done) {
      clearTimeout(w.timer)
      w.resolve()
    }
  }

  /**
   * The `LEAD_IN_SECONDS` before a run's start, read for the cues showing there (`leadInArgs`),
   * unless an earlier read has them. Its own small read, after the run's first segment, so the
   * picture never waits for it; a failure leaves those seconds read with no cues, logged.
   */
  function leadIn(at: number) {
    const from = Math.max(0, at - LEAD_IN_SECONDS)
    if (!tracks.length || ended || at <= 0 || covers(spans(), from, at)) return
    const n = ++leadIns
    const files = new Map(
      tracks.map((index) => [index, join(dir, 'subs', `lead-${n}-${index}.vtt`)]),
    )
    const began = now()
    const outputs = [...files].map(([index, output]) => ({ index, output }))
    exec(options.ffmpeg, leadInArgs(source.input, from, at, outputs), 2 * 60_000, {
      signal: reading.signal,
    })
      .then(() => {
        reads.push({ from, to: () => at, files })
        timings('subtitles before the start read', { session: id, from, ms: now() - began })
      })
      .catch((e: TranscodeError) => {
        if (ended) return
        reads.push({ from, to: () => at, files: new Map() })
        log.warn('the subtitles before a start couldn’t be read', {
          session: id,
          error: e.message,
          log: e.log?.join('\n'),
        })
      })
      .finally(wakeSubtitles)
  }

  /** A WebVTT file's cues; none while it's not there. */
  const cuesIn = async (path: string | undefined): Promise<CueBlock[]> =>
    path ? cueBlocks(await readFile(path, 'utf8').catch(() => '')) : []

  /**
   * Segment `i` of the film's own subtitle at stream `index`, as WebVTT (`webvtt.ts`): every cue
   * showing in the picture's segment `i`. It waits for the runs to have read from
   * `LEAD_IN_SECONDS` before the segment, where a cue showing in it may have begun, to its end;
   * after `SUBTITLE_WAIT_MS` it throws `NotReadYet`. It never starts a run.
   */
  async function subtitleSegment(index: number, i: number): Promise<string> {
    if (ended) throw new TranscodeError('The stream has ended.')
    if (!tracks.includes(index)) throw new TranscodeError('That subtitle isn’t there.')
    const { segments } = await ready()
    if (ended) throw new TranscodeError('The stream has ended.')
    const s = segments[i]
    if (!s) throw new TranscodeError('That segment isn’t there.')
    const end = Math.min(source.duration, s.start + s.duration)
    const from = Math.max(0, s.start - LEAD_IN_SECONDS)
    if (!covers(spans(), from, end))
      await new Promise<void>((resolve, reject) => {
        const w: SubtitleWaiter = {
          from,
          to: end,
          resolve,
          reject,
          timer: setTimeout(() => {
            subtitleWaiters = subtitleWaiters.filter((x) => x !== w)
            reject(new NotReadYet())
          }, SUBTITLE_WAIT_MS),
        }
        unref(w.timer)
        subtitleWaiters.push(w)
      })
    const read = reads.filter((r) => r.from < end && r.to() > from)
    const cues = await Promise.all(read.map((r) => cuesIn(r.files.get(index))))
    return webvttSegment(cues.flat(), s.start, end)
  }

  /** Stops its ffmpeg and removes its folder. */
  async function end() {
    ended = true
    reading.abort()
    for (const w of subtitleWaiters.splice(0)) {
      clearTimeout(w.timer)
      w.reject(new TranscodeError('The stream has ended.'))
    }
    stop('ended')
    if (counts) slots.release(id)
    await rm(dir, { recursive: true, force: true })
  }

  /**
   * The pieces the cache may remove, with how far behind the player each is: whole ones the run
   * has passed (ffmpeg writes under `.tmp`, so a piece that exists is whole), and every one when
   * nothing runs. `keep` seconds behind the player are left out; the header never is a piece.
   */
  async function removable(keep: number) {
    const { segments, times } = await ready()
    const playhead = segments[asked]?.start ?? 0
    const r = run
    const files = await filesIn(dir)
    return files.flatMap((f) => {
      const m = /^(\d+)\.m4s$/.exec(f.name)
      if (!m) return []
      const piece = Number(m[1])
      if (r && !r.exited && piece >= r.next) return []
      const behind = playhead - (times[piece] ?? 0)
      // a piece ahead of the player is what it plays next: never removed for the limit
      if (behind < keep) return []
      return [{ path: join(dir, f.name), size: f.size, behind }]
    })
  }

  /** The bytes its folder holds now. */
  const size = async () => (await filesIn(dir)).reduce((n, f) => n + f.size, 0)

  /** Gets a stream ready: works out its segments and starts the first run where the player starts. */
  function prepare() {
    void ready()
      .then(({ segments }) => {
        if (!ended && source.video && !run) return start(segmentAt(segments, source.start))
      })
      .catch((e: Error) =>
        log.warn('a stream couldn’t be prepared', { session: id, error: e.message }),
      )
  }

  return {
    id,
    dir,
    source,
    prepare,
    segments: async () => (await ready()).segments,
    segment,
    init,
    subtitle,
    subtitleSegment,
    end,
    /** Why the last run failed, for the session (4.3's Now playing). */
    failure: () => failure,
    /** Whether ffmpeg runs now, and from which piece: for the tests. */
    state: () => (run ? { first: run.first, next: run.next, paused: run.paused } : null),
    /** Waiting for a slot: Now playing shows it waiting. */
    waiting: () => slots.waiting(id),
    /** How fast the run makes the film against real time, for Now playing; null without one. */
    speed: () => run?.speed ?? null,
    /**
     * The GPU path that made the film, for Now playing: the last run's, even once it has reached
     * the end; null on the processor or before any run.
     */
    hardware: () => made,
    /** A run on the GPU failed, and the session went on on the processor. */
    fellBack: () => fellBack,
    removable,
    size,
    sweep: () => {
      if (run && now() - heardAt >= idleMs) stop('idle')
    },
  }
}

export function createTranscodes(options: TranscodesOptions) {
  const now = options.now ?? Date.now
  const spawn = options.spawn ?? defaultSpawn
  const ahead = options.aheadSeconds ?? AHEAD_SECONDS
  const far = options.farSeconds ?? FAR_SECONDS
  const idleMs = options.idleMs ?? RUN_IDLE_MS
  const keepBehind = options.keepBehindSeconds ?? KEEP_BEHIND_SECONDS
  const limits = options.limits ?? (() => NO_LIMITS)
  const hardware = options.hardware ?? (() => NO_HARDWARE)
  const log = options.logger
  const live = new Map<string, Transcode>()
  const slots = createSlots(() => limits().maxTranscodes, options.waitMs ?? SLOT_WAIT_MS)
  let enforcing: ReturnType<typeof setTimeout> | null = null
  const ctx: Context = {
    options,
    now,
    spawn,
    ahead,
    far,
    idleMs,
    log,
    root: options.root,
    limits,
    hardware,
    slots,
    grew: () => {
      if (enforcing || limits().cacheBytes === null) return
      enforcing = setTimeout(() => {
        void enforce()
          .catch((e: Error) =>
            log.warn('couldn’t keep the cache to its limit', { error: e.message }),
          )
          .finally(() => {
            enforcing = null
          })
      }, ENFORCE_MS)
      unref(enforcing)
    },
  }

  function open(id: string, source: HlsSource): Transcode {
    const existing = live.get(id)
    if (existing) return existing
    const t = createTranscode(id, source, ctx)
    live.set(id, t)
    return t
  }

  async function end(id: string) {
    const t = live.get(id)
    live.delete(id)
    if (t) await t.end()
  }

  /**
   * On boot: removes the sessions' folders an earlier process left in the cache. Only folders
   * named as sessions are (UUIDs), since the owner chooses the cache's folder and may share it.
   */
  async function clear() {
    await mkdir(ctx.root, { recursive: true })
    for (const name of await readdir(ctx.root))
      if (SESSION_FOLDER.test(name))
        await rm(join(ctx.root, name), { recursive: true, force: true })
  }

  /**
   * Settings › Playback moved the cache: streams that start now use the new folder, and those
   * playing keep theirs until they end, which removes it.
   */
  async function moveTo(root: string) {
    if (root === ctx.root) return
    await mkdir(root, { recursive: true })
    ctx.root = root
  }

  /** The bytes the sessions' folders hold. */
  async function size() {
    const sizes = await Promise.all([...live.values()].map((t) => t.size()))
    return sizes.reduce((a, b) => a + b, 0)
  }

  /** Past the cache's limit: the pieces furthest behind the players go first. */
  async function enforce() {
    const limit = limits().cacheBytes
    if (limit === null) return 0
    let total = await size()
    if (total <= limit) return 0
    const pieces = (await Promise.all([...live.values()].map((t) => t.removable(keepBehind))))
      .flat()
      .sort((a, b) => b.behind - a.behind)
    let removed = 0
    for (const p of pieces) {
      if (total <= limit) break
      await rm(p.path, { force: true })
      total -= p.size
      removed++
    }
    if (total > limit)
      log.warn('the transcode cache is over its limit with what people are watching', {
        bytes: total,
        limit,
      })
    return removed
  }

  /** Settings › Playback's Clear: every piece a run has passed; nothing stops. */
  async function empty() {
    const pieces = (
      await Promise.all([...live.values()].map((t) => t.removable(Number.NEGATIVE_INFINITY)))
    ).flat()
    await Promise.all(pieces.map((p) => rm(p.path, { force: true })))
  }

  /** Stops runs nobody has asked anything of lately. */
  function sweep() {
    for (const t of live.values()) t.sweep()
  }

  async function close() {
    if (enforcing) clearTimeout(enforcing)
    await Promise.all([...live.keys()].map(end))
  }

  return {
    open,
    get: (id: string) => live.get(id) ?? null,
    end,
    clear,
    sweep,
    close,
    moveTo,
    root: () => ctx.root,
    size,
    enforce,
    empty,
    /** A limit changed in Settings: waiting transcodes start if there's room now. */
    limitsChanged: () => {
      slots.pump()
      ctx.grew()
    },
    /** The transcodes holding a slot now. */
    running: () => slots.count(),
  }
}

export type Transcodes = ReturnType<typeof createTranscodes>
export type Transcode = ReturnType<typeof createTranscode>
