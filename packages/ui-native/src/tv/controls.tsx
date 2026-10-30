// SPDX-License-Identifier: AGPL-3.0-only
// The TV's buttons (kit.tsx's TvButton in the prototype, tv.md › Buttons): primary is a solid
// `text` fill with `bg` words, secondary `text` at 12%; focus adds the ring and the lift. A key on
// an on-screen keyboard fills with `text` when focused. A chip is a choice in a row (Sort, the
// Unwatched filter): `text` at 12% while chosen. A message fills the screen with its actions.
import { Image } from 'expo-image'
import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import { Icon, type IconName } from '../icon.tsx'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { Focusable, type ViewHandle } from './focusable.tsx'
import type { TileSource } from './tiles.tsx'

const tv = tokens.tv

/** `text` at an alpha, as the prototype's `bg-text/12`. */
export const alpha = (hex: string, a: number) =>
  `${hex.slice(0, 7)}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`

export function TvButton({
  children,
  onPress,
  onLongPress,
  onFocus,
  primary = false,
  icon,
  image,
  preferred,
  disabled,
  label,
  ref,
}: {
  children: string
  onPress?: () => void
  onLongPress?: () => void
  onFocus?: () => void
  primary?: boolean
  icon?: IconName
  /** A round picture before the words, as a person's in Search. */
  image?: TileSource
  preferred?: boolean
  disabled?: boolean
  label?: string
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const fg = primary ? 'bg' : 'text'
  return (
    <Focusable
      ref={ref}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      preferred={preferred}
      disabled={disabled}
      label={label ?? children}
      radius={tv.radius.button * u}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.6 * u,
        paddingLeft: image !== undefined ? 0.6 * u : 1.6 * u,
        paddingRight: 1.6 * u,
        paddingVertical: 0.8 * u,
        backgroundColor: primary ? theme.colors.text : alpha(theme.colors.text, 0.12),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={1.2} color={fg} /> : null}
      {image !== undefined ? (
        <Image
          source={image}
          style={{
            width: 2.2 * u,
            height: 2.2 * u,
            marginVertical: -0.4 * u,
            borderRadius: 1.1 * u,
            backgroundColor: alpha(theme.colors.text, 0.12),
          }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Text variant="button" color={fg} numberOfLines={1}>
        {children}
      </Text>
    </Focusable>
  )
}

/** A key on the on-screen keyboard: a grid cell that fills with `text` on focus. */
export function TvKey({
  children,
  onPress,
  onFocus,
  width,
  preferred,
  label,
  ref,
}: {
  children: string
  onPress: () => void
  onFocus?: () => void
  width: number
  preferred?: boolean
  label?: string
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  return (
    <Focusable
      ref={ref}
      onPress={onPress}
      onFocus={onFocus}
      preferred={preferred}
      label={label ?? children}
      ring={false}
      width={width}
      radius={0.4 * u}
    >
      {(focused) => (
        <View
          style={{
            height: 3 * u,
            borderRadius: 0.4 * u,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: focused ? theme.colors.text : alpha(theme.colors.text, 0.1),
          }}
        >
          <Text variant="button" color={focused ? 'bg' : 'text'}>
            {children}
          </Text>
        </View>
      )}
    </Focusable>
  )
}

/** A choice in a row of them: Sort's A–Z, the Unwatched filter. */
export function TvChip({
  ref,
  children,
  chosen,
  onPress,
  onFocus,
  preferred,
}: {
  ref?: Ref<ViewHandle>
  children: string
  chosen: boolean
  onPress: () => void
  onFocus?: () => void
  preferred?: boolean
}) {
  const theme = useTheme()
  const u = theme.u
  return (
    <Focusable
      ref={ref}
      onPress={onPress}
      onFocus={onFocus}
      preferred={preferred}
      selected={chosen}
      label={children}
      radius={999}
      style={{
        paddingHorizontal: 1.2 * u,
        paddingVertical: 0.45 * u,
        backgroundColor: chosen ? alpha(theme.colors.text, 0.12) : 'transparent',
      }}
    >
      <Text variant="pill" weight={600} color={chosen ? 'text' : 'text-2'}>
        {children}
      </Text>
    </Focusable>
  )
}

/** A full-screen message (unreachable, nothing here yet), with its actions. */
export function TvMessage({
  title,
  children,
  actions,
}: {
  title: string
  children?: ReactNode
  actions: ReactNode
}) {
  const u = useTheme().u
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ maxWidth: 46 * u, alignItems: 'center', gap: 1.4 * u }}>
        <Text variant="heroTitle" size={2.4} align="center" accessibilityRole="header">
          {title}
        </Text>
        {children ? (
          <Text variant="synopsis" color="text-2" align="center">
            {children}
          </Text>
        ) : null}
        <View style={{ marginTop: 1 * u, flexDirection: 'row', gap: 1 * u }}>{actions}</View>
      </View>
    </View>
  )
}
