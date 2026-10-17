// SPDX-License-Identifier: AGPL-3.0-only
// Binary writers for the build: PNG (with or without alpha), ICO, ICNS and WAV.
import { deflateSync } from 'node:zlib'

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * Encodes premultiplied RGBA pixels (as resvg renders them). `opaque` drops the alpha channel,
 * which App Store icons require.
 */
export function encodePng(rgba: Uint8Array, width: number, height: number, opaque: boolean) {
  const channels = opaque ? 3 : 4
  const stride = width * channels + 1
  const raw = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const o = y * stride + 1 + x * channels
      const a = rgba[i + 3] as number
      const k = a === 0 || a === 255 ? 1 : 255 / a
      for (let c = 0; c < 3; c++)
        raw[o + c] = Math.min(255, Math.round((rgba[i + c] as number) * k))
      if (!opaque) raw[o + 3] = a
    }
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, opaque ? 2 : 6, 0, 0, 0], 8)
  return concat([
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ])
}

/** ICO with PNG-compressed entries (Windows Vista and later). */
export function encodeIco(images: { size: number; png: Uint8Array }[]) {
  const head = new Uint8Array(6 + 16 * images.length)
  const view = new DataView(head.buffer)
  view.setUint16(2, 1, true)
  view.setUint16(4, images.length, true)
  let offset = head.length
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i
    head[e] = size >= 256 ? 0 : size
    head[e + 1] = size >= 256 ? 0 : size
    view.setUint16(e + 4, 1, true)
    view.setUint16(e + 6, 32, true)
    view.setUint32(e + 8, png.length, true)
    view.setUint32(e + 12, offset, true)
    offset += png.length
  })
  return concat([head, ...images.map((i) => i.png)])
}

/** ICNS with PNG entries (macOS 10.7 and later). */
export function encodeIcns(entries: { type: string; png: Uint8Array }[]) {
  const parts = entries.map(({ type, png }) => {
    const head = new Uint8Array(8)
    head.set(new TextEncoder().encode(type), 0)
    new DataView(head.buffer).setUint32(4, 8 + png.length)
    return concat([head, png])
  })
  const head = new Uint8Array(8)
  head.set(new TextEncoder().encode('icns'), 0)
  new DataView(head.buffer).setUint32(4, 8 + parts.reduce((n, p) => n + p.length, 0))
  return concat([head, ...parts])
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number) {
  const out = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(out.buffer)
  const text = (at: number, s: string) => out.set(new TextEncoder().encode(s), at)
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => {
    const v = Math.max(-1, Math.min(1, s))
    view.setInt16(44 + i * 2, Math.round(v * 32767), true)
  })
  return out
}
