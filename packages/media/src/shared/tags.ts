// SPDX-License-Identifier: AGPL-3.0-only
// Tags (checkpoint 8c): labels on titles, indexers, import lists and connections, scoping each to
// the titles that share one, as Radarr's do (wiki.servarr.com/radarr/settings#tags). Titles carry
// theirs in `media_item_tags`; indexers, lists and connections in a `tags` JSON array of ids on
// their own rows, which this module reads with SQLite's `json_each` (https://sqlite.org/json1.html)
// to count and strip them, so those packages never import media (ADR 0036).
//
// A label is unique ignoring case ("Kids" and "kids" are one tag), as Radarr's are.
import type { Tag } from '@highsea-tv/api-contract'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { invalid, type MediaDeps } from './context.ts'
import { chunks } from './sql.ts'

const { tags, mediaItemTags, mediaItems } = schema

/** The tables whose rows carry a `tags` JSON array, and the usage each counts as. */
const CARRIERS = [
  ['indexers', 'indexers'],
  ['import_lists', 'lists'],
  ['connections', 'connections'],
] as const

export type TagMode = 'add' | 'remove' | 'replace'

const exists = (label: string) =>
  new AppError('conflict', `There’s a tag called ${label} already.`, { reason: 'exists' })

/** Whether two tag lists share one; an empty `scope` matches everything (Radarr's "leave blank"). */
export const tagsMatch = (scope: readonly string[], carried: readonly string[]) =>
  scope.length === 0 || scope.some((t) => carried.includes(t))

