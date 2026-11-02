// SPDX-License-Identifier: AGPL-3.0-only
// A focus stop on the TV (tv.md › Focus): a Pressable that tvOS's focus engine moves to (and
// Android TV's, through the same react-native-tvos props), lifting on focus by the focus tokens'
// scale on `spring.base` and drawing the ring, the `text` colour 0.2u wide with its dark drop
// shadow. Reduced motion keeps the ring without the scale. The ring is a box shadow, so it never
// moves the layout (https://reactnative.dev/docs/view-style-props#boxshadow).
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
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { tokens, useTheme } from '../theme.tsx'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** A mounted view, for a focus guide's `destinations`. */
export type ViewHandle = ComponentRef<typeof View>

const ring = tokens.focus.tv
const ROW_SCALE = 1.03

/** The ring as a box shadow, at this theme's ring scale and unit. */
export function focusShadow(text: string, u: number, scale = 1) {
  const s = ring.shadow
  return `0 0 0 ${ring.width * scale * u}px ${text}, ${s.x}px ${s.y * u}px ${s.blur * u}px ${s.spread * u}px rgba(0, 0, 0, ${s.opacity})`
}

/**
 * Where a stop sits, for its test id: a row names each of its items (`Staff picks/0/`), since the
 * same film can be in several rows under the same label. The D-pad walk (apps/tv/uitest) tells
 * stops apart by these ids, which iOS and tvOS expose as accessibility identifiers.
 */
export const StopScope = createContext('')

export type FocusableProps = {
  onPress?: () => void
  onLongPress?: () => void
  onFocus?: () => void
  onBlur?: () => void
  /**
   * `button` lifts by 1.07, `poster` by 1.05 (focus.tv); `row`, a list's full-width row, by the
   * prototype's 1.03 (its settings and server rows' `scale-[1.03]`).
   */
  lift?: 'button' | 'poster' | 'row' | 'none'
  /** Whether the ring is drawn on this stop; a poster draws it around its art instead. */
  ring?: boolean
  /** The ring's corner radius, in points. */
  radius?: number
  /** tvOS's preferred focus when the screen appears. */
  preferred?: boolean
  disabled?: boolean
  label?: string
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
  onFocus,
  onBlur,
  lift = 'button',
  ring: drawRing = true,
  radius,
  preferred,
  disabled,
  label,
  role = 'button',
  selected,
  state,
  width,
  style,
  ref,
  children,
}: FocusableProps) {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const scope = useContext(StopScope)
  const [focused, setFocused] = useState(false)
  const scale = useSharedValue(1)
  const to =
    lift === 'button'
      ? ring.scaleButton
      : lift === 'poster'
        ? ring.scalePoster
        : lift === 'row'
          ? ROW_SCALE
          : 1
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressable
      ref={ref}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ ...state, disabled, selected }}
      testID={`tv:${scope}${label ?? ''}`}
      hasTVPreferredFocus={preferred}
      disabled={disabled}
      focusable={!disabled}
      onPress={onPress}
      onLongPress={onLongPress}
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
        animated,
      ]}
    >
      {typeof children === 'function' ? children(focused) : children}
    </AnimatedPressable>
  )
}

/**
 * Moves focus to a mounted stop: react-native-tvos gives every host view `requestTVFocus()` on both
 * TVs (its View.js), which its types don't list.
 */
export function focusOn(handle: ViewHandle | null | undefined) {
  ;(handle as unknown as { requestTVFocus?: () => void } | null)?.requestTVFocus?.()
}
