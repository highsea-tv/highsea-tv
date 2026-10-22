// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections (collections.md, docs/plans/smart-collections.md; checkpoint 8d, ADR 0049):
// collections the owner and admins make, from rules that keep themselves current or from titles
// picked by hand, with titles always or never included. The admin's routes sit under
// `/curation/collections`, beside featured sections; the apps read theirs under
// `/library/collections`, audience applied and only what the person can play. TMDB's collection
// page keeps `/collections/{id}` (ADR 0014). Titles are TMDB ids, as everywhere else.
import { createRoute, z } from '@hono/zod-openapi'
import { ClientType } from './accounts.ts'
import { API_PREFIX, access, body, errors, IdParam, IsoDate, json, noContent } from './common.ts'
import { Audience } from './curation.ts'
import { ClientItem } from './library.ts'
import { Art } from './metadata.ts'

// ---------------------------------------------------------------- rules

export const RULE_OPS = [
  'contains',
  'is',
  'isNot',
  'between',
  'before',
  'after',
  'inLast',
  'atLeast',
  'atMost',
  'oneOf',
  'notOneOf',
  'includes',
  'excludes',
  'only',
  'anyOf',
  'allOf',
  'noneOf',
] as const
export const RuleOp = z.enum(RULE_OPS).openapi('RuleOp')
export type RuleOp = z.infer<typeof RuleOp>

/**
 * What a field holds, which fixes its value's shape: `number` a number, or a pair for `between`;
 * `date` `YYYY-MM-DD` for `before` and `after`, a number of days for `inLast`; `choice` one value,
 * or several for `oneOf`; `list` several values; `person` TMDB person ids; `text` a string.
 */
export const RULE_FIELD_TYPES = ['number', 'date', 'choice', 'list', 'person', 'text'] as const
export type RuleFieldType = (typeof RULE_FIELD_TYPES)[number]

/**
 * Every field, its type and its comparisons (the plan's conditions table). Units: `year` a year,
 * or years for `inLast`; `rating` out of 5, as the admin shows it; `runtime` minutes; `size` GB;
 * `resolution` lines (`480`, `720`, `1080`, `2160`). `watched` and `lastPlayed` come with playback
 * (Phase 4) and are refused until then.
 */
export const RULE_FIELDS = {
  title: { type: 'text', ops: ['contains'] },
  year: { type: 'number', ops: ['is', 'between', 'before', 'after', 'inLast'] },
  releaseDate: { type: 'date', ops: ['before', 'after', 'inLast'] },
  decade: { type: 'choice', ops: ['is', 'isNot'] },
  rating: { type: 'number', ops: ['atLeast', 'atMost', 'between'] },
  votes: { type: 'number', ops: ['atLeast'] },
  certification: { type: 'choice', ops: ['is', 'isNot', 'atMost'] },
  originalLanguage: { type: 'choice', ops: ['is', 'isNot', 'oneOf'] },
  audioLanguage: { type: 'list', ops: ['includes', 'only', 'excludes'] },
  subtitleLanguage: { type: 'list', ops: ['includes', 'excludes'] },
  genre: { type: 'list', ops: ['anyOf', 'allOf', 'noneOf'] },
  runtime: { type: 'number', ops: ['atLeast', 'atMost', 'between'] },
  keyword: { type: 'list', ops: ['anyOf', 'noneOf'] },
  studio: { type: 'list', ops: ['oneOf', 'notOneOf'] },
  country: { type: 'list', ops: ['oneOf', 'notOneOf'] },
  actor: { type: 'person', ops: ['includes', 'excludes'] },
  director: { type: 'person', ops: ['includes', 'excludes'] },
  writer: { type: 'person', ops: ['includes', 'excludes'] },
  composer: { type: 'person', ops: ['includes', 'excludes'] },
  producer: { type: 'person', ops: ['includes', 'excludes'] },
  cinematographer: { type: 'person', ops: ['includes', 'excludes'] },
  editor: { type: 'person', ops: ['includes', 'excludes'] },
  person: { type: 'person', ops: ['includes', 'excludes'] },
  collection: { type: 'list', ops: ['oneOf', 'notOneOf'] },
  added: { type: 'date', ops: ['inLast', 'before', 'after'] },
  status: { type: 'choice', ops: ['is', 'isNot'] },
  tag: { type: 'list', ops: ['anyOf', 'allOf', 'noneOf'] },
  rootFolder: { type: 'choice', ops: ['is', 'isNot'] },
  qualityProfile: { type: 'choice', ops: ['is', 'isNot'] },
  resolution: { type: 'choice', ops: ['is', 'atLeast'] },
  hdr: { type: 'choice', ops: ['is'] },
  videoCodec: { type: 'choice', ops: ['is', 'isNot'] },
  edition: { type: 'choice', ops: ['is', 'isNot'] },
  size: { type: 'number', ops: ['atLeast', 'atMost'] },
  watched: { type: 'choice', ops: ['is'] },
  lastPlayed: { type: 'date', ops: ['inLast'] },
} as const satisfies Record<string, { type: RuleFieldType; ops: readonly RuleOp[] }>

