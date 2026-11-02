// SPDX-License-Identifier: AGPL-3.0-only
// The owner's announcement as a card (banner.tsx in ui-web, mobile.md › Home): s1, a megaphone in
// an accent-soft disc, the title and body, an action, and Dismiss unless it must be acknowledged.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Button } from './button.tsx'
import { Icon } from './icon.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export function Banner({
  title,
  children,
  action,
  onDismiss,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
        borderWidth: 1,
        borderColor: theme.colors.line,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors['accent-soft'],
        }}
      >
        <Icon name="announcement" size={18} color="accent-text" />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text weight={600}>{title}</Text>
        {typeof children === 'string' ? (
          <Text variant="callout" color="text-2">
            {children}
          </Text>
        ) : (
          children
        )}
        {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
      </View>
      {onDismiss ? (
        <View style={{ marginTop: -8, marginRight: -8 }}>
          <Button
            variant="ghost"
            icon="close"
            iconOnly
            accessibilityLabel="Dismiss"
            onPress={onDismiss}
          />
        </View>
      ) : null}
    </View>
  )
}
