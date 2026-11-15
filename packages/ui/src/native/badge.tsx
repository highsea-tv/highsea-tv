// SPDX-License-Identifier: AGPL-3.0-only
// Status badges and quality pills (badge.tsx in ui-web): a dot and a label on a tinted pill, never
// colour alone (color.md › Status colors). On artwork the pill is dark glass and only the dot
// carries the tone. On the TV both are drawn in the TV's units at its own type (`pill` and
// `quality`), as the TV prototype's pills and quality tags are: the phone's points times a unit
// would draw them a screen tall.
import { badge, type ColorRole, line, tracking, tvText, webText } from '@highsea-tv/tokens'
import { View } from 'react-native'
import { glassOf } from './glass.ts'
import { Icon } from './icon.tsx'
import type { IconName } from './icons.ts'
import { OWN_SIZE } from './own-size.ts'
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

/**
 * The TV's pill, in units: the TV prototype's New mark (px-[0.6cqw] py-[0.1cqw]), its dot and
 * icon at the pill text's size.
 */
const TV_BADGE = {
  padX: tokens.tv.space['3'],
  padY: tokens.tv.space['0.5'],
  gap: tokens.tv.space['2'],
  dot: badge.dotTv,
  icon: badge.iconTv,
}
/**
 * The TV's quality tag, in units: the TV prototype's QualityTag, the web's 20 tall, 6 in and 5
 * round on its 1080p screen (where 1u is 19.2), on the TV's space and pill corner, its text at the
 * TV's `quality` with the tag's tracking.
 */
const TV_TAG = {
  height: badge.tag.heightTv,
  padX: tokens.tv.space['1.5'],
  radius: tokens.tv.radius.pill,
}
/** The TV's age rating's inset, in units (the TV prototype's px-[0.4cqw]). */
const TV_CERTIFICATION_PAD = tokens.tv.space['2']

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
  const tv = theme.formFactor.input === 'tv'
  const u = theme.u
  const dotSize = tv ? TV_BADGE.dot * u : badge.dot
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        ...OWN_SIZE,
        gap: tv ? TV_BADGE.gap * u : tokens.space['1.5'],
        paddingHorizontal: tv ? TV_BADGE.padX * u : tokens.space['2'],
        paddingVertical: tv ? TV_BADGE.padY * u : tokens.space['0.5'],
        borderRadius: tokens.radius.pill,
        backgroundColor: overlay ? glassOf(theme.colors) : theme.colors[t.bg],
      }}
    >
      {icon ? (
        <Icon
          name={icon}
          size={tv ? TV_BADGE.icon : tokens.icon.size['2xs']}
          color={overlay ? 'text' : t.fg}
        />
      ) : (
        dot && (
          <View
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: theme.colors[t.fg],
            }}
          />
        )
      )}
      <Text variant={tv ? 'pill' : 'caption'} weight={500} color={overlay ? 'text' : t.fg}>
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
  const tv = theme.formFactor.input === 'tv'
  const u = theme.u
  return (
    <View
      style={{
        height: tv ? TV_TAG.height * u : badge.tag.height,
        justifyContent: 'center',
        paddingHorizontal: tv ? TV_TAG.padX * u : tokens.space['1.5'],
        borderRadius: tv ? TV_TAG.radius * u : tokens.radius['2xs'],
        borderWidth: overlay ? 0 : line.thin,
        borderColor: theme.colors['line-strong'],
        backgroundColor: overlay ? glassOf(theme.colors) : 'transparent',
      }}
    >
      <Text
        variant={tv ? 'quality' : undefined}
        size={tv ? undefined : webText.label.size}
        mono
        weight={600}
        color={overlay ? 'text' : 'text-2'}
        style={{
          textTransform: 'uppercase',
          letterSpacing: tracking.tag * (tv ? tvText.quality.size * u : webText.label.size),
        }}
      >
        {children}
      </Text>
    </View>
  )
}

/**
 * A title's age rating (PG-13, 15) as the prototypes draw it in a title's meta line: the words in
 * `text-2` in a box edged in `text-3`, a full point wide so the edge holds on a TV across a room
 * (a hairline is half a point on a 4K Apple TV). By touch and with a pointer it's 4 in and
 * `radius.sm` round at the caption's size (mobile/detail.tsx, web/detail.tsx); on the TV 0.4u in
 * and the TV's pill corner at its `quality` size (tv/detail.tsx).
 */
export function Certification({ children }: { children: string }) {
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const u = theme.u
  return (
    // no `accessible` or label of its own: its words are its text, which VoiceOver and the web's
    // tree read alike (QualityTag's way)
    <View
      style={{
        ...OWN_SIZE,
        borderWidth: line.thin,
        borderColor: theme.colors['text-3'],
        borderRadius: tv ? tokens.tv.radius.pill * u : tokens.radius.sm,
        paddingHorizontal: tv ? TV_CERTIFICATION_PAD * u : tokens.space['1'],
      }}
    >
      <Text variant={tv ? 'quality' : 'caption'} weight={tv ? 400 : undefined} color="text-2">
        {children}
      </Text>
    </View>
  )
}
