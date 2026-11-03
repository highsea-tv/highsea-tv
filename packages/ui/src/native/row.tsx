// SPDX-License-Identifier: AGPL-3.0-only
// A row (mobile.md › Layout): its title, then items scrolling edge to edge with the first one on
// the 16pt gutter, 8pt apart; posters about 30% of the row's width, so three show and a peek.
import { formFactorLayouts } from '@highsea-tv/tokens'
import type { ReactNode } from 'react'
import { FlatList, useWindowDimensions, View } from 'react-native'
import { Text } from './text.tsx'
import { tokens } from './theme.tsx'

const { gutter, posterGap } = tokens.mobile

/**
 * The width of one poster in a row on this screen: a share of the row inside its gutters, as the
 * prototype's `w-[30%]` is of its padded list. The phone's own share is its layout's.
 */
export function usePosterWidth(share: number = formFactorLayouts['compact-touch'].itemShare) {
  return Math.round((useWindowDimensions().width - gutter * 2) * share)
}

export function Row<T>({
  title,
  items,
  keyOf,
  render,
  action,
  suffix,
  itemWidth,
}: {
  title: string
  /** Quieter words after the title (a spotlight's "because you watched"). */
  suffix?: string | null
  /** Each item's width, so a fling stops with an item on the gutter. */
  itemWidth?: number
  items: readonly T[]
  keyOf: (item: T) => string
  render: (item: T) => ReactNode
  action?: ReactNode
}) {
  return (
    <View style={{ gap: 10 }} accessibilityRole="list" accessibilityLabel={title}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: gutter,
          minHeight: 28,
        }}
      >
        <Text variant="title" size={17} accessibilityRole="header" style={{ flex: 1 }}>
          {title}
          {suffix ? (
            <Text variant="title" size={17} weight={400} color="text-2">
              {` ${suffix}`}
            </Text>
          ) : null}
        </Text>
        {action}
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={keyOf}
        renderItem={({ item }) => <>{render(item)}</>}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: posterGap }}
        initialNumToRender={6}
        {...(itemWidth
          ? { snapToInterval: itemWidth + posterGap, decelerationRate: 'fast' as const }
          : {})}
      />
    </View>
  )
}
