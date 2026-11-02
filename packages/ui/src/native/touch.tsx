// SPDX-License-Identifier: AGPL-3.0-only
// The phone's page parts (mobile.md), drawn once here so every touch app's pages share them, as the
// TV's are in ./tv: an action named under its round icon, a person's round portrait with their
// role, and a card of facts. Each takes data and callbacks only; the app routes and words them.
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Icon, type IconName } from './icon.tsx'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

/** The round icon's size, in points: a 44-point target on its own. */
const ROUND = 44

/** `#rrggbb` with an alpha, for the tint behind a round icon. */
const tint = (hex: string, a: number) =>
  `${hex.slice(0, 7)}${Math.round(a * 255)
    .toString(16)
    .padStart(2, '0')}`

/**
 * An icon in a circle with its name under it, as the phone's streaming apps lay out a title's
 * secondary actions. With `pressed` it's a toggle (Watched), drawn filled while on.
 */
export function NamedAction({
  icon,
  label,
  pressed,
  onPress,
}: {
  icon: IconName
  label: string
  pressed?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const toggle = pressed !== undefined
  return (
    <Press
      onPress={onPress}
      haptic={toggle}
      accessibilityRole={toggle ? 'togglebutton' : 'button'}
      accessibilityLabel={label}
      accessibilityState={toggle ? { checked: pressed } : undefined}
      style={{ width: 80, alignItems: 'center', gap: 6, paddingVertical: 4 }}
    >
      <View
        style={{
          width: ROUND,
          height: ROUND,
          borderRadius: ROUND / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.colors.text : tint(theme.colors.text, 0.1),
        }}
      >
        <Icon name={icon} size={20} color={pressed ? 'bg' : 'text'} />
      </View>
      <Text variant="caption" color="text-2" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Press>
  )
}

/** A person's round portrait with their name and role under it: a title's Cast and crew. */
export function PersonTile({
  name,
  role,
  photo,
  width,
  onPress,
}: {
  name: string
  role: string
  /** The portrait, from the app's media source; nothing draws the circle alone. */
  photo: { uri: string; headers?: Record<string, string> } | undefined
  width: number
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Press
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={role ? `${name}, ${role}` : name}
      style={{ width, alignItems: 'center' }}
    >
      <View
        style={{
          width,
          height: width,
          borderRadius: width / 2,
          overflow: 'hidden',
          backgroundColor: theme.colors.s1,
        }}
      >
        {photo ? (
          <Image
            source={photo}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <Text
        variant="caption"
        weight={600}
        align="center"
        numberOfLines={1}
        style={{ marginTop: 6, width }}
      >
        {name}
      </Text>
      <Text variant="caption" color="text-3" align="center" numberOfLines={1} style={{ width }}>
        {role}
      </Text>
    </Press>
  )
}

/** A card of facts under its heading (About, Information, Languages and quality). */
export function FactsCard({
  title,
  facts,
  children,
}: {
  title: string
  /** Label and value lines. */
  facts?: readonly (readonly [label: string, value: string, to?: string])[]
  children?: ReactNode
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        gap: 8,
        padding: 16,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
      }}
    >
      <Text variant="title" size={17} accessibilityRole="header">
        {title}
      </Text>
      {children}
      {facts?.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row', gap: 16 }}>
          <Text variant="callout" color="text-3" style={{ minWidth: 96 }}>
            {label}
          </Text>
          <Text variant="callout" color="text-2" style={{ flex: 1 }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  )
}
