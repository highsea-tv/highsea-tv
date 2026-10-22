// SPDX-License-Identifier: AGPL-3.0-only
// The image's runtime tree (phase-3-checkpoint-9.md › Docker), run inside the Dockerfile's
// `production` stage:
//
//   bun scripts/image.ts production <built workspace> <out>
//
// 1. Copies the root manifest, the lockfile and every workspace's package.json into <out>, and
//    installs there with `bun install --production --frozen-lockfile --filter @highsea-tv/server`.
//    `--production` leaves out devDependencies and `--filter` installs for some workspaces only
//    (https://bun.com/docs/pm/cli/install). Bun's docs don't say whether a filtered workspace's
//    workspace dependencies come along, so this doesn't assume it: step 2 checks the result.
// 2. Fails if the installed tree holds a package nothing in it asks for: a dependency, optional
//    dependency or peer of a production workspace or of an installed package. That's what a
//    dev-only package would be. (`tailwindcss` is a peer of ui-web, and `typescript` an optional
//    peer of cosmiconfig, so both are asked for.) It fails, too, if a workspace the server needs
//    got no install.
// 3. Removes the packages built for another C library. npm's `libc` field says which one a package
//    needs, and npm skips a package whose `libc` isn't the system's
//    (https://docs.npmjs.com/cli/v11/configuring-npm/package-json#libc). Bun filters by `os` and
//    `cpu` only (`bun install --help`), so Next's and sharp's musl builds come along beside the
//    glibc ones. The image is Debian, which is glibc, and those packages load only on musl (Next
//    and sharp pick their binary by the libc they find), so they go, with the links to them.
// 4. Copies what `node server.ts` loads: each workspace the server depends on, as source (packages
//    export raw TypeScript, run with type stripping, ADR 0003), without tests, scripts or docs; and
//    the server's entry, its sources, `public/` and Next's build without its cache.
//
// What stays out: design/, docs/, scripts/, storybook, the prototypes, every test/ folder (so the
// fakes behind HIGHSEA_SUBTITLES_FAKE and HIGHSEA_LISTS_FAKE, and TMDB's recordings, are for a
// checkout), and every dev dependency.
//
// Two checks CI runs on the built image (.github/workflows/ci.yml):
//
//   bun scripts/image.ts size <image> <budget in MB>
//     Lists the image's largest folders, and fails above the budget (the plan's size check).
//   bun scripts/image.ts attestations <OCI layout folder>
//     Reads an image exported with `type=oci` and fails unless it has the OCI labels GitHub reads
//     and both attestations: BuildKit's provenance and the SBOM. They're stored as an attestation
//     manifest beside the image's, marked `vnd.docker.reference.type: attestation-manifest`, each
//     layer an in-toto statement named by `in-toto.io/predicate-type`
//     (https://docs.docker.com/build/metadata/attestations/attestation-storage/).
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { basename, join, relative } from 'node:path'

type Manifest = {
  name: string
  workspaces?: string[]
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  libc?: string[]
}

const SERVER = '@highsea-tv/server'
// the runtime stage is node:…-bookworm-slim, Debian's glibc
const LIBC = 'glibc'

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Manifest
const runtimeDeps = (m: Manifest) => [
  ...Object.keys(m.dependencies ?? {}),
  ...Object.keys(m.optionalDependencies ?? {}),
  ...Object.keys(m.peerDependencies ?? {}),
]

/** Each workspace's folder, relative to the root, by package name. */
export function workspaces(root: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const pattern of read(join(root, 'package.json')).workspaces ?? []) {
    // the root's globs are all `folder/*`
    const parent = pattern.replace(/\/\*$/, '')
    if (!existsSync(join(root, parent))) continue
    for (const name of readdirSync(join(root, parent))) {
      const manifest = join(root, parent, name, 'package.json')
      if (existsSync(manifest)) out.set(read(manifest).name, join(parent, name))
    }
  }
  return out
}

