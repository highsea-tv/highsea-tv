// SPDX-License-Identifier: AGPL-3.0-only
// A small zip writer for the fake providers and the tests, after PKWARE's APPNOTE
// (https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT): a local file header and the data
// for each entry (§ 4.3.7), the central directory (§ 4.3.12), and the End of Central Directory
// record (§ 4.3.16). Stored (0) or deflated (8, Node's `zlib.deflateRawSync`). `flags` and
// `declaredSize` let a test write the archives highsea refuses.
import { deflateRawSync } from 'node:zlib'
import { crc32 } from '../../src/providers/zip.ts'

export type ZipFile = {
  name: string
  bytes: Uint8Array
  method?: 0 | 8
  /** General purpose bit flags; bit 11 (UTF-8 names) is always set. */
  flags?: number
  /** The uncompressed size the headers claim, when a test wants it to lie. */
  declaredSize?: number
}

export function makeZip(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const method = file.method ?? 8
    const name = enc.encode(file.name)
    const data = method === 8 ? new Uint8Array(deflateRawSync(file.bytes)) : file.bytes
    const crc = crc32(file.bytes)
    const size = file.declaredSize ?? file.bytes.length
    const flags = (file.flags ?? 0) | 0x0800

    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, flags, true)
    lv.setUint16(8, method, true)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0x5a21, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, flags, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x5a21, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  const parts = [...locals, ...centrals, eocd]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
