// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { BuildError, buildCatalog, writeCatalog } from '../src/build.ts'
import { definition, keyPair, publish, setup, sources, tmp } from './helpers.ts'

const ids = (c: ReturnType<typeof setup>['catalog']) =>
  c
    .definitions()
    .map((d) => `${d.definition.id}@${d.definition.version}:${d.origin}`)
    .sort()

describe('the seed snapshot', () => {
  test('installs on first boot, verified', () => {
    const key = keyPair()
    const seed = tmp('seed')
    publish(seed, key, [definition('alpha')], ['2026.10.14'])
    const s = setup({ seedDir: seed, mainUrl: null, trusted: [key.trusted] })
    s.catalog.start()
    expect(ids(s.catalog)).toEqual(['alpha@1.0.0:main'])
    expect(s.catalog.version()).toBe('2026.10.14')
    expect(s.catalog.status().changes[0]?.notes).toEqual(['Changes in 2026.10.14.'])
  })

  test('a seed signed with an untrusted key is ignored', () => {
    const seed = tmp('seed')
    publish(seed, keyPair('rogue'), [definition('alpha')], ['2026.10.14'])
    const s = setup({ seedDir: seed, mainUrl: null, trusted: [keyPair().trusted] })
    s.catalog.start()
    expect(s.catalog.definitions()).toEqual([])
  })

  test('a restart works offline from what was cached', () => {
    const key = keyPair()
    const seed = tmp('seed')
    publish(seed, key, [definition('alpha')], ['2026.10.14'])
    const first = setup({ seedDir: seed, mainUrl: null, trusted: [key.trusted] })
    first.catalog.start()
    const again = setup({ db: first.db, seedDir: null, mainUrl: null, trusted: [key.trusted] })
    again.catalog.start()
    expect(ids(again.catalog)).toEqual(['alpha@1.0.0:main'])
  })

  test('an older seed doesn’t replace a newer installed catalog', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    publish(s.hostDir, key, [definition('alpha', { version: '2.0.0' })], ['2026.10.21'])
    s.catalog.start()
    await s.catalog.check()
    const seed = tmp('seed')
    publish(seed, key, [definition('alpha')], ['2026.10.14'])
    const again = setup({ db: s.db, seedDir: seed, mainUrl: null, trusted: [key.trusted] })
    again.catalog.start()
    expect(ids(again.catalog)).toEqual(['alpha@2.0.0:main'])
  })
})