/** The workspaces `name` needs at run time, itself included: workspace `dependencies`, followed. */
export function closure(root: string, name: string, all = workspaces(root)): string[] {
  const seen = new Set<string>()
  const visit = (n: string) => {
    if (seen.has(n)) return
    seen.add(n)
    const dir = all.get(n)
    if (!dir) throw new Error(`No workspace is called ${n}.`)
    for (const dep of Object.keys(read(join(root, dir, 'package.json')).dependencies ?? {}))
      if (all.has(dep)) visit(dep)
  }
  visit(name)
  return [...seen].map((n) => all.get(n) as string).sort()
}

/** Every real package in an isolated install's store (`node_modules/.bun`), with its manifest. */
function storePackages(root: string): Manifest[] {
  const store = join(root, 'node_modules', '.bun')
  const out: Manifest[] = []
  for (const entry of readdirSync(store)) {
    const modules = join(store, entry, 'node_modules')
    if (!existsSync(modules)) continue
    for (const name of readdirSync(modules)) {
      const dirs = name.startsWith('@')
        ? readdirSync(join(modules, name)).map((n) => join(modules, name, n))
        : [join(modules, name)]
      // the package itself is a folder; its dependencies beside it are links into the store
      for (const dir of dirs)
        if (!lstatSync(dir).isSymbolicLink() && existsSync(join(dir, 'package.json')))
          out.push(read(join(dir, 'package.json')))
    }
  }
  return out
}

/** Installed packages nothing in the production tree asks for. */
export function unrequested(root: string, needed: string[]): string[] {
  const installed = storePackages(root)
  const asked = new Set<string>()
  for (const dir of needed)
    for (const d of runtimeDeps(read(join(root, dir, 'package.json')))) asked.add(d)
  for (const m of installed) for (const d of runtimeDeps(m)) asked.add(d)
  return [...new Set(installed.map((m) => m.name))].filter((n) => !asked.has(n)).sort()
}

/**
 * Removes the store's packages whose `libc` names only other C libraries, and every link left
 * pointing at nothing. Returns the removed packages' names.
 */
export function pruneOtherLibc(root: string, libc = LIBC): string[] {
  const store = join(root, 'node_modules', '.bun')
  const removed: string[] = []
  // found first and removed after, since an entry holds links beside its package
  const entries = new Set<string>()
  for (const entry of readdirSync(store)) {
    const modules = join(store, entry, 'node_modules')
    if (!existsSync(modules)) continue
    for (const name of readdirSync(modules)) {
      const dirs = name.startsWith('@')
        ? readdirSync(join(modules, name)).map((n) => join(modules, name, n))
        : [join(modules, name)]
      for (const dir of dirs) {
        if (lstatSync(dir).isSymbolicLink() || !existsSync(join(dir, 'package.json'))) continue
        const m = read(join(dir, 'package.json'))
        if (m.libc?.length && !m.libc.includes(libc)) {
          entries.add(entry)
          removed.push(m.name)
        }
      }
    }
  }
  for (const entry of entries) rmSync(join(store, entry), { recursive: true })
  // the links to them, in the store and in each workspace's node_modules (existsSync follows links)
  const unlinkDangling = (modules: string) => {
    if (!existsSync(modules)) return
    for (const name of readdirSync(modules)) {
      const path = join(modules, name)
      if (name.startsWith('@') && !lstatSync(path).isSymbolicLink()) unlinkDangling(path)
      else if (lstatSync(path).isSymbolicLink() && !existsSync(path)) rmSync(path)
    }
  }
  for (const entry of readdirSync(store)) unlinkDangling(join(store, entry, 'node_modules'))
  unlinkDangling(join(root, 'node_modules'))
  for (const dir of workspaces(root).values()) unlinkDangling(join(root, dir, 'node_modules'))
  return removed.sort()
}

