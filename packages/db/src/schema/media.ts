// SPDX-License-Identifier: AGPL-3.0-only
// Movies (checkpoint 4): two layers joined by TMDB id (ADR 0014). The metadata cache holds every
// title, person and collection the server has fetched, in the library or not, each with the time it
// was fetched, since TMDB's terms limit cached data to six months (ADR 0030). The library holds
// what the owner added: items in the unified tree with their versions (ADR 0012). The acquisition
// tables (profiles, formats, root folders, tags) belong to the pipeline. Server-wide areas
// (`metadata`, `qualitySizes`) are settings rows.
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { users } from './auth.ts'

export const MEDIA_TYPES = ['movie'] as const
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
    ownerType: text('owner_type', { enum: ['movie', 'person', 'collection'] }).notNull(),
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
    title: text('title').notNull(),
    /** The title lowercased, without a leading article, for sorting. */
    sortTitle: text('sort_title').notNull(),
    year: integer('year'),
    /** TMDB's `vote_average`, 0 to 10. */
    rating: real('rating').notNull().default(0),
    releaseDate: text('release_date'),
    status: text('status', { enum: LIBRARY_STATUSES }).notNull(),
    monitored: integer('monitored', { mode: 'boolean' }).notNull(),
    minimumAvailability: text('minimum_availability', { enum: MINIMUM_AVAILABILITY }).notNull(),
    /** The first version's profile, for the library's filter. */
    qualityProfileId: text('quality_profile_id').notNull(),
    /** Seeded and edited in checkpoint 7; stored as given until then. */
    languageProfileId: text('language_profile_id'),
    rootFolder: text('root_folder').notNull(),
    path: text('path').notNull(),
    addedAt: integer('added_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('media_items_provider').on(t.type, t.tmdbId),
    index('media_items_parent').on(t.parentId),
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
  ],
)

/** An item's versions (ADR 0012): "4K HDR" and "1080p", each with its own profile and file. */
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
  ],
)

/** Where each person stopped, per item. Written by playback in Phase 4; read by the client API now. */
export const watchPositions = sqliteTable(
  'watch_positions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    positionSeconds: integer('position_seconds').notNull(),
    durationSeconds: integer('duration_seconds'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index('watch_positions_recent').on(t.userId, t.updatedAt),
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
 * scores. `data` holds @highsea/quality's `QualityProfile`, checked with its schema on read.
 */
export const qualityProfiles = sqliteTable('quality_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  data: text('data', { mode: 'json' }).notNull(),
  position: integer('position').notNull(),
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
  conditions: text('conditions', { mode: 'json' }).notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** The folders movies are filed under. Free space and the device are read live. */
export const rootFolders = sqliteTable('root_folders', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  createdAt: integer('created_at').notNull(),
})
