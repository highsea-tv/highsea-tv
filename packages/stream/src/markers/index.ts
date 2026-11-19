// SPDX-License-Identifier: AGPL-3.0-only
// An episode's intro and credits (Phase 5 C2, ADR 0067), as time ranges in the way Jellyfin's
// media segments are ("Intro" and "Outro",
// https://jellyfin.org/docs/general/server/metadata/media-segments/):
//
// - **From chapters first.** A chapter named like an intro or the credits gives its range, read
//   with ffprobe's `-show_chapters` (https://ffmpeg.org/ffprobe.html#Main-options). The names
//   matched are the plain ones release groups and disc authoring tools write (`INTRO_CHAPTER`,
//   `CREDITS_CHAPTER`); a chapter named only "Chapter 3" says nothing, so it gives nothing.
// - **Then by the audio a season's episodes share.** The opening minutes of each episode are
//   fingerprinted with FFmpeg's `chromaprint` muxer, which "feeds audio data to the Chromaprint
//   library" and writes the fingerprint as `fp_format raw`, "Binary raw fingerprint"
//   (https://ffmpeg.org/ffmpeg-formats.html#chromaprint-1): 32-bit items, one every
//   `ITEM_SECONDS`. Two episodes' fingerprints are laid against each other at every offset, and
//   the longest stretch where their items agree (`sharedStretch`) is the intro in each. The last
//   minutes likewise give where the credits start.
//
// The muxer needs an FFmpeg built `--enable-chromaprint` (Debian's is, as the image's
// `ffmpeg -muxers` says); `hasChromaprint` asks, and without it only chapters give markers.
import { execFile, spawn } from 'node:child_process'
import { setPriority } from 'node:os'
import { promisify } from 'node:util'
import { endWithProcess } from '@highsea-tv/core/children'

export type Range = { start: number; end: number }

/** What a file's markers are: the intro's range and where the credits start, in seconds. */
export type Markers = { intro: Range | null; credits: number | null }

export type Chapter = { start: number; end: number; title: string | null }

// ---------------------------------------------------------------------------------------------
// Chapters

/**
 * A chapter that is the intro: "Intro", "Opening", "Opening Credits", "Opening Titles", "Title
 * Sequence", "Main Title", or anime's "OP" ("OP1"). Matched on the whole name, whatever its case
 * and its numbering ("01. Intro", "Intro 1"), so "Introduction to Part 2" isn't one.
 */
export const INTRO_CHAPTER =
  /^(?:intro|opening(?: (?:credits|titles|theme|song))?|title sequence|main titles?|op)$/

/**
 * A chapter that is the credits: "Credits", "End Credits", "Closing Credits", "End Titles",
 * "Ending", "Outro", or anime's "ED" ("ED1"). Where they start is the credits' mark.
 */
export const CREDITS_CHAPTER =
  /^(?:credits|end(?:ing)? credits|closing(?: credits)?|end titles|ending(?: (?:theme|song))?|outro|ed)$/

/** A chapter's name, lower case, without the numbering around it ("01 - Intro", "OP1", "Intro 2"). */
export const chapterName = (title: string) =>
  title
    .toLowerCase()
    .replace(/^(?:chapter\s*)?\d+\s*[-.:)]?\s*/, '')
    .replace(/\s*\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

/** An intro this long at most: a longer chapter so named is the episode's first act. */
export const INTRO_LONGEST = 5 * 60

/**
 * The markers a file's chapters give: the first intro chapter in its first half, and the last
 * credits chapter in its second, where they start. Either is null where no chapter says.
 */
export function chapterMarkers(chapters: readonly Chapter[], duration: number | null): Markers {
  const half = duration && duration > 0 ? duration / 2 : Number.POSITIVE_INFINITY
  const named = chapters.filter((c) => c.title && c.end > c.start)
  const intro = named.find(
    (c) =>
      INTRO_CHAPTER.test(chapterName(c.title as string)) &&
      c.start < half &&
      c.end - c.start <= INTRO_LONGEST,
  )
  const credits = named.findLast(
    (c) => CREDITS_CHAPTER.test(chapterName(c.title as string)) && c.start >= half,
  )
  return {
    intro: intro ? { start: round(intro.start), end: round(intro.end) } : null,
    credits: credits ? round(credits.start) : null,
  }
}

/** ffprobe's chapters: its `-show_chapters` JSON, times in seconds. */
export async function readChapters(
  ffprobe: string,
  path: string,
  signal?: AbortSignal,
): Promise<Chapter[]> {
  const { stdout } = await promisify(execFile)(
    ffprobe,
    ['-v', 'error', '-show_chapters', '-of', 'json', path],
    { signal, maxBuffer: 4 * 1024 * 1024, timeout: 60_000, killSignal: 'SIGKILL' },
  )
  const raw = JSON.parse(stdout) as {
    chapters?: { start_time?: string; end_time?: string; tags?: Record<string, string> }[]
  }
  return (raw.chapters ?? []).flatMap((c) => {
    const start = Number.parseFloat(c.start_time ?? '')
    const end = Number.parseFloat(c.end_time ?? '')
    if (!Number.isFinite(start) || !Number.isFinite(end)) return []
    const title = Object.entries(c.tags ?? {}).find(([k]) => k.toLowerCase() === 'title')?.[1]
    return [{ start, end, title: title?.trim() || null }]
  })
}

// ---------------------------------------------------------------------------------------------
// Fingerprints

/**
 * Seconds one raw fingerprint item covers. Chromaprint reads audio at 11,025 Hz in frames of
 * 4,096 samples, each a third of a frame after the last (`chromaprint_get_item_duration`,
 * https://acoustid.github.io/chromaprint/), so an item every 1,365 samples.
 */
export const ITEM_SECONDS = 1365 / 11025

/** Whether this ffmpeg has the `chromaprint` muxer (`ffmpeg -muxers` lists it). */
export async function hasChromaprint(ffmpeg: string): Promise<boolean> {
  try {
    const { stdout } = await promisify(execFile)(ffmpeg, ['-hide_banner', '-muxers'], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
      killSignal: 'SIGKILL',
    })
    return /^\s*E\s+chromaprint\b/m.test(stdout)
  } catch {
    return false
  }
}

