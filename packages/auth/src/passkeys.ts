// SPDX-License-Identifier: AGPL-3.0-only
// Passkeys (WebAuthn Level 3) through SimpleWebAuthn, following its server guide: discoverable
// credentials (residentKey "required"), so sign-in needs no username; user verification
// "required", so a passkey is two factors in one and skips the code step (NIST SP 800-63B
// § 5.1.9 and the WebAuthn spec's § 13.4.1); attestation "none", since a household server has no
// use for vetting authenticator models. Challenges are single use and last five minutes.
//
// WebAuthn only runs in a secure context, and its relying party id must be a domain, never an IP
// address (WebAuthn L3 § 5.1.3, the RP ID's "valid domain" rule; HTML's secure contexts). So
// passkeys work at the server's external HTTPS address and at localhost, and nowhere else.
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { and, eq } from 'drizzle-orm'
import { CHALLENGE_TTL, createChallenge, deleteChallenge, requireChallenge } from './challenges.ts'
import type { Ctx, DeviceInput, RequestMeta } from './context.ts'
import { notFound } from './context.ts'
import { type Issued, issueDevice } from './sessions.ts'

export type RelyingParty = { origin: string; rpID: string }

type Ceremony = { challenge: string; origin: string; rpID: string; device: DeviceInput | null }

/**
 * The relying party for a browser at `origin`, or null when passkeys can't work there: the
 * external URL when it's HTTPS, or localhost (a secure context over plain HTTP too).
 */
export function relyingParty(ctx: Ctx, origin: string | undefined): RelyingParty | null {
  if (!origin || !ctx.security().passkeys) return null
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return null
  }
  if (url.hostname === 'localhost') return { origin: url.origin, rpID: 'localhost' }
  const external = ctx.addresses().externalUrl
  if (!external) return null
  const ext = new URL(external)
  if (ext.protocol === 'https:' && ext.origin === url.origin)
    return { origin: url.origin, rpID: ext.hostname }
  return null
}

function requireRelyingParty(ctx: Ctx, origin: string | undefined): RelyingParty {
  const rp = relyingParty(ctx, origin)
  if (!rp)
    throw new AppError(
      'forbidden',
      'Passkeys work at the server’s HTTPS address, or at localhost on the server itself.',
      {
        reason: 'passkeys-unavailable',
      },
    )
  return rp
}

const timeout = CHALLENGE_TTL

export type PasskeyView = {
  id: string
  name: string
  deviceType: 'singleDevice' | 'multiDevice'
  backedUp: boolean
  createdAt: number
  lastUsedAt: number | null
}

export function listPasskeys(ctx: Ctx, userId: string): PasskeyView[] {
  return ctx.db
    .select()
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, userId))
    .orderBy(schema.passkeys.createdAt)
    .all()
    .map(({ id, name, deviceType, backedUp, createdAt, lastUsedAt }) => ({
      id,
      name,
      deviceType,
      backedUp,
      createdAt,
      lastUsedAt,
    }))
}

/** Options for `startRegistration` in the browser, and the step's token to send back. */
export async function registrationOptions(
  ctx: Ctx,
  userId: string,
  meta: RequestMeta,
): Promise<{ challenge: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const rp = requireRelyingParty(ctx, meta.origin)
  const user = ctx.findUser(userId)
  if (!user) throw notFound('There’s no one with that id.')
  const existing = ctx.db
    .select({ id: schema.passkeys.id, transports: schema.passkeys.transports })
    .from(schema.passkeys)
    .where(eq(schema.passkeys.userId, userId))
    .all()
  const options = await generateRegistrationOptions({
    rpName: `highsea · ${ctx.serverName()}`,
    rpID: rp.rpID,
    userName: user.username,
    userDisplayName: user.displayName,
    userID: Buffer.from(user.webauthnId, 'base64url'),
    timeout,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ?? undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
  const { secret } = createChallenge<Ceremony>(ctx, 'passkey-register', {
    userId,
    data: { challenge: options.challenge, ...rp, device: null },
  })
  return { challenge: secret, options }
}

export async function register(
  ctx: Ctx,
  userId: string,
  input: { challenge: string; response: RegistrationResponseJSON; name?: string },
  meta: RequestMeta,
): Promise<PasskeyView> {
  const step = requireChallenge<Ceremony>(ctx, 'passkey-register', input.challenge)
  if (step.userId !== userId) throw new AppError('forbidden', 'That step belongs to someone else.')
  deleteChallenge(ctx, step.id)
  let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    result = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: step.data.challenge,
      expectedOrigin: step.data.origin,
      expectedRPID: step.data.rpID,
      requireUserVerification: true,
    })
  } catch (e) {
    throw new AppError('invalid', 'That passkey couldn’t be saved. Try again.', {
      reason: 'passkey-invalid',
      cause: (e as Error).message,
    })
  }
  if (!result.verified)
    throw new AppError('invalid', 'That passkey couldn’t be saved. Try again.', {
      reason: 'passkey-invalid',
    })
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo
  const now = ctx.now()
  const count = listPasskeys(ctx, userId).length
  const name = input.name?.trim() || `Passkey ${count + 1}`
  ctx.db
    .insert(schema.passkeys)
    .values({
      id: credential.id,
      userId,
      name,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      createdAt: now,
    })
    .run()
  const user = ctx.userView(userId)
  ctx.audit({
    action: 'passkey.add',
    actor: { id: userId, name: user.username },
    targetType: 'passkey',
    targetId: credential.id,
    address: meta.address,
    detail: { name },
  })
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
  return listPasskeys(ctx, userId).find((p) => p.id === credential.id) as PasskeyView
}

