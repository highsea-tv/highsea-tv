// SPDX-License-Identifier: AGPL-3.0-only
// API keys for scripts and other apps (users-devices.md). Keys are administrative (ADR 0032): only
// the owner and admins make them, and a key acts for the person who made it, never beyond an
// admin. It's either read-only (GET requests) or full. The secret shows once; only its SHA-256
// verifier is kept and keys are told apart by their first characters. Users' apps sign in with
// device tokens instead. A `calendar` key (checkpoint 8a) opens the calendar feed and nothing else,
// since a calendar app keeps it in the feed's address; its secret is also kept sealed, so Wanted
// can show that address again.
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, desc, eq } from 'drizzle-orm'
import type { Ctx, RequestMeta } from './context.ts'
import { notFound } from './context.ts'
import { isStaff } from './roles.ts'
import { newSecret, verifier } from './secrets.ts'
import { type Principal, SECRET_PREFIX } from './sessions.ts'

/** `calendar` opens only the calendar feed (checkpoint 8a): its key sits in a URL. */
export type ApiKeyScope = 'read' | 'full' | 'calendar'

export type ApiKeyView = {
  id: string
  name: string
  prefix: string
  scope: ApiKeyScope
  userId: string
  createdAt: number
  lastUsedAt: number | null
}

const TOUCH_EVERY = 60_000

const view = (row: typeof schema.apiKeys.$inferSelect): ApiKeyView => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  scope: row.scope,
  userId: row.userId,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
})

/** The owner sees everyone's keys, so they can revoke any that acts on the server; an admin their own. */
export function listApiKeys(ctx: Ctx, actor: { id: string }): ApiKeyView[] {
  const owner = ctx.userView(actor.id).role === 'owner'
  return ctx.db
    .select()
    .from(schema.apiKeys)
    .where(owner ? undefined : eq(schema.apiKeys.userId, actor.id))
    .orderBy(desc(schema.apiKeys.createdAt))
    .all()
    .map(view)
}

export function createApiKey(
  ctx: Ctx,
  input: { name: string; scope: ApiKeyScope },
  actor: { id: string; name: string },
  meta: RequestMeta,
): ApiKeyView & { secret: string } {
  if (!isStaff(ctx.userView(actor.id).role))
    throw new AppError('forbidden', 'Only the owner and admins can make API keys.')
  const name = input.name.trim()
  if (!name) throw new AppError('invalid', 'Give it a name.', { field: 'name' })
  if (input.scope === 'calendar')
    throw new AppError('invalid', 'Make a calendar key from Wanted › Calendar.', { field: 'scope' })
  const secret = newSecret(SECRET_PREFIX.key)
  const id = newId('key')
  const row = {
    id,
    name,
    prefix: secret.slice(0, 7),
    secretHash: verifier(secret),
    scope: input.scope,
    userId: actor.id,
    createdAt: ctx.now(),
    lastUsedAt: null,
    secretSealed: null,
  }
  ctx.db.insert(schema.apiKeys).values(row).run()
  ctx.audit({
    action: 'api-key.create',
    actor,
    targetType: 'api-key',
    targetId: id,
    address: meta.address,
    detail: { name, scope: input.scope },
  })
  ctx.events.emit({ topic: 'users.updated' })
  return { ...view(row), secret }
}

export function revokeApiKey(
  ctx: Ctx,
  id: string,
  actor: { id: string; name: string },
  meta: RequestMeta,
) {
  const row = ctx.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, id)).get()
  // someone else's key looks like no key at all, unless you're the owner
  if (!row || (row.userId !== actor.id && ctx.userView(actor.id).role !== 'owner'))
    throw notFound('There’s no key with that id.')
  ctx.db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id)).run()
  ctx.audit({
    action: 'api-key.revoke',
    actor,
    targetType: 'api-key',
    targetId: id,
    address: meta.address,
    detail: { name: row.name },
  })
  ctx.events.emit({ topic: 'users.updated' })
}

/**
 * The person a key acts for, capped at admin: a key never carries the owner's powers. A key
 * whose person is no longer staff is refused (demoting them revokes it anyway).
 */
