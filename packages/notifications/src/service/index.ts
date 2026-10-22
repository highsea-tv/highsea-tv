// SPDX-License-Identifier: AGPL-3.0-only
// The notifications service (settings.md › Connections; checkpoint 8b, ADR 0046):
// - connections, each a channel with its settings and the events it hears. Secrets are sealed with
//   the server's key and shown masked; a masked value sent back keeps the secret it stands for;
// - Test, on a saved connection or on the dialog's draft;
// - `notify`: one message per connection that hears the event, logged once per connection and
//   event id, and sent by a `notifications.send` job keyed the same way. A repeated event is one
//   message (ADR 0022). Sending is at least once: a crash between the service's answer and the log's
//   "sent" can send a message twice;
// - retries: a 429 or 5xx (or no answer) is tried again after the service's Retry-After or the
//   backoff, whichever is longer; a message still unsent a day after its event is dropped, and the
//   connection shows in System › Health until one gets through. Any other answer fails at once;
// - `notifications.prune`, daily: the log is kept 30 days;
// - web push: the server's VAPID keys, made on first use and kept in a settings row with the
//   private key sealed, and each person's browsers;
// - the server's mail: invites and password resets through the email connection marked for it.
import {
  AppError,
  type Clock,
  type EventBus,
  type Fetch,
  type Logger,
  newId,
  type Sealer,
} from '@highsea-tv/core'
import { type Db, readSetting, schema, writeSetting } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'
import {
  CHANNELS,
  type Channel,
  DEFAULT_BRAND,
  emailSettings,
  generateVapidKeys,
  linkMail,
  type MailBrand,
  type PushContext,
  type SendContext,
  sendMail,
} from '../channels/index.ts'
import type { LinkEmail } from '../mail/index.ts'
import {
  type ConnectionKind,
  DeliveryError,
  type EventPayload,
  isDeliveryError,
  type MessageEvent,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  notificationT,
  render,
} from '../shared/index.ts'
import { serviceMessages } from './messages.ts'

const { connections, notificationLog, webPushSubscriptions } = schema

export const CONNECTIONS_TOPIC = 'connections.updated'
export const SEND_JOB = 'notifications.send'
export const PRUNE_JOB = 'notifications.prune'
export const VAPID_SETTING = 'notifications.vapid'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** A message unsent this long after its event is dropped. */
export const DROP_AFTER_MS = DAY
/** The log is kept this long. */
export const KEEP_LOG_MS = 30 * DAY
/** The backoff between tries when the service didn't say: 30 s, doubling, at most an hour. */
export const retryBackoffMs = (attempt: number) => Math.min(30_000 * 2 ** (attempt - 1), HOUR)

const MASK = '••••'
const masked = (secret: string) => `${MASK}${secret.slice(-4)}`
const isMasked = (v: unknown) => typeof v === 'string' && v.startsWith(MASK)

export type ConnectionInput = {
  kind: ConnectionKind
  name: string
  enabled: boolean
  events: NotificationEvent[]
  /** The kind's settings; a secret sent back masked keeps its stored value. */
  settings: Record<string, unknown>
  /** Email only: this connection sends the server's mail. */
  serverMail?: boolean
  /** Tag ids (checkpoint 8c), checked by the caller. */
  tags?: string[]
}

/** A connection as the API shows it: secrets masked, with how its last message went. */
export type ConnectionView = {
  id: string
  kind: ConnectionKind
  name: string
  enabled: boolean
  events: NotificationEvent[]
  settings: Record<string, unknown>
  serverMail: boolean
  tags: string[]
  createdAt: number
  updatedAt: number
  lastSentAt: number | null
  lastError: string | null
}

/** What Test is given: a saved connection, or the dialog's settings (with `id` when editing). */
export type ConnectionDraft = {
  id?: string
  kind: ConnectionKind
  settings: Record<string, unknown>
}

export type TestResult = { ok: true } | { ok: false; message: string }

export type LogEntry = {
  id: string
  connectionId: string
  eventId: string
  event: NotificationEvent
  status: 'pending' | 'sent' | 'failed' | 'dropped'
  attempts: number
  lastError: string | null
  createdAt: number
  sentAt: number | null
}

