// SPDX-License-Identifier: AGPL-3.0-only
// A film's keyframes from the container's own index, read in a few small pieces instead of the
// whole file (HT-48; ADR 0051's section of 2026-11-17). ffprobe can list keyframes only from the
// packets, which reads every byte of the picture, and has no option that prints the demuxer's
// index (https://ffmpeg.org/ffprobe.html), so the two indexes are read here. Each is a few
// fixed-size fields in a tree of sized elements, so a reader is short and needs no dependency:
//
// - **Matroska** (RFC 9559): the `Cues` element, "a temporal index" (§ 4.5). "For each video track,
//   each keyframe SHOULD be referenced by a `CuePoint` element" (§ 22.1), with its `CueTime` in
//   Segment Ticks, "timestamp in nanosecond = element value * TimestampScale" (§ 11.1.2). The Cues
//   are found among the Segment's first elements or through the `SeekHead` (§ 5.1.1). mkvmerge
//   indexes every I frame of a video track by default (https://mkvtoolnix.download/doc/mkvmerge.html,
//   `--cues`), and ffmpeg every video keyframe when its output can seek (`matroskaenc.c`).
// - **MP4 and MOV** (ISO/IEC 14496-12): the sync sample table, `stss` (§ 8.6.2), lists the
//   picture's keyframes by sample number; a sample's decode time comes from `stts` (§ 8.6.1.2), its
//   composition offset from `ctts` (§ 8.6.1.3) and the start of the media from the edit list
//   (`elst`, § 8.6.6). Without `stss` "every sample is a sync sample", which is left to the full
//   read, as are fragmented files (`mvex`, § 8.8.1), whose samples aren't in `moov`.
//
// "SHOULD" isn't "MUST", and a piece's number follows every keyframe (`pieceStarts` in
// `playlist.ts`), so a list with one missing would serve the wrong pictures. The runner checks
// what's read here against ffprobe's own packets in a few windows before using it (`runner.ts`).
import { open } from 'node:fs/promises'

/** Reads pieces of a file at a position, counting the bytes, so a measure can say what it read. */
export type Reader = {
  size: number
  read(position: number, length: number): Promise<Buffer>
  bytes: number
}

export async function fileReader(path: string): Promise<Reader & { close(): Promise<void> }> {
  const handle = await open(path, 'r')
  const { size } = await handle.stat()
  const reader = {
    size,
    bytes: 0,
    async read(position: number, length: number) {
      const len = Math.max(0, Math.min(length, size - position))
      const buffer = Buffer.alloc(len)
      const { bytesRead } = await handle.read(buffer, 0, len, position)
      reader.bytes += bytesRead
      return buffer.subarray(0, bytesRead)
    },
    close: () => handle.close(),
  }
  return reader
}

/** No index to use, and why: the runner reads the packets instead. */
export class NoIndex extends Error {}

/** The largest index element read: a film's Cues or `moov` is a few megabytes. */
const MAX_INDEX = 256 * 1024 * 1024

// ---------------------------------------------------------------------------------------------
// Matroska

const EBML = 0x1a45dfa3
const SEGMENT = 0x18538067
const SEEK_HEAD = 0x114d9b74
const SEEK = 0x4dbb
const SEEK_ID = 0x53ab
const SEEK_POSITION = 0x53ac
const INFO = 0x1549a966
const TIMESTAMP_SCALE = 0x2ad7b1
const TRACKS = 0x1654ae6b
const TRACK_ENTRY = 0xae
const TRACK_NUMBER = 0xd7
const TRACK_TYPE = 0x83
const TRACK_TIMESTAMP_SCALE = 0x23314f
const CUES = 0x1c53bb6b
const CUE_POINT = 0xbb
const CUE_TIME = 0xb3
const CUE_TRACK_POSITIONS = 0xb7
const CUE_TRACK = 0xf7
const CLUSTER = 0x1f43b675

type Element = { id: number; size: number | null; data: number }

