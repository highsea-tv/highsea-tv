// SPDX-License-Identifier: AGPL-3.0-only
// The owner's announcement as a card (banner.tsx in ui-web, mobile.md › Home): s1, a megaphone in
// an accent-soft disc, the title and body, an action, and Dismiss unless it must be acknowledged.
// Drawn at the web's measures, as the prototype's phone shows it: the `ui` size (13), a 32 disc
// with a 16 icon, and the small ghost Dismiss. The body is text, or runs of it (inline links and
// bold), which take the body's style.
import { adminText } from '@highsea-tv/tokens'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Button } from './button.tsx'
import { Icon } from './icon.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

const UI = adminText.ui

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
  const line = Math.round(UI.size * UI.leading * theme.u)
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: tokens.space['3'],
        padding: tokens.space['4'],
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
        borderWidth: 1,
        borderColor: theme.colors.line,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: tokens.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors['accent-soft'],
        }}
      >
        <Icon name="announcement" size={tokens.icon.size.sm} color="accent-text" />
      </View>
      <View style={{ flex: 1, gap: tokens.space['0.5'], paddingVertical: tokens.space['1'] }}>
        <Text size={UI.size} style={{ lineHeight: line }} weight={600}>
          {title}
        </Text>
        {children ? (
          <Text size={UI.size} style={{ lineHeight: line }} color="text-2">
            {children}
          </Text>
        ) : null}
        {action ? <View style={{ marginTop: tokens.space['2'] }}>{action}</View> : null}
      </View>
      {onDismiss ? (
        <View style={{ marginEnd: -6 }}>
          <Button
            variant="ghost"
            size="sm"
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
