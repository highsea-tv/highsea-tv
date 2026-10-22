// SPDX-License-Identifier: AGPL-3.0-only
// Backups' archive (checkpoint 8b, ADR 0047): a small writer and reader for the format in PKWARE's
// APPNOTE (https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT), as the subtitles' zip
// reader is. A file is streamed through `zlib.createDeflateRaw` (method 8, RFC 1951) with its sizes
// and CRC-32 (§ 4.4.7, Node's `zlib.crc32`, which takes a running value) in a data descriptor after
// it (general purpose bit 3, § 4.3.9), so a database of any size is never held in memory; a small
// buffer is stored (method 0) with them in its local header. Names are UTF-8 (bit 11, § 4.4.4).
//
// ZIP64 (§ 4.3.14) isn't written: an archive whose sizes or offsets don't fit in 32 bits is refused
// before it's started, and one that has them isn't read. Every entry is read through the central
// directory (§ 4.3.12), whose sizes hold even when a data descriptor follows the data, and its
// CRC-32 and size are checked as it's written out.
import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32, createDeflateRaw, createInflateRaw } from 'node:zlib'

const LOCAL = 0x04034b50
const DESCRIPTOR = 0x08074b50
const CENTRAL = 0x02014b50
const EOCD = 0x06054b50
const LOCAL_SIZE = 30
const CENTRAL_SIZE = 46
const EOCD_SIZE = 22
/** The largest size or offset a zip without ZIP64 can hold. */
export const ZIP32_MAX = 0xffffffff
/** Bit 3: sizes and CRC in a data descriptor; bit 11: the name is UTF-8. */
const STREAMED = 0x0808
const UTF8 = 0x0800
const VERSION = 20
/** "Version made by": UNIX (3) in the upper byte, so external attributes carry a mode. */
const MADE_BY = (3 << 8) | VERSION
const FILE_MODE = (0o100644 << 16) >>> 0

export class ZipError extends Error {
  override name = 'ZipError'
}

export type ZipSource = { name: string; data: Uint8Array } | { name: string; file: string }

type Written = {
  name: Buffer
  method: number
  flags: number
  crc: number
  compressed: number
  size: number
  offset: number
}

/** MS-DOS date and time (§ 4.4.6), from UTC so the same moment gives the same bytes. */
function dosTime(at: Date) {
  const time = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1)
  const date =
    ((Math.max(at.getUTCFullYear(), 1980) - 1980) << 9) |
    ((at.getUTCMonth() + 1) << 5) |
    at.getUTCDate()
  return { time, date }
}

function localHeader(e: Written, at: Date) {
  const h = Buffer.alloc(LOCAL_SIZE)
  const { time, date } = dosTime(at)
  h.writeUInt32LE(LOCAL, 0)
  h.writeUInt16LE(VERSION, 4)
  h.writeUInt16LE(e.flags, 6)
  h.writeUInt16LE(e.method, 8)
  h.writeUInt16LE(time, 10)
  h.writeUInt16LE(date, 12)
  // streamed entries leave these 0; their data descriptor carries them (§ 4.4.4, bit 3)
  h.writeUInt32LE(e.flags & 0x08 ? 0 : e.crc, 14)
  h.writeUInt32LE(e.flags & 0x08 ? 0 : e.compressed, 18)
  h.writeUInt32LE(e.flags & 0x08 ? 0 : e.size, 22)
  h.writeUInt16LE(e.name.length, 26)
  h.writeUInt16LE(0, 28)
  return Buffer.concat([h, e.name])
}

function centralHeader(e: Written, at: Date) {
  const h = Buffer.alloc(CENTRAL_SIZE)
  const { time, date } = dosTime(at)
  h.writeUInt32LE(CENTRAL, 0)
  h.writeUInt16LE(MADE_BY, 4)
  h.writeUInt16LE(VERSION, 6)
  h.writeUInt16LE(e.flags, 8)
  h.writeUInt16LE(e.method, 10)
  h.writeUInt16LE(time, 12)
  h.writeUInt16LE(date, 14)
  h.writeUInt32LE(e.crc, 16)
  h.writeUInt32LE(e.compressed, 20)
  h.writeUInt32LE(e.size, 24)
  h.writeUInt16LE(e.name.length, 28)
  // extra field, comment, disk number and internal attributes stay 0
  h.writeUInt32LE(FILE_MODE, 38)
  h.writeUInt32LE(e.offset, 42)
  return Buffer.concat([h, e.name])
}