/** An EBML variable-size integer at `at` (RFC 8794 § 4): its length and value, marker kept or not. */
function vint(b: Buffer, at: number, keepMarker: boolean): { length: number; value: number } {
  const first = b[at]
  if (first === undefined || first === 0) throw new NoIndex('The Matroska file isn’t readable.')
  const length = Math.clz32(first) - 23
  if (at + length > b.length) throw new NoIndex('The Matroska file ends early.')
  let value = keepMarker ? first : first & (0xff >> length)
  let ones = value === 0xff >> length
  for (let i = 1; i < length; i++) {
    const byte = b[at + i] as number
    value = value * 256 + byte
    if (byte !== 0xff) ones = false
  }
  // a size of all ones is "unknown" (RFC 8794 § 6.2)
  return { length, value: !keepMarker && ones ? -1 : value }
}

/** An element's header at `at` in `b`: its ID, its data's size (null when unknown) and offset. */
function header(b: Buffer, at: number): Element & { headerLength: number } {
  const id = vint(b, at, true)
  const size = vint(b, at + id.length, false)
  return {
    id: id.value,
    size: size.value < 0 ? null : size.value,
    data: at + id.length + size.length,
    headerLength: id.length + size.length,
  }
}

/** The children of an element held whole in `b`, from `start` to `end`. */
function* children(b: Buffer, start: number, end: number): Generator<Element> {
  let at = start
  while (at < end) {
    const h = header(b, at)
    if (h.size === null) throw new NoIndex('An index element has no size.')
    yield h
    at = h.data + h.size
  }
}

const uint = (b: Buffer, e: Element) => {
  let v = 0
  for (let i = 0; i < (e.size ?? 0); i++) v = v * 256 + (b[e.data + i] as number)
  return v
}

const float = (b: Buffer, e: Element) =>
  e.size === 4 ? b.readFloatBE(e.data) : e.size === 8 ? b.readDoubleBE(e.data) : 0

/** Reads one element whole, at a file position. */
async function element(r: Reader, position: number): Promise<{ b: Buffer; e: Element }> {
  const head = header(await r.read(position, 12), 0)
  if (head.size === null) throw new NoIndex('An index element has no size.')
  if (head.size > MAX_INDEX) throw new NoIndex('An index element is too large.')
  const b = await r.read(position, head.headerLength + head.size)
  if (b.length < head.headerLength + head.size) throw new NoIndex('The file ends inside its index.')
  return { b, e: { id: head.id, size: head.size, data: head.headerLength } }
}

/**
 * The keyframes' times in seconds, as ffprobe prints a packet's `pts_time`, of the `nth` video
 * track (0 for the first) from a Matroska file's Cues.
 */