export type NotificationIssue = {
  id: string
  level: 'warning'
  message: string
  since: number
}

/** A browser's PushSubscription.toJSON(), and what to call it in the list. */
export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  label: string
}

export type PushSubscriptionView = {
  id: string
  label: string
  /** The push service's host (fcm.googleapis.com, updates.push.services.mozilla.com, …). */
  service: string
  createdAt: number
}

const sendPayload = z.object({
  logId: z.string(),
  event: z.enum(NOTIFICATION_EVENTS),
  payload: z.record(z.string(), z.unknown()),
})

const b64urlBytes = (s: string) => {
  if (!/^[A-Za-z0-9_-]+=*$/.test(s)) return -1
  return Buffer.from(s, 'base64url').length
}

const pushInput = z.object({
  endpoint: z.url({ protocol: /^https$/, error: 'A push service’s https address.' }),
  keys: z.object({
    // an uncompressed P-256 point and a 16-byte secret (RFC 8291 § 2 and § 3.2)
    p256dh: z.string().refine((k) => b64urlBytes(k) === 65, { error: 'Not a P-256 public key.' }),
    auth: z.string().refine((k) => b64urlBytes(k) === 16, { error: 'Not a 16-byte auth secret.' }),
  }),
  label: z.string().trim().min(1).max(120),
})

function invalid(error: z.ZodError): AppError {
  const [issue] = error.issues
  return new AppError('invalid', issue?.message ?? 'That isn’t valid.', {
    field: issue?.path.join('.') ?? '',
    reason: issue?.code ?? 'invalid',
  })
}

