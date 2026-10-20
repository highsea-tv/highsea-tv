// SPDX-License-Identifier: AGPL-3.0-only
// System routes: health for Docker, the public info clients read before signing in (connectivity
// .md), and the event stream.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, errors, IsoDate, json } from './common.ts'
import { Branding, WIDGET_SOURCES } from './personalization.ts'

export const Health = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.array(
      z.object({ name: z.string(), ok: z.boolean(), message: z.string().optional() }),
    ),
  })
  .openapi('Health')

/** A provider's credit, in the wording its terms ask for (`TMDB_ATTRIBUTION`). */
export const Attribution = z
  .object({
    name: z.string().openapi({ example: 'TMDB' }),
    notice: z.string(),
    url: z.string().openapi({ example: 'https://www.themoviedb.org' }),
  })
  .openapi('Attribution')

export const PublicInfo = z
  .object({
    id: z.string().openapi({ example: 'srv_5k2m9x0q4r7t1v3w' }),
    name: z.string().openapi({ example: 'Harbor' }),
    version: z.string().openapi({ example: '0.1.0' }),
    localAddresses: z.array(z.string()).openapi({ example: ['http://192.168.1.20:3000'] }),
    publicUrl: z.string().nullable().openapi({ example: 'https://harbor.example.net' }),
    setupComplete: z.boolean(),
    /** What the sign-in screen offers here. Passkeys depend on the address the client used. */
    auth: z.object({
      local: z.boolean(),
      oidc: z.object({ name: z.string() }).nullable(),
      passkeys: z.boolean(),
    }),
    /** What this server can do so far: clients show a widget only when its source is here. */
    sources: z.array(z.enum(WIDGET_SOURCES)).openapi({ example: ['system', 'movies'] }),
    /**
     * The data providers whose terms ask to be credited, for each app's About (TMDB's terms).
     * Empty when absent: discovery answers leave it out to stay small.
     */
    attributions: z.array(Attribution).default([]),
  })
  .openapi('PublicInfo')

export const Server = z
  .object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    /** Inherited by every client; the owner sets it in Appearance. */
    branding: Branding,
    addresses: z.object({ local: z.array(z.string()), public: z.string().nullable() }),
    setupComplete: z.boolean(),
    /** Apps with the event stream open now. */
    clientsConnected: z.number().int(),
  })
  .openapi('Server')

export const Disk = z
  .object({ path: z.string(), label: z.string(), free: z.number(), total: z.number() })
  .openapi('Disk')

export const SystemStatus = z
  .object({
    version: z.string(),
    startedAt: IsoDate,
    /** Percent, across all cores, since the last reading. */
    cpu: z.number(),
    memory: z.object({ used: z.number(), total: z.number() }),
    disks: z.array(Disk),
  })
  .openapi('SystemStatus')

export const JobInfo = z
  .object({
    id: z.string(),
    name: z.string(),
    state: z.enum(['running', 'queued', 'idle', 'failed']),
    nextRun: IsoDate.nullable(),
  })
  .openapi('JobInfo')

export const HealthCheck = z
  .object({
    id: z.string(),
    source: z.string(),
    level: z.enum(['ok', 'notice', 'warning', 'error']),
    message: z.string(),
    since: IsoDate,
  })
  .openapi('HealthCheck')

export type PublicInfo = z.infer<typeof PublicInfo>
export type Attribution = z.infer<typeof Attribution>

export const system = {
  health: createRoute({
    method: 'get',
    path: '/api/health',
    tags: ['System'],
    summary: 'Health, for Docker and load balancers',
    ...access('public'),
    responses: {
      200: json(Health, 'The server is up'),
      ...errors('unavailable'),
    },
  }),
  publicInfo: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/info/public`,
    tags: ['System'],
    summary: 'Who this server is, without signing in',
    ...access('public'),
    responses: { 200: json(PublicInfo, 'The server’s public info') },
  }),
  events: createRoute({
    method: 'get',
    path: `${API_PREFIX}/events`,
    tags: ['System'],
    summary: 'Server events (SSE)',
    ...access('user'),
    description:
      'A `text/event-stream` of ServerEvent objects. Send `Last-Event-ID` to catch up after a reconnect.',
    request: {
      headers: z.object({ 'last-event-id': z.string().optional() }),
      query: z.object({
        topics: z
          .string()
          .optional()
          .openapi({ description: 'Comma-separated topics; all when absent' }),
      }),
    },
    responses: {
      200: {
        description: 'The event stream',
        content: { 'text/event-stream': { schema: z.string() } },
      },
    },
  }),
  server: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/server`,
    tags: ['System'],
    summary: 'The server card: name, version, branding, clients connected',
    ...access('user'),
    responses: { 200: json(Server, 'The server'), ...errors('unauthorized') },
  }),
  status: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/status`,
    tags: ['System'],
    summary: 'CPU, memory and disks, for the status bar',
    ...access('staff'),
    responses: { 200: json(SystemStatus, 'Status'), ...errors('unauthorized', 'forbidden') },
  }),
  jobs: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/jobs`,
    tags: ['System'],
    summary: 'Running and upcoming jobs',
    ...access('staff'),
    responses: { 200: json(z.array(JobInfo), 'Jobs'), ...errors('unauthorized') },
  }),
  healthChecks: createRoute({
    method: 'get',
    path: `${API_PREFIX}/system/health`,
    tags: ['System'],
    summary: 'What needs attention, for the server card’s dot and System › Health',
    ...access('staff'),
    responses: {
      200: json(z.array(HealthCheck), 'Checks'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
} as const

export type Server = z.infer<typeof Server>
export type SystemStatus = z.infer<typeof SystemStatus>
export type JobInfo = z.infer<typeof JobInfo>
export type HealthCheck = z.infer<typeof HealthCheck>
