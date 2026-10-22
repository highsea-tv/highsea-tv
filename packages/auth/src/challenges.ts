// SPDX-License-Identifier: AGPL-3.0-only
// Short-lived steps between two requests (the code step after a password, a WebAuthn challenge,
// a single sign-on round trip, a TV waiting for approval). The caller holds a random secret; the
// row's id is its SHA-256 verifier. Each is single use and expires within minutes (OWASP: bind
// every step of a multi-step flow to the session that started it, and expire it).
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { ChallengeKind } from '@highsea-tv/db/schema'
import { and, eq, lt } from 'drizzle-orm'
import type { Ctx } from './context.ts'
import { newSecret, verifier } from './secrets.ts'

export const CHALLENGE_TTL = 5 * 60_000

export type Challenge<T> = {
  id: string
  kind: ChallengeKind
  userId: string | null
  data: T
  attempts: number
  expiresAt: number
}

/** Stores a step and returns the secret the caller holds (or `secret`, when one is given). */
export function createChallenge<T>(
  ctx: Ctx,
  kind: ChallengeKind,
  {
    userId = null,
    data,
    ttl = CHALLENGE_TTL,
    secret = newSecret(),
  }: {
    userId?: string | null
    data: T
    ttl?: number
    secret?: string
  },
): { secret: string; expiresAt: number } {
  const now = ctx.now()
  ctx.db.delete(schema.authChallenges).where(lt(schema.authChallenges.expiresAt, now)).run()
  const expiresAt = now + ttl
  ctx.db
    .insert(schema.authChallenges)
    .values({ id: verifier(secret), kind, userId, data, expiresAt, createdAt: now })
    .run()
  return { secret, expiresAt }
}

/** The live step for `secret`, or null when it's unknown, of another kind or expired. */
export function findChallenge<T>(
  ctx: Ctx,
  kind: ChallengeKind,
  secret: string,
): Challenge<T> | null {
  const row = ctx.db
    .select()
    .from(schema.authChallenges)
    .where(
      and(eq(schema.authChallenges.id, verifier(secret)), eq(schema.authChallenges.kind, kind)),
    )
    .get()
  if (!row || row.expiresAt <= ctx.now()) return null
  return row as Challenge<T>
}

/** Like findChallenge, but a missing step is an error people can act on. */
export function requireChallenge<T>(ctx: Ctx, kind: ChallengeKind, secret: string): Challenge<T> {
  const found = findChallenge<T>(ctx, kind, secret)
  if (!found)
    throw new AppError('unauthorized', 'That step has expired. Start again.', {
      reason: 'challenge-expired',
    })
  return found
}

export function deleteChallenge(ctx: Ctx, id: string) {
  ctx.db.delete(schema.authChallenges).where(eq(schema.authChallenges.id, id)).run()
}

/** Counts a wrong answer; past `max`, the step is gone and has to start again. */
export function failChallenge(ctx: Ctx, challenge: Challenge<unknown>, max: number): number {
  const attempts = challenge.attempts + 1
  if (attempts >= max) deleteChallenge(ctx, challenge.id)
  else
    ctx.db
      .update(schema.authChallenges)
      .set({ attempts })
      .where(eq(schema.authChallenges.id, challenge.id))
      .run()
  return max - attempts
}

export function updateChallengeData<T>(ctx: Ctx, id: string, data: T) {
  ctx.db.update(schema.authChallenges).set({ data }).where(eq(schema.authChallenges.id, id)).run()
}
