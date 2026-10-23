// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's `vpn-providers` kind: the repo's entries build, the seed is up to date and verifies,
// updates come only signed with a release key, and a kind can't stand in for another.
import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeClock, silentLogger } from '@highsea-tv/core'
import { stringify } from 'yaml'
import { buildCatalog, buildVpnProviderCatalog, writeCatalog } from '../src/build.ts'
import { SEED_DIR } from '../src/index.ts'
import { createVpnProviderCatalog } from '../src/providers.ts'
import { createStaticHost } from '../src/static-host.ts'
import { keyPair, tmp } from './helpers.ts'

const ROOT = join(import.meta.dir, '../../..')
const DEV_KEY = () => ({
  privateKey: readFileSync(join(ROOT, 'catalog/keys/development.pem'), 'utf8'),
  keyId: 'development',
})

function provider(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    version: '1.0.0',
    minEngineVersion: '1.0.0',
    name: id,
    connect: 'config',
    steps: ['Download a WireGuard configuration.'],
    portForwarding: { method: 'none' },
    ipv6: false,
    sources: [`https://${id}.test/docs`],
    ...patch,
  }
}

function providerSources(defs: object[], version: string) {
  const root = tmp('providers-src')
  for (const dir of ['definitions', 'beta']) mkdirSync(join(root, dir), { recursive: true })
  for (const d of defs)
    writeFileSync(join(root, 'definitions', `${(d as { id: string }).id}.yaml`), stringify(d))
  writeFileSync(join(root, 'CHANGES.md'), `# Changes\n\n## ${version}\n\n- Providers.\n`)
  return root
}

function reader(options: {
  seedDir?: string | null
  mainUrl?: string | null
  trusted?: ReturnType<typeof keyPair>['trusted'][]
  hostDir?: string
  autoUpdate?: boolean
  configDir?: string
}) {
  return createVpnProviderCatalog({
    logger: silentLogger,
    clock: createFakeClock(),
    fetch: createStaticHost(options.hostDir ?? tmp('host')),
    configDir: options.configDir ?? tmp('config'),
    trustedKeys: options.trusted ?? [],
    seedDir: options.seedDir === undefined ? join(SEED_DIR, 'vpn-providers') : options.seedDir,
    mainUrl: options.mainUrl ?? null,
    settings: () => ({ channel: 'stable', autoUpdate: options.autoUpdate ?? true }),
  })
}

describe('The VPN providers', () => {
  test('the repo’s entries build, and the seed snapshot is up to date', () => {
    const built = buildVpnProviderCatalog({ root: join(ROOT, 'catalog/vpn-providers') }, DEV_KEY())
    for (const b of built) {
      const dir = join(SEED_DIR, 'vpn-providers', b.channel)
      expect(
        readFileSync(join(dir, 'manifest.json'), 'utf8'),
        'run bun run catalog:build --seed',
      ).toBe(b.envelope)
      expect(readFileSync(join(dir, b.manifest.bundle.path), 'utf8')).toBe(b.bundle)
      expect(b.manifest.kind).toBe('vpn-providers')
    }
  })

  test('the seed verifies with the development key, even where it isn’t trusted', () => {
    const r = reader({})
    r.start()
    expect(r.providers().map((p) => p.id)).toEqual([
      'airvpn',
      'ivpn',
      'mullvad',
      'other',
      'pia',
      'proton',
      'surfshark',
      'windscribe',
    ])
    const byId = Object.fromEntries(r.providers().map((p) => [p.id, p]))
    expect(byId.proton?.portForwarding).toEqual({
      method: 'natpmp',
      gateway: '10.2.0.1',
      lifetimeSeconds: 60,
      renewSeconds: 45,
    })
    expect(byId.pia).toMatchObject({ connect: 'pia', portForwarding: { method: 'pia' } })
    expect(byId.mullvad?.portForwarding.method).toBe('none')
    expect(byId.airvpn?.portForwarding.method).toBe('static')
    for (const p of r.providers()) expect(p.sources.length).toBeGreaterThan(0)
  })

  test('an update installs only when signed with a release key, and is cached', async () => {
    const release = keyPair('release')
    const hostDir = tmp('host')
    const built = buildVpnProviderCatalog(
      { root: providerSources([provider('newvpn')], '2027.1.1') },
      { privateKey: release.privateKey, keyId: 'release' },
    )
    writeCatalog(built, join(hostDir, 'vpn-providers'))
    const configDir = tmp('config')
    const r = reader({
      hostDir,
      configDir,
      mainUrl: 'https://catalog.test',
      trusted: [release.trusted],
    })
    r.start()
    expect(r.version()).toBe('2026.10.21')
    expect(await r.check()).toBe('installed')
    expect(r.providers().map((p) => p.id)).toEqual(['newvpn'])
    expect(await r.check()).toBe('unchanged')

    // read again from the cache, as after a restart
    const again = reader({ configDir, trusted: [release.trusted] })
    again.start()
    expect(again.version()).toBe('2027.1.1')

    // signed with a key the server doesn't trust: refused, and what's there stays
    const stranger = reader({ hostDir, mainUrl: 'https://catalog.test' })
    stranger.start()
    await expect(stranger.check()).rejects.toThrow()
    expect(stranger.version()).toBe('2026.10.21')
  })

  test('“Ask first” holds an update back', async () => {
    const release = keyPair('release')
    const hostDir = tmp('host')
    writeCatalog(
      buildVpnProviderCatalog(
        { root: providerSources([provider('newvpn')], '2027.1.1') },
        { privateKey: release.privateKey, keyId: 'release' },
      ),
      join(hostDir, 'vpn-providers'),
    )
    const r = reader({
      hostDir,
      mainUrl: 'https://catalog.test',
      trusted: [release.trusted],
      autoUpdate: false,
    })
    r.start()
    expect(await r.check()).toBe('waiting')
    expect(r.version()).toBe('2026.10.21')
  })

  test('an indexer catalog can’t pass for VPN providers', () => {
    const seedDir = tmp('seed')
    const key = DEV_KEY()
    writeCatalog(buildCatalog({ root: join(ROOT, 'catalog/indexers') }, key), seedDir)
    const r = reader({ seedDir })
    r.start()
    expect(r.providers()).toEqual([])
    expect(r.version()).toBeNull()
  })

  test('a broken entry fails the build with its file named', () => {
    const root = providerSources(
      [provider('broken', { portForwarding: { method: 'pia' } }), provider('fine')],
      '2027.1.1',
    )
    expect(() => buildVpnProviderCatalog({ root }, DEV_KEY())).toThrow(
      'Some definitions don’t validate.',
    )
  })
})
