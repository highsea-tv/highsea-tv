// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { compatible } from './license-audit.ts'

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
})
