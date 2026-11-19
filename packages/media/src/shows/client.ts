// SPDX-License-Identifier: AGPL-3.0-only
// The shows library as the household's apps read it (client-shows.md, client-home.md; Phase 5 B,
// ADR 0064): every show with an episode to play, a show's page, an episode as a title on the films'
// own routes (`/items/episode/{id}`), Home's rows and Search's kinds, each with this profile's place
// (ADR 0054, 0068). The apps list what's on disk, as Plex lists a show's episodes: an episode with
// no file, or a season with none, isn't drawn. Specials are listed last and left out of the counts
// and of what Play picks, as the Apple TV app leaves them.
import type {
  ClientDetail,
  ClientEpisode,
  ClientItem,
  ClientShow,
  ClientShowDetail,
  ClientSubtitle,
  NextEpisode,
  SearchEpisode,
  SearchResults,
  SearchSection,
} from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { EpisodeMetadata, ShowMetadata } from '@highsea-tv/metadata'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { probeOf } from '../shared/file-facts.ts'
import {
  artOf,
  type ItemRow,
  isoOf,
  NO_ART,
  progressOf,
  stars,
  toApiCredit,
  toApiVideo,
} from '../shared/map.ts'
import { matchScore, rankByMatch, SEARCH_LIMIT, SEARCH_MOVIE_POOL } from '../shared/search.ts'
import { chunks, escapeLike } from '../shared/sql.ts'
import { audioTracks, versionDetail, versionQuality } from '../shared/tracks.ts'
import { createWatch, type Watcher } from '../shared/watch.ts'
import type { ShowsDeps } from './context.ts'

const {
  mediaItems,
  versions: versionsTable,
  mediaFiles,
  watchPositions,
  watchHistory,
  showDismissals,
} = schema

/** `watch.updated` (`PLAYBACK_TOPICS`), as films' watch state says it. */
export const WATCH_TOPIC = 'watch.updated'
/** Cards in a built-in Home row, as films' rows have. */
const ROW_MAX = 20
/** Shows in Recently added shows. */
const RECENT_SHOWS = 12

export const notAShow = () => new AppError('not-found', 'That show isn’t in the library.')
export const notAnEpisode = () => new AppError('not-found', 'That episode isn’t in the library.')

/** "S1, E2", or "Special 2", as the apps write an episode's place. */
export const episodeCode = (season: number, number: number) =>
  season === 0 ? `Special ${number}` : `S${season}, E${number}`

/** An episode with its file and this profile's place, as the reads put them together. */
export type Ep = {
  row: ItemRow
  versionId: string | null
  fileId: string | null
  position: { seconds: number; duration: number | null; at: number } | null
  played: { at: number } | null
  meta: EpisodeMetadata | null
}

