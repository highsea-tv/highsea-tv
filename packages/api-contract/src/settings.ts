// SPDX-License-Identifier: AGPL-3.0-only
// Settings areas built in checkpoint 2 (settings.md): Network and remote access, and Security.
// Their screens come with the rest of Settings; the API is here for setup and the clients.
// Checkpoint 4 adds General's Metadata group (the TMDB key, language and region; decision 1) and
// the Quality sizes table, read-only until checkpoint 8.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, json } from './common.ts'
import { QualitySize } from './quality.ts'

export const NetworkSettings = z
  .object({
    remoteAccess: z.enum(['local-only', 'reverse-proxy', 'port-forward']),
    externalUrl: z.string().max(2000).openapi({ example: 'https://harbor.example.net' }),
    trustedProxies: z.string().max(4000).openapi({ example: '172.16.0.0/12' }),
    proxyHeaders: z.boolean(),
    tls: z.enum(['proxy', 'built-in', 'off']),
    httpsPort: z.number().int(),
    discovery: z.boolean(),
  })
  .openapi('NetworkSettings')

export const NetworkStatus = NetworkSettings.extend({
  localAddresses: z.array(z.string()),
  discoveryPort: z.number().int(),
  /** Why built-in TLS isn't serving, when it's on and can't. */
  tlsProblem: z.string().nullable(),
}).openapi('NetworkStatus')

const Oidc = z.object({
  enabled: z.boolean(),
  name: z.string().max(60),
  issuer: z.string().max(2000),
  clientId: z.string().max(400),
})

/** Require two-step for the owner and admins, the only people who open the admin (ADR 0032). */
const RequireTwoFactor = z.boolean().openapi({
  description: 'Require two-step verification for the owner and admins in the admin',
})

export const SecuritySettings = z
  .object({
    twoFactor: RequireTwoFactor,
    passkeys: z.boolean(),
    sessionDays: z.number().int(),
    oidc: Oidc.extend({ clientSecretSet: z.boolean() }),
    proxyAuth: z.object({ enabled: z.boolean(), header: z.string() }),
  })
  .openapi('SecuritySettings')

export const SecurityInput = z
  .object({
    twoFactor: RequireTwoFactor,
    passkeys: z.boolean(),
    sessionDays: z.number().int(),
    oidc: Oidc.extend({
      /** A new secret; omit to keep the current one, null to remove it. */
      clientSecret: z.string().max(2000).nullable().optional(),
    }),
    proxyAuth: z.object({ enabled: z.boolean(), header: z.string().max(100) }),
  })
  .openapi('SecurityInput')

/** A TMDB API key (v3) or API Read Access Token: either works, told apart by shape. */
export const MetadataKey = z.string().trim().min(1).max(1000)

/** BCP 47 language and region (`en-US`), as TMDB's `language` parameter takes it. */
const MetadataLanguage = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
  .openapi({ example: 'en-US' })

/** ISO 3166-1 alpha-2, as TMDB's `region` parameter takes it. */
const Region = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .openapi({ example: 'GB' })

export const MetadataSettings = z
  .object({
    /** Never the key itself. */
    key: z.object({
      set: z.boolean(),
      /** Its last four characters, so the owner can tell which one it is. */
      last4: z.string().nullable(),
    }),
    language: MetadataLanguage,
    /** For certifications, release dates and Discover's lists. The owner's locale by default. */
    region: Region,
  })
  .openapi('MetadataSettings')

export const MetadataInput = z
  .object({
    /** A new key, checked with TMDB before it's saved. Omit to keep the current one. */
    key: MetadataKey,
    language: MetadataLanguage,
    region: Region,
  })
  .partial()
  .openapi('MetadataInput')

const SETTINGS = `${API_PREFIX}/settings`

export const settings = {
  network: createRoute({
    method: 'get',
    path: `${SETTINGS}/network`,
    tags: ['Settings'],
    summary: 'Network and remote access',
    ...access('staff'),
    responses: {
      200: json(NetworkStatus, 'The settings and their effect'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveNetwork: createRoute({
    method: 'put',
    path: `${SETTINGS}/network`,
    tags: ['Settings'],
    summary: 'Save network and remote access',
    description:
      'Discovery restarts at once. A change to built-in TLS takes effect when the server restarts.',
    ...access('owner'),
    request: { ...body(NetworkSettings) },
    responses: {
      200: json(NetworkStatus, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  security: createRoute({
    method: 'get',
    path: `${SETTINGS}/security`,
    tags: ['Settings'],
    summary: 'Security: two-step policy, passkeys, sessions, single sign-on, proxy sign-in',
    ...access('owner'),
    responses: {
      200: json(SecuritySettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveSecurity: createRoute({
    method: 'put',
    path: `${SETTINGS}/security`,
    tags: ['Settings'],
    summary: 'Save security',
    ...access('owner'),
    request: { ...body(SecurityInput) },
    responses: {
      200: json(SecuritySettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  qualitySizes: createRoute({
    method: 'get',
    path: `${SETTINGS}/qualitySizes`,
    tags: ['Settings'],
    summary: 'Quality sizes: MB per minute for each quality',
    description: 'Read-only until checkpoint 8. The megabytes are MiB.',
    ...access('staff'),
    responses: {
      200: json(z.array(QualitySize), 'The sizes, lowest quality first'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  metadata: createRoute({
    method: 'get',
    path: `${SETTINGS}/metadata`,
    tags: ['Settings'],
    summary: 'Metadata: whether a TMDB key is set, the language and the region',
    ...access('staff'),
    responses: {
      200: json(MetadataSettings, 'The settings'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  saveMetadata: createRoute({
    method: 'put',
    path: `${SETTINGS}/metadata`,
    tags: ['Settings'],
    summary: 'Save the TMDB key, the metadata language or the region',
    description:
      'A new key is checked with TMDB first: 400 with `details.reason` `tmdb-key-rejected` when TMDB doesn’t accept it, 503 (`tmdb-unreachable`) when TMDB can’t be reached. Nothing is saved unless every field is. The key is stored encrypted and never returned.',
    ...access('owner'),
    request: { ...body(MetadataInput) },
    responses: {
      200: json(MetadataSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'rate-limited', 'unavailable'),
    },
  }),
  removeMetadataKey: createRoute({
    method: 'delete',
    path: `${SETTINGS}/metadata`,
    tags: ['Settings'],
    summary: 'Remove the TMDB key',
    description: 'The library and its pages keep working from the cache.',
    ...access('owner'),
    responses: {
      200: json(MetadataSettings, 'Removed'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
} as const

export type NetworkSettings = z.infer<typeof NetworkSettings>
export type NetworkStatus = z.infer<typeof NetworkStatus>
export type SecuritySettings = z.infer<typeof SecuritySettings>
export type SecurityInput = z.infer<typeof SecurityInput>
export type MetadataSettings = z.infer<typeof MetadataSettings>
export type MetadataInput = z.infer<typeof MetadataInput>
