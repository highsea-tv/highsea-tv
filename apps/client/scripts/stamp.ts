// SPDX-License-Identifier: AGPL-3.0-only
// The mock web export's stamp: a hash of every input's path, size and modification time (so a
// deleted file counts), kept in dist-mock/.stamp. The inputs are apps/client's own source and
// config, the source and manifest of each workspace package it depends on (and theirs), the
// native plugins, the brand's assets and bun.lock. export-mock.ts writes it however the export
// is run, and the prototypes' server (design/prototypes/client-export.ts) makes the export again
// when it differs from the inputs' now; both read it from here, so they never disagree.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository's root. */
// from import.meta.url, not Bun's import.meta.dir: Vite may load the prototypes' config under Node
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
/** The stamp's file in the export. */
export const STAMP_FILE = '.stamp'

const SKIP = /(^|[/\\])(node_modules|dist|dist-mock|ios|android|\.expo|test)([/\\]|$)/

/** Each file under `dir` as `path:size:mtime`, leaving out installs, builds and tests. */
function filesUnder(dir: string, out: string[]) {
  const top = statSync(dir, { throwIfNoEntry: false })
  if (!top) return
  if (top.isFile()) {
    out.push(`${dir}:${top.size}:${top.mtimeMs}`)
    return
  }
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (SKIP.test(name)) continue
    const at = statSync(join(dir, name), { throwIfNoEntry: false })
    if (at?.isFile()) out.push(`${join(dir, name)}:${at.size}:${at.mtimeMs}`)
  }
}

/** The workspace packages a package.json depends on, by folder, and theirs in turn. */
function workspaceFolders(root: string, manifest: string, seen = new Set<string>()): Set<string> {
  const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  for (const [name, version] of Object.entries(deps)) {
    if (!version.startsWith('workspace:') || !name.startsWith('@highsea-tv/')) continue
    const folder = workspaceFolder(root, name)
    if (!folder || seen.has(folder)) continue
    seen.add(folder)
    workspaceFolders(root, join(folder, 'package.json'), seen)
  }
  return seen
}

const folders = new Map<string, Map<string, string>>()
/** A workspace package's folder by its name, from the root's packages/*. */
function workspaceFolder(root: string, name: string): string | undefined {
  let named = folders.get(root)
  if (!named) {
    named = new Map()
    folders.set(root, named)
    for (const dir of readdirSync(join(root, 'packages'))) {
      const manifest = join(root, 'packages', dir, 'package.json')
      if (!existsSync(manifest)) continue
      const own = (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name
      if (own) named.set(own, join(root, 'packages', dir))
    }
  }
  return named.get(name)
}

/** What the export is made from, hashed: see the header. `root` is the repository's (a test's own). */
export function inputsStamp(root = ROOT): string {
  const client = join(root, 'apps/client')
  const files: string[] = []
  for (const f of ['src', 'app.config.ts', 'metro.config.js', 'package.json', 'tsconfig.json'])
    filesUnder(join(client, f), files)
  for (const f of readdirSync(client).filter((f) => /^babel\.config\./.test(f)))
    filesUnder(join(client, f), files)
  for (const folder of workspaceFolders(root, join(client, 'package.json'))) {
    filesUnder(join(folder, 'src'), files)
    filesUnder(join(folder, 'package.json'), files)
  }
  filesUnder(join(root, 'packages/native/plugins'), files)
  filesUnder(join(root, 'packages/brand/assets'), files)
  filesUnder(join(root, 'bun.lock'), files)
  return createHash('sha256').update(files.sort().join('\n')).digest('hex')
}
