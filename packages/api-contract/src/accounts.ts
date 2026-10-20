// SPDX-License-Identifier: AGPL-3.0-only
// People and access (login.md, users-devices.md, connectivity.md): signing in by password, code,
// passkey, single sign-on or TV pairing; invites and resets; your own account; people, devices,
// API keys and the audit log. The shapes start from the prototype's draft types.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IdParam, IsoDate, json, noContent } from './common.ts'

// ---------------------------------------------------------------- shapes

export const Role = z.enum(['owner', 'admin', 'member', 'restricted']).openapi('Role')
export const Permission = z
  .enum(['request', 'autoApprove', 'download', 'manageLibrary', 'manageUsers', 'admin'])
  .openapi('Permission')
export const ClientType = z
  .enum(['admin', 'web', 'desktop', 'ios', 'android', 'tvos', 'androidtv', 'webos', 'tizen'])
  .openapi('ClientType')
export const SignInMethod = z
  .enum(['password', 'passkey', 'oidc', 'proxy', 'pairing', 'setup', 'invite'])
  .openapi('SignInMethod')
export const Libraries = z
  .union([z.literal('all'), z.array(z.string())])
  .openapi('Libraries', { description: 'Every library, now and later, or the listed ones' })

export const User = z
  .object({
    id: z.string(),
    username: z.string().openapi({ example: 'ines' }),
    displayName: z.string().openapi({ example: 'Ines' }),
    role: Role,
    permissions: z.array(Permission),
    libraries: Libraries,
    twoFactor: z.boolean(),
    passkeys: z.number().int(),
    hasPassword: z.boolean(),
    email: z.string().nullable(),
    lastSeen: IsoDate.nullable(),
    /** Pending until the invite is accepted. */
    invited: z.boolean(),
    createdAt: IsoDate,
  })
  .openapi('User')

export const Session = z
  .object({
    user: User,
    /** The device this sign-in is; null when a forward-auth proxy vouched for the request. */
    deviceId: z.string().nullable(),
    /** When an admin session ends; null for an app's token. */
    expiresAt: IsoDate.nullable(),
    method: SignInMethod,
  })
  .openapi('Session')

export const DeviceInput = z
  .object({
    name: z.string().min(1).max(100).openapi({ example: 'Living room TV' }),
    client: ClientType.exclude(['admin']),
    appVersion: z.string().min(1).max(40).openapi({ example: '1.0.0' }),
  })
  .openapi('DeviceInput', {
    description: 'Sent by apps: the sign-in returns a device token instead of setting a cookie',
  })

export const SignInResult = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('signed-in'),
      session: Session,
      /** An app's device token, sent once. The admin gets a cookie instead. */
      token: z.string().optional(),
      /** After enrolling in two-step verification during sign-in: shown once. */
      recoveryCodes: z.array(z.string()).optional(),
    }),
    z.object({ status: z.literal('two-factor'), challenge: z.string() }),
    z.object({
      status: z.literal('two-factor-setup'),
      challenge: z.string(),
      /** The base32 seed, for typing into an authenticator app. */
      secret: z.string(),
      /** The otpauth:// URI the QR code carries. */
      uri: z.string(),
    }),
  ])
  .openapi('SignInResult')

export const Device = z
  .object({
    id: z.string(),
    userId: z.string(),
    name: z.string(),
    client: ClientType,
    appVersion: z.string(),
    address: z.string(),
    method: SignInMethod,
    createdAt: IsoDate,
    lastSeen: IsoDate,
    expiresAt: IsoDate.nullable(),
  })
  .openapi('Device')

export const InviteInput = z
  .object({
    displayName: z.string().max(100),
    email: z.string().max(254).nullable(),
    role: Role.exclude(['owner']),
    libraries: Libraries,
  })
  .openapi('InviteInput')

export const AccountLink = z
  .object({ link: z.string(), expiresAt: IsoDate })
  .openapi('AccountLink', { description: 'A single-use link: an invite or a password reset' })

export const Invite = z
  .object({ user: User, link: z.string(), expiresAt: IsoDate })
  .openapi('Invite')

export const UserPatch = z
  .object({
    role: Role.exclude(['owner']).optional(),
    permissions: z.array(Permission).optional(),
    libraries: Libraries.optional(),
    displayName: z.string().max(100).optional(),
  })
  .openapi('UserPatch')

export const LinkInfo = z
  .object({
    kind: z.enum(['invite', 'reset']),
    username: z.string(),
    displayName: z.string(),
    serverName: z.string(),
    expiresAt: IsoDate,
  })
  .openapi('LinkInfo')

