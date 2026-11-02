// SPDX-License-Identifier: AGPL-3.0-only
// What every native control is built on (controls.md): one press target that's the touch rule's
// Press on the phone (the press scale, a haptic, the 44 hit area) and the TV's focus stop on a TV
// (the ring in `text`, the lift to focus.tv.scaleButton on spring.base; tv.md › Focus), and the
// label's type from the control spec. Internal: the components export the props, not these.
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
import { Press } from './press.tsx'
import { useTheme } from './theme.tsx'
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
  style?: StyleProp<ViewStyle>
  ref?: Ref<ViewHandle>
  children: ReactNode | ((focused: boolean) => ReactNode)
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
  if (theme.platform === 'tv') {
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
        style={[{ borderRadius: radius }, style]}
      >
        {children}
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
      style={[{ width, borderRadius: radius }, style]}
    >
      {children}
    </PhonePress>
  )
}

/** Press, with `children` that may ask whether it has focus (a keyboard or switch control on iPad). */
function PhonePress({
  role,
  state,
  children,
  onFocus,
  onBlur,
  ...props
}: Omit<ControlPressProps, 'radius' | 'lift' | 'hasTVPreferredFocus' | 'width' | 'ref'>) {
  const [focused, setFocused] = useState(false)
  return (
    <Press
      {...props}
      accessibilityRole={role}
      accessibilityState={{ ...state, disabled: !!props.disabled }}
      onFocus={() => {
        setFocused(true)
        onFocus?.()
      }}
      onBlur={() => {
        setFocused(false)
        onBlur?.()
      }}
    >
      {typeof children === 'function' ? children(focused) : children}
    </Press>
  )
}

/** A control's label in the spec's type: its text size, leading and the look's weight. */
export function labelStyle(m: ControlPoints, weight: number): TextStyle {
  return {
    fontFamily: family(weight),
    fontSize: m.text,
    lineHeight: Math.round(m.text * m.leading),
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
  const tv = useTheme().platform === 'tv'
  return (
    <RNText
      maxFontSizeMultiplier={2}
      numberOfLines={lines ?? (tv ? 1 : undefined)}
      style={[labelStyle(m, weight), { color }, style]}
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
