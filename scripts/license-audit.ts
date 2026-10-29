// SPDX-License-Identifier: AGPL-3.0-only
// The third-party license audit (roadmap › [Arch] License). Every installed package's license must
// be compatible with AGPL-3.0-only (ADR 0009). GPL-2.0-only, SSPL and anything unknown fail the
// run, unless reviewed and listed in license-exceptions.json with the reason. Since 4.4a it also
// reads the desktop app's crates, on every platform, from `cargo metadata` (ADR 0058).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadDefinitionFiles } from '@highsea-tv/catalog'

const ALLOWED = new Set([
  '0BSD',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  // the Unicode licence, which the FSF lists as free and GPL-compatible
  // (https://www.gnu.org/licenses/license-list.html#Unicode); ICU4X's crates use it
  'Unicode-3.0',
  'Unlicense',
  'W3C-20150513',
  'Zlib',
])

type Exception = { package: string; reason: string }

/** Exceptions that only add permissions, so the licence they're WITH stays as compatible. */
const PERMISSIVE_EXCEPTIONS = new Set(['LLVM-exception'])

/**
 * Whether an SPDX expression can be satisfied with allowed licenses: any side of OR, all of AND,
 * AND binding tighter, brackets first (SPDX's annex D,
 * https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/). Cargo's old `/` is OR
 * (https://doc.rust-lang.org/cargo/reference/manifest.html#the-license-and-license-file-fields).
 */
export function compatible(expression: string): boolean {
  const tokens = expression.replace(/\s*\/\s*/g, ' OR ').match(/\(|\)|[^\s()]+/g) ?? []
  let at = 0
  const peek = () => tokens[at]?.toUpperCase()
  function or(): boolean {
    let ok = and()
    while (peek() === 'OR') {
      at++
      ok = and() || ok
    }
    return ok
  }
  function and(): boolean {
    let ok = one()
    while (peek() === 'AND') {
      at++
      ok = one() && ok
    }
    return ok
  }
  function one(): boolean {
    const t = tokens[at++]
    if (t === '(') {
      const ok = or()
      at++
      return ok
    }
    let ok = t !== undefined && ALLOWED.has(t.replace(/\+$/, '-or-later'))
    if (peek() === 'WITH') {
      at++
      ok = PERMISSIVE_EXCEPTIONS.has(tokens[at++] ?? '') && ok
    }
    return ok
  }
  return tokens.length > 0 && or() && at === tokens.length
}

function licenseOf(pkg: { license?: unknown; licenses?: unknown }): string {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license === 'object' && 'type' in pkg.license)
    return String((pkg.license as { type: unknown }).type)
  if (Array.isArray(pkg.licenses))
    return pkg.licenses.map((l: { type?: string }) => l.type ?? 'UNKNOWN').join(' OR ')
  return 'UNKNOWN'
}

/** Every package Bun installed: node_modules/.bun/<key>/node_modules/<name>/package.json. */
function installed(root: string) {
  const store = join(root, 'node_modules/.bun')
  const found = new Map<string, string>()
  for (const key of readdirSync(store)) {
    const nm = join(store, key, 'node_modules')
    if (!existsSync(nm)) continue
    const name = key.startsWith('@')
      ? key.split('@').slice(0, 2).join('@').replace('+', '/')
      : key.split('@')[0]
    if (!name) continue
    const file = join(nm, name, 'package.json')
    if (!existsSync(file)) continue
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as {
      name: string
      version: string
      license?: unknown
    }
    found.set(`${pkg.name}@${pkg.version}`, licenseOf(pkg))
  }
  return found
}

/** The desktop app's crates from crates.io, for every platform it's built for. */
function crates(root: string) {
  const found = new Map<string, string>()
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      [
        'metadata',
        '--format-version',
        '1',
        '--locked',
        '--manifest-path',
        join(root, 'apps/desktop/src-tauri/Cargo.toml'),
      ],
      { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 },
    ).toString(),
  ) as {
    packages: { name: string; version: string; source: string | null; license: string | null }[]
  }
  // a package without a source is the app itself
  for (const p of metadata.packages)
    if (p.source) found.set(`${p.name}@${p.version}`, p.license ?? 'UNKNOWN')
  return found
}

/** Licences a catalog definition may carry: ours are CC0-1.0, contributions may be MIT. */
export const CATALOG_LICENSES = new Set(['CC0-1.0', 'MIT'])

/**
 * Every catalog definition records its source and licence (ADR 0007). The schema requires both;
 * this also refuses a licence the catalog doesn't accept and a definition that doesn't validate.
 */
export function auditCatalog(root: string): string[] {
  const bad: string[] = []
  for (const dir of ['definitions', 'beta']) {
    const { loaded, broken } = loadDefinitionFiles(join(root, 'catalog/indexers', dir))
    for (const b of broken) bad.push(`catalog/indexers/${dir}/${b.file}: ${b.message}`)
    for (const l of loaded)
      if (!CATALOG_LICENSES.has(l.definition.license))
        bad.push(
          `catalog/indexers/${dir}/${l.file}: licence ${l.definition.license} isn't CC0-1.0 or MIT`,
        )
  }
  return bad
}

if (import.meta.main) {
  const root = join(import.meta.dir, '..')
  const exceptions = JSON.parse(
    readFileSync(join(import.meta.dir, 'license-exceptions.json'), 'utf8'),
  ) as Exception[]
  const excepted = new Set(exceptions.map((e) => e.package))
  const bad: string[] = []
  const all = installed(root)
  const rust = crates(root)
  for (const [pkg, license] of [...all, ...rust]) {
    const name = pkg.slice(0, pkg.lastIndexOf('@'))
    if (!compatible(license) && !excepted.has(name) && !excepted.has(pkg))
      bad.push(`${pkg}: ${license}`)
  }
  if (bad.length) {
    console.error(
      `These licenses aren't compatible with AGPL-3.0-only, or are unknown:\n  ${bad.sort().join('\n  ')}`,
    )
    console.error(
      'Replace the package, or review it and add it to scripts/license-exceptions.json with the reason.',
    )
    process.exit(1)
  }
  const catalog = auditCatalog(root)
  if (catalog.length) {
    console.error(`These catalog definitions can't ship:\n  ${catalog.join('\n  ')}`)
    process.exit(1)
  }
  console.log(
    `license audit: ${all.size} packages and ${rust.size} crates, all compatible; catalog definitions all CC0-1.0 or MIT`,
  )
}
