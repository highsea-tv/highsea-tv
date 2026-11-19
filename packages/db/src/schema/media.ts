// SPDX-License-Identifier: AGPL-3.0-only
// Movies (checkpoint 4): two layers joined by TMDB id (ADR 0014). The metadata cache holds every
// title, person and collection the server has fetched, in the library or not, each with the time it
// was fetched, since TMDB's terms limit cached data to six months (ADR 0030). The library holds
// what the owner added: items in the unified tree with their versions (ADR 0012). The acquisition
// tables (profiles, formats, root folders, tags) belong to the pipeline. Server-wide areas
// (`metadata`, `qualitySizes`) are settings rows.

import { sql } from 'drizzle-orm'
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { profiles, users } from './auth.ts'

/**
 * A title's type in the unified tree (ADR 0012, ADR 0064): a film, or a show with its seasons and
 * episodes as rows of their own, a season's `parent_id` its show's and an episode's its season's.
 */
export const MEDIA_TYPES = ['movie', 'show', 'season', 'episode'] as const
export type MediaType = (typeof MEDIA_TYPES)[number]

export const MINIMUM_AVAILABILITY = ['announced', 'in-cinemas', 'released'] as const
export type MinimumAvailability = (typeof MINIMUM_AVAILABILITY)[number]

/** What the library shows for an item until files and downloads exist (checkpoint 6). */
export const LIBRARY_STATUSES = [
  'available',
  'wanted',
  'downloading',
  'not-released',
  'unmonitored',
] as const
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number]

// ---------------------------------------------------------------- the metadata cache

/**
 * A movie as TMDB returned it (`/3/movie/{id}` with its appended credits, videos, release dates,
 * external ids and recommendations), in the language it was asked for. Mapped to the API's shape on
 * read, so a change of region needs no refetch. The columns beside `data` are what lists sort on.
 */
export const movieMetadata = sqliteTable(
  'movie_metadata',
  {
    tmdbId: integer('tmdb_id').primaryKey(),
    title: text('title').notNull(),
    originalTitle: text('original_title').notNull(),
    year: integer('year'),
    /** `YYYY-MM-DD`, TMDB's primary release date. */
    releaseDate: text('release_date'),
    /** TMDB's `vote_average`, 0 to 10, and `vote_count`, as given. */
    voteAverage: real('vote_average').notNull().default(0),
    voteCount: integer('vote_count').notNull().default(0),
    popularity: real('popularity').notNull().default(0),
    collectionId: integer('collection_id'),
    /** ISO 639-1, TMDB's `original_language` (checkpoint 8d, for collection rules). */
    originalLanguage: text('original_language'),
    /** Minutes. */
    runtime: integer('runtime'),
    /** The theatrical certification in the server's region (`PG-13`), from `release_dates`. */
    certification: text('certification'),
    /** The metadata language it was fetched in (`en-US`). */
    language: text('language').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    /** When a refresh got TMDB's 404 (`status_code` 34): the id was removed or merged. */
    goneAt: integer('gone_at'),
  },
  (t) => [
    index('movie_metadata_fetched').on(t.fetchedAt),
    index('movie_metadata_collection').on(t.collectionId),
    index('movie_metadata_language').on(t.originalLanguage),
  ],
)

export const MOVIE_TERM_KINDS = ['genre', 'keyword', 'studio', 'country'] as const

/**
 * A cached movie's genres, keywords, production companies and countries, one row each, so
 * collection rules can ask for them with an index (checkpoint 8d). `value` is TMDB's id (the ISO
 * 3166-1 code for a country); `label` its name in the metadata language. Replaced whole when the
 * movie is refreshed, like its credits.
 */
export const movieTerms = sqliteTable(
  'movie_terms',
  {
    movieId: integer('movie_id')
      .notNull()
      .references(() => movieMetadata.tmdbId, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MOVIE_TERM_KINDS }).notNull(),
    value: text('value').notNull(),
    label: text('label').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.movieId, t.kind, t.value] }),
    index('movie_terms_value').on(t.kind, t.value),
    // a curation rule names its genre, in any case: an index on the expression the rule compares
    // (https://sqlite.org/expridx.html), so finding the name's id doesn't read every movie's terms
    index('movie_terms_label').on(t.kind, sql`lower(${t.label})`),
  ],
)

