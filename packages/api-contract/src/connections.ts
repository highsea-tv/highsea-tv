// SPDX-License-Identifier: AGPL-3.0-only
// Connections (settings.md › Connections; checkpoint 8b, ADR 0046): the services highsea sends
// notifications to, each choosing the events it hears. A connection's settings are its kind's own
// (a webhook address, a bot token and chat, an SMTP server); its secrets come back masked
// (`••••` and the last four characters), and a masked value sent back keeps the secret it stands
// for. Test sends the test message now, to a saved connection or to the dialog's settings. Web
// push: each person's browsers, and the server's VAPID key they subscribe with (RFC 8292).
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IdParam, IsoDate, json, noContent } from './common.ts'
import { TagIds } from './tags.ts'

// ---------------------------------------------------------------- shapes

/** The kinds at launch (the owner's answer 6), as `@highsea-tv/db`'s schema names them. */
export const CONNECTION_KINDS = [
  'discord',
  'slack',
  'telegram',
  'ntfy',
  'gotify',
  'pushover',
  'matrix',
  'email',
  'webhook',
  'apprise',
  'browser',
] as const

/** What a connection can hear (the plan's events table). */
export const NOTIFICATION_EVENTS = [
  'grabbed',
  'imported',
  'upgraded',
  'download-failed',
  'subtitle-added',
  'health',
  'update',
  'movie-added',
  'playback-started',
] as const

export const ConnectionKind = z.enum(CONNECTION_KINDS).openapi('ConnectionKind')
export const NotificationEvent = z.enum(NOTIFICATION_EVENTS).openapi('NotificationEvent')

/** The kind's settings; each kind's fields are checked by the server (ADR 0046's channels). */
const ConnectionSettings = z.record(z.string(), z.unknown()).openapi({
  example: { webhookUrl: '••••abcd', username: 'highsea' },
})

export const Connection = z
  .object({
    id: z.string(),
    kind: ConnectionKind,
    name: z.string(),
    enabled: z.boolean(),
    events: z.array(NotificationEvent),
    /** Secrets masked. */
    settings: ConnectionSettings,
    /** Email only: it sends the server's mail (invites and password resets). */
    serverMail: z.boolean(),
    /**
     * Tag ids (checkpoint 8c): when set, a movie's events reach it only for movies with at least one
     * of them; events about no movie reach it as before.
     */
    tags: z.array(z.string()),
    createdAt: IsoDate,
    updatedAt: IsoDate,
    lastSentAt: IsoDate.nullable(),
    /** Why the last message didn't arrive; null once one does. */
    lastError: z.string().nullable(),
  })
  .openapi('Connection')

export const ConnectionInput = z
  .object({
    kind: ConnectionKind,
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    events: z.array(NotificationEvent),
    settings: ConnectionSettings,
    serverMail: z.boolean().optional(),
    tags: TagIds.optional(),
  })
  .openapi('ConnectionInput')

/** Test's body: the dialog's settings, with the connection's id when editing one. */
export const ConnectionDraft = z
  .object({ id: z.string().optional(), kind: ConnectionKind, settings: ConnectionSettings })
  .openapi('ConnectionDraft')

export const ConnectionTest = z
  .object({
    ok: z.boolean(),
    /** What the service said when it didn't take the message. */
    message: z.string().nullable(),
  })
  .openapi('ConnectionTest')

export const NotificationLogEntry = z
  .object({
    id: z.string(),
    event: NotificationEvent,
    status: z.enum(['pending', 'sent', 'failed', 'dropped']),
    attempts: z.number().int(),
    lastError: z.string().nullable(),
    createdAt: IsoDate,
    sentAt: IsoDate.nullable(),
  })
  .openapi('NotificationLogEntry')

/** The server's VAPID public key: a browser's `applicationServerKey`, base64url. */
export const PushKey = z.object({ publicKey: z.string() }).openapi('PushKey')

