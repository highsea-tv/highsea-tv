// SPDX-License-Identifier: AGPL-3.0-only
// Press feedback (mobile.md › Touch): the control spec's press scale (0.97) on spring.quick, no
// highlight colour, and a light haptic for select-class actions (never on a TV, which has no
// haptics and no ExpoHaptics module). Reduced motion keeps the press without the scale
// (`useMotionReduced`: the ThemeProvider's setting, or the OS's through Reanimated).
// A control passes its drawn size as `slop`, and on touch the target grows to 44 around it
// without moving the layout (controls.md › Touch keeps the drawn size; Pressable's `hitSlop`,
// https://reactnative.dev/docs/pressable#hitslop). A pointer and the TV have no hit area.
// On the web, react-native-web does what React Native's Pressable doesn't, here once for every
// control (one-client-platform.md › Part A):
// - hover: its Pressable reports it through `onHoverIn` and `onHoverOut` (react-native-web's
//   exports/Pressable/index.js, `useHover`), as React Native does for an iPad's pointer; Press
//   passes it on with a pointer only, so a tap never leaves a control looking hovered;
// - the focus ring: its Pressable reports every focus, a click's included, so Press asks whether
//   the browser would show a ring (`:focus-visible`, ./dom.web.ts) and draws the web's ring
//   (focus.web, 2 wide and 2 out, in the `focus` role, times the theme's focusRingScale). Only
//   the web draws it: the phone keeps the system's own focus (iOS's Full Keyboard Access draws its
//   halo), so a ring of ours would double it;
// - keys: its PressResponder presses on Enter for any element and on Space only for a button
//   (modules/usePressEvents/PressResponder.js, `isValidKeyPress`), so Press presses on Space for
//   the roles whose key it is too (./dom.web.ts), on its release as browsers press a button, and
//   once however long the key is held (`repeat` keydowns are ignored);
// - the hit area: it drops `hitSlop` (View's forwarded props leave it out), so on the web a
//   transparent layer reaches past the control by the same insets, and a press on it bubbles to
//   the control's own element (onPress fires on the DOM's `click`);
// - checked: its createDOMProps reads `aria-checked`, never `accessibilityState`, so a radio,
//   checkbox or switch given only `accessibilityState.checked` (the player's tracks, Settings'
//   theme cards) is written with it as `aria-checked` too (https://www.w3.org/TR/wai-aria-1.2/#aria-checked).
import * as Haptics from 'expo-haptics'
import { type ComponentRef, type ReactNode, type Ref, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { FOCUS_RING, focusVisible, HIT_LAYER, spaceActivates } from './dom'
import { hitSlopFor } from './metrics.ts'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const quick = tokens.springs.quick

/** What a press target is showing: hovered by a pointer, pressed, or focused from the keyboard. */
export type PressState = { hovered: boolean; pressed: boolean; focused: boolean }

/** No pointer over it, nothing pressing it and no keyboard focus: the TV's controls, which focus by their own rule. */
export const AT_REST: PressState = { hovered: false, pressed: false, focused: false }

export type PressProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>)
  children: ReactNode | ((state: PressState) => ReactNode)
  /** Draw the keyboard's focus ring (on by default; a part that draws its own turns it off). */
  ring?: boolean
  /**
   * Draw the ring inside the target rather than around it, for targets in a column that clips (the
   * web renderer's `focus-ring-inset`).
   */
  ringInset?: boolean
  /** A light tap on press, for select-class actions. */
  haptic?: boolean
  /**
   * The control's drawn height (and width, when it's fixed), so touch's invisible hit area can
   * take the target to 44. Nothing with a pointer or on the TV.
   */
  slop?: { height: number; width?: number }
  /** The target's view, for a screen to focus or measure it (a menu's trigger, a poster). */
  ref?: Ref<ComponentRef<typeof View>>
}