export async function matroskaKeyframes(r: Reader, nth: number): Promise<number[]> {
  const ebml = header(await r.read(0, 12), 0)
  if (ebml.id !== EBML || ebml.size === null) throw new NoIndex('It isn’t a Matroska file.')
  const segmentAt = ebml.data + ebml.size
  const segment = header(await r.read(segmentAt, 12), 0)
  if (segment.id !== SEGMENT) throw new NoIndex('The Matroska file has no Segment.')
  const base = segmentAt + segment.headerLength
  const end = segment.size === null ? r.size : Math.min(r.size, base + segment.size)

  // the Segment's first elements, up to its first Cluster: Info and Tracks are there, the Cues
  // when written in front (§ 6.4), and the SeekHead, which says where the rest are
  const at = new Map<number, number>()
  const heads: number[] = []
  let position = base
  for (let n = 0; n < 64 && position < end; n++) {
    const h = header(await r.read(position, 12), 0)
    if (h.id === CLUSTER || h.size === null) break
    if (h.id === SEEK_HEAD) heads.push(position)
    else if (!at.has(h.id)) at.set(h.id, position)
    position += h.headerLength + h.size
  }
  // a SeekHead can point at a second one (§ 5.1.1: "Contains seeking information of Top-Level
  // Elements"); one more level is followed
  for (let i = 0; i < heads.length && i < 4; i++) {
    const { b, e } = await element(r, heads[i] as number)
    for (const seek of children(b, e.data, e.data + (e.size ?? 0))) {
      if (seek.id !== SEEK) continue
      let id = 0
      let to = -1
      for (const f of children(b, seek.data, seek.data + (seek.size ?? 0))) {
        if (f.id === SEEK_ID) id = uint(b, f)
        else if (f.id === SEEK_POSITION) to = base + uint(b, f)
      }
      if (to < base || to >= end) continue
      if (id === SEEK_HEAD && !heads.includes(to)) heads.push(to)
      else if (id && !at.has(id)) at.set(id, to)
    }
  }

  const cuesAt = at.get(CUES)
  if (cuesAt === undefined) throw new NoIndex('The Matroska file has no Cues.')
  const tracksAt = at.get(TRACKS)
  if (tracksAt === undefined) throw new NoIndex('The Matroska file has no Tracks.')

  let scale = 1_000_000
  const infoAt = at.get(INFO)
  if (infoAt !== undefined) {
    const { b, e } = await element(r, infoAt)
    if (e.id !== INFO) throw new NoIndex('The SeekHead points away from Info.')
    for (const f of children(b, e.data, e.data + (e.size ?? 0)))
      if (f.id === TIMESTAMP_SCALE) scale = uint(b, f) || scale
  }

  let track = -1
  {
    const { b, e } = await element(r, tracksAt)
    if (e.id !== TRACKS) throw new NoIndex('The SeekHead points away from Tracks.')
    let seen = 0
    for (const entry of children(b, e.data, e.data + (e.size ?? 0))) {
      if (entry.id !== TRACK_ENTRY) continue
      let number = -1
      let type = 0
      let trackScale = 1
      for (const f of children(b, entry.data, entry.data + (entry.size ?? 0))) {
        if (f.id === TRACK_NUMBER) number = uint(b, f)
        else if (f.id === TRACK_TYPE) type = uint(b, f)
        else if (f.id === TRACK_TIMESTAMP_SCALE) trackScale = float(b, f)
      }
      // video is TrackType 1 (§ 5.1.4.1.3)
      if (type !== 1) continue
      if (seen++ !== nth) continue
      // a track's own scale, long deprecated (§ 5.1.4.1.15), isn't worth reading for
      if (trackScale !== 1) throw new NoIndex('The picture has a scale of its own.')
      track = number
    }
  }
  if (track < 0) throw new NoIndex('The Matroska file has no such picture.')

  const { b, e } = await element(r, cuesAt)
  if (e.id !== CUES) throw new NoIndex('The SeekHead points away from the Cues.')
  const ticks: number[] = []
  for (const point of children(b, e.data, e.data + (e.size ?? 0))) {
    if (point.id !== CUE_POINT) continue
    let time = -1
    let mine = false
    for (const f of children(b, point.data, point.data + (point.size ?? 0))) {
      if (f.id === CUE_TIME) time = uint(b, f)
      else if (f.id === CUE_TRACK_POSITIONS)
        for (const g of children(b, f.data, f.data + (f.size ?? 0)))
          if (g.id === CUE_TRACK && uint(b, g) === track) mine = true
    }
    if (mine && time >= 0) ticks.push(time)
  }
  if (!ticks.length) throw new NoIndex('The Cues list none of the picture’s keyframes.')
  // ffmpeg's Matroska streams count in TimestampScale's units, so a packet's time is its ticks
  // times the scale (https://ffmpeg.org/doxygen/trunk/matroskadec_8c_source.html)
  return ticks.map((t) => round6((t * scale) / 1e9))
}

// ---------------------------------------------------------------------------------------------
// MP4 and MOV

type Box = { type: string; data: number; end: number }

/** The boxes in `b` from `start` to `end` (ISO/IEC 14496-12 § 4.2). */
function* boxes(b: Buffer, start: number, end: number): Generator<Box> {
  let at = start
  while (at + 8 <= end) {
    let size = b.readUInt32BE(at)
    const type = b.toString('latin1', at + 4, at + 8)
    let data = at + 8
    if (size === 1) {
      size = Number(b.readBigUInt64BE(at + 8))
      data = at + 16
    } else if (size === 0) size = end - at
    if (size < data - at || at + size > end) throw new NoIndex('An MP4 box runs past its parent.')
    yield { type, data, end: at + size }
    at += size
  }
}

const child = (b: Buffer, parent: Box, type: string) => {
  for (const x of boxes(b, parent.data, parent.end)) if (x.type === type) return x
  return null
}

