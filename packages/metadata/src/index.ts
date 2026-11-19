// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/metadata: TMDB, the metadata cache, images and refresh (ADR 0029, 0030). Titles, people
// and collections are addressed by their TMDB ids; music by its MusicBrainz ids (ADR 0065). The
// replaying `fetch` for tests and the dev server has its own entry point
// (`@highsea-tv/metadata/replay`).
import type { MetadataDeps } from './context.ts'
import { defineMetadataJobs, queueCatchUp, queueFacts, scheduleMetadataJobs } from './jobs.ts'
import { createArtistArt } from './musicbrainz/artist-art.ts'
import { createMusicBrainzClient } from './musicbrainz/client.ts'
import { createMusicBrainzSource } from './musicbrainz/source.ts'
import { createMetadataCore, JOB_TYPES } from './service.ts'
import type { CacheKind } from './types.ts'

/** Stops `setFanartKey` after its checks, before it stores anything. */
const CHECKED = Symbol('checked')

export function createMetadata(deps: MetadataDeps) {
  const core = createMetadataCore(deps)
  defineMetadataJobs(deps.jobs, core, deps.db, () => deps.clock.now())
  const { settings, api } = core
  const musicBrainz = createMusicBrainzSource({
    db: deps.db,
    clock: deps.clock,
    logger: deps.logger,
    client: createMusicBrainzClient({
      fetch: deps.fetch,
      clock: deps.clock,
      logger: deps.logger,
      version: deps.version ?? '0.0.0',
      sleep: deps.sleep,
    }),
  })
  const music = { ...musicBrainz, ...createArtistArt({ fanart: core.fanart }) }

  return {
    settings: {
      /**
       * `{ key: { set, last4, builtIn }, fanart: { set, last4, project }, language, region }`. The
       * keys are never returned.
       */
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
      /**
       * The owner's personal fanart.tv key (HT-74): checked with one request, stored sealed, then the
       * library's films without a logo are looked up a few minutes on.
       */
      async setFanartKey(key: string, { checked = false } = {}) {
        const view = await settings.setFanartKey(key, (k) =>
          checked ? Promise.resolve() : core.fanart.check(k),
        )
        queueCatchUp(deps.jobs, core, deps.clock.now())
        return view
      },
      /** The same check, storing nothing, so a save can check every key before storing any. */
      checkFanartKey: (key: string) =>
        settings
          .setFanartKey(key, async (k) => {
            await core.fanart.check(k)
            throw CHECKED
          })
          .catch((e) => {
            if (e !== CHECKED) throw e
          }),
      clearFanartKey: () => settings.clearFanartKey(),
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
    /** A show with its seasons and episodes (ADR 0064); `cachedShow` without asking TMDB. */
    show: core.show,
    cachedShow: core.cachedShow,
    /**
     * MusicBrainz and the Cover Art Archive (ADR 0065), cached, one request a second: an artist, a
     * release group, a release and a release group's front cover, each by its MusicBrainz id; and
     * an artist's picture from fanart.tv by the same id (ADR 0070), with each picture's bytes.
     */
    music,
    recommendations: core.recommendations,
    collection: core.collection,
    person: core.person,
    images: { get: core.images.get },
    /** Artwork an admin chose (HT-66): the picker's view, choosing, uploading and Reset. */
    artwork: core.artwork,
    /**
     * Queues `metadata.refresh` for a movie (or a show, person or collection); returns the job's
     * id. A show's refresh fetches its seasons too, and announces `show:{id}`.
     */
    refresh: (tmdbId: number, kind: CacheKind = 'movie') => core.enqueueRefresh(kind, tmdbId),
    /** The same refresh, now, for callers that wait on it (tests, the job). */
    refreshNow: core.refreshNow,
    jobs: {
      types: JOB_TYPES,
      /**
       * Daily changes, sweep and purge; `metadata.facts` when the stored facts follow another
       * region or are from before 8d; and `metadata.catch-up` when the library's films are missing
       * anything (HT-74). The runtime calls it once at boot.
       */
      schedule(now: number) {
        scheduleMetadataJobs(deps.jobs, now)
        queueFacts(deps.jobs, deps.db, settings.region())
        queueCatchUp(deps.jobs, core, now)
      },
      runCatchUp: core.runCatchUp,
      runChanges: core.runChanges,
      runSweep: core.runSweep,
      runPurge: core.runPurge,
    },
  }
}

export type Metadata = ReturnType<typeof createMetadata>

export {
  ARTWORK_KINDS,
  ARTWORK_KINDS_OF,
  ARTWORK_MAX_BYTES,
  ARTWORK_OWNERS,
  ARTWORK_RULES,
  type ArtworkChoice,
  type ArtworkKind,
  type ArtworkOption,
  type ArtworkOwner,
  checkArtwork,
} from './artwork.ts'
export * from './attribution.ts'
export type { MetadataDeps } from './context.ts'
export { METADATA_TOPIC } from './context.ts'
export { FANART_KEY_REJECTED, FANART_UNAVAILABLE } from './fanart/client.ts'
export { FANART_PREFIX, isFanartFile } from './fanart/source.ts'
export * from './image-url.ts'
export type { CachedImage } from './images.ts'
export { TMDB_IMAGE_BASE } from './images.ts'
export { type ArtPick, collectionArt, GENRES } from './map.ts'
export { TV_GENRES } from './map-shows.ts'
export {
  COVER_ART_API,
  MBID,
  MUSICBRAINZ_API,
  MUSICBRAINZ_UNAVAILABLE,
  musicBrainzUserAgent,
} from './musicbrainz/client.ts'
export {
  albumKindOf,
  MUSICBRAINZ_FRESH_MS,
  type MusicAlbumKind,
  type MusicBrainzArtist,
  type MusicBrainzRelease,
  type MusicBrainzReleaseGroup,
  type MusicBrainzSource,
} from './musicbrainz/source.ts'
export * from './recording.ts'
export {
  type ArtworkKindView,
  CACHE_LIMIT_MS,
  CATCH_UP_DELAY_MS,
  CHANGES_STATE_KEY,
  CHANGES_WINDOW_MS,
  FULL_REFRESH_MS,
  GONE_RETRY_MS,
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
