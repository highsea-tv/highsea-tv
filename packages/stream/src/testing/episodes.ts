// SPDX-License-Identifier: AGPL-3.0-only
// Episodes for the markers' tests (ADR 0067), made with lavfi's `aevalsrc`, `color` and `concat`
// (https://ffmpeg.org/ffmpeg-filters.html#aevalsrc, #color, #concat): each is a tune of its own,
// then a shared intro, its own again, shared credits and a few seconds of its own at the end. A
// tune is a note every quarter second, picked by a seed, so two seeds never play the same tune
// and one seed always does. The picture is a tiny flat colour, so a clip is a few hundred kB.
import { execFile } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

/** What an episode is made of, in seconds; a part may be 0, and `credits` is shared too. */
export type EpisodeParts = {
  /** The cold open, its own tune. */
  open: number
  /** The shared intro; 0 for none. */
  intro: number
  /** The episode itself. */
  body: number
  /** The shared credits; 0 for none. */
  credits: number
  /** Its own tune after the credits. */
  tail: number
  /** Chapters to write, by name, with their times. */
  chapters?: { title: string; start: number; end: number }[]
}

/** The intro's and the credits' tunes, the same in every episode. */
const INTRO_SEED = 7
const CREDITS_SEED = 31

/** A tune: a sine's note changes every quarter second, its pitch picked from the seed. */
const tune = (seed: number, seconds: number) =>
  `aevalsrc=0.4*sin(2*PI*t*220*pow(2\\,floor(mod(abs(sin(floor(t*4)*${seed}.13+${seed}))*1000\\,24))/12)):s=44100:d=${seconds}`

/**
 * Makes an episode at `path` (Matroska, AAC sound) from its parts, its own tunes picked by
 * `seed`, and the chapters asked for. Resolves when ffmpeg is done.
 */
export async function makeEpisode(
  ffmpeg: string,
  path: string,
  seed: number,
  parts: EpisodeParts,
): Promise<void> {
  const pieces: string[] = []
  const add = (s: number, d: number) => {
    if (d > 0) pieces.push(tune(s, d))
  }
  add(1000 + seed * 3, parts.open)
  add(INTRO_SEED, parts.intro)
  add(2000 + seed * 5, parts.body)
  add(CREDITS_SEED, parts.credits)
  add(3000 + seed * 7, parts.tail)
  const total = parts.open + parts.intro + parts.body + parts.credits + parts.tail
  const inputs = pieces.flatMap((p) => ['-f', 'lavfi', '-i', p])
  const filter = `${pieces.map((_, i) => `[${i}:a]`).join('')}concat=n=${pieces.length}:v=0:a=1[a]`
  const args = [
    ...['-v', 'error', '-y', '-nostdin'],
    ...inputs,
    ...['-f', 'lavfi', '-i', `color=c=0x203040:s=64x36:r=2:d=${total}`],
  ]
  let metadata: string[] = []
  if (parts.chapters?.length) {
    const file = `${path}.chapters.txt`
    writeFileSync(
      file,
      [
        ';FFMETADATA1',
        ...parts.chapters.flatMap((c) => [
          '[CHAPTER]',
          'TIMEBASE=1/1000',
          `START=${Math.round(c.start * 1000)}`,
          `END=${Math.round(c.end * 1000)}`,
          `title=${c.title}`,
        ]),
        '',
      ].join('\n'),
    )
    // ffmpeg's metadata file (https://ffmpeg.org/ffmpeg-formats.html#Metadata-2), its chapters
    metadata = ['-f', 'ffmetadata', '-i', file, '-map_chapters', String(pieces.length + 1)]
  }
  await promisify(execFile)(
    ffmpeg,
    [
      ...args,
      ...metadata,
      ...['-filter_complex', filter, '-map', '[a]', '-map', `${pieces.length}:v`],
      ...['-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-g', '20'],
      ...['-t', String(total), path],
    ],
    { timeout: 60_000, killSignal: 'SIGKILL' },
  )
}

/** A folder's season of `n` episodes sharing an intro and credits, as `S01E0n.mkv`. */
export async function makeSeason(
  ffmpeg: string,
  dir: string,
  n: number,
  parts: (episode: number) => EpisodeParts,
): Promise<string[]> {
  const paths: string[] = []
  for (let e = 1; e <= n; e++) {
    const path = join(dir, `S01E0${e}.mkv`)
    await makeEpisode(ffmpeg, path, e, parts(e))
    paths.push(path)
  }
  return paths
}
