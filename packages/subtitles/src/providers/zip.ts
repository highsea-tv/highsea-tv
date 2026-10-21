// SPDX-License-Identifier: AGPL-3.0-only
// The subtitle in a provider's zip (Subdl's and SubSource's downloads). A small reader for the
// archive format in PKWARE's APPNOTE (https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT):
// find the End of Central Directory record (§ 4.3.16) from the end, walk the central directory's
// file headers (§ 4.3.12), and read each chosen entry through its local file header (§ 4.3.7),
// using the central directory's sizes, which hold even when a data descriptor (§ 4.3.9) follows
// the data. Methods 0 (stored) and 8 (deflated, RFC 1951, Node's `zlib.inflateRawSync` with
// `maxOutputLength`) are read; ZIP64 (§ 4.3.14), spanned archives and encrypted entries (general
// purpose flag bit 0, § 4.4.4) are refused. The CRC-32 (§ 4.4.7) is checked.
//
// Only subtitle files are taken (srt, then ass/ssa, then vtt, then sub), at most 2 MB each, and a
// name that's absolute or climbs out (`..`) refuses the whole archive; every other name is reduced
// to its base name, so nothing in a zip can write outside highsea's temporary folder.
import { inflateRawSync } from 'node:zlib'
import { type DownloadedFile, ProviderError } from '../shared/types.ts'
import { baseName } from './http.ts'

/** The largest subtitle file highsea takes, uncompressed. */
export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
const EOCD_SIZE = 22
const CENTRAL_SIZE = 46
const LOCAL_SIZE = 30

/** Most preferred first. */
const PREFERENCE = ['srt', 'ass', 'ssa', 'vtt', 'sub']

const TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 as APPNOTE § 4.4.7 defines it (the ISO 3309 polynomial, reflected). */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = (TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const invalid = (message: string) => new ProviderError('invalid', message)

type Entry = {
  name: string
  method: number
  flags: number
  crc: number
  compressedSize: number
  size: number
  offset: number
}

function decodeName(bytes: Uint8Array, utf8: boolean): string {
  // Bit 11 marks UTF-8 names (APPNOTE appendix D); without it the name is IBM code page 437,
  // read here as Latin-1, which keeps ASCII (every name that matters) exact.
  return new TextDecoder(utf8 ? 'utf-8' : 'latin1').decode(bytes)
}

function entries(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < EOCD_SIZE) throw invalid('The download isn’t a zip archive.')
  // The record sits at the end, after a comment of at most 65,535 bytes.
  let eocd = -1
  const stop = Math.max(0, bytes.length - EOCD_SIZE - 0xffff)
  for (let i = bytes.length - EOCD_SIZE; i >= stop; i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw invalid('The download isn’t a zip archive.')
  const disk = view.getUint16(eocd + 4, true)
  const cdDisk = view.getUint16(eocd + 6, true)
  const count = view.getUint16(eocd + 10, true)
  const cdSize = view.getUint32(eocd + 12, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    throw invalid('The archive uses ZIP64, which highsea doesn’t read.')
  if (disk !== 0 || cdDisk !== 0) throw invalid('The archive spans several files.')
  if (cdOffset + cdSize > eocd) throw invalid('The archive is damaged.')

  const list: Entry[] = []
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (p + CENTRAL_SIZE > eocd || view.getUint32(p, true) !== CENTRAL)
      throw invalid('The archive is damaged.')
    const flags = view.getUint16(p + 8, true)
    const method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true)
    const compressedSize = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true)
    const nameLength = view.getUint16(p + 28, true)
    const extraLength = view.getUint16(p + 30, true)
    const commentLength = view.getUint16(p + 32, true)
    const offset = view.getUint32(p + 42, true)
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff)
      throw invalid('The archive uses ZIP64, which highsea doesn’t read.')
    const nameEnd = p + CENTRAL_SIZE + nameLength
    if (nameEnd > eocd) throw invalid('The archive is damaged.')
    const name = decodeName(bytes.subarray(p + CENTRAL_SIZE, nameEnd), (flags & 0x0800) !== 0)
    list.push({ name, method, flags, crc, compressedSize, size, offset })
    p = nameEnd + extraLength + commentLength
  }
  return list
}

function checkName(name: string): void {
  if (/^[\\/]/.test(name) || /^[a-z]:/i.test(name))
    throw invalid('The archive holds a file with an absolute path.')
  if (name.split(/[\\/]/).includes('..'))
    throw invalid('The archive holds a file that points outside it.')
}

function extension(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''
}

function read(bytes: Uint8Array, entry: Entry): Uint8Array {
  if (entry.flags & 0x0001) throw invalid('The archive is encrypted.')
  if (entry.size > MAX_SUBTITLE_BYTES) throw invalid('The subtitle in the archive is over 2 MB.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const p = entry.offset
  if (p + LOCAL_SIZE > bytes.length || view.getUint32(p, true) !== LOCAL)
    throw invalid('The archive is damaged.')
  const start = p + LOCAL_SIZE + view.getUint16(p + 26, true) + view.getUint16(p + 28, true)
  const end = start + entry.compressedSize
  if (end > bytes.length) throw invalid('The archive is damaged.')
  const data = bytes.subarray(start, end)
  let out: Uint8Array
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) throw invalid('The archive is damaged.')
    out = data
  } else if (entry.method === 8) {
    try {
      out = new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_SUBTITLE_BYTES + 1 }))
    } catch (error) {
      if (
        error instanceof RangeError ||
        (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE'
      )
        throw invalid('The subtitle in the archive is over 2 MB.')
      throw invalid('The archive is damaged.')
    }
  } else {
    throw invalid('The archive uses a compression method highsea doesn’t read.')
  }
  if (out.length > MAX_SUBTITLE_BYTES) throw invalid('The subtitle in the archive is over 2 MB.')
  if (out.length !== entry.size || crc32(out) !== entry.crc)
    throw invalid('The archive is damaged.')
  return out
}

/** The best subtitle in a zip, by format: srt, then ass/ssa, then vtt, then sub. */
export function readSubtitleZip(bytes: Uint8Array): DownloadedFile {
  const list = entries(bytes)
  for (const entry of list) checkName(entry.name)
  const candidates = list.filter((entry) => {
    if (entry.name.endsWith('/') || entry.name.endsWith('\\')) return false
    const segments = entry.name.split(/[\\/]/)
    if (segments[0] === '__MACOSX') return false
    if ((segments.at(-1) ?? '').startsWith('._')) return false
    return PREFERENCE.includes(extension(entry.name))
  })
  if (candidates.length === 0) throw invalid('The archive holds no subtitle.')
  candidates.sort(
    (a, b) => PREFERENCE.indexOf(extension(a.name)) - PREFERENCE.indexOf(extension(b.name)),
  )
  const chosen = candidates[0] as Entry
  return { name: baseName(chosen.name), bytes: read(bytes, chosen) }
}