export type RuleField = keyof typeof RULE_FIELDS
export const RULE_FIELD_NAMES = Object.keys(RULE_FIELDS) as [RuleField, ...RuleField[]]
export const RuleField = z.enum(RULE_FIELD_NAMES).openapi('RuleField')

/** Fields shown in the editor but refused until what they read exists. */
export const PLAYBACK_FIELDS: readonly RuleField[] = ['watched', 'lastPlayed']

/** The crew job each role field matches, as TMDB names it (`/3/configuration/jobs`). */
export const ROLE_JOBS = {
  director: ['Director'],
  writer: ['Screenplay', 'Writer', 'Story', 'Novel', 'Author'],
  composer: ['Original Music Composer', 'Music'],
  producer: ['Producer', 'Executive Producer'],
  cinematographer: ['Director of Photography'],
  editor: ['Editor'],
} as const satisfies Partial<Record<RuleField, readonly string[]>>

export const RuleValue = z
  .union([
    z.number(),
    z.string().max(200),
    z.array(z.string().max(200)).min(1).max(100),
    z.tuple([z.number(), z.number()]),
  ])
  .openapi('RuleValue', {
    description:
      'A number, a pair for `between`, a date or a choice, or several choices; the field and comparison fix which',
  })

export const RuleCondition = z
  .object({
    kind: z.literal('condition'),
    /** The editor's key for the row; any string, unique in the collection. */
    id: z.string().max(40),
    field: RuleField,
    op: RuleOp,
    value: RuleValue,
  })
  .openapi('RuleCondition')
export type RuleCondition = z.infer<typeof RuleCondition>

/** A group of conditions, inside the top level. Groups go one level deep. */
export const RuleSubgroup = z
  .object({
    kind: z.literal('group'),
    id: z.string().max(40),
    match: z.enum(['all', 'any']),
    rules: z.array(RuleCondition).min(1).max(20),
  })
  .openapi('RuleSubgroup')

/** All or any of its rules: conditions, and groups of conditions. */
export const RuleGroup = z
  .object({
    kind: z.literal('group'),
    id: z.string().max(40),
    match: z.enum(['all', 'any']),
    rules: z
      .array(z.union([RuleCondition, RuleSubgroup]))
      .min(1)
      .max(30),
  })
  .openapi('RuleGroup')
export type RuleGroup = z.infer<typeof RuleGroup>

export const COLLECTION_SORTS = [
  'manual',
  'rating',
  'release',
  'year',
  'added',
  'title',
  'runtime',
  'popularity',
  'random',
] as const
export const CollectionSort = z.enum(COLLECTION_SORTS).openapi('CollectionSort', {
  description:
    '`manual` is the order of `include`, for a collection without rules; `random` changes once a day',
})

// ---------------------------------------------------------------- collections

const CollectionFields = {
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().max(500),
  /** An uploaded poster's address (ADR 0028), or null for a mosaic of the first four. */
  artwork: z.string().max(2000).nullable(),
  /** Null for a collection picked by hand. */
  rules: RuleGroup.nullable(),
  /** Always include, as TMDB ids: the picks, in their order, for a collection without rules. */
  include: z.array(z.number().int().positive()).max(500),
  /** Never include. It wins over `include`. */
  exclude: z.array(z.number().int().positive()).max(500),
  sort: CollectionSort,
  /** Highest, newest, longest or Z first. */
  descending: z.boolean(),
  /** The first N; null for all. */
  limit: z.number().int().min(1).max(500).nullable(),
  audience: Audience,
}

