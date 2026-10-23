// SPDX-License-Identifier: AGPL-3.0-only
// The `mediaManagement` settings row (checkpoint 6, Data › Settings rows): naming and importing,
// as Settings › Media management shows them. Radarr's naming defaults (NamingConfig.cs:
// https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/Organizer/NamingConfig.cs), with
// rename on (the checkpoint's judgement call 11: highsea owns the library from the first import).
import { isAbsolute } from 'node:path'
import { readSetting, writeSetting } from '@highsea-tv/db'
import { z } from 'zod'
import { invalid, type MediaDeps } from './context.ts'
import { checkFormat } from './naming.ts'

export const MEDIA_MANAGEMENT_KEY = 'mediaManagement'

/**
 * What Radarr's "Colon Replacement" offers (FileNameBuilder.cs, `ColonReplacementFormat`); `smart`
 * is its default: "Movie: Title" becomes "Movie - Title" and "12:30" becomes "12-30".
 */
export const COLON_REPLACEMENTS = [
  'delete',
  'dash',
  'space-dash',
  'space-dash-space',
  'smart',
] as const
export type ColonReplacement = (typeof COLON_REPLACEMENTS)[number]

/** Three octal digits (`755`), as Radarr's "chmod Folder" takes them. */
const OCTAL = /^[0-7]{3}$/

export const mediaManagementSchema = z.object({
  /** Off: files keep the name they came with. */
  rename: z.boolean(),
  folderFormat: z.string().trim().min(1).max(500),
  fileFormat: z.string().trim().min(1).max(500),
  colonReplacement: z.enum(COLON_REPLACEMENTS),
  /** Off: imports copy instead of hardlinking (Radarr's "Use Hardlinks instead of Copy"). */
  hardlinks: z.boolean(),
  /** A Kodi `.nfo` beside each file, with `poster.jpg` and `fanart.jpg` in the movie's folder. */
  nfo: z.boolean(),
  /** A movie whose file disappears outside highsea stops being monitored (6b's scan acts on it). */
  unmonitorDeleted: z.boolean(),
  /**
   * Radarr's "Set Permissions": `chmod` is applied to new folders, and to new files without the
   * execute bits (Servarr wiki, Radarr settings › Permissions:
   * https://wiki.servarr.com/radarr/settings#permissions).
   */
  permissions: z.boolean(),
  chmod: z.string().regex(OCTAL),
  /** Where replaced and deleted files go; empty deletes them. */
  recycleBin: z.string().trim().max(4096),
  /** Days a file stays in the recycle bin; 0 keeps them until emptied by hand (Radarr's rule). */
  recycleBinDays: z.number().int().min(0).max(3650),
})

export type MediaManagement = z.infer<typeof mediaManagementSchema>

export const defaultMediaManagement = (): MediaManagement => ({
  rename: true,
  folderFormat: '{Movie Title} ({Release Year})',
  fileFormat: '{Movie Title} ({Release Year}) {Quality Full}',
  colonReplacement: 'smart',
  hardlinks: true,
  nfo: false,
  unmonitorDeleted: true,
  permissions: false,
  chmod: '755',
  recycleBin: '',
  // Radarr's "Recycling Bin Cleanup" default
  recycleBinDays: 7,
})

export function createMediaManagement({ db, clock }: Pick<MediaDeps, 'db' | 'clock'>) {
  /** The stored row over the defaults; a stored value that no longer parses reads its default. */
  function get(): MediaManagement {
    const defaults = defaultMediaManagement()
    const stored = readSetting<Record<string, unknown>>(db, MEDIA_MANAGEMENT_KEY, {})
    const out = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof MediaManagement)[]) {
      const field = mediaManagementSchema.shape[key].safeParse(stored[key])
      if (field.success) (out as Record<string, unknown>)[key] = field.data
    }
    return out
  }

  /** Merges `patch` over what's stored. Refuses a format with a token highsea doesn't know. */
  function save(patch: Partial<MediaManagement>): MediaManagement {
    const parsed = mediaManagementSchema.safeParse({ ...get(), ...patch })
    if (!parsed.success) {
      const key = String(parsed.error.issues[0]?.path[0] ?? 'mediaManagement')
      throw invalid('That setting isn’t valid. Check it and try again.', key)
    }
    const next = parsed.data
    for (const key of ['folderFormat', 'fileFormat'] as const) {
      const problem = checkFormat(next[key], key === 'folderFormat' ? 'folder' : 'file')
      if (problem) throw invalid(problem, key)
    }
    if (next.recycleBin && !isAbsolute(next.recycleBin))
      throw invalid('Use a full path for the recycle bin, starting with /.', 'recycleBin')
    return writeSetting(db, MEDIA_MANAGEMENT_KEY, next, clock.now())
  }

  return { get, save }
}

export type MediaManagementSettings = ReturnType<typeof createMediaManagement>
