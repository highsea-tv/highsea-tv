// SPDX-License-Identifier: AGPL-3.0-only
// highsea's Synology package (install-simplicity.md, part D): an SPK that runs the image as a
// Container Manager project, from the files in templates/synology/spk.
//
//   bun scripts/spk.ts build [version] [--build 1] [--out dist]   dist/highsea-<version>.spk and
//       its manifest for the package source, highsea-spk.json, for the server's version unless one
//       is given
//
// An SPK is an uncompressed tar of INFO, package.tgz (what DSM unpacks to the package's target
// folder), the scripts, conf, the wizards and the icons
// (https://help.synology.com/developer-guide/synology_package/introduction.html). Synology's own
// toolkit packs it with tar (pkgscripts-ng's pkg_util.sh); this writes the ustar format itself, so
// the package is the same on every machine.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = join(import.meta.dir, '..')
const SOURCE = join(ROOT, 'templates/synology/spk')
const ICON_256 = join(ROOT, 'packages/brand/assets/icons/desktop/128x128@2x.png')

/** DSM 7.2.1, the first with Container Manager's docker-project worker (build 1432). */
export const OS_MIN_VER = '7.2.1-69057'

const DESCRIPTION =
  'highsea finds, downloads and organises your films, with their subtitles, and serves them to your own apps. One self-hosted server in place of Radarr, Prowlarr, qBittorrent and Bazarr. It runs as a Container Manager project.'

/** Container Manager's full version, as PeerBanHelper's package compares it. */
const DEPPKGS = 'ContainerManager>=20.10.23-1432'

/**
 * The package's version: highsea's, then the package's own build number, as DSM wants
 * `[feature]-[build]` with only numbers between `.`, `-` and `_`
 * (https://help.synology.com/developer-guide/synology_package/INFO_necessary_fields.html). A
 * prerelease has no place in that, so only stable releases get a package.
 */
export function spkVersion(version: string, build = 1): string {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Only a stable release gets a Synology package, not ${version}.`)
  }
  if (!Number.isInteger(build) || build < 1 || build > 9999) {
    throw new Error(`The package's build number is 1 to 9999, not ${build}.`)
  }
  return `${version}-${String(build).padStart(4, '0')}`
}

/** INFO, as key="value" lines (https://help.synology.com/developer-guide/synology_package/INFO.html). */
export function infoOf(version: string, build: number, checksum: string): string {
  const fields: [string, string][] = [
    ['package', 'highsea'],
    ['version', spkVersion(version, build)],
    ['os_min_ver', OS_MIN_VER],
    ['displayname', 'highsea'],
    ['description', DESCRIPTION],
    ['arch', 'noarch'],
    ['maintainer', 'highsea'],
    ['maintainer_url', 'https://highsea.tv'],
    ['support_url', 'https://github.com/highsea-tv/highsea-tv/issues'],
    ['helpurl', 'https://docs.highsea.tv/install/synology/'],
    ['install_dep_packages', DEPPKGS],
    // Package Center's Open button (INFO_optional_fields.html: adminprotocol://ip:adminport/adminurl)
    ['adminprotocol', 'http'],
    ['adminport', '3000'],
    ['adminurl', '/'],
    // DSM would check adminport against every reserved port, and Container Manager leaves its
    // reservation for a container's ports (services.d/docker_<name>.sc) when the package is
    // uninstalled, so installing again would be refused; preinst checks what's really listening
    ['checkport', 'no'],
    ['checksum', checksum],
  ]
  for (const [key, value] of fields) {
    if (value.includes('"')) throw new Error(`INFO's ${key} can't hold a double quote.`)
  }
  return `${fields.map(([k, v]) => `${k}="${v}"`).join('\n')}\n`
}

export type Entry = { name: string; mode: number; body?: Uint8Array }

/**
 * A ustar archive (POSIX.1-1988, as tar(5) describes it): a 512-byte header for each entry, its
 * body padded to 512 bytes, then two empty blocks. An entry without a body is a directory.
 */
export function tar(entries: Entry[], mtime: number): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const dir = entry.body === undefined
    const name = dir && !entry.name.endsWith('/') ? `${entry.name}/` : entry.name
    if (Buffer.byteLength(name) > 100) throw new Error(`${name} is too long for a ustar name.`)
    const size = entry.body?.length ?? 0
    const header = Buffer.alloc(512)
    const put = (text: string, at: number, length: number) =>
      header.write(text, at, length, 'ascii')
    const octal = (n: number, at: number, length: number) =>
      put(`${n.toString(8).padStart(length - 1, '0')}\0`, at, length)
    put(name, 0, 100)
    octal(entry.mode, 100, 8)
    octal(0, 108, 8)
    octal(0, 116, 8)
    octal(size, 124, 12)
    octal(mtime, 136, 12)
    header.fill(' ', 148, 156)
    put(dir ? '5' : '0', 156, 1)
    put('ustar\0', 257, 6)
    put('00', 263, 2)
    put('root', 265, 32)
    put('root', 297, 32)
    let sum = 0
    for (const byte of header) sum += byte
    put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8)
    blocks.push(header)
    if (entry.body) {
      blocks.push(Buffer.from(entry.body))
      const pad = (512 - (size % 512)) % 512
      if (pad) blocks.push(Buffer.alloc(pad))
    }
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

