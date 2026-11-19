// SPDX-License-Identifier: AGPL-3.0-only
// What a video on disk is, for every kind that files one (checkpoint 6's import, shared with shows
// in Phase 5 B, ADR 0064): whether it's skipped before it's probed (an extra, a macOS resource
// file), what ffprobe reads in it, whether it's a sample by its runtime, and its quality from its
// name and the probe. Films' import and shows' matching both call these, so a film and an episode
// are judged the same way.
import { AppError } from '@highsea-tv/core'
import type { ParsedRelease } from '@highsea-tv/parser'
import { isQualityName, type QualityName, qualityOf } from '@highsea-tv/quality'
import { type FoundFile, sampleReason, skipBeforeProbe } from './files.ts'
import { type MediaInfo, type Probe, ProbeError, resolutionOf } from './probe.ts'

/** A failure's message for the owner: an AppError's or a probe's own, else a plain one. */
export const fileErrorMessage = (e: unknown) =>
  e instanceof AppError || e instanceof ProbeError
    ? e.message
    : 'Something went wrong moving the file.'

/**
 * The file's quality: as grabbed when the download says, else the name's, with a resolution the
 * name leaves out taken from the probe, as Radarr and Sonarr augment a quality from media info
 * (Radarr's AugmentQualityFromMediaInfo: the width and height give the resolution, the source stays
 * unknown). A grab recorded as Unknown says nothing, so the file decides: an unnamed source at 480
 * or 576 lines is SDTV, at 720, 1080 or 2160 it's HDTV of that resolution (`qualityOf`, as Radarr's
 * QualityParser files a resolution with no source).
 */
export function qualityFor(
  release: ParsedRelease,
  info: MediaInfo | null,
  grabbed?: string | null,
): QualityName {
  if (grabbed && grabbed !== 'Unknown' && isQualityName(grabbed)) return grabbed
  const resolution = release.quality.resolution ?? resolutionOf(info?.video ?? null)
  return qualityOf({ ...release.quality, resolution })
}

export type Probed = { info: MediaInfo; skip: null } | { info: MediaInfo | null; skip: string }

/**
 * Probes a file, or says why it can't be filed: skipped by its name or folder under `root`, a probe
 * that fails, no video stream, or a sample shorter than `minimumSeconds` (DetectSample's rule).
 */
export async function probeFile(
  probe: Probe,
  file: FoundFile,
  root: string,
  minimumSeconds: number,
): Promise<Probed> {
  const early = skipBeforeProbe(file.path, root)
  if (early) return { info: null, skip: early }
  let info: MediaInfo
  try {
    info = await probe(file.path)
  } catch (e) {
    return { info: null, skip: fileErrorMessage(e) }
  }
  if (!info.video) return { info, skip: 'No video stream in the file. Skipped.' }
  const sample = sampleReason(file.path, file.size, info.duration, minimumSeconds)
  return sample ? { info, skip: sample } : { info, skip: null }
}
