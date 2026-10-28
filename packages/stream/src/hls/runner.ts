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
import { type ChildProcess, execFile, spawn as nodeSpawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { PlaybackDecision } from '../decision/index.ts'
import {
  INIT_NAME,
  keyframeArgs,
  parseKeyframes,
  pieceName,
  type RunInput,
  runArgs,
  subtitleArgs,
} from './args.ts'
import { gridSegments, keyframeSegments, pieceStarts, type Segment, segmentAt } from './playlist.ts'

/** How far a run makes segments past the furthest asked for, before it's paused. */
export const AHEAD_SECONDS = 30
/** A segment more than this past what the run has made starts a new run there. */
export const FAR_SECONDS = 18
/** A run nobody has asked anything of for this long is stopped. */
export const RUN_IDLE_MS = 60_000
/** How often a run's folder is looked at for new pieces. */
const POLL_MS = 100
/** The lines of a run's log kept for System › Logs when it fails. */
const LOG_LINES = 20

/** The initialization section highsea serves: the first run's, copied once, never rewritten. */
const HEADER = 'header.mp4'

export class TranscodeError extends Error {
  /** The last lines ffmpeg wrote, for the log. */
  readonly log: string[]
  constructor(message: string, log: string[] = []) {
    super(message)
    this.name = 'TranscodeError'
    this.log = log
  }
}

export type HlsSource = {
  /** The film's absolute path. */
  input: string
  /** Seconds. */
  duration: number
  decision: PlaybackDecision
  video: { index: number; codec: string; width: number; height: number } | null
  /** Where the player starts, in seconds: the first run starts there. */
  start: number
  /** The picture's keyframes, seconds from the film's start; a direct stream's segments need them. */
  keyframes: () => Promise<number[]>
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
}

type Waiter = {
  piece: number
  resolve: () => void
  reject: (e: Error) => void
  /** Waiting for the initialization section, which any run writes with its first piece. */
  init?: boolean
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

const exec = (command: string, args: string[], timeoutMs: number) =>
  new Promise<string>((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const lines = String(stderr).trim().split('\n').slice(-LOG_LINES)
          reject(new TranscodeError(error.message.split('\n')[0] ?? 'ffmpeg failed', lines))
        } else resolve(String(stdout))
      },
    )
  })

/** Reads a film's keyframes with ffprobe, without decoding (`keyframeArgs`). */
export async function readKeyframes(ffprobe: string, input: string, index: number) {
  return parseKeyframes(await exec(ffprobe, keyframeArgs(input, index), 15 * 60_000))
}

type Context = {
  options: TranscodesOptions
  now: () => number
  spawn: Spawn
  ahead: number
  far: number
  idleMs: number
  log: RunLogger
}

