// SPDX-License-Identifier: AGPL-3.0-only
// The one control spec (docs/design-language/controls.md, design system 1.1). Every button, field,
// select, segmented control, tab, chip, checkbox, radio and switch on every platform takes its
// size, shape and colours from here, through one rule per platform. Nothing else sets them.
import type { ColorRole } from './roles.ts'
import { icon, radius, targets } from './scales.ts'
import { adminText, mobileText, type TextStyle, tvText } from './typography.ts'

/** Where a control is drawn: a mouse or trackpad, a finger, or a remote across the room. */
export type ControlPlatform = 'pointer' | 'touch' | 'tv'
export const CONTROL_PLATFORMS: readonly ControlPlatform[] = ['pointer', 'touch', 'tv']

/** `md` everywhere; `sm` only in dense places (a table's row, a card, a widget's header). */
export type ControlSize = 'md' | 'sm'

/**
 * The geometry, in px at a pointer. `pad` is a button's, a chip's and a segment's side padding;
 * `fieldPad` a field's and a select's; `inset` the gap between a segmented control's track and its
 * thumb.
 */
export const controlGeometry = {
  md: { height: 36, pad: 16, fieldPad: 12, gap: 8, icon: 16, inset: 3 },
  sm: { height: 30, pad: 12, fieldPad: 10, gap: 6, icon: 14, inset: 3 },
} as const satisfies Record<ControlSize, ControlGeometry>

export type ControlGeometry = {
  height: number
  pad: number
  fieldPad: number
  gap: number
  icon: number
  inset: number
}

/** Each control's corner is `radius-sm`, scaled with the rest (spacing-layout.md › Radii). */
export const CONTROL_RADIUS = radius.sm

/** The space between controls in one row, before scaling: wide enough that touch hit areas never overlap. */
export const CONTROL_GAP = targets.touch - controlGeometry.md.height

/** The TV's reference screen, 1080p (tv.md › Units): its 1u is a hundredth of the width. */
export const TV_REFERENCE = { width: 1920, height: 1080 } as const

/** The TV's 1u at its reference width (tv.md › Units). */
const TV_UNIT_AT_REFERENCE = TV_REFERENCE.width / 100

/**
 * One rule per platform:
 * - `scale` multiplies the geometry. A pointer and touch draw it as it is; the TV draws it 1.75 times
 *   larger at 1080p, in screen units, for a couch three metres away;
 * - `text` takes the platform's own type scale: the admin's `form` and `ui`, the phone's `body`
 *   (16, so iOS never zooms into a field), and the TV's `button` and `pill`;
 * - `hit` is the invisible box around each control: 44 on touch (`targets.touch`), so a 36 control
 *   is easy to tap without changing its size or the layout. A pointer's 36 and 30 already pass
 *   WCAG 2.5.8's 24, and the TV has no touch.
 */
export const controlRules = {
  pointer: { unit: 'px', scale: 1, text: { md: adminText.form, sm: adminText.ui }, hit: 0 },
  touch: {
    unit: 'px',
    scale: 1,
    text: { md: mobileText.body, sm: mobileText.body },
    hit: targets.touch,
  },
  tv: {
    unit: 'u',
    scale: 1.75 / TV_UNIT_AT_REFERENCE,
    text: { md: tvText.button, sm: tvText.pill },
    hit: 0,
  },
} as const satisfies Record<
  ControlPlatform,
  { unit: 'px' | 'u'; scale: number; text: Record<ControlSize, TextStyle>; hit: number }
>

/** A control's measurements for a platform: px for a pointer and touch, screen units on the TV. */
export type ControlMetrics = ControlGeometry & {
  radius: number
  rowGap: number
  text: number
  leading: number
  weight: number
  hit: number
  unit: 'px' | 'u'
}

const round = (n: number) => Number(n.toFixed(4))