export function Press({
  style,
  children,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  slop,
  ring = true,
  ringInset = false,
  ref,
  ...props
}: PressProps) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const input = theme.formFactor.input
  const hit = tokens.controls[input].md.hit
  const hitSlop = slop ? hitSlopFor(hit, slop.height, slop.width) : undefined
  const scale = useSharedValue(1)
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  // Space went down on this control, so its release presses it
  const space = useRef(false)
  const state: PressState = { hovered: hovered && input === 'pointer', pressed, focused }
  const role = props.role ?? props.accessibilityRole ?? 'button'
  const press = (e: Parameters<NonNullable<PressableProps['onPress']>>[0]) => {
    if (haptic && !Platform.isTV) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPress?.(e)
  }
  const drawn = typeof style === 'function' ? style(state) : style
  // the web's ring (desktop-web.md › Focus); the TV's focus is Focusable's, never Press's
  const ringStyle: ViewStyle | undefined =
    FOCUS_RING && ring && focused && input !== 'tv'
      ? {
          outlineStyle: 'solid',
          outlineWidth: tokens.focus.web.width * theme.focusRingScale,
          outlineOffset: ringInset
            ? -tokens.focus.web.width * theme.focusRingScale
            : tokens.focus.web.offset,
          outlineColor: theme.colors.focus,
        }
      : undefined
  return (
    <AnimatedPressable
      ref={ref as never}
      // a button unless the part says otherwise: the part's props come after, so its `role` or
      // `accessibilityRole` (a link, a tab, a menu's item) wins, and `role` above is read from them
      accessibilityRole="button"
      hitSlop={hitSlop}
      {...props}
      // react-native-web's Pressable sets its own tabIndex, 0 unless disabled
      // (exports/Pressable/index.js), which createDOMProps reads before `focusable`, so a press
      // that's no Tab stop (`focusable={false}`) says so with -1 too, React Native's View's
      // tabIndex (https://reactnative.dev/docs/view#tabindex-android)
      {...(props.focusable === false ? { tabIndex: -1 as const } : null)}
      {...checkedAria(String(role), props)}
      onPressIn={(e) => {
        setPressed(true)
        if (!reduced) scale.value = withSpring(tokens.controls.pressScale, quick)
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        setPressed(false)
        scale.value = withSpring(1, quick)
        onPressOut?.(e)
      }}
      onPress={press}
      onHoverIn={(e) => {
        setHovered(true)
        onHoverIn?.(e)
      }}
      onHoverOut={(e) => {
        setHovered(false)
        onHoverOut?.(e)
      }}
      onFocus={(e) => {
        setFocused(focusVisible(e.nativeEvent.target ?? e.target))
        onFocus?.(e)
      }}
      onBlur={(e) => {
        setFocused(false)
        space.current = false
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (!props.disabled && spaceActivates(e.nativeEvent.key, String(role))) {
          // the page doesn't scroll; a held key's repeats don't press again
          e.preventDefault()
          if (!(e.nativeEvent as { repeat?: boolean }).repeat) space.current = true
        }
        onKeyDown?.(e)
      }}
      onKeyUp={(e) => {
        if (space.current && spaceActivates(e.nativeEvent.key, String(role))) {
          space.current = false
          e.preventDefault()
          if (!props.disabled) press(e as unknown as Parameters<typeof press>[0])
        }
        onKeyUp?.(e)
      }}
      style={[drawn, ringStyle, animated]}
    >
      {HIT_LAYER && hitSlop ? (
        <View
          aria-hidden
          style={{
            position: 'absolute',
            top: -hitSlop.top,
            bottom: -hitSlop.bottom,
            left: -hitSlop.left,
            right: -hitSlop.right,
          }}
        />
      ) : null}
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  )
}

/** The success haptic (mobile.md › Touch), for a finished action. */
export const successHaptic = () =>
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

/** The roles that take `aria-checked` (WAI-ARIA 1.2's supported states for each). */
const CHECKED_ROLES = new Set(['radio', 'checkbox', 'switch', 'menuitemradio', 'menuitemcheckbox'])

/** On the web, `accessibilityState.checked` as `aria-checked`, unless the part sets its own. */
function checkedAria(
  role: string,
  props: Pick<PressableProps, 'accessibilityState'>,
): object | null {
  if (Platform.OS !== 'web' || !CHECKED_ROLES.has(role)) return null
  const own = props as { 'aria-checked'?: unknown }
  const checked = props.accessibilityState?.checked
  if (own['aria-checked'] !== undefined || checked === undefined) return null
  return { 'aria-checked': checked }
}