export const SmartCollection = z
  .object({ id: z.string(), ...CollectionFields, updatedAt: IsoDate })
  .openapi('SmartCollection')

export const SmartCollectionInput = z.object(CollectionFields).openapi('SmartCollectionInput')

/** A title in the editor's live result. */
export const CollectionPreviewItem = z
  .object({
    id: z.number().int(),
    title: z.string(),
    year: z.number().int().nullable(),
    poster: z.string().nullable(),
    /** Has a file, so the apps show it. */
    playable: z.boolean(),
  })
  .openapi('CollectionPreviewItem')

/** What a collection holds right now. */
export const CollectionPreview = z
  .object({
    /** Titles that match, files or not. */
    matched: z.number().int(),
    /** Of those, the ones with a file: what the apps show. */
    playable: z.number().int(),
    /** In the collection's order, after its limit; at most 60. */
    items: z.array(CollectionPreviewItem),
    /** The rules in words, in the server's language: "Released 2010–2020, rated 4.5 or more, in English". */
    words: z.string().nullable(),
  })
  .openapi('CollectionPreview')

/** A collection in the admin's list. */
export const CollectionSummary = SmartCollection.extend({
  matched: z.number().int(),
  playable: z.number().int(),
  /** Up to four posters for the mosaic. */
  mosaic: z.array(z.string()),
  words: z.string().nullable(),
  /** Featured sections that draw on it; it can't be deleted while there are any. */
  usedBy: z.array(z.object({ id: z.string(), title: z.string() })),
}).openapi('CollectionSummary')

/**
 * A field as the editor offers it. The admin names fields and groups them in its own catalog;
 * `options` are the choices found in the library (`value` is what a rule stores), absent for
 * numbers, dates, text and people, whom the editor finds by name.
 */
export const RuleFieldInfo = z
  .object({
    field: RuleField,
    type: z.enum(RULE_FIELD_TYPES),
    ops: z.array(RuleOp),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
    /** Shown but not yet usable: `playback` until Phase 4. */
    disabled: z.enum(['playback']).optional(),
  })
  .openapi('RuleFieldInfo')

/** A person a role field can name, found by name among the library's credits. */
export const RulePerson = z
  .object({
    id: z.number().int(),
    name: z.string(),
    photo: z.string().nullable(),
    /** Titles here they're credited on. */
    titles: z.number().int(),
  })
  .openapi('RulePerson')

/**
 * A collection as the apps show it: the server's own beside TMDB's. `id` is the collection's own
 * (`sc-…`) for the server's, and the TMDB id as a string for TMDB's.
 */
export const LibraryCollection = z
  .object({
    id: z.string(),
    name: z.string(),
    overview: z.string(),
    art: Art,
    /** How many titles this person can play in it. */
    count: z.number().int(),
    /** "2010–2016", or one year. */
    years: z.string(),
    /** The server's own collections: whether rules make it, the rules in words, and the mosaic. */
    smart: z
      .object({ rules: z.boolean(), words: z.string().nullable(), mosaic: z.array(z.string()) })
      .nullable(),
  })
  .openapi('LibraryCollection')

export const LibraryCollectionPage = z
  .object({ collection: LibraryCollection, items: z.array(ClientItem) })
  .openapi('LibraryCollectionPage')

/**
 * Topics (checkpoint 8d):
 * - `collections.updated`: the admin's list changed. Staff only.
 * - The apps hear `home.updated` (curation's) when a collection a person sees changes.
 */
export const COLLECTION_TOPICS = { collections: 'collections.updated' } as const

// ---------------------------------------------------------------- routes

const ADMIN = `${API_PREFIX}/curation/collections`
const APPS = `${API_PREFIX}/library/collections`
const ClientQuery = z.object({
  client: ClientType.optional().openapi({ description: 'The kind of app; `web` when absent' }),
})