function createTranscode(id: string, source: HlsSource, ctx: Context) {
  const { options, now, spawn, ahead, far, idleMs, log } = ctx
  const dir = join(options.root, id)
  const copy = source.decision.video?.action !== 'transcode'
  const { decision } = source
  let run: Run | null = null
  let waiters: Waiter[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  /** The furthest segment asked for lately: what `ahead` counts from. */
  let asked = 0
  let heardAt = now()
  let ended = false
  let failure: TranscodeError | null = null
  const subtitles = new Map<string, Promise<string>>()

  /**
   * The segments, and when each piece starts: a direct stream's keyframes, a transcode's grid.
   * Worked out when first needed, so a session that only converts subtitles never reads keyframes.
   */
  let prepared: Promise<{ segments: Segment[]; times: number[] }> | null = null
  const ready = () =>
    (prepared ??= (async () => {
      await mkdir(dir, { recursive: true })
      if (copy && source.video) {
        const keyframes = await source.keyframes()
        return {
          segments: keyframeSegments(keyframes, source.duration),
          times: pieceStarts(keyframes),
        }
      }
      const segments = gridSegments(source.duration)
      return { segments, times: segments.map((s) => s.start) }
    })())

  const has = (piece: number) => existsSync(join(dir, pieceName(piece)))

  function settle() {
    if (!run) return
    while (has(run.next)) run.next++
    const done = waiters.filter((w) => has(w.piece))
    waiters = waiters.filter((w) => !done.includes(w))
    for (const w of done) w.resolve()
    void throttle()
    if (!existsSync(join(dir, HEADER)) && existsSync(join(dir, INIT_NAME)) && has(run.first))
      void copyFile(join(dir, INIT_NAME), join(dir, HEADER)).catch(() => {})
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
    if (why !== 'seek')
      for (const w of waiters.splice(0)) w.reject(new TranscodeError('The stream stopped.'))
  }

  async function start(segment: number) {
    const { segments, times } = await ready()
    const s = segments[segment]
    if (!s || ended) return
    stop('seek')
    // what the stopped run was making before this one's start won't come now; the init will, with
    // this run's first piece
    for (const w of waiters.filter((w) => w.piece < s.first)) {
      if (w.init) w.piece = s.first
      else w.reject(new TranscodeError('The stream moved on.'))
    }
    waiters = waiters.filter((w) => w.piece >= s.first)
    const input: RunInput = {
      input: source.input,
      dir,
      start: times[s.first] ?? s.start,
      startNumber: s.first,
      video: source.video && decision.video ? { ...source.video, plan: decision.video } : null,
      audio: decision.audio ? { index: decision.audio.index, plan: decision.audio } : null,
    }
    const child = spawn(options.ffmpeg, runArgs(input))
    const r: Run = {
      child,
      first: s.first,
      next: s.first,
      paused: false,
      stopped: false,
      exited: false,
      log: [],
    }
    run = r
    failure = null
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      r.log.push(...chunk.split('\n').filter((l) => l.trim()))
      if (r.log.length > LOG_LINES) r.log.splice(0, r.log.length - LOG_LINES)
    })
    child.on('error', (e) => finish(r, null, e))
    child.on('exit', (code) => finish(r, code))
    timer ??= setInterval(settle, POLL_MS)
    timer.unref?.()
  }

  function finish(r: Run, code: number | null, error?: Error) {
    if (r.exited) return
    r.exited = true
    if (run === r) settle()
    if (r.stopped || run !== r) return
    run = null
    if (timer) clearInterval(timer)
    timer = null
    if (code === 0 && !error) {
      // the film's end: anything still waited for isn't coming
      for (const w of waiters.splice(0))
        has(w.piece) ? w.resolve() : w.reject(new TranscodeError('That segment isn’t there.'))
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
      const near = r && !r.exited && r.first <= first && (times[first] ?? 0) - madeTo <= far
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
    if (existsSync(header)) return header
    const { segments } = await ready()
    if (!run) await start(segmentAt(segments, source.start))
    const r = run as Run | null
    if (!r) throw new TranscodeError('The stream has ended.')
    if (!has(r.first))
      await new Promise<void>((resolve, reject) => {
        waiters.push({ piece: r.first, resolve, reject, init: true })
      })
    if (!existsSync(header)) await copyFile(join(dir, INIT_NAME), header)
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
      await mkdir(dir, { recursive: true })
      await exec(options.ffmpeg, subtitleArgs(input, index, out), 10 * 60_000)
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

  /** Stops its ffmpeg and removes its folder. */
  async function end() {
    ended = true
    stop('ended')
    await rm(dir, { recursive: true, force: true })
  }

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
    end,
    /** Why the last run failed, for the session (4.3's Now playing). */
    failure: () => failure,
    /** Whether ffmpeg runs now, and from which piece: for the tests. */
    state: () => (run ? { first: run.first, next: run.next, paused: run.paused } : null),
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
  const log = options.logger
  const live = new Map<string, Transcode>()
  const ctx: Context = { options, now, spawn, ahead, far, idleMs, log }

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

  /** On boot: removes whatever an earlier process left in the cache. */
  async function clear() {
    await mkdir(options.root, { recursive: true })
    for (const name of await readdir(options.root))
      await rm(join(options.root, name), { recursive: true, force: true })
  }

  /** Stops runs nobody has asked anything of lately. */
  function sweep() {
    for (const t of live.values()) t.sweep()
  }

  async function close() {
    await Promise.all([...live.keys()].map(end))
  }

  return { open, get: (id: string) => live.get(id) ?? null, end, clear, sweep, close }
}

export type Transcodes = ReturnType<typeof createTranscodes>
export type Transcode = ReturnType<typeof createTranscode>
