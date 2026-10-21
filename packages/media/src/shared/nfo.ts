// SPDX-License-Identifier: AGPL-3.0-only
// Kodi's movie NFO (checkpoint 6, NFO, artwork, permissions and the recycle bin): `<movie>` with the
// tags Kodi documents (Kodi wiki, NFO files/Movies: https://kodi.wiki/view/NFO_files/Movies) and the
// probe's `fileinfo/streamdetails`, named `<file>.nfo` beside the film. The artwork beside it is
// `poster.jpg` and `fanart.jpg` in the movie's folder (Kodi wiki, Movie artwork:
// https://kodi.wiki/view/Movie_artwork). Written beside and renamed, so a reader never sees half.
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { newId } from '@highsea/core'
import type { MediaInfo } from './probe.ts'

export type NfoMovie = {
  title: string
  originalTitle: string | null
  sortTitle: string | null
  /** TMDB's 0–10 average and its vote count. */
  rating: number | null
  votes: number | null
  plot: string | null
  runtimeMinutes: number | null
  tmdbId: number
  imdbId: string | null
  genres: string[]
  collection: string | null
  /** `YYYY-MM-DD`. */
  premiered: string | null
  directors: string[]
  actors: { name: string; role: string | null }[]
}

const xml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 forbids these characters
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

const el = (name: string, value: string | number | null | undefined, attrs = '') =>
  value === null || value === undefined || value === ''
    ? ''
    : `<${name}${attrs}>${xml(String(value))}</${name}>`

/** Kodi's `hdrtype`: `dolbyvision`, `hdr10` or `hlg`, empty for SDR. */
function hdrType(info: MediaInfo): string {
  const h = info.video?.hdr ?? 'none'
  if (h.startsWith('dv')) return 'dolbyvision'
  if (h === 'hlg') return 'hlg'
  return h === 'none' ? '' : 'hdr10'
}

function streamDetails(info: MediaInfo): string {
  const v = info.video
  const video = v
    ? `<video>${el('codec', v.codec)}${el('aspect', v.height ? (v.width / v.height).toFixed(2) : null)}${el('width', v.width)}${el('height', v.height)}${el('durationinseconds', info.duration ? Math.round(info.duration) : null)}${el('hdrtype', hdrType(info))}</video>`
    : ''
  const audio = info.audio
    .map(
      (a) =>
        `<audio>${el('codec', a.codec)}${el('language', a.language)}${el('channels', a.channels)}</audio>`,
    )
    .join('')
  const subs = info.subtitles
    .map((s) => `<subtitle>${el('language', s.language)}</subtitle>`)
    .join('')
  return `<fileinfo><streamdetails>${video}${audio}${subs}</streamdetails></fileinfo>`
}

/** The NFO's text. */
export function movieNfo(movie: NfoMovie, info: MediaInfo | null): string {
  const lines = [
    el('title', movie.title),
    el('originaltitle', movie.originalTitle),
    el('sorttitle', movie.sortTitle),
    movie.rating !== null
      ? `<ratings><rating name="themoviedb" max="10" default="true">${el('value', movie.rating)}${el('votes', movie.votes)}</rating></ratings>`
      : '',
    el('plot', movie.plot),
    el('runtime', movie.runtimeMinutes),
    el('uniqueid', movie.tmdbId, ' type="tmdb" default="true"'),
    el('uniqueid', movie.imdbId, ' type="imdb"'),
    ...movie.genres.map((g) => el('genre', g)),
    movie.collection ? `<set>${el('name', movie.collection)}</set>` : '',
    el('premiered', movie.premiered),
    ...movie.directors.map((d) => el('director', d)),
    ...movie.actors.map(
      (a, order) =>
        `<actor>${el('name', a.name)}${el('role', a.role)}${el('order', order)}</actor>`,
    ),
    info ? streamDetails(info) : '',
  ]
  const body = lines
    .filter(Boolean)
    .map((l) => `  ${l}`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>\n<movie>\n${body}\n</movie>\n`
}

/** `Film (2010) Bluray-1080p.mkv` → `Film (2010) Bluray-1080p.nfo`. */
export const nfoPath = (file: string) => join(dirname(file), `${basename(file, extname(file))}.nfo`)

async function writeWhole(path: string, data: string | Uint8Array) {
  const temp = join(dirname(path), `.${basename(path)}.${newId('tmp')}.part`)
  await fsp.writeFile(temp, data)
  await fsp.rename(temp, path)
}

/** Writes the NFO beside the film. Safe to repeat: it's written whole each time. */
export async function writeNfo(file: string, movie: NfoMovie, info: MediaInfo | null) {
  const path = nfoPath(file)
  await writeWhole(path, movieNfo(movie, info))
  return path
}

/**
 * Copies cached artwork into the movie's folder as `poster.jpg` and `fanart.jpg`. An image that
 * isn't cached (or fails to load) is left out; artwork never fails an import.
 */
export async function writeArtwork(
  folder: string,
  images: { poster: string | null; fanart: string | null },
): Promise<string[]> {
  const written: string[] = []
  for (const [name, source] of [
    ['poster.jpg', images.poster],
    ['fanart.jpg', images.fanart],
  ] as const) {
    if (!source) continue
    try {
      await writeWhole(join(folder, name), await fsp.readFile(source))
      written.push(name)
    } catch {
      // the cached file went missing; the next import or refresh writes it
    }
  }
  return written
}
