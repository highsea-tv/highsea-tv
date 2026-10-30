// SPDX-License-Identifier: AGPL-3.0-only
// Press feedback (mobile.md › Touch): a 0.97 scale on spring.quick, no highlight colour, and a
// light haptic for select-class actions (never on a TV, which has no haptics and no ExpoHaptics
// module). Reduced motion keeps the press without the scale
// (Reanimated's useReducedMotion, https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/).
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
import { tokens } from './theme.tsx'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const quick = tokens.springs.quick

export type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>
  children: ReactNode
  /** A light tap on press, for select-class actions. */
  haptic?: boolean
}

export function Press({
  style,
  children,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: PressProps) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...props}
      onPressIn={(e) => {
        if (!reduced) scale.value = withSpring(0.97, quick)
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
