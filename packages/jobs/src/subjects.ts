// SPDX-License-Identifier: AGPL-3.0-only
// What a job works on (HT-106): the library item, so the admin can mark it on its page and in the
// library while the job is queued or running. Kept on the job's row as `kind:id`, with the item its
// page stands for (`of`): an episode's or a season's show. Items are addressed as the admin
// addresses them: a film and a show by their TMDB id, an episode by its TMDB id, a season by its
// show's TMDB id and its number ("1396:2").
import { type Db, schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'

const { mediaItems, mediaFiles, subtitleFiles } = schema

export const SUBJECT_KINDS = [
  'movie',
  'show',
  'season',
  'episode',
  'collection',
  'artist',
  'album',
] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]

export type SubjectRef = { kind: SubjectKind; id: string }
/** The item a job works on, and the item whose page and row stand for it when that's another. */
export type Subject = SubjectRef & { of?: SubjectRef }

export const subjectKey = (s: SubjectRef) => `${s.kind}:${s.id}`

export function parseSubject(key: string | null): SubjectRef | null {
  if (!key) return null
  const at = key.indexOf(':')
  const kind = key.slice(0, at) as SubjectKind
  if (at < 1 || !SUBJECT_KINDS.includes(kind)) return null
  return { kind, id: key.slice(at + 1) }
}

/** A library row's subject: a film, a show, or a season or an episode of its show; null if it's gone. */
export function itemSubject(db: Db, itemId: string): Subject | null {
  const item = db.select().from(mediaItems).where(eq(mediaItems.id, itemId)).get()
  if (!item) return null
  if (item.type === 'movie' || item.type === 'show')
    return { kind: item.type, id: String(item.tmdbId) }
  const show = item.showId
    ? db
        .select({ tmdbId: mediaItems.tmdbId })
        .from(mediaItems)
        .where(eq(mediaItems.id, item.showId))
        .get()
    : undefined
  if (!show) return null
  const of = { kind: 'show' as const, id: String(show.tmdbId) }
  return item.type === 'season'
    ? { kind: 'season', id: `${show.tmdbId}:${item.seasonNumber ?? 0}`, of }
    : { kind: 'episode', id: String(item.tmdbId), of }
}

/** A media file's item's subject. */
export function fileSubject(db: Db, fileId: string): Subject | null {
  const file = db
    .select({ itemId: mediaFiles.itemId })
    .from(mediaFiles)
    .where(eq(mediaFiles.id, fileId))
    .get()
  return file ? itemSubject(db, file.itemId) : null
}

/** A subtitle track's item's subject. */
export function trackSubject(db: Db, trackId: string): Subject | null {
  const track = db
    .select({ itemId: subtitleFiles.itemId })
    .from(subtitleFiles)
    .where(eq(subtitleFiles.id, trackId))
    .get()
  return track ? itemSubject(db, track.itemId) : null
}
