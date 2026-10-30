// SPDX-License-Identifier: AGPL-3.0-only
// An empty or error state: an icon in a soft disc, a title, what to do, and an action.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Icon, type IconName } from './icon.tsx'
import { Text } from './text.tsx'
import { useTheme } from './theme.tsx'

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
    <View style={{ alignItems: 'center', gap: 12 * theme.u, paddingVertical: 8 * theme.u }}>
      <View
        style={{
          width: 56 * theme.u,
          height: 56 * theme.u,
          borderRadius: 28 * theme.u,
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
        <View style={{ alignSelf: 'stretch', marginTop: 4 * theme.u }}>{action}</View>
      ) : null}
    </View>
  )
}
