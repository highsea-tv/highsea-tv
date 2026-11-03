// SPDX-License-Identifier: AGPL-3.0-only
// A TV page's furniture (the prototype's kit.tsx): a page that scrolls to follow focus, the parts
// in it that land where focus needs them, a grid of tiles, words where a grid would be, and the
// ambient backdrop. None of it knows an app's data, so every app on the TV's rule shares it. In a
// browser, the engine pair (./engine.web.tsx) lands Kept parts and follows focus the same way.
import { Image } from 'expo-image'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { StyleSheet, useWindowDimensions, View, type ViewProps } from 'react-native'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { alpha } from './controls.tsx'
import { FocusGuide, keptProps, TvScroll } from './engine'
import { keptAt } from './model.ts'
import type { TileSource } from './tiles.tsx'

const tv = tokens.tv

/** Where a page's part lands, `keep` of the screen down, or null outside a TvPage. */
const KeepContext = createContext<number | null>(null)

/**
 * A part of a TvPage that lands as focus reaches anything in it, its centre `keep` of the way down
 * the screen (react-native-tvos's `scrollSnapOffset`, worked out from its own height). Parts don't
 * nest: the outermost one decides. Outside a page it's a plain view. A part on the first screen can
 * `rest` instead: the page goes back to its top, as Home's does for the hero, since landing it a
 * screen down asks for a scroll above the top, which the page never goes past.
 */
export function Kept({ rest, children, ...props }: ViewProps & { rest?: boolean }) {
  const keep = useContext(KeepContext)
  const { height } = useWindowDimensions()
  const [h, setH] = useState(0)
  if (keep === null) return <View {...props}>{children}</View>
  return (
    <View
      {...props}
      {...keptProps(rest === true)}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      scrollSnapOffset={rest ? height : keptAt(keep, height, h)}
    >
      {children}
    </View>
  )
}

/**
 * A page that scrolls to follow focus (tv.md › Scrolling): a scroll view, so tvOS's focus engine
 * reaches what's below the screen, that lands each Kept part with its centre `keep` of the way down
 * the screen and never scrolls past either end (react-native-tvos's `snapToAlignment="item"`).
 * The top 3.2u fades into the background, as the prototype's mask, or `fade` units for a page that
 * starts that far down its frame.
 */
export function TvPage({
  keep,
  fade = 3.2,
  children,
}: {
  keep: number
  fade?: number
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <View style={{ flex: 1 }}>
      <TvScroll keep={keep} style={{ flex: 1 }}>
        <KeepContext.Provider value={keep}>{children}</KeepContext.Provider>
      </TvScroll>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: fade * theme.u,
          experimental_backgroundImage: `linear-gradient(180deg, ${theme.colors.bg}, transparent)`,
        }}
      />
    </View>
  )
}

/**
 * A grid of tiles, seven a row across the safe area (the prototype's grid-cols-7), or `columns`
 * across `span` units, each row Kept as focus reaches it. `render` gets the tile's width in units.
 */
export function TvGrid<T>({
  items,
  keyOf,
  render,
  columns = 7,
  span,
}: {
  items: T[]
  keyOf: (item: T) => string | number
  render: (item: T, at: { index: number; width: number }) => ReactNode
  columns?: number
  span?: number
}) {
  const u = useTheme().u
  const { width } = useWindowDimensions()
  const gap = tv.poster.gap
  const across = span ?? width / u - 2 * tv.safe.x
  const w = (across - (columns - 1) * gap) / columns
  const lines: T[][] = []
  for (let i = 0; i < items.length; i += columns) lines.push(items.slice(i, i + columns))
  return (
    <FocusGuide autoFocus style={{ gap: 1.6 * u }}>
      {lines.map((line, r) => (
        <Kept key={keyOf(line[0] as T)} style={{ flexDirection: 'row', gap: gap * u }}>
          {line.map((item, c) => (
            <View key={keyOf(item)}>{render(item, { index: r * columns + c, width: w })}</View>
          ))}
        </Kept>
      ))}
    </FocusGuide>
  )
}

/** Words where a grid would be, with an action under them when there is one. */
export function TvWords({ title, children }: { title: string; children?: ReactNode }) {
  const u = useTheme().u
  return (
    <View style={{ gap: 1.2 * u, paddingTop: 2 * u, alignItems: 'flex-start' }}>
      <Text variant="synopsis" color="text-2">
        {title}
      </Text>
      {typeof children === 'string' ? (
        <Text variant="meta" color="text-3">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  )
}

/** The artwork, blurred and dimmed behind the page, and darker toward the words. */
export function TvAmbient({ source }: { source: TileSource | undefined }) {
  const theme = useTheme()
  const u = theme.u
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {source ? (
        <Image
          source={source}
          style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.1 }] }]}
          contentFit="cover"
          blurRadius={tv.ambientBlur * u}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha('#000000', 0.55) }]} />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(90deg, ${theme.colors.bg} 10%, transparent 70%)`,
          },
        ]}
      />
    </View>
  )
}
