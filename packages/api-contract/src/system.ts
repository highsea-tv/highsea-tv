// SPDX-License-Identifier: AGPL-3.0-only
// System routes: health for Docker, the public info clients read before signing in (connectivity
// .md), and the event stream.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, errors, json } from './common.ts'

export const Health = z
  .object({
    status: z.enum(['ok', 'degraded']),
    checks: z.array(
      z.object({ name: z.string(), ok: z.boolean(), message: z.string().optional() }),
    ),
  })
  .openapi('Health')

export const PublicInfo = z
  .object({
    id: z.string().openapi({ example: 'srv_5k2m9x0q4r7t1v3w' }),
    name: z.string().openapi({ example: 'Harbor' }),
    version: z.string().openapi({ example: '0.1.0' }),
    localAddresses: z.array(z.string()).openapi({ example: ['http://192.168.1.20:3000'] }),
    publicUrl: z.string().nullable().openapi({ example: 'https://harbor.example.net' }),
  })
  .openapi('PublicInfo')

export type PublicInfo = z.infer<typeof PublicInfo>

export const system = {
  health: createRoute({
    method: 'get',
    path: '/api/health',
    tags: ['System'],
    summary: 'Health, for Docker and load balancers',
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
    responses: { 200: json(PublicInfo, 'The server’s public info') },
  }),
  events: createRoute({
    method: 'get',
    path: `${API_PREFIX}/events`,
    tags: ['System'],
    summary: 'Server events (SSE)',
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
} as const