describe('catalog independence', () => {
  test('a new version reaches a running server; a tampered one is refused', async () => {
    const key = keyPair()
    const seed = tmp('seed')
    publish(seed, key, [definition('alpha')], ['2026.10.14'])
    const s = setup({ seedDir: seed, trusted: [key.trusted] })
    s.catalog.start()
    const changes: string[][] = []
    s.catalog.onDefinitionsChanged((c) =>
      changes.push(c.map((x) => `${x.id}:${x.definition?.version ?? 'gone'}`)),
    )

    // N+1 published to the host: the definitions change without a restart
    publish(
      s.hostDir,
      key,
      [definition('alpha', { version: '1.1.0' }), definition('bravo')],
      ['2026.10.21', '2026.10.14'],
    )
    let status = await s.catalog.check()
    expect(status.version).toBe('2026.10.21')
    expect(status.lastCheck?.ok).toBe(true)
    expect(ids(s.catalog)).toEqual(['alpha@1.1.0:main', 'bravo@1.0.0:main'])
    expect(changes).toEqual([['alpha:1.1.0', 'bravo:1.0.0']])
    expect(s.seen.some((e) => e.topic === 'catalog.updated')).toBe(true)

    // N+2 with a changed byte in its bundle: N+1 stays
    const built = publish(
      s.hostDir,
      key,
      [definition('alpha', { version: '1.2.0' })],
      ['2026.10.28'],
    )
    const bundle = join(s.hostDir, 'stable', built[0]?.manifest.bundle.path as string)
    writeFileSync(bundle, readFileSync(bundle, 'utf8').replace('1.2.0', '6.6.6'))
    status = await s.catalog.check()
    expect(status.version).toBe('2026.10.21')
    expect(status.lastCheck).toMatchObject({
      ok: false,
      message: 'The catalog bundle doesn’t match its signed manifest. Keeping 2026.10.21.',
    })
    expect(ids(s.catalog)).toEqual(['alpha@1.1.0:main', 'bravo@1.0.0:main'])
    expect(s.catalog.issues().map((i) => i.id)).toContain('catalog-check')
  })

  test('a manifest signed by another key is refused', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    s.catalog.start()
    publish(s.hostDir, keyPair('rogue'), [definition('evil')], ['2026.10.21'])
    const status = await s.catalog.check()
    expect(status.lastCheck?.message).toContain('doesn’t trust (rogue)')
    expect(s.catalog.definitions()).toEqual([])
  })

  test('an older, validly signed catalog can’t be replayed', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    s.catalog.start()
    publish(s.hostDir, key, [definition('alpha', { version: '1.1.0' })], ['2026.10.21'])
    await s.catalog.check()
    publish(s.hostDir, key, [definition('alpha')], ['2026.10.14'])
    const status = await s.catalog.check()
    expect(status.version).toBe('2026.10.21')
    expect(ids(s.catalog)).toEqual(['alpha@1.1.0:main'])
  })

  test('an unchanged catalog costs one conditional request', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    s.catalog.start()
    publish(s.hostDir, key, [definition('alpha')], ['2026.10.21'])
    await s.catalog.check()
    s.fetch.requests.length = 0
    await s.catalog.check()
    expect(s.fetch.requests).toEqual(['/stable/manifest.json'])
  })

  test('the check is a job, safe to repeat', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    s.catalog.defineJobs()
    s.catalog.start()
    publish(s.hostDir, key, [definition('alpha')], ['2026.10.21'])
    s.jobs.enqueue('catalog.check', {})
    s.jobs.enqueue('catalog.check', {})
    for (let i = 0; i < 3; i++) {
      await s.jobs.tick()
      await s.jobs.idle()
    }
    expect(ids(s.catalog)).toEqual(['alpha@1.0.0:main'])
  })
})

describe('what the engine can run', () => {
  test('definitions for another engine major or a newer minor are skipped', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    s.catalog.start()
    publish(
      s.hostDir,
      key,
      [
        definition('now'),
        definition('later', { minEngineVersion: '1.9.0' }),
        definition('next', { minEngineVersion: '2.0.0' }),
      ],
      ['2026.10.21'],
    )
    await s.catalog.check()
    expect(ids(s.catalog)).toEqual(['now@1.0.0:main'])
  })
})

describe('Ask first', () => {
  test('a new version waits until it’s installed', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    s.catalog.start()
    s.catalog.updateSettings({ autoUpdate: false })
    publish(s.hostDir, key, [definition('alpha')], ['2026.10.21'])
    let status = await s.catalog.check()
    expect(status.available?.version).toBe('2026.10.21')
    expect(s.catalog.definitions()).toEqual([])
    status = s.catalog.installPending()
    expect(status.available).toBeNull()
    expect(status.version).toBe('2026.10.21')
    expect(ids(s.catalog)).toEqual(['alpha@1.0.0:main'])
  })
})

describe('highsea’s releases', () => {
  test('come with a signed manifest, even while its definitions wait', async () => {
    const key = keyPair()
    const s = setup({ trusted: [key.trusted] })
    s.catalog.start()
    s.catalog.updateSettings({ autoUpdate: false })
    expect(s.catalog.releases()).toEqual([])
    const root = sources([definition('alpha')], ['2026.10.21'])
    const release = {
      version: '0.2.0',
      channel: 'stable' as const,
      date: '2026-10-21',
      notes: ['Backups.'],
    }
    writeFileSync(join(root, 'releases.json'), JSON.stringify([release]))
    writeCatalog(buildCatalog({ root }, key), s.hostDir)
    await s.catalog.check()
    expect(s.catalog.releases()).toEqual([release])
  })

  test('a broken releases.json fails the build', () => {
    const root = sources([definition('alpha')], ['2026.10.21'])
    writeFileSync(join(root, 'releases.json'), JSON.stringify([{ version: 'soon' }]))
    expect(() => buildCatalog({ root }, keyPair())).toThrow(BuildError)
  })
})

