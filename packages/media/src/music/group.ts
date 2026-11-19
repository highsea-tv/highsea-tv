// SPDX-License-Identifier: AGPL-3.0-only
// One album folder's tracks read as one album, from their tags (Phase 5 D, the owner's answer 10:
// tags first). Pure, so every rule is tested without files:
//
// - The album is the tracks' album tag. Tracks without one join it when every other track agrees;
//   two albums in one folder, or none, set the folder aside with its reason (`many-albums`,
//   `no-album`, or `no-tags` when the files carry no tags at all).
// - The album artist is the album artist tag (ID3's `TPE2`, Vorbis' `ALBUMARTIST`), else the one
//   track artist they share, else "Various Artists", as Picard's compilations are tagged
//   (https://picard-docs.musicbrainz.org/en/config/options_releases.html).
// - A track's disc is its disc tag, else its `CD2` folder's number, else 1; its number is the track
//   tag, else the leading digits of its name (`01 Girls & Boys`, `Blur_Parklife_01_…`), else its
//   place in the folder.
// - The MusicBrainz ids are those most of the tracks carry, else `album.nfo`'s.
import { basename, extname } from 'node:path'
import { albumKindOf } from '@highsea-tv/metadata'
import { fold } from '../shared/fold.ts'
import type { FoundTrack, NfoIds } from './folders.ts'
import type { TrackRead } from './tags.ts'

export const VARIOUS_ARTISTS = 'Various Artists'

export type GroupedTrack = {
  found: FoundTrack
  read: TrackRead
  disc: number
  number: number
  title: string
  /** The track's own artist when it isn't the album's. */
  artist: string | null
}

export type GroupedAlbum = {
  title: string
  artist: string
  artistMusicBrainzId: string | null
  year: number | null
  /** `YYYY-MM-DD` only; a bare year is `year`. */
  released: string | null
  kind: 'album' | 'ep' | 'single' | 'soundtrack' | 'compilation'
  label: string | null
  genres: string[]
  releaseId: string | null
  releaseGroupId: string | null
  /** A track whose file carries its cover. */
  embeddedCover: string | null
  tracks: GroupedTrack[]
}

export type GroupOutcome =
  | { ok: true; album: GroupedAlbum }
  | { ok: false; reason: 'no-tags' | 'no-album' | 'many-albums' | 'unreadable' }

/** The value most of them have (the first such, in file order); null when none has one. */
function most<T>(values: (T | null | undefined)[], key: (v: T) => string = String): T | null {
  const counts = new Map<string, { value: T; n: number }>()
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue
    const k = key(v)
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { value: v, n: 1 })
  }
  let best: { value: T; n: number } | null = null
  for (const c of counts.values()) if (!best || c.n > best.n) best = c
  return best?.value ?? null
}

/** `01 - Title`, `01. Title`, `1-03 Title`, `Blur_Parklife_01_Girls & Boys`: the track's number. */
export function numberFromName(path: string): number | null {
  const stem = basename(path, extname(path))
  const lead = /^(?:\d{1,2}[-.])?(\d{1,3})(?=[\s._-]|$)/.exec(stem)
  const inner = lead ? null : /_(\d{1,3})_/.exec(stem)
  const n = Number((lead ?? inner)?.[1] ?? 0)
  return n > 0 ? n : null
}

/** The file's name without its number and separators, for a track with no title tag. */
export function titleFromName(path: string): string {
  const stem = basename(path, extname(path))
  const parts = stem.split('_')
  // `Artist_Album_01_Title`: what follows the number
  const at = parts.findIndex((p) => /^\d{1,3}$/.test(p))
  const rest = at >= 0 && at < parts.length - 1 ? parts.slice(at + 1).join(' ') : stem
  return rest.replace(/^\s*(?:\d{1,2}[-.])?\d{1,3}\s*[-._]?\s*/, '').trim() || stem
}

const albumKey = (s: string) => fold(s)

const fullDate = (s: string | null) => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s ?? '')
  return m ? (m[1] as string) : null
}