/**
 * Writes `entries` to `path`, files deflated and buffers stored. Refuses, before writing anything,
 * an archive that would need ZIP64.
 */
export async function writeZip(path: string, entries: ZipSource[], at: Date): Promise<void> {
  let total = 0
  for (const e of entries) total += 'data' in e ? e.data.byteLength : statSync(e.file).size
  // deflate can grow incompressible data a little (RFC 1951 § 3.2.4: 5 bytes a 64 KiB block)
  if (total + total / 1000 + 64 * 1024 > ZIP32_MAX)
    throw new ZipError('The database is too large for a backup without ZIP64 (4 GiB).')

  const handle = await open(path, 'w')
  const written: Written[] = []
  let offset = 0
  const put = async (bytes: Uint8Array) => {
    await handle.write(bytes)
    offset += bytes.byteLength
  }
  try {
    for (const source of entries) {
      const name = Buffer.from(source.name, 'utf8')
      if ('data' in source) {
        const e: Written = {
          name,
          method: 0,
          flags: UTF8,
          crc: crc32(source.data),
          compressed: source.data.byteLength,
          size: source.data.byteLength,
          offset,
        }
        await put(localHeader(e, at))
        await put(source.data)
        written.push(e)
        continue
      }
      const e: Written = {
        name,
        method: 8,
        flags: STREAMED,
        crc: 0,
        compressed: 0,
        size: 0,
        offset,
      }
      await put(localHeader(e, at))
      const measure = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          e.crc = crc32(chunk, e.crc)
          e.size += chunk.byteLength
          done(null, chunk)
        },
      })
      await pipeline(
        createReadStream(source.file),
        measure,
        createDeflateRaw(),
        async (deflated) => {
          for await (const chunk of deflated as AsyncIterable<Buffer>) {
            await put(chunk)
            e.compressed += chunk.byteLength
          }
        },
      )
      const descriptor = Buffer.alloc(16)
      descriptor.writeUInt32LE(DESCRIPTOR, 0)
      descriptor.writeUInt32LE(e.crc, 4)
      descriptor.writeUInt32LE(e.compressed, 8)
      descriptor.writeUInt32LE(e.size, 12)
      await put(descriptor)
      written.push(e)
    }
    const directoryAt = offset
    for (const e of written) await put(centralHeader(e, at))
    const end = Buffer.alloc(EOCD_SIZE)
    end.writeUInt32LE(EOCD, 0)
    end.writeUInt16LE(written.length, 8)
    end.writeUInt16LE(written.length, 10)
    end.writeUInt32LE(offset - directoryAt, 12)
    end.writeUInt32LE(directoryAt, 16)
    if (offset > ZIP32_MAX)
      throw new ZipError('The backup grew past what a zip holds without ZIP64.')
    await put(end)
  } finally {
    await handle.close()
  }
}

export type ZipEntry = {
  name: string
  method: number
  flags: number
  crc: number
  compressed: number
  size: number
  offset: number
}

