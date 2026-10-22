// SPDX-License-Identifier: AGPL-3.0-only
// Two-step verification with an authenticator app (TOTP, RFC 6238) and recovery codes for when
// the phone is lost (OWASP Multifactor Authentication Cheat Sheet). The seed is sealed with the
// server's key; recovery codes are stored as verifiers and each works once. Turning it on or off,
// or making new recovery codes, asks for the password again. Someone who loses both the app and
// the codes asks the owner to turn it off for them (OWASP, "Resetting MFA").
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, eq, isNull } from 'drizzle-orm'
import { type Actor, assertCanManage, confirmPassword } from './accounts.ts'
import type { Ctx, RequestMeta } from './context.ts'
import { isStaff } from './roles.ts'
import { newCode, normalizeCode, verifier } from './secrets.ts'
import { newTotpSecret, otpauthUri, verifyTotp } from './totp.ts'

export const RECOVERY_CODES = 10

export type TotpSetup = { secret: string; uri: string }

/**
 * Whether the security policy asks `role` to use two-step verification in the admin. Only staff
 * open the admin, so a user is never asked (ADR 0032).
 */
export function twoFactorRequired(ctx: Ctx, role: Parameters<typeof isStaff>[0]): boolean {
  return ctx.security().twoFactor && isStaff(role)
}

export function totpEnabled(ctx: Ctx, userId: string): boolean {
  const row = ctx.db.select().from(schema.totp).where(eq(schema.totp.userId, userId)).get()
  return !!row?.enabledAt
}

/**
 * Starts enrolment: a new seed, pending until a code from it confirms it. Called again, it
 * replaces a pending seed; an enabled one has to be turned off first.
 */
export function startTotp(ctx: Ctx, userId: string): TotpSetup {
  const user = ctx.findUser(userId)
  if (!user) throw new AppError('not-found', 'There’s no one with that id.')
  if (totpEnabled(ctx, userId))
    throw new AppError('conflict', 'Two-step verification is already on.')
  const secret = newTotpSecret()
  const now = ctx.now()
  const values = {
    secretSealed: ctx.sealer.seal(secret),
    enabledAt: null,
    lastStep: 0,
    createdAt: now,
  }
  ctx.db
    .insert(schema.totp)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.totp.userId, set: values })
    .run()
  return {
    secret,
    uri: otpauthUri({ secret, account: user.username, issuer: `highsea (${ctx.serverName()})` }),
  }
}

export const invalidCode = () =>
  new AppError('unauthorized', 'That code didn’t work. Codes change every 30 seconds.', {
    field: 'code',
    reason: 'invalid-code',
  })

/** Confirms enrolment with a code from the app; returns the recovery codes, shown once. */
export function enableTotp(ctx: Ctx, userId: string, code: string, meta: RequestMeta): string[] {
  const row = ctx.db.select().from(schema.totp).where(eq(schema.totp.userId, userId)).get()
  if (!row) throw new AppError('conflict', 'Start setting up two-step verification first.')
  if (row.enabledAt) throw new AppError('conflict', 'Two-step verification is already on.')
  const step = verifyTotp(ctx.sealer.open(row.secretSealed), code.replace(/\s/g, ''), ctx.now())
  if (step === null) throw invalidCode()
  ctx.db
    .update(schema.totp)
    .set({ enabledAt: ctx.now(), lastStep: step })
    .where(eq(schema.totp.userId, userId))
    .run()
  const codes = replaceRecoveryCodes(ctx, userId)
  const user = ctx.userView(userId)
  ctx.audit({
    action: 'two-factor.enable',
    actor: { id: userId, name: user.username },
    targetType: 'user',
    targetId: userId,
    address: meta.address,
  })
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
  return codes
}

export async function disableTotp(ctx: Ctx, userId: string, password: string, meta: RequestMeta) {
  await confirmPassword(ctx, userId, password)
  const user = ctx.userView(userId)
  if (twoFactorRequired(ctx, user.role))
    throw new AppError('forbidden', 'This server asks you to use two-step verification.', {
      reason: 'two-factor-required',
    })
  ctx.db.delete(schema.totp).where(eq(schema.totp.userId, userId)).run()
  ctx.db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)).run()
  ctx.audit({
    action: 'two-factor.disable',
    actor: { id: userId, name: user.username },
    targetType: 'user',
    targetId: userId,
    address: meta.address,
  })
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
}

