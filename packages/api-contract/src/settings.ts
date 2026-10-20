// SPDX-License-Identifier: AGPL-3.0-only
// Settings areas built in checkpoint 2 (settings.md): Network and remote access, and Security.
// Their screens come with the rest of Settings; the API is here for setup and the clients.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, json } from './common.ts'

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

export const SecuritySettings = z
  .object({
    twoFactor: z.enum(['everyone', 'staff', 'optional']),
    passkeys: z.boolean(),
    sessionDays: z.number().int(),
    oidc: Oidc.extend({ clientSecretSet: z.boolean() }),
    proxyAuth: z.object({ enabled: z.boolean(), header: z.string() }),
  })
  .openapi('SecuritySettings')

export const SecurityInput = z
  .object({
    twoFactor: z.enum(['everyone', 'staff', 'optional']),
    passkeys: z.boolean(),
    sessionDays: z.number().int(),
    oidc: Oidc.extend({
      /** A new secret; omit to keep the current one, null to remove it. */
      clientSecret: z.string().max(2000).nullable().optional(),
    }),
    proxyAuth: z.object({ enabled: z.boolean(), header: z.string().max(100) }),
  })
  .openapi('SecurityInput')

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
} as const

export type NetworkSettings = z.infer<typeof NetworkSettings>
export type NetworkStatus = z.infer<typeof NetworkStatus>
export type SecuritySettings = z.infer<typeof SecuritySettings>
export type SecurityInput = z.infer<typeof SecurityInput>
