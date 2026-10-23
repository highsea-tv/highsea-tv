// SPDX-License-Identifier: AGPL-3.0-only
// Sign-in by code (connectivity.md): the TV shows a short code, a phone or computer that's
// already signed in approves it, and the TV receives a device token. Shaped like OAuth's device
// authorization grant (RFC 8628): the code people type is the user code; the TV polls with a
// separate secret, the device code (§ 3.2), so someone who reads the code off the screen can
// approve it but never collect the token. The code lasts 10 minutes and works once (§ 6.1).
//
// The TV never meets two-step verification or passkeys: the approving device already passed
// them (ADR 0024).
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, eq, gt } from 'drizzle-orm'
import {
  createChallenge,
  deleteChallenge,
  findChallenge,
  updateChallengeData,
} from './challenges.ts'
import type { Ctx, DeviceInput, RequestMeta, SessionView } from './context.ts'
import { newCode, normalizeCode, verifier } from './secrets.ts'
import { issueDevice } from './sessions.ts'

export const PAIRING_TTL = 10 * 60_000
/** How often the TV should ask (RFC 8628 § 3.2's `interval`, which defaults to 5 seconds). */
export const PAIRING_INTERVAL = 5

type Waiting = {
  codeHash: string
  device: DeviceInput
  address: string
  approvedBy: string | null
}

export type Pairing = {
  /** For people: `KQ7-4PM`. */
  code: string
  /** For the TV only: what it polls with. */
  pollToken: string
  /** Where to approve it: `{server}/link?code=KQ7-4PM`, also the QR code's content. */
  url: string
  expiresAt: number
  interval: number
}

export type PairingRequest = {
  device: DeviceInput
  address: string
  expiresAt: number
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'signed-in'; session: SessionView; secret: string }

const expired = () =>
  new AppError('not-found', 'That code has expired. Show a new one on the TV.', {
    reason: 'pairing-expired',
  })

export function createPairing(ctx: Ctx) {
  function base() {
    const { externalUrl, localOrigins } = ctx.addresses()
    return (externalUrl ?? localOrigins[0] ?? '').replace(/\/$/, '')
  }

  function waitingByCode(code: string) {
    const hash = verifier(normalizeCode(code))
    const rows = ctx.db
      .select()
      .from(schema.authChallenges)
      .where(
        and(
          eq(schema.authChallenges.kind, 'pairing'),
          gt(schema.authChallenges.expiresAt, ctx.now()),
        ),
      )
      .all()
    const row = rows.find((r) => (r.data as Waiting).codeHash === hash)
    if (!row) throw expired()
    return { ...row, data: row.data as Waiting }
  }

  return {
    /** The TV asks for a code. Unauthenticated; the code alone grants nothing. */
    start(device: DeviceInput, meta: RequestMeta): Pairing {
      const live = new Set(
        ctx.db
          .select({ data: schema.authChallenges.data })
          .from(schema.authChallenges)
          .where(eq(schema.authChallenges.kind, 'pairing'))
          .all()
          .map((r) => (r.data as Waiting).codeHash),
      )
      let code = newCode()
      while (live.has(verifier(normalizeCode(code)))) code = newCode()
      const { secret, expiresAt } = createChallenge<Waiting>(ctx, 'pairing', {
        data: {
          codeHash: verifier(normalizeCode(code)),
          device,
          address: meta.address,
          approvedBy: null,
        },
        ttl: PAIRING_TTL,
      })
      return {
        code,
        pollToken: secret,
        url: `${base()}/link?code=${code}`,
        expiresAt,
        interval: PAIRING_INTERVAL,
      }
    },

    /** What the approving device shows: "Sign in {TV name} as {you}?" */
    describe(code: string): PairingRequest {
      const row = waitingByCode(code)
      return { device: row.data.device, address: row.data.address, expiresAt: row.expiresAt }
    },

    /** A signed-in person approves the code; the TV's next poll signs it in as them. */
    approve(
      code: string,
      approver: { id: string; name: string },
      meta: RequestMeta,
    ): PairingRequest {
      const row = waitingByCode(code)
      if (row.data.approvedBy) throw expired()
      updateChallengeData<Waiting>(ctx, row.id, { ...row.data, approvedBy: approver.id })
      ctx.audit({
        action: 'auth.pairing-approve',
        actor: approver,
        address: meta.address,
        detail: {
          device: row.data.device.name,
          client: row.data.device.client,
          from: row.data.address,
        },
      })
      return { device: row.data.device, address: row.data.address, expiresAt: row.expiresAt }
    },

    /** The TV asks whether it's approved yet. Once approved, the token is handed over once. */
    poll(pollToken: string, meta: RequestMeta): PollResult {
      const row = findChallenge<Waiting>(ctx, 'pairing', pollToken)
      if (!row) throw expired()
      if (!row.data.approvedBy) return { status: 'pending' }
      deleteChallenge(ctx, row.id)
      const user = ctx.findUser(row.data.approvedBy)
      if (!user) throw expired()
      const issued = issueDevice(ctx, user.id, 'pairing', meta, row.data.device)
      return { status: 'signed-in', ...issued }
    },
  }
}

export type PairingService = ReturnType<typeof createPairing>
