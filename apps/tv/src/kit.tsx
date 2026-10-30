// SPDX-License-Identifier: AGPL-3.0-only
// Pieces every TV screen shares (the prototype's kit.tsx, tv.md): the server identity, the
// announcement pill, the global navigation, a screen's foot and the ambient backdrop. ui-native's
// tv/ has the focus stops, buttons and rows.
import { useAnnouncements } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import type { useMedia } from '@highsea-tv/native/media'
import { useServers } from '@highsea-tv/native/servers'
import { useMaybeSession } from '@highsea-tv/native/session'
import { Icon, Mark, Text, tokens, useTheme } from '@highsea-tv/ui-native'
import { alpha, Focusable, keptAt, TvChip, type ViewHandle } from '@highsea-tv/ui-native/tv'
import { Image } from 'expo-image'
import { type Href, router, usePathname } from 'expo-router'
import { createContext, type ReactNode, useContext, useState } from 'react'
import {
  Platform,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
  useWindowDimensions,
  View,
  type ViewProps,
} from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { library, shell } from './messages.ts'

const tv = tokens.tv

/** The kind of app the server tailors home and announcements to: one TV app, two platforms. */
export const appKind = Platform.OS === 'android' ? 'androidtv' : 'tvos'

/**
 * Top left: the server's mark and name, and "Connected remotely" under it when that's how. It sits
 * at the top of the page and scrolls away with it, so it never covers the rows.
 */
export function ServerIdentity() {
  const t = useT(shell)
  const u = useTheme().u
  const name = useServers().current?.server.name ?? ''
  const away = useMaybeSession()?.away ?? false
  return (
    <View
      style={{
        position: 'absolute',
        top: tv.safe.y * u,
        left: tv.safe.x * u,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.8 * u,
      }}
    >
      <Mark size={2} />
      <View>
        <Text variant="serverName">{name}</Text>
        {away ? (
          <Text variant="pill" color="text-2">
            {t('remotely')}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** Top right: the owner's newest announcement, as a pill. It scrolls with the page too. */
export function AnnouncementPill() {
  const theme = useTheme()
  const u = theme.u
  const a = useAnnouncements(appKind)
  if (!a.latest || a.latest.acknowledgement === 'require') return null
  return (
    <View
      style={{
        position: 'absolute',
        top: tv.safe.y * u,
        right: tv.safe.x * u,
        maxWidth: 30 * u,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.6 * u,
        borderRadius: 999,
        paddingHorizontal: 1.2 * u,
        paddingVertical: 0.5 * u,
        backgroundColor: alpha(theme.colors.s2, 0.75),
      }}
    >
      <Icon name="announcement" size={1.1} color="text-2" />
      <Text variant="pill" color="text-2" numberOfLines={1} style={{ flexShrink: 1 }}>
        {a.latest.title}
      </Text>
    </View>
  )
}

const destinations = [
  { path: '/', label: 'home' },
  { path: '/search', label: 'search' },
  { path: '/library', label: 'library' },
  { path: '/settings', label: 'settings' },
] as const

/**
 * The global navigation (client-home.md#tv): a tab row across the top that shows while focus is in
 * it, reached by Up from the hero's actions or a screen's top row, and Down leaves it again. It's
 * always laid out, faint while unfocused, since tvOS's focus engine skips views it can't see. The
 * focus engine only looks straight up from what has focus, so the guide around the tabs spans the
 * screen's width and sends focus arriving from anywhere below to the tab in use
 * (react-native-tvos's TVFocusGuideView `destinations`). A screen whose first stop isn't below the
 * tabs names it as `down` (the prototype's `down`): while focus is in the tabs, a guide under them
 * sends Down there. It's only there then, or it would catch Up on the way in.
 */
export function GlobalNav({ down }: { down?: ViewHandle | null }) {
  const t = useT(shell)
  const theme = useTheme()
  const u = theme.u
  const pathname = usePathname()
  const [inside, setInside] = useState(false)
  const [current, setCurrent] = useState<ViewHandle | null>(null)
  const active = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path))
  return (
    <TVFocusGuideView
      accessibilityRole="tablist"
      accessibilityLabel={t('main')}
      destinations={current ? [current] : []}
      onFocusEnter={() => setInside(true)}
      onFocusLeave={() => setInside(false)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        alignItems: 'center',
        paddingTop: tv.safe.y * u,
        opacity: inside ? 1 : 0.02,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 0.6 * u,
          borderRadius: 999,
          padding: 0.4 * u,
          backgroundColor: alpha(theme.colors.s2, 0.85),
        }}
      >
        {destinations.map((d) => {
          const here = active(d.path)
          return (
            <Focusable
              key={d.path}
              ref={here ? setCurrent : undefined}
              role="tab"
              selected={here}
              label={t(d.label)}
              ring={false}
              radius={999}
              onPress={() => (here ? null : router.replace(d.path as Href))}
            >
              {(focused) => (
                <View
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 1.4 * u,
                    paddingVertical: 0.5 * u,
                    backgroundColor: focused ? theme.colors.text : 'transparent',
                  }}
                >
                  <Text
                    variant="button"
                    color={focused ? 'bg' : here ? 'text' : 'text-2'}
                    numberOfLines={1}
                  >
                    {t(d.label)}
                  </Text>
                </View>
              )}
            </Focusable>
          )
        })}
      </View>
      {inside && down ? (
        <TVFocusGuideView destinations={[down]} style={{ alignSelf: 'stretch', height: 1 * u }} />
      ) : null}
    </TVFocusGuideView>
  )
}

