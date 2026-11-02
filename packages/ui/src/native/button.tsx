// SPDX-License-Identifier: AGPL-3.0-only
// Buttons and icon buttons (controls.md), as the web draws them: primary (one per view), secondary,
// ghost, danger, danger-ghost and overlay (over artwork: a film's page, the TV's hero), each look's
// roles from the control spec. The size is the platform's rule: 36 and 30 on the phone with 16
// text, inside a 44 hit area that doesn't move the layout; on the TV the same spec in its units,
// with the focus ring and lift (tv.md › Buttons). A label wraps rather than clipping at 200% text.
import type { ColorRole } from '@highsea-tv/tokens'
import { Image } from 'expo-image'
import type { Ref } from 'react'
import { type AccessibilityProps, ActivityIndicator, View } from 'react-native'
import type { ButtonCommon } from '../shared/controls.ts'
import { ControlPress, ControlText } from './control.tsx'
import { Icon, type IconName } from './icon.tsx'
import { centredPadding } from './metrics.ts'
import { tokens, useControl, useTheme } from './theme.tsx'
import type { ViewHandle } from './tv/focusable.tsx'
import type { TileSource } from './tv/tiles.tsx'

export type { ButtonVariant } from '../shared/controls.ts'

export type ButtonProps = ButtonCommon<IconName> &
  Pick<AccessibilityProps, 'accessibilityLabel' | 'accessibilityHint'> & {
    /** The label. An icon-only button names itself with `accessibilityLabel`. */
    children?: string
    onPress?: () => void
    onLongPress?: () => void
    onFocus?: () => void
    onBlur?: () => void
    /** tvOS's preferred focus when the screen appears (react-native-tvos). */
    hasTVPreferredFocus?: boolean
    /** A round picture before the label: a person in the TV's Search. */
    image?: TileSource
    ref?: Ref<ViewHandle>
  }

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  iconOnly,
  loading,
  disabled,
  block,
  image,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  hasTVPreferredFocus,
  ref,
}: ButtonProps) {
  const theme = useTheme()
  const m = useControl(size)
  const look: {
    fill?: ColorRole
    edge?: ColorRole
    label: ColorRole
    weight: number
  } = tokens.controls.buttonLooks[variant]
  const square = iconOnly || !children
  const off = disabled || loading
  const fg = theme.colors[look.label]
  // icons are in the Icon's own units (points on the phone, u on the TV)
  const iconSize = m.icon / theme.u
  return (
    <ControlPress
      ref={ref}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      onBlur={onBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={off}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      state={{ busy: !!loading }}
      radius={m.radius}
      slop={square ? { height: m.height, width: m.height } : { height: m.height }}
      style={{
        minHeight: m.height,
        minWidth: square ? m.height : undefined,
        alignSelf: block ? 'stretch' : 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: m.gap,
        paddingHorizontal: square ? 0 : m.pad,
        paddingLeft: image !== undefined && !square ? m.inset * 2 : undefined,
        paddingVertical: square ? 0 : centredPadding(m),
        backgroundColor: look.fill ? theme.colors[look.fill] : 'transparent',
        borderWidth: look.edge ? 1 : 0,
        borderColor: look.edge ? theme.colors[look.edge] : undefined,
        opacity: disabled ? tokens.controls.disabledOpacity : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon name={icon} size={iconSize} color={look.label} />
      ) : null}
      {image !== undefined ? (
        <Image
          source={image}
          style={{
            width: m.height - m.inset * 2,
            height: m.height - m.inset * 2,
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors['control-overlay'],
          }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {children && !iconOnly ? (
        <View style={{ flexShrink: 1 }}>
          <ControlText m={m} weight={look.weight} color={fg} style={{ textAlign: 'center' }}>
            {children}
          </ControlText>
        </View>
      ) : null}
      {iconEnd && !square ? <Icon name={iconEnd} size={iconSize} color={look.label} /> : null}
    </ControlPress>
  )
}
