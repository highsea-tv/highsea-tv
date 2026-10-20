// SPDX-License-Identifier: AGPL-3.0-only
// People (users-devices.md): the owner from setup, invites and password-reset links, role and
// access changes, removal, and each person's own name and password.
import { randomBytes } from 'node:crypto'
import { AppError, newId } from '@highsea/core'
import { schema } from '@highsea/db'
import type { Permission, Role } from '@highsea/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import type { Ctx, RequestMeta, UserView } from './context.ts'
import { notFound } from './context.ts'
import { hashPassword, passwordProblem, verifyPassword } from './passwords.ts'
import { ALL_LIBRARIES, canManageUsers, LIBRARIES, ROLE_DEFAULTS } from './roles.ts'
import { newSecret, verifier } from './secrets.ts'

/** Invites and resets work once, for 7 days (users-devices.md). */
export const LINK_TTL = 7 * 86_400_000

/** setup.md: "Use 2 to 32 lowercase letters, numbers, dots, dashes or underscores." */
export const USERNAME = /^[a-z0-9._-]{2,32}$/

export type Actor = { id: string; name: string }

const invalid = (message: string, details: Record<string, unknown>) =>
  new AppError('invalid', message, details)

export function checkPassword(password: string) {
  const problem = passwordProblem(password)
  if (problem === 'short')
    throw invalid('Use at least 10 characters.', { field: 'password', reason: 'password-short' })
  if (problem === 'long')
    throw invalid('Use at most 256 characters.', { field: 'password', reason: 'password-long' })
}

export function checkUsername(ctx: Ctx, username: string, except?: string) {
  if (!USERNAME.test(username))
    throw invalid('Use 2 to 32 lowercase letters, numbers, dots, dashes or underscores.', {
      field: 'username',
      reason: 'username-invalid',
    })
  const taken = ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get()
  if (taken && taken.id !== except)
    throw new AppError('conflict', 'That username is taken.', {
      field: 'username',
      reason: 'username-taken',
    })
}

function checkLibraries(libraries: 'all' | string[]) {
  if (libraries === 'all') return
  if (!libraries.length)
    throw invalid('Choose at least one library.', { field: 'libraries', reason: 'no-libraries' })
  for (const l of libraries)
    if (!(LIBRARIES as readonly string[]).includes(l))
      throw invalid(`There’s no library called ${l}.`, { field: 'libraries' })
}

function setPermissions(ctx: Ctx, userId: string, permissions: readonly Permission[]) {
  ctx.db.delete(schema.userPermissions).where(eq(schema.userPermissions.userId, userId)).run()
  const unique = [...new Set(permissions)]
  if (unique.length)
    ctx.db
      .insert(schema.userPermissions)
      .values(unique.map((permission) => ({ userId, permission })))
      .run()
}

function setLibraries(ctx: Ctx, userId: string, libraries: 'all' | string[]) {
  ctx.db.delete(schema.libraryAccess).where(eq(schema.libraryAccess.userId, userId)).run()
  const rows = libraries === 'all' ? [ALL_LIBRARIES] : [...new Set(libraries)]
  ctx.db
    .insert(schema.libraryAccess)
    .values(rows.map((library) => ({ userId, library })))
    .run()
}

function insertUser(
  ctx: Ctx,
  input: {
    username: string
    displayName: string
    role: Role
    passwordHash: string | null
    email: string | null
    invited: boolean
    libraries: 'all' | string[]
  },
): string {
  const now = ctx.now()
  const id = newId('usr')
  ctx.db
    .insert(schema.users)
    .values({
      id,
      username: input.username,
      displayName: input.displayName,
      role: input.role,
      passwordHash: input.passwordHash,
      email: input.email,
      invited: input.invited,
      webauthnId: randomBytes(32).toString('base64url'),
      createdAt: now,
      updatedAt: now,
    })
    .run()
  setPermissions(ctx, id, ROLE_DEFAULTS[input.role])
  setLibraries(ctx, id, input.libraries)
  return id
}

export const hasOwner = (ctx: Ctx) =>
  !!ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, 'owner'))
    .get()

/** Setup's step 2. There is one owner, made once. */
export async function createOwner(
  ctx: Ctx,
  input: { username: string; displayName: string; password: string },
  meta: RequestMeta,
): Promise<UserView> {
  if (hasOwner(ctx)) throw new AppError('conflict', 'This server already has an owner.')
  const displayName = input.displayName.trim()
  if (!displayName) throw invalid('Give them a name.', { field: 'displayName' })
  checkUsername(ctx, input.username)
  checkPassword(input.password)
  const id = insertUser(ctx, {
    username: input.username,
    displayName,
    role: 'owner',
    passwordHash: await hashPassword(input.password),
    email: null,
    invited: false,
    libraries: 'all',
  })
  ctx.audit({
    action: 'user.create-owner',
    actor: { id, name: input.username },
    targetType: 'user',
    targetId: id,
    address: meta.address,
  })
  ctx.events.emit({ topic: 'users.updated', ids: [id] })
  return ctx.userView(id)
}