export const ApiKeyScope = z.enum(['read', 'full']).openapi('ApiKeyScope')

export const ApiKey = z
  .object({
    id: z.string(),
    name: z.string(),
    prefix: z.string().openapi({ example: 'hs_7Kq2' }),
    scope: ApiKeyScope,
    userId: z.string(),
    createdAt: IsoDate,
    lastUsed: IsoDate.nullable(),
  })
  .openapi('ApiKey')

export const CreatedApiKey = ApiKey.extend({ secret: z.string() }).openapi('CreatedApiKey')

export const Passkey = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Synced across devices (a password manager or iCloud Keychain) or kept on one. */
    deviceType: z.enum(['singleDevice', 'multiDevice']),
    backedUp: z.boolean(),
    createdAt: IsoDate,
    lastUsed: IsoDate.nullable(),
  })
  .openapi('Passkey')

export const TwoFactorStatus = z
  .object({ enabled: z.boolean(), required: z.boolean(), recoveryCodesLeft: z.number().int() })
  .openapi('TwoFactorStatus')

export const RecoveryCodes = z
  .object({ recoveryCodes: z.array(z.string()) })
  .openapi('RecoveryCodes')

/** WebAuthn options and responses are SimpleWebAuthn's JSON shapes, passed through. */
const WebAuthnJson = z.record(z.string(), z.unknown()).openapi({ type: 'object' })

export const WebAuthnOptions = z
  .object({ challenge: z.string(), options: WebAuthnJson })
  .openapi('WebAuthnOptions', {
    description:
      'Pass `options` to @simplewebauthn/browser, then send `challenge` back with its result',
  })

export const Pairing = z
  .object({
    code: z.string().openapi({ example: 'KQ7-4PM' }),
    /** The TV's own secret to poll with (RFC 8628's device code); never shown. */
    pollToken: z.string(),
    url: z.string().openapi({ example: 'https://harbor.example.net/link?code=KQ7-4PM' }),
    expiresAt: IsoDate,
    /** Seconds between polls. */
    interval: z.number().int(),
  })
  .openapi('Pairing')

export const PairingRequest = z
  .object({ device: DeviceInput, address: z.string(), expiresAt: IsoDate })
  .openapi('PairingRequest')

export const PairingPoll = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('pending') }),
    z.object({ status: z.literal('signed-in'), session: Session, token: z.string() }),
  ])
  .openapi('PairingPoll')

