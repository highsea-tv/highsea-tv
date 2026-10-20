// SPDX-License-Identifier: AGPL-3.0-only
// The bundled TRaSH Guides custom formats (MIT; presets/SOURCES.md has the commit and the notice),
// and the formats a new server starts with: the prototype's four, with its ids and names, built
// from the TRaSH presets they stand for.

import type { CustomFormat } from './formats.ts'
import p3d from './presets/radarr/3d.json' with { type: 'json' }
import p2160 from './presets/radarr/2160p.json' with { type: 'json' }
import amzn from './presets/radarr/amzn.json' with { type: 'json' }
import brDisk from './presets/radarr/br-disk.json' with { type: 'json' }
import dtsHdMa from './presets/radarr/dts-hd-ma.json' with { type: 'json' }
import dvBoost from './presets/radarr/dv-boost.json' with { type: 'json' }
import freeleech from './presets/radarr/freeleech.json' with { type: 'json' }
import hdr from './presets/radarr/hdr.json' with { type: 'json' }
import hdr10plusBoost from './presets/radarr/hdr10plus-boost.json' with { type: 'json' }
import imax from './presets/radarr/imax.json' with { type: 'json' }
import notEnglish from './presets/radarr/language-not-english.json' with { type: 'json' }
import notOriginal from './presets/radarr/language-not-original.json' with { type: 'json' }
import lq from './presets/radarr/lq.json' with { type: 'json' }
import lqTitle from './presets/radarr/lq-release-title.json' with { type: 'json' }
import remuxTier01 from './presets/radarr/remux-tier-01.json' with { type: 'json' }
import repackProper from './presets/radarr/repack-proper.json' with { type: 'json' }
import truehdAtmos from './presets/radarr/truehd-atmos.json' with { type: 'json' }
import upscaled from './presets/radarr/upscaled.json' with { type: 'json' }
import webdlBoost from './presets/radarr/webdl-boost.json' with { type: 'json' }
import wrongLanguage from './presets/radarr/wrong-language.json' with { type: 'json' }
import x264 from './presets/radarr/x264.json' with { type: 'json' }
import x265Hd from './presets/radarr/x265-hd.json' with { type: 'json' }
import { importTrashFormat } from './trash.ts'

/** The TRaSH JSON as published, by file name. */
export const TRASH_PRESETS: Readonly<Record<string, unknown>> = {
  '2160p': p2160,
  '3d': p3d,
  amzn,
  'br-disk': brDisk,
  'dts-hd-ma': dtsHdMa,
  'dv-boost': dvBoost,
  freeleech,
  hdr,
  'hdr10plus-boost': hdr10plusBoost,
  imax,
  'language-not-english': notEnglish,
  'language-not-original': notOriginal,
  lq,
  'lq-release-title': lqTitle,
  'remux-tier-01': remuxTier01,
  'repack-proper': repackProper,
  'truehd-atmos': truehdAtmos,
  upscaled,
  'webdl-boost': webdlBoost,
  'wrong-language': wrongLanguage,
  x264,
  'x265-hd': x265Hd,
}

/** Every bundled preset as a highsea format, ids `trash-{trash_id}`. */
export const presetFormats = (): CustomFormat[] =>
  Object.values(TRASH_PRESETS).map((json) => importTrashFormat(json).format)

/** A preset under the prototype's id and name, keeping only the conditions named. */
function seed(id: string, name: string, json: unknown, keep?: string[]): CustomFormat {
  const { format } = importTrashFormat(json, { id })
  const conditions = keep
    ? format.conditions.filter((c) => keep.includes(c.name)).map((c) => ({ ...c, required: false }))
    : format.conditions
  return { ...format, name, conditions }
}

/**
 * The formats a new server starts with, as the prototype seeds them:
 * - Dolby Vision: TRaSH's "DV Boost" pattern;
 * - HDR10: the "HDR" and "HDR10" patterns of TRaSH's "HDR";
 * - x265: the x265/HEVC pattern of TRaSH's "x265 (HD)", as a bonus at any resolution;
 * - Low-quality groups: TRaSH's "LQ" groups.
 */
export const seedFormats = (): CustomFormat[] => [
  seed('cf-dv', 'Dolby Vision', dvBoost),
  seed('cf-hdr10', 'HDR10', hdr, ['HDR', 'HDR10']),
  seed('cf-x265', 'x265', x265Hd, ['x265/HEVC']),
  seed('cf-lq', 'Low-quality groups', lq),
]
