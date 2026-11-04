// SPDX-License-Identifier: AGPL-3.0-only
// Profiles' rules and words (@highsea-tv/client/profiles): the server checks the PIN, so what's
// here reads its refusals and decides when to ask.
import { describe, expect, test } from 'bun:test'
import { ApiError } from '@highsea-tv/sdk'
import {
  canAdd,
  canDelete,
  createProfilesText,
  needsPin,
  nextTone,
  pinDigits,
  profileRefusal,
} from '../src/profiles/index.ts'

const theo = { id: 'p-theo', name: 'Theo', hasPin: true, main: false }
const text = createProfilesText('en')

describe('profiles', () => {
  test('a PIN is asked for unless the profile is watching now or has none', () => {
    expect(needsPin(theo, 'p-ines')).toBe(true)
    expect(needsPin(theo, 'p-theo')).toBe(false)
    expect(needsPin({ ...theo, hasPin: false }, 'p-ines')).toBe(false)
    expect(pinDigits('25a8 0 9')).toBe('2580')
  })

  test('the server’s refusals: a wrong PIN, and the rest after the fifth', () => {
    const wrong = new ApiError('forbidden', 'x', 403, { field: 'pin', reason: 'wrong-pin' })
    const rest = new ApiError('rate-limited', 'x', 429, { reason: 'rate-limited', retryAfter: 42 })
    expect(profileRefusal(wrong)).toEqual({ kind: 'wrong-pin' })
    expect(profileRefusal(rest)).toEqual({ kind: 'resting', retryAfter: 42 })
    expect(profileRefusal(new ApiError('not-found', 'x', 404))).toBeNull()
    expect(profileRefusal(new Error('x'))).toBeNull()
    expect(text.refused('Theo', { kind: 'wrong-pin' })).toBe('That isn’t Theo’s PIN. Try again.')
    expect(text.refused('Theo', { kind: 'resting', retryAfter: 60 })).toBe(
      'Too many tries. Try again in a minute.',
    )
  })

  test('adding, deleting, the next colour and the labels', () => {
    expect(canAdd(5, 6)).toBe(true)
    expect(canAdd(6, 6)).toBe(false)
    expect(canDelete({ main: true })).toBe(false)
    expect(nextTone(['accent', 'info'])).toBe('success')
    expect(text.label(theo)).toBe('Theo, has a PIN')
    expect(text.label({ name: 'Ines', hasPin: false }, true)).toBe('Ines, watching now')
    expect(text.enterPin('Theo')).toBe('Enter Theo’s PIN')
  })
})
