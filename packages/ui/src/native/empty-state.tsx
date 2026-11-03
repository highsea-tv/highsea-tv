// SPDX-License-Identifier: AGPL-3.0-only
// An empty or error state: an icon in a soft disc, a title, what to do, and an action.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Icon, type IconName } from './icon.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export function EmptyState({
  icon,
  title,
  children,
  action,
  tone = 'neutral',
}: {
  icon: IconName
  title: string
  children?: string
  action?: ReactNode
  tone?: 'neutral' | 'error'
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        alignItems: 'center',
        gap: tokens.space['3'] * theme.u,
        paddingVertical: tokens.space['2'] * theme.u,
      }}
    >
      <View
        style={{
          width: 56 * theme.u,
          height: 56 * theme.u,
          borderRadius: tokens.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors[tone === 'error' ? 'badge-danger-bg' : 's2'],
        }}
      >
        <Icon name={icon} size={26} color={tone === 'error' ? 'badge-danger' : 'text-2'} />
      </View>
      <Text variant="title" align="center" accessibilityRole="header">
        {title}
      </Text>
      {children ? (
        <Text variant="callout" color="text-2" align="center" style={{ maxWidth: 320 * theme.u }}>
          {children}
        </Text>
      ) : null}
      {action ? (
        // centred, as ui-web's is: a row, since Button sets its own alignSelf (flex: 1 fills it)
        <View
          style={{
            alignSelf: 'stretch',
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: tokens.space['1'] * theme.u,
          }}
        >
          {action}
        </View>
      ) : null}
    </View>
  )
}
