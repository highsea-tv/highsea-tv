// SPDX-License-Identifier: AGPL-3.0-only
// People and access (ADR 0023): accounts, roles and permissions, library access, every signed-in
// device, API keys, the second factors, single sign-on links, short-lived challenges and the
// audit log. Secrets are stored as SHA-256 verifiers or sealed with the server's key, never plain.
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const ROLES = ['owner', 'admin', 'member', 'restricted'] as const
export type Role = (typeof ROLES)[number]

export const PERMISSIONS = [
  'request',
  'autoApprove',
  'download',
  'manageLibrary',
  'manageUsers',
  'admin',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const CLIENT_TYPES = [
  'admin',
  'web',
  'desktop',
  'ios',
  'android',
  'tvos',
  'androidtv',
  'webos',
  'tizen',
] as const
export type ClientType = (typeof CLIENT_TYPES)[number]

export const SIGN_IN_METHODS = [
  'password',
  'passkey',
  'oidc',
  'proxy',
  'pairing',
  'setup',
  'invite',
] as const
export type SignInMethod = (typeof SIGN_IN_METHODS)[number]

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role', { enum: ROLES }).notNull(),
    /** A PHC string (`$argon2id$…`); null until an invite is accepted, or for single sign-on only. */
    passwordHash: text('password_hash'),
    email: text('email'),
    /** Pending until the invite is accepted. */
    invited: integer('invited', { mode: 'boolean' }).notNull().default(false),
    /** The WebAuthn user handle: random, never the user id (WebAuthn L3 § 14.6.1). */
    webauthnId: text('webauthn_id').notNull(),
    lastSeenAt: integer('last_seen_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('users_username').on(t.username), index('users_role').on(t.role)],
)

export const userPermissions = sqliteTable(
  'user_permissions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: text('permission', { enum: PERMISSIONS }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permission] })],
)

/** `*` grants every library, now and later; otherwise one row per library. */
export const libraryAccess = sqliteTable(
  'library_access',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    library: text('library').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.library] })],
)

/** Single-use links: an invite, or a password reset the owner hands over. */
export const accountLinks = sqliteTable(
  'account_links',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: ['invite', 'reset'] }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    /** Sealed, so the owner can copy the link again. */
    tokenSealed: text('token_sealed').notNull(),
    createdBy: text('created_by'),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('account_links_token').on(t.tokenHash),
    index('account_links_user').on(t.userId),
  ],
)

/**
 * Everything signed in: the admin in a browser (a cookie session that expires) and each app (a
 * bearer token, until it's signed out). Only a SHA-256 verifier of the secret is stored.
 */
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['session', 'token'] }).notNull(),
    tokenHash: text('token_hash').notNull(),
    name: text('name').notNull(),
    client: text('client', { enum: CLIENT_TYPES }).notNull(),
    appVersion: text('app_version').notNull(),
    address: text('address').notNull(),
    method: text('method', { enum: SIGN_IN_METHODS }).notNull(),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    /** Sessions only; tokens last until revoked. */
    expiresAt: integer('expires_at'),
  },
  (t) => [
    uniqueIndex('devices_token').on(t.tokenHash),
    index('devices_user').on(t.userId, t.lastSeenAt),
  ],
)

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** The first characters, to tell keys apart (`hs_7Kq2`). */
    prefix: text('prefix').notNull(),
    secretHash: text('secret_hash').notNull(),
    scope: text('scope', { enum: ['read', 'full'] }).notNull(),
    /** The key acts for this person, no further than an admin. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
  },
  (t) => [uniqueIndex('api_keys_secret').on(t.secretHash)],
)

/** TOTP (RFC 6238). Pending until the first code confirms it. */
export const totp = sqliteTable('totp', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretSealed: text('secret_sealed').notNull(),
  enabledAt: integer('enabled_at'),
  /** The last time step accepted: a code is never accepted twice. */
  lastStep: integer('last_step').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: integer('used_at'),
  },
  (t) => [index('recovery_codes_user').on(t.userId)],
)

/** WebAuthn credentials, as SimpleWebAuthn's docs list what to keep. */
export const passkeys = sqliteTable(
  'passkeys',
  {
    /** The credential id, base64url. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The COSE public key, base64url. */
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull(),
    transports: text('transports', { mode: 'json' }).$type<string[]>(),
    deviceType: text('device_type', { enum: ['singleDevice', 'multiDevice'] }).notNull(),
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull(),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
  },
  (t) => [index('passkeys_user').on(t.userId)],
)

/** A single sign-on identity (the provider's issuer and subject) linked to an account. */
export const oidcIdentities = sqliteTable(
  'oidc_identities',
  {
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.issuer, t.subject] }), index('oidc_user').on(t.userId)],
)

export const CHALLENGE_KINDS = [
  'two-factor',
  'two-factor-setup',
  'passkey-sign-in',
  'passkey-register',
  'oidc',
  'pairing',
] as const
export type ChallengeKind = (typeof CHALLENGE_KINDS)[number]

/**
 * A step between two requests: the code step after a password, a WebAuthn challenge, an OIDC
 * round trip, a TV waiting for approval. Each is single use and expires within minutes.
 */
export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    /** A SHA-256 verifier of the secret the caller holds (or of the pairing code). */
    id: text('id').primaryKey(),
    kind: text('kind', { enum: CHALLENGE_KINDS }).notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    data: text('data', { mode: 'json' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('auth_challenges_expiry').on(t.expiresAt)],
)

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    /**
     * The order entries were written in. `at` can tie within a millisecond and ids are random, so
     * the log pages by this (SQLite's rowid isn't stable across VACUUM: sqlite.org/lang_vacuum.html).
     */
    seq: integer('seq').notNull(),
    at: integer('at').notNull(),
    action: text('action').notNull(),
    /** Who did it; null for an anonymous attempt. */
    actorId: text('actor_id'),
    actorName: text('actor_name'),
    targetType: text('target_type'),
    targetId: text('target_id'),
    address: text('address'),
    detail: text('detail', { mode: 'json' }),
  },
  (t) => [
    uniqueIndex('audit_log_seq').on(t.seq),
    index('audit_log_at').on(t.at),
    index('audit_log_actor').on(t.actorId, t.at),
  ],
)
