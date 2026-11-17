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
      'WIZARD_UIFILES/install_uifile.sh',
      'WIZARD_UIFILES/upgrade_uifile.sh',
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

  test('conf and the uninstall wizard are JSON', () => {
    for (const name of ['conf/privilege', 'conf/resource', 'WIZARD_UIFILES/uninstall_uifile']) {
      expect(() => JSON.parse(readFileSync(join(out, name), 'utf8'))).not.toThrow()
    }
  })

  test('the wizards are one script under both names, executable, and it parses', () => {
    const install = readFileSync(join(out, 'WIZARD_UIFILES/install_uifile.sh'))
    expect(readFileSync(join(out, 'WIZARD_UIFILES/upgrade_uifile.sh')).equals(install)).toBe(true)
    for (const name of ['install_uifile.sh', 'upgrade_uifile.sh']) {
      const path = join(out, 'WIZARD_UIFILES', name)
      expect(statSync(path).mode & 0o111).toBe(0o111)
      expect(spawnSync('sh', ['-n', path]).status).toBe(0)
    }
  })

  type Item = {
    type?: string
    desc?: string
    subitems?: {
      key: string
      desc: string
      defaultValue?: string | boolean
      store?: { data: [string, string][] }
    }[]
  }
  type Step = { step_title: string; items: Item[] }

  /**
   * The wizard a script writes, run as DSM runs it, on a NAS whose volumes hold `folders` and whose
   * package settings, if any, are `saved` (where they are on an installed package or after an
   * uninstall that kept them).
   */
  function wizard(
    script: 'install_uifile.sh' | 'upgrade_uifile.sh',
    folders: string[],
    saved?: { at: 'installed' | 'kept'; conf: string },
  ): Step[] {
    const nas = temp()
    for (const f of folders) mkdirSync(join(nas, f), { recursive: true })
    if (saved) {
      const dir =
        saved.at === 'installed'
          ? join(nas, 'var/packages/highsea/var')
          : join(nas, 'volume1/@appdata/highsea')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.conf'), saved.conf)
    }
    const log = join(nas, 'wizard.json')
    const run = spawnSync('sh', [join(out, 'WIZARD_UIFILES', script)], {
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HIGHSEA_WIZARD_ROOT: nas,
        SYNOPKG_TEMP_LOGFILE: log,
      },
    })
    expect(run.status).toBe(0)
    return JSON.parse(readFileSync(log, 'utf8'))
  }
  const NAS = [
    'volume1/data/media/movies',
    'volume1/my films',
    'volume1/@appstore',
    'volume1/#recycle',
    'volume1/.hidden',
    'volume2/video',
  ]
  const shareItem = (steps: Step[]) => steps[0]?.items[0]
  const shareList = (steps: Step[]) => shareItem(steps)?.subitems?.[0]?.store?.data ?? []
  test("install: a dropdown of the volumes' shared folders, a new highsea first", () => {
    const steps = wizard('install_uifile.sh', NAS)
    // only the shared folder: the library's folders in it are chosen in setup and Settings
    expect(steps.map((s) => s.step_title)).toEqual(['Your shared folder', 'Before you start'])
    expect(shareItem(steps)?.type).toBe('combobox')
    expect(shareItem(steps)?.subitems?.[0]).toMatchObject({
      key: 'wizard_data_share',
      defaultValue: 'highsea',
      editable: false,
      mode: 'local',
    })
    // DSM selects the first entry whatever defaultValue says (ADR 0057), so it's the safe one;
    // DSM's own folders, the recycle bin and hidden folders aren't shared folders
    expect(shareList(steps)).toEqual([
      ['highsea, a new shared folder', 'highsea'],
      ['data', 'data'],
      ['my films', 'my films'],
      ['video', 'video'],
    ])
    for (const step of steps) expect(JSON.stringify(step)).not.toContain('!')
  })

  test('install: an existing highsea shared folder is listed as it is', () => {
    expect(shareList(wizard('install_uifile.sh', [...NAS, 'volume1/highsea']))[0]).toEqual([
      'highsea',
      'highsea',
    ])
  })

  test('install again after an uninstall that kept the settings: the folder chosen before', () => {
    // an install of 0.4.0 saved who managed the library too, which is no longer asked
    const steps = wizard('install_uifile.sh', NAS, {
      at: 'kept',
      conf: 'share=data\nlibrary=read-only\n',
    })
    expect(shareList(steps)[0]).toEqual(['data (as before)', 'data'])
    expect(shareList(steps).filter(([, v]) => v === 'data')).toHaveLength(1)
    expect(shareItem(steps)?.subitems?.[0]?.key).toBe('wizard_data_share')
  })

  test('upgrade: the current folder, under a key of its own, and what changes', () => {
    const steps = wizard('upgrade_uifile.sh', NAS, { at: 'installed', conf: 'share=data\n' })
    expect(shareList(steps)[0]).toEqual(['data (now)', 'data'])
    expect(shareItem(steps)?.subitems?.[0]).toMatchObject({
      key: 'wizard_upgrade_share',
      defaultValue: 'data',
    })
    expect(steps.map((s) => s.step_title)).toEqual(['Your shared folder', 'What changes'])
    expect(steps[1]?.items[0]?.desc).toContain('Control Panel')
  })

  test('a name the .env could not quote is left out', () => {
    const list = shareList(wizard('install_uifile.sh', [...NAS, "volume1/it's", 'volume1/a$b']))
    expect(list.map(([, v]) => v)).toEqual(['highsea', 'data', 'my films', 'video'])
  })

  test('with no volume it can read, the name is typed, as before', () => {
    const item = shareItem(wizard('install_uifile.sh', []))
    expect(item?.type).toBe('textfield')
    expect(item?.subitems?.[0]).toMatchObject({ key: 'wizard_data_share', defaultValue: 'highsea' })
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
  /**
   * preinst (or another script) in a folder of its own, run with DSM's variables, after an install
   * saved `saved`.
   */
  function preinst(env: Record<string, string>, saved?: string, script = 'preinst') {
    const dir = temp()
    mkdirSync(join(dir, 'unpacked/compose'), { recursive: true })
    mkdirSync(join(dir, 'volume1/@appdata/highsea'), { recursive: true })
    if (saved) writeFileSync(join(dir, 'volume1/@appdata/highsea/package.conf'), saved)
    const log = join(dir, 'message')
    writeFileSync(log, '')
    const result = spawnSync('sh', [join(SOURCE, 'scripts', script)], {
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

  test('mounts only the shared folder; highsea keeps what it makes in a folder of its own', () => {
    // which folders hold the library, and whether highsea only reads them, is chosen in setup and
    // Settings, so the package assumes no folder in the share (ADR 0057, 2026-11-17)
    const r = preinst({
      SYNOPKG_PKG_STATUS: 'INSTALL',
      wizard_data_share: 'data',
      wizard_library_read_only: 'true',
    })
    expect(r.status).toBe(0)
    expect(r.env).not.toContain('MEDIA')
    expect(r.env).not.toContain('LIBRARY')
    const compose = readFileSync(join(SOURCE, 'package/compose/compose.yaml'), 'utf8')
    expect(compose).not.toContain('media')
    expect(compose).toContain('HIGHSEA_WORK_DIR: /data/highsea\n')
    expect(compose).toContain(['- $', '{HIGHSEA_DATA}:/data\n'].join(''))
  })

  test('an upgrade keeps the folder saved by 0.4.0, which saved who managed the library too', () => {
    const r = preinst(
      { SYNOPKG_PKG_STATUS: 'UPGRADE', wizard_data_share: 'highsea' },
      'share=data\nlibrary=read-only\n',
    )
    expect(r.status).toBe(0)
    expect(r.env).toContain("HIGHSEA_DATA='/var/packages/highsea/shares/data'\n")
  })

  test('an upgrade through the upgrade wizard takes the folder chosen there', () => {
    const r = preinst(
      {
        SYNOPKG_PKG_STATUS: 'UPGRADE',
        wizard_data_share: 'highsea',
        wizard_upgrade_share: 'video',
      },
      'share=data\n',
    )
    expect(r.status).toBe(0)
    expect(r.env).toContain("HIGHSEA_DATA='/var/packages/highsea/shares/video'\n")
  })

  test('stops with a message when no folder was chosen', () => {
    const r = preinst({ SYNOPKG_PKG_STATUS: 'INSTALL' })
    expect(r.status).toBe(1)
    expect(r.message).toContain('Choose a shared folder for highsea.')
    expect(r.env).toBe('')
  })

  test("preupgrade checks the upgrade wizard's folder before the old version is uninstalled", () => {
    // DSM aborts the upgrade when preupgrade fails; a preinst that fails then leaves no package
    // (the NAS test of 2026-11-16)
    const env = { SYNOPKG_PKG_STATUS: 'UPGRADE', wizard_upgrade_share: "it's" }
    const refused = preinst(env, 'share=data\n', 'preupgrade')
    expect(refused.status).toBe(1)
    expect(refused.message).toContain("highsea can't use the shared folder it's.")
    // it writes nothing; preinst does
    expect(refused.env).toBe('')
    const fine = preinst({ ...env, wizard_upgrade_share: 'highsea' }, 'share=data\n', 'preupgrade')
    expect(fine.status).toBe(0)
    expect(fine.message).toBe('')
    expect(fine.env).toBe('')
  })

  test('stops with a message for a name the .env could not quote', () => {
    for (const name of ["it's", 'a/b', '@appstore']) {
      const r = preinst({ SYNOPKG_PKG_STATUS: 'INSTALL', wizard_data_share: name })
      expect(r.status).toBe(1)
      expect(r.message).toContain(`highsea can't use the shared folder ${name}.`)
      expect(r.env).toBe('')
    }
  })
})
