// SPDX-License-Identifier: AGPL-3.0-only
// MusicBrainz and the Cover Art Archive for the albums and artists whose tags (or NFOs) carry their
// ids (Phase 5 D, the owner's answer 10): there's no searching MusicBrainz by name, so an album
// without an id keeps what its tags say. The `music.metadata` job goes through every album and
// artist with an id after a scan; the metadata service's cache answers what it asked lately, so
// only what's new or a month old is asked for, at MusicBrainz's one request a second.
//
// An album: its release (the tags' `MUSICBRAINZ_ALBUMID`) gives the label, the date and the release
// group; the release group its kind, first release date and genres; the Cover Art Archive the
// group's front cover, asked for only when the folder and the files have none. An artist: their
// sort name and genres. The names and titles stay the tags', as the owner's files have them.
import { schema } from '@highsea-tv/db'
import { eq, isNotNull, or } from 'drizzle-orm'
import { announce, type MusicDeps } from './context.ts'

const { musicAlbums, musicArtists } = schema

export const MUSIC_METADATA_JOB = 'music.metadata'

export type MusicMetadataResult = { albums: number; artists: number; stopped: boolean }

const yearOf = (date: string | null) => {
  const y = Number(/^(\d{4})/.exec(date ?? '')?.[1])
  return y > 0 ? y : null
}
const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

export function createMusicMetadata(ctx: MusicDeps) {
  const { db, clock } = ctx
  const log = ctx.logger.child('music-metadata')
  const music = ctx.metadata.music

  /** Looks every album and artist with an id up; stops early while MusicBrainz is resting. */
  async function refresh({
    force = false,
  }: {
    force?: boolean
  } = {}): Promise<MusicMetadataResult> {
    const result: MusicMetadataResult = { albums: 0, artists: 0, stopped: false }
    const changed: string[] = []
    const albums = db
      .select()
      .from(musicAlbums)
      .where(or(isNotNull(musicAlbums.releaseId), isNotNull(musicAlbums.releaseGroupId)))
      .all()
    for (const album of albums) {
      if (music.resting()) {
        result.stopped = true
        break
      }
      const release = album.releaseId ? await music.release(album.releaseId, { force }) : null
      const groupId = release?.releaseGroupId ?? album.releaseGroupId
      const group = groupId ? await music.releaseGroup(groupId, { force }) : null
      if (!release && !group) continue
      const cover =
        groupId && !album.coverFile && !album.embeddedCover
          ? await music.cover(groupId, { force })
          : album.coverUrl
      const released = group?.firstReleaseDate ?? release?.date ?? null
      const next = {
        releaseGroupId: groupId,
        released: released && /^\d{4}-\d{2}-\d{2}$/.test(released) ? released : album.released,
        year: yearOf(released) ?? album.year,
        kind: group?.kind ?? album.kind,
        label: release?.label ?? album.label,
        genres: group?.genres.length
          ? group.genres
          : release?.genres.length
            ? release.genres
            : album.genres,
        coverUrl: cover ?? null,
        source: 'musicbrainz' as const,
      }
      const same =
        next.releaseGroupId === album.releaseGroupId &&
        next.released === album.released &&
        next.year === album.year &&
        next.kind === album.kind &&
        next.label === album.label &&
        sameList(next.genres, album.genres) &&
        next.coverUrl === album.coverUrl &&
        album.source === 'musicbrainz'
      if (same) continue
      db.update(musicAlbums)
        .set({ ...next, updatedAt: clock.now() })
        .where(eq(musicAlbums.id, album.id))
        .run()
      changed.push(album.id)
      result.albums++
    }

    const artists = result.stopped
      ? []
      : db.select().from(musicArtists).where(isNotNull(musicArtists.musicBrainzId)).all()
    for (const artist of artists) {
      if (music.resting()) {
        result.stopped = true
        break
      }
      const found = await music.artist(artist.musicBrainzId as string, { force })
      if (!found) continue
      const sortName = found.sortName.trim()
        ? found.sortName.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
        : artist.sortName
      const genres = found.genres.length ? found.genres : artist.genres
      if (
        sortName === artist.sortName &&
        sameList(genres, artist.genres) &&
        artist.source === 'musicbrainz'
      )
        continue
      db.update(musicArtists)
        .set({ sortName, genres, source: 'musicbrainz', updatedAt: clock.now() })
        .where(eq(musicArtists.id, artist.id))
        .run()
      changed.push(artist.id)
      result.artists++
    }
    announce(ctx.events, changed)
    if (result.stopped) log.info('MusicBrainz is resting; the next scan carries on', result)
    return result
  }

  return { refresh }
}
