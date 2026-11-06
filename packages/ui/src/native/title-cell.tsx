// SPDX-License-Identifier: AGPL-3.0-only
// A title cell (the web's TitleCell): a title, a mono detail under it, and the thumbnail before
// them, 2:3 for films and shows and square for songs and albums (design system 1.1's wishes from
// stage 6). Both shapes are the same height, the control's height and its inset either side, so a
// list mixing films and songs keeps its rows even. The thumbnail is decorative: the title names the
// row. Artwork is decoded at display size by expo-image (https://docs.expo.dev/versions/latest/sdk/image/).

import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Image } from './image.tsx'
import { Text } from './text.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'
import { Tooltip } from './tooltip.tsx'

export type TitleCellProps = {
  title: ReactNode
  /** The release name, a path or an artist: one line in mono `text-3`. */
  detail?: string
  /** A thumbnail before the title, for rows that are media items. */
  art?: string | { uri: string; headers?: Record<string, string> } | null
  /** The thumbnail's shape: a poster (2:3) for films and shows, square for songs and albums. */
  aspect?: 'poster' | 'square'
}

const ratio = ([w, h]: readonly [number, number]) => w / h

export function TitleCell({ title, detail, art, aspect = 'poster' }: TitleCellProps) {
  const theme = useTheme()
  const m = useControl()
  const height = m.height + m.inset * 2
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.fieldPad,
        // shrinks in a cell cut to fit (TableCell's truncate): a View doesn't by default
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      {art === undefined ? null : (
        <View
          style={{
            height,
            aspectRatio: ratio(tokens.aspect[aspect]),
            borderRadius: m.radius - m.inset,
            overflow: 'hidden',
            backgroundColor: theme.colors.s3,
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {art ? (
            <Image
              source={art}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1}>{title}</Text>
        {detail ? (
          <Tooltip content={detail} whenTruncated>
            <Text variant="caption" mono color="text-3" numberOfLines={1}>
              {detail}
            </Text>
          </Tooltip>
        ) : null}
      </View>
    </View>
  )
}
