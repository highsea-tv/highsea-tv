// SPDX-License-Identifier: AGPL-3.0-only
// The pieces every phone screen shares (mobile.md#layout): the screen itself, scrolling under a
// strip of the page's colour behind the status bar, with 16pt gutters; a large title; where Back
// goes (the button itself is the library's ghost Button); C1's frame (the Lockup over a card); an
// alert; a section's mono label; and a list row as the prototype's are drawn (a mark or icon, two
// lines, a chevron).
import { Button, Icon, type IconName, Lockup, Press, Text, tokens, useTheme } from '@highsea-tv/ui'
import { router } from 'expo-router'
import type { ComponentRef, ReactNode, Ref } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  type StyleProp,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const GUTTER = tokens.mobile.gutter

/**
 * A screen that scrolls; `tabs` leaves room for the tab bar, and `footer` stays at the bottom,
 * above the home indicator, while the rest scrolls. `aside` stays put over the right edge while
 * the page scrolls under it (Library's A–Z index).
 */
export function Screen({
  children,
  footer,
  aside,
  tabs,
  gap = 16,
  refreshing,
  onRefresh,
  padded = true,
  scrollRef,
}: {
  children: ReactNode
  footer?: ReactNode
  aside?: ReactNode
  tabs?: boolean
  gap?: number
  refreshing?: boolean
  onRefresh?: () => void
  /** Gutters on the content; off for screens whose rows scroll edge to edge. */
  padded?: boolean
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const scroller = (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 4,
        paddingBottom: footer ? 24 : (tabs ? TAB_BAR : 0) + insets.bottom + 24,
        paddingHorizontal: padded ? GUTTER : 0,
        gap,
      }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // the keyboard insets the scroller, so a field under it (Password, with large text) scrolls
      // into view (https://reactnative.dev/docs/scrollview#automaticallyadjustkeyboardinsets-ios)
      automaticallyAdjustKeyboardInsets
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors['text-3']}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  )
  // the page's colour behind the status bar, so what scrolls under it doesn't run into the clock
  // (https://developer.apple.com/design/human-interface-guidelines/status-bars)
  const bar = (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: insets.top,
        backgroundColor: theme.colors.bg,
      }}
    />
  )
  const side = aside ? (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top,
        bottom: (tabs ? TAB_BAR : 0) + insets.bottom,
        right: 0,
        justifyContent: 'center',
      }}
    >
      {aside}
    </View>
  ) : null
  if (!footer)
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        {scroller}
        {bar}
        {side}
      </View>
    )
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {scroller}
      {bar}
      <View
        style={{
          paddingHorizontal: GUTTER,
          paddingTop: 8,
          paddingBottom: tabs ? TAB_BAR + tabBarBottom(insets.bottom) : Math.max(insets.bottom, 16),
        }}
      >
        {footer}
      </View>
    </View>
  )
}

/** The tab bar's height above the home indicator (the prototype's TAB_BAR). */
export const TAB_BAR = 64

/**
 * How far the tab bar's tabs sit above the screen's bottom edge: the home indicator's inset, less
 * 16pt, since the bar's labels already have room below them and the full inset left a gap that
 * looked loose (the owner's, 2026-10-29). The labels still clear the indicator.
 */
export function tabBarBottom(inset: number) {
  return Math.max(inset - 16, 0)
}

export function Title({ children }: { children: string }) {
  return (
    <Text variant="largeTitle" accessibilityRole="header" size={28}>
      {children}
    </Text>
  )
}

/**
 * C1's frame, as the prototype's connect-flow.tsx draws it: the Lockup centred over a card (s1,
 * `line`, radius-lg, shadow-2, 12 across and 20 down) with the step's title in `title` (20pt
 * semibold) and, past the first step, Back as an arrow beside it. `flush` leaves the content's
 * sides to it, for rows that carry their own 12pt inset (Choose a server's lists).
 */
