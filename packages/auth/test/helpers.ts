// SPDX-License-Identifier: AGPL-3.0-only
import {
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  type ServerEvent,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase, writeSetting } from '@highsea-tv/db'
import {
  type AuthDeps,
  createAuth,
  defaultSecuritySettings,
  SECURITY_KEY,
  type SecuritySettings,
} from '../src/index.ts'
import { base32Decode, hotp, totpStep } from '../src/totp.ts'

export const meta = {
  address: '192.168.1.20',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/131.0',
}
export const tv = { name: 'Living room TV', client: 'tvos' as const, appVersion: '1.0.0' }

export function setup(overrides: Partial<AuthDeps> = {}, { fresh = false } = {}) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  let externalUrl: string | null = 'https://harbor.example.net'
  const auth = createAuth({
    db,
    clock,
    sealer: createSealer(generateSecretKey()),
    events,
    logger: silentLogger,
    version: '0.1.0',
    serverName: () => 'Harbor',
    addresses: () => ({ externalUrl, localOrigins: ['http://192.168.1.10:3000'] }),
    ...overrides,
  })
  // two-step is on for a new server (ADR 0032); the flows here sign in without it unless a test
  // turns it on
  if (!fresh)
    writeSetting(db, SECURITY_KEY, { ...defaultSecuritySettings, twoFactor: false }, clock.now())
  return {
    db,
    raw,
    clock,
    events,
    seen,
    auth,
    setExternalUrl: (url: string | null) => {
      externalUrl = url
    },
    security: (patch: Partial<SecuritySettings>) =>
      writeSetting(db, SECURITY_KEY, { ...defaultSecuritySettings, ...patch }, clock.now()),
  }
}

export const OWNER = { username: 'ines', displayName: 'Ines', password: 'correct horse battery' }

export async function withOwner(overrides: Partial<AuthDeps> = {}) {
  const env = setup(overrides)
  const owner = await env.auth.createOwner(OWNER, meta)
  return { ...env, owner, actor: { id: owner.id, name: owner.username } }
}

/** A code from an authenticator app holding `secret`, `offset` steps from now. */
export const codeFor = (secret: string, now: number, offset = 0) =>
  hotp(base32Decode(secret), totpStep(now) + offset)

/** Invites someone and accepts the invite with a password; returns their id. */
export async function addMember(
  env: Awaited<ReturnType<typeof withOwner>>,
  displayName: string,
  role: 'admin' | 'user' = 'user',
  password = 'a long enough password',
) {
  const invite = env.auth.users.invite(
    { displayName, email: null, role, libraries: 'all' },
    env.actor,
    meta,
  )
  const token = invite.link.split('/').pop() as string
  await env.auth.links.accept(token, { password }, meta)
  return env.auth.users.get(invite.user.id)
}