/** Regular seasons in order, then the specials, each by number. */
const byPlace = (a: ItemRow, b: ItemRow) => {
  const sa = a.seasonNumber ?? 0
  const sb = b.seasonNumber ?? 0
  if (sa !== sb) return sa === 0 ? 1 : sb === 0 ? -1 : sa - sb
  return (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
}

export function createShowClient(ctx: ShowsDeps) {
  const { db, metadata, events } = ctx
  const watch = createWatch(ctx)

  // ---------------------------------------------------------------- rows

  const showByTmdb = (tmdbId: number) =>
    db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'show'), eq(mediaItems.tmdbId, tmdbId)))
      .get() ?? null

  const showRowOf = (tmdbId: number): ItemRow => {
    const row = showByTmdb(tmdbId)
    if (!row) throw notAShow()
    return row
  }

  /** The shows with an episode to play, by title. */

  /** Drizzle's raw `all` gives the columns' own names; the typed reads use these. */
  const rowsByIds = (ids: string[]): ItemRow[] => {
    const out: ItemRow[] = []
    for (const part of chunks(ids))
      out.push(...db.select().from(mediaItems).where(inArray(mediaItems.id, part)).all())
    return out
  }

  /** A raw query's show rows, read again through Drizzle so their columns are camel-cased. */
  const typed = (rows: { id: string }[]) => {
    const byId = new Map(rowsByIds(rows.map((r) => r.id)).map((r) => [r.id, r]))
    return rows.flatMap((r) => byId.get(r.id) ?? [])
  }

  /** The shows with an episode to play, by sort title. */
  const playableShows = (): ItemRow[] =>
    typed(
      db.all<{ id: string }>(sql`SELECT s.id FROM media_items s WHERE s.type = 'show' AND EXISTS (
        SELECT 1 FROM media_items e JOIN versions v ON v.item_id = e.id
        WHERE e.show_id = s.id AND e.type = 'episode' AND v.file_id IS NOT NULL)
      ORDER BY s.sort_title, s.id`),
    )

  /** Each show's metadata once per read. */
  function metas() {
    const seen = new Map<number, ShowMetadata | null>()
    return (tmdbId: number) => {
      if (!seen.has(tmdbId)) seen.set(tmdbId, metadata.cachedShow(tmdbId))
      return seen.get(tmdbId) ?? null
    }
  }

  const episodeMetaOf = (meta: ShowMetadata | null) => {
    const out = new Map<number, EpisodeMetadata>()
    for (const s of meta?.seasons ?? []) for (const e of s.episodes) out.set(e.id, e)
    return out
  }

  /**
   * The shows' episodes with their files and this profile's place, in order. `playable` keeps only
   * the episodes with a file.
   */
  function episodesOf(
    shows: ItemRow[],
    profileId: string,
    metaOf: (tmdbId: number) => ShowMetadata | null,
    { playable = true } = {},
  ): Map<string, Ep[]> {
    const out = new Map<string, Ep[]>()
    if (!shows.length) return out
    const rows: ItemRow[] = []
    for (const ids of chunks(shows.map((s) => s.id)))
      rows.push(
        ...db
          .select()
          .from(mediaItems)
          .where(and(eq(mediaItems.type, 'episode'), inArray(mediaItems.showId, ids)))
          .all(),
      )
    const ids = rows.map((r) => r.id)
    const versionOf = new Map<string, { id: string; fileId: string | null }>()
    const positions = new Map<string, Ep['position']>()
    const played = new Map<string, Ep['played']>()
    for (const part of chunks(ids)) {
      for (const v of db
        .select({
          id: versionsTable.id,
          itemId: versionsTable.itemId,
          fileId: versionsTable.fileId,
        })
        .from(versionsTable)
        .where(inArray(versionsTable.itemId, part))
        .orderBy(versionsTable.position)
        .all()) {
        const had = versionOf.get(v.itemId)
        if (!had || (!had.fileId && v.fileId)) versionOf.set(v.itemId, v)
      }
      for (const w of db
        .select()
        .from(watchPositions)
        .where(and(eq(watchPositions.profileId, profileId), inArray(watchPositions.itemId, part)))
        .all())
        positions.set(w.itemId, {
          seconds: w.positionSeconds,
          duration: w.durationSeconds,
          at: w.updatedAt,
        })
      for (const h of db
        .select()
        .from(watchHistory)
        .where(
          and(
            eq(watchHistory.profileId, profileId),
            eq(watchHistory.played, true),
            inArray(watchHistory.itemId, part),
          ),
        )
        .all())
        played.set(h.itemId, { at: h.lastPlayedAt ?? h.updatedAt })
    }
    const tmdbOf = new Map(shows.map((s) => [s.id, s.tmdbId]))
    const metaByShow = new Map<string, Map<number, EpisodeMetadata>>()
    for (const r of rows.sort(byPlace)) {
      const showId = r.showId as string
      const version = versionOf.get(r.id)
      if (playable && !version?.fileId) continue
      if (!metaByShow.has(showId))
        metaByShow.set(showId, episodeMetaOf(metaOf(tmdbOf.get(showId) ?? 0)))
      const list = out.get(showId) ?? []
      list.push({
        row: r,
        versionId: version?.id ?? null,
        fileId: version?.fileId ?? null,
        position: positions.get(r.id) ?? null,
        played: played.get(r.id) ?? null,
        meta: metaByShow.get(showId)?.get(r.tmdbId) ?? null,
      })
      out.set(showId, list)
    }
    return out
  }

  // ---------------------------------------------------------------- shapes

  const placeOf = (e: Ep) => {
    const state = progressOf(
      e.position
        ? { positionSeconds: e.position.seconds, durationSeconds: e.position.duration }
        : null,
    )
    return { ...state, watched: !!e.played }
  }

  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

  function episodeOf(show: ItemRow, meta: ShowMetadata | null, e: Ep): ClientEpisode {
    const place = placeOf(e)
    return {
      id: e.row.tmdbId,
      show: show.tmdbId,
      season: e.row.seasonNumber ?? 0,
      number: Math.max(1, e.row.episodeNumber ?? 1),
      title: e.row.title,
      synopsis: e.meta?.synopsis ?? '',
      runtimeMinutes: e.meta?.runtimeMinutes ?? meta?.runtimeMinutes ?? 0,
      aired: e.row.releaseDate ?? dayOf(e.row.addedAt),
      still: e.meta?.still ?? null,
      progress: place.progress,
      position: place.position,
      watched: place.watched,
    }
  }

  /**
   * What Play plays (`NextEpisode`): the episode part way, the latest one first; else the one after
   * the last watched, or the first one not watched; else the first, or, every one watched, the
   * first again. Specials only count for a show that has nothing else.
   */
  function nextOf(eps: Ep[]): { ep: Ep; kind: NextEpisode['kind'] } | null {
    const regular = eps.filter((e) => (e.row.seasonNumber ?? 0) > 0)
    const list = regular.length ? regular : eps
    if (!list.length) return null
    const resuming = list
      .filter((e) => placeOf(e).progress !== null)
      .sort((a, b) => (b.position?.at ?? 0) - (a.position?.at ?? 0))[0]
    if (resuming) return { ep: resuming, kind: 'resume' }
    const last = list
      .filter((e) => e.played)
      .sort((a, b) => (b.played?.at ?? 0) - (a.played?.at ?? 0))[0]
    if (!last) return { ep: list[0] as Ep, kind: 'start' }
    const after = list.slice(list.indexOf(last) + 1).find((e) => !e.played)
    const unwatched = after ?? list.find((e) => !e.played)
    return unwatched ? { ep: unwatched, kind: 'next' } : { ep: list[0] as Ep, kind: 'again' }
  }

  function showOf(show: ItemRow, meta: ShowMetadata | null, eps: Ep[]): ClientShow {
    const regular = eps.filter((e) => (e.row.seasonNumber ?? 0) > 0)
    const unwatched = regular.filter((e) => !e.played).length
    const next = nextOf(eps)
    return {
      id: show.tmdbId,
      title: show.title,
      sortTitle: show.sortTitle,
      year: meta?.year ?? show.year ?? 0,
      endYear: meta?.endYear ?? null,
      genres: meta?.genres ?? [],
      rating: stars(meta?.rating ?? show.rating),
      certification: meta?.certification ?? '',
      synopsis: meta?.synopsis ?? '',
      runtimeMinutes: meta?.runtimeMinutes ?? 0,
      seasons: new Set(regular.map((e) => e.row.seasonNumber)).size,
      episodes: regular.length,
      addedAt: isoOf(show.addedAt),
      art: meta ? artOf(meta.art) : NO_ART,
      unwatched,
      watched: regular.length > 0 && unwatched === 0,
      next: next ? { episode: episodeOf(show, meta, next.ep), kind: next.kind } : null,
    }
  }

  /** An episode as a title, for Home's cards, the player and Next up. */
  function episodeItem(show: ItemRow, meta: ShowMetadata | null, e: Ep): ClientItem {
    const place = placeOf(e)
    const season = e.row.seasonNumber ?? 0
    const art = meta ? artOf(meta.art) : NO_ART
    return {
      id: e.row.tmdbId,
      type: 'episode',
      title: e.row.title,
      year: e.row.year,
      runtimeMinutes: e.meta?.runtimeMinutes ?? meta?.runtimeMinutes ?? null,
      genres: meta?.genres ?? [],
      synopsis: e.meta?.synopsis ?? '',
      rating: stars(e.row.rating),
      voteCount: 0,
      releaseDate: e.row.releaseDate,
      addedAt: isoOf(e.row.addedAt),
      status: e.row.status,
      playable: !!e.fileId,
      art: { ...art, backdrop: e.meta?.still ?? art.backdrop },
      progress: place.progress,
      position: place.position,
      watched: place.watched,
      show: {
        id: show.tmdbId,
        title: show.title,
        code: episodeCode(season, e.row.episodeNumber ?? 0),
        episode: e.row.title,
      },
    }
  }

  // ---------------------------------------------------------------- the shows

  /** `GET /shows`: every show with an episode to play, with this profile's place in each. */
  function list(profileId: string): ClientShow[] {
    const shows = playableShows()
    const metaOf = metas()
    const eps = episodesOf(shows, profileId, metaOf)
    return shows.map((s) => showOf(s, metaOf(s.tmdbId), eps.get(s.id) ?? []))
  }

  /** Shows by TMDB id, in the order given, leaving out any not here or with nothing to play. */
  function showsByIds(tmdbIds: number[], profileId: string): ClientShow[] {
    if (!tmdbIds.length) return []
    const rows: ItemRow[] = []
    for (const part of chunks(tmdbIds))
      rows.push(
        ...db
          .select()
          .from(mediaItems)
          .where(and(eq(mediaItems.type, 'show'), inArray(mediaItems.tmdbId, part)))
          .all(),
      )
    const metaOf = metas()
    const eps = episodesOf(rows, profileId, metaOf)
    const byTmdb = new Map(rows.map((r) => [r.tmdbId, r]))
    return tmdbIds.flatMap((id) => {
      const row = byTmdb.get(id)
      const mine = row ? eps.get(row.id) : undefined
      return row && mine?.length ? [showOf(row, metaOf(id), mine)] : []
    })
  }

  /** The languages its episodes' files have, for the show page's Audio and subtitles. */
  function tracksOf(eps: Ep[]): ClientShowDetail['tracks'] {
    const fileIds = [...new Set(eps.flatMap((e) => e.fileId ?? []))]
    const audio = new Map<string, string>()
    const subtitles = new Map<string, string>()
    for (const part of chunks(fileIds))
      for (const f of db
        .select({ id: mediaFiles.id, info: mediaFiles.mediaInfo })
        .from(mediaFiles)
        .where(inArray(mediaFiles.id, part))
        .all()) {
        const info = probeOf(f.info)
        for (const a of audioTracks(f.id, info))
          if (a.language && !audio.has(a.language))
            audio.set(a.language, a.label.split(' · ')[0] ?? a.language)
        for (const s of ctx.subtitles?.forFile(f.id) ?? [])
          if (!subtitles.has(s.language)) subtitles.set(s.language, s.label)
      }
    const of = (m: Map<string, string>) => [...m].map(([id, label]) => ({ id, label }))
    return { audio: of(audio), subtitles: of(subtitles) }
  }

  /** `GET /shows/{id}`: its seasons with their episodes (specials last), people, like shows. */
  function show(tmdbId: number, profileId: string): ClientShowDetail {
    const row = showRowOf(tmdbId)
    const metaOf = metas()
    const meta = metaOf(tmdbId)
    const eps = episodesOf([row], profileId, metaOf).get(row.id) ?? []
    if (!eps.length) throw notAShow()
    const seasonMeta = new Map((meta?.seasons ?? []).map((s) => [s.number, s]))
    const numbers = [...new Set(eps.map((e) => e.row.seasonNumber ?? 0))].sort((a, b) =>
      a === 0 ? 1 : b === 0 ? -1 : a - b,
    )
    const creators = meta?.creators ?? []
    const related = (meta?.recommendations ?? []).map((r) => r.id).filter((id) => id !== tmdbId)
    return {
      show: showOf(row, meta, eps),
      seasons: numbers.map((n) => {
        const m = seasonMeta.get(n)
        return {
          number: n,
          title: m?.title ?? (n === 0 ? 'Specials' : `Season ${n}`),
          year: n === 0 ? null : (m?.year ?? null),
          poster: m?.poster ?? null,
          episodes: eps
            .filter((e) => (e.row.seasonNumber ?? 0) === n)
            .map((e) => episodeOf(row, meta, e)),
        }
      }),
      cast: (meta?.cast ?? []).map((c, i) => toApiCredit(c, tmdbId, 'cast', i)),
      creators: creators.map((c, i) => toApiCredit(c, tmdbId, 'crew', i)),
      crew: (meta?.crew ?? []).map((c, i) => toApiCredit(c, tmdbId, 'crew', creators.length + i)),
      related: showsByIds(related, profileId),
      videos: (meta?.videos ?? []).map(toApiVideo),
      tracks: tracksOf(eps),
      defaults: { audioId: null, subtitleId: null },
    }
  }

  // ---------------------------------------------------------------- an episode as a title

  /** An episode's row and its show's, by the episode's TMDB id. */
  function episodeRowOf(tmdbId: number): { episode: ItemRow; show: ItemRow } {
    const episode = db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'episode'), eq(mediaItems.tmdbId, tmdbId)))
      .get()
    const show = episode?.showId
      ? db.select().from(mediaItems).where(eq(mediaItems.id, episode.showId)).get()
      : undefined
    if (!episode || !show) throw notAnEpisode()
    return { episode, show }
  }

  /** One show's episodes (every one, with a file or not), and the one asked for among them. */
  function inShow(tmdbId: number, profileId: string, playable = false) {
    const { episode, show } = episodeRowOf(tmdbId)
    const metaOf = metas()
    const meta = metaOf(show.tmdbId)
    const eps = episodesOf([show], profileId, metaOf, { playable }).get(show.id) ?? []
    const ep = eps.find((e) => e.row.id === episode.id)
    if (!ep) throw notAnEpisode()
    return { show, meta, eps, ep }
  }

  /** Episodes by TMDB id as titles, in the order given; those not here are left out. */
  function episodeItems(tmdbIds: number[], profileId: string): ClientItem[] {
    return tmdbIds.flatMap((id) => {
      try {
        const { show, meta, ep } = inShow(id, profileId)
        return [episodeItem(show, meta, ep)]
      } catch {
        return []
      }
    })
  }

  /** `GET /items/episode/{id}`: the episode for its page and the player, with its place. */
  function item(tmdbId: number, profileId: string): ClientDetail {
    const { show, meta, ep } = inShow(tmdbId, profileId)
    const versions = db
      .select()
      .from(versionsTable)
      .where(eq(versionsTable.itemId, ep.row.id))
      .orderBy(versionsTable.position)
      .all()
    const fileIds = versions.flatMap((v) => v.fileId ?? [])
    const files = new Map(
      (fileIds.length
        ? db.select().from(mediaFiles).where(inArray(mediaFiles.id, fileIds)).all()
        : []
      ).map((f) => [f.id, f]),
    )
    const season = ep.row.seasonNumber ?? 0
    const number = Math.max(1, ep.row.episodeNumber ?? 1)
    return {
      item: episodeItem(show, meta, ep),
      originalTitle: ep.row.title,
      tagline: null,
      certification: meta?.certification ?? null,
      studios: meta?.network ? [meta.network] : [],
      cast: (meta?.cast ?? []).map((c, i) => toApiCredit(c, show.tmdbId, 'cast', i)),
      directors: [],
      crew: [],
      videos: [],
      collection: null,
      versions: versions.map((v) => {
        const file = v.fileId ? files.get(v.fileId) : undefined
        const info = file ? probeOf(file.mediaInfo) : null
        return {
          id: v.id,
          label: v.label,
          detail: file ? versionDetail(info, file.size) : null,
          quality: file ? versionQuality(info) : null,
          playable: !!file,
          audio: file ? audioTracks(file.id, info) : [],
          subtitles: file ? (ctx.subtitles?.forFile(file.id) ?? ([] as ClientSubtitle[])) : [],
        }
      }),
      related: [],
      episode: {
        show: { id: show.tmdbId, title: show.title },
        season,
        number,
        title: ep.row.title,
        code: episodeCode(season, number),
        // markers are part C2's
        intro: null,
        credits: null,
      },
    }
  }

  /**
   * `GET /items/episode/{id}/next`: the next episode with a file, in its season and then the next
   * season's first; a special's next is the following special. Null after the last.
   */
  function next(tmdbId: number, profileId: string): ClientItem | null {
    const { episode } = episodeRowOf(tmdbId)
    const { show, meta, eps } = inShow(tmdbId, profileId, false)
    const playable = eps.filter((e) => e.fileId)
    const special = (episode.seasonNumber ?? 0) === 0
    const after = eps.slice(eps.findIndex((e) => e.row.id === episode.id) + 1)
    const pick = after.find(
      (e) => e.fileId && ((e.row.seasonNumber ?? 0) === 0) === special && playable.includes(e),
    )
    return pick ? episodeItem(show, meta, pick) : null
  }

  // ---------------------------------------------------------------- watch state

  const announce = (who: Watcher, tmdbId: number) =>
    events.emit({ topic: WATCH_TOPIC, ids: [`show:${tmdbId}`], to: [who.userId] })

  /**
   * `PUT /shows/{id}/watched`: a season, or every episode here but the specials. Watched plays each
   * one to the end once; unwatched forgets each place, as one episode's are.
   */
  function setWatched(who: Watcher, tmdbId: number, season: number | null, watched: boolean) {
    const show = showRowOf(tmdbId)
    const eps = episodesOf([show], who.profileId, () => null).get(show.id) ?? []
    const mine =
      season === null
        ? eps.filter((e) => (e.row.seasonNumber ?? 0) > 0)
        : eps.filter((e) => (e.row.seasonNumber ?? 0) === season)
    if (season !== null && !mine.length)
      throw new AppError('not-found', 'That season isn’t in the library.')
    // each mark is its own transaction (shared/watch.ts), as one episode's are
    for (const e of mine)
      if (watched) {
        if (!e.played) watch.played(who, e.row.id)
      } else watch.unplayed(who, e.row.id)
    announce(who, tmdbId)
  }

  // ---------------------------------------------------------------- Home

  /**
   * Home's rows of shows (client-home.md): each show the profile has been watching, latest first,
   * once — on Continue watching when an episode is part way, else on Next up at the next episode;
   * New episodes, the newest episode of a show still airing the profile has watched, when it isn't
   * watched or already on a card; and Recently added shows. A show taken off (`dismiss`) stays off
   * until one of its episodes is played again.
   */
  function home(profileId: string): {
    continuing: { at: number; item: ClientItem }[]
    nextUp: ClientItem[]
    fresh: ClientItem[]
    recent: ClientShow[]
  } {
    const active = db.all<{ id: string; at: number }>(sql`
      SELECT e.show_id AS id, max(a.at) AS at FROM (
        SELECT item_id, updated_at AS at FROM watch_positions WHERE profile_id = ${profileId}
        UNION ALL
        SELECT item_id, coalesce(last_played_at, updated_at) FROM watch_history
          WHERE profile_id = ${profileId} AND played = 1
      ) a JOIN media_items e ON e.id = a.item_id AND e.type = 'episode'
      GROUP BY e.show_id
      HAVING max(a.at) > coalesce((SELECT d.dismissed_at FROM show_dismissals d
        WHERE d.profile_id = ${profileId} AND d.item_id = e.show_id), -1)
      ORDER BY at DESC
      LIMIT ${ROW_MAX * 2}`)
    const shows = typed(active)
    const atOf = new Map(active.map((a) => [a.id, a.at]))
    const metaOf = metas()
    const eps = episodesOf(shows, profileId, metaOf)
    const continuing: { at: number; item: ClientItem }[] = []
    const nextUp: ClientItem[] = []
    const onCards = new Set<number>()
    for (const s of shows) {
      const mine = eps.get(s.id) ?? []
      const next = nextOf(mine)
      if (!next) continue
      const item = episodeItem(s, metaOf(s.tmdbId), next.ep)
      if (next.kind === 'resume') continuing.push({ at: atOf.get(s.id) ?? 0, item })
      else if (next.kind === 'next') nextUp.push(item)
      else continue
      onCards.add(item.id)
    }
    const fresh = shows.flatMap((s) => {
      if (!metaOf(s.tmdbId)?.airing) return []
      const newest = (eps.get(s.id) ?? [])
        .filter((e) => (e.row.seasonNumber ?? 0) > 0)
        .sort((a, b) => (b.row.releaseDate ?? '').localeCompare(a.row.releaseDate ?? ''))[0]
      if (!newest || newest.played || onCards.has(newest.row.tmdbId)) return []
      return [episodeItem(s, metaOf(s.tmdbId), newest)]
    })
    const recentRows = db.all<{ id: string }>(sql`SELECT s.id AS id FROM media_items s
      WHERE s.type = 'show' AND EXISTS (
        SELECT 1 FROM media_items e JOIN versions v ON v.item_id = e.id
        WHERE e.show_id = s.id AND e.type = 'episode' AND v.file_id IS NOT NULL)
      ORDER BY s.added_at DESC, s.id LIMIT ${RECENT_SHOWS}`)
    const recentShows = typed(recentRows)
    const recentEps = episodesOf(recentShows, profileId, metaOf)
    return {
      continuing: continuing.slice(0, ROW_MAX),
      nextUp: nextUp.slice(0, ROW_MAX),
      fresh: fresh.slice(0, ROW_MAX),
      recent: recentShows.map((s) => showOf(s, metaOf(s.tmdbId), recentEps.get(s.id) ?? [])),
    }
  }

  /** Off Continue watching and Next up: the show's places go and it waits to be played again. */
  function dismiss(who: Watcher, episodeTmdbId: number) {
    const { show } = episodeRowOf(episodeTmdbId)
    const now = ctx.clock.now()
    db.transaction((tx) => {
      const ids = tx
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(and(eq(mediaItems.showId, show.id), eq(mediaItems.type, 'episode')))
        .all()
        .map((r) => r.id)
      for (const part of chunks(ids))
        tx.delete(watchPositions)
          .where(
            and(eq(watchPositions.profileId, who.profileId), inArray(watchPositions.itemId, part)),
          )
          .run()
      tx.insert(showDismissals)
        .values({ userId: who.userId, profileId: who.profileId, itemId: show.id, dismissedAt: now })
        .onConflictDoUpdate({
          target: [showDismissals.profileId, showDismissals.itemId],
          set: { dismissedAt: now },
        })
        .run()
    })
    announce(who, show.tmdbId)
  }

  // ---------------------------------------------------------------- Search

  /** Shows here by title or genre, the best match first. */
  function searchShows(query: string, profileId: string): ClientShow[] {
    const q = escapeLike(query)
    const like = `%${q}%`
    const found = db.all<{ id: string }>(sql`SELECT s.id AS id FROM media_items s
      WHERE s.type = 'show' AND (s.title LIKE ${like} ESCAPE '\\' OR s.tmdb_id IN (
        SELECT m.tmdb_id FROM show_metadata m, json_each(m.data, '$.genres') g
          WHERE json_extract(g.value, '$.name') LIKE ${like} ESCAPE '\\'))
      ORDER BY s.sort_title, s.id LIMIT ${SEARCH_MOVIE_POOL}`)
    const rows = typed(found)
    const shows = showsByIds(
      rankByMatch(rows, (r) => matchScore(r.title, query)).map((r) => r.tmdbId),
      profileId,
    )
    return shows.slice(0, SEARCH_LIMIT)
  }

  /** Episodes with a file, by their own title. */
  function searchEpisodes(query: string): SearchEpisode[] {
    const like = `%${escapeLike(query)}%`
    const found = db.all<{ id: string }>(sql`SELECT e.id AS id FROM media_items e
      WHERE e.type = 'episode' AND e.title LIKE ${like} ESCAPE '\\'
        AND EXISTS (SELECT 1 FROM versions v WHERE v.item_id = e.id AND v.file_id IS NOT NULL)
      ORDER BY e.title, e.id LIMIT ${SEARCH_MOVIE_POOL}`)
    const rows = typed(found)
    const shows = new Map(
      rowsByIds([...new Set(rows.flatMap((r) => r.showId ?? []))]).map((s) => [s.id, s]),
    )
    const metaOf = metas()
    return rankByMatch(rows, (r) => matchScore(r.title, query))
      .slice(0, SEARCH_LIMIT)
      .flatMap((e) => {
        const show = shows.get(e.showId ?? '')
        if (!show) return []
        const still = episodeMetaOf(metaOf(show.tmdbId)).get(e.tmdbId)?.still ?? null
        return [
          {
            id: e.tmdbId,
            show: { id: show.tmdbId, title: show.title },
            code: episodeCode(e.seasonNumber ?? 0, e.episodeNumber ?? 0),
            title: e.title,
            still,
          },
        ]
      })
  }

  /**
   * The films' results with shows and episodes among them, every kind ranked by its best name's
   * score (`rankSections`' rule); ties keep the films' kinds first, then shows, then episodes.
   */
  function mergeSearch(films: SearchResults, query: string, profileId: string): SearchResults {
    const q = query.trim()
    if (!q) return films
    const nameOf = (x: SearchSection): string[] =>
      x.items.map((i) => {
        const r = i as { title?: string; name?: string }
        return r.title ?? r.name ?? ''
      })
    const added: SearchSection[] = [
      { kind: 'shows', items: searchShows(q, profileId) },
      { kind: 'episodes', items: searchEpisodes(q) },
    ]
    const discover = films.sections.filter((x) => x.kind === 'discover')
    const ranked = [...films.sections.filter((x) => x.kind !== 'discover'), ...added]
      .filter((x) => x.items.length > 0)
      .map((section, i) => ({
        section,
        i,
        score: Math.max(0, ...nameOf(section).map((n) => matchScore(n, q))),
      }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.section)
    // TMDB's titles to request stay last, as the films' search puts them
    return { sections: [...ranked, ...discover] }
  }

  return {
    list,
    show,
    showsByIds,
    item,
    episodeItems,
    next,
    setWatched,
    dismiss,
    home,
    search: { shows: searchShows, episodes: searchEpisodes, merge: mergeSearch },
    internal: { episodeRowOf, showRowOf, episodesOf },
  }
}

export type ShowClient = ReturnType<typeof createShowClient>
export { byPlace }
