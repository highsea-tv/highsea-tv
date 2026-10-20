// SPDX-License-Identifier: AGPL-3.0-only
// People and access (ADR 0023, 0024, 0025): accounts, sign-in by password, code, passkey, single
// sign-on, proxy header or TV pairing, sessions and device tokens, API keys and the audit log.
// Framework-free: the server's HTTP layer maps requests onto it.
import * as accounts from './accounts.ts'
import * as keys from './api-keys.ts'
import { type AuthDeps, createContext, listAudit, type RequestMeta } from './context.ts'
import { createOidc, oidcOffered } from './oidc.ts'
import { createPairing } from './pairing.ts'
import * as passkeys from './passkeys.ts'
import { authenticateProxy } from './proxy-auth.ts'
import * as security from './security.ts'
import * as sessions from './sessions.ts'
import { createSignIn } from './sign-in.ts'
import * as twoFactor from './two-factor.ts'

export {
  type Invite,
  type InviteInput,
  LINK_TTL,
  type LinkInfo,
  USERNAME,
  type UserPatch,
} from './accounts.ts'
export type { ApiKeyScope, ApiKeyView } from './api-keys.ts'
export * from './context.ts'
export { CALLBACK_PATH } from './oidc.ts'
export {
  PAIRING_INTERVAL,
  PAIRING_TTL,
  type Pairing,
  type PairingRequest,
  type PollResult,
} from './pairing.ts'
export type { PasskeyView, RelyingParty } from './passkeys.ts'
export { ARGON2, hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from './passwords.ts'
export { createRateLimiter, LIMITS } from './rate-limit.ts'
export { ALL_LIBRARIES, canManageUsers, isStaff, LIBRARIES, may, ROLE_DEFAULTS } from './roles.ts'
export { newCode, newSecret, normalizeCode, verifier } from './secrets.ts'
export type { SecurityInput, SecurityView } from './security.ts'
export {
  type DeviceView,
  type Issued,
  issueDevice,
  type Principal,
  SECRET_PREFIX,
  sessionFor,
} from './sessions.ts'
export {
  defaultSecuritySettings,
  SECURITY_KEY,
  SESSION_DAYS,
  type SecuritySettings,
} from './settings.ts'
export { CODE_ATTEMPTS, type SignInOutcome } from './sign-in.ts'
export { base32Decode, hotp, otpauthUri, totpStep, verifyTotp } from './totp.ts'

export type Auth = ReturnType<typeof createAuth>

export function createAuth(deps: AuthDeps) {
  const ctx = createContext(deps)
  const signIn = createSignIn(ctx)
  const oidc = createOidc(ctx)
  const pairing = createPairing(ctx)

  return {
    ctx,

    /** What the sign-in screen offers, for `GET /system/info/public`. */
    methods(origin?: string) {
      return {
        local: true,
        oidc: oidcOffered(ctx),
        passkeys: passkeys.relyingParty(ctx, origin) !== null,
      }
    },

    /**
     * The person behind a request: a session cookie, a bearer token (device token or API key), or
     * a forward-auth proxy's header. Null when none of them holds.
     */
    authenticate(input: {
      secret: string | null
      headers: { get(name: string): string | null | undefined }
      fromTrustedProxy: boolean
      meta?: RequestMeta
    }): sessions.Principal | null {
      if (input.secret)
        return (
          sessions.authenticateDevice(ctx, input.secret, input.meta) ??
          keys.authenticateApiKey(ctx, input.secret)
        )
      return authenticateProxy(ctx, input.headers, input.fromTrustedProxy)
    },

    hasOwner: () => accounts.hasOwner(ctx),
    createOwner: (input: Parameters<typeof accounts.createOwner>[1], meta: RequestMeta) =>
      accounts.createOwner(ctx, input, meta),
    /** Signs the owner in at the end of setup. */
    signInAfterSetup: (userId: string, meta: RequestMeta) =>
      sessions.issueDevice(ctx, userId, 'setup', meta),

    signIn,
    oidc,
    pairing,

    passkeys: {
      relyingParty: (origin?: string) => passkeys.relyingParty(ctx, origin),
      list: (userId: string) => passkeys.listPasskeys(ctx, userId),
      registrationOptions: (userId: string, meta: RequestMeta) =>
        passkeys.registrationOptions(ctx, userId, meta),
      register: (
        userId: string,
        input: Parameters<typeof passkeys.register>[2],
        meta: RequestMeta,
      ) => passkeys.register(ctx, userId, input, meta),
      rename: (userId: string, id: string, name: string) =>
        passkeys.renamePasskey(ctx, userId, id, name),
      remove: (userId: string, id: string, meta: RequestMeta) =>
        passkeys.removePasskey(ctx, userId, id, meta),
      signInOptions: (meta: RequestMeta, device?: Parameters<typeof passkeys.signInOptions>[2]) =>
        passkeys.signInOptions(ctx, meta, device),
      signIn: (input: Parameters<typeof passkeys.signIn>[1], meta: RequestMeta) =>
        passkeys.signIn(ctx, input, meta),
    },

    twoFactor: {
      status: (userId: string) => ({
        enabled: twoFactor.totpEnabled(ctx, userId),
        recoveryCodesLeft: twoFactor.recoveryCodesLeft(ctx, userId),
        required: twoFactor.twoFactorRequired(ctx, ctx.userView(userId).role),
      }),
      start: async (userId: string, password: string) => {
        await accounts.confirmPassword(ctx, userId, password)
        return twoFactor.startTotp(ctx, userId)
      },
      enable: (userId: string, code: string, meta: RequestMeta) =>
        twoFactor.enableTotp(ctx, userId, code, meta),
      disable: (userId: string, password: string, meta: RequestMeta) =>
        twoFactor.disableTotp(ctx, userId, password, meta),
      recoveryCodes: (userId: string, password: string) =>
        twoFactor.newRecoveryCodes(ctx, userId, password),
      required: (userId: string) => twoFactor.twoFactorRequired(ctx, ctx.userView(userId).role),
    },

    users: {
      list: () => ctx.userViews(),
      get: (id: string) => ctx.userView(id),
      invite: (input: accounts.InviteInput, actor: accounts.Actor, meta: RequestMeta) =>
        accounts.invite(ctx, input, actor, meta),
      inviteLink: (id: string, actor: accounts.Actor) => accounts.inviteLink(ctx, id, actor),
      resetLink: (id: string, actor: accounts.Actor, meta: RequestMeta) =>
        accounts.resetLink(ctx, id, actor, meta),
      update: (id: string, patch: accounts.UserPatch, actor: accounts.Actor, meta: RequestMeta) =>
        accounts.updateUser(ctx, id, patch, actor, meta),
      remove: (id: string, actor: accounts.Actor, meta: RequestMeta) =>
        accounts.removeUser(ctx, id, actor, meta),
      resetTwoFactor: (id: string, actor: accounts.Actor, meta: RequestMeta) =>
        twoFactor.resetTotp(ctx, id, actor, meta),
    },

    links: {
      info: (token: string) => accounts.linkInfo(ctx, token),
      accept: async (
        token: string,
        input: { password: string; username?: string },
        meta: RequestMeta,
      ) => {
        const { userId, kind } = await accounts.acceptLink(ctx, token, input, meta)
        // using the link signs you in, as setup does
        return {
          kind,
          ...sessions.issueDevice(ctx, userId, kind === 'invite' ? 'invite' : 'password', meta),
        }
      },
    },

    me: {
      update: (userId: string, input: { displayName?: string; email?: string | null }) =>
        accounts.updateProfile(ctx, userId, input),
      changePassword: (
        userId: string,
        input: { current: string | null; password: string },
        deviceId: string | null,
        meta: RequestMeta,
      ) => accounts.changePassword(ctx, userId, input, deviceId, meta),
    },

    devices: {
      list: (userId?: string) => sessions.listDevices(ctx, userId),
      find: (id: string) => sessions.findDevice(ctx, id),
      revoke: (id: string, actor: accounts.Actor, meta: RequestMeta) =>
        sessions.revokeDevice(ctx, id, actor, meta),
    },

    apiKeys: {
      list: (actor: accounts.Actor) => keys.listApiKeys(ctx, actor),
      create: (
        input: { name: string; scope: keys.ApiKeyScope },
        actor: accounts.Actor,
        meta: RequestMeta,
      ) => keys.createApiKey(ctx, input, actor, meta),
      revoke: (id: string, actor: accounts.Actor, meta: RequestMeta) =>
        keys.revokeApiKey(ctx, id, actor, meta),
    },

    security: {
      get: () => security.securityView(ctx),
      save: (input: security.SecurityInput, actor: accounts.Actor, meta: RequestMeta) =>
        security.saveSecurity(ctx, input, actor, meta),
    },

    audit: (query: { cursor?: string; limit?: number }) => listAudit(ctx, query),
  }
}
