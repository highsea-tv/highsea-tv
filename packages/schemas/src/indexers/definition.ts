// SPDX-License-Identifier: AGPL-3.0-only
// The indexer definition format (ADR 0033): data the engine interprets, never code. Written from
// highsea's own specification; it shares its purpose with Cardigann's format but no text or
// schema with it. One definition is one YAML or JSON document; this module is its shape, and
// `validateDefinition` adds the checks a shape can’t express.
import { z } from 'zod'
import { isSemver } from './version.ts'

const semver = z.string().refine(isSemver, 'Use a version like 1.2.3.')
/** A template string; `validateDefinition` parses each one and checks what it names. */
const template = z.string().max(2000)
const url = z
  .string()
  .max(2000)
  .refine((v) => /^https?:\/\/[^\s/]+/.test(v), 'Use an http:// or https:// address.')

export const settingFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'Keys are camelCase, like apiKey.'),
    label: z.string().min(1).max(60),
    type: z.enum(['text', 'password', 'select', 'checkbox', 'number', 'url']),
    required: z.boolean().default(false),
    /** Encrypted at rest and never returned by the API. Passwords always are. */
    secret: z.boolean().default(false),
    /** "Where to find this", shown under the field. */
    help: z.string().max(400).nullable().default(null),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    options: z
      .array(z.object({ value: z.string(), label: z.string() }))
      .min(1)
      .optional(),
  })
  .strict()
export type SettingField = z.infer<typeof settingFieldSchema>

/** Headers a definition may never set: the engine owns these. */
export const RESERVED_HEADERS = [
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'proxy-authorization',
  'te',
  'trailer',
]

export const requestSchema = z
  .object({
    method: z.enum(['GET', 'POST']).default('GET'),
    /** Resolved against the base URL; it can’t name another host. */
    path: template,
    query: z.record(z.string(), template).default({}),
    /** A form body, for POST. */
    form: z.record(z.string(), template).optional(),
    headers: z.record(z.string(), template).optional(),
  })
  .strict()
export type RequestTemplate = z.infer<typeof requestSchema>

/**
 * Filters a field's text goes through, in order. A fixed list: patterns are regular expressions
 * compiled by the engine, capped in length and checked at validation.
 */
export const fieldFilterSchema = z.discriminatedUnion('filter', [
  z.object({ filter: z.literal('trim') }).strict(),
  z
    .object({
      filter: z.literal('replace'),
      pattern: z.string().min(1).max(200),
      with: z.string().max(200).default(''),
      ignoreCase: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      filter: z.literal('match'),
      pattern: z.string().min(1).max(200),
      group: z.number().int().min(0).max(9).default(1),
      ignoreCase: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      filter: z.literal('split'),
      by: z.string().min(1).max(20),
      index: z.number().int(),
    })
    .strict(),
  z.object({ filter: z.literal('prepend'), value: z.string().max(400) }).strict(),
  z.object({ filter: z.literal('append'), value: z.string().max(400) }).strict(),
  z.object({ filter: z.literal('querystring'), param: z.string().min(1).max(60) }).strict(),
  /** Text to one of a few values, for flags like "Freeleech" → 0. Unmatched text passes. */
  z
    .object({
      filter: z.literal('map'),
      values: z.record(z.string(), z.string()),
      ignoreCase: z.boolean().default(true),
    })
    .strict(),
  /** "1.4 GB", "700 MiB", "1,234,567" → bytes. Units are powers of 1024, as trackers mean them. */
  z.object({ filter: z.literal('size') }).strict(),
  z.object({ filter: z.literal('number') }).strict(),
  /** To an ISO date: ISO 8601 or RFC 2822 text, Unix seconds or milliseconds, or "3 hours ago". */
  z
    .object({
      filter: z.literal('date'),
      format: z.enum(['text', 'unix', 'unixms', 'relative']).default('text'),
    })
    .strict(),
])
export type FieldFilter = z.infer<typeof fieldFilterSchema>

/**
 * Where a field's value comes from: a JSON path (json), a CSS selector and attribute (html), or
 * a template over fields already read (`.Result.<field>`) and the settings.
 */
export const fieldSchema = z
  .object({
    /** Dotted path into a JSON row: `info.size`, `files.0.name`. Empty for the row itself. */
    path: z.string().max(200).optional(),
    /** A CSS selector within the row; omitted for the row itself. */
    selector: z.string().max(400).optional(),
    /** An attribute instead of the text, like `href`. */
    attribute: z.string().max(60).optional(),
    text: template.optional(),
    filters: z.array(fieldFilterSchema).max(20).default([]),
    /** A missing optional field is left empty instead of skipping the row. */
    optional: z.boolean().default(false),
  })
  .strict()
export type FieldMapping = z.infer<typeof fieldSchema>

/** What a search result can say. A row needs a title and one way to fetch the release. */
export const RELEASE_FIELDS = [
  'title',
  'guid',
  /** The .torrent or .nzb address. */
  'download',
  'magnet',
  'infohash',
  /** The release's page on the site. */
  'details',
  'size',
  'seeders',
  'leechers',
  'peers',
  'grabs',
  'files',
  'published',
  'imdbId',
  'tmdbId',
  /** The site's own category id, mapped through the definition's categories. */
  'category',
  'downloadVolumeFactor',
  'uploadVolumeFactor',
  'minimumRatio',
  'minimumSeedTime',
] as const
export type ReleaseField = (typeof RELEASE_FIELDS)[number]

/** Query inputs a json, html or rss definition says its site understands. */
export const SEARCH_INPUTS = ['q', 'imdbid', 'tmdbid', 'year'] as const