/** A person as TMDB returned them (`/3/person/{id}` with `movie_credits` and `external_ids`). */
export const people = sqliteTable(
  'people',
  {
    tmdbId: integer('tmdb_id').primaryKey(),
    name: text('name').notNull(),
    language: text('language').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    goneAt: integer('gone_at'),
  },
  (t) => [index('people_fetched').on(t.fetchedAt)],
)

/**
 * Cast and crew of each cached movie, in billing order, so a person's page can say which of their
 * titles are in the library without fetching them. Replaced whole when the movie is refreshed.
 */
export const credits = sqliteTable(
  'credits',
  {
    /** TMDB's `credit_id`. */
    id: text('id').primaryKey(),
    movieId: integer('movie_id')
      .notNull()
      .references(() => movieMetadata.tmdbId, { onDelete: 'cascade' }),
    personId: integer('person_id').notNull(),
    kind: text('kind', { enum: ['cast', 'crew'] }).notNull(),
    /** One of TMDB's 12 departments (`/3/configuration/jobs`); cast is Acting. */
    department: text('department').notNull(),
    /** The character (cast) or the job (crew). */
    role: text('role').notNull(),
    order: integer('order').notNull(),
  },
  (t) => [
    index('credits_movie').on(t.movieId, t.kind, t.order),
    index('credits_person').on(t.personId),
  ],
)

/** A collection as TMDB returned it (`/3/collection/{id}`), with its parts. */
export const collections = sqliteTable(
  'collections',
  {
    tmdbId: integer('tmdb_id').primaryKey(),
    name: text('name').notNull(),
    language: text('language').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    goneAt: integer('gone_at'),
  },
  (t) => [index('collections_fetched').on(t.fetchedAt)],
)

/**
 * A show as TMDB returned it (`/3/tv/{id}` with its appended credits, ratings, external ids, videos,
 * recommendations, keywords and images; ADR 0064), in the language it was asked for. Its seasons'
 * episodes are `season_metadata`'s. The columns beside `data` are what lists sort on.
 */
export const showMetadata = sqliteTable(
  'show_metadata',
  {
    tmdbId: integer('tmdb_id').primaryKey(),
    name: text('name').notNull(),
    originalName: text('original_name').notNull(),
    /** The year of `first_air_date`. */
    year: integer('year'),
    /** `YYYY-MM-DD`, TMDB's `first_air_date`. */
    firstAirDate: text('first_air_date'),
    voteAverage: real('vote_average').notNull().default(0),
    voteCount: integer('vote_count').notNull().default(0),
    popularity: real('popularity').notNull().default(0),
    /** TMDB's `status`: Returning Series, Planned, In Production, Ended, Canceled, Pilot. */
    status: text('status'),
    /** TheTVDB's id from `external_ids`, for `tvdb-…` folder names and `tvshow.nfo`. */
    tvdbId: integer('tvdb_id'),
    language: text('language').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    goneAt: integer('gone_at'),
  },
  (t) => [index('show_metadata_fetched').on(t.fetchedAt), index('show_metadata_tvdb').on(t.tvdbId)],
)

/**
 * One season of a cached show as TMDB returned it (`/3/tv/{id}/season/{n}` with its external ids),
 * its episodes inside. Fetched with the show and replaced with it; removed with it.
 */
export const seasonMetadata = sqliteTable(
  'season_metadata',
  {
    showId: integer('show_id')
      .notNull()
      .references(() => showMetadata.tmdbId, { onDelete: 'cascade' }),
    /** 0 for specials. */
    seasonNumber: integer('season_number').notNull(),
    /** TMDB's own id for the season. */
    tmdbId: integer('tmdb_id').notNull(),
    language: text('language').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.showId, t.seasonNumber] })],
)

/**
 * Images cached on disk under `/data/images`, at the sizes the screens use (TMDB's
 * `/3/configuration` lists them). Purged with the metadata they belong to.
 */
export const images = sqliteTable(
  'images',
  {
    /** TMDB's `file_path` (`/kqjL17yufvn9OVLyXYpvtyrFfak.jpg`). */
    path: text('path').notNull(),
    /** TMDB's size name (`w342`, `w780`, `original`). */
    size: text('size').notNull(),
    kind: text('kind', { enum: ['poster', 'backdrop', 'profile', 'still', 'logo'] }).notNull(),
    ownerType: text('owner_type', { enum: ['movie', 'person', 'collection', 'show'] }).notNull(),
    ownerId: integer('owner_id').notNull(),
    /** Relative to the images folder. */
    file: text('file').notNull(),
    contentType: text('content_type').notNull(),
    bytes: integer('bytes').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.path, t.size] }),
    index('images_owner').on(t.ownerType, t.ownerId),
  ],
)

