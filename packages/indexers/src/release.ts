// SPDX-License-Identifier: AGPL-3.0-only
// One search result, as every kind of indexer is normalized to before parsing and judging.
import { normalizeImdbId, parseDate, parseNumber, parseSize } from './values.ts'

export type IndexerRelease = {
  title: string
  /** Unique per indexer; the cache and checkpoint 6's grab key on it. */
  guid: string
  /** The .torrent or .nzb address. Never sent to clients: it can carry a passkey. */
  download: string | null
  magnet: string | null
  infohash: string | null
  /** The release's page on the site. */
  details: string | null
  /** Bytes. */
  size: number | null
  seeders: number | null
  leechers: number | null
  grabs: number | null
  files: number | null
  /** ISO. */
  published: string | null
  imdbId: string | null
  tmdbId: number | null
  /** Standard categories (2000, 2040…). */
  categories: number[]
  /** 0 is freeleech, 0.5 halfleech (Torznab's `downloadvolumefactor`). */
  downloadVolumeFactor: number | null
  uploadVolumeFactor: number | null
  minimumRatio: number | null
  /** Seconds. */
  minimumSeedTime: number | null
}

const int = (v: string | null | undefined) => {
  const n = parseNumber(v)
  return n === null ? null : Math.round(n)
}

/**
 * Builds a release from the text fields a definition read. Returns null when the row can't be
 * used: no title, or no way to fetch it.
 */
export function toRelease(
  fields: Readonly<Record<string, string | null | undefined>>,
  categories: number[],
  now: number,
): IndexerRelease | null {
  const title = fields.title?.trim()
  const download = fields.download?.trim() || null
  const magnet = fields.magnet?.trim() || null
  const infohash = fields.infohash?.trim().toLowerCase() || null
  if (!title || !(download || magnet || infohash)) return null
  const seeders = int(fields.seeders)
  const peers = int(fields.peers)
  let leechers = int(fields.leechers)
  // Torznab's peers counts seeders and leechers together
  if (leechers === null && peers !== null && seeders !== null)
    leechers = Math.max(0, peers - seeders)
  const tmdb = int(fields.tmdbId)
  return {
    title,
    guid: fields.guid?.trim() || download || magnet || (infohash as string),
    download,
    magnet,
    infohash,
    details: fields.details?.trim() || null,
    size: parseSize(fields.size),
    seeders,
    leechers,
    grabs: int(fields.grabs),
    files: int(fields.files),
    published: parseDate(fields.published, 'text', now),
    imdbId: normalizeImdbId(fields.imdbId),
    tmdbId: tmdb && tmdb > 0 ? tmdb : null,
    categories,
    downloadVolumeFactor: parseNumber(fields.downloadVolumeFactor),
    uploadVolumeFactor: parseNumber(fields.uploadVolumeFactor),
    minimumRatio: parseNumber(fields.minimumRatio),
    minimumSeedTime: int(fields.minimumSeedTime),
  }
}
