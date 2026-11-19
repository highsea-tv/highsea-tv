// SPDX-License-Identifier: AGPL-3.0-only
// MusicBrainz's and the Cover Art Archive's answers, cached and mapped (Phase 5 D, ADR 0065). The
// raw answer is kept in `musicbrainz_cache` by kind and id, as TMDB's are kept (ADR 0030), and
// mapped on read. A row older than 30 days is asked for again; when that fails the old row keeps
// serving. A 404 is kept as an empty row, so an id MusicBrainz doesn't know isn't asked about on
// every scan. MusicBrainz's data is CC0 and the Cover Art Archive's list is only addresses, so
// there's no cache limit beyond freshness (https://musicbrainz.org/doc/About/Data_License).
//
// The shapes read are the documented JSON of the lookups (https://musicbrainz.org/doc/MusicBrainz_API):
// an artist's `name`, `sort-name` and `genres`; a release group's `primary-type`,
// `secondary-types`, `first-release-date`, `genres` and `artist-credit`; a release's `date`,
// `release-group` and `label-info`. The Cover Art Archive's list is `images` with `front`, `image`
// and `thumbnails` (https://musicbrainz.org/doc/Cover_Art_Archive/API).
import type { Clock, Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import { MBID, type MusicBrainzClient } from './client.ts'

const { musicBrainzCache } = schema
const DAY = 24 * 60 * 60 * 1000
/** How long an answer is used before it's asked for again. */
export const MUSICBRAINZ_FRESH_MS = 30 * DAY

type Genre = { name?: string; count?: number }
type RawArtist = {
  id: string
  name?: string
  'sort-name'?: string
  type?: string | null
  country?: string | null
  disambiguation?: string
  genres?: Genre[]
}
type RawReleaseGroup = {
  id: string
  title?: string
  'primary-type'?: string | null
  'secondary-types'?: string[]
  'first-release-date'?: string
  genres?: Genre[]
  'artist-credit'?: { artist?: { id?: string; name?: string } }[]
}
type RawRelease = {
  id: string
  title?: string
  date?: string
  'release-group'?: RawReleaseGroup
  'label-info'?: { label?: { name?: string } | null }[]
  genres?: Genre[]
}
type RawCoverArt = {
  images?: {
    front?: boolean
    image?: string
    thumbnails?: Record<string, string | undefined>
  }[]
}

/** The contract's `ALBUM_KINDS`. */
export type MusicAlbumKind = 'album' | 'ep' | 'single' | 'soundtrack' | 'compilation'

export type MusicBrainzArtist = {
  id: string
  name: string
  sortName: string
  genres: string[]
}

export type MusicBrainzReleaseGroup = {
  id: string
  title: string
  kind: MusicAlbumKind
  /** `YYYY-MM-DD`, `YYYY-MM` or `YYYY`; null when MusicBrainz has none. */
  firstReleaseDate: string | null
  genres: string[]
  /** The first credited artist's id. */
  artistId: string | null
}

export type MusicBrainzRelease = {
  id: string
  title: string
  date: string | null
  releaseGroupId: string | null
  label: string | null
  genres: string[]
}

/** The most voted genres first, as MusicBrainz counts them; at most five. */
const genresOf = (genres: Genre[] | undefined): string[] =>
  [...(genres ?? [])]
    .filter((g) => typeof g.name === 'string' && g.name.trim())
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 5)
    .map((g) => (g.name as string).replace(/\b\w/g, (c) => c.toUpperCase()))

/**
 * MusicBrainz's types as the contract's kinds: a soundtrack or compilation by its secondary type
 * first (as Plexamp groups them), then an EP or single by its primary type, else an album
 * (https://musicbrainz.org/doc/Release_Group/Type).
 */
export function albumKindOf(primary: string | null | undefined, secondary: string[] = []) {
  const s = secondary.map((t) => t.toLowerCase())
  if (s.includes('soundtrack')) return 'soundtrack' as const
  if (s.includes('compilation')) return 'compilation' as const
  const p = (primary ?? '').toLowerCase()
  if (p === 'ep') return 'ep' as const
  if (p === 'single') return 'single' as const
  return 'album' as const
}

const day = (s: string | undefined | null) => (s && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s) ? s : null)

export const mapArtist = (r: RawArtist): MusicBrainzArtist => ({
  id: r.id,
  name: r.name ?? '',
  sortName: r['sort-name'] || r.name || '',
  genres: genresOf(r.genres),
})

