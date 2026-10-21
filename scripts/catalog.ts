// SPDX-License-Identifier: AGPL-3.0-only
// The catalog pipeline (ADR 0034), run locally and by CI on catalog/**:
//
//   bun scripts/catalog.ts build [--seed]   validate, bundle and sign both channels into
//                                           dist/catalog/ (the indexers) and
//                                           dist/catalog/vpn-providers/ (ADR 0042); --seed also
//                                           refreshes the server's seed
//   bun scripts/catalog.ts keygen <id>      print a new ed25519 key pair for a release key
//
// The build signs with the key in HIGHSEA_CATALOG_KEY (a PEM) and HIGHSEA_CATALOG_KEY_ID, or the
// development key when they're unset. Publishing isn't here: it stays off until the owner says so
// (decision 5), and the workflow's publish step is disabled.
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { generateSigningKey } from '@highsea/catalog'
import {
  BuildError,
  buildCatalog,
  buildVpnProviderCatalog,
  writeCatalog,
} from '@highsea/catalog/build'

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
  } else {
    console.error('Usage: bun scripts/catalog.ts build [--seed] | keygen <id>')
    process.exit(1)
  }
}
