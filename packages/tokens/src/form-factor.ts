// SPDX-License-Identifier: AGPL-3.0-only
// The form-factor rule (controls.md › The form factor; docs/plans/one-client-platform.md › One copy
// of each screen, laid out by rule): the input a screen is used with, the control spec's pointer,
// touch or TV, joined with a width class. It's defined here once, beside the control spec, and the
// library reads it through `useFormFactor`: a screen asks the rule, never the OS. The layouts are
// the platform guides', by their tokens, and only where a guide states them; the TV's gutter is
// `tv.safe.x`, as the owner tightened it on 2026-10-30 (tv.md › Safe area).
import type { ControlPlatform } from './controls.ts'
import { mobile, tv, web } from './scales.ts'

/** How a screen is used: the control spec's platforms (controls.md › One rule per platform). */
export type Input = ControlPlatform

/**
 * A phone or a narrow window, a tablet or a wide window, or a TV. The names are Apple's horizontal
 * size classes (https://developer.apple.com/documentation/uikit/uiuserinterfacesizeclass), split
 * at 768. It's the one width rule: the admin's and the library's old 600, 1024 and 1440 left the
 * tokens in part E (one-client-platform-e.md, answer 5).
 */
export type WidthClass = 'compact' | 'regular' | 'tv'

/** The width, in points or CSS pixels, from which a window is regular: compact is below it. */
export const REGULAR_WIDTH = 768

/**
 * The primary pointer of a phone's or a tablet's browser, which has touch's rule on the web
 * (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer).
 */
export const COARSE_POINTER = '(pointer: coarse)'

/** An input and its width class. Only a TV is in the TV's class, whatever its width. */
export type FormFactor =
  | { readonly input: Exclude<Input, 'tv'>; readonly widthClass: Exclude<WidthClass, 'tv'> }
  | { readonly input: 'tv'; readonly widthClass: 'tv' }

/** A form factor's name, as the prototypes' frames and an address give it (`compact-touch`). */
export type FormFactorName = `${Exclude<WidthClass, 'tv'>}-${Exclude<Input, 'tv'>}` | 'tv'

/** Every form factor, by name. */
export const FORM_FACTORS = {
  'compact-pointer': { input: 'pointer', widthClass: 'compact' },
  'compact-touch': { input: 'touch', widthClass: 'compact' },
  'regular-pointer': { input: 'pointer', widthClass: 'regular' },
  'regular-touch': { input: 'touch', widthClass: 'regular' },
  tv: { input: 'tv', widthClass: 'tv' },
} as const satisfies Record<FormFactorName, FormFactor>

/** The form factor of a window `width` wide used with `input`: one of `FORM_FACTORS`. */
export function formFactorOf(width: number, input: Input): FormFactor {
  if (input === 'tv') return FORM_FACTORS.tv
  const name: FormFactorName = `${width >= REGULAR_WIDTH ? 'regular' : 'compact'}-${input}`
  return FORM_FACTORS[name]
}

export function formFactorName(formFactor: FormFactor): FormFactorName {
  return formFactor.input === 'tv' ? 'tv' : `${formFactor.widthClass}-${formFactor.input}`
}

/** The form factor a name gives, or nothing for one that isn't a name. */
export function formFactorNamed(name: string): FormFactor | undefined {
  return Object.hasOwn(FORM_FACTORS, name) ? FORM_FACTORS[name as FormFactorName] : undefined
}

/**
 * A form factor set from outside, whatever the device: an input, with the width class from the
 * frame's own window (the prototypes' phone frame is `touch` and the TV's `tv`, each an iframe with
 * its own viewport), or a whole form factor where the width can't be measured.
 */
export type FormFactorSetting = FormFactor | Input

const INPUTS: readonly string[] = ['pointer', 'touch', 'tv'] satisfies Input[]

/**
 * The setting a name gives (an address's `?ff=`): an input's (`touch`) or a whole form factor's
 * (`compact-touch`), or nothing for one that's neither.
 */
export function formFactorSettingNamed(name: string): FormFactorSetting | undefined {
  return INPUTS.includes(name) ? (name as Input) : formFactorNamed(name)
}

/** Where the navigation sits: the phone's tab bar, the web's top bar, or the TV's head. */
export type Navigation = 'tab-bar' | 'top-bar' | 'head'

/** A form factor's layout in its unit. A value its guide doesn't state is left out. */
export type FormFactorLayout = {
  /** Points or CSS pixels, or the TV's screen units (1u is 1% of the screen's width). */
  unit: 'px' | 'u'
  navigation: Navigation
  /** The page's side inset: a row's first item sits on it, and rows scroll edge to edge. */
  gutter?: number
  /** Between a row's items. */
  itemGap?: number
  /** Between rows, their titles included. */
  rowGap?: number
  /** A row item's width as a share of the row inside its gutters, so that many show and a peek. */
  itemShare?: number
  /** A row item's width. */
  itemWidth?: number
  /** The content's greatest width. */
  maxWidth?: number
}

/**
 * The layouts the platform guides state: the phone's (mobile.md › Layout), the web's
 * and the desktop app's (desktop-web.md › Structure) and the TV's (tv.md › Layout). A narrow window
 * with a pointer and a tablet have no guide of their own, so they have no layout here yet.
 */
export const formFactorLayouts = {
  'compact-touch': {
    unit: 'px',
    navigation: 'tab-bar',
    gutter: mobile.gutter,
    itemGap: mobile.posterGap,
    rowGap: mobile.rowGap,
    // "about 30% of the screen width in rows, so about three visible plus a peek"
    itemShare: 0.3,
  },
  'regular-pointer': { unit: 'px', navigation: 'top-bar', maxWidth: web.maxWidth },
  // the safe area as the owner tightened it on 2026-10-30 (scales.ts, tv.md)
  tv: {
    unit: 'u',
    navigation: 'head',
    gutter: tv.safe.x,
    itemGap: tv.poster.gap,
    itemWidth: tv.poster.width,
  },
} as const satisfies Partial<Record<FormFactorName, FormFactorLayout>>

/** A form factor's layout, where its guide states one. */
export function layoutOf(formFactor: FormFactor): FormFactorLayout | undefined {
  const layouts: Partial<Record<FormFactorName, FormFactorLayout>> = formFactorLayouts
  return layouts[formFactorName(formFactor)]
}
