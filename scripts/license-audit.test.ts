// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compatible, pods } from './license-audit.ts'

describe('license audit', () => {
  test('reads SPDX expressions: any side of OR, all of AND', () => {
    expect(compatible('MIT')).toBe(true)
    expect(compatible('(MIT OR GPL-2.0-only)')).toBe(true)
    expect(compatible('MIT AND GPL-2.0-only')).toBe(false)
    expect(compatible('GPL-2.0-only')).toBe(false)
    expect(compatible('GPL-3.0+')).toBe(true)
    expect(compatible('SSPL-1.0')).toBe(false)
    expect(compatible('UNKNOWN')).toBe(false)
  })

  test('reads crates’ expressions: brackets, AND before OR, WITH, and Cargo’s old slash', () => {
    expect(compatible('(MIT OR Apache-2.0) AND Unicode-3.0')).toBe(true)
    expect(compatible('(Apache-2.0 OR MIT) AND GPL-2.0-only')).toBe(false)
    expect(compatible('GPL-2.0-only AND MIT OR Apache-2.0')).toBe(true)
    expect(compatible('MIT AND (GPL-2.0-only OR SSPL-1.0)')).toBe(false)
    expect(compatible('Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT')).toBe(true)
    expect(compatible('GPL-2.0-only WITH Classpath-exception-2.0')).toBe(false)
    expect(compatible('MIT/Apache-2.0')).toBe(true)
    expect(compatible('Apache-2.0 / MIT')).toBe(true)
    expect(compatible('')).toBe(false)
  })

  test('reads each pod in Podfile.lock, with its spec’s licence, and nothing without a prebuild', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pods-'))
    expect(pods(dir)).toBeNull()
    writeFileSync(
      join(dir, 'Podfile.lock'),
      [
        'PODS:',
        '  - ExpoVideo (58.0.11):',
        '    - ExpoModulesCore',
        '  - React-Core (0.88.0):',
        '    - React-Core/Default (= 0.88.0)',
        '  - React-Core/Default (0.88.0):',
        '    - React-cxxreact',
        '  - "Unspecced (1.0.0)"',
        '',
        'DEPENDENCIES:',
        '  - ExpoVideo (from `../node_modules/expo-video/ios`)',
        '',
      ].join('\n'),
    )
    const specs = join(dir, 'Pods/Local Podspecs')
    mkdirSync(specs, { recursive: true })
    writeFileSync(join(specs, 'ExpoVideo.podspec.json'), JSON.stringify({ license: 'MIT' }))
    writeFileSync(
      join(specs, 'React-Core.podspec.json'),
      JSON.stringify({ license: { type: 'MIT', file: 'LICENSE' } }),
    )
    expect(pods(dir)).toEqual(
      new Map([
        ['ExpoVideo@58.0.11', 'MIT'],
        ['React-Core@0.88.0', 'MIT'],
        ['Unspecced@1.0.0', 'UNKNOWN'],
      ]),
    )
  })
})
