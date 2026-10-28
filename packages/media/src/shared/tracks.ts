// SPDX-License-Identifier: AGPL-3.0-only
// What the player shows of a version's file (player.md): its sound tracks, and the line under the
// version's name ("4K · HDR10 · HEVC · 18.2 GB"), both from the stored probe. Subtitle tracks are
// the subtitles package's (ADR 0043).
import type { ClientAudio } from '@highsea-tv/api-contract'
import { streamLanguage } from '@highsea-tv/parser'
import { type AudioInfo, audioChannelsOf, type MediaInfo, resolutionOf } from './probe.ts'

const NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'code' })

const languageName = (code: string) => {
  try {
    return NAMES.of(code) ?? code
  } catch {
    return code
  }
}

/** A track's id, as the player's picks and the decision name it: `{fileId}:{stream index}`. */
export const trackId = (fileId: string, index: number) => `${fileId}:${index}`

/** The stream index in a track id of this file, or null when the id is another file's. */
export function trackIndex(fileId: string, id: string): number | null {
  if (!id.startsWith(`${fileId}:`)) return null
  const n = Number(id.slice(fileId.length + 1))
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** The file's sound tracks, in its order, labelled by language and then title or channels. */
export function audioTracks(fileId: string, info: MediaInfo | null): ClientAudio[] {
  return (info?.audio ?? []).map((a: AudioInfo) => {
    const language = streamLanguage(a.language) ?? ''
    const detail = a.title?.trim() || audioChannelsOf(a) || null
    const name = language ? languageName(language) : 'Unknown language'
    return {
      id: trackId(fileId, a.index),
      language,
      label: detail ? `${name} · ${detail}` : name,
      detail,
      codec: a.codec,
      channels: a.channels,
      default: a.default,
    }
  })
}

const HDR: Record<string, string> = {
  hdr10: 'HDR10',
  hdr10plus: 'HDR10+',
  hlg: 'HLG',
  pq: 'HDR',
  dv: 'Dolby Vision',
  'dv-hdr10': 'Dolby Vision',
  'dv-hdr10plus': 'Dolby Vision',
  'dv-hlg': 'Dolby Vision',
  'dv-sdr': 'Dolby Vision',
}

const CODECS: Record<string, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  av1: 'AV1',
  vp9: 'VP9',
  vp8: 'VP8',
  mpeg2video: 'MPEG-2',
  mpeg4: 'MPEG-4',
}

/** "4K · HDR10 · HEVC · 18.2 GB"; the parts the probe doesn't know are left out. */
export function versionDetail(info: MediaInfo | null, size: number): string {
  const v = info?.video ?? null
  const lines = resolutionOf(v)
  const parts = [
    lines === 2160 ? '4K' : lines ? `${lines}p` : null,
    v ? (HDR[v.hdr] ?? null) : null,
    v ? (CODECS[v.codec] ?? v.codec.toUpperCase()) : null,
    `${(size / 1e9).toFixed(1)} GB`,
  ]
  return parts.filter(Boolean).join(' · ')
}
