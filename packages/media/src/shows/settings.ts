// SPDX-License-Identifier: AGPL-3.0-only
// Shows' settings (series-settings.ts in @highsea-tv/api-contract): Settings › Media management's
// episode naming, Settings › Quality's sizes per minute of an episode, and how many movies and
// shows use each quality profile. Naming is Sonarr's (Servarr wiki, Sonarr settings › Episode
// Naming: https://wiki.servarr.com/sonarr/settings#episode-naming) with its defaults; it's recorded
// now and acted on when highsea files episodes it downloads (part C). Nothing in B renames a file.
import type { EpisodeNaming, ProfileUsage } from '@highsea-tv/api-contract'
import { readSetting, schema, writeSetting } from '@highsea-tv/db'
import {
  defaultEpisodeSizes,
  QUALITY_NAMES,
  type QualitySizes,
  qualitySizeSchema,
  qualitySizesSchema,
} from '@highsea-tv/quality'
import { eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { invalid, type MediaDeps } from '../shared/context.ts'

const { settings, mediaItems } = schema

export const EPISODE_NAMING_KEY = 'episodeNaming'
export const EPISODE_SIZES_KEY = 'episodeSizes'

const MULTI = ['extend', 'duplicate', 'repeat', 'scene', 'range', 'prefixed-range'] as const

const format = z.string().trim().min(1).max(500)
export const episodeNamingSchema = z.object({
  rename: z.boolean(),
  standardFormat: format,
  dailyFormat: format,
  seriesFolderFormat: format,
  seasonFolderFormat: format,
  multiEpisodeStyle: z.enum(MULTI),
})

/** Sonarr's defaults (NamingConfig.cs), with rename on as films' are. */
export const defaultEpisodeNaming = (): EpisodeNaming => ({
  rename: true,
  standardFormat: '{Series Title} - S{season:00}E{episode:00} - {Episode Title} {Quality Full}',
  dailyFormat: '{Series Title} - {Air-Date} - {Episode Title} {Quality Full}',
  seriesFolderFormat: '{Series TitleYear}',
  seasonFolderFormat: 'Season {season:00}',
  multiEpisodeStyle: 'prefixed-range',
})

export function createShowSettings({ db, clock }: Pick<MediaDeps, 'db' | 'clock'>) {
  /** The stored row over the defaults; a field that no longer parses reads its default. */
  function naming(): EpisodeNaming {
    const defaults = defaultEpisodeNaming()
    const stored = readSetting<Record<string, unknown>>(db, EPISODE_NAMING_KEY, {})
    const out = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof EpisodeNaming)[]) {
      const field = episodeNamingSchema.shape[key].safeParse(stored[key])
      if (field.success) (out as Record<string, unknown>)[key] = field.data
    }
    return out
  }

  function saveNaming(input: EpisodeNaming): EpisodeNaming {
    const parsed = episodeNamingSchema.safeParse(input)
    if (!parsed.success) {
      const key = String(parsed.error.issues[0]?.path[0] ?? 'episodeNaming')
      throw invalid('That format isn’t valid. Check it and try again.', key)
    }
    writeSetting(db, EPISODE_NAMING_KEY, parsed.data, clock.now())
    return naming()
  }

  /** Every quality's limits per minute of an episode, lowest first; a missing one its default. */
  function sizes(): QualitySizes {
    const row = db.select().from(settings).where(eq(settings.key, EPISODE_SIZES_KEY)).get()
    const stored = new Map<string, QualitySizes[number]>()
    if (Array.isArray(row?.value))
      for (const entry of row.value) {
        const parsed = qualitySizeSchema.safeParse(entry)
        if (parsed.success) stored.set(parsed.data.quality, parsed.data)
      }
    const defaults = new Map(defaultEpisodeSizes().map((s) => [s.quality, s]))
    return QUALITY_NAMES.map((q) => stored.get(q) ?? (defaults.get(q) as QualitySizes[number]))
  }

  /** Checked as the films' sizes are (shared/profiles.ts `saveQualitySizes`). */
  function saveSizes(input: unknown): QualitySizes {
    const parsed = qualitySizesSchema.safeParse(input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const at = issue?.path[0]
      const row = typeof at === 'number' ? (input as { quality?: unknown }[])[at]?.quality : null
      const message = issue?.message ?? 'Check the sizes.'
      throw invalid(typeof row === 'string' ? `${row}: ${message}` : message, 'sizes')
    }
    const missing = QUALITY_NAMES.filter((q) => !parsed.data.some((r) => r.quality === q))
    if (missing.length) throw invalid(`Every quality needs a row: ${missing.join(', ')}.`, 'sizes')
    writeSetting(db, EPISODE_SIZES_KEY, parsed.data, clock.now())
    return sizes()
  }

  /** How many films and shows each profile is set on, for every profile with any. */
  function profileUsage(profileIds: string[]): ProfileUsage[] {
    const counts = db
      .select({
        profileId: mediaItems.qualityProfileId,
        type: mediaItems.type,
        n: sql<number>`count(*)`,
      })
      .from(mediaItems)
      .where(isNull(mediaItems.parentId))
      .groupBy(mediaItems.qualityProfileId, mediaItems.type)
      .all()
    const of = (id: string, type: 'movie' | 'show') =>
      counts.find((c) => c.profileId === id && c.type === type)?.n ?? 0
    return profileIds.map((id) => ({
      profileId: id,
      movies: of(id, 'movie'),
      shows: of(id, 'show'),
    }))
  }

  return { naming, saveNaming, sizes, saveSizes, profileUsage }
}

export type ShowSettings = ReturnType<typeof createShowSettings>
