// SPDX-License-Identifier: AGPL-3.0-only
// Backups' zip (ADR 0047): what's written reads back byte for byte, through the central directory,
// with the CRC-32 checked; a damaged archive is refused, not restored.
import { afterEach, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { extractZipEntry, readZipEntry, writeZip, ZipError, zipEntries } from '../src/zip.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'highsea-zip-'))
  dirs.push(d)
  return d
}

async function sample() {
  const dir = temp()
  // compressible and not, across several of the deflater's chunks
  const data = Buffer.concat([Buffer.alloc(300_000, 'highsea '), randomBytes(200_000)])
  const file = join(dir, 'highsea.db')
  writeFileSync(file, data)
  const zip = join(dir, 'backup.zip')
  const manifest = Buffer.from('{"format":1}')
  await writeZip(
    zip,
    [
      { name: 'manifest.json', data: manifest },
      { name: 'highsea.db', file },
    ],
    new Date(Date.UTC(2026, 9, 21, 3, 30)),
  )
  return { dir, zip, data, manifest }
}

describe('the zip', () => {
  test('reads back what it wrote', async () => {
    const { dir, zip, data, manifest } = await sample()
    const entries = await zipEntries(zip)
    expect(entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ['manifest.json', 0, manifest.length],
      ['highsea.db', 8, data.length],
    ])
    const [m, db] = entries
    if (!m || !db) throw new Error('missing entries')
    expect(await readZipEntry(zip, m, 1024)).toEqual(manifest)
    const out = join(dir, 'out.db')
    await extractZipEntry(zip, db, out)
    expect(readFileSync(out).equals(data)).toBe(true)
    // the deflated data is raw DEFLATE (RFC 1951) a standard inflater reads
    const bytes = readFileSync(zip)
    const start = db.offset + 30 + 'highsea.db'.length
    expect(inflateRawSync(bytes.subarray(start, start + db.compressed)).equals(data)).toBe(true)
  })

  test('a damaged entry fails its checksum', async () => {
    const { dir, zip } = await sample()
    const entries = await zipEntries(zip)
    const db = entries[1]
    if (!db) throw new Error('missing entry')
    const bytes = readFileSync(zip)
    // flip a byte in the middle of the stored manifest's neighbour: the database's deflated data
    const at = db.offset + 30 + 'highsea.db'.length + Math.floor(db.compressed / 2)
    bytes[at] = (bytes[at] as number) ^ 0xff
    writeFileSync(zip, bytes)
    expect(extractZipEntry(zip, db, join(dir, 'out.db'))).rejects.toBeInstanceOf(Error)
  })

  test('something that isn’t a zip is refused', async () => {
    const file = join(temp(), 'not.zip')
    writeFileSync(file, 'hello')
    expect(zipEntries(file)).rejects.toBeInstanceOf(ZipError)
  })
})
