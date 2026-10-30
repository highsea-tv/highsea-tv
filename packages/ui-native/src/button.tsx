// SPDX-License-Identifier: AGPL-3.0-only
// Buttons, as ui-web draws them (button.tsx): primary (one per view, the accent fill with a 600
// label), secondary, ghost, danger and danger-ghost (danger's words without its fill, the owner's
// of 2026-10-29), at 44pt for touch (targets.touch). A label wraps rather than clipping at 200%
// text.
import type { ColorRole } from '@highsea-tv/tokens'
import { ActivityIndicator, View } from 'react-native'
import { Icon, type IconName } from './icon.tsx'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'

const looks: Record<
  ButtonVariant,
  { bg?: ColorRole; border?: ColorRole; fg: ColorRole; weight: 500 | 600 }
> = {
  primary: { bg: 'accent-fill', fg: 'on-accent', weight: 600 },
  secondary: { bg: 's2', border: 'line-strong', fg: 'text', weight: 500 },
  ghost: { fg: 'text-2', weight: 500 },
  danger: { bg: 'danger-fill', fg: 'on-danger', weight: 600 },
  'danger-ghost': { fg: 'danger', weight: 500 },
}

export type ButtonProps = {
  children?: string
  onPress?: () => void
  variant?: ButtonVariant
  icon?: IconName
  disabled?: boolean
  loading?: boolean
  /** Names an icon-only button. */
  label?: string
  /** Fills the width it's given. */
  block?: boolean
}

export function Button({
  children,
  onPress,
  variant = 'secondary',
  icon,
  disabled,
  loading,
  label,
  block,
}: ButtonProps) {
  const theme = useTheme()
  const look = looks[variant]
  const off = disabled || loading
  const touch = tokens.targets.touch * theme.u
  return (
    <Press
      haptic
      onPress={onPress}
      disabled={off}
      accessibilityLabel={label ?? children}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={{
        minHeight: touch,
        minWidth: children ? undefined : touch,
        alignSelf: block ? 'stretch' : 'flex-start',
        paddingHorizontal: children ? 16 * theme.u : 0,
        // room around a label grown by Dynamic Type; at the default size the touch height wins
        paddingVertical: children ? 8 * theme.u : 0,
        borderRadius: tokens.radius.sm * theme.u,
        backgroundColor: look.bg ? theme.colors[look.bg] : 'transparent',
        borderWidth: look.border ? 1 : 0,
        borderColor: look.border ? theme.colors[look.border] : undefined,
        opacity: disabled ? 0.45 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * theme.u }}>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors[look.fg]} />
        ) : (
          icon && <Icon name={icon} size={children ? 18 : 22} color={look.fg} />
        )}
        {children ? (
          <Text variant="body" weight={look.weight} color={look.fg} align="center">
            {children}
          </Text>
        ) : null}
      </View>
    </Press>
  )
}
