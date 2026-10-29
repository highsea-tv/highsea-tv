// SPDX-License-Identifier: AGPL-3.0-only
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
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
import { gunzipSync } from 'node:zlib'
import { infoOf, manifestOf, OS_MIN_VER, spk, spkVersion, tar } from './spk.ts'

const SOURCE = join(import.meta.dir, '../templates/synology/spk')
const MTIME = 1_793_000_000

const dirs: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-spk-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** The entries of a tar archive as the system's tar reads them, with their modes. */
function listed(archive: Buffer): string[] {
  const dir = temp()
  writeFileSync(join(dir, 'a.tar'), archive)
  const run = spawnSync('tar', ['-tvf', join(dir, 'a.tar')], { encoding: 'utf8' })
  expect(run.status).toBe(0)
  return run.stdout.trim().split('\n')
}

/** Unpacks an archive with the system's tar and returns where. */
function unpacked(archive: Buffer, dir = temp()): string {
  writeFileSync(join(dir, 'a.tar'), archive)
  mkdirSync(join(dir, 'out'))
  const run = spawnSync('tar', ['-xf', join(dir, 'a.tar'), '-C', join(dir, 'out')])
  expect(run.status).toBe(0)
  return join(dir, 'out')
}

describe('spkVersion', () => {
  test('is the release, then the package build in four digits', () => {
    expect(spkVersion('0.2.0')).toBe('0.2.0-0001')
    expect(spkVersion('1.10.3', 12)).toBe('1.10.3-0012')
  })

  test('refuses prereleases and builds DSM cannot order', () => {
    expect(() => spkVersion('0.3.0-beta.1')).toThrow('Only a stable release')
    expect(() => spkVersion('0.2.0', 0)).toThrow('1 to 9999')
    expect(() => spkVersion('0.2.0', 10000)).toThrow('1 to 9999')
    expect(() => spkVersion('0.2.0', 1.5)).toThrow('1 to 9999')
  })
})

describe('infoOf', () => {
  test('has the fields Package Center needs, one key="value" a line', () => {
    const info = infoOf('0.2.0', 3, 'abc')
    const fields = Object.fromEntries(
      info
        .trim()
        .split('\n')
        .map((line) => {
          const match = /^([a-z_]+)="([^"]*)"$/.exec(line)
          expect(match).not.toBeNull()
          return [match?.[1], match?.[2]]
        }),
    )
    expect(fields).toMatchObject({
      package: 'highsea',
      version: '0.2.0-0003',
      os_min_ver: OS_MIN_VER,
      arch: 'noarch',
      install_dep_packages: 'ContainerManager>=20.10.23-1432',
      adminport: '3000',
      checkport: 'no',
      checksum: 'abc',
    })
    expect(fields.description).not.toContain('!')
  })
})

describe('tar', () => {
  test('writes ustar that the system tar reads back', () => {
    const body = Buffer.from('x'.repeat(1000))
    const archive = tar(
      [
        { name: 'dir', mode: 0o755 },
        { name: 'dir/run', mode: 0o755, body: Buffer.from('#!/bin/sh\n') },
        { name: 'dir/big', mode: 0o644, body },
      ],
      MTIME,
    )
    expect(archive.length % 512).toBe(0)
    const lines = listed(archive)
    expect(lines[0]).toMatch(/^drwxr-xr-x .* dir\/$/)
    expect(lines[1]).toMatch(/^-rwxr-xr-x .* dir\/run$/)
    expect(lines[2]).toMatch(/^-rw-r--r-- .* 1000 .* dir\/big$/)
    expect(readFileSync(join(unpacked(archive), 'dir/big'))).toEqual(body)
  })

  test('refuses a name ustar cannot hold', () => {
    expect(() => tar([{ name: 'x'.repeat(101), mode: 0o644, body: Buffer.from('') }], 0)).toThrow(
      'too long',
    )
  })
})

