// SPDX-License-Identifier: AGPL-3.0-only
// Archive extraction: which files are handed to unar, how its failures read, and a download's
// folder written once and cleaned up. A stand-in unar (a shell script) covers the failures on any
// machine; the libarchive fixtures (fixtures/archives) go through the real unar when it's
// installed, and are skipped with a note when it isn't, as the ffprobe tests are.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import {
  archivesIn,
  createExtractor,
  EXTRACT_MESSAGES,
  type Extract,
  ExtractError,
  extractDownload,
  removeUnpacked,
  UNAR_ARGS,
  unarAvailable,
  unarBinary,
  unpackedFolder,
} from '../../src/shared/extract.ts'

const FIXTURES = fileURLToPath(new URL('../fixtures/archives/', import.meta.url))

const hasUnar = (() => {
  try {
    execFileSync(unarBinary(), ['-v'], { stdio: 'ignore' })
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ENOENT'
  }
})()
if (!hasUnar)
  console.warn('unar isn’t installed: the tests that extract the real archives are skipped.')

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'highsea-extract-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A stand-in for unar: a shell script with the body given. */
function fakeUnar(name: string, body: string): string {
  const path = join(dir, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

/**
 * A zip of stored (uncompressed) files, written to the format's own spec (PKWARE APPNOTE 4.3.7
 * local headers, 4.3.12 the central directory, 4.3.16 its end), so a good zip needs no fixture.
 */
function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text)
    const n = Buffer.from(name)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(10, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(n.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(10, 4)
    central.writeUInt16LE(10, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, n, data)
    centrals.push(central, n)
    offset += local.length + n.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof ExtractError) return { kind: e.kind, message: e.message, detail: e.detail }
    throw e
  }
  return null
}

describe('which files are archives', () => {
  test('each set’s first volume, 7z and zip, and a split set’s .001', () => {
    expect(
      archivesIn([
        '/d/movie.part1.rar',
        '/d/movie.part2.rar',
        '/d/movie.part10.rar',
        '/d/old.rar',
        '/d/old.r00',
        '/d/old.r01',
        '/d/extras.7z',
        '/d/subs.zip',
        '/d/split.7z.001',
        '/d/split.7z.002',
        '/d/movie.mkv',
        '/d/movie.nfo',
      ]),
    ).toEqual([
      '/d/extras.7z',
      '/d/movie.part1.rar',
      '/d/old.rar',
      '/d/split.7z.001',
      '/d/subs.zip',
    ])
  })

  test('the zero-padded first volume counts, a later one doesn’t', () => {
    expect(archivesIn(['/d/a.part01.rar', '/d/a.part02.rar', '/d/a.part001.rar'])).toEqual([
      '/d/a.part001.rar',
      '/d/a.part01.rar',
    ])
  })

  test('the folder beside a download', () => {
    expect(unpackedFolder('/downloads/Sintel.2010')).toBe('/downloads/Sintel.2010.unpacked')
  })
})

