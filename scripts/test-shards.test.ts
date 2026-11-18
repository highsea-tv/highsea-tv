// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { bunShard, coverage, expected, jestShard } from './test-shards.ts'

describe('the files each runner should run', () => {
  test('Bun’s documented names, outside node_modules; Jest’s testMatch', () => {
    const want = expected([
      'packages/core/test/core.test.ts',
      'scripts/clean.test.ts',
      'packages/x/a_spec.tsx',
      'packages/x/b.spec.mts',
      'packages/x/c_test.cjs',
      'packages/x/test.ts',
      'packages/x/helpers.ts',
      'node_modules/foo/a.test.ts',
      'apps/client/node_modules/bar/b.test.ts',
      'apps/client/test/home.jest.tsx',
      'apps/client/test/tv/detail.jest.tsx',
      'apps/client/src/home.jest.tsx',
    ])
    expect(want.bun).toEqual([
      'packages/core/test/core.test.ts',
      'packages/x/a_spec.tsx',
      'packages/x/b.spec.mts',
      'packages/x/c_test.cjs',
      'scripts/clean.test.ts',
    ])
    expect(want.jest).toEqual([
      'apps/client/test/home.jest.tsx',
      'apps/client/test/tv/detail.jest.tsx',
    ])
  })
})

describe('what the shards ran', () => {
  const want = ['a.test.ts', 'b.test.ts', 'c.test.ts']

  test('every file once passes', () => {
    expect(coverage(want, [['a.test.ts'], ['c.test.ts', 'b.test.ts']])).toEqual({
      missing: [],
      twice: [],
      unexpected: [],
    })
  })

  test('a file no shard ran is missing', () => {
    expect(coverage(want, [['a.test.ts'], ['c.test.ts']]).missing).toEqual(['b.test.ts'])
  })

  test('a lost shard leaves its files missing', () => {
    expect(coverage(want, [['a.test.ts']]).missing).toEqual(['b.test.ts', 'c.test.ts'])
  })

  test('a file two shards ran is reported', () => {
    const c = coverage(want, [
      ['a.test.ts', 'b.test.ts'],
      ['b.test.ts', 'c.test.ts'],
    ])
    expect(c.twice).toEqual(['b.test.ts'])
    expect(c.missing).toEqual([])
  })

  test('a file git doesn’t track is reported apart', () => {
    expect(coverage(want, [[...want, 'gen.test.ts']]).unexpected).toEqual(['gen.test.ts'])
  })

  test('Bun’s timings file and Jest’s JSON give paths from the root', () => {
    expect(bunShard('{"version":1,"files":{"a.test.ts":12,"b/c.test.ts":3}}')).toEqual([
      'a.test.ts',
      'b/c.test.ts',
    ])
    expect(bunShard('{"version":1}')).toEqual([])
    expect(
      jestShard('{"testResults":[{"name":"/w/repo/apps/client/test/home.jest.tsx"}]}', '/w/repo'),
    ).toEqual(['apps/client/test/home.jest.tsx'])
  })
})
