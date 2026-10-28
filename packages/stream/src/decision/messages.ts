// SPDX-License-Identifier: AGPL-3.0-only
// What the playback decision says (ADR 0021), for Now playing, the test page and the tests. Each
// reason names the client and the fact that decided it, as the quality decision's do (ADR 0031).
import { createT, defineMessages, type T } from '@highsea-tv/i18n'

export const streamMessages = defineMessages({
  // The outcome
  'method.directPlay': 'Plays as it is',
  'method.directStream': 'The picture is sent as it is, in a stream {client} can play',
  'method.transcode': 'The picture is made again as H.264 at {height}p',
  'method.unplayable': '{client} can’t play a stream made for it',
  // The container
  'container.supported': '{client} opens {container} files',
  'container.unsupported': '{client} can’t open {container} files',
  'container.unknown': 'The file’s container isn’t known',
  // The picture
  'video.supported': '{client} plays {codec} at {bitDepth} bits',
  'video.codec': '{client} can’t play {codec} video',
  'video.profile': '{client} can’t play {codec} {profile}',
  'video.bitDepth': '{client} can’t play {bitDepth}-bit {codec}',
  'video.size': '{width}×{height} is larger than {client} plays',
  'video.tag': '{client} needs HEVC tagged {tag}; this file is tagged {actual}',
  'video.none': 'The file has no picture',
  // HDR
  'hdr.supported': '{client} shows {hdr}',
  'hdr.fallback': '{client} can’t show {hdr}, and plays its {fallback} layer',
  'hdr.unsupported': '{client} can’t show {hdr}',
  'hdr.washedOut': 'Made into SDR without tone mapping, so the colours look washed out',
  // The bitrate
  'bitrate.over': '{bitrate} is over the limit of {limit}',
  'bitrate.height': '{height}p is over the limit of {limit}p',
  // Sound
  'audio.supported':
    '{client} plays {codec} with {channels, plural, one {# channel} other {# channels}}',
  'audio.passthrough': '{codec} is passed through to the receiver',
  'audio.codec': '{client} can’t play {codec}, so it’s made into AAC',
  'audio.channels': '{client} plays up to {max} channels of {codec}, so it’s mixed down',
  'audio.track': '{client} can’t choose a file’s sound track, so {track} is put first',
  'audio.none': 'The file has no sound',
  // Subtitles
  'subtitle.external': '{format} subtitles are sent alongside as WebVTT',
  'subtitle.embedded': '{client} draws {format} subtitles itself',
  'subtitle.styling': 'ASS styling isn’t kept in WebVTT',
  'subtitle.burnIn': '{client} can’t draw {format} subtitles, so they’re burned into the picture',
  'subtitle.unavailable': '{format} subtitles can’t be shown yet',
})

export type StreamMessages = typeof streamMessages
export type StreamT = T<StreamMessages>
export type StreamMessageId = keyof StreamMessages & string

export const streamT = (locale = 'en'): StreamT => createT(streamMessages, locale)