export function createNotifications(deps: {
  db: Db
  clock: Clock
  events?: EventBus
  jobs: JobQueue
  logger: Logger
  sealer: Sealer
  fetch: Fetch
  /** The server's language, for every message. Default English. */
  locale?: () => string
  /**
   * VAPID's contact (RFC 8292 § 2.1): a `mailto:` or `https:` URL for the push services to reach
   * the server's operator. Default the server mail's sender, or `mailto:highsea@localhost`.
   */
  vapidSubject?: () => string | null
  /** Who the emails are from: the server's name, external URL, language, logo and posters. */
  mail?: () => MailBrand
  /**
   * A library movie's tag ids (checkpoint 8c), for connections with tags. The runtime hands it
   * over, so notifications never import media (ADR 0036).
   */
  movieTags?: (tmdbId: number) => readonly string[]
}) {
  const { db, clock, events, jobs, sealer } = deps
  const log = deps.logger.child('notifications')
  const locale = () => deps.locale?.() ?? 'en'
  const announce = (ids?: string[]) => events?.emit({ topic: CONNECTIONS_TOPIC, ids })
  const t = () => serviceMessages(locale())

  const channel = (kind: ConnectionKind): Channel<Record<string, unknown>> => CHANNELS[kind]

  /**
   * Whether a connection with tags hears an event (checkpoint 8c), as Radarr's do: "Only send
   * notifications for movies with at least one matching tag" (its NotificationsTagsMovieHelpText).
   * An event about no movie (health, updates, the test) reaches it as before; one about several
   * (a list's additions) reaches it when any of them matches.
   */
  function hearsMovies(tags: readonly string[], payload: unknown): boolean {
    if (!tags.length || !deps.movieTags) return true
    const p = payload as { movie?: { tmdbId: number }; movies?: { tmdbId: number }[] }
    const movies = p.movie ? [p.movie] : (p.movies ?? [])
    if (!movies.length) return true
    return movies.some((m) => deps.movieTags?.(m.tmdbId).some((t) => tags.includes(t)))
  }

  type Row = typeof connections.$inferSelect

  function row(id: string): Row {
    const r = db.select().from(connections).where(eq(connections.id, id)).get()
    if (!r) throw new AppError('not-found', 'There’s no such connection.')
    return r
  }

  /** The stored settings with their secrets opened. */
  function open(r: Pick<Row, 'kind' | 'settings'>): Record<string, unknown> {
    const out = { ...(r.settings as Record<string, unknown>) }
    for (const key of channel(r.kind).secrets)
      if (typeof out[key] === 'string') out[key] = sealer.open(out[key] as string)
    return out
  }

  /** Validates `settings` for `kind`, a masked secret taking the value it stands for in `previous`. */
  function resolve(
    kind: ConnectionKind,
    settings: Record<string, unknown>,
    previous: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const c = channel(kind)
    const merged = { ...settings }
    for (const key of c.secrets)
      if (isMasked(merged[key]) || merged[key] === undefined) merged[key] = previous?.[key]
    const parsed = c.settings.safeParse(merged)
    if (!parsed.success) throw invalid(parsed.error)
    return parsed.data
  }

  function seal(kind: ConnectionKind, settings: Record<string, unknown>) {
    const out = { ...settings }
    for (const key of channel(kind).secrets)
      if (typeof out[key] === 'string') out[key] = sealer.seal(out[key] as string)
    return out
  }

  function view(r: Row): ConnectionView {
    const settings = open(r)
    for (const key of channel(r.kind).secrets)
      if (typeof settings[key] === 'string') settings[key] = masked(settings[key] as string)
    const last = db
      .select()
      .from(notificationLog)
      .where(eq(notificationLog.connectionId, r.id))
      .orderBy(desc(notificationLog.createdAt))
      .limit(1)
      .get()
    const lastSent = db
      .select({ at: notificationLog.sentAt })
      .from(notificationLog)
      .where(and(eq(notificationLog.connectionId, r.id), eq(notificationLog.status, 'sent')))
      .orderBy(desc(notificationLog.sentAt))
      .limit(1)
      .get()
    return {
      id: r.id,
      kind: r.kind,
      name: r.name,
      enabled: r.enabled,
      events: r.events,
      settings,
      serverMail: r.serverMail,
      tags: r.tags,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastSentAt: lastSent?.at ?? null,
      lastError: last && last.status !== 'sent' ? last.lastError : null,
    }
  }

  function checkInput(input: ConnectionInput) {
    const name = input.name.trim()
    if (!name) throw new AppError('invalid', 'A connection needs a name.', { field: 'name' })
    if (!(input.kind in CHANNELS))
      throw new AppError('invalid', 'There’s no such kind of connection.', { field: 'kind' })
    const events = [...new Set(input.events)]
    if (events.some((e) => !NOTIFICATION_EVENTS.includes(e)))
      throw new AppError('invalid', 'There’s no such event.', { field: 'events' })
    if (input.serverMail && input.kind !== 'email')
      throw new AppError('invalid', 'Only an email connection can send the server’s mail.', {
        field: 'serverMail',
      })
    return { name, events, serverMail: !!input.serverMail, tags: [...new Set(input.tags ?? [])] }
  }

  /** Only one connection sends the server's mail. */
  function claimServerMail(id: string) {
    db.update(connections).set({ serverMail: false }).where(eq(connections.serverMail, true)).run()
    db.update(connections).set({ serverMail: true }).where(eq(connections.id, id)).run()
  }

  function pushContext(): PushContext {
    const keys = vapid()
    return {
      vapid: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
      subscriptions: (userIds) =>
        userIds.length
          ? db
              .select()
              .from(webPushSubscriptions)
              .where(inArray(webPushSubscriptions.userId, userIds))
              .all()
          : [],
      gone(id) {
        db.delete(webPushSubscriptions).where(eq(webPushSubscriptions.id, id)).run()
        log.info('A browser’s push subscription has gone, so it was removed', { id })
      },
    }
  }

  function subject(): string {
    const given = deps.vapidSubject?.()
    if (given) return given
    const mail = db.select().from(connections).where(eq(connections.serverMail, true)).get()
    const from = mail ? emailSettings.safeParse(open(mail)) : null
    const address = from?.success ? (/<([^>]+)>/.exec(from.data.from)?.[1] ?? from.data.from) : null
    return address?.includes('@') ? `mailto:${address}` : 'mailto:highsea@localhost'
  }

  type Vapid = { publicKey: string; privateKey: string }

  /** The server's VAPID keys, made the first time they're needed. */
  function vapid(): Vapid {
    const stored = readSetting<Vapid>(db, VAPID_SETTING, { publicKey: '', privateKey: '' })
    if (stored.publicKey && stored.privateKey)
      return { publicKey: stored.publicKey, privateKey: sealer.open(stored.privateKey) }
    const keys = generateVapidKeys()
    writeSetting(
      db,
      VAPID_SETTING,
      { publicKey: keys.publicKey, privateKey: sealer.seal(keys.privateKey) },
      clock.now(),
    )
    log.info('Made the server’s web push keys')
    return keys
  }

  const brand = (): MailBrand => deps.mail?.() ?? { ...DEFAULT_BRAND, locale: locale() }

  /** `connection` is the connection's name, for an email's footer. */
  function context(
    messageId: string,
    connection: string | null,
    signal?: AbortSignal,
  ): SendContext {
    return {
      fetch: deps.fetch,
      now: () => clock.now(),
      t: notificationT(locale()),
      messageId,
      signal,
      push: pushContext(),
      mail: { brand: brand(), connection },
    }
  }

  const setLog = (id: string, values: Partial<typeof notificationLog.$inferInsert>) =>
    db.update(notificationLog).set(values).where(eq(notificationLog.id, id)).run()

  jobs.define({
    type: SEND_JOB,
    payload: sendPayload,
    concurrency: 4,
    // the run catches every failure and reschedules itself; the queue's own tries only matter
    // when the process stops mid-send, and then the message is sent again (at least once)
    attempts: 3,
    async run({ logId, event, payload }, { signal }) {
      const entry = db.select().from(notificationLog).where(eq(notificationLog.id, logId)).get()
      if (entry?.status !== 'pending') return
      const conn = db.select().from(connections).where(eq(connections.id, entry.connectionId)).get()
      if (!conn) return
      const now = clock.now()
      if (now - entry.createdAt >= DROP_AFTER_MS) {
        setLog(logId, { status: 'dropped' })
        log.warn('A notification was dropped after a day of trying', {
          connection: conn.name,
          event,
          error: entry.lastError,
        })
        announce([conn.id])
        return
      }
      if (!conn.enabled) {
        setLog(logId, { status: 'failed', lastError: t()('connectionOff') })
        return
      }
      const attempts = entry.attempts + 1
      try {
        const c = channel(conn.kind)
        const settings = c.settings.parse(open(conn))
        const message = render(event, payload as EventPayload, {
          t: notificationT(locale()),
          now,
          locale: locale(),
        })
        await c.send(message, settings, context(logId, conn.name, signal))
        setLog(logId, { status: 'sent', attempts, lastError: null, sentAt: clock.now() })
        announce([conn.id])
      } catch (e) {
        const error = isDeliveryError(e)
          ? e
          : new DeliveryError(e instanceof Error ? e.message : String(e), { retryable: true })
        if (!error.retryable) {
          setLog(logId, { status: 'failed', attempts, lastError: error.message })
          log.warn('A notification couldn’t be sent', {
            connection: conn.name,
            event,
            error: error.message,
          })
          announce([conn.id])
          return
        }
        const wait = Math.max(error.retryAfterMs ?? 0, retryBackoffMs(attempts))
        const runAt = Math.min(clock.now() + wait, entry.createdAt + DROP_AFTER_MS)
        setLog(logId, { attempts, lastError: error.message })
        jobs.enqueue(
          SEND_JOB,
          { logId, event, payload },
          { runAt, dedupeKey: `${entry.connectionId}:${entry.eventId}` },
        )
        log.info('A notification will be tried again', {
          connection: conn.name,
          event,
          in: Math.round((runAt - clock.now()) / 1000),
          error: error.message,
        })
      }
    },
  })

  /** Deletes the log's rows older than 30 days, and drops a message whose job was lost. */
  function prune(): number {
    const now = clock.now()
    db.update(notificationLog)
      .set({ status: 'dropped' })
      .where(
        and(
          eq(notificationLog.status, 'pending'),
          lt(notificationLog.createdAt, now - DROP_AFTER_MS - HOUR),
        ),
      )
      .run()
    const gone = db
      .delete(notificationLog)
      .where(lt(notificationLog.createdAt, now - KEEP_LOG_MS))
      .returning({ id: notificationLog.id })
      .all()
    return gone.length
  }

  jobs.define({
    type: PRUNE_JOB,
    payload: z.object({}),
    async run() {
      const n = prune()
      if (n) log.info('Pruned the notification log', { removed: n })
    },
  })

  return {
    list(): ConnectionView[] {
      return db.select().from(connections).orderBy(connections.createdAt).all().map(view)
    },

    get: (id: string): ConnectionView => view(row(id)),

    add(input: ConnectionInput): ConnectionView {
      const { name, events: heard, serverMail, tags } = checkInput(input)
      const settings = resolve(input.kind, input.settings, null)
      const now = clock.now()
      const id = newId('con')
      db.insert(connections)
        .values({
          id,
          kind: input.kind,
          name,
          enabled: input.enabled,
          events: heard,
          settings: seal(input.kind, settings),
          serverMail: false,
          tags,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      if (serverMail) claimServerMail(id)
      announce([id])
      return view(row(id))
    },

    update(id: string, input: ConnectionInput): ConnectionView {
      const current = row(id)
      if (input.kind !== current.kind)
        throw new AppError('invalid', 'A connection’s kind can’t change.', { field: 'kind' })
      const { name, events: heard, serverMail, tags } = checkInput(input)
      const settings = resolve(current.kind, input.settings, open(current))
      db.update(connections)
        .set({
          name,
          enabled: input.enabled,
          events: heard,
          settings: seal(current.kind, settings),
          serverMail: serverMail && current.serverMail,
          tags,
          updatedAt: clock.now(),
        })
        .where(eq(connections.id, id))
        .run()
      if (serverMail && !current.serverMail) claimServerMail(id)
      announce([id])
      return view(row(id))
    },

    remove(id: string): void {
      row(id)
      // the log goes with it (on delete cascade); its queued sends find nothing and stop
      db.delete(connections).where(eq(connections.id, id)).run()
      announce([id])
    },

    /** Sends the test message now, outside the queue, and says how it went. */
    async test(input: string | ConnectionDraft): Promise<TestResult> {
      let kind: ConnectionKind
      let settings: Record<string, unknown>
      let name: string | null
      if (typeof input === 'string') {
        const r = row(input)
        kind = r.kind
        name = r.name
        settings = channel(kind).settings.parse(open(r))
      } else {
        const previous = input.id ? row(input.id) : null
        name = previous?.name ?? null
        if (previous && previous.kind !== input.kind)
          throw new AppError('invalid', 'A connection’s kind can’t change.', { field: 'kind' })
        kind = input.kind
        if (!(kind in CHANNELS))
          throw new AppError('invalid', 'There’s no such kind of connection.', { field: 'kind' })
        settings = resolve(kind, input.settings, previous ? open(previous) : null)
      }
      try {
        await channel(kind).test(settings, context(newId('tst'), name))
        return { ok: true }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    },

    /**
     * Queues the event for every connection that's on and hears it, once per connection and
     * `eventId`: the same id again sends nothing. Returns how many messages were queued.
     */
    notify<E extends NotificationEvent>(event: E, payload: EventPayload<E>, eventId: string) {
      const heard = db
        .select()
        .from(connections)
        .where(eq(connections.enabled, true))
        .all()
        .filter((c) => c.events.includes(event) && hearsMovies(c.tags, payload))
      const now = clock.now()
      let queued = 0
      for (const c of heard) {
        const logId = newId('ntf')
        const inserted = db
          .insert(notificationLog)
          .values({
            id: logId,
            connectionId: c.id,
            eventId,
            event,
            status: 'pending',
            attempts: 0,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: notificationLog.id })
          .all()
        if (!inserted.length) continue
        jobs.enqueue(SEND_JOB, { logId, event, payload }, { dedupeKey: `${c.id}:${eventId}` })
        queued++
      }
      return queued
    },

    /** The log, newest first. */
    log({ connectionId, limit = 100 }: { connectionId?: string; limit?: number } = {}): LogEntry[] {
      return db
        .select()
        .from(notificationLog)
        .where(connectionId ? eq(notificationLog.connectionId, connectionId) : undefined)
        .orderBy(desc(notificationLog.createdAt))
        .limit(limit)
        .all()
    },

    /** Each connection that's on and whose last message failed or was dropped, until one arrives. */
    issues(): NotificationIssue[] {
      const out: NotificationIssue[] = []
      for (const c of db.select().from(connections).where(eq(connections.enabled, true)).all()) {
        const last = db
          .select()
          .from(notificationLog)
          .where(
            and(
              eq(notificationLog.connectionId, c.id),
              inArray(notificationLog.status, ['sent', 'failed', 'dropped']),
            ),
          )
          .orderBy(desc(notificationLog.createdAt))
          .limit(1)
          .get()
        if (!last || last.status === 'sent') continue
        const error = last.lastError ?? t()('unknownError')
        out.push({
          id: `notifications:${c.id}`,
          level: 'warning',
          message:
            last.status === 'dropped'
              ? t()('issue.dropped', { name: c.name, error })
              : t()('issue.failed', { name: c.name, error }),
          since: last.createdAt,
        })
      }
      return out
    },

    /** The key browsers subscribe with (`applicationServerKey`), base64url. */
    vapidPublicKey: (): string => vapid().publicKey,

    push: {
      /** Keeps a browser's subscription; the same endpoint again replaces it. */
      subscribe(userId: string, input: PushSubscriptionInput): PushSubscriptionView {
        const parsed = pushInput.safeParse(input)
        if (!parsed.success) throw invalid(parsed.error)
        const { endpoint, keys, label } = parsed.data
        const now = clock.now()
        const id = newId('wps')
        db.insert(webPushSubscriptions)
          .values({
            id,
            userId,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            label,
            createdAt: now,
          })
          .onConflictDoUpdate({
            target: webPushSubscriptions.endpoint,
            set: { userId, p256dh: keys.p256dh, auth: keys.auth, label },
          })
          .run()
        const saved = db
          .select()
          .from(webPushSubscriptions)
          .where(eq(webPushSubscriptions.endpoint, endpoint))
          .get()
        if (!saved) throw new AppError('internal', 'The subscription wasn’t kept.')
        return pushView(saved)
      },

      unsubscribe(userId: string, id: string): void {
        const gone = db
          .delete(webPushSubscriptions)
          .where(and(eq(webPushSubscriptions.id, id), eq(webPushSubscriptions.userId, userId)))
          .returning({ id: webPushSubscriptions.id })
          .all()
        if (!gone.length) throw new AppError('not-found', 'There’s no such browser.')
      },

      list(userId: string): PushSubscriptionView[] {
        return db
          .select()
          .from(webPushSubscriptions)
          .where(eq(webPushSubscriptions.userId, userId))
          .orderBy(webPushSubscriptions.createdAt)
          .all()
          .map(pushView)
      },
    },

    /** Whether an email connection that's on sends the server's mail. */
    hasServerMail(): boolean {
      return !!serverMailRow()
    },

    /**
     * Sends an invite or a password reset to `to` through the server's mail. False when there's
     * none; throws `unavailable` when the mail server refused it.
     */
    async sendServerMail(to: string, link: LinkEmail): Promise<boolean> {
      const r = serverMailRow()
      if (!r) return false
      try {
        await sendMail(emailSettings.parse(open(r)), await linkMail(to, brand(), link))
        return true
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        log.warn('The server’s mail couldn’t be sent', { error: message })
        throw new AppError('unavailable', t()('mailFailed', { error: message }))
      }
    },

    prune,

    /** The daily prune, first an hour after boot. */
    schedule(now: number) {
      jobs.schedule(PRUNE_JOB, DAY, { firstRunAt: now + HOUR })
    },
  }

  function serverMailRow() {
    return db
      .select()
      .from(connections)
      .where(
        and(
          eq(connections.serverMail, true),
          eq(connections.enabled, true),
          eq(connections.kind, 'email'),
        ),
      )
      .get()
  }
}

function pushView(r: typeof webPushSubscriptions.$inferSelect): PushSubscriptionView {
  return { id: r.id, label: r.label, service: new URL(r.endpoint).host, createdAt: r.createdAt }
}

export type Notifications = ReturnType<typeof createNotifications>
export type { MessageEvent }