/** What can own chosen artwork: movies and collections now; shows, seasons and episodes later. */
export const ARTWORK_OWNERS = ['movie', 'collection', 'show', 'season', 'episode'] as const
export const ARTWORK_KINDS = ['poster', 'backdrop', 'logo'] as const

/**
 * Artwork an admin chose for a title (HT-66, ADR 0030's 2026-11-18 section): one row per owner and
 * kind, in place of highsea's automatic choice until it's reset. A refresh never touches it. The
 * owner is addressed as images are, by its type and TMDB id (a season or an episode has its own).
 * An upload keeps its original here, so a backup holds it; its sizes are made from it into the
 * images folder when first asked for, as TMDB's are fetched.
 */
export const artwork = sqliteTable(
  'artwork',
  {
    ownerType: text('owner_type', { enum: ARTWORK_OWNERS }).notNull(),
    ownerId: integer('owner_id').notNull(),
    kind: text('kind', { enum: ARTWORK_KINDS }).notNull(),
    source: text('source', { enum: ['tmdb', 'upload'] }).notNull(),
    /** TMDB's `file_path`, or an upload's own name (`/hs-….png`), with its leading slash. */
    file: text('file').notNull(),
    /** ISO 639-1 of the image's text, as TMDB has it; null for none, and for uploads. */
    language: text('language'),
    width: integer('width'),
    height: integer('height'),
    /** An upload's original bytes; null for TMDB's. */
    data: blob('data', { mode: 'buffer' }),
    contentType: text('content_type'),
    /** Who chose it; null once their account is removed. */
    chosenBy: text('chosen_by').references(() => users.id, { onDelete: 'set null' }),
    chosenAt: integer('chosen_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerType, t.ownerId, t.kind] }),
    index('artwork_file').on(t.file),
  ],
)

// ---------------------------------------------------------------- the library

/**
 * The library's titles in the unified tree (ADR 0012). A title is addressed by its type and its id
 * at the provider (`tmdb_id` for movies), never by `id`, which only keys the rows below it. The
 * sort columns are copied from the cache on add and refresh, so library lists sort on an index,
 * with the row id last so paging has a stable order.
 */
export const mediaItems = sqliteTable(
  'media_items',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: MEDIA_TYPES }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    parentId: text('parent_id'),
    /**
     * A season's or an episode's show (ADR 0064), so a show's episodes are one indexed read, not a
     * walk through its seasons; null for films and shows.
     */
    showId: text('show_id'),
    /** A season's or an episode's season, 0 for specials; null for films and shows. */
    seasonNumber: integer('season_number'),
    /** An episode's place in its season, from 1 (specials from 1 too); null otherwise. */
    episodeNumber: integer('episode_number'),
    title: text('title').notNull(),
    /** The title lowercased, without a leading article, for sorting. */
    sortTitle: text('sort_title').notNull(),
    year: integer('year'),
    /** TMDB's `vote_average`, 0 to 10. */
    rating: real('rating').notNull().default(0),
    releaseDate: text('release_date'),
    /** The region's earliest digital and physical dates (checkpoint 8a), for the calendar. */
    digitalRelease: text('digital_release'),
    physicalRelease: text('physical_release'),
    status: text('status', { enum: LIBRARY_STATUSES }).notNull(),
    /** A version's file is under its profile's cutoff (checkpoint 8a): Wanted › Cutoff unmet. */
    cutoffUnmet: integer('cutoff_unmet', { mode: 'boolean' }).notNull().default(false),
    /** When the backlog sweep may search it next, and how many sweeps found nothing (8a). */
    nextSearchAt: integer('next_search_at'),
    searches: integer('searches').notNull().default(0),
    monitored: integer('monitored', { mode: 'boolean' }).notNull(),
    minimumAvailability: text('minimum_availability', { enum: MINIMUM_AVAILABILITY }).notNull(),
    /** The first version's profile, for the library's filter. */
    qualityProfileId: text('quality_profile_id').notNull(),
    /** A `language_profiles` row, checked by the subtitles package (no foreign key: subtitles.ts). */
    languageProfileId: text('language_profile_id'),
    rootFolder: text('root_folder').notNull(),
    path: text('path').notNull(),
    addedAt: integer('added_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('media_items_provider').on(t.type, t.tmdbId),
    index('media_items_parent').on(t.parentId),
    // a show's seasons and episodes in order (ADR 0064); films have no show and stay out of it
    index('media_items_show')
      .on(t.showId, t.seasonNumber, t.episodeNumber)
      .where(sql`show_id IS NOT NULL`),
    index('media_items_title').on(t.type, t.sortTitle, t.id),
    index('media_items_year').on(t.type, t.year, t.id),
    index('media_items_added').on(t.type, t.addedAt, t.id),
    index('media_items_rating').on(t.type, t.rating, t.id),
    index('media_items_release').on(t.type, t.releaseDate, t.id),
    index('media_items_status').on(t.type, t.status, t.sortTitle, t.id),
    index('media_items_profile').on(t.type, t.qualityProfileId, t.sortTitle, t.id),
    index('media_items_monitored').on(t.type, t.monitored, t.sortTitle, t.id),
    // the status tabs' counts under a profile or monitored filter
    index('media_items_profile_status').on(t.type, t.qualityProfileId, t.status),
    index('media_items_monitored_status').on(t.type, t.monitored, t.status),
    // Wanted and the calendar (checkpoint 8a)
    index('media_items_cutoff').on(t.type, t.cutoffUnmet, t.sortTitle, t.id),
    // the backlog sweep and RSS: only the rows they read, so 100k movies with files cost nothing
    // (https://sqlite.org/partialindex.html); the queries repeat this WHERE word for word
    index('media_items_wanted')
      .on(t.type, t.nextSearchAt)
      .where(sql`monitored = 1 AND (status = 'wanted' OR cutoff_unmet = 1)`),
    index('media_items_digital').on(t.type, t.digitalRelease),
    index('media_items_physical').on(t.type, t.physicalRelease),
  ],
)

