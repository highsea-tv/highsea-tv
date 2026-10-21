// SPDX-License-Identifier: AGPL-3.0-only
// The fake providers' data: the made-up accounts and keys (obviously fake, never a real one), the
// subtitles a test adds, and the ones the fake makes up for any movie so the sweeps show results
// for any library. Everything made up is deterministic from the query.
import { languageName } from '../../src/shared/languages.ts'
import type { ProviderId } from '../../src/shared/types.ts'

export const FAKE_OPENSUBTITLES_KEY = 'fake-opensubtitles-consumer-key'

export const FAKE_ACCOUNTS = {
  opensubtitles: { username: 'highsea', password: 'fake-password' },
  subdl: { apiKey: 'fake-subdl-key' },
  subsource: { apiKey: 'fake-subsource-key' },
} as const

export type FakeSubtitle = {
  provider: ProviderId
  tmdbId: number
  imdbId?: string
  /** A profile code (`en`, `pt-BR`, `zh-Hans`). */
  language: string
  releaseName: string
  releases?: string[]
  hi?: boolean
  forced?: boolean
  moviehash?: string
  /** AI-translated, where the provider says. */
  translated?: boolean
  downloads?: number
  /** The file's text; a short generated subtitle by default. */
  content?: string
  format?: 'srt' | 'ass' | 'vtt'
}

/** A subtitle the fake serves: the added or made-up one, its id and its file. */
export type FakeEntry = Required<Omit<FakeSubtitle, 'imdbId' | 'moviehash'>> & {
  imdbId: string | null
  moviehash: string | null
  id: number
}

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  opensubtitles: 'OpenSubtitles.com',
  subdl: 'Subdl',
  subsource: 'SubSource',
}

/** FNV-1a, 32 bits: ids and choices that are the same every run. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

const srtTime = (ms: number, sep: ',' | '.') => {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor(ms / 60_000) % 60
  const s = Math.floor(ms / 1000) % 60
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms % 1000, 3)}`
}

const assTime = (ms: number) => {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor(ms / 60_000) % 60
  const s = Math.floor(ms / 1000) % 60
  const cs = Math.floor((ms % 1000) / 10)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/** A small, valid subtitle that says which language and provider it came from. */
export function makeSubtitleText(
  sub: Pick<FakeSubtitle, 'provider' | 'language' | 'releaseName'>,
  format: 'srt' | 'ass' | 'vtt' = 'srt',
): string {
  const lines = [
    `${languageName(sub.language)} subtitles from ${PROVIDER_NAMES[sub.provider]}.`,
    `Made for ${sub.releaseName}.`,
    'A fake subtitle, for testing.',
  ]
  const cues = lines.map((text, i) => ({ start: 1000 + i * 4000, end: 3500 + i * 4000, text }))
  if (format === 'vtt')
    return `WEBVTT\n\n${cues
      .map((c) => `${srtTime(c.start, '.')} --> ${srtTime(c.end, '.')}\n${c.text}\n`)
      .join('\n')}`
  if (format === 'ass')
    return [
      '[Script Info]',
      'ScriptType: v4.00+',
      'PlayResX: 1920',
      'PlayResY: 1080',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...cues.map(
        (c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.text}`,
      ),
      '',
    ].join('\n')
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start, ',')} --> ${srtTime(c.end, ',')}\n${c.text}\n`)
    .join('\n')
}

const TEMPLATES = [
  { quality: '1080p.BluRay.x264', group: 'SPARKS' },
  { quality: '720p.WEB-DL.DD5.1.H.264', group: 'NTb' },
  { quality: '2160p.UHD.BluRay.x265.10bit.HDR', group: 'TERMiNAL' },
  { quality: '1080p.WEBRip.x264', group: 'RARBG' },
  { quality: 'BDRip.x264', group: 'GECKOS' },
]

/**
 * The subtitles the fake makes up for a movie in one language: three, the third for the hearing
 * impaired, and on OpenSubtitles.com the first matching the file's hash and a fourth that's
 * AI-translated (which highsea's search leaves out).
 */
export function generated(
  provider: ProviderId,
  movie: { tmdbId: number; imdbId: string | null; year: number | null },
  language: string,
  moviehash: string | null,
): FakeSubtitle[] {
  const seed = hash(`${provider}|${movie.tmdbId}|${language}`)
  const year = movie.year ?? 2010
  const pick = (i: number) => TEMPLATES[(seed + i) % TEMPLATES.length] as (typeof TEMPLATES)[number]
  const subs: FakeSubtitle[] = [0, 1, 2].map((i) => {
    const t = pick(i)
    const releaseName = `Fake.Movie.${year}.${t.quality}-${t.group}`
    return {
      provider,
      tmdbId: movie.tmdbId,
      ...(movie.imdbId ? { imdbId: movie.imdbId } : {}),
      language,
      releaseName,
      releases: [releaseName, `Fake.Movie.${year}.${pick(i + 3).quality}-${pick(i + 3).group}`],
      hi: i === 2,
      downloads: 900 - i * 250 + (seed % 97),
      ...(i === 0 && moviehash && provider === 'opensubtitles' ? { moviehash } : {}),
    }
  })
  if (provider === 'opensubtitles')
    subs.push({
      provider,
      tmdbId: movie.tmdbId,
      language,
      releaseName: `Fake.Movie.${year}.1080p.BluRay.x264-AITRANSLATED`,
      translated: true,
      downloads: 5000,
    })
  return subs
}

export function entryFor(sub: FakeSubtitle, id: number): FakeEntry {
  const format = sub.format ?? 'srt'
  return {
    provider: sub.provider,
    tmdbId: sub.tmdbId,
    imdbId: sub.imdbId ?? null,
    language: sub.language,
    releaseName: sub.releaseName,
    releases: sub.releases ?? [sub.releaseName],
    hi: sub.hi ?? false,
    forced: sub.forced ?? false,
    moviehash: sub.moviehash ?? null,
    translated: sub.translated ?? false,
    downloads: sub.downloads ?? 100,
    format,
    content: sub.content ?? makeSubtitleText(sub, format),
    id,
  }
}
