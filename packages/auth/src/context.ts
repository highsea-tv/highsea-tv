// SPDX-License-Identifier: AGPL-3.0-only
// What every part of the auth service shares: the platform it was given, the views it returns,
// the audit log and the events it announces.
import {
  AppError,
  type Clock,
  type EventBus,
  type Fetch,
  type Logger,
  newId,
  type Sealer,
} from '@highsea-tv/core'
import { type Db, readSetting, schema } from '@highsea-tv/db'
import type { ClientType, Permission, Role, SignInMethod } from '@highsea-tv/db/schema'
import { desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { ALL_LIBRARIES } from './roles.ts'
import { defaultSecuritySettings, SECURITY_KEY, type SecuritySettings } from './settings.ts'

export type { Fetch }

export type AuthDeps = {
  db: Db
  clock: Clock
  sealer: Sealer
  events: EventBus
  logger: Logger
  /** The server's version, shown as the admin's app version on its devices. */
  version: string
  serverName: () => string
  /**
   * Where the server is reached: the external URL people use from outside (if any) and the
   * origins it answers on locally. Passkeys, single sign-on and links are built from these, never
   * from request headers alone.
   */
  addresses: () => { externalUrl: string | null; localOrigins: string[] }
  /** For single sign-on's requests to the provider; tests pass a fake. */
  fetch?: Fetch
}

/** Who's asking and from where. `origin` is the browser's, as the server resolved it. */
export type RequestMeta = { address: string; userAgent?: string; origin?: string }

/** An app signing in, rather than the admin in a browser. */
export type DeviceInput = { name: string; client: ClientType; appVersion: string }

export type UserView = {
  id: string
  username: string
  displayName: string
  role: Role
  permissions: Permission[]
  libraries: 'all' | string[]
  twoFactor: boolean
  passkeys: number
  hasPassword: boolean
  email: string | null
  invited: boolean
  lastSeenAt: number | null
  createdAt: number
}

export type SessionView = {
  user: UserView
  /** The device this sign-in is (null for a request authenticated by a forward-auth proxy). */
  deviceId: string | null
  /** When an admin session ends; null for an app's token. */
  expiresAt: number | null
  method: SignInMethod
}

export type Ctx = AuthDeps & {
  now(): number
  security(): SecuritySettings
  audit(entry: AuditInput): void
  userView(id: string): UserView
  userViews(ids?: string[]): UserView[]
  findUser(id: string): typeof schema.users.$inferSelect | undefined
}

export type AuditInput = {
  action: string
  actor?: { id: string; name: string } | null
  targetType?: string
  targetId?: string
  address?: string
  detail?: Record<string, unknown>
}

export const notFound = (what: string) => new AppError('not-found', what)

export function createContext(deps: AuthDeps): Ctx {
  const { db } = deps
  const now = () => deps.clock.now()

  const userViews = (ids?: string[]): UserView[] => {
    const rows = ids
      ? ids.length
        ? db.select().from(schema.users).where(inArray(schema.users.id, ids)).all()
        : []
      : db.select().from(schema.users).orderBy(schema.users.createdAt).all()
    if (!rows.length) return []
    const userIds = rows.map((r) => r.id)
    const perms = db
      .select()
      .from(schema.userPermissions)
      .where(inArray(schema.userPermissions.userId, userIds))
      .all()
    const libs = db
      .select()
      .from(schema.libraryAccess)
      .where(inArray(schema.libraryAccess.userId, userIds))
      .all()
    const totps = db
      .select({ userId: schema.totp.userId, enabledAt: schema.totp.enabledAt })
      .from(schema.totp)
      .where(inArray(schema.totp.userId, userIds))
      .all()
    const keys = db
      .select({ userId: schema.passkeys.userId })
      .from(schema.passkeys)
      .where(inArray(schema.passkeys.userId, userIds))
      .all()
    return rows.map((u) => {
      const own = libs.filter((l) => l.userId === u.id).map((l) => l.library)
      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        permissions: perms.filter((p) => p.userId === u.id).map((p) => p.permission),
        libraries: own.includes(ALL_LIBRARIES) ? 'all' : own.sort(),
        twoFactor: totps.some((t) => t.userId === u.id && t.enabledAt !== null),
        passkeys: keys.filter((k) => k.userId === u.id).length,
        hasPassword: u.passwordHash !== null,
        email: u.email,
        invited: u.invited,
        lastSeenAt: u.lastSeenAt,
        createdAt: u.createdAt,
      }
    })
  }

  return {
    ...deps,
    now,
    security: () => readSetting(db, SECURITY_KEY, defaultSecuritySettings),
    audit(entry) {
      db.insert(schema.auditLog)
        .values({
          id: newId('aud'),
          // one writer (ADR 0019), so the next number can't be taken twice
          seq: sql`(select coalesce(max(${schema.auditLog.seq}), 0) + 1 from ${schema.auditLog})`,
          at: now(),
          action: entry.action,
          actorId: entry.actor?.id ?? null,
          actorName: entry.actor?.name ?? null,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          address: entry.address ?? null,
          detail: entry.detail ?? null,
        })
        .run()
      deps.events.emit({ topic: 'audit.updated' })
    },
    userView(id) {
      const [view] = userViews([id])
      if (!view) throw notFound('There’s no one with that id.')
      return view
    },
    userViews,
    findUser: (id) => db.select().from(schema.users).where(eq(schema.users.id, id)).get(),
  }
}

export type AuditEntry = typeof schema.auditLog.$inferSelect

/** The audit log, newest first, a page at a time. The cursor is the last entry's sequence number. */
export function listAudit(
  ctx: Ctx,
  { cursor, limit = 50 }: { cursor?: string; limit?: number },
): { items: AuditEntry[]; next: string | null } {
  const t = schema.auditLog
  const after = cursor ? Number(Buffer.from(cursor, 'base64url').toString('utf8')) : Number.NaN
  const rows = ctx.db
    .select()
    .from(t)
    .where(Number.isInteger(after) ? lt(t.seq, after) : undefined)
    .orderBy(desc(t.seq))
    .limit(limit + 1)
    .all()
  const items = rows.slice(0, limit)
  const last = items[items.length - 1]
  return {
    items,
    next:
      rows.length > limit && last
        ? Buffer.from(String(last.seq), 'utf8').toString('base64url')
        : null,
  }
}
