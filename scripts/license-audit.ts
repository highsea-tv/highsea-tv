// SPDX-License-Identifier: AGPL-3.0-only
// The third-party license audit (roadmap › [Arch] License). Every installed package's license must
// be compatible with AGPL-3.0-only (ADR 0009). GPL-2.0-only, SSPL and anything unknown fail the
// run, unless reviewed and listed in license-exceptions.json with the reason.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  'Unlicense',
  'W3C-20150513',
  'Zlib',
])

type Exception = { package: string; reason: string }

/** Whether an SPDX expression can be satisfied with allowed licenses: any side of OR, all of AND. */
export function compatible(expression: string): boolean {
  const e = expression.trim().replace(/^\((.*)\)$/, '$1')
  if (/ OR /i.test(e)) return e.split(/ OR /i).some(compatible)
  if (/ AND /i.test(e)) return e.split(/ AND /i).every(compatible)
  return ALLOWED.has(e.replace(/\+$/, '-or-later'))
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

if (import.meta.main) {
  const root = join(import.meta.dir, '..')
  const exceptions = JSON.parse(
    readFileSync(join(import.meta.dir, 'license-exceptions.json'), 'utf8'),
  ) as Exception[]
  const excepted = new Set(exceptions.map((e) => e.package))
  const bad: string[] = []
  const all = installed(root)
  for (const [pkg, license] of all) {
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
  console.log(`license audit: ${all.size} packages, all compatible`)
}
