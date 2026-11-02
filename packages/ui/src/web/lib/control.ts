// SPDX-License-Identifier: AGPL-3.0-only
// The control spec as class fragments (docs/design-language/controls.md, design system 1.1). Every
// control's height, padding, gap, icon, text and corner comes from the tokens' `--control-*`
// variables, whose values the platform sets (a pointer on :root, touch under `pointer: coarse`, or
// `data-platform`), so a component never names a size of its own. The classes are written out in
// full so Tailwind finds them in the source (https://tailwindcss.com/docs/detecting-classes-in-source-files).
import type { ControlSize } from '@highsea-tv/tokens'

export type { ControlSize }

/**
 * The invisible box that reaches `--control-hit` (44 on touch, 0 elsewhere) without changing the
 * control's size or the layout, as React Native's `hitSlop` does: an `::after` that only ever grows
 * past the control, so a larger control is left alone (WCAG 2.5.5, Apple's HIG at 44pt). The
 * control must be positioned and nothing around it may clip the extra room. Replaced elements
 * (`<input>`, `<textarea>`) have no `::after`, so fields put it on their wrapper.
 */
export const controlHit =
  "relative after:absolute after:inset-[min(0px,calc((100%_-_var(--control-hit))/2))] after:content-['']"

/** One shape: `radius-sm` on every control (controls.md › Rules). */
export const controlShape = 'rounded-(--control-radius)'

/** A segmented thumb or a checkbox: the control's corner less its inset, so the curves nest. */
export const controlInnerShape = 'rounded-[calc(var(--control-radius)-var(--control-inset))]'

/** Pressed controls scale to 0.97 (motion.md); disabled ones keep their look at 45%. */
export const controlPress = 'motion-safe:active:scale-[0.97]'
export const controlDisabled = 'disabled:pointer-events-none disabled:opacity-45'

export type ControlSizeClasses = {
  /** The height, fixed. */
  h: string
  /** The height as a minimum, for a label that may wrap at 200% text (WCAG 1.4.4). */
  minH: string
  /** Square at the height: an icon button. */
  square: string
  /** A button's, a chip's and a segment's side padding. */
  pad: string
  /** A field's and a select's side padding. */
  fieldPad: string
  /** A field's padding where an icon sits at its start: the padding, the icon and a gap. */
  fieldIconPad: string
  gap: string
  /** The text size and its leading. */
  text: string
  /** An icon's box. */
  icon: string
}

export const controlSizes: Record<ControlSize, ControlSizeClasses> = {
  md: {
    h: 'h-(--control-h)',
    minH: 'min-h-(--control-h)',
    square: 'h-(--control-h) w-(--control-h) p-0',
    pad: 'px-(--control-pad)',
    fieldPad: 'px-(--control-field-pad)',
    fieldIconPad:
      'ps-[calc(var(--control-field-pad)+var(--control-icon)+var(--control-gap))] pe-(--control-field-pad)',
    gap: 'gap-(--control-gap)',
    text: 'text-(length:--control-text) leading-(--control-leading)',
    icon: 'size-(--control-icon)',
  },
  sm: {
    h: 'h-(--control-h-sm)',
    minH: 'min-h-(--control-h-sm)',
    square: 'h-(--control-h-sm) w-(--control-h-sm) p-0',
    pad: 'px-(--control-pad-sm)',
    fieldPad: 'px-(--control-field-pad-sm)',
    fieldIconPad:
      'ps-[calc(var(--control-field-pad-sm)+var(--control-icon-sm)+var(--control-gap-sm))] pe-(--control-field-pad-sm)',
    gap: 'gap-(--control-gap-sm)',
    text: 'text-(length:--control-text-sm) leading-(--control-leading-sm)',
    icon: 'size-(--control-icon-sm)',
  },
}

/** Where an icon sits inside a field's start, at the field's padding. */
export const fieldIconStart: Record<ControlSize, string> = {
  md: 'start-(--control-field-pad)',
  sm: 'start-(--control-field-pad-sm)',
}

/**
 * A field's look (controls.md › Looks): `s1` with the `control-edge` (3:1, WCAG 1.4.11), the
 * `focus` edge and ring when focused, `danger` when invalid.
 */
export const fieldLook =
  'border border-control-edge bg-s1 text-text outline-none transition-tint placeholder:text-text-3 focus-visible:border-focus focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-accent-soft)] aria-[invalid=true]:border-danger disabled:opacity-45'

/**
 * One segmented look, for a segmented control and segmented tabs alike: an `s2` track with the
 * inset, and a `control-selected` thumb in the same corner less the inset. The track carries the
 * control's text size too, so the group itself is at its segments' size, not the page's.
 */
export const segmentedTrack: Record<ControlSize, string> = {
  md: 'relative inline-flex h-(--control-h) max-w-full rounded-(--control-radius) bg-s2 p-(--control-inset) text-(length:--control-text) leading-(--control-leading)',
  sm: 'relative inline-flex h-(--control-h-sm) max-w-full rounded-(--control-radius) bg-s2 p-(--control-inset) text-(length:--control-text-sm) leading-(--control-leading-sm)',
}
export const segmentedThumb = `inset-y-(--control-inset) bg-control-selected shadow-2 ${controlInnerShape}`

/** A segment: `text-2` on the track, `text` at 600 when chosen. */
export const segmentedItem: Record<ControlSize, string> = {
  md: `relative inline-flex h-full shrink-0 cursor-pointer items-center justify-center gap-(--control-gap) whitespace-nowrap px-(--control-pad) text-(length:--control-text) leading-(--control-leading) font-medium text-text-2 transition-tint hover:text-text disabled:pointer-events-none disabled:opacity-45 ${controlInnerShape}`,
  sm: `relative inline-flex h-full shrink-0 cursor-pointer items-center justify-center gap-(--control-gap-sm) whitespace-nowrap px-(--control-pad-sm) text-(length:--control-text-sm) leading-(--control-leading-sm) font-medium text-text-2 transition-tint hover:text-text disabled:pointer-events-none disabled:opacity-45 ${controlInnerShape}`,
}
