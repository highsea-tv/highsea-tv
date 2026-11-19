// SPDX-License-Identifier: AGPL-3.0-only
// Each profile's own playlists (`playlists` in @highsea-tv/api-contract's music.ts, HT-101): made,
// renamed, added to, taken from, reordered and deleted, as the mock keeps them. A playlist is its
// profile's (ADR 0068): another profile's answers 404, as one that was deleted does. An entry has
// its own id, so a song can be in a playlist twice and one of them taken out. A song that leaves
// the library leaves every playlist with it. `playlists.updated` goes to the account alone.
import type { ClientPlaylist, ClientPlaylistDetail } from '@highsea-tv/api-contract'
import { DRAFT_TOPICS } from '@highsea-tv/api-contract'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm'
import type { MusicClient } from './client.ts'
import type { MusicDeps } from './context.ts'

const { musicPlaylists, musicPlaylistEntries } = schema

const iso = (ms: number) => new Date(ms).toISOString()

export type PlaylistOwner = { userId: string; profileId: string }

export function createMusicPlaylists(ctx: MusicDeps, client: MusicClient) {
  const { db, clock } = ctx

  const changed = (who: PlaylistOwner, id: string) =>
    ctx.events.emit({ topic: DRAFT_TOPICS.playlists, ids: [id], to: [who.userId] })

  function own(who: PlaylistOwner, id: string) {
    const p = db
      .select()
      .from(musicPlaylists)
      .where(and(eq(musicPlaylists.id, id), eq(musicPlaylists.profileId, who.profileId)))
      .get()
    if (!p) throw new AppError('not-found', 'That playlist isn’t yours, or was deleted.')
    return p
  }

  const entriesOf = (id: string) =>
    db
      .select()
      .from(musicPlaylistEntries)
      .where(eq(musicPlaylistEntries.playlistId, id))
      .orderBy(asc(musicPlaylistEntries.position))
      .all()

  function view(p: typeof musicPlaylists.$inferSelect): ClientPlaylist {
    const songs = client.internal.queued(
      client.internal.tracksById([...new Set(entriesOf(p.id).map((e) => e.trackId))]),
    )
    const byId = new Map(songs.map((s) => [s.id, s]))
    const list = entriesOf(p.id).flatMap((e) => byId.get(e.trackId) ?? [])
    const covers: string[] = []
    for (const s of list)
      if (s.album.cover && !covers.includes(s.album.cover) && covers.length < 4)
        covers.push(s.album.cover)
    return {
      id: p.id,
      name: p.name,
      songs: list.length,
      duration: list.reduce((n, s) => n + s.duration, 0),
      covers,
      updatedAt: iso(p.updatedAt),
    }
  }

  /** Only songs that are here; the rest are left out. */
  function known(ids: string[]) {
    const here = new Set(client.internal.tracksById([...new Set(ids)]).map((t) => t.id))
    return ids.filter((i) => here.has(i))
  }

  function append(id: string, songs: string[]) {
    const last =
      db
        .select({ n: max(musicPlaylistEntries.position) })
        .from(musicPlaylistEntries)
        .where(eq(musicPlaylistEntries.playlistId, id))
        .get()?.n ?? -1
    known(songs).forEach((trackId, i) => {
      db.insert(musicPlaylistEntries)
        .values({ id: newId('pe'), playlistId: id, trackId, position: last + 1 + i })
        .run()
    })
  }

  const touch = (id: string) =>
    db.update(musicPlaylists).set({ updatedAt: clock.now() }).where(eq(musicPlaylists.id, id)).run()

  return {
    list(who: PlaylistOwner): ClientPlaylist[] {
      return db
        .select()
        .from(musicPlaylists)
        .where(eq(musicPlaylists.profileId, who.profileId))
        .orderBy(desc(musicPlaylists.updatedAt))
        .all()
        .map(view)
    },
    get(who: PlaylistOwner, id: string): ClientPlaylistDetail {
      const p = own(who, id)
      const entries = entriesOf(id)
      const plays = client.internal.playCounts()
      const songs = client.internal.queued(
        client.internal.tracksById([...new Set(entries.map((e) => e.trackId))]),
      )
      const byId = new Map(songs.map((s) => [s.id, s]))
      return {
        playlist: view(p),
        songs: entries.flatMap((e) => {
          const s = byId.get(e.trackId)
          if (!s) return []
          const { loudness: _, ...song } = s
          return [{ ...song, plays: plays.get(s.id) ?? 0, entry: e.id }]
        }),
      }
    },
    create(who: PlaylistOwner, name: string, songs: string[] = []): ClientPlaylist {
      const now = clock.now()
      const id = newId('pl')
      db.transaction(() => {
        db.insert(musicPlaylists)
          .values({
            id,
            userId: who.userId,
            profileId: who.profileId,
            name: name.trim(),
            createdAt: now,
            updatedAt: now,
          })
          .run()
        append(id, songs)
      })
      changed(who, id)
      return view(own(who, id))
    },
    rename(who: PlaylistOwner, id: string, name: string) {
      own(who, id)
      db.update(musicPlaylists)
        .set({ name: name.trim(), updatedAt: clock.now() })
        .where(eq(musicPlaylists.id, id))
        .run()
      changed(who, id)
    },
    add(who: PlaylistOwner, id: string, songs: string[]) {
      own(who, id)
      db.transaction(() => {
        append(id, songs)
        touch(id)
      })
      changed(who, id)
    },
    remove(who: PlaylistOwner, id: string, entry: string) {
      own(who, id)
      const gone = db
        .delete(musicPlaylistEntries)
        .where(and(eq(musicPlaylistEntries.id, entry), eq(musicPlaylistEntries.playlistId, id)))
        .returning({ id: musicPlaylistEntries.id })
        .all()
      if (gone.length === 0) throw new AppError('not-found', 'That song isn’t in the playlist.')
      touch(id)
      changed(who, id)
    },
    /** The entries in their new order; those left out are dropped. */
    reorder(who: PlaylistOwner, id: string, order: string[]) {
      own(who, id)
      db.transaction(() => {
        const have = new Set(entriesOf(id).map((e) => e.id))
        const kept = [...new Set(order)].filter((e) => have.has(e))
        const dropped = [...have].filter((e) => !kept.includes(e))
        if (dropped.length)
          db.delete(musicPlaylistEntries).where(inArray(musicPlaylistEntries.id, dropped)).run()
        kept.forEach((entry, position) => {
          db.update(musicPlaylistEntries)
            .set({ position })
            .where(eq(musicPlaylistEntries.id, entry))
            .run()
        })
        touch(id)
      })
      changed(who, id)
    },
    delete(who: PlaylistOwner, id: string) {
      own(who, id)
      db.delete(musicPlaylists).where(eq(musicPlaylists.id, id)).run()
      changed(who, id)
    },
  }
}

export type MusicPlaylists = ReturnType<typeof createMusicPlaylists>
