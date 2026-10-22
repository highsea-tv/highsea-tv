// SPDX-License-Identifier: AGPL-3.0-only
// The movie library as import lists see it (checkpoint 8a): which movies are here, adding one with
// a list's folder and profiles, and checking those exist when a list is saved. Lists don't import
// `@highsea/media`; the runtime hands them this.
import { AppError } from '@highsea/core'
import { type Db, schema } from '@highsea/db'
import type { ListLibrary } from '@highsea/lists/service'
import type { Movies } from '@highsea/media/movies'
import type { Media } from '@highsea/media/shared'
import { and, eq, inArray } from 'drizzle-orm'

const { mediaItems, languageProfiles } = schema
const CHUNK = 500

export function createListLibrary(deps: {
  db: Db
  media: Media
  movies: Movies
  canSearch: () => boolean
}): ListLibrary & {
  titles(tmdbIds: number[]): { tmdbId: number; title: string; year: number | null }[]
} {
  const { db, media, movies } = deps

  const invalid = (message: string, field: string) =>
    new AppError('invalid', message, { field, reason: 'unknown' })

  return {
    has(tmdbIds) {
      const out = new Set<number>()
      for (let i = 0; i < tmdbIds.length; i += CHUNK)
        for (const r of db
          .select({ tmdbId: mediaItems.tmdbId })
          .from(mediaItems)
          .where(
            and(
              eq(mediaItems.type, 'movie'),
              inArray(mediaItems.tmdbId, tmdbIds.slice(i, i + CHUNK)),
            ),
          )
          .all())
          if (r.tmdbId != null) out.add(r.tmdbId)
      return out
    },
    async add(input) {
      const profile = media.profiles.get(input.qualityProfileId)
      await movies.add({
        tmdbId: input.tmdbId,
        rootFolder: input.rootFolder,
        monitored: input.monitored,
        minimumAvailability: input.minimumAvailability,
        languageProfileId: input.languageProfileId,
        versions: [{ label: profile.name.slice(0, 40), qualityProfileId: profile.id }],
        searchNow: input.searchNow,
      })
    },
    check(input) {
      if (!media.rootFolders.find(input.rootFolder))
        throw invalid('Pick one of the root folders.', 'rootFolder')
      try {
        media.profiles.get(input.qualityProfileId)
      } catch {
        throw invalid('Pick one of the quality profiles.', 'qualityProfileId')
      }
      if (
        input.languageProfileId !== null &&
        !db
          .select({ id: languageProfiles.id })
          .from(languageProfiles)
          .where(eq(languageProfiles.id, input.languageProfileId))
          .get()
      )
        throw invalid('Pick one of the language profiles.', 'languageProfileId')
    },
    canSearch: deps.canSearch,
    /** Library movies' titles and years, for exclusions. */
    titles(tmdbIds) {
      const out: { tmdbId: number; title: string; year: number | null }[] = []
      for (let i = 0; i < tmdbIds.length; i += CHUNK)
        for (const r of db
          .select({ tmdbId: mediaItems.tmdbId, title: mediaItems.title, year: mediaItems.year })
          .from(mediaItems)
          .where(
            and(
              eq(mediaItems.type, 'movie'),
              inArray(mediaItems.tmdbId, tmdbIds.slice(i, i + CHUNK)),
            ),
          )
          .all())
          if (r.tmdbId != null) out.push({ tmdbId: r.tmdbId, title: r.title, year: r.year })
      return out
    },
  }
}