describe('running unar', () => {
  test('it’s given quiet, overwrite and no containing folder, then the output folder and archive', async () => {
    const out = join(dir, 'args-out')
    mkdirSync(out)
    const record = join(dir, 'args.txt')
    const bin = fakeUnar('unar-args', `printf '%s\\n' "$@" > '${record}'`)
    await createExtractor({ binary: bin })('/a/b.rar', out)
    expect(readFileSync(record, 'utf8').trim().split('\n')).toEqual([
      ...UNAR_ARGS,
      '-o',
      out,
      '/a/b.rar',
    ])
  })

  test('a password it needs is the password failure, with unar’s words kept', async () => {
    const bin = fakeUnar(
      'unar-password',
      'echo "This archive requires a password to unpack. Use the -p option to provide one." >&2; exit 2',
    )
    expect(await failure(createExtractor({ binary: bin })('/a/b.rar', dir))).toEqual({
      kind: 'password',
      message: EXTRACT_MESSAGES.password,
      detail: 'This archive requires a password to unpack. Use the -p option to provide one.',
    })
  })

  test('stdin is closed, so unar can never wait for an answer', async () => {
    // reads stdin: with it closed, cat ends at once and the script exits 0
    const bin = fakeUnar('unar-stdin', 'cat > /dev/null')
    await createExtractor({ binary: bin, timeoutMs: 5_000 })('/a/b.rar', dir)
  })

  test('any other failure is a damaged archive, with unar’s message', async () => {
    const bin = fakeUnar('unar-broken', 'echo "Extraction failed: data error" >&2; exit 1')
    expect(await failure(createExtractor({ binary: bin })('/a/b.rar', dir))).toEqual({
      kind: 'failed',
      message: EXTRACT_MESSAGES.failed,
      detail: 'Extraction failed: data error',
    })
  })

  test('one that runs too long is stopped', async () => {
    const bin = fakeUnar('unar-slow', 'sleep 5')
    expect(
      (await failure(createExtractor({ binary: bin, timeoutMs: 100 })('/a/b.rar', dir)))?.kind,
    ).toBe('timeout')
  })

  test('unar missing says how to fix it, and isn’t available', async () => {
    const bin = join(dir, 'no-such-unar')
    expect(await failure(createExtractor({ binary: bin })('/a/b.rar', dir))).toMatchObject({
      kind: 'missing',
      message: EXTRACT_MESSAGES.missing,
    })
    expect(await unarAvailable(bin)).toBe(false)
    expect(await unarAvailable(fakeUnar('unar-version', 'echo "unar v1.10.8"'))).toBe(true)
  })

  test('a relative path is refused before anything runs', async () => {
    expect((await failure(createExtractor({ binary: '/bin/true' })('b.rar', dir)))?.kind).toBe(
      'failed',
    )
  })

  test('HIGHSEA_UNAR names the binary', () => {
    expect(unarBinary({ HIGHSEA_UNAR: ' /opt/unar ' })).toBe('/opt/unar')
    expect(unarBinary({})).toBe('unar')
  })
})

describe('a download’s archives', () => {
  /** A download folder with the files named. */
  const download = (name: string, files: string[]) => {
    const folder = join(dir, name)
    mkdirSync(folder, { recursive: true })
    for (const f of files) writeFileSync(join(folder, f), f)
    return folder
  }
  /** Writes `<archive>.out` into the folder, and counts calls. */
  const writer = () => {
    const calls: string[] = []
    const extract: Extract = async (archive, into) => {
      calls.push(archive)
      writeFileSync(join(into, `${archive.split('/').pop()}.out`), 'x')
    }
    return { calls, extract }
  }

  test('nothing to extract leaves no folder', async () => {
    const folder = download('plain', ['movie.mkv'])
    const { calls, extract } = writer()
    expect(await extractDownload(folder, [join(folder, 'movie.mkv')], extract)).toBeNull()
    expect(calls).toEqual([])
    expect(existsSync(unpackedFolder(folder))).toBe(false)
  })

  test('one set goes into the folder beside it, once; the archives stay', async () => {
    const files = ['movie.part1.rar', 'movie.part2.rar']
    const folder = download('one-set', files)
    const { calls, extract } = writer()
    const paths = files.map((f) => join(folder, f))
    const out = await extractDownload(folder, paths, extract)
    expect(out).toBe(unpackedFolder(folder))
    expect(readdirSync(out as string)).toEqual(['movie.part1.rar.out'])
    expect(calls).toEqual([join(folder, 'movie.part1.rar')])
    // a second run finds the folder and extracts nothing
    expect(await extractDownload(folder, paths, extract)).toBe(out)
    expect(calls).toHaveLength(1)
    expect(readdirSync(folder).sort()).toEqual(files)
    await removeUnpacked(folder)
    expect(existsSync(out as string)).toBe(false)
    expect(readdirSync(folder).sort()).toEqual(files)
  })

  test('two archives each get a folder, so one can’t overwrite the other', async () => {
    const folder = download('two', ['a.rar', 'b.zip'])
    const { extract } = writer()
    const out = await extractDownload(
      folder,
      ['a.rar', 'b.zip'].map((f) => join(folder, f)),
      extract,
    )
    expect(readdirSync(out as string).sort()).toEqual(['1', '2'])
    expect(readdirSync(join(out as string, '2'))).toEqual(['b.zip.out'])
  })

  test('a failure leaves nothing behind and says why; a later run starts clean', async () => {
    const folder = download('fails', ['movie.rar'])
    const broken: Extract = async (_archive, into) => {
      writeFileSync(join(into, 'half.mkv'), 'half')
      throw new ExtractError('password', EXTRACT_MESSAGES.password)
    }
    const kind = await failure(extractDownload(folder, [join(folder, 'movie.rar')], broken))
    expect(kind?.kind).toBe('password')
    expect(existsSync(unpackedFolder(folder))).toBe(false)
    expect(existsSync(`${unpackedFolder(folder)}.partial`)).toBe(false)
    // an interrupted run's partial folder is cleared, not trusted
    mkdirSync(`${unpackedFolder(folder)}.partial`)
    writeFileSync(join(`${unpackedFolder(folder)}.partial`, 'stale'), 'x')
    const { extract } = writer()
    const out = await extractDownload(folder, [join(folder, 'movie.rar')], extract)
    expect(readdirSync(out as string)).toEqual(['movie.rar.out'])
  })
})

