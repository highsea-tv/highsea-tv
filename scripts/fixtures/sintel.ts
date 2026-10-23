// SPDX-License-Identifier: AGPL-3.0-only
// Makes the Sintel fixture for the subtitle sync tests (checkpoint 7's plan, Test media; ADR 0040,
// amended). Run once by a developer, never in CI or a test: it reads the network.
//
// - The audio: 52 seconds from 1:45 of Wikimedia Commons' `Sintel_movie_4K.webm` (CC BY 3.0),
//   read by ffmpeg over HTTP range requests (`-ss` before `-i` seeks the input,
//   https://ffmpeg.org/ffmpeg.html#Main-options), kept as 16 kHz mono FLAC so every machine
//   decodes the same samples.
// - The subtitles: the official English SRT from durian.blender.org, checked against Xiph's
//   published SHA-1, with the 12 cues inside the cut re-timed to it.
//
// Usage: bun scripts/fixtures/sintel.ts   (writes packages/subtitles/test/fixtures/sintel/)
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const AUDIO = 'https://upload.wikimedia.org/wikipedia/commons/f/f1/Sintel_movie_4K.webm'
const SRT = 'https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt'
/** Xiph's SHA1SUMS.txt for `sintel_en.srt` (https://media.xiph.org/sintel/subtitles/). */
const SRT_SHA1 = '53d3a8d6fc6c7152e777f493224cec494b63d2b7'
const FROM_S = 105
const SECONDS = 52
const AGENT = 'highsea-fixture/1.0 (a one-time test fixture; https://highsea.tv)'

const out = join(import.meta.dir, '../../packages/subtitles/test/fixtures/sintel')
mkdirSync(out, { recursive: true })

const srt = Buffer.from(
  await (await fetch(SRT, { headers: { 'user-agent': AGENT } })).arrayBuffer(),
)
const sha1 = createHash('sha1').update(srt).digest('hex')
if (sha1 !== SRT_SHA1) throw new Error(`sintel_en.srt's SHA-1 is ${sha1}, not Xiph's ${SRT_SHA1}`)

const time = (t: string) => {
  const [h, m, s, ms] = t.split(/[:,]/).map(Number) as [number, number, number, number]
  return ((h * 60 + m) * 60 + s) * 1000 + ms
}
const clock = (ms: number) => {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
const cues = srt
  .toString('utf8')
  .replace(/\r/g, '')
  .trim()
  .split(/\n\n+/)
  .map((block) => {
    const [, timing = '', ...text] = block.split('\n')
    const [start = '', end = ''] = timing.split(' --> ')
    return { start: time(start) - FROM_S * 1000, end: time(end) - FROM_S * 1000, text }
  })
  .filter((c) => c.start >= 0 && c.end <= SECONDS * 1000)
const cut = cues
  .map((c, i) => `${i + 1}\n${clock(c.start)} --> ${clock(c.end)}\n${c.text.join('\n')}\n`)
  .join('\n')
writeFileSync(join(out, 'sintel.en.srt'), cut)

execFileSync(
  'ffmpeg',
  [
    ...['-v', 'error', '-nostdin', '-y', '-user_agent', AGENT],
    ...['-ss', String(FROM_S), '-t', String(SECONDS), '-i', AUDIO],
    ...['-map', '0:a:0', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac'],
    ...['-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact'],
    join(out, 'sintel.flac'),
  ],
  { stdio: 'inherit' },
)

const sha256 = (file: string) =>
  createHash('sha256')
    .update(readFileSync(join(out, file)))
    .digest('hex')
console.log(`${cues.length} cues`)
console.log(`sintel.flac    ${sha256('sintel.flac')}`)
console.log(`sintel.en.srt  ${sha256('sintel.en.srt')}`)