export const mapReleaseGroup = (r: RawReleaseGroup): MusicBrainzReleaseGroup => ({
  id: r.id,
  title: r.title ?? '',
  kind: albumKindOf(r['primary-type'], r['secondary-types']),
  firstReleaseDate: day(r['first-release-date']),
  genres: genresOf(r.genres),
  artistId: r['artist-credit']?.[0]?.artist?.id ?? null,
})

export const mapRelease = (r: RawRelease): MusicBrainzRelease => ({
  id: r.id,
  title: r.title ?? '',
  date: day(r.date),
  releaseGroupId: r['release-group']?.id ?? null,
  label: r['label-info']?.find((l) => l.label?.name)?.label?.name ?? null,
  genres: genresOf(r.genres),
})

/** The front cover's 500-pixel thumbnail (or the image when there's none), over https. */
export function frontCover(r: RawCoverArt): string | null {
  const front = r.images?.find((i) => i.front) ?? null
  const url = front?.thumbnails?.['500'] ?? front?.thumbnails?.large ?? front?.image ?? null
  return url ? url.replace(/^http:\/\//, 'https://') : null
}

export function createMusicBrainzSource(deps: {
  db: Db
  clock: Clock
  logger: Logger
  client: MusicBrainzClient
}) {
  const { db, clock, client } = deps
  const log = deps.logger.child('musicbrainz')

  type Kind = (typeof schema.MUSICBRAINZ_KINDS)[number]

  const row = (kind: Kind, mbid: string) =>
    db
      .select()
      .from(musicBrainzCache)
      .where(and(eq(musicBrainzCache.kind, kind), eq(musicBrainzCache.mbid, mbid)))
      .get()

  function store(kind: Kind, mbid: string, data: unknown) {
    const values = { kind, mbid, data: data ?? null, fetchedAt: clock.now() }
    db.insert(musicBrainzCache)
      .values(values)
      .onConflictDoUpdate({
        target: [musicBrainzCache.kind, musicBrainzCache.mbid],
        set: { data: values.data, fetchedAt: values.fetchedAt },
      })
      .run()
  }

  /**
   * The cached answer when it's fresh, else asked for now; on a failure the cached one, stale or
   * not, else null. `force` asks even when the row is fresh (Refresh metadata).
   */
  async function cached<T>(
    kind: Kind,
    mbid: string,
    ask: () => Promise<T | null>,
    force = false,
  ): Promise<T | null> {
    const id = mbid.toLowerCase()
    if (!MBID.test(id)) return null
    const have = row(kind, id)
    if (have && !force && clock.now() - have.fetchedAt < MUSICBRAINZ_FRESH_MS)
      return have.data as T | null
    try {
      const data = await ask()
      store(kind, id, data)
      return data
    } catch (e) {
      log.info('kept MusicBrainz’s cached answer', { kind, mbid: id, error: (e as Error).message })
      return (have?.data as T | null) ?? null
    }
  }

  return {
    async artist(mbid: string, { force = false } = {}) {
      const r = await cached<RawArtist>(
        'artist',
        mbid,
        () => client.lookup('artist', mbid.toLowerCase()),
        force,
      )
      return r ? mapArtist(r) : null
    },
    async releaseGroup(mbid: string, { force = false } = {}) {
      const r = await cached<RawReleaseGroup>(
        'release-group',
        mbid,
        () => client.lookup('release-group', mbid.toLowerCase()),
        force,
      )
      return r ? mapReleaseGroup(r) : null
    },
    async release(mbid: string, { force = false } = {}) {
      const r = await cached<RawRelease>(
        'release',
        mbid,
        () => client.lookup('release', mbid.toLowerCase()),
        force,
      )
      return r ? mapRelease(r) : null
    },
    /** The release group's front cover on the Cover Art Archive, or null. */
    async cover(releaseGroupId: string, { force = false } = {}) {
      const r = await cached<RawCoverArt>(
        'cover',
        releaseGroupId,
        () => client.coverArt(releaseGroupId.toLowerCase()),
        force,
      )
      return r ? frontCover(r) : null
    },
    /** A cover's bytes from the Cover Art Archive, at an address `cover` gave. */
    coverImage: client.image,
    /** Whether MusicBrainz is resting after a failure. */
    resting: client.resting,
  }
}

export type MusicBrainzSource = ReturnType<typeof createMusicBrainzSource>