/**
 * An item's versions (ADR 0012): "4K HDR" and "1080p", each with its own profile and file. An
 * episode has its versions too, and a multi-episode file is one `media_files` row that a version of
 * each of its episodes points at (ADR 0064).
 */
export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    qualityProfileId: text('quality_profile_id').notNull(),
    /** The version's file once there is one (checkpoint 6). */
    fileId: text('file_id'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('versions_item').on(t.itemId, t.position),
    index('versions_profile').on(t.qualityProfileId),
    // a multi-episode file's episodes: each holds a version pointing at the one file (ADR 0064)
    index('versions_file').on(t.fileId),
  ],
)

/**
 * What only a show has in the library (ADR 0012's extension tables, ADR 0064): whether its files go
 * in season folders, and its TheTVDB and IMDb ids, copied from TMDB's `external_ids` on add and
 * refresh so a `tvdb-…` folder or a `tvshow.nfo` finds it without asking TMDB.
 */
export const showDetails = sqliteTable(
  'show_details',
  {
    itemId: text('item_id')
      .primaryKey()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    seasonFolders: integer('season_folders', { mode: 'boolean' }).notNull().default(true),
    tvdbId: integer('tvdb_id'),
    imdbId: text('imdb_id'),
  },
  (t) => [index('show_details_tvdb').on(t.tvdbId)],
)

/**
 * Where each profile stopped, per item (ADR 0054, per profile since ADR 0068). Written by playback
 * in Phase 4; read by the client API now.
 */
export const watchPositions = sqliteTable(
  'watch_positions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    positionSeconds: integer('position_seconds').notNull(),
    durationSeconds: integer('duration_seconds'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.itemId] }),
    index('watch_positions_recent').on(t.profileId, t.updatedAt),
  ],
)

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  label: text('label').notNull().unique(),
  createdAt: integer('created_at').notNull(),
})

export const mediaItemTags = sqliteTable(
  'media_item_tags',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] }), index('media_item_tags_tag').on(t.tagId)],
)

// ---------------------------------------------------------------- acquisition

/**
 * A quality profile (ADR 0031): allowed qualities in groups with the cutoff, upgrades, the format
 * scores. `data` holds @highsea-tv/quality's `QualityProfile`, checked with its schema on read.
 */