/**
 * ffmpeg's command line for a stretch's fingerprint: `seconds` of the first sound track from
 * `from`, sought on the input (`-ss` before `-i`, so the file is read from there,
 * https://ffmpeg.org/ffmpeg.html#Main-options), mixed to one channel at Chromaprint's own
 * 11,025 Hz as signed 16-bit samples, the muxer's input, and its raw items to stdout.
 */
export function fingerprintArgs(input: string, from: number, seconds: number): string[] {
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error'],
    ...(from > 0 ? ['-ss', from.toFixed(3)] : []),
    ...['-t', seconds.toFixed(3), '-i', input],
    ...['-map', '0:a:0', '-vn', '-sn', '-dn'],
    ...['-ac', '1', '-ar', '11025', '-c:a', 'pcm_s16le'],
    ...['-f', 'chromaprint', '-fp_format', 'raw', '-'],
  ]
}

/** The lowest priority a process can have (`nice` 19), as trickplay's ffmpeg runs. */
const LOW = 19

/**
 * A stretch's raw fingerprint, at the lowest priority. The muxer writes native-endian 32-bit
 * items; every platform highsea runs on is little-endian. Aborting kills ffmpeg.
 */
export async function fingerprint(options: {
  ffmpeg: string
  input: string
  from: number
  seconds: number
  signal?: AbortSignal
}): Promise<Uint32Array> {
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    const child = endWithProcess(
      spawn(options.ffmpeg, fingerprintArgs(options.input, options.from, options.seconds), {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        signal: options.signal,
      }),
    )
    if (child.pid)
      try {
        setPriority(child.pid, LOW)
      } catch {
        // a platform without priorities still reads it
      }
    const lines: string[] = []
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      lines.push(...chunk.split('\n').filter((l) => l.trim()))
      lines.splice(0, Math.max(0, lines.length - 5))
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg stopped with code ${code}: ${lines.join(' / ')}`)),
    )
  })
  const all = Buffer.concat(chunks)
  const items = new Uint32Array(Math.floor(all.length / 4))
  for (let i = 0; i < items.length; i++) items[i] = all.readUInt32LE(i * 4)
  return items
}

// ---------------------------------------------------------------------------------------------
// The stretch two episodes share

export type StretchOptions = {
  /** The shortest stretch that counts, in seconds: shorter ones are a sting or a coincidence. */
  shortest: number
  /** The longest, in seconds: a longer one is a double episode's or a recap's. */
  longest: number
  /** Items agree when they differ in at most this many of their 32 bits. */
  bits: number
  /** Seconds of disagreement a stretch may hold and go on: a line said over the music. */
  gap: number
}

/** An intro is 15 s to 3 min; its items agree within 8 bits; it rides over 2 s of difference. */
export const INTRO_STRETCH: StretchOptions = { shortest: 15, longest: 180, bits: 8, gap: 2 }

/** Credits are at least 15 s, and may be the whole of what's read. */
export const CREDITS_STRETCH: StretchOptions = {
  shortest: 15,
  longest: Number.POSITIVE_INFINITY,
  bits: 8,
  gap: 2,
}

/** The set bits of a 32-bit number (the well-known SWAR count). */
function bitsSet(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555)
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  v = (v + (v >>> 4)) & 0x0f0f0f0f
  return Math.imul(v, 0x01010101) >>> 24
}

/**
 * The longest stretch `a` and `b` share, in seconds from the start of each fingerprint, or null
 * when none is long enough. Every offset of one against the other is tried, and at each the
 * longest run of agreeing items, carried over gaps up to `gap`. Silence agrees with silence, so a
 * run whose items are mostly the same few values (a quiet stretch, a held tone) doesn't count.
 */
export function sharedStretch(
  a: Uint32Array,
  b: Uint32Array,
  options: StretchOptions,
): { a: Range; b: Range } | null {
  const shortest = Math.ceil(options.shortest / ITEM_SECONDS)
  const gap = Math.round(options.gap / ITEM_SECONDS)
  // each offset's longest run, then the longest of those that isn't silence
  const runs: { i: number; j: number; length: number }[] = []
  for (let shift = -(b.length - shortest); shift <= a.length - shortest; shift++) {
    const i0 = Math.max(0, shift)
    const j0 = i0 - shift
    const n = Math.min(a.length - i0, b.length - j0)
    if (n < shortest) continue
    let start = -1
    let last = -1
    let best = { k: 0, length: 0 }
    for (let k = 0; k < n; k++) {
      if (bitsSet((a[i0 + k] as number) ^ (b[j0 + k] as number)) > options.bits) continue
      if (start < 0 || k - last > gap) start = k
      last = k
      const length = last - start + 1
      if (length > best.length) best = { k: start, length }
    }
    if (best.length < shortest) continue
    // a stray agreeing item a gap away, or sound that's only alike, isn't the stretch: its ends
    // are where most items agree closely, within half the bits
    const agrees = (k: number) =>
      bitsSet((a[i0 + k] as number) ^ (b[j0 + k] as number)) <= options.bits / 2
    const dense = (from: number, step: 1 | -1) => {
      let n = 0
      for (let x = 0; x < EDGE; x++) if (agrees(from + x * step)) n++
      return n >= EDGE * 0.75
    }
    let first = best.k
    let end = best.k + best.length - 1
    while (first + EDGE <= end && !dense(first, 1)) first++
    while (end - EDGE >= first && !dense(end, -1)) end--
    if (end - first + 1 >= shortest)
      runs.push({ i: i0 + first, j: j0 + first, length: end - first + 1 })
  }
  runs.sort((x, y) => y.length - x.length)
  const longest = options.longest / ITEM_SECONDS
  for (const r of runs) {
    if (r.length > longest) continue
    if (new Set(a.subarray(r.i, r.i + r.length)).size < r.length * 0.3) continue
    const at = (n: number, lead: number) => round(Math.max(0, n * ITEM_SECONDS + lead))
    return {
      a: { start: at(r.i, START_LEAD), end: at(r.i + r.length, END_LEAD) },
      b: { start: at(r.j, START_LEAD), end: at(r.j + r.length, END_LEAD) },
    }
  }
  return null
}

/** Items over which a stretch's ends are judged: about 2 s. */
const EDGE = 16

/**
 * Seconds a stretch's items run ahead of the sound they share. Each item is worked out from a
 * window of about 2.6 s that starts at its time (Chromaprint's `chromaprint_get_delay`: its
 * filters span several frames), so an item agrees once most of its window is in the shared sound:
 * a run's first item comes a little before the sound starts, and its last well before the sound
 * ends. Measured on the tests' clips (runs began 0.5–0.7 s early and ended 1.0–1.6 s early), and
 * set a little short of that, so the marks fall inside the intro rather than past it.
 */
const START_LEAD = 0.5
const END_LEAD = 1.2

/** The worker pool's task (`@highsea-tv/runtime`'s workers): `sharedStretch` off the main thread. */
export function compare(input: {
  a: Uint32Array
  b: Uint32Array
  options: StretchOptions
}): { a: Range; b: Range } | null {
  return sharedStretch(input.a, input.b, input.options)
}

/** The module the worker pool loads for `compare`. */
export const MARKERS_WORKER = new URL('./index.ts', import.meta.url).href

// ---------------------------------------------------------------------------------------------
// What's read of an episode

/** The opening read for the intro: a quarter of the episode, at most 10 minutes. */
export const headSeconds = (duration: number) => Math.min(600, duration * 0.25)

/** The ending read for the credits: a fifth of the episode, at most 5 minutes. */
export const tailSeconds = (duration: number) => Math.min(300, duration * 0.2)

/** Tenths of a second are as fine as a marker needs. */
const round = (s: number) => Math.round(s * 10) / 10