// ---------------------------------------------------------------- links

export type LinkKind = 'invite' | 'reset'

/** Where a link leads in the admin: `/invite/{token}` or `/reset/{token}`. */
function linkUrl(ctx: Ctx, kind: LinkKind, token: string) {
  const { externalUrl, localOrigins } = ctx.addresses()
  const base = (externalUrl ?? localOrigins[0] ?? '').replace(/\/$/, '')
  return `${base}/${kind}/${token}`
}

function createLink(ctx: Ctx, kind: LinkKind, userId: string, createdBy: string | null) {
  const now = ctx.now()
  ctx.db
    .delete(schema.accountLinks)
    .where(and(eq(schema.accountLinks.userId, userId), eq(schema.accountLinks.kind, kind)))
    .run()
  const token = newSecret()
  const expiresAt = now + LINK_TTL
  ctx.db
    .insert(schema.accountLinks)
    .values({
      id: newId('lnk'),
      kind,
      userId,
      tokenHash: verifier(token),
      tokenSealed: ctx.sealer.seal(token),
      createdBy,
      expiresAt,
      createdAt: now,
    })
    .run()
  return { link: linkUrl(ctx, kind, token), expiresAt }
}

function liveLink(ctx: Ctx, token: string, kind?: LinkKind) {
  const row = ctx.db
    .select()
    .from(schema.accountLinks)
    .where(eq(schema.accountLinks.tokenHash, verifier(token)))
    .get()
  if (!row || row.expiresAt <= ctx.now() || (kind && row.kind !== kind))
    throw new AppError(
      'not-found',
      'That link has expired or was already used. Ask for a new one.',
      {
        reason: 'link-expired',
      },
    )
  return row
}

/** A username from a name: "Mara Jensen" → "mara.jensen", made unique with a number. */
function usernameFrom(ctx: Ctx, displayName: string): string {
  const base =
    displayName
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 28) || 'user'
  const padded = base.length < 2 ? `${base}.user` : base
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? padded : `${padded}${n}`
    const taken = ctx.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, candidate))
      .get()
    if (!taken) return candidate
  }
}

export type InviteInput = {
  displayName: string
  email: string | null
  role: Exclude<Role, 'owner'>
  libraries: 'all' | string[]
}

export type Invite = { user: UserView; link: string; expiresAt: number }

/** A pending person and the single-use link that finishes their account. */
export function invite(ctx: Ctx, input: InviteInput, actor: Actor, meta: RequestMeta): Invite {
  const displayName = input.displayName.trim()
  if (!displayName) throw invalid('Give them a name.', { field: 'displayName' })
  const clash = ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.displayName, displayName))
    .get()
  if (clash)
    throw new AppError('conflict', `There’s already someone called ${displayName}.`, {
      field: 'displayName',
      reason: 'name-taken',
    })
  checkLibraries(input.libraries)
  const id = insertUser(ctx, {
    username: usernameFrom(ctx, displayName),
    displayName,
    role: input.role,
    passwordHash: null,
    email: input.email?.trim() || null,
    invited: true,
    libraries: input.libraries,
  })
  const { link, expiresAt } = createLink(ctx, 'invite', id, actor.id)
  ctx.audit({
    action: 'user.invite',
    actor,
    targetType: 'user',
    targetId: id,
    address: meta.address,
    detail: { role: input.role },
  })
  ctx.events.emit({ topic: 'users.updated', ids: [id] })
  return { user: ctx.userView(id), link, expiresAt }
}

/** The pending invite's link again, for "Copy the invite link". A fresh link replaces the old. */
export function inviteLink(
  ctx: Ctx,
  userId: string,
  actor: Actor,
): { link: string; expiresAt: number } {
  const user = ctx.findUser(userId)
  if (!user) throw notFound('There’s no one with that id.')
  if (!user.invited) throw new AppError('conflict', 'They’ve already joined.')
  // an invited admin's link would make whoever accepts it an admin
  assertCanManage(ctx, actor, user)
  const row = ctx.db
    .select()
    .from(schema.accountLinks)
    .where(and(eq(schema.accountLinks.userId, userId), eq(schema.accountLinks.kind, 'invite')))
    .get()
  if (row && row.expiresAt > ctx.now())
    return {
      link: linkUrl(ctx, 'invite', ctx.sealer.open(row.tokenSealed)),
      expiresAt: row.expiresAt,
    }
  return createLink(ctx, 'invite', userId, actor.id)
}

