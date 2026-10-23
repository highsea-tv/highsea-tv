// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BuildError, buildCatalog, parseChanges } from '../src/build.ts'
import { compareCatalogVersions } from '../src/format.ts'
import { DEVELOPMENT_KEY, trustedKeys } from '../src/keys.ts'
import { publicKeyOf, SignatureError, signManifest, verifyEnvelope } from '../src/signing.ts'
import { definition, keyPair, sources } from './helpers.ts'

const ROOT = join(import.meta.dir, '../../..')

describe('signing', () => {
  const key = keyPair()

  test('a signed manifest verifies with its key', () => {
    const env = signManifest('{"a":1}', key.privateKey, key.keyId)
    expect(verifyEnvelope(env, [key.trusted])).toBe('{"a":1}')
  })

  test('a changed byte in the manifest is refused', () => {
    const env = signManifest('{"version":"2026.10.21"}', key.privateKey, key.keyId)
    const tampered = { ...env, manifest: env.manifest.replace('21', '22') }
    expect(() => verifyEnvelope(tampered, [key.trusted])).toThrow(SignatureError)
  })

  test('a changed byte in the signature is refused', () => {
    const env = signManifest('{}', key.privateKey, key.keyId)
    const sig = Buffer.from(env.signature, 'base64')
    sig[0] = (sig[0] as number) ^ 1
    expect(() =>
      verifyEnvelope({ ...env, signature: sig.toString('base64') }, [key.trusted]),
    ).toThrow('failed its signature check')
  })

  test('an unknown key is refused, even with a valid signature', () => {
    const other = keyPair('other')
    const env = signManifest('{}', other.privateKey, other.keyId)
    expect(() => verifyEnvelope(env, [key.trusted])).toThrow('doesn’t trust (other)')
    // the right id with the wrong key
    const forged = signManifest('{}', other.privateKey, key.keyId)
    expect(() => verifyEnvelope(forged, [key.trusted])).toThrow(SignatureError)
  })

  test('an unsigned or malformed envelope is refused', () => {
    expect(() => verifyEnvelope({ manifest: '{}' }, [key.trusted])).toThrow(SignatureError)
    expect(() => verifyEnvelope('nonsense', [key.trusted])).toThrow(SignatureError)
  })

  test('the development key is trusted only in development', () => {
    expect(trustedKeys(true)).toContainEqual(DEVELOPMENT_KEY)
    expect(trustedKeys(false)).not.toContainEqual(DEVELOPMENT_KEY)
    const pem = readFileSync(join(ROOT, 'catalog/keys/development.pem'), 'utf8')
    expect(publicKeyOf(pem)).toBe(DEVELOPMENT_KEY.publicKey)
  })
})

describe('catalog versions', () => {
  test('order by date, then the day’s release number', () => {
    expect(compareCatalogVersions('2026.10.21', '2026.10.14')).toBeGreaterThan(0)
    expect(compareCatalogVersions('2026.10.21', '2026.10.21.2')).toBeLessThan(0)
    expect(compareCatalogVersions('2026.10.21.2', '2026.10.21.10')).toBeLessThan(0)
    expect(compareCatalogVersions('2026.9.30', '2026.10.1')).toBeLessThan(0)
    expect(compareCatalogVersions('2026.10.21', '2026.10.21')).toBe(0)
  })
})

describe('the build', () => {
  test('changes are read newest first', () => {
    expect(parseChanges('# x\n\n## 2026.10.21\n\n- b\n- c\n\n## 2026.10.14\n\n- a\n')).toEqual([
      { version: '2026.10.21', date: '2026-10-21', notes: ['b', 'c'] },
      { version: '2026.10.14', date: '2026-10-14', notes: ['a'] },
    ])
    expect(() => parseChanges('## 2026.10.21\n')).toThrow('has no notes')
    expect(() => parseChanges('## next\n- a')).toThrow('isn’t a catalog version')
  })

  test('both channels are signed; beta adds and replaces definitions', () => {
    const key = keyPair()
    const built = buildCatalog(
      {
        root: sources(
          [definition('alpha'), definition('bravo')],
          ['2026.10.21'],
          [definition('bravo', { version: '1.1.0' }), definition('charlie')],
        ),
      },
      key,
    )
    const [stable, beta] = built
    expect(stable?.definitions.map((d) => `${d.id}@${d.version}`)).toEqual([
      'alpha@1.0.0',
      'bravo@1.0.0',
    ])
    expect(beta?.definitions.map((d) => `${d.id}@${d.version}`)).toEqual([
      'alpha@1.0.0',
      'bravo@1.1.0',
      'charlie@1.0.0',
    ])
    for (const b of built)
      expect(() => verifyEnvelope(JSON.parse(b.envelope), [key.trusted])).not.toThrow()
  })

  test('the build is deterministic', () => {
    const key = keyPair()
    const src = sources([definition('alpha')], ['2026.10.21'])
    expect(buildCatalog({ root: src }, key)[0]?.envelope).toBe(
      buildCatalog({ root: src }, key)[0]?.envelope as string,
    )
  })

  test('every broken definition is listed, and nothing is built', () => {
    const src = sources(
      [definition('alpha', { license: undefined }), definition('bravo', { kind: 'python' })],
      ['2026.10.21'],
    )
    try {
      buildCatalog({ root: src }, keyPair())
      throw new Error('built')
    } catch (e) {
      expect(e).toBeInstanceOf(BuildError)
      expect((e as BuildError).problems.map((p) => p.file)).toEqual(['alpha.yml', 'bravo.yml'])
    }
  })

  test('the repo’s catalog builds, and the seed snapshot is up to date', () => {
    const key = {
      privateKey: readFileSync(join(ROOT, 'catalog/keys/development.pem'), 'utf8'),
      keyId: 'development',
    }
    const built = buildCatalog({ root: join(ROOT, 'catalog/indexers') }, key)
    for (const b of built) {
      const dir = join(import.meta.dir, '../seed', b.channel)
      expect(
        readFileSync(join(dir, 'manifest.json'), 'utf8'),
        'run bun run catalog:build --seed',
      ).toBe(b.envelope)
      expect(readFileSync(join(dir, b.manifest.bundle.path), 'utf8')).toBe(b.bundle)
    }
  })
})
