// SPDX-License-Identifier: AGPL-3.0-only
// Short clips made with FFmpeg's lavfi sources (testsrc2 and sine:
// https://ffmpeg.org/ffmpeg-filters.html, Video Sources),
// a few seconds each, so the import is tested on real files without shipping any. Without
// ffmpeg and ffprobe on the PATH (or HIGHSEA_FFPROBE), the tests that need them are skipped.
import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

/**
 * The time limit every test gives the tools it runs (ffmpeg, ffprobe, unar): past it the tool is
 * killed and the call throws, so a stalled tool fails its test instead of hanging the run. Node's
 * `timeout` and `killSignal` options (https://nodejs.org/api/child_process.html#child_processexecfilesyncfile-args-options);
 * SIGKILL because ffmpeg takes SIGTERM as "finish the file", which can take a while. Bun 1.4.0 to
 * 1.4.3 also lose a sync child's exit when a garbage collection runs during the wait, and the call
 * then never returns (https://github.com/oven-sh/bun/issues/47257, fixed in 1.4.4 by
 * https://github.com/oven-sh/bun/pull/44581); with a `timeout` it throws ETIMEDOUT instead. The
 * limit is far above any clip's time (each takes a second or two), so it only ends a stall.
 */
export const TOOL_LIMIT = { timeout: 30_000, killSignal: 'SIGKILL' } as const

/**
 * A tool run without blocking the event loop, under the same limit: for a hook or a test that
 * waits on it, so bun:test's own timeouts keep running meanwhile (async spawns aren't touched by
 * Bun's sync-spawn bug above). Resolves with its stdout; rejects with Node's error (its stderr
 * included) when it fails, and says so plainly when the limit stopped it.
 */
export async function runTool(bin: string, args: string[]): Promise<string> {
  try {
    return (await promisify(execFile)(bin, args, { ...TOOL_LIMIT, maxBuffer: 64 * 1024 * 1024 }))
      .stdout
  } catch (e) {
    if ((e as { killed?: boolean }).killed)
      throw new Error(
        `${bin} ran past the tests' ${TOOL_LIMIT.timeout / 1000} s limit and was stopped`,
        {
          cause: e,
        },
      )
    throw e
  }
}

const which = (bin: string) => {
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore', ...TOOL_LIMIT })
    return true
  } catch {
    return false
  }
}

export const hasFfmpeg = which('ffmpeg') && which(process.env.HIGHSEA_FFPROBE || 'ffprobe')

if (!hasFfmpeg)
  console.warn('ffmpeg or ffprobe isn’t installed: the tests that probe real files are skipped.')

// -nostdin: no reading keys from stdin, which ffmpeg's docs advise when it isn't run from a
// terminal (https://ffmpeg.org/ffmpeg.html#Main-options)
const ffmpeg = (args: string[]) =>
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-nostdin', ...args], TOOL_LIMIT)

export type Clips = {
  /** 1080p H.264, 3 s: 5.1 English and stereo French audio, a forced English subtitle. */
  main: string
  /** 1080p HEVC 10-bit, 2 s, tagged bt2020 and PQ (smpte2084). */
  hdr: string
  /** 1080p H.264, 1 s: a sample. */
  sample: string
}

/** Makes the clips under `dir`. */
export function makeClips(dir: string): Clips {
  mkdirSync(dir, { recursive: true })
  const srt = join(dir, 'subs.srt')
  writeFileSync(srt, '1\n00:00:00,000 --> 00:00:02,000\nHello.\n')
  const main = join(dir, 'main.mkv')
  ffmpeg([
    ...['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=24:duration=3'],
    ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3'],
    ...['-f', 'lavfi', '-i', 'sine=frequency=660:duration=3'],
    ...['-i', srt],
    ...['-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:s'],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
    ...['-c:a', 'aac', '-ac:a:0', '6', '-ac:a:1', '2', '-c:s', 'srt'],
    ...['-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=fra'],
    ...['-metadata:s:a:1', 'title=Commentary', '-metadata:s:s:0', 'language=eng'],
    ...['-disposition:a:0', 'default', '-disposition:a:1', '0', '-disposition:s:0', 'forced'],
    main,
  ])
  const hdr = join(dir, 'hdr.mkv')
  ffmpeg([
    ...['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=24:duration=2'],
    ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2'],
    // tagged in the filter graph: frames carry their colour properties to the encoder
    // (https://ffmpeg.org/ffmpeg-filters.html#setparams)
    ...[
      '-vf',
      'setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc,format=yuv420p10le',
    ],
    ...['-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error'],
    ...['-c:a', 'aac', '-metadata:s:a:0', 'language=eng'],
    hdr,
  ])
  const sample = join(dir, 'sample.mkv')
  ffmpeg([
    ...['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=24:duration=1'],
    ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1'],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac'],
    sample,
  ])
  return { main, hdr, sample }
}

/**
 * A clip as long as a feature, for what needs the import's sample check to pass (the sweeps):
 * 10 minutes by default, the shortest Radarr allows an unknown or feature-length runtime. Small
 * and at 1 frame a second, so it encodes in about a second. English audio (a tone, or `audio`
 * padded with silence) and a forced English subtitle, like `main`.
 */
export function makeFeature(path: string, seconds = 600, audio?: string): string {
  const srt = `${path}.srt`
  writeFileSync(srt, '1\n00:00:00,000 --> 00:00:02,000\nHello.\n')
  // `audio`: a recording to start with, padded with silence to the length (apad,
  // https://ffmpeg.org/ffmpeg-filters.html#apad), in place of the tone
  const sound = audio
    ? ['-i', audio]
    : ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`]
  const pad = audio ? ['-filter:a', `apad=whole_dur=${seconds}`] : []
  ffmpeg([
    ...['-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=1:duration=${seconds}`],
    ...sound,
    ...['-i', srt],
    ...['-map', '0:v', '-map', '1:a', '-map', '2:s', ...pad],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
    ...['-c:a', 'aac', '-c:s', 'srt'],
    ...['-metadata:s:a:0', 'language=eng', '-metadata:s:s:0', 'language=eng'],
    ...['-disposition:s:0', 'forced'],
    path,
  ])
  return path
}
