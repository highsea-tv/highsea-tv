// SPDX-License-Identifier: AGPL-3.0-only
// Sizes per minute of runtime, per quality: a minimum, a preferred size and a maximum, in MB per
// minute as Radarr's Quality settings define them (https://wiki.servarr.com/radarr/settings#quality),
// where MB is a mebibyte. A release is checked against them times the movie's runtime, or times
// 110 minutes when the runtime isn't known, as Radarr does.
//
// Defaults: the TRaSH Guides' documented "Radarr Quality Definitions"
// (https://trash-guides.info/Radarr/Radarr-Quality-Settings-File-Size/, data in
// docs/json/radarr/quality-size/movie.json, MIT, commit 529bd9c). TRaSH sets a minimum for the HD
// and UHD qualities and leaves the preferred size and the maximum unlimited, relying on custom
// formats to choose between releases; unlimited is `null` here. Qualities TRaSH doesn't list have
// no minimum. Radarr's own shipped defaults aren't documented outside its source, so they aren't
// used (ADR 0031).
import { z } from 'zod'
import { QUALITY_NAMES, type QualityName } from './qualities.ts'

/** Minutes assumed when the movie's runtime isn't known. */
export const UNKNOWN_RUNTIME_MINUTES = 110

export const MIB = 1024 * 1024

export const qualitySizeSchema = z
  .object({
    quality: z.enum(QUALITY_NAMES),
    /** MiB per minute. */
    min: z.number().min(0),
    /** MiB per minute; `null` is as large as possible. */
    preferred: z.number().min(0).nullable(),
    /** MiB per minute; `null` is no limit. */
    max: z.number().min(0).nullable(),
  })
  .refine((s) => s.max === null || s.min <= s.max, { message: 'The minimum is above the maximum' })
  .refine(
    (s) => s.preferred === null || (s.preferred >= s.min && (s.max ?? s.preferred) >= s.preferred),
    {
      message: 'The preferred size is outside the range',
    },
  )
export type QualitySize = z.infer<typeof qualitySizeSchema>

/** The `qualitySizes` settings row: one entry per quality. */
export const qualitySizesSchema = z.array(qualitySizeSchema).superRefine((rows, ctx) => {
  const seen = new Set<string>()
  rows.forEach((r, i) => {
    if (seen.has(r.quality))
      ctx.addIssue({ code: 'custom', path: [i, 'quality'], message: `${r.quality} appears twice` })
    seen.add(r.quality)
  })
})
export type QualitySizes = z.infer<typeof qualitySizesSchema>

/** TRaSH's minimums, MiB per minute. */
const TRASH_MIN: Partial<Record<QualityName, number>> = {
  'HDTV-720p': 17.1,
  'WEBDL-720p': 12.5,
  'WEBRip-720p': 12.5,
  'Bluray-720p': 25.7,
  'HDTV-1080p': 33.8,
  'WEBDL-1080p': 12.5,
  'WEBRip-1080p': 12.5,
  'Bluray-1080p': 50.8,
  'Remux-1080p': 102,
  'HDTV-2160p': 85,
  'WEBDL-2160p': 34.5,
  'WEBRip-2160p': 34.5,
  'Bluray-2160p': 102,
  'Remux-2160p': 187.4,
}

/** Every quality, lowest first, with the defaults above. */
export const defaultQualitySizes = (): QualitySizes =>
  QUALITY_NAMES.map((quality) => ({
    quality,
    min: TRASH_MIN[quality] ?? 0,
    preferred: null,
    max: null,
  }))

export type SizeLimits = {
  /** Bytes. */
  min: number
  preferred: number | null
  max: number | null
  /** The runtime used, in minutes, and whether it was assumed. */
  minutes: number
  assumed: boolean
}

/** The byte limits for a quality and runtime. A quality with no row has no limits. */
export function sizeLimits(
  sizes: readonly QualitySize[],
  quality: QualityName,
  runtimeMinutes: number | null | undefined,
): SizeLimits {
  const assumed = !runtimeMinutes || runtimeMinutes <= 0
  const minutes = assumed ? UNKNOWN_RUNTIME_MINUTES : runtimeMinutes
  const row = sizes.find((s) => s.quality === quality)
  const bytes = (perMinute: number) => Math.round(perMinute * MIB * minutes)
  return {
    min: row ? bytes(row.min) : 0,
    preferred: row?.preferred == null ? null : bytes(row.preferred),
    max: row?.max == null ? null : bytes(row.max),
    minutes,
    assumed,
  }
}
