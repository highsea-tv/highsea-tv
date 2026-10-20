// SPDX-License-Identifier: AGPL-3.0-only
// From the services' shapes (epoch milliseconds) to the contract's (ISO 8601 strings, the
// prototype's field names).
import type {
  ApiKey,
  AuditEntry,
  Device,
  Passkey,
  Session,
  SignInResult,
  User,
} from '@highsea/api-contract'
import type {
  ApiKeyView,
  AuditEntry as AuditRow,
  DeviceView,
  PasskeyView,
  SessionView,
  SignInOutcome,
  UserView,
} from '@highsea/auth'
import { iso } from '@highsea/core'

const isoOrNull = (ms: number | null) => (ms === null ? null : iso(ms))

export const userView = (u: UserView): User => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  permissions: u.permissions,
  libraries: u.libraries,
  twoFactor: u.twoFactor,
  passkeys: u.passkeys,
  hasPassword: u.hasPassword,
  email: u.email,
  lastSeen: isoOrNull(u.lastSeenAt),
  invited: u.invited,
  createdAt: iso(u.createdAt),
})

export const sessionView = (s: SessionView): Session => ({
  user: userView(s.user),
  deviceId: s.deviceId,
  expiresAt: isoOrNull(s.expiresAt),
  method: s.method,
})

export const deviceView = (d: DeviceView): Device => ({
  id: d.id,
  userId: d.userId,
  name: d.name,
  client: d.client,
  appVersion: d.appVersion,
  address: d.address,
  method: d.method,
  createdAt: iso(d.createdAt),
  lastSeen: iso(d.lastSeenAt),
  expiresAt: isoOrNull(d.expiresAt),
})

export const apiKeyView = (k: ApiKeyView): ApiKey => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  scope: k.scope,
  userId: k.userId,
  createdAt: iso(k.createdAt),
  lastUsed: isoOrNull(k.lastUsedAt),
})

export const passkeyView = (p: PasskeyView): Passkey => ({
  id: p.id,
  name: p.name,
  deviceType: p.deviceType,
  backedUp: p.backedUp,
  createdAt: iso(p.createdAt),
  lastUsed: isoOrNull(p.lastUsedAt),
})

export const auditView = (a: AuditRow): AuditEntry => ({ ...a, at: iso(a.at) })

/**
 * A sign-in result for the wire. An app's token goes in the body; the admin's session secret
 * never does: the caller sets it as the cookie.
 */
export function signInView(out: SignInOutcome, app: boolean): SignInResult {
  if (out.status !== 'signed-in') return out
  return {
    status: 'signed-in',
    session: sessionView(out.session),
    ...(app ? { token: out.secret } : {}),
    ...(out.recoveryCodes ? { recoveryCodes: out.recoveryCodes } : {}),
  }
}
