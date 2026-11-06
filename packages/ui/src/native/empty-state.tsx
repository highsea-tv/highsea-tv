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
  level = 2,
  size = 'md',
}: {
  icon: IconName
  title: string
  children?: string
  action?: ReactNode
  tone?: 'neutral' | 'error'
  /** Its title's heading level: 2 by default, under the page's; 1 when it's all a screen holds. */
  level?: number
  /**
   * `sm`: inside a widget or a panel, as the web renderer's: a 32 disc with a 16 icon, the title
   * in the admin's ui type at 600 and the words in the caption style, 8 apart, 20 above and below.
   */
  size?: 'md' | 'sm'
}) {
  const theme = useTheme()
  if (size === 'sm') return <Small {...{ icon, title, children, action, tone, level }} />
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
      <Text variant="title" align="center" accessibilityRole="header" aria-level={level}>
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

/** The small one (web/components/page.tsx's EmptyState at `sm`): for a widget's or a panel's body. */
function Small({
  icon,
  title,
  children,
  action,
  tone,
  level,
}: {
  icon: IconName
  title: string
  children?: string
  action?: ReactNode
  tone: 'neutral' | 'error'
  level: number
}) {
  const theme = useTheme()
  const error = tone === 'error'
  const ui = tokens.adminText.ui
  return (
    <View
      role={error ? 'alert' : undefined}
      style={{
        alignItems: 'center',
        gap: tokens.space['2'],
        paddingHorizontal: tokens.space['3'],
        paddingVertical: tokens.space['5'],
      }}
    >
      <View
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: tokens.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors[error ? 'badge-danger-bg' : 's2'],
        }}
      >
        <Icon name={icon} size={16} color={error ? 'danger' : 'text-3'} />
      </View>
      <View style={{ gap: tokens.space['1'], maxWidth: 440, alignItems: 'center' }}>
        <Text
          size={ui.size}
          leading={ui.leading}
          weight={600}
          align="center"
          accessibilityRole="header"
          aria-level={level}
        >
          {title}
        </Text>
        {children ? (
          <Text variant="caption" color="text-2" align="center">
            {children}
          </Text>
        ) : null}
      </View>
      {action ? (
        <View
          style={{
            alignSelf: 'stretch',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: tokens.space['2'],
            marginTop: tokens.space['1'],
          }}
        >
          {action}
        </View>
      ) : null}
    </View>
  )
}