/** The central directory's entries, found from the End of Central Directory record (§ 4.3.16). */
export async function zipEntries(path: string): Promise<ZipEntry[]> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    // the record is 22 bytes and a comment of at most 65,535 follows it
    const tailSize = Math.min(size, EOCD_SIZE + 0xffff)
    const tail = Buffer.alloc(tailSize)
    await handle.read(tail, 0, tailSize, size - tailSize)
    let at = -1
    for (let i = tailSize - EOCD_SIZE; i >= 0; i--)
      if (tail.readUInt32LE(i) === EOCD) {
        at = i
        break
      }
    if (at < 0) throw new ZipError('That isn’t a zip archive.')
    const count = tail.readUInt16LE(at + 10)
    const directorySize = tail.readUInt32LE(at + 12)
    const directoryAt = tail.readUInt32LE(at + 16)
    if (count === 0xffff || directorySize === ZIP32_MAX || directoryAt === ZIP32_MAX)
      throw new ZipError('ZIP64 archives aren’t read.')
    if (directoryAt + directorySize > size) throw new ZipError('The zip archive is cut short.')
    const directory = Buffer.alloc(directorySize)
    await handle.read(directory, 0, directorySize, directoryAt)
    const entries: ZipEntry[] = []
    let p = 0
    for (let i = 0; i < count; i++) {
      if (p + CENTRAL_SIZE > directory.length || directory.readUInt32LE(p) !== CENTRAL)
        throw new ZipError('The zip archive’s directory is damaged.')
      const nameLength = directory.readUInt16LE(p + 28)
      const extraLength = directory.readUInt16LE(p + 30)
      const commentLength = directory.readUInt16LE(p + 32)
      entries.push({
        flags: directory.readUInt16LE(p + 8),
        method: directory.readUInt16LE(p + 10),
        crc: directory.readUInt32LE(p + 16),
        compressed: directory.readUInt32LE(p + 20),
        size: directory.readUInt32LE(p + 24),
        offset: directory.readUInt32LE(p + 42),
        name: directory.toString('utf8', p + CENTRAL_SIZE, p + CENTRAL_SIZE + nameLength),
      })
      p += CENTRAL_SIZE + nameLength + extraLength + commentLength
    }
    return entries
  } finally {
    await handle.close()
  }
}

/** Where an entry's data starts: after its local header, whose name and extra may differ (§ 4.3.7). */
async function dataStart(path: string, entry: ZipEntry) {
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(LOCAL_SIZE)
    await handle.read(header, 0, LOCAL_SIZE, entry.offset)
    if (header.readUInt32LE(0) !== LOCAL) throw new ZipError('The zip archive is damaged.')
    return entry.offset + LOCAL_SIZE + header.readUInt16LE(26) + header.readUInt16LE(28)
  } finally {
    await handle.close()
  }
}

function check(entry: ZipEntry) {
  if (entry.flags & 0x01) throw new ZipError(`${entry.name} is encrypted.`)
  if (entry.method !== 0 && entry.method !== 8)
    throw new ZipError(`${entry.name} uses a compression method highsea doesn’t read.`)
  if (entry.size === ZIP32_MAX || entry.compressed === ZIP32_MAX)
    throw new ZipError('ZIP64 archives aren’t read.')
}

/** One entry's bytes, for small ones (a manifest). */
export async function readZipEntry(path: string, entry: ZipEntry, max: number): Promise<Buffer> {
  check(entry)
  if (entry.size > max) throw new ZipError(`${entry.name} is larger than expected.`)
  const chunks: Buffer[] = []
  await writeEntry(path, entry, async (source) => {
    for await (const chunk of source) chunks.push(chunk)
  })
  return Buffer.concat(chunks)
}

/** Writes one entry to `file`, checking its size and CRC-32 against the central directory. */
export async function extractZipEntry(path: string, entry: ZipEntry, file: string): Promise<void> {
  check(entry)
  await writeEntry(path, entry, createWriteStream(file))
}

type Sink = NodeJS.WritableStream | ((source: AsyncIterable<Buffer>) => Promise<void>)

async function writeEntry(path: string, entry: ZipEntry, out: Sink) {
  const start = await dataStart(path, entry)
  let crc = 0
  let size = 0
  const measure = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      crc = crc32(chunk, crc)
      size += chunk.byteLength
      if (size > entry.size) return done(new ZipError(`${entry.name} is larger than it says.`))
      done(null, chunk)
    },
  })
  if (entry.compressed === 0) {
    // an empty stored entry: nothing to read (createReadStream can't take an empty range)
    await pipeline(Readable.from([]), measure, out)
  } else {
    const input = createReadStream(path, { start, end: start + entry.compressed - 1 })
    if (entry.method === 8) await pipeline(input, createInflateRaw(), measure, out)
    else await pipeline(input, measure, out)
  }
  if (size !== entry.size || crc >>> 0 !== entry.crc)
    throw new ZipError(`${entry.name} doesn’t match its checksum. The backup is damaged.`)
}
