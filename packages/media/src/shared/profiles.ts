// SPDX-License-Identifier: AGPL-3.0-only
// What adding and deciding read, for every media type: quality profiles, custom formats and quality
// sizes. Seeded on first boot, and written by their editors since checkpoint 8c (settings.md): the
// seeded profiles are marked `builtIn` and stay editable; a seeded format the owner saves is marked
// `edited` ("Yours"), and the bundled presets' updates, applied at boot, leave it alone.
import { AppError, newId } from '@highsea-tv/core'
import { schema, writeSetting } from '@highsea-tv/db'
import {
  type Condition,
  type CustomFormat,
  completeItems,
  customFormatSchema,
  defaultQualitySizes,
  type ProfileItem,
  QUALITY_NAMES,
  type QualityProfile,
  type QualitySizes,
  qualityProfileSchema,
  qualitySizeSchema,
  qualitySizesSchema,
  seedFormats,
  seedProfiles,
  validateFormat,
} from '@highsea-tv/quality'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { MediaDeps } from './context.ts'

const { qualityProfiles, customFormats, settings, mediaItems, versions } = schema

/** The settings row holding @highsea-tv/quality's `QualitySizes`: one entry per quality, MiB a minute. */
export const QUALITY_SIZES_KEY = 'qualitySizes'

export const profileNotFound = () =>
  new AppError('not-found', 'That quality profile doesn’t exist.', {
    reason: 'unknown-quality-profile',
  })

export const formatNotFound = () =>
  new AppError('not-found', 'That custom format doesn’t exist.', {
    reason: 'unknown-custom-format',
  })

/** A profile as it's stored and served: one of highsea's own, or the owner's. */
export type StoredProfile = QualityProfile & { builtIn: boolean }
/** A format as it's stored and served: a preset the owner has changed is `edited`. */
export type StoredFormat = CustomFormat & { edited: boolean }

/**
 * What the profile editor saves: everything but the id and whether it's built in. Loosely typed,
 * as the API hands it over; @highsea-tv/quality's schema checks it.
 */
export type ProfileInput = Omit<QualityProfile, 'id' | 'waitMinutes' | 'items' | 'language'> & {
  items: { name: string; allowed: boolean; qualities: string[] }[]
  language: string
  waitMinutes?: number
}
export type CustomFormatInput = { name: string; conditions: Condition[] }