const path = (b: Buffer, parent: Box, ...types: string[]) => {
  let box: Box | null = parent
  for (const t of types) box = box ? child(b, box, t) : null
  return box
}

/** The `moov` box whole, found among the file's top-level boxes. */
async function movie(r: Reader): Promise<{ b: Buffer; moov: Box }> {
  let at = 0
  for (let n = 0; n < 1024 && at + 8 <= r.size; n++) {
    const h = await r.read(at, 16)
    let size = h.readUInt32BE(0)
    const type = h.toString('latin1', 4, 8)
    if (size === 1) size = Number(h.readBigUInt64BE(8))
    else if (size === 0) size = r.size - at
    if (size < 8) throw new NoIndex('The MP4 file isn’t readable.')
    if (type === 'moov') {
      if (size > MAX_INDEX) throw new NoIndex('The MP4 index is too large.')
      const b = await r.read(at, size)
      if (b.length < size) throw new NoIndex('The file ends inside its index.')
      const data = h.readUInt32BE(0) === 1 ? 16 : 8
      return { b, moov: { type, data, end: size } }
    }
    at += size
  }
  throw new NoIndex('The MP4 file has no moov.')
}

/**
 * The keyframes' times in seconds, as ffprobe prints a packet's `pts_time`, of the video track
 * whose `track_ID` is `id` (or, without one, the `nth` video track) from an MP4 or MOV file's
 * sample tables.
 */
export async function mp4Keyframes(r: Reader, id: number | null, nth: number): Promise<number[]> {
  const { b, moov } = await movie(r)
  if (child(b, moov, 'mvex')) throw new NoIndex('The MP4 file is fragmented.')
  let seen = 0
  let trak: Box | null = null
  for (const t of boxes(b, moov.data, moov.end)) {
    if (t.type !== 'trak') continue
    const hdlr = path(b, t, 'mdia', 'hdlr')
    // the handler type follows the version, flags and pre_defined (§ 8.4.3)
    if (!hdlr || b.toString('latin1', hdlr.data + 8, hdlr.data + 12) !== 'vide') continue
    const tkhd = child(b, t, 'tkhd')
    // track_ID follows the creation and modification times, 4 or 8 bytes each by version (§ 8.3.2)
    const trackId = tkhd ? b.readUInt32BE(tkhd.data + (b[tkhd.data] === 1 ? 20 : 12)) : -1
    if (id !== null ? trackId === id : seen === nth) trak = t
    seen++
  }
  if (!trak) throw new NoIndex('The MP4 file has no such picture.')

  const mdhd = path(b, trak, 'mdia', 'mdhd')
  const stbl = path(b, trak, 'mdia', 'minf', 'stbl')
  if (!mdhd || !stbl) throw new NoIndex('The picture has no sample tables.')
  // timescale follows the creation and modification times (§ 8.4.2)
  const timescale = b.readUInt32BE(mdhd.data + (b[mdhd.data] === 1 ? 20 : 12))
  const stss = child(b, stbl, 'stss')
  const stts = child(b, stbl, 'stts')
  if (!stss) throw new NoIndex('The picture has no sync sample table.')
  if (!stts || !timescale) throw new NoIndex('The picture has no decode times.')

  // the edit list: one edit that starts the media at `media_time`, at the normal rate, is what
  // ffmpeg's muxer and most others write; anything else is left to the full read
  let mediaTime = 0
  const elst = path(b, trak, 'edts', 'elst')
  if (elst) {
    const v1 = b[elst.data] === 1
    const count = b.readUInt32BE(elst.data + 4)
    if (count > 1) throw new NoIndex('The picture has more than one edit.')
    if (count === 1) {
      const at = elst.data + 8
      mediaTime = v1 ? Number(b.readBigInt64BE(at + 8)) : b.readInt32BE(at + 4)
      const rate = b.readInt16BE(at + (v1 ? 16 : 8))
      if (mediaTime < 0 || rate !== 1) throw new NoIndex('The picture’s edit isn’t a plain one.')
    }
  }

  const sync: number[] = []
  const syncCount = b.readUInt32BE(stss.data + 4)
  for (let i = 0; i < syncCount; i++) sync.push(b.readUInt32BE(stss.data + 8 + i * 4))
  if (!sync.length) throw new NoIndex('The sync sample table is empty.')

  // runs of decode durations (§ 8.6.1.2) and composition offsets (§ 8.6.1.3), walked to each
  // sync sample in turn; the offsets are read signed, as ffmpeg reads both versions
  const runs = (box: Box | null) => {
    if (!box) return []
    const n = box ? b.readUInt32BE(box.data + 4) : 0
    return Array.from({ length: n }, (_, i) => ({
      count: b.readUInt32BE(box.data + 8 + i * 8),
      value: b.readInt32BE(box.data + 12 + i * 8),
    }))
  }
  const durations = runs(stts)
  const offsets = runs(child(b, stbl, 'ctts'))
  const samples = durations.reduce((n, d) => n + d.count, 0)

  const times: number[] = []
  let d = 0
  let dLeft = durations[0]?.count ?? 0
  let dts = 0
  let o = 0
  let oLeft = offsets[0]?.count ?? 0
  let sample = 1
  for (const target of sync) {
    if (target < sample || target > samples) throw new NoIndex('The sync samples are out of order.')
    while (sample < target) {
      dts += durations[d]?.value ?? 0
      if (--dLeft === 0) dLeft = durations[++d]?.count ?? 0
      if (offsets.length && --oLeft === 0) oLeft = offsets[++o]?.count ?? 0
      sample++
    }
    const offset = offsets.length ? (offsets[o]?.value ?? 0) : 0
    times.push(round6((dts + offset - mediaTime) / timescale))
  }
  return times
}

