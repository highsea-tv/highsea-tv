// SPDX-License-Identifier: AGPL-3.0-only
// Adding a movie another program already manages, where it is (checkpoint 6b, the importers;
// ADR 0041). The Radarr importer hands each of Radarr's movies here: added by TMDB id with its own
// monitored flag, minimum availability and profile, its folder kept, its file (if any) probed again
// by highsea rather than trusted, and adopted in place through the import pipeline's `adopt`, as
// the library import does. Tags are written to the tags tables media owns.
//
// Safe to repeat (ADR 0022): a movie in the library is found, not added twice; a file already
// recorded is found by its path; a tag link is written once.
import { promises as fsp } from 'node:fs'
import { basename, extname } from 'node:path'
import { newId } from '@highsea/core'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import type { Media } from '../shared/index.ts'
import { checkPath } from '../shared/paths.ts'
import type { Ctx } from './context.ts'
import type { Imports } from './import.ts'
import type { Library } from './library.ts'

const { mediaItems, mediaFiles, tags, mediaItemTags } = schema

export type InPlaceInput = {
  tmdbId: number
  /** One of the root folders, by path. */
  rootFolder: string
  /** The movie's own folder, inside the root folder. */
  folder: string
  monitored: boolean
  minimumAvailability: 'announced' | 'in-cinemas' | 'released'
  qualityProfileId: string
  /** The movie's file, if it has one; probed again before it's recorded. */
  file: string | null
  /** The name its quality and group are read from: the release's, else the file's own. */
  sourceTitle: string | null
  tags: readonly string[]
  /** The history's message for the file. */
  message: string
}

export type InPlaceResult = {
  /** False when the movie was already in the library. */
  added: boolean
  /** `imported`, `already` (recorded before), `none` (no file), or why the file was left out. */
  file: 'imported' | 'already' | 'none' | { problem: string }
}

export function createMigrate(
  ctx: Ctx,
  deps: { media: Media; library: Library; imports: Imports },
) {
  const { db, clock } = ctx
  const { media, library, imports } = deps

  function tagIds(labels: readonly string[]): string[] {
    const out: string[] = []
    for (const raw of labels) {
      const label = raw.trim().slice(0, 100)
      if (!label) continue
      db.insert(tags)
        .values({ id: newId('tag'), label, createdAt: clock.now() })
        .onConflictDoNothing({ target: tags.label })
        .run()
      const row = db.select({ id: tags.id }).from(tags).where(eq(tags.label, label)).get()
      if (row) out.push(row.id)
    }
    return out
  }

  async function addInPlace(input: InPlaceInput): Promise<InPlaceResult> {
    const profile = media.profiles.get(input.qualityProfileId)
    const { created } = await library.add({
      tmdbId: input.tmdbId,
      rootFolder: input.rootFolder,
      monitored: input.monitored,
      minimumAvailability: input.minimumAvailability,
      versions: [{ label: profile.name.slice(0, 40), qualityProfileId: profile.id }],
    })
    let row = library.internal.rowOf(input.tmdbId)
    if (!row) return { added: created, file: { problem: 'The movie couldn’t be added.' } }

    for (const tagId of tagIds(input.tags))
      db.insert(mediaItemTags).values({ itemId: row.id, tagId }).onConflictDoNothing().run()

    // the folder stays where the other program kept it; only a movie added now moves its record
    if (created) {
      const folder = checkPath(input.folder, [row.rootFolder])
      if (row.path !== folder) {
        db.update(mediaItems)
          .set({ path: folder, updatedAt: clock.now() })
          .where(eq(mediaItems.id, row.id))
          .run()
        row = { ...row, path: folder }
      }
    }
    if (!input.file) return { added: created, file: 'none' }

    let path: string
    try {
      path = checkPath(input.file, imports.internal.roots())
    } catch (e) {
      return { added: created, file: { problem: (e as Error).message } }
    }
    const recorded = db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(eq(mediaFiles.path, path))
      .get()
    const versions = imports.internal.versionRows(row.id)
    if (recorded && versions.some((v) => v.fileId === recorded.id))
      return { added: created, file: 'already' }
    const version = versions.find((v) => !v.fileId)
    if (!version) return { added: created, file: { problem: 'The movie already has a file.' } }
    let size: number
    try {
      size = (await fsp.stat(path)).size
    } catch {
      return { added: created, file: { problem: `${path} isn’t there.` } }
    }
    const meta = library.internal.cached(input.tmdbId)
    const probed = await imports.internal.probed({ path, size }, row.path, meta)
    if (probed.skip !== null) return { added: created, file: { problem: probed.skip } }
    await imports.adopt({
      row,
      version,
      path,
      info: probed.info,
      sourceTitle: input.sourceTitle?.trim() || basename(path, extname(path)),
      rename: false,
      message: input.message,
    })
    return { added: created, file: 'imported' }
  }

  return { addInPlace }
}

export type Migrate = ReturnType<typeof createMigrate>
