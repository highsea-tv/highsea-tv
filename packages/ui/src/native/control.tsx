// SPDX-License-Identifier: AGPL-3.0-only
// What every native control is built on (controls.md): one press target that's Press with a
// pointer or touch (the press scale, a haptic, and on touch the 44 hit area) and the TV's focus
// stop on a TV (the ring in `text`, the lift to focus.tv.scaleButton on spring.base; tv.md ›
// Focus), by the form factor's input, and the label's type from the control spec. Internal: the
// components export the props, not these.
import type { ColorRole, ControlLook } from '@highsea-tv/tokens'
import { type ReactNode, type Ref, useState } from 'react'
import {
  type AccessibilityRole,
  type AccessibilityState,
  type DimensionValue,
  Text as RNText,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { family } from './fonts.ts'
import type { ControlPoints } from './metrics.ts'
import { AT_REST, Press, type PressState } from './press.tsx'
import { fontScaleFor, MAX_FONT_MULTIPLIER, useTheme } from './theme.tsx'
import { Focusable, type ViewHandle } from './tv/focusable.tsx'

export type ControlPressProps = {
  onPress?: () => void
  onLongPress?: () => void
  onFocus?: () => void
  onBlur?: () => void
  /** tvOS's preferred focus when the screen appears (react-native-tvos's prop). */
  hasTVPreferredFocus?: boolean
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  role?: AccessibilityRole
  state?: AccessibilityState
  /** The drawn height, and the width when it's fixed, for touch's hit area. */
  slop?: { height: number; width?: number }
  /** The corner the TV's ring follows. */
  radius: number
  /** A list's row lifts less than a button on the TV. */
  lift?: 'button' | 'row'
  haptic?: boolean
  width?: DimensionValue
  testID?: string
  /** The target's style, or one for what it's showing: a pointer's hover, a press, the keyboard's focus. */
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>)
  ref?: Ref<ViewHandle>
  /** The content, or content for its focus (the TV's, or the keyboard's) and what else it's showing. */
  children: ReactNode | ((focused: boolean, state: PressState) => ReactNode)
}

/**
 * A look as drawn: with a pointer over it, its hover roles over its own (controls.md › One look per
 * kind; `hover` in the control spec's looks). Only a pointer hovers, so touch and the TV keep the look.
 */
export function lookAt<L extends ControlLook>(
  look: L,
  state: PressState,
): Omit<L, 'fill' | 'label'> & { fill?: ColorRole; label: ColorRole } {
  return state.hovered && look.hover ? { ...look, ...look.hover } : look
}

/** A control's press target, by the platform's rule. */
export function ControlPress({
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  hasTVPreferredFocus,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  role = 'button',
  state,
  slop,
  radius,
  lift = 'button',
  haptic = true,
  width,
  testID,
  style,
  ref,
  children,
}: ControlPressProps) {
  const theme = useTheme()
  if (theme.formFactor.input === 'tv') {
    return (
      <Focusable
        ref={ref}
        onPress={onPress}
        onLongPress={onLongPress}
        onFocus={onFocus}
        onBlur={onBlur}
        preferred={hasTVPreferredFocus}
        disabled={disabled}
        label={accessibilityLabel}
        role={role}
        selected={state?.selected}
        state={state}
        lift={lift}
        radius={radius}
        width={width}
        style={[{ borderRadius: radius }, typeof style === 'function' ? style(AT_REST) : style]}
      >
        {typeof children === 'function' ? (focused) => children(focused, AT_REST) : children}
      </Focusable>
    )
  }
  return (
    <PhonePress
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      role={role}
      state={state}
      slop={slop}
      haptic={haptic}
      testID={testID}
      style={(s) => [
        { width, borderRadius: radius },
        typeof style === 'function' ? style(s) : style,
      ]}
    >
      {children}
    </PhonePress>
  )
}

/** Press, with `children` that may ask what it's showing (a keyboard's or switch control's focus, a pointer's hover). */
function PhonePress({
  role,
  state,
  children,
  onFocus,
  onBlur,
  ...props
}: Omit<ControlPressProps, 'radius' | 'lift' | 'hasTVPreferredFocus' | 'width' | 'ref'>) {
  return (
    <Press
      {...props}
      accessibilityRole={role}
      accessibilityState={{ ...state, disabled: !!props.disabled }}
      // the same state as ARIA's attributes, which React Native reads too: react-native-web reads
      // only these (its createDOMProps has no accessibilityState), so without them the web never
      // says a checkbox is checked or a tab selected
      aria-checked={state?.checked}
      aria-selected={state?.selected}
      aria-busy={state?.busy}
      aria-expanded={state?.expanded}
      onFocus={() => onFocus?.()}
      onBlur={() => onBlur?.()}
    >
      {(s) => (typeof children === 'function' ? children(s.focused, s) : children)}
    </Press>
  )
}

/**
 * A control's label in the spec's type: its text size, leading and the look's weight, times
 * `scale`, the ThemeProvider's `fontScale` held to the label's cap (fontScaleFor). The control's
 * height is a minimum, so a grown label makes it taller.
 */
export function labelStyle(m: ControlPoints, weight: number, scale = 1): TextStyle {
  const size = m.text * scale
  return {
    fontFamily: family(weight),
    fontSize: size,
    lineHeight: Math.round(size * m.leading),
  }
}

export function ControlText({
  m,
  weight,
  color,
  lines,
  style,
  children,
}: {
  m: ControlPoints
  weight: number
  color: string
  /** The TV keeps a label on one line; the phone lets it wrap at 200% text. */
  lines?: number
  style?: StyleProp<TextStyle>
  children: ReactNode
}) {
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_MULTIPLIER}
      numberOfLines={lines ?? (tv ? 1 : undefined)}
      style={[labelStyle(m, weight, fontScaleFor(theme)), { color }, style]}
    >
      {children}
    </RNText>
  )
}

/** A value that's the caller's when given, and kept here otherwise (React's controlled inputs). */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (next: T) => void] {
  const [own, setOwn] = useState(defaultValue)
  const current = value === undefined ? own : value
  return [
    current,
    (next) => {
      if (value === undefined) setOwn(next)
      onChange?.(next)
    },
  ]
}
