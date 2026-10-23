// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/metadata: TMDB, the metadata cache, images and refresh (ADR 0029, 0030). Titles, people
// and collections are addressed by their TMDB ids. The replaying `fetch` for tests and the dev
// server has its own entry point (`@highsea-tv/metadata/replay`).
import type { MetadataDeps } from './context.ts'
import { defineMetadataJobs, queueFacts, scheduleMetadataJobs } from './jobs.ts'
import { createMetadataCore, JOB_TYPES } from './service.ts'
import type { CacheKind } from './types.ts'

export function createMetadata(deps: MetadataDeps) {
  const core = createMetadataCore(deps)
  defineMetadataJobs(deps.jobs, core, deps.db, () => deps.clock.now())
  const { settings, api } = core

  return {
    settings: {
      /** `{ key: { set, last4 }, language, region }`. The key is never returned. */
      get: () => settings.view(),
      /** Validates the key with TMDB (`GET /3/authentication`), then stores it sealed. */
      async setKey(credential: string) {
        const view = await settings.setKey(credential, async (c) => {
          await api.authentication(c)
        })
        await core.refreshConfiguration(core.requireKey())
        await core.refreshCertifications(core.requireKey())
        return view
      },
      /** The same check, storing nothing (setup's key step). */
      checkKey: (credential: string) =>
        settings.checkKey(credential, async (c) => {
          await api.authentication(c)
        }),
      clearKey: () => settings.clearKey(),
      /** A new region queues `metadata.facts`, since certifications follow it (checkpoint 8d). */
      update(patch: { language?: string; region?: string | null }) {
        const view = settings.update(patch)
        queueFacts(deps.jobs, deps.db, view.region)
        return view
      },
    },
    /**
     * The region's film certifications from mildest (TMDB's `order`), for smart collections' rating
     * rule; null until TMDB has been asked, which happens with the key and then weekly.
     */
    certifications: core.certifications,
    discover: core.discover,
    movie: core.movie,
    cachedMovie: core.cachedMovie,
    recommendations: core.recommendations,
    collection: core.collection,
    person: core.person,
    images: { get: core.images.get },
    /** Queues `metadata.refresh` for a movie (or a person or collection); returns the job's id. */
    refresh: (tmdbId: number, kind: CacheKind = 'movie') => core.enqueueRefresh(kind, tmdbId),
    /** The same refresh, now, for callers that wait on it (tests, the job). */
    refreshNow: core.refreshNow,
    jobs: {
      types: JOB_TYPES,
      /**
       * Daily changes, sweep and purge, and `metadata.facts` when the stored facts follow another
       * region or are from before 8d. The runtime calls it once at boot.
       */
      schedule(now: number) {
        scheduleMetadataJobs(deps.jobs, now)
        queueFacts(deps.jobs, deps.db, settings.region())
      },
      runChanges: core.runChanges,
      runSweep: core.runSweep,
      runPurge: core.runPurge,
    },
  }
}

export type Metadata = ReturnType<typeof createMetadata>

export * from './attribution.ts'
export type { MetadataDeps } from './context.ts'
export { METADATA_TOPIC } from './context.ts'
export * from './image-url.ts'
export type { CachedImage } from './images.ts'
export { TMDB_IMAGE_BASE } from './images.ts'
export { GENRES } from './map.ts'
export * from './recording.ts'
export {
  CACHE_LIMIT_MS,
  CHANGES_STATE_KEY,
  CHANGES_WINDOW_MS,
  FULL_REFRESH_MS,
  JOB_TYPES,
} from './service.ts'
export {
  defaultMetadataSettings,
  isNoKeyError,
  localeRegion,
  METADATA_SETTINGS_KEY,
  type MetadataSettings,
  NO_TMDB_KEY,
} from './settings.ts'
export { credentialOf, TMDB_API } from './tmdb/client.ts'
export * from './types.ts'