/**
 * A reset link for someone who forgot their password. The owner passes it on: the server can't
 * assume it can send email (login.md). Their devices stay signed in until they use it.
 */
export function resetLink(
  ctx: Ctx,
  userId: string,
  actor: Actor,
  meta: RequestMeta,
): { link: string; expiresAt: number } {
  const user = ctx.findUser(userId)
  if (!user) throw notFound('There’s no one with that id.')
  if (user.invited)
    throw new AppError('conflict', 'They haven’t joined yet. Copy the invite link instead.')
  if (user.role === 'owner' && actor.id !== userId)
    throw new AppError('forbidden', 'The owner’s password can only be changed by the owner.')
  // a reset link takes the account over, so it needs the same standing as changing it
  if (actor.id !== userId) assertCanManage(ctx, actor, user)
  const out = createLink(ctx, 'reset', userId, actor.id)
  ctx.audit({
    action: 'user.reset-link',
    actor,
    targetType: 'user',
    targetId: userId,
    address: meta.address,
  })
  return out
}

export type LinkInfo = {
  kind: LinkKind
  username: string
  displayName: string
  serverName: string
  expiresAt: number
}

/** What the invite or reset page shows before someone chooses a password. */
export function linkInfo(ctx: Ctx, token: string): LinkInfo {
  const row = liveLink(ctx, token)
  const user = ctx.findUser(row.userId)
  if (!user) throw notFound('That link has expired or was already used. Ask for a new one.')
  return {
    kind: row.kind,
    username: user.username,
    displayName: user.displayName,
    serverName: ctx.serverName(),
    expiresAt: row.expiresAt,
  }
}

/**
 * Uses a link: an invite sets the username (optionally changed) and password and finishes the
 * account; a reset sets a new password and signs out the person's admin sessions (OWASP Forgot
 * Password Cheat Sheet). App tokens stay, so a TV isn't signed out by a forgotten password.
 */
export async function acceptLink(
  ctx: Ctx,
  token: string,
  input: { password: string; username?: string },
  meta: RequestMeta,
): Promise<{ userId: string; kind: LinkKind }> {
  const row = liveLink(ctx, token)
  const user = ctx.findUser(row.userId)
  if (!user) throw notFound('That link has expired or was already used. Ask for a new one.')
  checkPassword(input.password)
  const username = row.kind === 'invite' && input.username ? input.username : user.username
  if (username !== user.username) checkUsername(ctx, username, user.id)
  const passwordHash = await hashPassword(input.password)
  ctx.db.delete(schema.accountLinks).where(eq(schema.accountLinks.id, row.id)).run()
  ctx.db
    .update(schema.users)
    .set({ passwordHash, username, invited: false, updatedAt: ctx.now() })
    .where(eq(schema.users.id, user.id))
    .run()
  if (row.kind === 'reset')
    ctx.db
      .delete(schema.devices)
      .where(and(eq(schema.devices.userId, user.id), eq(schema.devices.kind, 'session')))
      .run()
  ctx.audit({
    action: row.kind === 'invite' ? 'user.join' : 'user.reset-password',
    actor: { id: user.id, name: username },
    targetType: 'user',
    targetId: user.id,
    address: meta.address,
  })
  ctx.events.emit({ topic: 'users.updated', ids: [user.id] })
  return { userId: user.id, kind: row.kind }
}

// ---------------------------------------------------------------- managing people

export type UserPatch = {
  role?: Exclude<Role, 'owner'>
  permissions?: Permission[]
  libraries?: 'all' | string[]
  displayName?: string
}

export function assertCanManage(ctx: Ctx, actor: Actor, target: typeof schema.users.$inferSelect) {
  const me = ctx.userView(actor.id)
  if (!canManageUsers(me.role, me.permissions))
    throw new AppError('forbidden', 'You can’t manage people.')
  // only the owner manages admins; nobody but the owner touches the owner
  if (target.role === 'owner' && me.role !== 'owner')
    throw new AppError('forbidden', 'Only the owner can change the owner’s account.')
  if (target.role === 'admin' && me.role !== 'owner')
    throw new AppError('forbidden', 'Only the owner can change an admin.')
  return me
}