export function renamePasskey(ctx: Ctx, userId: string, id: string, name: string): PasskeyView {
  const trimmed = name.trim()
  if (!trimmed) throw new AppError('invalid', 'Give it a name.', { field: 'name' })
  const found = listPasskeys(ctx, userId).find((p) => p.id === id)
  if (!found) throw notFound('There’s no passkey with that id.')
  ctx.db
    .update(schema.passkeys)
    .set({ name: trimmed })
    .where(and(eq(schema.passkeys.id, id), eq(schema.passkeys.userId, userId)))
    .run()
  return { ...found, name: trimmed }
}

export function removePasskey(ctx: Ctx, userId: string, id: string, meta: RequestMeta) {
  const found = listPasskeys(ctx, userId).find((p) => p.id === id)
  if (!found) throw notFound('There’s no passkey with that id.')
  ctx.db
    .delete(schema.passkeys)
    .where(and(eq(schema.passkeys.id, id), eq(schema.passkeys.userId, userId)))
    .run()
  const user = ctx.userView(userId)
  ctx.audit({
    action: 'passkey.remove',
    actor: { id: userId, name: user.username },
    targetType: 'passkey',
    targetId: id,
    address: meta.address,
    detail: { name: found.name },
  })
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
}

/** Options for `startAuthentication`: no username, the browser offers the passkeys it has. */
export async function signInOptions(
  ctx: Ctx,
  meta: RequestMeta,
  device?: DeviceInput,
): Promise<{ challenge: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const rp = requireRelyingParty(ctx, meta.origin)
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    timeout,
    userVerification: 'required',
  })
  const { secret } = createChallenge<Ceremony>(ctx, 'passkey-sign-in', {
    data: { challenge: options.challenge, ...rp, device: device ?? null },
  })
  return { challenge: secret, options }
}

const refused = () =>
  new AppError('unauthorized', 'That passkey isn’t recognised on this server.', {
    reason: 'passkey-invalid',
  })

/** Verifies the browser's answer and signs in. A passkey skips the code step. */
export async function signIn(
  ctx: Ctx,
  input: { challenge: string; response: AuthenticationResponseJSON },
  meta: RequestMeta,
): Promise<Issued> {
  const step = requireChallenge<Ceremony>(ctx, 'passkey-sign-in', input.challenge)
  deleteChallenge(ctx, step.id)
  const row = ctx.db
    .select()
    .from(schema.passkeys)
    .where(eq(schema.passkeys.id, input.response.id))
    .get()
  if (!row) throw refused()
  const user = ctx.findUser(row.userId)
  // the user handle the authenticator returns has to be this account's (WebAuthn L3 § 7.2 step 6)
  if (
    !user ||
    user.invited ||
    (input.response.response.userHandle && input.response.response.userHandle !== user.webauthnId)
  )
    throw refused()
  let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    result = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: step.data.challenge,
      expectedOrigin: step.data.origin,
      expectedRPID: step.data.rpID,
      requireUserVerification: true,
      credential: {
        id: row.id,
        publicKey: Buffer.from(row.publicKey, 'base64url'),
        counter: row.counter,
        transports: row.transports ?? undefined,
      },
    })
  } catch {
    throw refused()
  }
  if (!result.verified) throw refused()
  ctx.db
    .update(schema.passkeys)
    .set({
      counter: result.authenticationInfo.newCounter,
      backedUp: result.authenticationInfo.credentialBackedUp,
      lastUsedAt: ctx.now(),
    })
    .where(eq(schema.passkeys.id, row.id))
    .run()
  return issueDevice(ctx, user.id, 'passkey', meta, step.data.device ?? undefined)
}
