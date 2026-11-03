// SPDX-License-Identifier: AGPL-3.0-only
// Status badges and quality pills (badge.tsx in ui-web): a dot and a label on a tinted pill, never
// colour alone (color.md › Status colors). On artwork the pill is dark glass and only the dot
// carries the tone.
import type { ColorRole } from '@highsea-tv/tokens'
import { View } from 'react-native'
import { Icon } from './icon.tsx'
import type { IconName } from './icons.ts'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<BadgeTone, { bg: ColorRole; fg: ColorRole }> = {
  neutral: { bg: 's3', fg: 'text-2' },
  accent: { bg: 'accent-soft', fg: 'accent-text' },
  success: { bg: 'badge-success-bg', fg: 'badge-success' },
  warning: { bg: 'badge-warning-bg', fg: 'badge-warning' },
  danger: { bg: 'badge-danger-bg', fg: 'badge-danger' },
  info: { bg: 'badge-info-bg', fg: 'badge-info' },
}

const glass = 'rgba(11,11,12,0.62)'

export function Badge({
  children,
  tone = 'neutral',
  dot = true,
  overlay,
  icon,
}: {
  children: string
  tone?: BadgeTone
  dot?: boolean
  overlay?: boolean
  /** In place of the dot (a smart collection's filter). */
  icon?: IconName
}) {
  const theme = useTheme()
  const t = tones[tone]
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6 * theme.u,
        paddingHorizontal: tokens.space['2'] * theme.u,
        paddingVertical: tokens.space['0.5'] * theme.u,
        borderRadius: tokens.radius.pill,
        backgroundColor: overlay ? glass : theme.colors[t.bg],
      }}
    >
      {icon ? (
        <Icon name={icon} size={12 * theme.u} color={overlay ? 'text' : t.fg} />
      ) : (
        dot && (
          <View
            style={{
              width: 6 * theme.u,
              height: 6 * theme.u,
              borderRadius: 3 * theme.u,
              backgroundColor: theme.colors[t.fg],
            }}
          />
        )
      )}
      <Text variant="caption" weight={500} color={overlay ? 'text' : t.fg}>
        {children}
      </Text>
    </View>
  )
}

/**
 * A quality marker (4K, HDR), as ui-web's QualityTag: 20 tall, mono semibold 11 in capitals with
 * the web's 0.04em tracking, on glass over artwork (`overlay`, as posters have it) or edged in
 * `line-strong` on the page.
 */
export function QualityTag({ children, overlay = true }: { children: string; overlay?: boolean }) {
  const theme = useTheme()
  return (
    <View
      style={{
        height: 20 * theme.u,
        justifyContent: 'center',
        paddingHorizontal: 6 * theme.u,
        borderRadius: 5 * theme.u,
        borderWidth: overlay ? 0 : 1,
        borderColor: theme.colors['line-strong'],
        backgroundColor: overlay ? glass : 'transparent',
      }}
    >
      <Text
        size={11}
        mono
        weight={600}
        color={overlay ? 'text' : 'text-2'}
        style={{ textTransform: 'uppercase', letterSpacing: 0.44 * theme.u }}
      >
        {children}
      </Text>
    </View>
  )
}
