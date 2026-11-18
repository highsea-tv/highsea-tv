// SPDX-License-Identifier: AGPL-3.0-only
// Profiles (ADR 0068): the people who watch with an account, each with its own watch state and
// Home. The list, names, colours and PINs are the account's, seen by every app; the profile
// watching now is each device's own (`devices.profile_id`, the owner's answer 16), so a TV and a
// phone on one account watch as different people at once. A device that hasn't chosen, an API key
// and a forward-auth proxy's request watch as the account's own profile, which shares the account's
// id, so finding it takes no read.
//
// A PIN is four digits, hashed with Argon2id as passwords are (ADR 0023) and never returned. Wrong
// PINs count against the profile, not the device, so moving to another app doesn't reset them; the
// fifth in a row rests choosing it for a minute (OWASP Authentication Cheat Sheet, "Account
// Lockout": a short lockout that ends by itself, so it can't be used to keep someone out for long).
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { ProfileTone } from '@highsea-tv/db/schema'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import type { Ctx, RequestMeta } from './context.ts'
import { hashPassword, verifyPassword } from './passwords.ts'

/** How many profiles an account may have (the contract's `MAX_PROFILES`). */
export const MAX_PROFILES = 6
/** Wrong PINs in a row before a profile rests, and for how long. */
export const PIN_TRIES = 5
export const PIN_REST_MS = 60_000

const PIN = /^\d{4}$/

/** A profile as the apps see it: whether it has a PIN, never the PIN. */
export type ProfileView = {
  id: string
  name: string
  tone: ProfileTone
  hasPin: boolean
  main: boolean
}

export type ProfilesView = { profiles: ProfileView[]; current: string; max: number }

/** Who acts, for the audit log. */
type Actor = { id: string; name: string }

type Row = typeof schema.profiles.$inferSelect

const view = (p: Row): ProfileView => ({
  id: p.id,
  name: p.name,
  tone: p.tone,
  hasPin: p.pinHash !== null,
  main: p.main,
})

const unknown = () => new AppError('not-found', 'That profile isn’t on this account.')

/** The account's own profile's id: the account's. */
export const mainProfileId = (userId: string) => userId

/**
 * Makes the account's own profile, named as the account is, when it hasn't one. Called as an
 * account is made; the migration made one for every account before it.
 */
