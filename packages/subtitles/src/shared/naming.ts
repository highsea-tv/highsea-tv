// SPDX-License-Identifier: AGPL-3.0-only
// Sidecar names (owner's answer 7): the video file's name, the language, the flag, the format,
// so `Sintel (2010) Bluray-1080p.mkv` keeps `Sintel (2010) Bluray-1080p.en.srt`,
// `….en.forced.srt` and `….en.sdh.srt`. `.forced` is documented by Plex, Jellyfin and Kodi, `.sdh`
// by Plex, Jellyfin and Emby (https://emby.media/support/articles/Subtitles.html). Plex doesn't
// document combining flags, so a track that's both is named `.forced`. A second track with the same
// language and flags takes its provider's name as Jellyfin's title text: `….en.OpenSubtitles.srt`.
import { basename, dirname, extname, join } from 'node:path'

export type SidecarTrack = {
  language: string
  forced: boolean
  hi: boolean
  /** The file's extension without its dot: `srt`, `ass`, `vtt`, `sup`, `idx`. */
  format: string
}

/** The flag a sidecar's name carries, if any. */
export function sidecarFlag(track: Pick<SidecarTrack, 'forced' | 'hi'>): '' | 'forced' | 'sdh' {
  return track.forced ? 'forced' : track.hi ? 'sdh' : ''
}

/**
 * The sidecar's path beside `videoPath`. `title` is the extra part for a second track with the same
 * language and flags (the provider's name, made safe for a file name).
 */
export function sidecarPath(videoPath: string, track: SidecarTrack, title?: string): string {
  const base = basename(videoPath, extname(videoPath))
  const flag = sidecarFlag(track)
  const parts = [base, track.language]
  if (title) parts.push(title.replace(/[^\p{L}\p{N}]+/gu, ''))
  if (flag) parts.push(flag)
  return join(dirname(videoPath), `${parts.join('.')}.${track.format}`)
}

/**
 * Where a sidecar goes when its video is renamed: the same suffix after the new base name. `null`
 * when the sidecar doesn't belong to `oldVideo`.
 */
export function followVideo(sidecar: string, oldVideo: string, newVideo: string): string | null {
  const oldBase = basename(oldVideo, extname(oldVideo))
  const name = basename(sidecar)
  if (dirname(sidecar) !== dirname(oldVideo) || !name.startsWith(`${oldBase}.`)) return null
  return join(dirname(newVideo), basename(newVideo, extname(newVideo)) + name.slice(oldBase.length))
}
