// SPDX-License-Identifier: AGPL-3.0-only
// Press feedback (mobile.md › Touch): the control spec's press scale (0.97) on spring.quick, no
// highlight colour, and a light haptic for select-class actions (never on a TV, which has no
// haptics and no ExpoHaptics module). Reduced motion keeps the press without the scale
// (Reanimated's useReducedMotion, https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/).
// A control passes its drawn size as `slop`, and on touch the target grows to 44 around it
// without moving the layout (controls.md › Touch keeps the drawn size; Pressable's `hitSlop`,
// https://reactnative.dev/docs/pressable#hitslop).
import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { hitSlopFor } from './metrics.ts'
import { tokens, useTheme } from './theme.tsx'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const quick = tokens.springs.quick

export type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>
  children: ReactNode
  /** A light tap on press, for select-class actions. */
  haptic?: boolean
  /**
   * The control's drawn height (and width, when it's fixed), so touch's invisible hit area can
   * take the target to 44. Nothing on the TV.
   */
  slop?: { height: number; width?: number }
}

export function Press({
  style,
  children,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  slop,
  ...props
}: PressProps) {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const hit = theme.platform === 'tv' ? 0 : tokens.controls.touch.md.hit
  const hitSlop = slop ? hitSlopFor(hit, slop.height, slop.width) : undefined
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={hitSlop}
      {...props}
      onPressIn={(e) => {
        if (!reduced) scale.value = withSpring(tokens.controls.pressScale, quick)
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, quick)
        onPressOut?.(e)
      }}
      onPress={(e) => {
        if (haptic && !Platform.isTV) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress?.(e)
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  )
}

/** The success haptic (mobile.md › Touch), for a finished action. */
export const successHaptic = () =>
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