const SKIP_IN_PACKAGES = new Set(['node_modules', 'test', 'scripts', 'drizzle.config.ts'])
const skipped = (name: string) =>
  SKIP_IN_PACKAGES.has(name) ||
  name.endsWith('.md') ||
  name.endsWith('.tsbuildinfo') ||
  /^tsconfig.*\.json$/.test(name) ||
  /\.stories\.tsx?$/.test(name)

function production(from: string, to: string) {
  // .dockerignore keeps secrets out of the context; this fails the build if it ever doesn't
  const secrets = readdirSync(from).filter((n) => /^\.env(\.|$)/.test(n) && n !== '.env.example')
  if (secrets.length)
    throw new Error(
      `${secrets.join(', ')} reached the build context; .dockerignore must leave it out`,
    )
  const all = workspaces(from)
  mkdirSync(to, { recursive: true })
  for (const file of ['package.json', 'bun.lock']) cpSync(join(from, file), join(to, file))
  for (const dir of all.values())
    cpSync(join(from, dir, 'package.json'), join(to, dir, 'package.json'), { recursive: true })

  const install = spawnSync(
    'bun',
    ['install', '--production', '--frozen-lockfile', '--filter', SERVER],
    { cwd: to, stdio: 'inherit' },
  )
  if (install.status !== 0) throw new Error('The production install failed.')

  const needed = closure(from, SERVER, all)
  const problems: string[] = []
  for (const name of unrequested(to, needed))
    problems.push(`${name} is installed, but nothing in production asks for it`)
  for (const dir of needed) {
    const deps = Object.keys(read(join(from, dir, 'package.json')).dependencies ?? {})
    if (deps.length && !existsSync(join(to, dir, 'node_modules')))
      problems.push(`${dir} needs dependencies, and the install gave it none`)
  }
  if (problems.length) throw new Error(`The production tree is wrong:\n- ${problems.join('\n- ')}`)

  const pruned = pruneOtherLibc(to)
  if (pruned.length) console.log(`Not for ${LIBC}, so left out: ${pruned.join(', ')}`)

  for (const dir of needed) {
    if (dir === all.get(SERVER)) continue
    for (const name of readdirSync(join(from, dir)))
      if (!skipped(name) && name !== 'package.json')
        cpSync(join(from, dir, name), join(to, dir, name), {
          recursive: true,
          filter: (src) => !skipped(basename(src)) || src === join(from, dir, name),
        })
  }

  const server = all.get(SERVER) as string
  for (const name of ['server.ts', 'next.config.ts', 'src', 'public'])
    cpSync(join(from, server, name), join(to, server, name), { recursive: true })
  // Next's build, without what only `next build` and `next dev` use again
  cpSync(join(from, server, '.next'), join(to, server, '.next'), {
    recursive: true,
    filter: (src) => {
      const rel = relative(join(from, server, '.next'), src)
      return (
        rel !== 'cache' && rel !== 'dev' && !rel.startsWith(`cache/`) && !rel.startsWith('dev/')
      )
    },
  })
  console.log(`The production tree: ${needed.length} workspaces, in ${to}`)
}

function size(image: string, budgetMb: number) {
  const inspect = spawnSync('docker', ['image', 'inspect', '--format', '{{.Size}}', image], {
    encoding: 'utf8',
  })
  if (inspect.status !== 0) throw new Error(`No image called ${image}: ${inspect.stderr}`)
  const mb = Math.round(Number(inspect.stdout.trim()) / 1_000_000)
  const du = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      image,
      '-c',
      'du -xk -d 4 /app /usr /opt /var 2>/dev/null | sort -rn | head -25',
    ],
    { encoding: 'utf8' },
  )
  console.log(`The largest folders in ${image}:`)
  for (const line of du.stdout.trim().split('\n')) {
    const [kb, path] = line.split('\t')
    console.log(`${String(Math.round(Number(kb) / 1000)).padStart(7)} MB  ${path}`)
  }
  console.log(`\n${image}: ${mb} MB, budget ${budgetMb} MB`)
  if (mb > budgetMb) {
    console.error(
      `The image is ${mb - budgetMb} MB over its budget. Find what grew above, or raise the budget in ci.yml with the reason.`,
    )
    process.exit(1)
  }
}

