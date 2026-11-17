// SPDX-License-Identifier: AGPL-3.0-only
// `bun run clean`: removes what development rebuilds, and says how much it freed.
//
// - In this checkout: the builds (`.next`, `dist`, the desktop app's Rust `target`), the tools'
//   caches and the tests' and sweeps' output, each only where git ignores it (`git check-ignore`,
//   https://git-scm.com/docs/git-check-ignore), so nothing git tracks can go.
// - In the temp folder (os.tmpdir(), https://nodejs.org/api/os.html#ostmpdir): `highsea-*` folders
//   nothing has changed in for an hour, what a test or sweep left when it was stopped. A run still
//   going changes its folder, so it stays; lock files stay too.
// - `--docker`: Docker's build cache (`docker buildx prune`,
//   https://docs.docker.com/reference/cli/docker/buildx/prune/) and dangling images, the untagged
//   ones no container uses (`docker image prune`,
//   https://docs.docker.com/reference/cli/docker/image/prune/). Containers, tagged images and
//   volumes stay.
// - `--deps`: node_modules too (`bun install` brings it back).
// - `--dry-run`: says what it would remove, and removes nothing.
//
// Never removes `.dev` (the development server's data), anything under /Volumes, or anything
// outside this checkout and the temp folder.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

const ROOT = realpathSync(join(import.meta.dir, '..'))
const TEMP = realpathSync(tmpdir())
const HOUR = 60 * 60 * 1000

/** Build output and caches, by name, in the root and each workspace (the root's .gitignore). */
const OUTPUT = [
  '.next',
  'dist',
  'dist-desktop',
  'dist-mock',
  'build',
  'out',
  '.expo',
  '.turbo',
  '.source',
  'coverage',
  'playwright-report',
  'test-results',
]
/** Output at its own place. */
const PLACED = ['apps/desktop/src-tauri/target']

export type Options = { docker: boolean; deps: boolean; dryRun: boolean }

export function parseArgs(args: string[]): Options {
  const known = new Set(['--docker', '--deps', '--dry-run'])
  const unknown = args.filter((a) => !known.has(a))
  if (unknown.length)
    throw new Error(`clean: unknown ${unknown.join(' ')}; it takes --docker, --deps and --dry-run`)
  return {
    docker: args.includes('--docker'),
    deps: args.includes('--deps'),
    dryRun: args.includes('--dry-run'),
  }
}

const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep)

/**
 * Whether `path` may be removed: in this checkout or the temp folder, not the checkout itself,
 * not .dev, not under /Volumes. The path's real location is checked, so a link can't lead out.
 */
export function allowed(path: string, root = ROOT, temp = TEMP): boolean {
  let real: string
  try {
    // the folder holding it, resolved: a link itself is removed, never what it points to
    real = join(realpathSync(join(path, '..')), path.split(sep).pop() ?? '')
  } catch {
    return false
  }
  if (inside(real, '/Volumes')) return false
  if (real === root || real === temp) return false
  if (inside(real, join(root, '.dev'))) return false
  return (inside(real, root) && !inside(real, join(root, '.git'))) || inside(real, temp)
}

/** The checkout's workspaces, the root among them (package.json's workspaces: apps, packages, design). */
function workspaces() {
  const dirs = [ROOT]
  for (const group of ['apps', 'packages', 'design']) {
    const base = join(ROOT, group)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base)) {
      const dir = join(base, name)
      if (lstatSync(dir).isDirectory()) dirs.push(dir)
    }
  }
  return dirs
}

/** The paths among `paths` git ignores: the only ones in the checkout clean may remove. */
function ignored(paths: string[]) {
  if (!paths.length) return []
  const run = spawnSync('git', ['check-ignore', '--stdin', '-z'], {
    cwd: ROOT,
    input: paths.map((p) => relative(ROOT, p)).join('\0'),
    encoding: 'utf8',
  })
  const out = new Set(run.stdout.split('\0').filter(Boolean))
  return paths.filter((p) => out.has(relative(ROOT, p)))
}

