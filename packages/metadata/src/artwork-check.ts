// SPDX-License-Identifier: AGPL-3.0-only
// An uploaded artwork's checks (HT-66), by its bytes, never the client's word (ADR 0028; OWASP File
// Upload Cheat Sheet): PNG or JPEG only. SVG is refused, as TMDB's SVG logos are (image-url.ts):
// served from the server's origin it could carry script, and React Native's Image draws no SVG on
// the phone or TV (https://reactnative.dev/docs/image). A logo must be a PNG, the raster format with
// transparency. Nothing here touches the database, so the mock (the prototype's server) runs the
// same checks in the browser.
import { AppError } from '@highsea-tv/core/errors'

export const ARTWORK_KINDS = ['poster', 'backdrop', 'logo'] as const
export type ArtworkKind = (typeof ARTWORK_KINDS)[number]

/** The owners the picker serves now; shows, seasons and episodes join with Phase 5 part B. */
export const ARTWORK_OWNERS = ['movie', 'collection'] as const
export type ArtworkOwner = (typeof ARTWORK_OWNERS)[number]

/** The kinds each owner has: TMDB keeps no logos for collections, so theirs is upload-only. */
export const ARTWORK_KINDS_OF: Record<ArtworkOwner, readonly ArtworkKind[]> = {
  movie: ['poster', 'backdrop', 'logo'],
  collection: ['poster', 'backdrop', 'logo'],
}

/** At most 10 MB, as the image cache takes from TMDB (images.ts). */
export const ARTWORK_MAX_BYTES = 10 * 1024 * 1024
/** Neither side larger than this: a decoder would hold it whole. */
export const ARTWORK_MAX_SIDE = 8000

/**
 * Each kind's checks, from the sizes highsea serves (image-url.ts): at least its largest size but
 * one across, and near its shape, since the apps fill a 2:3 or 16:9 frame (`contentFit="cover"`)
 * and crop what's off it. A logo's shape is its own.
 */
export const ARTWORK_RULES: Record<
  ArtworkKind,
  { minWidth: number; ratio: [number, number] | null; png: boolean }
> = {
  poster: { minWidth: 500, ratio: [0.6, 0.75], png: false },
  backdrop: { minWidth: 1280, ratio: [1.6, 1.9], png: false },
  logo: { minWidth: 300, ratio: null, png: true },
}

export type ArtworkType = 'image/png' | 'image/jpeg'

const invalid = (message: string, reason: string) => new AppError('invalid', message, { reason })

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** PNG: the signature, then IHDR's width and height (W3C PNG § 5.2, § 11.2.2). */
function pngSize(b: Uint8Array) {
  if (b.length < 24 || !PNG.every((x, i) => b[i] === x)) return null
  if (String.fromCharCode(...b.subarray(12, 16)) !== 'IHDR') return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { width: v.getUint32(16), height: v.getUint32(20) }
}

/**
 * JPEG: SOI, then segments until a start-of-frame (SOF0–SOF15 but DHT C4, JPG C8 and DAC CC),
 * whose data holds the height and width (ITU-T T.81 § B.2.2).
 */
function jpegSize(b: Uint8Array) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] as number
    if (marker === 0xff) {
      i++
      continue
    }
    const length = v.getUint16(i + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) }
    i += 2 + length
  }
  return null
}

/** The type and size an upload is, from its bytes, or why it can't be this kind's art. */
export function checkArtwork(kind: ArtworkKind, bytes: Uint8Array) {
  if (bytes.length === 0) throw invalid('That file is empty.', 'empty')
  if (bytes.length > ARTWORK_MAX_BYTES) throw invalid('That file is larger than 10 MB.', 'size')
  const png = pngSize(bytes)
  const jpeg = png ? null : jpegSize(bytes)
  const rule = ARTWORK_RULES[kind]
  if (rule.png && !png)
    throw invalid('A logo needs to be a PNG, so its background can be transparent.', 'type')
  const found = png ?? jpeg
  if (!found) throw invalid('Artwork needs to be a PNG or JPEG file.', 'type')
  const { width, height } = found
  if (!width || !height) throw invalid('That image is damaged.', 'damaged')
  if (width > ARTWORK_MAX_SIDE || height > ARTWORK_MAX_SIDE)
    throw invalid(`That image is larger than ${ARTWORK_MAX_SIDE} px on a side.`, 'too-large')
  if (width < rule.minWidth)
    throw invalid(`This artwork needs to be at least ${rule.minWidth} px wide.`, 'too-small')
  if (rule.ratio) {
    const r = width / height
    if (r < rule.ratio[0] || r > rule.ratio[1])
      throw invalid(
        kind === 'poster'
          ? 'A poster needs to be close to 2:3, taller than it’s wide.'
          : 'A backdrop needs to be close to 16:9.',
        'shape',
      )
  }
  return { type: (png ? 'image/png' : 'image/jpeg') as ArtworkType, width, height }
}
