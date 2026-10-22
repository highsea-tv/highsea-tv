// SPDX-License-Identifier: AGPL-3.0-only
// The sync's confidence, measured on real films (ADR 0044, judgement call 45). It takes a movie
// library, picks every Nth film with an English sidecar, and aligns each film's subtitle to its
// speech: as it is, moved as releases move them (an offset, a framerate, a cut), and, as negatives,
// another film's subtitle and the film's own lines scattered. It reads the library and writes only
// the speech it found to the cache folder, so a second run costs seconds. Never in CI: it needs films.
// Usage: bun scripts/calibrate-sync.ts <library> --cache <dir> [--every 28] [--out results.jsonl]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseSrt } from '@highsea-tv/subtitles/shared'
import {
  ALIGN_DEFAULTS,
  type Alignment,
  align,
  applyCorrection,
  type CueSpan,
  density,
  speechFrames,
} from '@highsea-tv/subtitles/sync'
import { type Distortion, distort, random } from '@highsea-tv/subtitles/testing'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    cache: { type: 'string' },
    every: { type: 'string', default: '28' },
    out: { type: 'string' },
    parallel: { type: 'string', default: '4' },
  },
})
const library = positionals[0]
if (!library || !values.cache) {
  console.error('Usage: bun scripts/calibrate-sync.ts <library> --cache <dir> [--every 28]')
  process.exit(1)
}
const cacheDir: string = values.cache
mkdirSync(cacheDir, { recursive: true })

type Film = { name: string; video: string; srt: string }

/** Every movie folder with a video and an English sidecar, by name, then every Nth of them. */
function films(library: string): Film[] {
  const all: Film[] = []
  for (const name of readdirSync(library).sort()) {
    const dir = join(library, name)
    let files: string[]
    try {
      files = readdirSync(dir)
    } catch {
      continue
    }
    const video = files.find((f) => /\.(mkv|mp4|m4v|avi)$/i.test(f) && !/sample/i.test(f))
    const srt = files.find((f) => /\.(en|eng)\.srt$/i.test(f))
    if (video && srt) all.push({ name, video: join(dir, video), srt: join(dir, srt) })
  }
  const every = Number(values.every)
  return all.filter((_, i) => i % every === 0)
}

/** The default audio stream's absolute index, or the first one's. */
function audioIndex(video: string): number {
  const out = execFileSync('ffprobe', [
    ...['-v', 'error', '-select_streams', 'a'],
    ...['-show_entries', 'stream=index:stream_disposition=default', '-of', 'json', video],
  ]).toString()
  const streams = (
    JSON.parse(out) as { streams: { index: number; disposition?: { default?: number } }[] }
  ).streams
  const chosen = streams.find((s) => s.disposition?.default === 1) ?? streams[0]
  if (!chosen) throw new Error('no audio')
  return chosen.index
}

/** The film's speech on the 10 ms grid, from the cache when it's there. */
async function speechOf(film: Film): Promise<Uint8Array> {
  const cached = join(cacheDir, `${basename(film.video)}.frames`)
  if (existsSync(cached)) return new Uint8Array(readFileSync(cached))
  const started = performance.now()
  const frames = await speechFrames(film.video, audioIndex(film.video))
  writeFileSync(cached, frames)
  console.error(`  read ${film.name} in ${((performance.now() - started) / 1000).toFixed(0)} s`)
  return frames
}

type Row = {
  film: string
  kind: 'as is' | 'moved' | 'cut' | 'another film' | 'scattered'
  cues: number
  speech: number
  confidence: number
  raw: Alignment['raw']
  offsetMs: number
  sections: number
  /** For the moved cases: how far each cue lands from where the as-is fit put it. */
  p90Ms?: number
  over500?: number
}

const rows: Row[] = []
const selected = films(library)
console.error(`${selected.length} films`)

// the speech first, a few films at a time: reading is what costs
const speech = new Map<string, Uint8Array>()
const queue = [...selected]
await Promise.all(
  Array.from({ length: Number(values.parallel) }, async () => {
    for (let film = queue.shift(); film; film = queue.shift()) {
      try {
        speech.set(film.name, await speechOf(film))
      } catch (e) {
        console.error(`  skipped ${film.name}: ${(e as Error).message}`)
      }
    }
  }),
)

const cuesOf = (film: Film): CueSpan[] => parseSrt(readFileSync(film.srt, 'utf8'))
const fit = (frames: Uint8Array, cues: CueSpan[]) =>
  align(frames, cues, { speechCps: ALIGN_DEFAULTS.speechCps })

