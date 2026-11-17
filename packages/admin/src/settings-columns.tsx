'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// What Settings › General, Appearance, Playback and Download client share, drawn with the library's
// native renderer since D3 (one-client-platform-d.md): fields side by side in a regular window, each
// its share of the row (the web's `grid items-start gap-4 medium:grid-cols-*`), and a link out to
// a page in a new tab with the external icon (the web's `target="_blank"` link), which it says.
import { Icon, Press, Text, tokens, useRegularWindow, useTheme } from '@highsea-tv/ui/native'
import { Children, type ReactNode } from 'react'
import { View } from 'react-native'

const s = tokens.space
const ui = tokens.adminText.ui

/**
 * Fields side by side in a regular window, 16 apart and aligned at their tops, each its share of
 * the row; one above the other in a compact one. A `null` child keeps its share empty.
 */
export function Columns({ shares, children }: { shares: number[]; children: ReactNode }) {
  const beside = useRegularWindow()
  const cells = Children.toArray(children)
  return (
    <View
      style={{ flexDirection: beside ? 'row' : 'column', alignItems: 'flex-start', gap: s['4'] }}
    >
      {shares.map((share, i) =>
        cells[i] === undefined && !beside ? null : (
          <View
            // a column is its place in the row, which never changes
            // biome-ignore lint/suspicious/noArrayIndexKey: the columns are fixed
            key={i}
            style={beside ? { flex: share, minWidth: 0 } : { alignSelf: 'stretch' }}
          >
            {cells[i]}
          </View>
        ),
      )}
    </View>
  )
}

/**
 * A link to a page outside highsea, opening in a new tab, in the admin's ui type: `text`, underlined,
 * with a small external icon in text-3 (a guide's link), or `accent`, in the accent's text colour,
 * underlined on hover, its icon a little larger in the same colour (a service's key page).
 */
export function ExternalLink({
  href,
  children,
  opensNewTab,
  look = 'text',
}: {
  href: string
  children: string
  /** What's read after its words: that it opens in a new tab. */
  opensNewTab?: string
  look?: 'text' | 'accent'
}) {
  const { colors } = useTheme()
  const accent = look === 'accent'
  return (
    <Press
      role="link"
      {...({ href, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object)}
      accessibilityLabel={opensNewTab ? `${children} ${opensNewTab}` : undefined}
      style={{ alignSelf: 'flex-start', borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: accent ? s['1'] + s['0.5'] : s['1'],
          }}
        >
          <Text
            size={ui.size}
            leading={ui.leading}
            color={accent ? 'accent-text' : 'text'}
            style={
              accent
                ? { textDecorationLine: hovered ? 'underline' : 'none' }
                : {
                    textDecorationLine: 'underline',
                    textDecorationColor: hovered ? colors.text : colors['text-3'],
                  }
            }
          >
            {children}
          </Text>
          <Icon
            name="external"
            size={accent ? tokens.icon.size.xs : tokens.icon.size['2xs']}
            color={accent ? 'accent-text' : 'text-3'}
          />
        </View>
      )}
    </Press>
  )
}