/** What the checkout holds to remove. */
export function checkoutTargets(deps: boolean) {
  const found: string[] = []
  for (const dir of workspaces()) {
    for (const name of [...OUTPUT, ...(deps ? ['node_modules'] : [])]) {
      const path = join(dir, name)
      if (existsSync(path)) found.push(path)
    }
    // apps/client's other mock exports (.dist-mock-*), and TypeScript's build info
    for (const name of readdirSync(dir))
      if (name.startsWith('.dist-mock-') || name.endsWith('.tsbuildinfo'))
        found.push(join(dir, name))
  }
  for (const p of PLACED) if (existsSync(join(ROOT, p))) found.push(join(ROOT, p))
  return ignored(found)
}

/** The newest change under `path`, stopping early once one is newer than `after`. */
function newest(path: string, after: number): number {
  let latest = 0
  const stack = [path]
  while (stack.length) {
    const p = stack.pop() as string
    let s: ReturnType<typeof lstatSync>
    try {
      s = lstatSync(p)
    } catch {
      continue
    }
    latest = Math.max(latest, s.mtimeMs)
    if (latest > after) return latest
    if (s.isDirectory())
      try {
        for (const name of readdirSync(p)) stack.push(join(p, name))
      } catch {
        // unreadable: judged by what was read
      }
  }
  return latest
}

/** `highsea-*` in the temp folder that nothing has changed in for an hour; never a lock. */
export function tempTargets(now = Date.now(), temp = TEMP) {
  const cutoff = now - HOUR
  return readdirSync(temp)
    .filter((name) => name.startsWith('highsea-') && !name.endsWith('.lock'))
    .map((name) => join(temp, name))
    .filter((path) => newest(path, cutoff) <= cutoff)
}

/** Kilobytes on disk (du's -k), or 0 when du can't say. */
function size(path: string) {
  const run = spawnSync('du', ['-sk', path], { encoding: 'utf8' })
  return Number(run.stdout.split('\t')[0]) * 1024 || 0
}

export const human = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let u = 0
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000
    u++
  }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

function docker(dryRun: boolean) {
  const has = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' })
  if (has.status !== 0) {
    console.log('Docker: not running, so nothing pruned.')
    return
  }
  if (dryRun) {
    console.log(execFileSync('docker', ['system', 'df'], { encoding: 'utf8' }).trimEnd())
    console.log('Docker: would prune the build cache and dangling images.')
    return
  }
  const cache = execFileSync('docker', ['buildx', 'prune', '--force'], { encoding: 'utf8' })
  const images = execFileSync('docker', ['image', 'prune', '--force'], { encoding: 'utf8' })
  const total = (s: string) => s.match(/Total(?: reclaimed space)?:\s*(\S+)/)?.[1] ?? '0B'
  console.log(`Docker: build cache ${total(cache)}, dangling images ${total(images)}`)
}

if (import.meta.main) {
  let options: Options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error((e as Error).message)
    process.exit(2)
  }
  const targets = [...checkoutTargets(options.deps), ...tempTargets()].filter((p) => allowed(p))
  let freed = 0
  for (const path of targets) {
    const bytes = size(path)
    freed += bytes
    const where = inside(path, ROOT) ? relative(ROOT, path) : path
    if (!options.dryRun) rmSync(path, { recursive: true, force: true })
    console.log(
      `${options.dryRun ? 'would remove' : 'removed'} ${human(bytes).padStart(8)}  ${where}`,
    )
  }
  const temp = targets.filter((p) => inside(p, TEMP)).length
  console.log(
    `${options.dryRun ? 'Would free' : 'Freed'} ${human(freed)}: ${targets.length - temp} in the checkout, ${temp} in the temp folder.`,
  )
  if (options.docker) docker(options.dryRun)
}
