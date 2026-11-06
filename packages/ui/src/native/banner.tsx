// SPDX-License-Identifier: AGPL-3.0-only
// The owner's announcement (banner.tsx in ui-web, mobile.md › Home): s1, the tone's icon in a
// soft disc, the title and body, an action, and Dismiss, or the owner's Got it when it must be
// acknowledged. Drawn at the web's measures: the `ui` size (13), a 32 disc with a 16 icon, and the
// small ghost Dismiss. `card` (the default) sits in the home feed; `bar` spans the top of an
// admin page, with its actions beside the words from a medium window up. Colour is never the only
// signal: each tone has its own icon. The body is text, or runs of it (inline links and bold),
// which take the body's style. It's a region named by its title, as the web's <section> is.

import { useT } from '@highsea-tv/i18n/react'
import { adminText, breakpoints, type ColorRole } from '@highsea-tv/tokens'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useWindowAtLeast } from './admin.tsx'
import { alpha } from './alpha.ts'
import { Button } from './button.tsx'
import { Icon, type IconName } from './icon.tsx'
import { uiMessages } from './messages.ts'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

const UI = adminText.ui

export type BannerTone = 'announcement' | 'info' | 'success' | 'warning' | 'danger'

/** Each tone's icon, its disc and icon colours, and its edge (the web's `border-<tone>/30`). */
const TONES: Record<
  BannerTone,
  { icon: IconName; disc: ColorRole; ink: ColorRole; edge: ColorRole | null; edgeAlpha: number }
> = {
  announcement: {
    icon: 'announcement',
    disc: 'accent-soft',
    ink: 'accent-text',
    edge: null,
    edgeAlpha: 1,
  },
  info: { icon: 'info', disc: 'badge-info-bg', ink: 'info', edge: 'info', edgeAlpha: 0.3 },
  success: {
    icon: 'success',
    disc: 'badge-success-bg',
    ink: 'success',
    edge: 'success',
    edgeAlpha: 0.3,
  },
  warning: {
    icon: 'warning',
    disc: 'badge-warning-bg',
    ink: 'warning',
    edge: 'warning',
    edgeAlpha: 0.3,
  },
  danger: {
    icon: 'error',
    disc: 'badge-danger-bg',
    ink: 'danger',
    edge: 'danger',
    edgeAlpha: 0.35,
  },
}

export function Banner({
  title,
  children,
  tone = 'announcement',
  variant = 'card',
  action,
  onDismiss,
  onAcknowledge,
  acknowledgeLabel,
}: {
  title: string
  children?: ReactNode
  tone?: BannerTone
  /** `card` sits in a home feed; `bar` spans the top of a page. */
  variant?: 'card' | 'bar'
  action?: ReactNode
  onDismiss?: () => void
  /** It must be acknowledged: a button, `acknowledgeLabel` (the owner's Got it), replaces Dismiss. */
  onAcknowledge?: () => void
  acknowledgeLabel?: string
}) {
  const theme = useTheme()
  const t = useT(uiMessages)
  const medium = useWindowAtLeast(breakpoints.medium)
  const line = Math.round(UI.size * UI.leading * theme.u)
  const look = TONES[tone]
  const bar = variant === 'bar'
  // a bar's actions sit beside its words from a medium window up (the web's medium:flex)
  const beside = bar && medium
  const actions =
    action || onAcknowledge ? (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          flexShrink: 0,
          gap: tokens.space['2'],
          marginTop: beside ? 0 : tokens.space['2'],
        }}
      >
        {action}
        {onAcknowledge ? (
          <Button size="sm" variant="secondary" onPress={onAcknowledge}>
            {acknowledgeLabel}
          </Button>
        ) : null}
      </View>
    ) : null
  return (
    <View
      role="region"
      aria-label={title}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: tokens.space['3'],
        paddingHorizontal: tokens.space['4'],
        paddingVertical: bar ? tokens.space['3'] : tokens.space['4'],
        borderRadius: bar ? tokens.radius.md : tokens.radius.lg,
        backgroundColor: theme.colors.s1,
        borderWidth: 1,
        borderColor: look.edge ? alpha(theme.colors[look.edge], look.edgeAlpha) : theme.colors.line,
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
          backgroundColor: theme.colors[look.disc],
        }}
      >
        <Icon name={look.icon} size={tokens.icon.size.sm} color={look.ink} />
      </View>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: beside ? 'row' : 'column',
          alignItems: beside ? 'center' : 'stretch',
          gap: beside ? tokens.space['3'] : 0,
        }}
      >
        <View
          style={{
            flex: beside ? 1 : undefined,
            minWidth: 0,
            gap: tokens.space['0.5'],
            paddingVertical: tokens.space['1'],
          }}
        >
          <Text size={UI.size} style={{ lineHeight: line }} weight={600}>
            {title}
          </Text>
          {children ? (
            <Text size={UI.size} style={{ lineHeight: line }} color="text-2">
              {children}
            </Text>
          ) : null}
        </View>
        {actions}
      </View>
      {onDismiss && !onAcknowledge ? (
        <View style={{ marginEnd: -6 }}>
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            iconOnly
            accessibilityLabel={t('dismiss')}
            onPress={onDismiss}
          />
        </View>
      ) : null}
    </View>
  )
}
