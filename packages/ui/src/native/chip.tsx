// SPDX-License-Identifier: AGPL-3.0-only
// A chip (controls.md › One look per kind): a filter or a choice in a row of them, one design on
// every platform, a pill at the control's height. At rest `s2` with the `line-strong` edge and a
// `text-2` label; chosen, `control-selected` with a `text` label at 600. The TV's Sort and
// Unwatched choices are this chip at the TV's rule, with its focus ring and lift.

import { line } from '@highsea-tv/tokens'
import type { Ref } from 'react'
import { type AccessibilityProps, type AccessibilityRole, Platform } from 'react-native'
import type { ChipCommon } from '../shared/controls.ts'
import { ControlPress, ControlText, lookAt } from './control.tsx'
import { Icon, type IconName } from './icon.tsx'
import { centredPadding } from './metrics.ts'
import { OWN_SIZE } from './own-size.ts'
import { tokens, useControl, useTheme } from './theme.tsx'
import type { ViewHandle } from './tv/focusable.tsx'

/**
 * A choice of one among several (a theme, a chip in a radio group): `radio` on the web, with
 * `checked` alone (https://www.w3.org/TR/wai-aria-1.2/#radio; `aria-selected` isn't a radio's).
 * React Native gives `radio` no trait on iOS and tvOS (react-native-tvos 0.88's
 * accessibilityPropsConversions.h) and VoiceOver speaks it as a value, so there it's a button with
 * the selected trait, as UIKit's own lists of choices are
 * (https://developer.apple.com/documentation/uikit/uiaccessibilitytraits/selected).
 */
export const RADIO: AccessibilityRole = Platform.OS === 'web' ? 'radio' : 'button'
export const radioState = (on: boolean): { checked?: boolean; selected?: boolean } =>
  Platform.OS === 'web' ? { checked: on } : { selected: on }

export type ChipProps = ChipCommon<IconName> &
  Pick<AccessibilityProps, 'accessibilityLabel' | 'accessibilityHint'> & {
    children: string
    onPress?: () => void
    onFocus?: () => void
    /** tvOS's preferred focus when the screen appears (react-native-tvos). */
    hasTVPreferredFocus?: boolean
    /**
     * What it is to assistive tech. By default a toggle, `selected` read as pressed (React
     * Native's `togglebutton` with `checked`, on the web a button with `aria-pressed`:
     * https://www.w3.org/WAI/ARIA/apg/patterns/button/), since `aria-selected` isn't a button's
     * (https://www.w3.org/TR/wai-aria-1.2/#aria-selected). `tab` in a row of tabs, or `option`, reads
     * `selected` as the one chosen (WAI-ARIA's tabs pattern,
     * https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), and `radio` as checked.
     */
    accessibilityRole?: AccessibilityRole
    /**
     * It opens a menu or a dialog (`aria-haspopup`), as Button's: a filter chip's choices. Such a
     * chip is a button, which has no selected state, so the filter in force is its label's to say.
     */
    hasPopup?: 'menu' | 'dialog'
    /**
     * A view chip that's the page shown (`aria-current="page"`, ControlPress's `current`): a
     * button by default, the page being where the person is rather than a toggle that's on.
     */
    current?: 'page' | 'true'
    ref?: Ref<ViewHandle>
  }

export function Chip({
  children,
  selected = false,
  icon,
  iconEnd,
  removable,
  size,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onFocus,
  hasTVPreferredFocus,
  accessibilityRole,
  hasPopup,
  current,
  ref,
}: ChipProps) {
  const theme = useTheme()
  const m = useControl(size)
  const looks = tokens.controls.looks
  const look = selected ? looks.selected : looks.chip
  const edge = 'edge' in look ? look.edge : undefined
  // a chip that opens a menu is a button, not a toggle: its `selected` is a filter in force; a
  // view chip that's the page is a button whose `aria-current` says so
  const role: AccessibilityRole =
    accessibilityRole ?? (hasPopup || current ? 'button' : 'togglebutton')
  const radio = role === 'radio'
  const state = radio
    ? radioState(selected)
    : role === 'togglebutton'
      ? { checked: selected }
      : role === 'button'
        ? {}
        : { selected }
  return (
    <ControlPress
      ref={ref}
      onPress={onPress}
      onFocus={onFocus}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      role={radio ? RADIO : role}
      state={state}
      hasPopup={hasPopup}
      current={current}
      radius={tokens.radius.pill}
      slop={{ height: m.height }}
      style={{
        minHeight: m.height,
        ...OWN_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.gap,
        paddingHorizontal: m.pad,
        paddingVertical: centredPadding(m),
        backgroundColor: theme.colors[look.fill],
        borderWidth: line.thin,
        // the chosen chip keeps the edge's width in its own fill, so choosing never moves the row
        borderColor: edge ? theme.colors[edge] : theme.colors[look.fill],
        opacity: disabled ? tokens.controls.disabledOpacity : 1,
      }}
    >
      {(_focused, state) => {
        // a pointer over an unchosen chip turns its label to `text` (the chip look's hover)
        const label = lookAt(look, disabled ? { ...state, hovered: false } : state).label
        return (
          <>
            {icon ? <Icon name={icon} size={m.icon / theme.u} color={label} /> : null}
            <ControlText m={m} weight={look.weight} color={theme.colors[label]}>
              {children}
            </ControlText>
            {iconEnd ? <Icon name={iconEnd} size={m.icon / theme.u} color={label} /> : null}
            {removable ? <Icon name="close" size={m.icon / theme.u} color={label} /> : null}
          </>
        )
      }}
    </ControlPress>
  )
}