const usable = selected.filter((f) => speech.has(f.name))
usable.forEach((film, i) => {
  const frames = speech.get(film.name) as Uint8Array
  const cues = cuesOf(film)
  const row = (kind: Row['kind'], a: Alignment): Row => ({
    film: film.name,
    kind,
    cues: a.cues,
    speech: density(frames),
    confidence: a.confidence,
    raw: a.raw,
    offsetMs: a.offsetMs,
    sections: a.correction.sections.length,
  })
  const asIs = fit(frames, cues)
  rows.push(row('as is', asIs))
  const truth = cues.map((c) => applyCorrection(asIs.correction, c.start))

  const moved = (kind: Row['kind'], d: Distortion) => {
    const input = distort(cues, d)
    const a = fit(frames, input)
    const errors = input
      .map((c, j) => Math.abs(applyCorrection(a.correction, c.start) - (truth[j] as number)))
      .sort((x, y) => x - y)
    rows.push({
      ...row(kind, a),
      p90Ms: Math.round(errors[Math.floor(errors.length * 0.9)] ?? 0),
      over500: errors.filter((e) => e > 500).length,
    })
  }
  moved('moved', { ratio: 25 / 23.976, offsetMs: 2_500 })
  moved('cut', {
    offsetMs: 1_500,
    splits: [{ from: Math.floor(cues.length / 2), offsetMs: 3_000 }],
  })

  // two other films' subtitles, and the film's own lines at random times
  for (const step of [1, 7]) {
    const other = usable[(i + step) % usable.length] as Film
    if (other !== film) rows.push(row('another film', fit(frames, cuesOf(other))))
  }
  const next = random(i + 1)
  const span = frames.length * 10
  rows.push(
    row(
      'scattered',
      fit(
        frames,
        cues.map((c) => {
          const start = Math.round(next() * Math.max(0, span - (c.end - c.start)))
          return { ...c, start, end: start + c.end - c.start }
        }),
      ),
    ),
  )
  console.error(`  aligned ${film.name}`)
})

if (values.out) writeFileSync(values.out, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`)

const n = (x: number, d = 2) => x.toFixed(d).padStart(6)
console.log(
  `${'film'.padEnd(44)} ${'kind'.padEnd(13)} ${'cues'.padStart(5)} speech   lift  sigma clarity  cover   conf  p90 ms  >500`,
)
for (const r of rows)
  console.log(
    `${r.film.slice(0, 44).padEnd(44)} ${r.kind.padEnd(13)} ${String(r.cues).padStart(5)} ${n(r.speech)} ${n(r.raw.lift, 3)} ${n(r.raw.significance, 1)} ${n(r.raw.clarity, 3)} ${n(r.raw.coverage)} ${n(r.confidence)} ${String(r.p90Ms ?? '').padStart(7)} ${String(r.over500 ?? '').padStart(5)}`,
  )

// A film's own fit is the truth only when the engine brings a moved copy back to it. A right
// subtitle counts as placed when its own cues land within half a second of that fit.
const verified = new Set(
  rows.filter((r) => r.kind === 'moved' && (r.p90Ms ?? 0) <= 500).map((r) => r.film),
)
const right = rows.filter((r) => ['as is', 'moved', 'cut'].includes(r.kind))
const placed = right.filter((r) => verified.has(r.film) && (r.p90Ms ?? 0) <= 500)
const misplaced = right.filter((r) => verified.has(r.film) && (r.p90Ms ?? 0) > 500)
const unverified = right.filter((r) => !verified.has(r.film))
const wrong = rows.filter((r) => !['as is', 'moved', 'cut'].includes(r.kind))
const kept = (rs: Row[]) => `${rs.filter((r) => r.confidence >= 0.7).length} of ${rs.length}`
const range = (rs: Row[]) => {
  const v = rs.map((r) => r.raw.significance).sort((x, y) => x - y)
  return v.length ? `${v[0]?.toFixed(1)} to ${v.at(-1)?.toFixed(1)}` : 'none'
}
console.log(`
kept (confidence 0.7 or more), and the overlap's significance:
  right subtitles, placed:            ${kept(placed).padEnd(10)} ${range(placed)}
  right subtitles, misplaced:         ${kept(misplaced).padEnd(10)} ${range(misplaced)}
  films whose fit can't be verified:  ${kept(unverified).padEnd(10)} ${range(unverified)}  (${[...new Set(unverified.map((r) => r.film))].join(', ') || 'none'})
  wrong subtitles:                    ${kept(wrong).padEnd(10)} ${range(wrong)}`)
