// SPDX-License-Identifier: AGPL-3.0-only
// A Blu-ray picture subtitle (PGS, a `.sup` file) for the burn-in tests: one white box shown, then
// cleared. ffmpeg decodes PGS but has no encoder for it, so the tests write their own. The layout is
// the segments' as the format is publicly described ("Presentation Graphic Stream (SUP files)
// BluRay Subtitle Format", http://blog.thescorpius.com/index.php/2017/07/15/presentation-graphic-stream-sup-files-bluray-subtitle-format/)
// and as ffmpeg's decoder reads them (libavcodec/pgssubdec.c).

const PCS = 0x16
const WDS = 0x17
const PDS = 0x14
const ODS = 0x15
const END = 0x80

const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff]
const u24 = (n: number) => [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]

/** A segment: "PG", its time on the 90 kHz clock (the decode time left 0), its type and size. */
function segment(seconds: number, type: number, body: number[]): number[] {
  return [
    0x50,
    0x47,
    ...u32(Math.round(seconds * 90_000)),
    ...u32(0),
    type,
    ...u16(body.length),
    ...body,
  ]
}

/** Each line of a box in colour 1, run-length coded: a run of 64 or more, then the line's end. */
function box(width: number, height: number): number[] {
  const line = [0x00, 0xc0 | ((width >> 8) & 0x3f), width & 0xff, 0x01, 0x00, 0x00]
  return Array.from({ length: height }, () => line).flat()
}

export type PgsBox = {
  /** The canvas: the film's picture size. */
  width: number
  height: number
  /** The box, its top-left corner and size; at least 64 wide. */
  x: number
  y: number
  w: number
  h: number
  /** Shown from `from` until `to`, in seconds. */
  from: number
  to: number
}

/** A `.sup` file showing one white box from `from` to `to`. */
export function pgsBox(b: PgsBox): Buffer {
  const composition = (state: number, objects: number[]) => [
    ...u16(b.width),
    ...u16(b.height),
    0x10, // the frame rate, which decoders ignore
    ...u16(state === 0x80 ? 0 : 1), // the composition's number
    state, // 0x80 starts an epoch, 0x00 is a normal update
    0x00, // no palette-only update
    0x00, // the palette's id
    objects.length ? 1 : 0,
    ...objects,
  ]
  const window = [1, 0, ...u16(b.x), ...u16(b.y), ...u16(b.w), ...u16(b.h)]
  // palette entry 1: white (Y 235, Cr and Cb 128 on BT.709's video range), opaque
  const palette = [0x00, 0x00, 0x01, 235, 128, 128, 0xff]
  const data = box(b.w, b.h)
  // the object's data length counts its width and height too
  const object = [...u16(0), 0x00, 0xc0, ...u24(data.length + 4), ...u16(b.w), ...u16(b.h), ...data]
  const shown = [
    ...segment(b.from, PCS, composition(0x80, [...u16(0), 0x00, 0x00, ...u16(b.x), ...u16(b.y)])),
    ...segment(b.from, WDS, window),
    ...segment(b.from, PDS, palette),
    ...segment(b.from, ODS, object),
    ...segment(b.from, END, []),
  ]
  const cleared = [
    ...segment(b.to, PCS, composition(0x00, [])),
    ...segment(b.to, WDS, window),
    ...segment(b.to, END, []),
  ]
  return Buffer.from([...shown, ...cleared])
}