describe('extra catalogs', () => {
  test('each with its own key; the main catalog wins a shared id', async () => {
    const main = keyPair()
    const extra = keyPair('friend')
    const s = setup({ trusted: [main.trusted] })
    s.catalog.start()
    publish(s.hostDir, main, [definition('alpha')], ['2026.10.21'])
    publish(
      join(s.hostDir, 'friend'),
      extra,
      [definition('alpha', { version: '9.0.0' }), definition('foxtrot')],
      ['2026.10.20'],
    )
    s.catalog.updateSettings({
      extras: [
        { url: 'https://catalog.test/friend', keyId: 'friend', publicKey: extra.trusted.publicKey },
      ],
    })
    await s.catalog.check()
    expect(ids(s.catalog)).toEqual([
      'alpha@1.0.0:main',
      'foxtrot@1.0.0:extra:https://catalog.test/friend',
    ])
    // removing the catalog removes its definitions
    s.catalog.updateSettings({ extras: [] })
    expect(ids(s.catalog)).toEqual(['alpha@1.0.0:main'])
  })

  test('addresses and keys are checked', () => {
    const s = setup({ trusted: [] })
    expect(() =>
      s.catalog.updateSettings({ extras: [{ url: 'ftp://x', keyId: 'k', publicKey: 'AA==' }] }),
    ).toThrow('https://')
    expect(() =>
      s.catalog.updateSettings({ extras: [{ url: 'https://x', keyId: 'K!', publicKey: 'AA==' }] }),
    ).toThrow('Key ids')
  })
})

describe('local definitions', () => {
  test('override the catalog; broken ones are skipped with a warning', async () => {
    const key = keyPair()
    const configDir = tmp('config')
    mkdirSync(join(configDir, 'definitions'))
    writeFileSync(
      join(configDir, 'definitions', 'alpha.yml'),
      stringify(definition('alpha', { version: '5.0.0' })),
    )
    writeFileSync(join(configDir, 'definitions', 'mine.yaml'), stringify(definition('mine')))
    writeFileSync(
      join(configDir, 'definitions', 'broken.yml'),
      stringify(definition('broken', { kind: 'python' })),
    )
    writeFileSync(join(configDir, 'definitions', 'not-yaml.yml'), ': : :\n  - [')
    writeFileSync(join(configDir, 'definitions', 'notes.txt'), 'ignored')
    const s = setup({ trusted: [key.trusted], configDir })
    publish(s.hostDir, key, [definition('alpha'), definition('bravo')], ['2026.10.21'])
    s.catalog.start()
    await s.catalog.check()
    expect(ids(s.catalog)).toEqual(['alpha@5.0.0:local', 'bravo@1.0.0:main', 'mine@1.0.0:local'])
    expect(s.catalog.status().brokenLocal.map((b) => b.file)).toEqual([
      'broken.yml',
      'not-yaml.yml',
    ])
    expect(s.catalog.issues().filter((i) => i.id.startsWith('catalog-local')).length).toBe(2)
  })

  test('YAML tags can’t construct anything', () => {
    const configDir = tmp('config')
    mkdirSync(join(configDir, 'definitions'))
    writeFileSync(join(configDir, 'definitions', 'tag.yml'), `!!js/function "function () {}"\n`)
    const s = setup({ trusted: [], configDir, mainUrl: null })
    s.catalog.start()
    expect(s.catalog.definitions()).toEqual([])
    expect(s.catalog.status().brokenLocal.map((b) => b.file)).toEqual(['tag.yml'])
  })
})