export function ensureMainProfile(ctx: Ctx, userId: string, name: string) {
  const now = ctx.now()
  ctx.db
    .insert(schema.profiles)
    .values({
      id: mainProfileId(userId),
      userId,
      name: name.slice(0, 40),
      tone: 'accent',
      main: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run()
}

export function createProfiles(ctx: Ctx) {
  const { db } = ctx

  const rows = (userId: string) =>
    db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .orderBy(desc(schema.profiles.main), asc(schema.profiles.createdAt), asc(schema.profiles.id))
      .all()

  const find = (userId: string, id: string): Row => {
    const row = db
      .select()
      .from(schema.profiles)
      .where(and(eq(schema.profiles.id, id), eq(schema.profiles.userId, userId)))
      .get()
    if (!row) throw unknown()
    return row
  }

  /**
   * The profile a device watches as: its choice, or the account's own. A choice whose profile is
   * gone has been cleared by the database (`ON DELETE SET NULL`).
   */
  const current = (userId: string, deviceId: string | null): string => {
    if (!deviceId) return mainProfileId(userId)
    const row = db
      .select({ profileId: schema.devices.profileId })
      .from(schema.devices)
      .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.userId, userId)))
      .get()
    return row?.profileId ?? mainProfileId(userId)
  }

  const list = (userId: string, deviceId: string | null): ProfilesView => ({
    profiles: rows(userId).map(view),
    current: current(userId, deviceId),
    max: MAX_PROFILES,
  })

  const changed = (userId: string) =>
    ctx.events.emit({ topic: 'profiles.updated', ids: [userId], to: [userId] })

  const audit = (action: string, actor: Actor, p: Row, meta: RequestMeta) =>
    ctx.audit({
      action,
      actor,
      targetType: 'profile',
      targetId: p.id,
      address: meta.address,
      detail: { name: p.name, account: p.userId },
    })

  return {
    current,
    list,

    /** The profile's name, for Now playing; null when it's gone. */
    nameOf(profileId: string): string | null {
      return (
        db
          .select({ name: schema.profiles.name })
          .from(schema.profiles)
          .where(eq(schema.profiles.id, profileId))
          .get()?.name ?? null
      )
    },

    /** Adds a profile without a PIN. 409 once the account has its most. */
    create(
      userId: string,
      input: { name: string; tone: ProfileTone },
      actor: Actor,
      meta: RequestMeta,
    ): ProfileView {
      const name = input.name.trim()
      if (!name) throw new AppError('invalid', 'Give the profile a name.', { field: 'name' })
      const now = ctx.now()
      const row: Row = {
        id: newId('prf'),
        userId,
        name,
        tone: input.tone,
        pinHash: null,
        main: false,
        pinFailures: 0,
        pinRestUntil: null,
        createdAt: now,
        updatedAt: now,
      }
      // one connection, one writer (ADR 0019): the count and the insert can't interleave
      db.transaction((tx) => {
        const n =
          tx
            .select({ n: count() })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, userId))
            .get()?.n ?? 0
        if (n >= MAX_PROFILES)
          throw new AppError('conflict', `An account has up to ${MAX_PROFILES} profiles.`, {
            reason: 'full',
          })
        tx.insert(schema.profiles).values(row).run()
      })
      audit('profile.create', actor, row, meta)
      changed(userId)
      return view(row)
    },

    /** Its name, its colour, or its PIN (null turns it off). A new PIN clears its wrong tries. */
    async update(
      userId: string,
      id: string,
      patch: { name?: string; tone?: ProfileTone; pin?: string | null },
      actor: Actor,
      meta: RequestMeta,
    ): Promise<ProfileView> {
      find(userId, id)
      if (patch.pin != null && !PIN.test(patch.pin))
        throw new AppError('invalid', 'A PIN is four digits.', { field: 'pin' })
      const changes: Partial<Row> = { updatedAt: ctx.now() }
      if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (!name) throw new AppError('invalid', 'Give the profile a name.', { field: 'name' })
        changes.name = name
      }
      if (patch.tone !== undefined) changes.tone = patch.tone
      if (patch.pin !== undefined) {
        changes.pinHash = patch.pin === null ? null : await hashPassword(patch.pin)
        changes.pinFailures = 0
        changes.pinRestUntil = null
      }
      db.update(schema.profiles).set(changes).where(eq(schema.profiles.id, id)).run()
      const row = find(userId, id)
      if (patch.pin !== undefined)
        audit(patch.pin === null ? 'profile.pin-off' : 'profile.pin-set', actor, row, meta)
      changed(userId)
      return view(row)
    },

    /**
     * Deletes a profile, and with it its watch state, picks and Home (the database cascades); the
     * devices watching as it go back to the account's own. Never the account's own: 409.
     */
    delete(userId: string, id: string, actor: Actor, meta: RequestMeta) {
      const row = find(userId, id)
      if (row.main)
        throw new AppError('conflict', 'The account’s own profile stays.', { reason: 'main' })
      db.delete(schema.profiles).where(eq(schema.profiles.id, id)).run()
      audit('profile.delete', actor, row, meta)
      changed(userId)
    },

    /**
     * This device watches as the profile from now on. The profile watching now and one without a
     * PIN need none; a wrong PIN is 403, and the fifth in a row rests the profile for a minute (429
     * with `retryAfter`). A request with no device of its own (an API key, a forward-auth proxy's)
     * has nowhere to keep the choice: 403.
     */
    async choose(
      userId: string,
      deviceId: string | null,
      id: string,
      pin: string | undefined,
    ): Promise<ProfilesView> {
      const row = find(userId, id)
      if (!deviceId)
        throw new AppError('forbidden', 'Only a signed-in app can choose a profile.', {
          reason: 'no-device',
        })
      if (row.pinHash !== null && row.id !== current(userId, deviceId)) {
        const now = ctx.now()
        if (row.pinRestUntil !== null && row.pinRestUntil > now)
          throw resting(row.pinRestUntil - now)
        // checked against the hash whatever was sent, so a missing PIN takes as long as a wrong one
        const right = await verifyPassword(pin ?? '', row.pinHash)
        if (!right) {
          // read again after the hash: another app's try may have counted meanwhile
          const fresh = find(userId, id)
          const tries = fresh.pinFailures + 1
          if (tries >= PIN_TRIES) {
            db.update(schema.profiles)
              .set({ pinFailures: 0, pinRestUntil: ctx.now() + PIN_REST_MS })
              .where(eq(schema.profiles.id, id))
              .run()
            throw resting(PIN_REST_MS)
          }
          db.update(schema.profiles)
            .set({ pinFailures: tries })
            .where(eq(schema.profiles.id, id))
            .run()
          throw new AppError('forbidden', `That isn’t ${row.name}’s PIN.`, {
            field: 'pin',
            reason: 'wrong-pin',
          })
        }
      }
      db.transaction((tx) => {
        if (row.pinFailures > 0 || row.pinRestUntil !== null)
          tx.update(schema.profiles)
            .set({ pinFailures: 0, pinRestUntil: null })
            .where(eq(schema.profiles.id, id))
            .run()
        tx.update(schema.devices)
          .set({ profileId: row.main ? null : row.id })
          .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.userId, userId)))
          .run()
      })
      // the account's apps hear it; each reads its own device's profile again, and its watch state
      changed(userId)
      ctx.events.emit({ topic: 'watch.updated', to: [userId] })
      ctx.events.emit({ topic: 'home.updated', ids: [userId], to: [userId] })
      return list(userId, deviceId)
    },
  }
}

const resting = (ms: number) =>
  new AppError('rate-limited', 'Too many wrong PINs. Try again in a minute.', {
    reason: 'rate-limited',
    retryAfter: Math.ceil(ms / 1000),
  })

export type Profiles = ReturnType<typeof createProfiles>
