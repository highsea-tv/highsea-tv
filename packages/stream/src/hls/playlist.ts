// SPDX-License-Identifier: AGPL-3.0-only
// HLS playlists (ADR 0051, RFC 8216): the segments a film is cut into, and the playlists that list
// them. Pure, so the tests check them against RFC 8216's rules without ffmpeg.
//
// Every segment is made of whole pieces: the files ffmpeg writes, one per keyframe (`args.ts`).
// - A transcode forces a keyframe every `SEGMENT_SECONDS`, so a segment is one piece and its
//   length is known before it's made.
// - A direct stream copies the picture, so it can only be cut at the source's own keyframes. A
//   segment is the run of pieces from one keyframe to the first at least `SEGMENT_SECONDS` later.
// - Where a session starts, a direct stream's first segments are shorter (phase 5, A1's finding of
//   2026-11-17): a player shows nothing until its first segment has arrived whole, so 6 s of a
//   film's bitrate stood between Play and the picture. RFC 8216 only caps a segment's length at
//   the target duration (§ 4.3.3.1), so the first `QUICK_SPAN` seconds from the start are cut at
//   the first keyframe `QUICK_SECONDS` on, where the film has one.

/** Apple's HLS authoring specification recommends 6 s segments (its "Media segmentation" § 1.4). */
export const SEGMENT_SECONDS = 6

/** The shortest segment where a session starts, and how far from the start they're cut that short. */
export const QUICK_SECONDS = 2
export const QUICK_SPAN = 12

export type Segment = {
  /** Seconds into the film, as the segment's own timestamps say. */
  start: number
  duration: number
  /** The pieces it's made of, `first` to `last - 1`: ffmpeg's file numbers. */
  first: number
  last: number
}

/** A transcode's segments: every `length` seconds, the last one shorter. One piece each. */
export function gridSegments(duration: number, length = SEGMENT_SECONDS): Segment[] {
  const count = Math.max(1, Math.ceil(duration / length - 1e-9))
  return Array.from({ length: count }, (_, i) => ({
    start: i * length,
    duration: Math.min(length, duration - i * length),
    first: i,
    last: i + 1,
  }))
}

/**
 * Where a direct stream's pieces start: the film's start, then each keyframe after the first.
 * ffmpeg cuts at every keyframe, so piece `n` starts at `pieceStarts(...)[n]`, and a run started
 * there numbers its first file `n`. A stream begins with a keyframe, whose time may be a frame or
 * two in when the picture has B-frames, so the first piece is the film's start.
 */
export function pieceStarts(keyframes: readonly number[]): number[] {
  return [0, ...keyframes.slice(1)]
}

/**
 * A direct stream's segments, from the picture's keyframes (seconds into the film, ascending). A
 * segment runs from a piece's start to the first piece starting at least `length` later, so each
 * is as long as the keyframes allow and never shorter than `length`, but the last.
 *
 * With `from`, where the session starts, a segment begins at the piece holding it (so the one
 * before may be shorter than `length`), and the segments beginning within `QUICK_SPAN` seconds of
 * it need only be `QUICK_SECONDS` long: what the player waits for before its first frame.
 */
export function keyframeSegments(
  keyframes: readonly number[],
  duration: number,
  length = SEGMENT_SECONDS,
  from?: number,
): Segment[] {
  const starts = pieceStarts(keyframes).filter((t) => t < duration)
  // the piece holding the start: the last one starting at or before it
  let quick = -1
  if (from !== undefined)
    for (let k = 0; k < starts.length && (starts[k] as number) <= from; k++) quick = k
  const quickFrom = quick >= 0 ? (starts[quick] as number) : Number.NaN
  const segments: Segment[] = []
  let first = 0
  for (let k = 1; k <= starts.length; k++) {
    const start = starts[first] as number
    const at = k < starts.length ? (starts[k] as number) : duration
    const least = start >= quickFrom && start - quickFrom < QUICK_SPAN ? QUICK_SECONDS : length
    if (k < starts.length && k !== quick && at - start < Math.min(least, length)) continue
    segments.push({ start, duration: at - start, first, last: k })
    first = k
  }
  return segments
}