export function Flow({
  title,
  back,
  footer,
  flush,
  children,
}: {
  title: string
  back?: { label: string; run: () => void }
  footer?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <Screen gap={24} footer={footer}>
      <View style={{ alignItems: 'center', paddingTop: 16 }}>
        <Lockup size={20} />
      </View>
      <View
        style={{
          gap: 20,
          paddingHorizontal: 12,
          paddingVertical: 20,
          borderRadius: tokens.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.line,
          backgroundColor: theme.colors.s1,
          boxShadow: tokens.elevation[2].boxShadow,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          {back ? (
            <View style={{ marginStart: -8 }}>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon="arrow-left"
                accessibilityLabel={back.label}
                onPress={back.run}
              />
            </View>
          ) : null}
          <Text variant="title" weight={600} accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
        </View>
        <View style={{ gap: 16, paddingHorizontal: flush ? 0 : 12 }}>{children}</View>
      </View>
    </Screen>
  )
}

/** Back, for a screen's Back button: the screen before, or Home when there's none. */
export function goBack() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

export function Alert({ children }: { children: string }) {
  const theme = useTheme()
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
        borderRadius: tokens.radius.sm,
        backgroundColor: theme.colors['badge-danger-bg'],
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Icon name="alert" size={16} color="badge-danger" />
      <Text variant="callout" color="badge-danger" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  )
}

/** A section's label: mono, uppercase, quiet. */
export function Label({ children, aside }: { children: string; aside?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
      <Text variant="caption" mono color="text-3" style={{ textTransform: 'uppercase' }}>
        {children}
      </Text>
      {aside && <View style={{ marginStart: 'auto' }}>{aside}</View>}
    </View>
  )
}

export function Row({
  lead,
  icon,
  title,
  detail,
  onPress,
  onLongPress,
  action,
  pending,
  trailing,
  danger,
  disabled,
  mono,
  style,
}: {
  lead?: ReactNode
  icon?: IconName
  title: string
  detail?: string
  onPress?: () => void
  onLongPress?: () => void
  /** A further action VoiceOver offers in its actions rotor, as a swipe or a long press does. */
  action?: { label: string; run: () => void }
  pending?: boolean
  /** In place of the chevron. */
  trailing?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** The detail in mono, for an address. */
  mono?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityActions={action ? [{ name: 'action', label: action.label }] : undefined}
      onAccessibilityAction={action ? () => action.run() : undefined}
      style={[
        {
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {lead ?? (icon && <Icon name={icon} size={20} color={danger ? 'badge-danger' : 'text-3'} />)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="body"
          size={15}
          weight={lead ? 600 : 400}
          color={danger ? 'badge-danger' : 'text'}
          numberOfLines={1}
        >
          {title}
        </Text>
        {detail ? (
          <Text variant="callout" size={13} color="text-3" mono={mono} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {pending ? (
        <ActivityIndicator size="small" color={theme.colors['text-3']} />
      ) : (
        (trailing ??
        (onPress && !danger ? <Icon name="chevron-right" size={18} color="text-3" /> : null))
      )}
    </Press>
  )
}

/** Rows grouped on s1 with lines between them. */
export function Group({ children }: { children: ReactNode }) {
  const theme = useTheme()
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
  return (
    <View
      style={{
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: theme.colors.s1,
        overflow: 'hidden',
      }}
    >
      {items.map((child, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows are fixed
          key={i}
          style={i > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.line } : undefined}
        >
          {child}
        </View>
      ))}
    </View>
  )
}

/** Centered on the screen: a loading mark or an empty state. */
export function Center({ children }: { children?: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: GUTTER,
      }}
    >
      {children ?? <ActivityIndicator color={theme.colors['text-3']} />}
    </View>
  )
}

/**
 * Three a row on the gutter, 8pt apart (mobile.md › Layout). `inset` keeps the right edge clear
 * (for the A–Z index), and `onCell` says where each cell's top sits in the grid.
 */
export function Grid<T>({
  items,
  keyOf,
  render,
  inset = 0,
  onCell,
}: {
  items: readonly T[]
  keyOf: (item: T) => string
  render: (item: T, width: number) => ReactNode
  inset?: number
  onCell?: (item: T, y: number) => void
}) {
  const { width } = useWindowDimensions()
  const cell = Math.floor((width - GUTTER * 2 - inset - tokens.mobile.posterGap * 2) / 3)
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: tokens.mobile.posterGap,
        rowGap: 16,
      }}
    >
      {items.map((item) => (
        <View
          key={keyOf(item)}
          onLayout={onCell ? (e) => onCell(item, e.nativeEvent.layout.y) : undefined}
          style={{ width: cell }}
        >
          {render(item, cell)}
        </View>
      ))}
    </View>
  )
}