export const collections = {
  list: createRoute({
    method: 'get',
    path: ADMIN,
    tags: ['Collections'],
    summary: 'Every collection, with what it holds now',
    ...access('staff'),
    responses: {
      200: json(z.array(CollectionSummary), 'Collections, in the admin’s order'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  add: createRoute({
    method: 'post',
    path: ADMIN,
    tags: ['Collections'],
    summary: 'Add a collection',
    description:
      '400 `invalid` names the rule at fault: a field and comparison that don’t go together, a value of the wrong shape, a field that comes with playback, or a collection that names itself.',
    ...access('staff'),
    request: { ...body(SmartCollectionInput) },
    responses: {
      201: json(SmartCollection, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  preview: createRoute({
    method: 'post',
    path: `${ADMIN}/preview`,
    tags: ['Collections'],
    summary: 'What a draft collection holds right now',
    description:
      'The editor’s live result. Nothing is saved; `id` is the collection being edited, if any.',
    ...access('staff'),
    request: {
      ...body(z.object({ id: z.string().max(64).optional(), collection: SmartCollectionInput })),
    },
    responses: {
      200: json(CollectionPreview, 'What it holds'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  fields: createRoute({
    method: 'get',
    path: `${ADMIN}/fields`,
    tags: ['Collections'],
    summary: 'The fields the rule builder offers, with the library’s choices',
    ...access('staff'),
    request: {
      query: z.object({
        except: z
          .string()
          .max(64)
          .optional()
          .openapi({ description: 'The collection being edited, left out of its own choices' }),
      }),
    },
    responses: {
      200: json(z.array(RuleFieldInfo), 'Fields, in the contract’s order'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  people: createRoute({
    method: 'get',
    path: `${ADMIN}/people`,
    tags: ['Collections'],
    summary: 'People credited on titles here, by name',
    description: 'For a role field, only people credited in that role.',
    ...access('staff'),
    request: {
      query: z.object({
        q: z.string().trim().max(100),
        field: RuleField.optional(),
      }),
    },
    responses: {
      200: json(z.array(RulePerson), 'At most 20, most titles first'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  get: createRoute({
    method: 'get',
    path: `${ADMIN}/{id}`,
    tags: ['Collections'],
    summary: 'A collection',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(CollectionSummary, 'The collection'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  save: createRoute({
    method: 'put',
    path: `${ADMIN}/{id}`,
    tags: ['Collections'],
    summary: 'Save a collection',
    ...access('staff'),
    request: { params: IdParam, ...body(SmartCollectionInput) },
    responses: {
      200: json(SmartCollection, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${ADMIN}/{id}`,
    tags: ['Collections'],
    summary: 'Delete a collection; its titles stay in the library',
    description: '409 `in-use` while a featured section draws on it, with `details.sections`.',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
}

/** The apps' reads: each person's collections, audience applied, only what they can play. */
export const libraryCollections = {
  collections: createRoute({
    method: 'get',
    path: APPS,
    tags: ['Library'],
    summary: 'Library › Collections: the server’s, then TMDB’s with titles here',
    description: 'A collection with nothing this person can play is left out.',
    ...access('user'),
    request: { query: ClientQuery },
    responses: {
      200: json(z.array(LibraryCollection), 'Collections'),
      ...errors('unauthorized'),
    },
  }),
  collection: createRoute({
    method: 'get',
    path: `${APPS}/{id}`,
    tags: ['Library'],
    summary: 'A collection’s page: the server’s (`sc-…`) or TMDB’s (its id)',
    ...access('user'),
    request: { params: IdParam, query: ClientQuery },
    responses: {
      200: json(LibraryCollectionPage, 'The collection and its titles'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
}

export type SmartCollection = z.infer<typeof SmartCollection>
export type SmartCollectionInput = z.infer<typeof SmartCollectionInput>
export type CollectionPreview = z.infer<typeof CollectionPreview>
export type RuleFieldInfo = z.infer<typeof RuleFieldInfo>
export type CollectionSummary = z.infer<typeof CollectionSummary>
export type LibraryCollection = z.infer<typeof LibraryCollection>
export type RulePerson = z.infer<typeof RulePerson>
export type LibraryCollectionPage = z.infer<typeof LibraryCollectionPage>
