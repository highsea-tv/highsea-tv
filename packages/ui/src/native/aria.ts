// SPDX-License-Identifier: AGPL-3.0-only
// A press target's role and checked state as each platform reads them. Internal: ControlPress, the
// TV's Focusable and NamedAction's touch form use it.
import { type AccessibilityRole, type AccessibilityState, Platform, type Role } from 'react-native'

/**
 * A role and its checked state for Pressable. A toggle is React Native's `togglebutton` with
 * `checked` (https://reactnative.dev/docs/accessibility#accessibilityrole), which VoiceOver and
 * TalkBack read as a toggle; the web has no such role, and react-native-web writes a role it
 * doesn't map as it is (its propsToAriaRole), so there it's a button with `aria-pressed`, which
 * react-native-web passes on (its createDOMProps; https://www.w3.org/WAI/ARIA/apg/patterns/button/).
 */
export function ariaRole(
  role: AccessibilityRole | undefined,
  checked: AccessibilityState['checked'],
): { accessibilityRole?: AccessibilityRole; 'aria-checked'?: AccessibilityState['checked'] } {
  if (role === 'togglebutton' && Platform.OS === 'web')
    // React Native's props have no aria-pressed, which only the web reads; `mixed` stays mixed
    // (https://www.w3.org/TR/wai-aria-1.2/#aria-pressed)
    return {
      accessibilityRole: 'button',
      ...({ 'aria-pressed': checked === 'mixed' ? 'mixed' : checked === true } as object),
    }
  return { accessibilityRole: role, 'aria-checked': checked }
}

/**
 * A menu's item as each platform reads it. The web takes WAI-ARIA's `menuitem`, or
 * `menuitemradio` with `aria-checked` for a choice (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/),
 * which react-native-web writes as given. React Native has neither: react-native-tvos logs
 * "Unsupported Role value" for `menuitemradio`, and iOS maps `menuitem` to no trait
 * (RCTViewManager.m), so a phone's reader would read a choice as plain text. There it's a button,
 * its choice in force `checked` and `selected` (https://reactnative.dev/docs/accessibility#accessibilitystate),
 * which VoiceOver reads as selected. A `checkbox` item (one of several chosen at once, a tag picker's)
 * is `menuitemcheckbox` with `aria-checked` on the web (https://www.w3.org/TR/wai-aria-1.2/#menuitemcheckbox),
 * and a button `checked` elsewhere.
 */
export function menuItemRole(
  choice: boolean,
  checked: boolean,
  disabled: boolean,
  checkbox = false,
): {
  role?: Role
  accessibilityRole?: AccessibilityRole
  accessibilityState: AccessibilityState
  'aria-checked'?: boolean
} {
  if (Platform.OS === 'web')
    return {
      // React Native's Role list has no `menuitemradio` or `menuitemcheckbox`; react-native-web
      // writes them as they are
      role: (checkbox ? 'menuitemcheckbox' : choice ? 'menuitemradio' : 'menuitem') as Role,
      'aria-checked': choice || checkbox ? checked : undefined,
      accessibilityState: { disabled },
    }
  return {
    accessibilityRole: 'button',
    accessibilityState: {
      disabled,
      checked: choice || checkbox ? checked : undefined,
      selected: choice ? checked : undefined,
    },
  }
}
