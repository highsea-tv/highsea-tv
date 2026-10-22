// SPDX-License-Identifier: AGPL-3.0-only
// Notifications (checkpoint 8b, ADR 0046): connections to the services people already look at
// (Discord, ntfy, email and the rest), each choosing the events it hears; a log of what was sent,
// kept 30 days; and the browsers that asked for web push. A connection's secrets (tokens,
// passwords, webhook addresses) are sealed inside `settings` with the server's key.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './auth.ts'

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
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]

export const NOTIFICATION_EVENTS = [
  'grabbed',
  'imported',
  'upgraded',
  'download-failed',
  'subtitle-added',
  'health',
  'update',
  'movie-added',
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: CONNECTION_KINDS }).notNull(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  /** The events it hears, from NOTIFICATION_EVENTS. */
  events: text('events', { mode: 'json' }).$type<NotificationEvent[]>().notNull(),
  /** The kind's settings, its secrets sealed. */
  settings: text('settings', { mode: 'json' }).notNull(),
  /** Email only: this connection sends the server's mail (invites and password resets). */
  serverMail: integer('server_mail', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'dropped'] as const

/** Each message to each connection: one row, keyed as its send job is. Kept 30 days. */
export const notificationLog = sqliteTable(
  'notification_log',
  {
    id: text('id').primaryKey(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    /** The event's own id, so a repeated event is one message. */
    eventId: text('event_id').notNull(),
    event: text('event', { enum: NOTIFICATION_EVENTS }).notNull(),
    status: text('status', { enum: NOTIFICATION_STATUSES }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    sentAt: integer('sent_at'),
  },
  (t) => [
    uniqueIndex('notification_log_message').on(t.connectionId, t.eventId),
    index('notification_log_created').on(t.createdAt),
  ],
)

/** A browser that asked for web push (RFC 8030): its endpoint and keys, per person. */
export const webPushSubscriptions = sqliteTable(
  'web_push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    /** The browser's P-256 key and auth secret, base64url, as PushSubscription.toJSON() gives them. */
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /** What the person sees in the list: the browser and system, from its user agent. */
    label: text('label').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('web_push_endpoint').on(t.endpoint), index('web_push_user').on(t.userId)],
)
