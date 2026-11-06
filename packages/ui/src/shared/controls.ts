// SPDX-License-Identifier: AGPL-3.0-only
// The controls' props, written once for both renderers (design system 1.1, controls.md). Each
// renderer's props are these plus its platform's own events and element props: `onClick` and the
// DOM's attributes on the web, `onPress` and accessibility props in React Native. Sizes and colours
// come from the control spec in @highsea-tv/tokens, never from a screen. `I` is the renderer's icon
// names: the native set is the web's, less the admin's own glyphs (test/native/icons.test.ts).
import type { ButtonVariant, ControlPlatform, ControlSize } from '@highsea-tv/tokens'

export type { ButtonVariant, ControlPlatform, ControlSize }

/** A button or an icon button. */
export type ButtonCommon<I extends string = string> = {
  variant?: ButtonVariant
  size?: ControlSize
  /** An icon before the label. */
  icon?: I
  /** An icon after the label. */
  iconEnd?: I
  /** Square, icon-only. Needs a label for assistive technology. */
  iconOnly?: boolean
  /** Shows a spinner in place of the icon and marks the button busy. */
  loading?: boolean
  disabled?: boolean
  /** Fills the width it's given. */
  block?: boolean
}

/** A text field's own props, beside its label, hint and error. */
export type FieldCommon = {
  label: string
  hint?: string
  error?: string
  /** The label is read but not shown (a search field, a toolbar's filter). */
  hideLabel?: boolean
  size?: ControlSize
  disabled?: boolean
}

/** One choice of a segmented control, tabs or a chip group. */
export type ChoiceOption<V extends string = string, I extends string = string> = {
  value: V
  label: string
  icon?: I
  disabled?: boolean
  /** Tabs: a count after the label, in mono (the admin's queue and its filters). */
  count?: number
  /**
   * A select on a pointer: the heading of the group it's in, consecutive options with the same
   * group drawn under one (the web's SelectGroup and SelectLabel).
   */
  group?: string
  /** A select: the label in mono (a release group, a folder, a field's key). */
  mono?: boolean
}

/** One choice from a few: a segmented control or segmented tabs. */
export type SegmentedCommon<V extends string = string, I extends string = string> = {
  options: ChoiceOption<V, I>[]
  value?: V
  defaultValue?: V
  onValueChange?: (value: V) => void
  /** Names the group for assistive technology. */
  'aria-label': string
  size?: ControlSize
  /** Fills the width it's given, each choice an equal share. */
  block?: boolean
}

/** A chip: a filter or a choice in a row of them, a pill at the control's height. */
export type ChipCommon<I extends string = string> = {
  selected?: boolean
  icon?: I
  /** After the label: a chevron on a chip that opens a menu (a library's Genre). */
  iconEnd?: I
  /** Shows a remove mark after the label. */
  removable?: boolean
  size?: ControlSize
  disabled?: boolean
}

/** A switch, a checkbox or a radio. */
export type ToggleCommon = {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  /** The words beside it, or its name when it has none. */
  label?: string
  /** The label is read but not shown: a switch at the end of a row that already says what it does. */
  hideLabel?: boolean
}

/** A disclosure: a row that shows and hides what's under it. */
export type DisclosureCommon<I extends string = string> = {
  title: string
  /** An icon before the title. */
  icon?: I
  /** A line under the title, or a count at its end. */
  detail?: string
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Several choices from a list: a select whose value is a set. */
export type MultiSelectCommon<V extends string = string, I extends string = string> = {
  options: ChoiceOption<V, I>[]
  value?: V[]
  defaultValue?: V[]
  onValueChange?: (value: V[]) => void
  /** Shown when nothing is chosen. */
  placeholder?: string
  'aria-label'?: string
  size?: ControlSize
  disabled?: boolean
}