describe('spk', () => {
  const { bytes, names } = spk('0.2.0', 2, MTIME)
  // unpacked once for the whole block, so it outlives afterEach
  const shared = mkdtempSync(join(tmpdir(), 'highsea-spk-'))
  afterAll(() => rmSync(shared, { recursive: true, force: true }))
  const out = unpacked(bytes, shared)

  test('holds INFO, the payload, the scripts, conf, the wizards and both icons', () => {
    expect(names.slice(0, 2)).toEqual(['INFO', 'package.tgz'])
    for (const name of [
      'scripts/preinst',
      'scripts/postinst',
      'scripts/postuninst',
      'scripts/start-stop-status',
      'conf/privilege',
      'conf/resource',
      'WIZARD_UIFILES/install_uifile',
      'WIZARD_UIFILES/uninstall_uifile',
      'PACKAGE_ICON.PNG',
      'PACKAGE_ICON_256.PNG',
    ]) {
      expect(names).toContain(name)
    }
  })

  test('is the same bytes for the same release and time', () => {
    expect(spk('0.2.0', 2, MTIME).bytes.equals(bytes)).toBe(true)
  })

  test("INFO's checksum is package.tgz's MD5", () => {
    const md5 = createHash('md5')
      .update(readFileSync(join(out, 'package.tgz')))
      .digest('hex')
    expect(readFileSync(join(out, 'INFO'), 'utf8')).toContain(`checksum="${md5}"`)
  })

  test('the payload is the compose project, pinned to the release', () => {
    const payload = unpacked(gunzipSync(readFileSync(join(out, 'package.tgz'))))
    const compose = readFileSync(join(payload, 'compose/compose.yaml'), 'utf8')
    expect(compose).toContain('image: ghcr.io/highsea-tv/highsea:0.2.0\n')
    expect(compose).not.toContain('@VERSION@')
    expect(statSync(join(payload, 'compose/no-graphics')).isDirectory()).toBe(true)
  })

  test('the scripts DSM runs are executable, and parse', () => {
    for (const name of readdirSync(join(out, 'scripts'))) {
      const path = join(out, 'scripts', name)
      if (name !== 'common') expect(statSync(path).mode & 0o111).toBe(0o111)
      expect(spawnSync('sh', ['-n', path]).status).toBe(0)
    }
  })

  test('conf and the wizards are JSON', () => {
    for (const name of [
      'conf/privilege',
      'conf/resource',
      'WIZARD_UIFILES/install_uifile',
      'WIZARD_UIFILES/uninstall_uifile',
    ]) {
      expect(() => JSON.parse(readFileSync(join(out, name), 'utf8'))).not.toThrow()
    }
  })
})

describe('manifestOf', () => {
  test("names the package and gives the package source its size, checksums and INFO's fields", () => {
    const bytes = Buffer.from('an spk')
    const m = manifestOf('0.2.0', 2, bytes)
    expect(m).toMatchObject({
      release: '0.2.0',
      version: '0.2.0-0002',
      file: 'highsea-0.2.0-0002.spk',
      size: 6,
      md5: createHash('md5').update(bytes).digest('hex'),
      os_min_ver: OS_MIN_VER,
      deppkgs: 'ContainerManager>=20.10.23-1432',
    })
    expect(m.sha256).toHaveLength(64)
    expect(infoOf('0.2.0', 2, 'x')).toContain(`description="${m.desc}"`)
  })
})

describe('preinst', () => {
  /** preinst in a folder of its own, run with DSM's variables, after an install saved `saved`. */
  function preinst(env: Record<string, string>, saved?: string) {
    const dir = temp()
    mkdirSync(join(dir, 'unpacked/compose'), { recursive: true })
    mkdirSync(join(dir, 'volume1/@appdata/highsea'), { recursive: true })
    if (saved) writeFileSync(join(dir, 'volume1/@appdata/highsea/package.conf'), saved)
    const log = join(dir, 'message')
    writeFileSync(log, '')
    const result = spawnSync('sh', [join(SOURCE, 'scripts/preinst')], {
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        SYNOPKG_PKGINST_TEMP_DIR: join(dir, 'unpacked'),
        SYNOPKG_PKGDEST_VOL: join(dir, 'volume1'),
        SYNOPKG_TEMP_LOGFILE: log,
        ...env,
      },
    })
    const envFile = join(dir, 'unpacked/compose/.env')
    return {
      status: result.status,
      message: readFileSync(log, 'utf8'),
      env: existsSync(envFile) ? readFileSync(envFile, 'utf8') : '',
    }
  }

  test('points the project at the folder chosen in the wizard', () => {
    const r = preinst({ SYNOPKG_PKG_STATUS: 'INSTALL', wizard_data_share: 'films and tv' })
    expect(r.status).toBe(0)
    expect(r.env).toContain("HIGHSEA_DATA='/var/packages/highsea/shares/films and tv'\n")
    expect(r.env).toMatch(/^HIGHSEA_RENDER_GID=\d+$/m)
    expect(r.env).toMatch(/^HIGHSEA_HOSTNAME=.+$/m)
  })

  test('keeps the folder chosen at install when upgrading', () => {
    // an upgrade from the command line has the install wizard's default, not what was chosen
    const r = preinst(
      { SYNOPKG_PKG_STATUS: 'UPGRADE', wizard_data_share: 'highsea' },
      'share=highsea-test\n',
    )
    expect(r.status).toBe(0)
    expect(r.env).toContain("HIGHSEA_DATA='/var/packages/highsea/shares/highsea-test'\n")
  })

  test('stops with a message when no folder was chosen', () => {
    const r = preinst({ SYNOPKG_PKG_STATUS: 'INSTALL' })
    expect(r.status).toBe(1)
    expect(r.message).toContain("Choose a shared folder for highsea's films.")
    expect(r.env).toBe('')
  })
})