const categoryMapSchema = z
  .object({
    /** The site's id, as the site writes it. */
    id: z.string().min(1).max(40),
    /** The standard category it stands for. */
    standard: z.number().int().min(1000).max(99_999),
    name: z.string().max(80).optional(),
  })
  .strict()

const errorRuleSchema = z
  .object({
    /** A JSON path that holds an error when it's there and not empty. */
    path: z.string().max(200).optional(),
    /** An element that means an error when present. */
    selector: z.string().max(400).optional(),
    /** The credentials are wrong: skip backoff and fail at once. */
    auth: z.boolean().default(false),
  })
  .strict()
  .refine((r) => Boolean(r.path) !== Boolean(r.selector), 'Give a path or a selector.')

const rowsSchema = z.union([
  z.object({ path: z.string().max(200) }).strict(),
  z
    .object({
      selector: z.string().min(1).max(400),
      /** Header rows to skip. */
      skip: z.number().int().min(0).max(10).default(0),
    })
    .strict(),
])

const scrapeSearchSchema = z
  .object({
    request: requestSchema,
    rows: rowsSchema,
    fields: z.record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/), fieldSchema),
    supports: z.array(z.enum(SEARCH_INPUTS)).min(1).default(['q']),
  })
  .strict()

export const loginSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('none') }).strict(),
  /** The key goes in templates; the method only says so for the form and the docs. */
  z.object({ method: z.literal('apikey') }).strict(),
  z.object({ method: z.literal('cookie'), cookie: template }).strict(),
  z
    .object({
      method: z.literal('form'),
      request: requestSchema,
      /** An element that only appears when the sign-in failed. */
      error: z
        .object({ selector: z.string().max(400) })
        .strict()
        .optional(),
      /** An element that only appears when signed in. */
      loggedIn: z
        .object({ selector: z.string().max(400) })
        .strict()
        .optional(),
    })
    .strict(),
])
export type Login = z.infer<typeof loginSchema>

const common = {
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/, 'Ids are lowercase letters, digits and hyphens.'),
  version: semver,
  minEngineVersion: semver,
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  privacy: z.enum(['public', 'semi-private', 'private']),
  /** A BCP 47 tag for the site's main language: `en`, `pt-BR`. */
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  /** The site's addresses, first is the default. A generic definition has none and a `baseUrl`. */
  links: z.array(url).max(10).default([]),
  /** A template, so a generic definition can take it from a setting. Defaults to `links[0]`. */
  baseUrl: template.optional(),
  /** A file beside the definition in the catalog, embedded in the bundle. */
  logo: z
    .string()
    .regex(/^[a-z0-9-]+\.(svg|png)$/)
    .optional(),
  /** In setup's starter pack. Only public definitions qualify. */
  starter: z.boolean().default(false),
  categories: z.array(categoryMapSchema).min(1).max(200),
  settings: z.array(settingFieldSchema).max(20).default([]),
  login: loginSchema.default({ method: 'none' }),
  errors: z.array(errorRuleSchema).max(10).default([]),
  rateLimit: z
    .object({
      requests: z.number().int().min(1).max(1000),
      seconds: z.number().int().min(1).max(86_400),
      /** At least this long between two requests. */
      minGapMs: z.number().int().min(0).max(60_000).default(0),
    })
    .strict()
    .optional(),
  /** What a test searches for. Empty keywords ask for the latest releases. */
  test: z
    .object({ keywords: z.string().max(100).default('') })
    .strict()
    .default({ keywords: '' }),
  /** Who wrote this definition, and from what. */
  source: z
    .object({
      author: z.string().min(1).max(100),
      /** The site's own documentation the definition was written from, or the page itself. */
      documentation: url,
    })
    .strict(),
  /** An SPDX licence id for the definition itself. */
  license: z.string().regex(/^[A-Za-z0-9.+-]+$/, 'Use an SPDX id, like CC0-1.0.'),
}

const feedApi = z
  .object({
    path: template.default('/api'),
    /** Sent as `apikey` when it renders to something. */
    apiKey: template.optional(),
  })
  .strict()
  .default({ path: '/api' })
const torznabSchema = z.object({ ...common, kind: z.literal('torznab'), api: feedApi })
const newznabSchema = z.object({ ...common, kind: z.literal('newznab'), api: feedApi })

const jsonSchema = z.object({ ...common, kind: z.literal('json'), search: scrapeSearchSchema })
const htmlSchema = z.object({ ...common, kind: z.literal('html'), search: scrapeSearchSchema })
const rssSchema = z.object({
  ...common,
  kind: z.literal('rss'),
  search: z
    .object({
      request: requestSchema,
      supports: z.array(z.enum(SEARCH_INPUTS)).min(1).default(['q']),
    })
    .strict(),
})

export const definitionSchema = z.discriminatedUnion('kind', [
  torznabSchema.strict(),
  newznabSchema.strict(),
  jsonSchema.strict(),
  htmlSchema.strict(),
  rssSchema.strict(),
])
export type Definition = z.infer<typeof definitionSchema>
export type DefinitionInput = z.input<typeof definitionSchema>
export type DefinitionKind = Definition['kind']
export const DEFINITION_KINDS = ['torznab', 'newznab', 'json', 'html', 'rss'] as const

/** Torrents for every kind but Newznab. */
export function protocolOf(definition: Pick<Definition, 'kind'>): 'torrent' | 'usenet' {
  return definition.kind === 'newznab' ? 'usenet' : 'torrent'
}

/** Whether a setting is stored encrypted and hidden from the API. */
export function isSecret(field: SettingField): boolean {
  return field.secret || field.type === 'password'
}