// ---------------------------------------------------------------------------------------------
// The check

/** A millisecond: less than a frame, so a window's end takes in the keyframe it names. */
const PAST = 0.001

export type Window = { interval: string; edge: 'start' | 'middle' | 'end' }

/**
 * Where to check an index against ffprobe's packets, a keyframe's gap or so each: from the file's
 * start through its second keyframe, so nothing comes before the first; one gap in the middle; and
 * from the last keyframe to the file's end, so the index reaches it (it covers the film's length).
 * A writer indexes the whole file the same way, so a gap checked in the middle stands for the
 * rest. An index too short to check this way isn't used.
 */
export function windows(keys: readonly number[]): Window[] | null {
  const n = keys.length
  if (n < 4) return null
  // ffprobe seeks to a window's start with `avformat_seek_file(…, -INT64_MAX, target, INT64_MAX, 0)`
  // (fftools/ffprobe.c), which may land on the keyframe at or after the target: half a
  // millisecond before the keyframe lands on it or the one before, never the one after
  const at = (i: number) => Math.max(0, (keys[i] as number) - PAST / 2).toFixed(6)
  const past = (i: number) => ((keys[i] as number) + PAST).toFixed(6)
  const m = Math.floor(n / 2)
  return [
    { interval: `%${past(1)}`, edge: 'start' },
    { interval: `${at(m)}%${past(m + 1)}`, edge: 'middle' },
    { interval: `${at(n - 1)}%`, edge: 'end' },
  ]
}

/**
 * Whether the keyframes ffprobe found in a window are the index's over the same stretch: from its
 * first keyframe (a seek lands at or before the one asked for) to the last time it read, or from
 * the file's start, or to its end. The stretch must hold the index's whole gap, two keyframes, or
 * the last one at the end.
 */
export function agrees(
  keys: readonly number[],
  seen: { keys: readonly number[]; last: number },
  edge: Window['edge'],
): boolean {
  const from = edge === 'start' ? Number.NEGATIVE_INFINITY : (seen.keys[0] ?? Number.NaN)
  const to = edge === 'end' ? Number.POSITIVE_INFINITY : seen.last
  if (Number.isNaN(from)) return false
  const expected = keys.filter((t) => t >= from - 1e-6 && t <= to + 1e-6)
  if (expected.length < (edge === 'end' ? 1 : 2)) return false
  return (
    expected.length === seen.keys.length &&
    expected.every((t, i) => Math.abs(t - (seen.keys[i] as number)) < 1e-6)
  )
}

/** Seconds to a microsecond, as ffprobe prints them (`%f`). */
export const round6 = (t: number) => Math.round(t * 1e6) / 1e6