const KINDS = new Set(['album', 'ep', 'single', 'soundtrack', 'compilation'])

/** Reads one folder's tracks as one album, or says why it can't. */
export function groupAlbum(
  reads: { found: FoundTrack; read: TrackRead | null }[],
  nfo: NfoIds,
): GroupOutcome {
  const readable = reads.filter((r): r is { found: FoundTrack; read: TrackRead } => !!r.read)
  if (readable.length === 0) return { ok: false, reason: 'unreadable' }
  const tags = readable.map((r) => r.read.tags)
  const albums = new Set(
    tags
      .map((t) => t.album)
      .filter((a): a is string => !!a)
      .map(albumKey),
  )
  if (albums.size > 1) return { ok: false, reason: 'many-albums' }
  if (albums.size === 0) {
    const anyTags = tags.some((t) => t.title || t.artist || t.albumArtist || t.track)
    return { ok: false, reason: anyTags ? 'no-album' : 'no-tags' }
  }
  const title = most(tags.map((t) => t.album)) as string

  const trackArtists = new Set(
    tags
      .map((t) => t.artist)
      .filter(Boolean)
      .map((a) => fold(a as string)),
  )
  const compilation = tags.some((t) => t.compilation)
  const artist =
    most(tags.map((t) => t.albumArtist)) ??
    (trackArtists.size === 1 && !compilation ? most(tags.map((t) => t.artist)) : null) ??
    VARIOUS_ARTISTS
  const date = most(tags.map((t) => t.date))
  const year = most(tags.map((t) => t.year))
  const types = most(
    tags.map((t) => (t.releaseTypes.length ? t.releaseTypes : null)),
    (v) => v.join('/'),
  )
  const primary = types?.find((t) => KINDS.has(t) && t !== 'soundtrack' && t !== 'compilation')
  const kind = compilation
    ? 'compilation'
    : albumKindOf(
        primary ?? null,
        (types ?? []).filter((t) => t === 'soundtrack' || t === 'compilation'),
      )

  const genreCounts = new Map<string, { name: string; n: number }>()
  for (const t of tags)
    for (const g of new Set(t.genres)) {
      const k = fold(g)
      const c = genreCounts.get(k)
      if (c) c.n++
      else genreCounts.set(k, { name: g, n: 1 })
    }
  const genres = [...genreCounts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((g) => g.name)

  const tracks: GroupedTrack[] = readable.map((r, i) => {
    const own = r.read.tags.artist
    return {
      found: r.found,
      read: r.read,
      disc: r.read.tags.disc ?? r.found.discOfFolder ?? 1,
      number: r.read.tags.track ?? numberFromName(r.found.path) ?? i + 1,
      title: r.read.tags.title ?? titleFromName(r.found.path),
      artist: own && fold(own) !== fold(artist) ? own : null,
    }
  })
  tracks.sort(
    (a, b) => a.disc - b.disc || a.number - b.number || a.found.path.localeCompare(b.found.path),
  )

  const mb = tags.map((t) => t.musicBrainz)
  return {
    ok: true,
    album: {
      title,
      artist,
      artistMusicBrainzId:
        artist === VARIOUS_ARTISTS ? null : (most(mb.map((m) => m.albumArtistId)) ?? nfo.artistId),
      year: year ?? null,
      released: fullDate(date),
      kind,
      label: most(tags.map((t) => t.label)),
      genres,
      releaseId: most(mb.map((m) => m.releaseId)) ?? nfo.releaseId,
      releaseGroupId: most(mb.map((m) => m.releaseGroupId)) ?? nfo.releaseGroupId,
      embeddedCover: readable.find((r) => r.read.audio.embeddedCover)?.found.path ?? null,
      tracks,
    },
  }
}

/**
 * How an artist is found again by name: folded, a leading "The" dropped and a trailing ", The"
 * read the same, so "The Beatles", "Beatles, The" and "the beatles" are one artist.
 */
export function artistKey(name: string): string {
  const f = fold(name).replace(/,\s*the$/, '')
  return f.replace(/^the\s+(?=\S)/, '') || f
}
