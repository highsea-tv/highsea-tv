// SPDX-License-Identifier: AGPL-3.0-only
// The kinds of file a library holds, as the probe describes them (packages/media's MediaInfo):
// what the decision's matrix runs every built-in profile against. Facts only, so no ffmpeg.
import type { AudioInfo, MediaInfo, SubtitleInfo, VideoInfo } from '@highsea-tv/media/shared'

const video = (v: Partial<VideoInfo>): VideoInfo => ({
  index: 0,
  codec: 'h264',
  codecTag: null,
  profile: 'High',
  width: 1920,
  height: 1080,
  bitDepth: 8,
  bitrate: 0,
  colorPrimaries: null,
  colorTransfer: null,
  hdr: 'none',
  dolbyVision: null,
  ...v,
})

const audio = (index: number, a: Partial<AudioInfo>): AudioInfo => ({
  index,
  codec: 'aac',
  codecTag: null,
  profile: null,
  channels: 2,
  layout: null,
  language: 'eng',
  title: null,
  default: index === 1,
  bitrate: 0,
  ...a,
})

const subtitle = (index: number, codec: string): SubtitleInfo => ({
  index,
  codec,
  language: 'eng',
  title: null,
  forced: false,
  hi: false,
  default: false,
})

export type File = { path: string; size: number; info: MediaInfo }

/** `mbps` sets the size so the file's bitrate over its length is that many megabits a second. */
const file = (path: string, mbps: number, info: Omit<MediaInfo, 'duration'>): File => ({
  path,
  size: (mbps * 1_000_000 * 6000) / 8,
  info: { duration: 6000, ...info },
})

const MP4 = 'mov,mp4,m4a,3gp,3g2,mj2'
const MKV = 'matroska,webm'

export const FILES = {
  'mp4-h264-aac': file('/m/a.mp4', 6, {
    container: MP4,
    video: video({ codecTag: 'avc1' }),
    audio: [audio(1, {})],
    subtitles: [],
  }),
  'mkv-h264-ac3-srt': file('/m/b.mkv', 10, {
    container: MKV,
    video: video({}),
    audio: [
      audio(1, { codec: 'ac3', channels: 6 }),
      audio(2, { title: 'Commentary', default: false }),
    ],
    subtitles: [subtitle(3, 'subrip')],
  }),
  'mkv-hevc-hdr10-truehd-pgs': file('/m/c.mkv', 60, {
    container: MKV,
    video: video({
      codec: 'hevc',
      profile: 'Main 10',
      width: 3840,
      height: 2160,
      bitDepth: 10,
      hdr: 'hdr10',
    }),
    audio: [
      audio(1, { codec: 'truehd', channels: 8 }),
      audio(2, { codec: 'ac3', channels: 6, default: false }),
    ],
    subtitles: [subtitle(3, 'hdmv_pgs_subtitle')],
  }),
  'mp4-hevc-hev1': file('/m/d.mp4', 5, {
    container: MP4,
    video: video({ codec: 'hevc', codecTag: 'hev1', profile: 'Main' }),
    audio: [audio(1, {})],
    subtitles: [],
  }),
  'mp4-dv5': file('/m/e.mp4', 15, {
    container: MP4,
    video: video({
      codec: 'hevc',
      codecTag: 'dvh1',
      profile: 'Main 10',
      bitDepth: 10,
      hdr: 'dv',
      dolbyVision: { profile: 5, compatibility: 0 },
    }),
    audio: [audio(1, { codec: 'eac3', channels: 6 })],
    subtitles: [],
  }),
  'mkv-dv81': file('/m/f.mkv', 20, {
    container: MKV,
    video: video({
      codec: 'hevc',
      profile: 'Main 10',
      bitDepth: 10,
      hdr: 'dv-hdr10',
      dolbyVision: { profile: 8, compatibility: 1 },
    }),
    audio: [audio(1, { codec: 'eac3', channels: 6 })],
    subtitles: [],
  }),
  'webm-vp9-opus': file('/m/g.webm', 4, {
    container: MKV,
    video: video({ codec: 'vp9', profile: 'Profile 0' }),
    audio: [audio(1, { codec: 'opus' })],
    subtitles: [],
  }),
  'mkv-av1-opus': file('/m/h.mkv', 4, {
    container: MKV,
    video: video({ codec: 'av1', profile: 'Main', bitDepth: 10 }),
    audio: [audio(1, { codec: 'opus', channels: 6 })],
    subtitles: [subtitle(2, 'ass')],
  }),
  'mkv-h264-hi10p': file('/m/i.mkv', 8, {
    container: MKV,
    video: video({ profile: 'High 10', bitDepth: 10 }),
    audio: [audio(1, { codec: 'flac' })],
    subtitles: [],
  }),
  'avi-mpeg4-mp3': file('/m/j.avi', 1, {
    container: 'avi',
    video: video({
      codec: 'mpeg4',
      codecTag: 'XVID',
      profile: 'Advanced Simple Profile',
      width: 720,
      height: 400,
    }),
    audio: [audio(1, { codec: 'mp3' })],
    subtitles: [],
  }),
  'mkv-h264-dts': file('/m/k.mkv', 12, {
    container: MKV,
    video: video({}),
    audio: [audio(1, { codec: 'dts', profile: 'DTS-HD MA', channels: 8 })],
    subtitles: [],
  }),
} satisfies Record<string, File>

export type FileName = keyof typeof FILES