const invalid = (message: string) => new AppError('invalid', message, { reason: 'invalid' })
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function createProfiles({ db, clock, logger }: MediaDeps) {
  const log = logger.child('media')

  /**
   * First boot: the seeded profiles and formats when there are none, and the sizes row when it's
   * missing. Safe to run at every boot: once a table has rows, or the row exists, it's the owner's
   * and nothing here touches it, so a profile they removed doesn't come back.
   */
  function seed() {
    const now = clock.now()
    db.transaction((tx) => {
      const profileCount = tx.select({ n: sql<number>`count(*)` }).from(qualityProfiles).get()
      if (!profileCount?.n)
        seedProfiles().forEach((p, position) => {
          tx.insert(qualityProfiles)
            .values({
              id: p.id,
              name: p.name,
              data: p,
              position,
              builtIn: true,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .run()
        })
      const formatCount = tx.select({ n: sql<number>`count(*)` }).from(customFormats).get()
      if (!formatCount?.n)
        for (const f of seedFormats())
          tx.insert(customFormats)
            .values({
              id: f.id,
              name: f.name,
              source: f.source,
              trashId: f.trashId,
              conditions: f.conditions,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .run()
      // a server seeded before 8c learns which profiles were highsea's
      tx.update(qualityProfiles)
        .set({ builtIn: true })
        .where(
          and(
            inArray(
              qualityProfiles.id,
              seedProfiles().map((p) => p.id),
            ),
            eq(qualityProfiles.builtIn, false),
          ),
        )
        .run()
      // the bundled presets as this release has them, over every seeded format the owner hasn't
      // changed: TRaSH's fixes reach a server that keeps the format as it came
      for (const f of seedFormats()) {
        const row = tx.select().from(customFormats).where(eq(customFormats.id, f.id)).get()
        if (row?.source !== 'preset' || row.edited) continue
        if (JSON.stringify(row.conditions) === JSON.stringify(f.conditions) && row.name === f.name)
          continue
        tx.update(customFormats)
          .set({ name: f.name, conditions: f.conditions, trashId: f.trashId, updatedAt: now })
          .where(eq(customFormats.id, f.id))
          .run()
      }
      const sizes = tx
        .select({ key: settings.key })
        .from(settings)
        .where(eq(settings.key, QUALITY_SIZES_KEY))
        .get()
      if (!sizes) writeSetting(tx, QUALITY_SIZES_KEY, defaultQualitySizes(), now)
    })
  }

  /** In the owner's order. A row that doesn't parse is skipped and logged, never served half-read. */
  function profiles(): StoredProfile[] {
    return db
      .select()
      .from(qualityProfiles)
      .orderBy(asc(qualityProfiles.position), asc(qualityProfiles.name))
      .all()
      .flatMap((row) => {
        const parsed = qualityProfileSchema.safeParse({ ...(row.data as object), id: row.id })
        if (parsed.success) return [{ ...parsed.data, builtIn: row.builtIn }]
        log.error('a quality profile doesn’t parse', { id: row.id })
        return []
      })
  }

  function profile(id: string): StoredProfile {
    const found = profiles().find((p) => p.id === id)
    if (!found) throw profileNotFound()
    return found
  }

  /** The custom formats, by name. */
  function formats(): StoredFormat[] {
    return db
      .select()
      .from(customFormats)
      .orderBy(asc(customFormats.name))
      .all()
      .flatMap((row) => {
        const parsed = customFormatSchema.safeParse({
          id: row.id,
          name: row.name,
          source: row.source,
          trashId: row.trashId,
          conditions: row.conditions,
        })
        if (parsed.success) return [{ ...parsed.data, edited: row.edited }]
        log.error('a custom format doesn’t parse', { id: row.id })
        return []
      })
  }

  /**
   * Every quality's size limits, lowest quality first. A quality missing from the stored row (one
   * a later release adds) reads its default, as other settings areas do (@highsea-tv/db's
   * `readSetting`, which merges objects and so can't take this row's list).
   */
  function qualitySizes(): QualitySizes {
    const row = db.select().from(settings).where(eq(settings.key, QUALITY_SIZES_KEY)).get()
    const stored = new Map<string, QualitySizes[number]>()
    if (Array.isArray(row?.value))
      for (const entry of row.value) {
        const parsed = qualitySizeSchema.safeParse(entry)
        if (parsed.success) stored.set(parsed.data.quality, parsed.data)
      }
    const defaults = new Map(defaultQualitySizes().map((s) => [s.quality, s]))
    return QUALITY_NAMES.map((q) => stored.get(q) ?? (defaults.get(q) as QualitySizes[number]))
  }

  /** The profile checked as @highsea-tv/quality checks it, with every quality listed. */
  function checkProfile(id: string, input: ProfileInput): QualityProfile {
    const known = new Set(formats().map((f) => f.id))
    const parsed = qualityProfileSchema.safeParse({
      ...input,
      id,
      name: input.name.trim(),
      // names that aren't qualities stay in, for the schema to refuse
      items: completeItems(input.items as ProfileItem[]),
      // a score for a format that's gone means nothing; a 0 is the same as none
      formats: input.formats.filter((f) => known.has(f.formatId) && f.score !== 0),
    })
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Check the profile.')
    const taken = profiles().find((p) => p.id !== id && sameName(p.name, parsed.data.name))
    if (taken)
      throw new AppError('conflict', `There’s a profile called ${taken.name} already.`, {
        reason: 'name-taken',
      })
    return parsed.data
  }

  /**
   * A new profile, last in the order. `id` is the migration's, so bringing a Radarr profile across
   * twice finds the first copy.
   */
  function addProfile(
    input: ProfileInput,
    { id = newId('qp') }: { id?: string } = {},
  ): StoredProfile {
    const p = checkProfile(id, input)
    const now = clock.now()
    db.transaction((tx) => {
      const last = tx
        .select({ n: sql<number>`coalesce(max(${qualityProfiles.position}), -1)` })
        .from(qualityProfiles)
        .get()
      tx.insert(qualityProfiles)
        .values({
          id: p.id,
          name: p.name,
          data: p,
          position: (last?.n ?? -1) + 1,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    })
    log.info('quality profile added', { id: p.id })
    return profile(p.id)
  }

  function saveProfile(id: string, input: ProfileInput): StoredProfile {
    profile(id)
    const p = checkProfile(id, input)
    db.update(qualityProfiles)
      .set({ name: p.name, data: p, updatedAt: clock.now() })
      .where(eq(qualityProfiles.id, id))
      .run()
    log.info('quality profile saved', { id })
    return profile(id)
  }

  /** Refused while a movie uses it, as Radarr refuses, and for the last one left. */
  function removeProfile(id: string): void {
    profile(id)
    const used =
      db
        .select({ n: sql<number>`count(distinct ${mediaItems.id})` })
        .from(mediaItems)
        .leftJoin(versions, eq(versions.itemId, mediaItems.id))
        .where(sql`${mediaItems.qualityProfileId} = ${id} or ${versions.qualityProfileId} = ${id}`)
        .get()?.n ?? 0
    if (used > 0)
      throw new AppError(
        'conflict',
        used === 1
          ? '1 movie uses this profile. Move it to another first.'
          : `${used} movies use this profile. Move them to another first.`,
        { reason: 'in-use', movies: used },
      )
    if (profiles().length <= 1)
      throw new AppError('conflict', 'This is the only profile. Add another before deleting it.', {
        reason: 'last-profile',
      })
    db.delete(qualityProfiles).where(eq(qualityProfiles.id, id)).run()
    log.info('quality profile deleted', { id })
  }

  /** Every profile's id once, first to last. */
  function orderProfiles(ids: readonly string[]): StoredProfile[] {
    const have = profiles().map((p) => p.id)
    if (
      ids.length !== have.length ||
      new Set(ids).size !== ids.length ||
      !have.every((id) => ids.includes(id))
    )
      throw invalid('List every profile once.')
    const now = clock.now()
    db.transaction((tx) => {
      ids.forEach((id, position) => {
        tx.update(qualityProfiles)
          .set({ position, updatedAt: now })
          .where(eq(qualityProfiles.id, id))
          .run()
      })
    })
    return profiles()
  }

  function checkFormat(
    id: string,
    input: CustomFormatInput,
    base: StoredFormat | null,
  ): CustomFormat {
    const parsed = customFormatSchema.safeParse({
      id,
      name: input.name.trim(),
      source: base?.source ?? 'custom',
      trashId: base?.trashId ?? null,
      conditions: input.conditions,
    })
    if (!parsed.success) throw invalid(parsed.error.issues[0]?.message ?? 'Check the format.')
    const issue = validateFormat(parsed.data)[0]
    if (issue) throw invalid(issue.message)
    const taken = formats().find((f) => f.id !== id && sameName(f.name, parsed.data.name))
    if (taken)
      throw new AppError('conflict', `There’s a format called ${taken.name} already.`, {
        reason: 'name-taken',
      })
    return parsed.data
  }

  function format(id: string): StoredFormat {
    const found = formats().find((f) => f.id === id)
    if (!found) throw formatNotFound()
    return found
  }

  function addFormat(input: CustomFormatInput): StoredFormat {
    const f = checkFormat(newId('cf'), input, null)
    const now = clock.now()
    db.insert(customFormats)
      .values({
        id: f.id,
        name: f.name,
        source: 'custom',
        trashId: null,
        conditions: f.conditions,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    log.info('custom format added', { id: f.id })
    return format(f.id)
  }

  /** Saving a preset makes it the owner's: `edited`, so the presets' updates leave it alone. */
  function saveFormat(id: string, input: CustomFormatInput): StoredFormat {
    const base = format(id)
    const f = checkFormat(id, input, base)
    db.update(customFormats)
      .set({
        name: f.name,
        conditions: f.conditions,
        edited: base.source === 'preset',
        updatedAt: clock.now(),
      })
      .where(eq(customFormats.id, id))
      .run()
    log.info('custom format saved', { id })
    return format(id)
  }

  /** The format, and its score in every profile, as Radarr removes them. */
  function removeFormat(id: string): void {
    format(id)
    const now = clock.now()
    db.transaction((tx) => {
      for (const row of tx.select().from(qualityProfiles).all()) {
        const data = row.data as QualityProfile
        if (!Array.isArray(data.formats) || !data.formats.some((f) => f.formatId === id)) continue
        tx.update(qualityProfiles)
          .set({
            data: { ...data, formats: data.formats.filter((f) => f.formatId !== id) },
            updatedAt: now,
          })
          .where(eq(qualityProfiles.id, row.id))
          .run()
      }
      tx.delete(customFormats).where(eq(customFormats.id, id)).run()
    })
    log.info('custom format deleted', { id })
  }

  /** Every quality once; the rows are kept lowest quality first, as they're read. */
  function saveQualitySizes(input: unknown): QualitySizes {
    const parsed = qualitySizesSchema.safeParse(input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const at = issue?.path[0]
      const row = typeof at === 'number' ? (input as { quality?: unknown }[])[at]?.quality : null
      const message = issue?.message ?? 'Check the sizes.'
      throw invalid(typeof row === 'string' ? `${row}: ${message}` : message)
    }
    const missing = QUALITY_NAMES.filter((q) => !parsed.data.some((r) => r.quality === q))
    if (missing.length) throw invalid(`Every quality needs a row: ${missing.join(', ')}.`)
    writeSetting(db, QUALITY_SIZES_KEY, parsed.data, clock.now())
    log.info('quality sizes saved')
    return qualitySizes()
  }

  return {
    seed,
    profiles: {
      list: profiles,
      get: profile,
      add: addProfile,
      save: saveProfile,
      remove: removeProfile,
      order: orderProfiles,
    },
    customFormats: Object.assign(formats, {
      get: format,
      add: addFormat,
      save: saveFormat,
      remove: removeFormat,
    }),
    qualitySizes: Object.assign(qualitySizes, { save: saveQualitySizes }),
  }
}

export type Profiles = ReturnType<typeof createProfiles>
