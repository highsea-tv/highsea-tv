// SPDX-License-Identifier: AGPL-3.0-only
// The catalog pipeline (ADR 0034), run locally and by CI on catalog/**:
//
//   bun scripts/catalog.ts build [--seed]   validate, bundle and sign both channels into
//                                           dist/catalog/ (the indexers) and
//                                           dist/catalog/vpn-providers/ (ADR 0042); --seed also
//                                           refreshes the server's seed
//   bun scripts/catalog.ts keygen <id>      print a new ed25519 key pair for a release key
//   bun scripts/catalog.ts publishable <url>
//                                           whether a catalog-only publish may go to the catalog
//                                           at <url> (catalog-release.yml, ADR 0069)
//
// The build signs with the key in HIGHSEA_CATALOG_KEY (a PEM) and HIGHSEA_CATALOG_KEY_ID, or the
// development key when they're unset. Publishing is release.yml's and catalog-release.yml's, from
// the shared .github/actions/catalog.
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHANNELS,
  compareCatalogVersions,
  envelopeSchema,
  generateSigningKey,
  type HighseaRelease,
  manifestSchema,
} from '@highsea-tv/catalog'
import {
  BuildError,
  buildCatalog,
  buildVpnProviderCatalog,
  parseChanges,
  writeCatalog,
} from '@highsea-tv/catalog/build'

const root = join(import.meta.dir, '..')
export const SEED_DIR = join(root, 'packages/catalog/seed')

function signingKey() {
  const pem = process.env.HIGHSEA_CATALOG_KEY
  if (pem) {
    const keyId = process.env.HIGHSEA_CATALOG_KEY_ID
    if (!keyId) throw new Error('Set HIGHSEA_CATALOG_KEY_ID beside HIGHSEA_CATALOG_KEY.')
    return { privateKey: pem, keyId }
  }
  return {
    privateKey: readFileSync(join(root, 'catalog/keys/development.pem'), 'utf8'),
    keyId: 'development',
  }
}

/**
 * Why a catalog-only publish can't go out, or none. Servers fetch a bundle only when its version is
 * newer than theirs (ADR 0050), so the catalog's CHANGES.md needs a heading newer than both
 * channels' published versions; and a catalog-only publish never changes what servers are told of
 * highsea's releases, so releases.json must be what's published (the plan's part A).
 */
export function publishProblems(
  local: { version: string; releases: HighseaRelease[] },
  live: Record<string, { version: string; releases: HighseaRelease[] } | null>,
): string[] {
  const problems: string[] = []
  for (const [channel, m] of Object.entries(live)) {
    if (!m) continue
    if (compareCatalogVersions(local.version, m.version) <= 0)
      problems.push(
        `${channel} is already at ${m.version}; add a newer heading to catalog/indexers/CHANGES.md, like ${local.version.split('.').slice(0, 3).join('.')}.2 or today’s date, with what changed.`,
      )
  }
  const published = live.stable?.releases ?? live.beta?.releases
  if (published && JSON.stringify(published) !== JSON.stringify(local.releases))
    problems.push(
      'catalog/indexers/releases.json isn’t what’s published: a catalog-only publish would change the releases servers know of. Publish with a release instead.',
    )
  return problems
}

/** A channel's published manifest, unverified (servers verify it), or null when there's none. */
async function liveManifest(url: string, channel: string) {
  const response = await fetch(`${url}/${channel}/manifest.json`, {
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${url}/${channel}/manifest.json answered ${response.status}.`)
  const envelope = envelopeSchema.parse(await response.json())
  const m = manifestSchema.parse(JSON.parse(envelope.manifest))
  return { version: m.version, releases: m.releases ?? [] }
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'build') {
    const key = signingKey()
    try {
      const built = buildCatalog({ root: join(root, 'catalog/indexers') }, key)
      const providers = buildVpnProviderCatalog({ root: join(root, 'catalog/vpn-providers') }, key)
      const out = join(root, 'dist/catalog')
      rmSync(out, { recursive: true, force: true })
      writeCatalog(built, out)
      writeCatalog(providers, join(out, 'vpn-providers'))
      for (const b of built)
        console.log(
          `${b.channel}: ${b.manifest.version}, ${b.definitions.length} definitions, signed with ${key.keyId}`,
        )
      for (const b of providers)
        console.log(
          `vpn-providers ${b.channel}: ${b.manifest.version}, ${b.definitions.length} providers, signed with ${key.keyId}`,
        )
      if (args.includes('--seed')) {
        if (key.keyId !== 'development' && !process.env.HIGHSEA_CATALOG_SEED_RELEASE)
          throw new Error('The seed is signed with the development key until publishing begins.')
        rmSync(SEED_DIR, { recursive: true, force: true })
        writeCatalog(built, SEED_DIR)
        writeCatalog(providers, join(SEED_DIR, 'vpn-providers'))
        console.log(`seed: ${SEED_DIR}`)
      }
    } catch (e) {
      console.error(e instanceof BuildError ? e.message : e)
      process.exit(1)
    }
  } else if (command === 'keygen') {
    const id = args[0]
    if (!id || !/^[a-z0-9-]{1,40}$/.test(id)) {
      console.error('Usage: bun scripts/catalog.ts keygen <id>, with an id like release-2027.')
      process.exit(1)
    }
    const k = generateSigningKey()
    console.log(`Key id: ${id}\n\nPublic key (for packages/catalog/src/keys.ts):\n${k.publicKey}\n`)
    console.log('Private key (a GitHub Actions secret and offline storage, never the repo):')
    console.log(k.privateKey)
  } else if (command === 'publishable') {
    const url = (args[0] ?? '').replace(/\/$/, '')
    if (!/^https:\/\//.test(url)) {
      console.error('Usage: bun scripts/catalog.ts publishable https://catalog.highsea.tv')
      process.exit(1)
    }
    const dir = join(root, 'catalog/indexers')
    const version = parseChanges(readFileSync(join(dir, 'CHANGES.md'), 'utf8'))[0]
      ?.version as string
    const releases = JSON.parse(
      readFileSync(join(dir, 'releases.json'), 'utf8'),
    ) as HighseaRelease[]
    const live = Object.fromEntries(
      await Promise.all(CHANNELS.map(async (c) => [c, await liveManifest(url, c)] as const)),
    )
    const problems = publishProblems({ version, releases }, live)
    for (const p of problems) console.error(`::error::${p}`)
    if (problems.length) process.exit(1)
    console.log(
      `${version} is newer than what ${url} serves (${CHANNELS.map((c) => `${c} ${live[c]?.version ?? 'none'}`).join(', ')}), and releases.json is what's published.`,
    )
  } else {
    console.error('Usage: bun scripts/catalog.ts build [--seed] | keygen <id> | publishable <url>')
    process.exit(1)
  }
}
