// SPDX-License-Identifier: AGPL-3.0-only
// The `subtitles` settings row: Settings › Subtitles' Scoring and sync, the prototype's
// `SubtitleSettings` with its defaults. Sync to the audio and Minimum confidence are saved now and
// act once the sync engine arrives (7b).
import { AppError, type Clock } from '@highsea/core'
import { type Db, readSetting, writeSetting } from '@highsea/db'
import { z } from 'zod'
import type { SubtitleSettings } from './types.ts'

export const SUBTITLES_KEY = 'subtitles'

export const settingsSchema = z.object({
  minScore: z.number().int().min(0).max(100),
  autoSync: z.boolean(),
  minConfidence: z.number().min(0).max(1),
  upgradeDays: z.number().int().min(0).max(365),
  preferReleaseMatch: z.boolean(),
})

export const defaultSettings = (): SubtitleSettings => ({
  minScore: 80,
  autoSync: true,
  minConfidence: 0.7,
  upgradeDays: 14,
  preferReleaseMatch: true,
})

export function createSettings({ db, clock }: { db: Db; clock: Clock }) {
  /** The stored row over the defaults; a field that no longer parses reads its default. */
  function get(): SubtitleSettings {
    const defaults = defaultSettings()
    const stored = readSetting<Record<string, unknown>>(db, SUBTITLES_KEY, {})
    const out = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof SubtitleSettings)[]) {
      const field = settingsSchema.shape[key].safeParse(stored[key])
      if (field.success) (out as Record<string, unknown>)[key] = field.data
    }
    return out
  }

  function save(patch: Partial<SubtitleSettings>): SubtitleSettings {
    const parsed = settingsSchema.safeParse({ ...get(), ...patch })
    if (!parsed.success) {
      const key = String(parsed.error.issues[0]?.path[0] ?? SUBTITLES_KEY)
      throw new AppError('invalid', 'That setting isn’t valid. Check it and try again.', {
        reason: key,
      })
    }
    return writeSetting(db, SUBTITLES_KEY, parsed.data, clock.now())
  }

  return { get, save }
}

export type Settings = ReturnType<typeof createSettings>
