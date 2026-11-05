// SPDX-License-Identifier: AGPL-3.0-only
// A focus stop on the TV (tv.md › Focus): a Pressable that tvOS's focus engine moves to (and
// Android TV's, through the same react-native-tvos props), lifting on focus by the focus tokens'
// scale on `spring.base` and drawing the ring, the `text` colour 0.2u wide with its dark drop
// shadow. Reduced motion keeps the ring without the scale. The ring is a box shadow, so it never
// moves the layout (https://reactnative.dev/docs/view-style-props#boxshadow). What moves focus is
// the platform's engine (./engine, a platform pair): tvOS's and Android TV's own on the devices,
// and the spatial focus engine in a browser. The drawing here is the same on all of them.

import {
  type ComponentRef,
  createContext,
  type ReactNode,
  type Ref,
  useContext,
  useState,
} from 'react'
import {
  type AccessibilityRole,
  type AccessibilityState,
  type DimensionValue,
  Pressable,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { ariaRole } from '../aria.ts'
import { tokens, useMotionReduced, useTheme } from '../theme.tsx'
import { requestFocus, useStop } from './engine'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** A mounted view, for a focus guide's `destinations`. */
export type ViewHandle = ComponentRef<typeof View>

const ring = tokens.focus.tv

/**
 * How far a stop lifts on focus, by what it is: a button and a poster by the focus tokens' scales
 * (focus.tv), and the rest by the TV prototype's own, named here once so no part writes a scale
 * of its own:
 * - `row`, a list's full-width row: its settings and server rows' `scale-[1.03]`;
 * - `card`, the film row's card: 1.04;
 * - `banner`, a card as wide as the page (Home's featured card, a notice, a film's facts), which
 *   lifts only slightly: 1.015;
 * - `letter`, the letter index's letter, small enough to need a larger lift: 1.25.
 */
export const LIFT = {
  button: ring.scaleButton,
  poster: ring.scalePoster,
  row: 1.03,
  card: 1.04,
  banner: 1.015,
  letter: 1.25,
  none: 1,
} as const

export type Lift = keyof typeof LIFT

/** The ring as a box shadow, at this theme's ring scale and unit. */
export function focusShadow(text: string, u: number, scale = 1) {
  const s = ring.shadow
  return `0 0 0 ${ring.width * scale * u}px ${text}, ${s.x}px ${s.y * u}px ${s.blur * u}px ${s.spread * u}px rgba(0, 0, 0, ${s.opacity})`
}

/**
 * Where a stop sits, for its test id: a row names each of its items (`Staff picks/0/`), since the
 * same film can be in several rows under the same label. The D-pad walk (scripts/sweeps/tv.ts) tells
 * stops apart by these ids, which iOS and tvOS expose as accessibility identifiers.
 */
export const StopScope = createContext('')

export type FocusableProps = {
  onPress?: () => void
  onLongPress?: () => void
  /** How long OK is held for `onLongPress`, in ms (Pressable's own is 500). */
  delayLongPress?: number
  onFocus?: () => void
  onBlur?: () => void
  /** How far it lifts on focus, by name (LIFT); a number is still taken, but no part passes one. */
  lift?: Lift | number
  /** Whether the ring is drawn on this stop; a poster draws it around its art instead. */
  ring?: boolean
  /** The ring's corner radius, in points. */
  radius?: number
  /** tvOS's preferred focus when the screen appears. */
  preferred?: boolean
  disabled?: boolean
  label?: string
  /**
   * What the stop holds beyond its name (a card's facts, a notice's words): read after the label,
   * since VoiceOver reads a focus stop as one element and none of what's inside it, but kept out of
   * the stop's test id, which stays its label's.
   */
  description?: string | null
  role?: AccessibilityRole
  selected?: boolean
  /** More of the stop's state for VoiceOver: checked, expanded, busy. */
  state?: AccessibilityState
  width?: DimensionValue
  style?: StyleProp<ViewStyle>
  ref?: Ref<ViewHandle>
  children: ReactNode | ((focused: boolean) => ReactNode)
}

export function Focusable({
  onPress,
  onLongPress,
  delayLongPress,
  onFocus,
  onBlur,
  lift = 'button',
  ring: drawRing = true,
  radius,
  preferred,
  disabled,
  label,
  description,
  role = 'button',
  selected,
  state,
  width,
  style,
  ref,
  children,
}: FocusableProps) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const scope = useContext(StopScope)
  const [focused, setFocused] = useState(false)
  const scale = useSharedValue(1)
  const to = typeof lift === 'number' ? lift : LIFT[lift]
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }), [scale])
  const stop = useStop(ref, { preferred, disabled })
  return (
    <AnimatedPressable
      {...stop.props}
      ref={stop.ref}
      {...ariaRole(role, state?.checked)}
      accessibilityLabel={description ? [label, description].filter(Boolean).join(', ') : label}
      accessibilityState={{ ...state, disabled, selected }}
      testID={`tv:${scope}${label ?? ''}`}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onFocus={() => {
        setFocused(true)
        if (!reduced) scale.value = withSpring(to, tokens.springs.base)
        onFocus?.()
      }}
      onBlur={() => {
        setFocused(false)
        scale.value = withSpring(1, tokens.springs.base)
        onBlur?.()
      }}
      style={[
        { width, borderRadius: radius },
        focused &&
          drawRing && { boxShadow: focusShadow(theme.colors.text, theme.u, theme.focusRingScale) },
        style,
        stop.style,
        animated,
      ]}
    >
      {typeof children === 'function' ? children(focused) : children}
    </AnimatedPressable>
  )
}

/** Moves focus to a mounted stop, by the platform's engine (./engine's requestFocus). */
export function focusOn(handle: ViewHandle | null | undefined) {
  requestFocus(handle)
}
