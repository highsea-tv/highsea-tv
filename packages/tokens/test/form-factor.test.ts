// SPDX-License-Identifier: AGPL-3.0-only
// The form-factor rule (src/form-factor.ts, controls.md › The form factor): the width class on each
// side of 768 for a pointer and for touch, the TV whatever its width, the names the prototypes'
// frames use, and the layouts the platform guides state, by their tokens.
import { describe, expect, test } from 'bun:test'
import {
  FORM_FACTORS,
  type FormFactorName,
  formFactorName,
  formFactorNamed,
  formFactorOf,
  layoutOf,
  mobile,
  REGULAR_WIDTH,
  tv,
  web,
} from '../src/index.ts'

describe('the width class', () => {
  test('is compact below 768 and regular from it, with a pointer or touch', () => {
    expect(REGULAR_WIDTH).toBe(768)
    for (const input of ['pointer', 'touch'] as const) {
      expect(formFactorOf(0, input)).toEqual({ input, widthClass: 'compact' })
      expect(formFactorOf(390, input)).toEqual({ input, widthClass: 'compact' })
      expect(formFactorOf(767, input)).toEqual({ input, widthClass: 'compact' })
      expect(formFactorOf(768, input)).toEqual({ input, widthClass: 'regular' })
      expect(formFactorOf(1920, input)).toEqual({ input, widthClass: 'regular' })
    }
  })

  test('is the TV’s for a TV, whatever its width', () => {
    for (const width of [0, 767, 768, 1280, 1920, 3840])
      expect(formFactorOf(width, 'tv')).toEqual({ input: 'tv', widthClass: 'tv' })
  })

  test('gives one of the named form factors, so the same one is the same object', () => {
    expect(formFactorOf(390, 'touch')).toBe(FORM_FACTORS['compact-touch'])
    expect(formFactorOf(1440, 'pointer')).toBe(FORM_FACTORS['regular-pointer'])
    expect(formFactorOf(1920, 'tv')).toBe(FORM_FACTORS.tv)
  })
})

describe('the names', () => {
  test('name every form factor, and give it back', () => {
    for (const [name, formFactor] of Object.entries(FORM_FACTORS)) {
      expect(formFactorName(formFactor)).toBe(name as FormFactorName)
      expect(formFactorNamed(name)).toBe(formFactor)
    }
    expect(Object.keys(FORM_FACTORS)).toHaveLength(5)
  })

  test('give nothing for a name that isn’t one', () => {
    expect(formFactorNamed('phone')).toBeUndefined()
    expect(formFactorNamed('touch-compact')).toBeUndefined()
    expect(formFactorNamed('toString')).toBeUndefined()
  })
})

describe('the layouts', () => {
  test('are the phone guide’s, by the tokens', () => {
    expect(layoutOf(FORM_FACTORS['compact-touch'])).toEqual({
      unit: 'px',
      navigation: 'tab-bar',
      gutter: mobile.gutter,
      itemGap: mobile.posterGap,
      rowGap: mobile.rowGap,
      itemShare: 0.3,
    })
  })

  test('are the web’s and the desktop app’s, by the tokens', () => {
    expect(layoutOf(FORM_FACTORS['regular-pointer'])).toEqual({
      unit: 'px',
      navigation: 'top-bar',
      maxWidth: web.maxWidth,
    })
  })

  test('are the TV’s, in screen units, by the tokens', () => {
    expect(layoutOf(FORM_FACTORS.tv)).toEqual({
      unit: 'u',
      navigation: 'head',
      gutter: tv.safe.x,
      itemGap: tv.poster.gap,
      itemWidth: tv.poster.width,
    })
  })

  test('leave out the form factors no guide describes yet', () => {
    expect(layoutOf(FORM_FACTORS['compact-pointer'])).toBeUndefined()
    expect(layoutOf(FORM_FACTORS['regular-touch'])).toBeUndefined()
  })
})
