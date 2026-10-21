// SPDX-License-Identifier: AGPL-3.0-only
// The catalog pipeline's build (ADR 0034): validate every definition, bundle them with their logos,
// write a manifest naming the bundle's hash, and sign it. Deterministic: the same sources and key
// give the same bytes (ed25519 signatures are deterministic, RFC 8032 § 5.1.6), so a test can tell
// when the committed seed snapshot is stale. Publishing is a separate step that stays off until the
// owner says so (decision 5).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { compareVersions, type Definition } from '@highsea/schemas/indexers'
import {
  compareProviderVersions,
  formatProviderIssues,
  type VpnProviderDefinition,
  validateVpnProvider,
} from '@highsea/schemas/vpn'
import {
  type Bundle,
  CATALOG_FORMAT,
  type CatalogChange,
  type CatalogKind,
  CHANNELS,
  type Channel,
  isCatalogVersion,
  type Manifest,
} from './format.ts'
import { type BrokenFile, type LoadedFile, loadDefinitionFiles, loadEntryFiles } from './load.ts'
import { sha256, signManifest } from './signing.ts'

/** How many versions' notes a manifest carries. */
const CHANGES_KEPT = 10

export type CatalogSources = {
  /** `definitions/` ships on both channels, `beta/` on beta only. */
  root: string
}

export class BuildError extends Error {
  override name = 'BuildError'
  readonly problems: BrokenFile[]
  constructor(message: string, problems: BrokenFile[] = []) {
    super(
      problems.length
        ? `${message}\n${problems.map((p) => `${p.file}: ${p.message}`).join('\n')}`
        : message,
    )
    this.problems = problems
  }
}

/** `## 2026.10.21` headings with `- note` bullets, newest first. */
export function parseChanges(text: string): CatalogChange[] {
  const out: CatalogChange[] = []
  for (const line of text.split('\n')) {
    const heading = /^##\s+(\S+)\s*$/.exec(line)
    if (heading) {
      const version = heading[1] as string
      if (!isCatalogVersion(version))
        throw new BuildError(`CHANGES.md: "${version}" isn’t a catalog version.`)
      const [y, m, d] = version.split('.')
      out.push({ version, date: `${y}-${m?.padStart(2, '0')}-${d?.padStart(2, '0')}`, notes: [] })
      continue
    }
    const note = /^[-*]\s+(.+)$/.exec(line.trim())
    if (note && out.length) out[out.length - 1]?.notes.push(note[1] as string)
  }
  if (!out.length) throw new BuildError('CHANGES.md has no versions.')
  for (const c of out)
    if (!c.notes.length) throw new BuildError(`CHANGES.md: ${c.version} has no notes.`)
  return out
}

function logosOf(dir: string): Record<string, string> {
  const types: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png' }
  const out: Record<string, string> = {}
  let files: string[] = []
  try {
    files = readdirSync(dir).sort()
  } catch {
    return out
  }
  for (const f of files) {
    const type = types[extname(f)]
    if (type) out[f] = `data:${type};base64,${readFileSync(join(dir, f)).toString('base64')}`
  }
  return out
}

export type BuiltChannel<T = Definition> = {
  channel: Channel
  manifest: Manifest
  /** The envelope's JSON text, as published. */
  envelope: string
  bundle: string
  definitions: T[]
}

/** What the build needs to know about a kind's entries. */
type KindRules<T extends { id: string; minEngineVersion: string; logo?: string }> = {
  kind: CatalogKind
  load(dir: string): { loaded: LoadedFile<T>[]; broken: BrokenFile[] }
  compare(a: string, b: string): number
}

function buildKind<T extends { id: string; minEngineVersion: string; logo?: string }>(
  rules: KindRules<T>,
  sources: CatalogSources,
  key: { privateKey: string; keyId: string },
): BuiltChannel<T>[] {
  const stable = rules.load(join(sources.root, 'definitions'))
  const beta = rules.load(join(sources.root, 'beta'))
  const broken = [...stable.broken, ...beta.broken]
  if (broken.length) throw new BuildError('Some definitions don’t validate.', broken)
  const changes = parseChanges(readFileSync(join(sources.root, 'CHANGES.md'), 'utf8'))
  const version = (changes[0] as CatalogChange).version
  const logos = logosOf(join(sources.root, 'logos'))

  return CHANNELS.map((channel) => {
    const byId = new Map(stable.loaded.map((f) => [f.definition.id, f]))
    // a beta definition replaces the stable one with its id
    if (channel === 'beta') for (const f of beta.loaded) byId.set(f.definition.id, f)
    const chosen = [...byId.values()].sort((a, b) => a.definition.id.localeCompare(b.definition.id))
    for (const f of chosen) {
      const logo = f.definition.logo
      if (logo && !logos[logo]) throw new BuildError(`${f.file}: logo ${logo} isn’t in logos/.`)
    }
    const usedLogos = Object.fromEntries(
      Object.entries(logos).filter(([name]) => chosen.some((f) => f.definition.logo === name)),
    )
    const bundleData: Bundle = {
      format: CATALOG_FORMAT,
      kind: rules.kind,
      version,
      definitions: chosen.map((f) => f.raw),
      logos: usedLogos,
    }
    const bundle = JSON.stringify(bundleData)
    const minEngineVersion = chosen
      .map((f) => f.definition.minEngineVersion)
      .reduce((a, b) => (rules.compare(a, b) >= 0 ? a : b), '1.0.0')
    const manifest: Manifest = {
      format: CATALOG_FORMAT,
      kind: rules.kind,
      channel,
      version,
      minEngineVersion,
      bundle: {
        path: `${rules.kind}-${version}.json`,
        sha256: sha256(bundle),
        size: Buffer.byteLength(bundle),
      },
      changes: changes.slice(0, CHANGES_KEPT),
    }
    const envelope = `${JSON.stringify(signManifest(JSON.stringify(manifest, null, 2), key.privateKey, key.keyId), null, 2)}\n`
    return { channel, manifest, envelope, bundle, definitions: chosen.map((f) => f.definition) }
  })
}

/** Builds and signs the indexers' channels in memory. Throws `BuildError` listing every broken file. */
export function buildCatalog(
  sources: CatalogSources,
  key: { privateKey: string; keyId: string },
): BuiltChannel[] {
  return buildKind(
    { kind: 'indexers', load: loadDefinitionFiles, compare: compareVersions },
    sources,
    key,
  )
}

/** Checks a VPN provider entry with `@highsea/schemas/vpn`, for the loader. */
export function validateProviderEntry(raw: unknown) {
  const result = validateVpnProvider(raw)
  return result.ok
    ? { ok: true as const, value: result.definition }
    : { ok: false as const, message: formatProviderIssues(result.errors) }
}

/** The same for the VPN providers (`catalog/vpn-providers`, ADR 0042). */
export function buildVpnProviderCatalog(
  sources: CatalogSources,
  key: { privateKey: string; keyId: string },
): BuiltChannel<VpnProviderDefinition>[] {
  return buildKind(
    {
      kind: 'vpn-providers',
      load: (dir) => loadEntryFiles(dir, validateProviderEntry),
      compare: compareProviderVersions,
    },
    sources,
    key,
  )
}

/** Writes `{out}/{channel}/manifest.json` and the bundle beside it. */
export function writeCatalog(built: readonly BuiltChannel<unknown>[], out: string): void {
  for (const b of built) {
    const dir = join(out, b.channel)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'manifest.json'), b.envelope)
    writeFileSync(join(dir, b.manifest.bundle.path), b.bundle)
  }
}