/** The index of the segment holding `seconds`. */
export function segmentAt(segments: readonly Segment[], seconds: number): number {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((segments[mid] as Segment).start <= seconds) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** EXTINF's decimal duration (RFC 8216 § 4.3.2.1), to the microsecond. */
const extinf = (seconds: number) => seconds.toFixed(6)

/**
 * The media playlist (RFC 8216 § 4.3.3): every segment from the start, since the film's length is
 * known (`EXT-X-PLAYLIST-TYPE:VOD`, § 4.3.3.5, with `EXT-X-ENDLIST`, § 4.3.3.4), in fragmented MP4
 * with its initialization section (`EXT-X-MAP`, § 4.3.2.5), which needs version 6 or later; 7 is
 * what ffmpeg's muxer writes for fMP4 (§ 7). `start` is where the session starts, in seconds.
 */
export function mediaPlaylist(
  segments: readonly Segment[],
  {
    init = 'init.mp4',
    uri = (i: number) => `${i}.m4s`,
    start = 0,
  }: { init?: string; uri?: (i: number) => string; start?: number } = {},
): string {
  // each EXTINF, rounded to the nearest integer, at most the target (§ 4.3.3.1)
  const target = Math.max(1, ...segments.map((s) => Math.round(s.duration)))
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${target}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    // where the session starts, when that's past the beginning: "By default, clients SHOULD start
    // playback at this point when beginning a playback session", at that moment rather than its
    // segment's start with PRECISE (§ 4.3.5.2). A player that takes it loads from there, never the
    // film's first segment; AVPlayer does, and hls.js is given the same place as its
    // `startPosition`.
    ...(start > 0 ? [`#EXT-X-START:TIME-OFFSET=${start.toFixed(3)},PRECISE=YES`] : []),
    `#EXT-X-MAP:URI="${init}"`,
  ]
  segments.forEach((s, i) => {
    lines.push(`#EXTINF:${extinf(s.duration)},`, uri(i))
  })
  lines.push('#EXT-X-ENDLIST', '')
  return lines.join('\n')
}

export type SubtitleRendition = {
  /** Unique in the group (§ 4.3.4.1.1). */
  name: string
  /** RFC 5646, from the track's language; null when it isn't known. */
  language: string | null
  forced: boolean
  uri: string
}

export type Variant = {
  /** The peak bits a second (§ 4.3.4.2): the stream's, or its cap. */
  bandwidth: number
  /** RFC 6381 codecs, when they're known; a copied stream's may not be (§ 4.3.4.2 says SHOULD). */
  codecs: string | null
  width: number | null
  height: number | null
  uri: string
}

/** A quoted-string attribute (§ 4.2): no double quotes, line feeds or carriage returns. */
const quoted = (s: string) => `"${s.replace(/["\r\n]/g, "'")}"`

/**
 * The multivariant playlist (§ 4.3.4): one variant per session (answer 7), with the text
 * subtitles as a rendition group (`EXT-X-MEDIA`, § 4.3.4.1), so Apple's players show them. None
 * is the default: the player turns on the person's pick.
 */
export function multivariantPlaylist(variant: Variant, subtitles: readonly SubtitleRendition[]) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS']
  for (const s of subtitles) {
    const attrs = [
      'TYPE=SUBTITLES',
      'GROUP-ID="subs"',
      `NAME=${quoted(s.name)}`,
      ...(s.language ? [`LANGUAGE=${quoted(s.language)}`] : []),
      'DEFAULT=NO',
      // FORCED needs AUTOSELECT=YES (§ 4.3.4.1)
      `AUTOSELECT=${s.forced ? 'YES' : 'NO'}`,
      `FORCED=${s.forced ? 'YES' : 'NO'}`,
      `URI=${quoted(s.uri)}`,
    ]
    lines.push(`#EXT-X-MEDIA:${attrs.join(',')}`)
  }
  const inf = [
    `BANDWIDTH=${Math.round(variant.bandwidth)}`,
    ...(variant.codecs ? [`CODECS=${quoted(variant.codecs)}`] : []),
    ...(variant.width && variant.height ? [`RESOLUTION=${variant.width}x${variant.height}`] : []),
    ...(subtitles.length ? ['SUBTITLES="subs"'] : []),
  ]
  lines.push(`#EXT-X-STREAM-INF:${inf.join(',')}`, variant.uri, '')
  return lines.join('\n')
}

/**
 * A subtitle rendition's media playlist (HT-49): a WebVTT segment for each of the picture's, at
 * the same times, since "all video variants and renditions MUST have segment boundaries at the
 * same points in time" (Apple's HLS authoring specification, 8.22), and for the whole film, cues
 * or none (5.5: "The subtitle playlist MUST exist for the entirety of the main content"). A
 * sidecar, a small file of its own, is one segment as long as the film. `uri` names segment `i`.
 */
export function subtitlePlaylist(segments: readonly Segment[], uri: (i: number) => string): string {
  const target = Math.max(1, ...segments.map((s) => Math.round(s.duration)))
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${target}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
  ]
  segments.forEach((s, i) => {
    lines.push(`#EXTINF:${extinf(s.duration)},`, uri(i))
  })
  lines.push('#EXT-X-ENDLIST', '')
  return lines.join('\n')
}
