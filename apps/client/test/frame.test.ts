// SPDX-License-Identifier: AGPL-3.0-only
// The root layout's seam for a frame's `?ff=` (src/frame.ts): an input or a whole form factor by
// name, and otherwise nothing, so the device decides.
import { describe, expect, test } from 'bun:test'
import { FORM_FACTORS } from '@highsea-tv/tokens'
import { settingOf } from '../src/frame.ts'

describe('a frame’s form factor', () => {
  test('without ?ff=, nothing is passed and the device decides', () => {
    expect(settingOf(undefined)).toBeUndefined()
  })

  test('an input names the rule the frame draws at', () => {
    expect(settingOf('touch')).toBe('touch')
    expect(settingOf('pointer')).toBe('pointer')
    expect(settingOf('tv')).toBe('tv')
  })

  test('a whole form factor is passed whole', () => {
    expect(settingOf('compact-touch')).toEqual(FORM_FACTORS['compact-touch'])
  })

  test('a name that isn’t one passes nothing, rather than forcing a rule', () => {
    expect(settingOf('mobile')).toBeUndefined()
    expect(settingOf('')).toBeUndefined()
  })
})