describe.skipIf(!hasUnar)('the real unar on libarchive’s archives', () => {
  const extract = createExtractor({ timeoutMs: 60_000 })
  /** A download holding copies of the fixtures named, extracted. */
  async function unpack(name: string, fixtures: string[]) {
    const folder = join(dir, `real-${name}`)
    mkdirSync(folder, { recursive: true })
    for (const f of fixtures) copyFileSync(join(FIXTURES, f), join(folder, f))
    return extractDownload(
      folder,
      fixtures.map((f) => join(folder, f)),
      extract,
    )
  }

  test('RAR 4', async () => {
    const out = (await unpack('rar4', ['test_read_format_rar.rar'])) as string
    expect(readFileSync(join(out, 'test.txt'), 'utf8')).toContain('test text document')
    expect(existsSync(join(out, 'testdir', 'test.txt'))).toBe(true)
  })

  test('RAR 5', async () => {
    const out = (await unpack('rar5', ['test_read_format_rar5_compressed.rar'])) as string
    expect(statSync(join(out, 'test.bin')).size).toBe(1200)
  })

  test('a multi-volume RAR set, from its first volume', async () => {
    const out = (await unpack('multi', [
      'test_rar_multivolume_single_file.part1.rar',
      'test_rar_multivolume_single_file.part2.rar',
      'test_rar_multivolume_single_file.part3.rar',
    ])) as string
    expect(statSync(join(out, 'LibarchiveAddingTest.html')).size).toBe(20111)
  })

  test('7z', async () => {
    const seven = (await unpack('7z', ['test_read_format_7zip_copy.7z'])) as string
    expect(statSync(join(seven, 'file1')).size).toBe(60)
  })

  test('zip', async () => {
    const folder = join(dir, 'real-zip-made')
    mkdirSync(folder, { recursive: true })
    const files = { 'file1.txt': 'hello\n', 'file2.txt': 'hello again\n' }
    writeFileSync(join(folder, 'made.zip'), storedZip(files))
    const out = (await extractDownload(folder, [join(folder, 'made.zip')], extract)) as string
    for (const [name, text] of Object.entries(files))
      expect(readFileSync(join(out, name), 'utf8')).toBe(text)
  })

  test('a damaged zip is the failed failure, and leaves nothing behind', async () => {
    // libarchive's test zip gives file2 a wrong CRC on purpose (`unzip -t` says so too)
    const kind = await failure(unpack('damaged-zip', ['test_read_format_zip.zip']))
    expect(kind?.kind).toBe('failed')
    expect(existsSync(unpackedFolder(join(dir, 'real-damaged-zip')))).toBe(false)
  })

  test('password-protected RAR 5 and 7z stop with the password failure', async () => {
    for (const f of [
      'test_read_format_rar5_encrypted.rar',
      'test_read_format_7zip_encryption.7z',
    ]) {
      const kind = await failure(unpack(`pw-${f}`, [f]))
      expect(kind?.kind).toBe('password')
      expect(existsSync(unpackedFolder(join(dir, `real-pw-${f}`)))).toBe(false)
    }
  })
})