export const AuditEntry = z
  .object({
    id: z.string(),
    at: IsoDate,
    action: z.string().openapi({ example: 'auth.sign-in' }),
    actorId: z.string().nullable(),
    actorName: z.string().nullable(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    address: z.string().nullable(),
    detail: z.unknown(),
  })
  .openapi('AuditEntry')

export const AuditPage = z
  .object({ items: z.array(AuditEntry), next: z.string().nullable() })
  .openapi('AuditPage')

const CodeParam = z.object({ code: z.string().openapi({ param: { name: 'code', in: 'path' } }) })
const TokenParam = z.object({ token: z.string().openapi({ param: { name: 'token', in: 'path' } }) })
const Password = z.string().max(256)

// ---------------------------------------------------------------- routes

const AUTH = `${API_PREFIX}/auth`

export const auth = {
  signIn: createRoute({
    method: 'post',
    path: `${AUTH}/sign-in`,
    tags: ['Auth'],
    summary: 'Sign in with a username and password',
    description:
      'The admin gets an HTTP-only session cookie. An app sends `device` and gets a device token instead. Errors: 401 `invalid-credentials`, 429 `rate-limited`.',
    ...access('public'),
    request: {
      ...body(
        z.object({
          username: z.string().max(64),
          password: Password,
          device: DeviceInput.optional(),
        }),
      ),
    },
    responses: {
      200: json(SignInResult, 'Signed in, or the next step'),
      ...errors('invalid', 'unauthorized', 'rate-limited'),
    },
  }),
  twoFactor: createRoute({
    method: 'post',
    path: `${AUTH}/two-factor`,
    tags: ['Auth'],
    summary: 'The code step: a code from the app, or a recovery code',
    ...access('public'),
    request: { ...body(z.object({ challenge: z.string(), code: z.string().max(32) })) },
    responses: {
      200: json(SignInResult, 'Signed in'),
      ...errors('invalid', 'unauthorized', 'rate-limited'),
    },
  }),
  signOut: createRoute({
    method: 'post',
    path: `${AUTH}/sign-out`,
    tags: ['Auth'],
    summary: 'Sign this device out',
    ...access('user'),
    responses: { ...noContent, ...errors('unauthorized') },
  }),
  session: createRoute({
    method: 'get',
    path: `${AUTH}/session`,
    tags: ['Auth'],
    summary: 'Who’s signed in',
    ...access('user'),
    responses: { 200: json(Session, 'The session'), ...errors('unauthorized') },
  }),
  passkeyOptions: createRoute({
    method: 'post',
    path: `${AUTH}/passkeys/options`,
    tags: ['Auth'],
    summary: 'Start signing in with a passkey',
    description:
      'Passkeys work at the server’s HTTPS address and at localhost. Error: 403 `passkeys-unavailable`.',
    ...access('public'),
    request: { ...body(z.object({ device: DeviceInput.optional() })) },
    responses: { 200: json(WebAuthnOptions, 'Options for the browser'), ...errors('forbidden') },
  }),
  passkeySignIn: createRoute({
    method: 'post',
    path: `${AUTH}/passkeys/verify`,
    tags: ['Auth'],
    summary: 'Finish signing in with a passkey',
    ...access('public'),
    request: { ...body(z.object({ challenge: z.string(), response: WebAuthnJson })) },
    responses: { 200: json(SignInResult, 'Signed in'), ...errors('invalid', 'unauthorized') },
  }),
  oidcStart: createRoute({
    method: 'get',
    path: `${AUTH}/oidc/start`,
    tags: ['Auth'],
    summary: 'Sign in with the single sign-on provider',
    description:
      'Redirects to the provider. With `invite`, the provider identity is linked to that invite’s account.',
    ...access('public'),
    request: { query: z.object({ invite: z.string().optional() }) },
    responses: { 302: { description: 'To the provider' }, ...errors('forbidden', 'unavailable') },
  }),
  oidcCallback: createRoute({
    method: 'get',
    path: `${AUTH}/oidc/callback`,
    tags: ['Auth'],
    summary: 'Where the provider sends people back',
    description:
      'Sets the session cookie and redirects to the admin, or to /login with `?error=` and the reason.',
    ...access('public'),
    request: {
      query: z.object({ state: z.string().optional(), code: z.string().optional() }).passthrough(),
    },
    responses: { 302: { description: 'To the admin, or back to sign-in' } },
  }),
  startPairing: createRoute({
    method: 'post',
    path: `${AUTH}/pairing`,
    tags: ['Auth'],
    summary: 'A TV asks for a sign-in code',
    ...access('public'),
    request: { ...body(z.object({ device: DeviceInput })) },
    responses: {
      200: json(Pairing, 'The code to show, and the poll token to keep'),
      ...errors('invalid'),
    },
  }),
  pollPairing: createRoute({
    method: 'post',
    path: `${AUTH}/pairing/poll`,
    tags: ['Auth'],
    summary: 'The TV asks whether its code was approved',
    description:
      'Poll every `interval` seconds. Once approved, the device token comes back once. Error: 404 `pairing-expired`.',
    ...access('public'),
    request: { ...body(z.object({ pollToken: z.string() })) },
    responses: { 200: json(PairingPoll, 'Pending, or signed in'), ...errors('not-found') },
  }),
  pairingRequest: createRoute({
    method: 'get',
    path: `${AUTH}/pairing/{code}`,
    tags: ['Auth'],
    summary: 'What a code would sign in, for the approving device',
    ...access('user'),
    request: { params: CodeParam },
    responses: {
      200: json(PairingRequest, 'The waiting device'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
  approvePairing: createRoute({
    method: 'post',
    path: `${AUTH}/pairing/{code}/approve`,
    tags: ['Auth'],
    summary: 'Approve a code: the TV signs in as you',
    ...access('user'),
    request: { params: CodeParam },
    responses: { 200: json(PairingRequest, 'Approved'), ...errors('unauthorized', 'not-found') },
  }),
} as const

export const links = {
  get: createRoute({
    method: 'get',
    path: `${API_PREFIX}/links/{token}`,
    tags: ['Auth'],
    summary: 'What an invite or reset link is for',
    ...access('public'),
    request: { params: TokenParam },
    responses: { 200: json(LinkInfo, 'The link'), ...errors('not-found') },
  }),
  accept: createRoute({
    method: 'post',
    path: `${API_PREFIX}/links/{token}/accept`,
    tags: ['Auth'],
    summary: 'Use an invite or reset link: choose a password and sign in',
    ...access('public'),
    request: {
      params: TokenParam,
      ...body(z.object({ password: Password, username: z.string().max(32).optional() })),
    },
    responses: {
      200: json(SignInResult, 'Signed in'),
      ...errors('invalid', 'not-found', 'conflict'),
    },
  }),
} as const

const ME = `${API_PREFIX}/me`

export const me = {
  update: createRoute({
    method: 'patch',
    path: ME,
    tags: ['Me'],
    summary: 'Change your name or email',
    ...access('user'),
    request: {
      ...body(
        z.object({
          displayName: z.string().max(100).optional(),
          email: z.string().max(254).nullable().optional(),
        }),
      ),
    },
    responses: { 200: json(User, 'You'), ...errors('invalid', 'unauthorized') },
  }),
  changePassword: createRoute({
    method: 'post',
    path: `${ME}/password`,
    tags: ['Me'],
    summary: 'Change your password',
    description: 'Your other admin sessions are signed out; apps stay signed in.',
    ...access('user'),
    request: { ...body(z.object({ current: Password.nullable(), password: Password })) },
    responses: { ...noContent, ...errors('invalid', 'unauthorized') },
  }),
  twoFactor: createRoute({
    method: 'get',
    path: `${ME}/two-factor`,
    tags: ['Me'],
    summary: 'Your two-step verification',
    ...access('user'),
    responses: { 200: json(TwoFactorStatus, 'Status'), ...errors('unauthorized') },
  }),
  startTwoFactor: createRoute({
    method: 'post',
    path: `${ME}/two-factor/setup`,
    tags: ['Me'],
    summary: 'Start setting up an authenticator app',
    ...access('user'),
    request: { ...body(z.object({ password: Password })) },
    responses: {
      200: json(
        z.object({ secret: z.string(), uri: z.string() }).openapi('TotpSetup'),
        'The seed and its URI',
      ),
      ...errors('unauthorized', 'conflict'),
    },
  }),
  enableTwoFactor: createRoute({
    method: 'post',
    path: `${ME}/two-factor/enable`,
    tags: ['Me'],
    summary: 'Confirm with a code from the app; returns recovery codes, once',
    ...access('user'),
    request: { ...body(z.object({ code: z.string().max(16) })) },
    responses: { 200: json(RecoveryCodes, 'On'), ...errors('unauthorized', 'conflict') },
  }),
  disableTwoFactor: createRoute({
    method: 'post',
    path: `${ME}/two-factor/disable`,
    tags: ['Me'],
    summary: 'Turn two-step verification off',
    ...access('user'),
    request: { ...body(z.object({ password: Password })) },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden') },
  }),
  recoveryCodes: createRoute({
    method: 'post',
    path: `${ME}/two-factor/recovery-codes`,
    tags: ['Me'],
    summary: 'New recovery codes; the old ones stop working',
    ...access('user'),
    request: { ...body(z.object({ password: Password })) },
    responses: { 200: json(RecoveryCodes, 'The new codes'), ...errors('unauthorized', 'conflict') },
  }),
  passkeys: createRoute({
    method: 'get',
    path: `${ME}/passkeys`,
    tags: ['Me'],
    summary: 'Your passkeys',
    ...access('user'),
    responses: { 200: json(z.array(Passkey), 'Passkeys'), ...errors('unauthorized') },
  }),
  passkeyOptions: createRoute({
    method: 'post',
    path: `${ME}/passkeys/options`,
    tags: ['Me'],
    summary: 'Start adding a passkey',
    ...access('user'),
    responses: {
      200: json(WebAuthnOptions, 'Options for the browser'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  addPasskey: createRoute({
    method: 'post',
    path: `${ME}/passkeys`,
    tags: ['Me'],
    summary: 'Finish adding a passkey',
    ...access('user'),
    request: {
      ...body(
        z.object({
          challenge: z.string(),
          response: WebAuthnJson,
          name: z.string().max(60).optional(),
        }),
      ),
    },
    responses: { 200: json(Passkey, 'Added'), ...errors('invalid', 'unauthorized') },
  }),
  renamePasskey: createRoute({
    method: 'patch',
    path: `${ME}/passkeys/{id}`,
    tags: ['Me'],
    summary: 'Rename a passkey',
    ...access('user'),
    request: { params: IdParam, ...body(z.object({ name: z.string().max(60) })) },
    responses: { 200: json(Passkey, 'Renamed'), ...errors('invalid', 'unauthorized', 'not-found') },
  }),
  removePasskey: createRoute({
    method: 'delete',
    path: `${ME}/passkeys/{id}`,
    tags: ['Me'],
    summary: 'Remove a passkey',
    ...access('user'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
  devices: createRoute({
    method: 'get',
    path: `${ME}/devices`,
    tags: ['Me'],
    summary: 'Where you’re signed in',
    ...access('user'),
    responses: { 200: json(z.array(Device), 'Your devices'), ...errors('unauthorized') },
  }),
} as const

export const users = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/users`,
    tags: ['Users'],
    summary: 'Everyone on the server',
    ...access('people'),
    responses: { 200: json(z.array(User), 'People'), ...errors('unauthorized', 'forbidden') },
  }),
  invite: createRoute({
    method: 'post',
    path: `${API_PREFIX}/users/invites`,
    tags: ['Users'],
    summary: 'Invite someone: a pending account and a single-use link',
    ...access('people'),
    request: { ...body(InviteInput) },
    responses: {
      200: json(Invite, 'The invite'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: `${API_PREFIX}/users/{id}`,
    tags: ['Users'],
    summary: 'Change someone’s role, permissions or libraries',
    description: 'Changing the role resets the permissions to its defaults.',
    ...access('people'),
    request: { params: IdParam, ...body(UserPatch) },
    responses: {
      200: json(User, 'Updated'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/users/{id}`,
    tags: ['Users'],
    summary: 'Remove someone, or cancel an invite',
    ...access('people'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  resetPassword: createRoute({
    method: 'post',
    path: `${API_PREFIX}/users/{id}/password-reset`,
    tags: ['Users'],
    summary: 'A password-reset link to pass on',
    description: 'Until email is set up, the owner copies the link and sends it themselves.',
    ...access('people'),
    request: { params: IdParam },
    responses: {
      200: json(AccountLink, 'The link'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  resetTwoFactor: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/users/{id}/two-factor`,
    tags: ['Users'],
    summary: 'Turn someone’s two-step verification off, when they’ve lost the app and their codes',
    description:
      'Confirm who’s asking before you do this. Their passkeys and signed-in devices stay. Only the owner can do it for an admin, nobody can for the owner, and your own goes through `/me/two-factor`. Errors: 403 `self`; 409 when it’s already off.',
    ...access('people'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found', 'conflict') },
  }),
  inviteLink: createRoute({
    method: 'post',
    path: `${API_PREFIX}/users/{id}/invite-link`,
    tags: ['Users'],
    summary: 'A pending invite’s link, to copy again',
    ...access('people'),
    request: { params: IdParam },
    responses: {
      200: json(AccountLink, 'The link'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
} as const

export const devices = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/devices`,
    tags: ['Devices'],
    summary: 'Every signed-in device, or one person’s',
    ...access('staff'),
    request: { query: z.object({ userId: z.string().optional() }) },
    responses: { 200: json(z.array(Device), 'Devices'), ...errors('unauthorized', 'forbidden') },
  }),
  revoke: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/devices/{id}`,
    tags: ['Devices'],
    summary: 'Sign a device out; its token stops working at once',
    description:
      'Your own devices, or anyone’s for staff. Not the browser you’re using: sign out instead.',
    ...access('user'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
} as const

export const apiKeys = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/api-keys`,
    tags: ['API keys'],
    summary: 'API keys, by prefix',
    ...access('staff'),
    responses: { 200: json(z.array(ApiKey), 'Keys'), ...errors('unauthorized', 'forbidden') },
  }),
  create: createRoute({
    method: 'post',
    path: `${API_PREFIX}/api-keys`,
    tags: ['API keys'],
    summary: 'Make a key; the secret shows once',
    ...access('staff'),
    request: { ...body(z.object({ name: z.string().max(60), scope: ApiKeyScope })) },
    responses: {
      200: json(CreatedApiKey, 'The key and its secret'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  revoke: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/api-keys/{id}`,
    tags: ['API keys'],
    summary: 'Revoke a key',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
} as const

export const audit = {
  list: createRoute({
    method: 'get',
    path: `${API_PREFIX}/audit`,
    tags: ['Audit'],
    summary: 'Who did what, newest first',
    ...access('staff'),
    request: {
      query: z.object({
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }),
    },
    responses: {
      200: json(AuditPage, 'A page of entries'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
} as const

export type User = z.infer<typeof User>
export type Session = z.infer<typeof Session>
export type SignInResult = z.infer<typeof SignInResult>
export type Device = z.infer<typeof Device>
export type ApiKey = z.infer<typeof ApiKey>
export type Passkey = z.infer<typeof Passkey>
export type Pairing = z.infer<typeof Pairing>
export type AuditEntry = z.infer<typeof AuditEntry>