/**
 * Turns someone's two-step off for them, after they lost both the app and the recovery codes.
 * Whoever does it confirms who's asking outside highsea first. It's for someone else: your own
 * goes through Account, with your password. Only the owner can do it, so nobody can for the
 * owner. Passkeys and signed-in devices stay; if the policy asks for two-step, their
 * next admin sign-in sets it up again.
 */
export function resetTotp(ctx: Ctx, userId: string, actor: Actor, meta: RequestMeta) {
  const user = ctx.findUser(userId)
  if (!user) throw new AppError('not-found', 'There’s no one with that id.')
  if (userId === actor.id)
    throw new AppError('forbidden', 'Turn your own off in Account.', { reason: 'self' })
  assertCanManage(ctx, actor)
  if (!totpEnabled(ctx, userId)) throw new AppError('conflict', 'Two-step verification is off.')
  ctx.db.delete(schema.totp).where(eq(schema.totp.userId, userId)).run()
  ctx.db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)).run()
  ctx.audit({
    action: 'two-factor.reset',
    actor,
    targetType: 'user',
    targetId: userId,
    address: meta.address,
  })
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
}

/** Ten new codes (`7KQ2-4PMX-H3RT`, about 59 bits each); the old ones stop working. */
export function replaceRecoveryCodes(ctx: Ctx, userId: string): string[] {
  ctx.db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, userId)).run()
  const codes = Array.from({ length: RECOVERY_CODES }, () => newCode(3, 4))
  ctx.db
    .insert(schema.recoveryCodes)
    .values(codes.map((c) => ({ id: newId('rec'), userId, codeHash: verifier(normalizeCode(c)) })))
    .run()
  return codes
}

export async function newRecoveryCodes(
  ctx: Ctx,
  userId: string,
  password: string,
): Promise<string[]> {
  await confirmPassword(ctx, userId, password)
  if (!totpEnabled(ctx, userId)) throw new AppError('conflict', 'Two-step verification is off.')
  return replaceRecoveryCodes(ctx, userId)
}

export function recoveryCodesLeft(ctx: Ctx, userId: string): number {
  return ctx.db
    .select({ id: schema.recoveryCodes.id })
    .from(schema.recoveryCodes)
    .where(and(eq(schema.recoveryCodes.userId, userId), isNull(schema.recoveryCodes.usedAt)))
    .all().length
}

/**
 * Checks a second factor: six digits from the app, or a recovery code. A TOTP code is accepted
 * once (RFC 6238 § 5.2); a recovery code is used up.
 */
export function checkSecondFactor(
  ctx: Ctx,
  userId: string,
  code: string,
): 'totp' | 'recovery' | null {
  const row = ctx.db.select().from(schema.totp).where(eq(schema.totp.userId, userId)).get()
  if (!row?.enabledAt) return null
  const digits = code.replace(/\s/g, '')
  if (/^\d{6}$/.test(digits)) {
    const step = verifyTotp(ctx.sealer.open(row.secretSealed), digits, ctx.now(), row.lastStep)
    if (step === null) return null
    ctx.db.update(schema.totp).set({ lastStep: step }).where(eq(schema.totp.userId, userId)).run()
    return 'totp'
  }
  const hash = verifier(normalizeCode(code))
  const match = ctx.db
    .select()
    .from(schema.recoveryCodes)
    .where(
      and(
        eq(schema.recoveryCodes.userId, userId),
        eq(schema.recoveryCodes.codeHash, hash),
        isNull(schema.recoveryCodes.usedAt),
      ),
    )
    .get()
  if (!match) return null
  ctx.db
    .update(schema.recoveryCodes)
    .set({ usedAt: ctx.now() })
    .where(eq(schema.recoveryCodes.id, match.id))
    .run()
  return 'recovery'
}
