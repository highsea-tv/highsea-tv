// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { offences } from './bundles.ts'

describe('bundle check', () => {
  test('finds React Native or the native renderer in the web build', () => {
    expect(offences('web', 'import "react-native/Libraries/Pressability"')).toEqual([
      'react-native',
    ])
    expect(offences('web', '//# ../../packages/ui/src/native/button.tsx')).toEqual([
      'the native renderer',
    ])
    expect(offences('web', 'var a=1')).toEqual([])
  })

  test('finds the web renderer in the phone’s bundle', () => {
    expect(offences('phone', '"../../packages/ui/src/web/button.tsx"')).toEqual([
      'the web renderer',
    ])
    expect(offences('phone', 'twMerge(a,b)')).toEqual(['tailwind-merge'])
    expect(offences('phone', 'var a=1')).toEqual([])
  })

  test('holds the TV’s bundle to the phone’s rule', () => {
    expect(offences('tv', 'ReactDOMSharedInternals')).toEqual(['react-dom'])
    expect(offences('tv', 'var a=1')).toEqual([])
  })
})