/** Role, permissions, libraries. Changing the role resets the permissions to its defaults. */
export function updateUser(
  ctx: Ctx,
  id: string,
  patch: UserPatch,
  actor: Actor,
  meta: RequestMeta,
): UserView {
  const user = ctx.findUser(id)
  if (!user) throw notFound('There’s no one with that id.')
  const me = assertCanManage(ctx, actor, user)
  if (user.role === 'owner' && patch.role)
    throw new AppError(
      'forbidden',
      'The owner stays the owner. Hand ownership over in Security first.',
      {
        reason: 'owner-role',
      },
    )
  if (patch.role === 'admin' && me.role !== 'owner')
    throw new AppError('forbidden', 'Only the owner can make someone an admin.')
  if (patch.libraries) checkLibraries(patch.libraries)
  const changes: Partial<typeof schema.users.$inferInsert> = { updatedAt: ctx.now() }
  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim()
    if (!name) throw invalid('Give them a name.', { field: 'displayName' })
    changes.displayName = name
  }
  const roleChanged = patch.role && patch.role !== user.role
  if (patch.role) changes.role = patch.role
  ctx.db.update(schema.users).set(changes).where(eq(schema.users.id, id)).run()
  if (user.role !== 'owner') {
    const role = patch.role ?? user.role
    // "Manage people" and "Administer" are for staff to grant only within what they hold
    let permissions = patch.permissions ?? (roleChanged ? ROLE_DEFAULTS[role] : null)
    if (permissions) {
      if (me.role !== 'owner') permissions = permissions.filter((p) => p !== 'admin')
      setPermissions(ctx, id, permissions)
    }
  }
  if (patch.libraries) setLibraries(ctx, id, user.role === 'owner' ? 'all' : patch.libraries)
  ctx.audit({
    action: 'user.update',
    actor,
    targetType: 'user',
    targetId: id,
    address: meta.address,
    detail: { ...patch },
  })
  ctx.events.emit({ topic: 'users.updated', ids: [id] })
  return ctx.userView(id)
}

/** Removes someone: they're signed out everywhere and their devices, keys and links go too. */
export function removeUser(ctx: Ctx, id: string, actor: Actor, meta: RequestMeta) {
  const user = ctx.findUser(id)
  if (!user) throw notFound('There’s no one with that id.')
  if (user.role === 'owner')
    throw new AppError('forbidden', 'The owner can’t be removed.', { reason: 'owner' })
  if (id === actor.id)
    throw new AppError('forbidden', 'You can’t remove yourself.', { reason: 'self' })
  assertCanManage(ctx, actor, user)
  // foreign keys cascade: devices, keys, links, factors and identities go with the row
  ctx.db.delete(schema.users).where(eq(schema.users.id, id)).run()
  ctx.audit({
    action: user.invited ? 'user.cancel-invite' : 'user.remove',
    actor,
    targetType: 'user',
    targetId: id,
    address: meta.address,
    detail: { username: user.username },
  })
  ctx.events.emit({ topic: 'users.updated', ids: [id] })
}

// ---------------------------------------------------------------- your own account

export function updateProfile(
  ctx: Ctx,
  userId: string,
  input: { displayName?: string; email?: string | null },
) {
  const changes: Partial<typeof schema.users.$inferInsert> = { updatedAt: ctx.now() }
  if (input.displayName !== undefined) {
    const name = input.displayName.trim()
    if (!name) throw invalid('Give yourself a name.', { field: 'displayName' })
    changes.displayName = name
  }
  if (input.email !== undefined) changes.email = input.email?.trim() || null
  ctx.db.update(schema.users).set(changes).where(eq(schema.users.id, userId)).run()
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
  return ctx.userView(userId)
}

/** Asks for the password again before a sensitive change (OWASP: re-authenticate). */
export async function confirmPassword(ctx: Ctx, userId: string, password: string) {
  const user = ctx.findUser(userId)
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash)))
    throw new AppError('unauthorized', 'That password isn’t right.', {
      field: 'password',
      reason: 'invalid-credentials',
    })
}

/**
 * Changes your password and signs out your other admin sessions (OWASP Session Management: renew
 * after a privilege change). Someone without a password (single sign-on only) can set one.
 */
export async function changePassword(
  ctx: Ctx,
  userId: string,
  input: { current: string | null; password: string },
  deviceId: string | null,
  meta: RequestMeta,
) {
  const user = ctx.findUser(userId)
  if (!user) throw notFound('There’s no one with that id.')
  if (user.passwordHash) await confirmPassword(ctx, userId, input.current ?? '')
  checkPassword(input.password)
  ctx.db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(input.password), updatedAt: ctx.now() })
    .where(eq(schema.users.id, userId))
    .run()
  // other admin sessions end; apps keep their tokens, as with a reset
  ctx.db
    .delete(schema.devices)
    .where(
      and(
        eq(schema.devices.userId, userId),
        eq(schema.devices.kind, 'session'),
        deviceId ? ne(schema.devices.id, deviceId) : undefined,
      ),
    )
    .run()
  ctx.audit({
    action: 'user.change-password',
    actor: { id: userId, name: user.username },
    targetType: 'user',
    targetId: userId,
    address: meta.address,
  })
  ctx.events.emit({ topic: 'users.updated', ids: [userId] })
}
