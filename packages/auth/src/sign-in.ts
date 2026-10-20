// SPDX-License-Identifier: AGPL-3.0-only
// Signing in with a username and password, then the code step when the person has two-step
// verification on (login.md). One generic error for an unknown user, a wrong password or an
// account that hasn't joined (OWASP Authentication Cheat Sheet: authentication responses).
//
// Apps and two-step verification (ADR 0024): a TV normally signs in by pairing, approved from a
// device that's already signed in, so it never sees a code or a passkey. When an app signs in
// with a password instead, the code step appears only if the person has turned two-step on; the
// security policy that requires two-step only ever forces enrolment in the admin.
import { AppError } from '@highsea/core'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import { createChallenge, deleteChallenge, failChallenge, requireChallenge } from './challenges.ts'
import type { Ctx, DeviceInput, RequestMeta, SessionView } from './context.ts'
import { hashPassword, needsRehash, verifyPassword } from './passwords.ts'
import { createRateLimiter, LIMITS } from './rate-limit.ts'
import { verifier as verifierOf } from './secrets.ts'
import { issueDevice } from './sessions.ts'
import {
  checkSecondFactor,
  enableTotp,
  startTotp,
  totpEnabled,
  twoFactorRequired,
} from './two-factor.ts'

const minutes = (ms: number) => {
  const n = Math.ceil(ms / 60_000)
  return n === 1 ? '1 minute' : `${n} minutes`
}

/** Wrong codes allowed on one code step before it has to start again. */
export const CODE_ATTEMPTS = 5

export type SignedIn = {
  status: 'signed-in'
  session: SessionView
  /** The cookie value or bearer token; the server hands it over and doesn't keep it. */
  secret: string
  /** After enrolling during sign-in: the recovery codes, shown once. */
  recoveryCodes?: string[]
}

export type SignInOutcome =
  | SignedIn
  | { status: 'two-factor'; challenge: string }
  /** The policy requires two-step and this person hasn't set it up: enrol now (admin only). */
  | { status: 'two-factor-setup'; challenge: string; secret: string; uri: string }

type CodeStep = { device: DeviceInput | null; method: 'password' }

export type SignInService = ReturnType<typeof createSignIn>

export function createSignIn(ctx: Ctx) {
  const accounts = createRateLimiter(LIMITS.account)
  const addresses = createRateLimiter(LIMITS.address)

  const blocked = (username: string, meta: RequestMeta) => {
    const wait = Math.max(
      accounts.retryAfter(username, ctx.now()),
      addresses.retryAfter(meta.address, ctx.now()),
    )
    if (wait > 0)
      throw new AppError('rate-limited', `Too many attempts. Try again in ${minutes(wait)}.`, {
        reason: 'rate-limited',
        retryAfter: Math.ceil(wait / 1000),
      })
  }

  const failed = (username: string, meta: RequestMeta, reason: string, userId?: string) => {
    accounts.fail(username, ctx.now())
    addresses.fail(meta.address, ctx.now())
    ctx.audit({
      action: 'auth.sign-in-failed',
      actor: userId ? { id: userId, name: username } : null,
      address: meta.address,
      detail: { username, reason },
    })
  }

  /** After the first factor: the code step, enrolment, or signed in. */
  function afterPassword(
    userId: string,
    meta: RequestMeta,
    device: DeviceInput | null,
  ): SignInOutcome {
    const user = ctx.userView(userId)
    if (totpEnabled(ctx, userId)) {
      const { secret } = createChallenge<CodeStep>(ctx, 'two-factor', {
        userId,
        data: { device, method: 'password' },
      })
      return { status: 'two-factor', challenge: secret }
    }
    if (!device && twoFactorRequired(ctx, user.role)) {
      const setup = startTotp(ctx, userId)
      const { secret } = createChallenge<CodeStep>(ctx, 'two-factor-setup', {
        userId,
        data: { device: null, method: 'password' },
      })
      return { status: 'two-factor-setup', challenge: secret, ...setup }
    }
    const issued = issueDevice(ctx, userId, 'password', meta, device ?? undefined)
    return { status: 'signed-in', ...issued }
  }

  return {
    async password(
      input: { username: string; password: string; device?: DeviceInput },
      meta: RequestMeta,
    ): Promise<SignInOutcome> {
      const username = input.username.trim().toLowerCase()
      blocked(username, meta)
      const user = ctx.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, username))
        .get()
      const ok = await verifyPassword(input.password, user?.passwordHash ?? null)
      if (!user || !ok || user.invited) {
        failed(username, meta, user ? 'password' : 'unknown-user', user?.id)
        throw new AppError('unauthorized', 'That username and password don’t match.', {
          field: 'password',
          reason: 'invalid-credentials',
        })
      }
      accounts.clear(username)
      if (user.passwordHash && needsRehash(user.passwordHash))
        ctx.db
          .update(schema.users)
          .set({ passwordHash: await hashPassword(input.password) })
          .where(eq(schema.users.id, user.id))
          .run()
      return afterPassword(user.id, meta, input.device ?? null)
    },

    /** The code step, and the enrolment step when the policy required it. */
    twoFactor(input: { challenge: string; code: string }, meta: RequestMeta): SignInOutcome {
      const pending =
        ctx.db
          .select({ kind: schema.authChallenges.kind })
          .from(schema.authChallenges)
          .where(eq(schema.authChallenges.id, verifierOf(input.challenge)))
          .get()?.kind === 'two-factor-setup'
          ? 'two-factor-setup'
          : 'two-factor'
      const challenge = requireChallenge<CodeStep>(ctx, pending, input.challenge)
      const userId = challenge.userId as string
      const user = ctx.userView(userId)
      blocked(user.username, meta)
      if (pending === 'two-factor-setup') {
        let codes: string[]
        try {
          codes = enableTotp(ctx, userId, input.code, meta)
        } catch (e) {
          failChallenge(ctx, challenge, CODE_ATTEMPTS)
          throw e
        }
        deleteChallenge(ctx, challenge.id)
        const issued = issueDevice(ctx, userId, 'password', meta)
        return { status: 'signed-in', ...issued, recoveryCodes: codes }
      }
      const used = checkSecondFactor(ctx, userId, input.code)
      if (!used) {
        failed(user.username, meta, 'code', userId)
        const left = failChallenge(ctx, challenge, CODE_ATTEMPTS)
        throw new AppError(
          'unauthorized',
          left > 0
            ? 'That code didn’t work. Codes change every 30 seconds.'
            : 'That code didn’t work, and this sign-in has expired. Start again.',
          { field: 'code', reason: left > 0 ? 'invalid-code' : 'challenge-expired' },
        )
      }
      deleteChallenge(ctx, challenge.id)
      accounts.clear(user.username)
      if (used === 'recovery')
        ctx.audit({
          action: 'two-factor.recovery-code',
          actor: { id: userId, name: user.username },
          address: meta.address,
        })
      const issued = issueDevice(ctx, userId, 'password', meta, challenge.data.device ?? undefined)
      return { status: 'signed-in', ...issued }
    },

    /** For tests and the reset flow: forget an account's failures. */
    clear(username: string) {
      accounts.clear(username)
    },
  }
}
