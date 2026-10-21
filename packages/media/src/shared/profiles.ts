// SPDX-License-Identifier: AGPL-3.0-only
// What adding and deciding read, for every media type: quality profiles, custom formats, quality
// sizes and language profiles. Seeded on first boot and read-only until their editors come with
// checkpoint 8 (profiles and formats) and checkpoint 7 (language profiles).
import { AppError } from '@highsea/core'
import { schema, writeSetting } from '@highsea/db'
import {
  type CustomFormat,
  customFormatSchema,
  defaultQualitySizes,
  QUALITY_NAMES,
  type QualityProfile,
  type QualitySizes,
  qualityProfileSchema,
  qualitySizeSchema,
  seedFormats,
  seedProfiles,
} from '@highsea/quality'
import { asc, eq, sql } from 'drizzle-orm'
import type { MediaDeps } from './context.ts'

const { qualityProfiles, customFormats, settings } = schema

/** The settings row holding @highsea/quality's `QualitySizes`: one entry per quality, MiB a minute. */
export const QUALITY_SIZES_KEY = 'qualitySizes'

export const profileNotFound = () =>
  new AppError('not-found', 'That quality profile doesn’t exist.', {
    reason: 'unknown-quality-profile',
  })

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
      const sizes = tx
        .select({ key: settings.key })
        .from(settings)
        .where(eq(settings.key, QUALITY_SIZES_KEY))
        .get()
      if (!sizes) writeSetting(tx, QUALITY_SIZES_KEY, defaultQualitySizes(), now)
    })
  }

  /** In the owner's order. A row that doesn't parse is skipped and logged, never served half-read. */
  function profiles(): QualityProfile[] {
    return db
      .select()
      .from(qualityProfiles)
      .orderBy(asc(qualityProfiles.position), asc(qualityProfiles.name))
      .all()
      .flatMap((row) => {
        const parsed = qualityProfileSchema.safeParse({ ...(row.data as object), id: row.id })
        if (parsed.success) return [parsed.data]
        log.error('a quality profile doesn’t parse', { id: row.id })
        return []
      })
  }

  function profile(id: string): QualityProfile {
    const found = profiles().find((p) => p.id === id)
    if (!found) throw profileNotFound()
    return found
  }

  /** The custom formats, by name. */
  function formats(): CustomFormat[] {
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
        if (parsed.success) return [parsed.data]
        log.error('a custom format doesn’t parse', { id: row.id })
        return []
      })
  }

  /**
   * Every quality's size limits, lowest quality first. A quality missing from the stored row (one
   * a later release adds) reads its default, as other settings areas do (@highsea/db's
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

  return {
    seed,
    profiles: { list: profiles, get: profile },
    customFormats: formats,
    qualitySizes,
  }
}

export type Profiles = ReturnType<typeof createProfiles>
