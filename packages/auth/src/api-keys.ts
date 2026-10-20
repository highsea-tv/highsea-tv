// SPDX-License-Identifier: AGPL-3.0-only
// API keys for scripts and other apps (users-devices.md). Keys are administrative (ADR 0032): only
// the owner and admins make them, and a key acts for the person who made it, never beyond an
// admin. It's either read-only (GET requests) or full. The secret shows once; only its SHA-256
// verifier is kept and keys are told apart by their first characters. Users' apps sign in with
// device tokens instead.
import { AppError, newId } from '@highsea/core'
import { schema } from '@highsea/db'
import { desc, eq } from 'drizzle-orm'
import type { Ctx, RequestMeta } from './context.ts'
import { notFound } from './context.ts'
import { isStaff } from './roles.ts'
import { newSecret, verifier } from './secrets.ts'
import { type Principal, SECRET_PREFIX } from './sessions.ts'

export type ApiKeyScope = 'read' | 'full'

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
  if (!row) return null
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
    scope: row.scope,
    method: 'password',
    expiresAt: null,
    apiKeyId: row.id,
  }
}
