// SPDX-License-Identifier: AGPL-3.0-only
// A chip (controls.md › One look per kind): a filter or a choice in a row of them, one design on
// every platform, a pill at the control's height. At rest `s2` with the `line-strong` edge and a
// `text-2` label; chosen, `control-selected` with a `text` label at 600. The TV's Sort and
// Unwatched choices are this chip at the TV's rule, with its focus ring and lift.
import type { Ref } from 'react'
import type { AccessibilityProps } from 'react-native'
import type { ChipCommon } from '../shared/controls.ts'
import { ControlPress, ControlText, lookAt } from './control.tsx'
import { Icon, type IconName } from './icon.tsx'
import { centredPadding } from './metrics.ts'
import { tokens, useControl, useTheme } from './theme.tsx'
import type { ViewHandle } from './tv/focusable.tsx'

export type ChipProps = ChipCommon<IconName> &
  Pick<AccessibilityProps, 'accessibilityLabel' | 'accessibilityHint'> & {
    children: string
    onPress?: () => void
    onFocus?: () => void
    /** tvOS's preferred focus when the screen appears (react-native-tvos). */
    hasTVPreferredFocus?: boolean
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
  ref,
}: ChipProps) {
  const theme = useTheme()
  const m = useControl(size)
  const looks = tokens.controls.looks
  const look = selected ? looks.selected : looks.chip
  const edge = 'edge' in look ? look.edge : undefined
  return (
    <ControlPress
      ref={ref}
      onPress={onPress}
      onFocus={onFocus}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      state={{ selected }}
      radius={tokens.radius.pill}
      slop={{ height: m.height }}
      style={{
        minHeight: m.height,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.gap,
        paddingHorizontal: m.pad,
        paddingVertical: centredPadding(m),
        backgroundColor: theme.colors[look.fill],
        borderWidth: 1,
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