/** A quiet line of actions at the foot of a screen: Forget this server, under sign-in. */
export function Foot({ children }: { children: ReactNode }) {
  const u = useTheme().u
  return (
    <View
      style={{
        position: 'absolute',
        bottom: tv.safe.y * u,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 1 * u,
      }}
    >
      {children}
    </View>
  )
}

/** Where a page's part lands, `keep` of the screen down, or null outside a TvPage. */
const KeepContext = createContext<number | null>(null)

/**
 * A part of a TvPage that lands as focus reaches anything in it, its centre `keep` of the way down
 * the screen (react-native-tvos's `scrollSnapOffset`, worked out from its own height). Parts don't
 * nest: the outermost one decides. Outside a page it's a plain view.
 */
export function Kept({ children, ...props }: ViewProps) {
  const keep = useContext(KeepContext)
  const { height } = useWindowDimensions()
  const [h, setH] = useState(0)
  if (keep === null) return <View {...props}>{children}</View>
  return (
    <View
      {...props}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      scrollSnapOffset={keptAt(keep, height, h)}
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
  const reduced = useReducedMotion()
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        snapToAlignment="item"
        scrollAnimationEnabled={!reduced}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <KeepContext.Provider value={keep}>{children}</KeepContext.Provider>
      </ScrollView>
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
    <TVFocusGuideView autoFocus style={{ gap: 1.6 * u }}>
      {lines.map((line, r) => (
        <Kept key={keyOf(line[0] as T)} style={{ flexDirection: 'row', gap: gap * u }}>
          {line.map((item, c) => (
            <View key={keyOf(item)}>{render(item, { index: r * columns + c, width: w })}</View>
          ))}
        </Kept>
      ))}
    </TVFocusGuideView>
  )
}

/**
 * The library's heading, with Movies or Collections beside it and, for Movies, its choices. Up
 * from the grid and Down from the navigation reach the chosen kind wherever they start, as the
 * prototype's `data-go-up="kind"`: the row is a focus guide whose destination is that chip.
 */
export function LibraryHeader({
  current,
  children,
}: {
  current: 'movies' | 'collections'
  children?: ReactNode
}) {
  const t = useT(library)
  const u = useTheme().u
  const [chosen, setChosen] = useState<ViewHandle | null>(null)
  const go = (to: 'movies' | 'collections') => {
    if (to !== current) router.replace(to === 'movies' ? '/library' : '/library/collections')
  }
  return (
    <Kept>
      <TVFocusGuideView
        destinations={chosen ? [chosen] : []}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 * u }}
      >
        <Text variant="heroTitle" size={2.6} accessibilityRole="header">
          {current === 'movies' ? t('movies') : t('collections')}
        </Text>
        <View accessibilityLabel={t('kind')} style={{ flexDirection: 'row', gap: 0.8 * u }}>
          {(['movies', 'collections'] as const).map((k) => (
            <TvChip
              key={k}
              ref={current === k ? setChosen : undefined}
              chosen={current === k}
              onPress={() => go(k)}
            >
              {t(k)}
            </TvChip>
          ))}
        </View>
        {children}
      </TVFocusGuideView>
    </Kept>
  )
}

/** Words where a grid would be, with an action under them when there is one. */
export function Words({ title, children }: { title: string; children?: ReactNode }) {
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
export function Ambient({ source }: { source: ReturnType<ReturnType<typeof useMedia>> }) {
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