/** Every file and folder under `dir`, sorted, named from `base`; scripts keep their mode. */
function walk(dir: string, base: string): Entry[] {
  const entries: Entry[] = []
  for (const name of readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue
    const path = join(dir, name)
    const at = `${base}${relative(dir, path)}`
    if (statSync(path).isDirectory()) {
      entries.push({ name: at, mode: 0o755 }, ...walk(path, `${at}/`))
    } else {
      const executable = (statSync(path).mode & 0o111) !== 0
      entries.push({ name: at, mode: executable ? 0o755 : 0o644, body: readFileSync(path) })
    }
  }
  return entries
}

/** The compose project, with the image pinned to this release, as package.tgz. */
export function packageTgz(version: string, mtime: number): Buffer {
  const entries = walk(join(SOURCE, 'package'), '').map((e) =>
    e.body && e.name === 'compose/compose.yaml'
      ? {
          ...e,
          body: Buffer.from(Buffer.from(e.body).toString('utf8').replaceAll('@VERSION@', version)),
        }
      : e,
  )
  // gzip, as the name says; DSM also takes xz, which Synology's toolkit uses
  // (synology_package/package_tgz/package_tgz.html)
  return gzipSync(tar(entries, mtime), { level: 9 })
}

/** The whole package, and its entries' names. */
export function spk(
  version: string,
  build: number,
  mtime: number,
): { bytes: Buffer; names: string[] } {
  const payload = packageTgz(version, mtime)
  const checksum = createHash('md5').update(payload).digest('hex')
  const entries: Entry[] = [
    { name: 'INFO', mode: 0o644, body: Buffer.from(infoOf(version, build, checksum)) },
    { name: 'package.tgz', mode: 0o644, body: payload },
    { name: 'scripts', mode: 0o755 },
    ...walk(join(SOURCE, 'scripts'), 'scripts/'),
    { name: 'conf', mode: 0o755 },
    ...walk(join(SOURCE, 'conf'), 'conf/'),
    { name: 'WIZARD_UIFILES', mode: 0o755 },
    ...walk(join(SOURCE, 'WIZARD_UIFILES'), 'WIZARD_UIFILES/'),
    { name: 'PACKAGE_ICON.PNG', mode: 0o644, body: readFileSync(join(SOURCE, 'PACKAGE_ICON.PNG')) },
    { name: 'PACKAGE_ICON_256.PNG', mode: 0o644, body: readFileSync(ICON_256) },
  ]
  return { bytes: tar(entries, mtime), names: entries.map((e) => e.name) }
}

/**
 * What highsea's package source (apps/packages) needs to list a release's package without
 * downloading it, attached to the release beside the .spk as highsea-spk.json.
 */
export type SpkManifest = {
  release: string
  version: string
  file: string
  size: number
  md5: string
  sha256: string
  os_min_ver: string
  deppkgs: string
  desc: string
}

export function manifestOf(version: string, build: number, bytes: Buffer): SpkManifest {
  return {
    release: version,
    version: spkVersion(version, build),
    file: `highsea-${spkVersion(version, build)}.spk`,
    size: bytes.length,
    md5: createHash('md5').update(bytes).digest('hex'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    os_min_ver: OS_MIN_VER,
    deppkgs: DEPPKGS,
    desc: DESCRIPTION,
  }
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2)
  const flag = (name: string) => {
    const at = rest.indexOf(name)
    if (at === -1) return undefined
    const [value] = rest.splice(at, 2).slice(1)
    return value
  }
  if (command !== 'build') {
    console.error('Usage: bun scripts/spk.ts build [version] [--build 1] [--out dist]')
    process.exit(2)
  }
  const build = Number(flag('--build') ?? 1)
  const out = flag('--out') ?? join(ROOT, 'dist')
  const version =
    rest[0] ??
    (
      JSON.parse(readFileSync(join(ROOT, 'apps/server/package.json'), 'utf8')) as {
        version: string
      }
    ).version
  // SOURCE_DATE_EPOCH makes the archive's times reproducible (https://reproducible-builds.org/specs/source-date-epoch/)
  const mtime = Number(process.env.SOURCE_DATE_EPOCH ?? Math.floor(Date.now() / 1000))
  const { bytes } = spk(version, build, mtime)
  mkdirSync(out, { recursive: true })
  const manifest = manifestOf(version, build, bytes)
  const path = join(out, manifest.file)
  writeFileSync(path, bytes)
  writeFileSync(join(out, 'highsea-spk.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${path} (${(bytes.length / 1024).toFixed(0)} KB), and highsea-spk.json`)
}