export function createTags({ db, clock }: MediaDeps) {
  type Row = typeof tags.$inferSelect

  const rows = () =>
    db
      .select()
      .from(tags)
      .orderBy(asc(sql`${tags.label} COLLATE NOCASE`))
      .all()

  function usage(): Map<string, Tag['usage']> {
    const out = new Map<string, Tag['usage']>()
    const of = (id: string) => {
      let u = out.get(id)
      if (!u) {
        u = { movies: 0, indexers: 0, lists: 0, connections: 0 }
        out.set(id, u)
      }
      return u
    }
    for (const r of db
      .select({ id: mediaItemTags.tagId, n: sql<number>`count(*)` })
      .from(mediaItemTags)
      .groupBy(mediaItemTags.tagId)
      .all())
      of(r.id).movies = r.n
    for (const [table, key] of CARRIERS)
      for (const r of db.all<{ id: string; n: number }>(
        sql`SELECT j.value AS id, count(*) AS n FROM ${sql.identifier(table)} t, json_each(t.tags) j GROUP BY j.value`,
      ))
        of(r.id)[key] = r.n
    return out
  }

  const view = (r: Row, u = usage()): Tag => ({
    id: r.id,
    label: r.label,
    usage: u.get(r.id) ?? { movies: 0, indexers: 0, lists: 0, connections: 0 },
  })

  function row(id: string): Row {
    const r = db.select().from(tags).where(eq(tags.id, id)).get()
    if (!r) throw new AppError('not-found', 'That tag doesn’t exist.')
    return r
  }

  function clean(label: string) {
    const l = label.trim().replace(/\s+/g, ' ')
    if (!l) throw invalid('A tag needs a label.', 'label')
    if (l.length > 40) throw invalid('A tag’s label is at most 40 characters.', 'label')
    return l
  }

  /** Another tag with this label, ignoring case. */
  const taken = (label: string, except?: string) =>
    db
      .select({ id: tags.id })
      .from(tags)
      .where(sql`${tags.label} = ${label} COLLATE NOCASE`)
      .all()
      .some((r) => r.id !== except)

  /**
   * The ids, each checked to exist, without repeats. An unknown id is refused (400,
   * `unknown-tag`) rather than dropped, so a stale screen can't save half its choice.
   */
  function check(ids: readonly string[] | undefined): string[] {
    const unique = [...new Set(ids ?? [])]
    if (!unique.length) return []
    const found = new Set(
      db
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.id, unique))
        .all()
        .map((r) => r.id),
    )
    if (unique.some((id) => !found.has(id)))
      throw new AppError('invalid', 'One of those tags doesn’t exist any more.', {
        reason: 'unknown-tag',
        field: 'tags',
      })
    return unique
  }

  /** Each item's tag ids, A to Z by label. */
  function ofItems(itemIds: string[]): Map<string, string[]> {
    const out = new Map<string, string[]>()
    for (const part of chunks(itemIds))
      for (const r of db
        .select({ itemId: mediaItemTags.itemId, tagId: mediaItemTags.tagId })
        .from(mediaItemTags)
        .innerJoin(tags, eq(tags.id, mediaItemTags.tagId))
        .where(inArray(mediaItemTags.itemId, part))
        .orderBy(asc(sql`${tags.label} COLLATE NOCASE`))
        .all())
        out.set(r.itemId, [...(out.get(r.itemId) ?? []), r.tagId])
    return out
  }

  /** Puts tags on items, takes them off, or leaves each with exactly these. Checks the ids first. */
  function apply(itemIds: string[], tagIds: readonly string[], mode: TagMode) {
    const ids = check(tagIds)
    db.transaction((tx) => {
      for (const part of chunks(itemIds)) {
        if (mode === 'replace')
          tx.delete(mediaItemTags).where(inArray(mediaItemTags.itemId, part)).run()
        if (mode === 'remove') {
          if (ids.length)
            tx.delete(mediaItemTags)
              .where(and(inArray(mediaItemTags.itemId, part), inArray(mediaItemTags.tagId, ids)))
              .run()
          continue
        }
        for (const itemId of part)
          for (const tagId of ids)
            tx.insert(mediaItemTags).values({ itemId, tagId }).onConflictDoNothing().run()
      }
    })
  }

  return {
    list: (): Tag[] => {
      const u = usage()
      return rows().map((r) => view(r, u))
    },

    get: (id: string): Tag => view(row(id)),

    add(label: string): Tag {
      const l = clean(label)
      if (taken(l)) throw exists(l)
      const r = { id: newId('tag'), label: l, createdAt: clock.now() }
      db.insert(tags).values(r).run()
      return view(r)
    },

    rename(id: string, label: string): Tag {
      row(id)
      const l = clean(label)
      if (taken(l, id)) throw exists(l)
      db.update(tags).set({ label: l }).where(eq(tags.id, id)).run()
      return view(row(id))
    },

    /**
     * Takes the tag off everything that carries it, then removes it. Titles lose it by cascade;
     * the JSON arrays are rewritten without it. An indexer or connection left with none is used
     * for every title again.
     */
    remove(id: string) {
      row(id)
      db.transaction((tx) => {
        for (const [table] of CARRIERS)
          tx.run(
            sql`UPDATE ${sql.identifier(table)} SET tags = (SELECT json_group_array(j.value) FROM json_each(${sql.identifier(table)}.tags) j WHERE j.value <> ${id}) WHERE EXISTS (SELECT 1 FROM json_each(${sql.identifier(table)}.tags) j WHERE j.value = ${id})`,
          )
        tx.delete(tags).where(eq(tags.id, id)).run()
      })
    },

    check,
    ofItems,
    apply,

    /** A library title's tag ids by its TMDB id; empty when it isn't in the library. */
    ofMovie(tmdbId: number): string[] {
      return db
        .select({ id: mediaItemTags.tagId })
        .from(mediaItemTags)
        .innerJoin(mediaItems, eq(mediaItems.id, mediaItemTags.itemId))
        .where(and(eq(mediaItems.type, 'movie'), eq(mediaItems.tmdbId, tmdbId)))
        .all()
        .map((r) => r.id)
    },
  }
}

export type Tags = ReturnType<typeof createTags>