/** A browser's `PushSubscription.toJSON()`, and what to call it. */
export const PushSubscriptionInput = z
  .object({
    endpoint: z.string().max(2000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
    label: z.string().min(1).max(120),
  })
  .openapi('PushSubscriptionInput')

export const PushSubscription = z
  .object({
    id: z.string(),
    label: z.string(),
    /** The push service's host. */
    service: z.string(),
    createdAt: IsoDate,
  })
  .openapi('PushSubscription')

/** `connections.updated`: a connection was added, changed or removed, or a message to it settled. */
export const CONNECTIONS_TOPICS = { connections: 'connections.updated' } as const

// ---------------------------------------------------------------- routes

const CONNECTIONS = `${API_PREFIX}/connections`
const PUSH = `${API_PREFIX}/me/push-subscriptions`

// Static paths come before `/connections/{id}`.
export const connections = {
  list: createRoute({
    method: 'get',
    path: CONNECTIONS,
    tags: ['Connections'],
    summary: 'The connections, secrets masked',
    ...access('staff'),
    responses: {
      200: json(z.array(Connection), 'Connections'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  add: createRoute({
    method: 'post',
    path: CONNECTIONS,
    tags: ['Connections'],
    summary: 'Add a connection',
    ...access('staff'),
    request: { ...body(ConnectionInput) },
    responses: {
      201: json(Connection, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  test: createRoute({
    method: 'post',
    path: `${CONNECTIONS}/test`,
    tags: ['Connections'],
    summary: 'Send the test message with these settings, without saving them',
    ...access('staff'),
    request: { ...body(ConnectionDraft) },
    responses: {
      200: json(ConnectionTest, 'How it went'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  pushKey: createRoute({
    method: 'get',
    path: `${CONNECTIONS}/push-key`,
    tags: ['Connections'],
    summary: 'The key browsers subscribe to web push with',
    ...access('user'),
    responses: { 200: json(PushKey, 'The key'), ...errors('unauthorized') },
  }),
  update: createRoute({
    method: 'put',
    path: `${CONNECTIONS}/{id}`,
    tags: ['Connections'],
    summary: 'Change a connection; a masked secret keeps its value',
    ...access('staff'),
    request: { params: IdParam, ...body(ConnectionInput) },
    responses: {
      200: json(Connection, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${CONNECTIONS}/{id}`,
    tags: ['Connections'],
    summary: 'Remove a connection and its log',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  testSaved: createRoute({
    method: 'post',
    path: `${CONNECTIONS}/{id}/test`,
    tags: ['Connections'],
    summary: 'Send the test message to a saved connection',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(ConnectionTest, 'How it went'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  log: createRoute({
    method: 'get',
    path: `${CONNECTIONS}/{id}/log`,
    tags: ['Connections'],
    summary: 'What was sent to a connection in the last 30 days, newest first',
    ...access('staff'),
    request: { params: IdParam },
    responses: {
      200: json(z.array(NotificationLogEntry), 'The log'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
}

export const pushSubscriptions = {
  list: createRoute({
    method: 'get',
    path: PUSH,
    tags: ['Connections'],
    summary: 'Your browsers that get notifications',
    ...access('user'),
    responses: { 200: json(z.array(PushSubscription), 'Browsers'), ...errors('unauthorized') },
  }),
  add: createRoute({
    method: 'post',
    path: PUSH,
    tags: ['Connections'],
    summary: 'Get notifications in this browser; the same endpoint again replaces it',
    ...access('user'),
    request: { ...body(PushSubscriptionInput) },
    responses: {
      201: json(PushSubscription, 'Subscribed'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${PUSH}/{id}`,
    tags: ['Connections'],
    summary: 'Stop notifications in one of your browsers',
    ...access('user'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
}

export type ConnectionKind = (typeof CONNECTION_KINDS)[number]
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]
export type Connection = z.infer<typeof Connection>
export type ConnectionInput = z.infer<typeof ConnectionInput>
export type ConnectionDraft = z.infer<typeof ConnectionDraft>
export type ConnectionTest = z.infer<typeof ConnectionTest>
export type NotificationLogEntry = z.infer<typeof NotificationLogEntry>
export type PushKey = z.infer<typeof PushKey>
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>
export type PushSubscription = z.infer<typeof PushSubscription>
