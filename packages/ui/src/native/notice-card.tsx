// SPDX-License-Identifier: AGPL-3.0-only
// A notice in a list (Alerts: the owner's announcements, connectivity.md › Announcements), one part
// with a form per form factor:
// - touch and a pointer: a row on `s1`, its icon, its title with New while it's new, its body's
//   inline runs and its call to action under them (the prototypes' mobile/alerts.tsx and
//   web/alerts.tsx);
// - the TV: a card of its own that's a focus stop, so the remote moves down through a list of
//   them, its surface stepping up a level on focus (tv/alerts.tsx). A TV can't follow a link, so
//   its links are only words and it has no call to action.
// New is the library's Badge (accent, no dot). The words come from the app; the body is
// `inlineParts`'s runs, drawn by InlineText.
import type { ReactNode, Ref } from 'react'
import { View } from 'react-native'
import { Badge } from './badge.tsx'
import { Icon, type IconName } from './icon.tsx'
import { type InlineRun, InlineText } from './inline-text.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'
import { Focusable, type ViewHandle } from './tv/focusable.tsx'

export type NoticeCardProps = {
  title: string
  body: readonly InlineRun[]
  icon?: IconName
  /** Drawn in the warning colour rather than the accent's. */
  warning?: boolean
  /** A badge beside the title: "New". */
  mark?: string | null
  /** Touch and a pointer: its title's heading level (2 by default, under the page's own). */
  level?: number
  /** Touch and a pointer: its call to action under the body (a Button opening its page). */
  action?: ReactNode
  /** Touch and a pointer: a link in the body was pressed. */
  onLink?: (url: string) => void
  /** The TV: focus starts here when the screen appears. */
  preferred?: boolean
  /** The TV: it took focus. */
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}

export function NoticeCard(props: NoticeCardProps) {
  if (useTheme().formFactor.input === 'tv') return <TvNotice {...props} />
  return <Notice {...props} />
}

function Notice({
  title,
  body,
  icon = 'announcement',
  warning,
  mark,
  action,
  onLink,
  level = 2,
}: NoticeCardProps) {
  const theme = useTheme()
  const { space } = tokens
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space['3'],
        padding: space['4'],
        borderRadius: tokens.radius.md,
        backgroundColor: theme.colors.s1,
      }}
    >
      <Icon name={icon} color={warning ? 'badge-warning' : 'accent-text'} />
      <View style={{ flex: 1, minWidth: 0, gap: space['1'] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
          <Text
            variant="body"
            weight={600}
            accessibilityRole="header"
            aria-level={level}
            style={{ flexShrink: 1 }}
          >
            {title}
          </Text>
          {mark ? (
            <Badge tone="accent" dot={false}>
              {mark}
            </Badge>
          ) : null}
        </View>
        <InlineText runs={body} onLink={onLink} />
        {action ? (
          <View style={{ flexDirection: 'row', paddingTop: space['1'] }}>{action}</View>
        ) : null}
      </View>
    </View>
  )
}

function TvNotice({
  title,
  body,
  icon = 'announcement',
  warning,
  mark,
  preferred,
  onFocus,
  ref,
}: NoticeCardProps) {
  const theme = useTheme()
  const u = theme.u
  const radius = tokens.tv.radius.poster * u
  return (
    // biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, which has `text`
    <Focusable
      ref={ref}
      role="text"
      label={mark ? `${title}, ${mark}` : title}
      description={body.map((run) => run.text).join('')}
      lift="banner"
      radius={radius}
      preferred={preferred}
      onFocus={onFocus}
    >
      {(focused) => (
        <View
          style={{
            flexDirection: 'row',
            gap: tokens.tv.space['6'] * u,
            padding: tokens.tv.space['8'] * u,
            borderRadius: radius,
            backgroundColor: focused ? theme.colors.s2 : theme.colors.s1,
          }}
        >
          <View style={{ marginTop: tokens.icon.dropTv * u }}>
            <Icon
              name={icon}
              size={tokens.icon.sizeTv.max}
              color={warning ? 'badge-warning' : 'accent-text'}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: tokens.tv.space['3'] * u }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.tv.space['4'] * u }}
            >
              <Text variant="button" style={{ flexShrink: 1 }}>
                {title}
              </Text>
              {mark ? (
                <Badge tone="accent" dot={false}>
                  {mark}
                </Badge>
              ) : null}
            </View>
            <InlineText runs={body} variant="synopsis" />
          </View>
        </View>
      )}
    </Focusable>
  )
}