type Descriptor = {
  mediaType: string
  digest: string
  annotations?: Record<string, string>
  platform?: { os: string; architecture: string }
}
type Index = { manifests: Descriptor[] }
type ImageManifest = { config: Descriptor; layers: Descriptor[] }

/** The OCI labels GitHub's package page reads (phase-3-checkpoint-9.md › Images). */
const LABELS = [
  'org.opencontainers.image.source',
  'org.opencontainers.image.description',
  'org.opencontainers.image.licenses',
]
const PROVENANCE = /^https:\/\/slsa\.dev\/provenance\//
const SBOM = 'https://spdx.dev/Document'

/** What an OCI layout's image lacks, and what each platform has. */
export function attestationProblems(layout: string): { problems: string[]; found: string[] } {
  const blob = <T>(d: Descriptor) =>
    JSON.parse(readFileSync(join(layout, 'blobs', ...d.digest.split(':')), 'utf8')) as T
  const top = JSON.parse(readFileSync(join(layout, 'index.json'), 'utf8')) as Index
  // the exporter's index points at the image's own index, which holds the image and its attestations
  const manifests = top.manifests.flatMap((d) =>
    d.mediaType.endsWith('image.index.v1+json') ? blob<Index>(d).manifests : [d],
  )
  const problems: string[] = []
  const found: string[] = []
  const images = manifests.filter(
    (d) => d.annotations?.['vnd.docker.reference.type'] !== 'attestation-manifest',
  )
  const attests = manifests.filter(
    (d) => d.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest',
  )
  if (!images.length) problems.push('no image manifest')
  for (const d of images) {
    const platform = `${d.platform?.os}/${d.platform?.architecture}`
    const config = blob<{ config?: { Labels?: Record<string, string> } }>(
      blob<ImageManifest>(d).config,
    )
    const labels = config.config?.Labels ?? {}
    for (const l of LABELS) if (!labels[l]) problems.push(`${platform}: no ${l} label`)
    const description = labels['org.opencontainers.image.description'] ?? ''
    if (description.length > 512)
      problems.push(`${platform}: the description is over GitHub's 512 characters`)
    const mine = attests.find((a) => a.annotations?.['vnd.docker.reference.digest'] === d.digest)
    if (!mine) {
      problems.push(`${platform}: no attestations`)
      continue
    }
    const kinds = blob<ImageManifest>(mine).layers.map(
      (l) => l.annotations?.['in-toto.io/predicate-type'] ?? '',
    )
    if (!kinds.some((k) => PROVENANCE.test(k))) problems.push(`${platform}: no provenance`)
    if (!kinds.includes(SBOM)) problems.push(`${platform}: no SBOM`)
    found.push(`${platform}: labels, ${kinds.join(', ')}`)
  }
  return { problems, found }
}

function attestations(layout: string) {
  const { problems, found } = attestationProblems(layout)
  for (const line of found) console.log(line)
  if (problems.length) {
    console.error(`The image's metadata is incomplete:\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
}

if (import.meta.main) {
  const [command, a, b] = process.argv.slice(2)
  const self = relative(process.cwd(), import.meta.path)
  if (command === 'production' && a && b) production(a, b)
  else if (command === 'size' && a && Number(b) > 0) size(a, Number(b))
  else if (command === 'attestations' && a) attestations(a)
  else {
    console.error(
      `Usage: bun ${self} production <from> <to>\n       bun ${self} size <image> <budget in MB>\n       bun ${self} attestations <OCI layout folder>`,
    )
    process.exit(1)
  }
}