export function authenticateApiKey(ctx: Ctx, secret: string): Principal | null {
  if (!secret.startsWith(SECRET_PREFIX.key)) return null
  const row = ctx.db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.secretHash, verifier(secret)))
    .get()
  // a calendar key opens the feed alone (authenticateCalendarKey), never the API
  if (!row || row.scope === 'calendar') return null
  const user = ctx.userViews([row.userId])[0]
  if (!user || user.invited || !isStaff(user.role)) return null
  const now = ctx.now()
  if (!row.lastUsedAt || now - row.lastUsedAt > TOUCH_EVERY)
    ctx.db
      .update(schema.apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(schema.apiKeys.id, row.id))
      .run()
  const capped = user.role === 'owner' ? { ...user, role: 'admin' as const } : user
  return {
    user: capped,
    deviceId: null,
    via: 'key',
    scope: row.scope === 'read' ? 'read' : 'full',
    method: 'password',
    expiresAt: null,
    apiKeyId: row.id,
  }
}

// ------------------------------------------------------------------ the calendar feed's key

const calendarRow = (ctx: Ctx, userId: string) =>
  ctx.db
    .select()
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.userId, userId), eq(schema.apiKeys.scope, 'calendar')))
    .get()

/** A person's calendar key: its secret, opened, so Wanted can show the feed's address again. */
export function calendarKey(ctx: Ctx, actor: { id: string }) {
  const row = calendarRow(ctx, actor.id)
  if (!row?.secretSealed) return null
  return { secret: ctx.sealer.open(row.secretSealed), createdAt: row.createdAt }
}

/** Makes the person's calendar key, replacing the one they had (whose address stops working). */
export function makeCalendarKey(
  ctx: Ctx,
  actor: { id: string; name: string },
  meta: RequestMeta,
): { secret: string; createdAt: number } {
  if (!isStaff(ctx.userView(actor.id).role))
    throw new AppError('forbidden', 'Only the owner and admins can make API keys.')
  const secret = newSecret(SECRET_PREFIX.key)
  const id = newId('key')
  const createdAt = ctx.now()
  ctx.db.transaction((tx) => {
    tx.delete(schema.apiKeys)
      .where(and(eq(schema.apiKeys.userId, actor.id), eq(schema.apiKeys.scope, 'calendar')))
      .run()
    tx.insert(schema.apiKeys)
      .values({
        id,
        name: 'Calendar feed',
        prefix: secret.slice(0, 7),
        secretHash: verifier(secret),
        scope: 'calendar',
        userId: actor.id,
        createdAt,
        lastUsedAt: null,
        secretSealed: ctx.sealer.seal(secret),
      })
      .run()
  })
  ctx.audit({
    action: 'api-key.create',
    actor,
    targetType: 'api-key',
    targetId: id,
    address: meta.address,
    detail: { name: 'Calendar feed', scope: 'calendar' },
  })
  ctx.events.emit({ topic: 'users.updated' })
  return { secret, createdAt }
}

/** Turns the person's calendar feed off. */
export function revokeCalendarKey(
  ctx: Ctx,
  actor: { id: string; name: string },
  meta: RequestMeta,
) {
  const row = calendarRow(ctx, actor.id)
  if (row) revokeApiKey(ctx, row.id, actor, meta)
}

/** The person a calendar key belongs to, while they're still staff; null for any other key. */
export function authenticateCalendarKey(ctx: Ctx, secret: string) {
  if (!secret.startsWith(SECRET_PREFIX.key)) return null
  const row = ctx.db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.secretHash, verifier(secret)))
    .get()
  if (row?.scope !== 'calendar') return null
  const user = ctx.userViews([row.userId])[0]
  if (!user || user.invited || !isStaff(user.role)) return null
  const now = ctx.now()
  if (!row.lastUsedAt || now - row.lastUsedAt > TOUCH_EVERY)
    ctx.db
      .update(schema.apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(schema.apiKeys.id, row.id))
      .run()
  return user
}