export const qualityProfiles = sqliteTable('quality_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  data: text('data', { mode: 'json' }).notNull(),
  position: integer('position').notNull(),
  /** One of the profiles highsea seeds (checkpoint 8c): editable, but marked as such. */
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** A custom format: conditions with `negate` and `required` (ADR 0031). */
export const customFormats = sqliteTable('custom_formats', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  source: text('source', { enum: ['preset', 'custom'] }).notNull(),
  /** The TRaSH Guides format it was imported from, so a later import updates it in place. */
  trashId: text('trash_id'),
  /** A preset the owner changed (checkpoint 8c): "Yours", left alone by later imports. */
  edited: integer('edited', { mode: 'boolean' }).notNull().default(false),
  conditions: text('conditions', { mode: 'json' }).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** The folders movies are filed under. Free space and the device are read live. */
/**
 * What a root folder holds (prototype-gaps.md's stage 6, Phase 5 A1): one kind each. Shows' and
 * music's folders are kept from A1 and used from parts B and D.
 */
export const LIBRARY_KINDS = ['movies', 'shows', 'music'] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

export const rootFolders = sqliteTable('root_folders', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  kind: text('kind', { enum: LIBRARY_KINDS }).notNull().default('movies'),
  /**
   * highsea only reads this folder (ADR 0063): the owner said so when adding it, or it was mounted
   * read-only. Nothing is written, renamed or deleted under it until it's switched to managed.
   */
  readOnly: integer('read_only', { mode: 'boolean' }).notNull().default(false),
  /** The language profile a movie added here takes when nothing else is chosen (checkpoint 8c). */
  languageProfileId: text('language_profile_id'),
  createdAt: integer('created_at').notNull(),
})

/**
 * A file in the library (ADR 0012): a version's file, with what ffprobe found in it. A multi-episode
 * file's `item_id` is its first episode; the episodes it holds are the versions pointing at it
 * (ADR 0064).
 */
export const mediaFiles = sqliteTable(
  'media_files',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => versions.id, { onDelete: 'set null' }),
    path: text('path').notNull().unique(),
    size: integer('size').notNull(),
    quality: text('quality'),
    releaseGroup: text('release_group'),
    /** The release name it came from. */
    sceneName: text('scene_name'),
    edition: text('edition'),
    /** The probe: duration, container, video, audio and subtitle streams. */
    mediaInfo: text('media_info', { mode: 'json' }),
    /** How it reached the library: hardlink, reflink or copy, or a move. */
    transfer: text('transfer'),
    /** From the probe, for collection rules (checkpoint 8d): lines (`2160`), the HDR format, the codec. */
    resolution: integer('resolution'),
    hdr: text('hdr'),
    videoCodec: text('video_codec'),
    addedAt: integer('added_at').notNull(),
  },
  (t) => [index('media_files_item').on(t.itemId), index('media_files_version').on(t.versionId)],
)

/**
 * A file's audio and embedded subtitle languages from the probe, ISO 639-1, one row each
 * (checkpoint 8d). Sidecar subtitles are `subtitle_files`.
 */
export const mediaFileLanguages = sqliteTable(
  'media_file_languages',
  {
    fileId: text('file_id')
      .notNull()
      .references(() => mediaFiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['audio', 'subtitle'] }).notNull(),
    language: text('language').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fileId, t.kind, t.language] }),
    index('media_file_languages_language').on(t.kind, t.language),
  ],
)

export const HISTORY_TYPES = [
  'grabbed',
  'imported',
  'import-failed',
  'deleted',
  'renamed',
  'blocklisted',
  'download-failed',
  'subtitle-downloaded',
  'subtitle-synced',
  'subtitle-upgraded',
  'subtitle-deleted',
  'subtitle-sync-failed',
] as const

/** What happened to each item, newest first, cursor-paged on (date, id). */
export const history = sqliteTable(
  'history',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    type: text('type', { enum: HISTORY_TYPES }).notNull(),
    date: integer('date').notNull(),
    sourceTitle: text('source_title').notNull(),
    quality: text('quality'),
    indexer: text('indexer'),
    message: text('message'),
    downloadId: text('download_id'),
    data: text('data', { mode: 'json' }),
  },
  (t) => [
    index('history_item').on(t.itemId, t.date, t.id),
    index('history_date').on(t.date, t.id),
    index('history_type').on(t.type, t.date, t.id),
  ],
)