/** The rule applied: what a control of `size` measures on `platform`. */
export function controlMetrics(
  platform: ControlPlatform,
  size: ControlSize = 'md',
): ControlMetrics {
  const rule = controlRules[platform]
  const g = controlGeometry[size]
  const s = (n: number) => round(n * rule.scale)
  const text = rule.text[size]
  return {
    height: s(g.height),
    pad: s(g.pad),
    fieldPad: s(g.fieldPad),
    gap: s(g.gap),
    // the TV's icons are never under its minimum (iconography.md)
    icon: platform === 'tv' ? Math.max(s(g.icon), icon.sizeTv.min) : s(g.icon),
    inset: s(g.inset),
    radius: s(CONTROL_RADIUS),
    rowGap: s(CONTROL_GAP),
    text: text.size,
    leading: text.leading ?? 1.4,
    weight: text.weight,
    hit: rule.hit,
    unit: rule.unit,
  }
}

// ---- looks: the colour roles each state uses, the same on every platform

/** A look's roles. `fill` and `edge` are absent when the control has none. */
export type ControlLook = {
  fill?: ColorRole
  edge?: ColorRole
  label: ColorRole
  /** 600 for the view's main action and destructive fills, 500 otherwise. */
  weight: 500 | 600
  hover?: { fill?: ColorRole; label?: ColorRole }
}

/**
 * Buttons and icon buttons. `overlay` is for controls over artwork (a film's page, the TV's
 * hero): `text` at a low alpha, so the picture shows through.
 */
export const buttonLooks = {
  primary: { fill: 'accent-fill', label: 'on-accent', weight: 600 },
  secondary: { fill: 's2', edge: 'line-strong', label: 'text', weight: 500, hover: { fill: 's3' } },
  ghost: { label: 'text-2', weight: 500, hover: { fill: 's2', label: 'text' } },
  danger: { fill: 'danger-fill', label: 'on-danger', weight: 600 },
  'danger-ghost': { label: 'danger', weight: 500, hover: { fill: 's2' } },
  overlay: {
    fill: 'control-overlay',
    label: 'text',
    weight: 500,
    hover: { fill: 'control-overlay-hover' },
  },
} as const satisfies Record<string, ControlLook>
export type ButtonVariant = keyof typeof buttonLooks
export const BUTTON_VARIANTS = Object.keys(buttonLooks) as ButtonVariant[]

/**
 * Fields, selects and the choices. A field's edge is what identifies it, so it reaches 3:1
 * (`control-edge`); a chosen segment, tab or chip is `control-selected`, also 3:1 on its track.
 */
export const controlLooks = {
  field: { fill: 's1', edge: 'control-edge', label: 'text', weight: 500 },
  fieldFocused: { fill: 's1', edge: 'focus', label: 'text', weight: 500 },
  fieldInvalid: { fill: 's1', edge: 'danger', label: 'text', weight: 500 },
  placeholder: { label: 'text-3', weight: 500 },
  track: { fill: 's2', label: 'text-2', weight: 500, hover: { label: 'text' } },
  selected: { fill: 'control-selected', label: 'text', weight: 600 },
  chip: { fill: 's2', edge: 'line-strong', label: 'text-2', weight: 500, hover: { label: 'text' } },
  toggleOff: { fill: 'control-edge', label: 'text', weight: 500 },
  toggleOn: { fill: 'accent-fill', label: 'on-accent', weight: 600 },
} as const satisfies Record<string, ControlLook>

/** Disabled controls keep their look at this opacity. */
export const CONTROL_DISABLED_OPACITY = 0.45
/** A pressed control's scale (motion.md); the TV's focus scale is `focus.tv.scaleButton`. */
export const CONTROL_PRESS_SCALE = 0.97

/** The controls the spec covers, by name, in both renderers. */
export const CONTROLS = [
  'Button',
  'Input',
  'Textarea',
  'Select',
  'SearchField',
  'SegmentedControl',
  'Tabs',
  'Chip',
  'Checkbox',
  'Radio',
  'Switch',
] as const
export type ControlName = (typeof CONTROLS)[number]
