// SPDX-License-Identifier: AGPL-3.0-only
// Every sign-in is a device (ADR 0023). The admin in a browser holds a cookie session that ends
// after the security setting's days; an app holds a bearer token until it's signed out. Each
// secret is 256 random bits and only its SHA-256 verifier is stored (OWASP Session Management
// Cheat Sheet). A new secret is issued at every sign-in, so a session id can't be fixed in advance.
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { ClientType, SignInMethod } from '@highsea-tv/db/schema'
import { and, desc, eq, lt, ne } from 'drizzle-orm'
import type { Ctx, DeviceInput, RequestMeta, SessionView, UserView } from './context.ts'
import { notFound } from './context.ts'
import { newSecret, verifier } from './secrets.ts'

const DAY = 86_400_000

/** Secrets say what they are: `hss_` a session, `hst_` an app's token, `hs_` an API key. */
export const SECRET_PREFIX = { session: 'hss_', token: 'hst_', key: 'hs_' } as const

/** Last seen is written at most this often, so reads don't each become a write. */
const TOUCH_EVERY = 60_000

export type Principal = {
  user: UserView
  deviceId: string | null
  via: 'session' | 'token' | 'key' | 'proxy'
  /** API keys may be read-only; everything else is full. */
  scope: 'read' | 'full'
  method: SignInMethod
  expiresAt: number | null
  apiKeyId?: string
}

export type Issued = { secret: string; session: SessionView }

/**
 * Signs `userId` in as a new device: an admin session, or an app's token when `device` is given.
 * Returns the secret once; it isn't stored.
 */
export function issueDevice(
  ctx: Ctx,
  userId: string,
  method: SignInMethod,
  meta: RequestMeta,
  device?: DeviceInput,
): Issued {
  const now = ctx.now()
  const kind = device ? 'token' : 'session'
  const secret = newSecret(SECRET_PREFIX[kind])
  const id = newId('dev')
  const expiresAt = kind === 'session' ? now + ctx.security().sessionDays * DAY : null
  ctx.db
    .insert(schema.devices)
    .values({
      id,
      userId,
      kind,
      tokenHash: verifier(secret),
      name: device?.name ?? browserName(meta.userAgent),
      client: (device?.client ?? 'admin') as ClientType,
      appVersion: device?.appVersion ?? ctx.version,
      address: meta.address,
      method,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    })
    .run()
  ctx.db.update(schema.users).set({ lastSeenAt: now }).where(eq(schema.users.id, userId)).run()
  ctx.db.delete(schema.devices).where(lt(schema.devices.expiresAt, now)).run()
  const user = ctx.userView(userId)
  ctx.audit({
    action: 'auth.sign-in',
    actor: { id: user.id, name: user.username },
    targetType: 'device',
    targetId: id,
    address: meta.address,
    detail: { method, client: device?.client ?? 'admin' },
  })
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
  return { secret, session: { user, deviceId: id, expiresAt, method } }
}

/** The person behind a session cookie or device token, or null. */
export function authenticateDevice(ctx: Ctx, secret: string, meta?: RequestMeta): Principal | null {
  if (!secret.startsWith(SECRET_PREFIX.session) && !secret.startsWith(SECRET_PREFIX.token))
    return null
  const row = ctx.db
    .select()
    .from(schema.devices)
    .where(eq(schema.devices.tokenHash, verifier(secret)))
    .get()
  const now = ctx.now()
  if (!row) return null
  if (row.expiresAt !== null && row.expiresAt <= now) {
    ctx.db.delete(schema.devices).where(eq(schema.devices.id, row.id)).run()
    return null
  }
  if (now - row.lastSeenAt > TOUCH_EVERY) {
    ctx.db
      .update(schema.devices)
      .set({ lastSeenAt: now, ...(meta ? { address: meta.address } : {}) })
      .where(eq(schema.devices.id, row.id))
      .run()
    ctx.db
      .update(schema.users)
      .set({ lastSeenAt: now })
      .where(eq(schema.users.id, row.userId))
      .run()
  }
  const user = ctx.userViews([row.userId])[0]
  if (!user || user.invited) return null
  return {
    user,
    deviceId: row.id,
    via: row.kind,
    scope: 'full',
    method: row.method,
    expiresAt: row.expiresAt,
  }
}

export type DeviceView = {
  id: string
  userId: string
  name: string
  client: ClientType
  appVersion: string
  address: string
  method: SignInMethod
  createdAt: number
  lastSeenAt: number
  expiresAt: number | null
}

const deviceView = (row: typeof schema.devices.$inferSelect): DeviceView => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  client: row.client,
  appVersion: row.appVersion,
  address: row.address,
  method: row.method,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  expiresAt: row.expiresAt,
})

/** Signed-in devices, most recently seen first; one person's when `userId` is given. */
export function listDevices(ctx: Ctx, userId?: string): DeviceView[] {
  const now = ctx.now()
  ctx.db.delete(schema.devices).where(lt(schema.devices.expiresAt, now)).run()
  return ctx.db
    .select()
    .from(schema.devices)
    .where(userId ? eq(schema.devices.userId, userId) : undefined)
    .orderBy(desc(schema.devices.lastSeenAt))
    .all()
    .map(deviceView)
}

export function findDevice(ctx: Ctx, id: string): DeviceView | null {
  const row = ctx.db.select().from(schema.devices).where(eq(schema.devices.id, id)).get()
  return row ? deviceView(row) : null
}

/** Signs a device out. Its token stops working at once. */
export function revokeDevice(
  ctx: Ctx,
  id: string,
  actor: { id: string; name: string },
  meta: RequestMeta,
) {
  const row = findDevice(ctx, id)
  if (!row) throw notFound('That device isn’t signed in.')
  ctx.db.delete(schema.devices).where(eq(schema.devices.id, id)).run()
  ctx.audit({
    action: actor.id === row.userId ? 'auth.sign-out' : 'device.revoke',
    actor,
    targetType: 'device',
    targetId: id,
    address: meta.address,
    detail: { name: row.name, userId: row.userId },
  })
  ctx.events.emit({ topic: 'users.updated', ids: [row.userId] })
}

/** Signs out everything of `userId`'s except `keep` (after a password change, OWASP). */
export function revokeOtherDevices(ctx: Ctx, userId: string, keep: string | null) {
  ctx.db
    .delete(schema.devices)
    .where(
      keep
        ? and(eq(schema.devices.userId, userId), ne(schema.devices.id, keep))
        : eq(schema.devices.userId, userId),
    )
    .run()
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
}

/** A readable name for a browser session: "Firefox on macOS". Good enough for a list. */
export function browserName(userAgent?: string): string {
  const ua = userAgent ?? ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  return os ? `${browser} on ${os}` : browser
}

export const sessionFor = (p: Principal): SessionView => ({
  user: p.user,
  deviceId: p.deviceId,
  expiresAt: p.expiresAt,
  method: p.method,
})

export const forbidden = (message = 'You don’t have access to that.') =>
  new AppError('forbidden', message)
