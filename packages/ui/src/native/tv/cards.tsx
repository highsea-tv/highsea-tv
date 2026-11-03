// SPDX-License-Identifier: AGPL-3.0-only
// The TV's larger parts (the prototype's tv/home.tsx and tv/settings.tsx): the featured card
// across a page, a menu over a page that a held OK opens (Continue watching's, as the Apple TV
// app's), and a question before something that can't be taken back. Each takes its words, artwork
// and actions as props, so any app on the TV's rule can draw them.
import { Image } from 'expo-image'
import type { Ref } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from '../button.tsx'
import { Icon } from '../icon.tsx'
import type { IconName } from '../icons.ts'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { alpha } from './controls.tsx'
import { FocusGuide } from './engine'
import { Focusable, type ViewHandle } from './focusable.tsx'
import type { TileSource } from './tiles.tsx'

/** The featured card's height and corner, in units. */
const FEATURED = { height: 40.5, radius: 1.4 }

/**
 * The featured title as one large card across the page, lifting only slightly on focus (at this
 * size a poster's lift would push it off the screen): its backdrop, with the title, the details
 * and the tagline low on the left. OK does `onPress`; on Home it opens the film.
 */
export function TvFeaturedCard({
  title,
  meta,
  tagline,
  backdrop,
  onPress,
  preferred,
  onFocus,
  ref,
}: {
  title: string
  meta: string
  tagline: string
  backdrop: TileSource | undefined
  onPress: () => void
  preferred?: boolean
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const radius = FEATURED.radius * u
  return (
    <Focusable
      ref={ref}
      role="link"
      label={`${title}, ${meta}`}
      lift={1.015}
      radius={radius}
      preferred={preferred}
      onFocus={onFocus}
      onPress={onPress}
    >
      <View
        style={{
          height: FEATURED.height * u,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: theme.colors.s2,
        }}
      >
        {backdrop ? (
          <Image
            source={backdrop}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              experimental_backgroundImage:
                'linear-gradient(90deg, rgba(0,0,0,0.7), transparent 55%), linear-gradient(0deg, rgba(0,0,0,0.6), transparent 45%)',
            },
          ]}
        />
        <View
          style={{
            position: 'absolute',
            left: 2.8 * u,
            bottom: 2.8 * u,
            maxWidth: 34 * u,
            gap: 0.8 * u,
          }}
        >
          {/* the title, where the prototype has its logo: no server has logos yet */}
          <Text variant="heroTitle" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          <Text variant="meta" color="text-2">
            {meta}
          </Text>
          <Text variant="synopsis" color="text-2" numberOfLines={2}>
            {tagline}
          </Text>
        </View>
      </View>
    </Focusable>
  )
}

export type TvMenuOption = {
  label: string
  icon?: IconName
  /** The choice in force: it's marked, and focus starts on it. */
  current?: boolean
  onPress: () => void
}

/**
 * A menu over the page: its title, a line under it, and its options as buttons, in `columns` when
 * there are many (a library's genres, three across), focus starting on the one in force or the
 * first and kept inside (a focus guide with every trap). The page dims under it. Back is the app's
 * to wire: it closes the menu.
 */
export function TvMenu({
  title,
  detail,
  options,
  columns = 1,
}: {
  title: string
  detail?: string | null
  options: TvMenuOption[]
  columns?: number
}) {
  const theme = useTheme()
  const u = theme.u
  const width = 30 * u
  const gap = 0.6 * u
  const start = Math.max(
    0,
    options.findIndex((o) => o.current),
  )
  // a menu in columns gives each 20u, so three fit beside each other with room around them
  const across = columns > 1 ? columns * 20 * u + (columns - 1) * gap : width
  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={title}
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
      ]}
    >
      <View style={{ width: columns > 1 ? across : width, maxWidth: '90%', gap: 1.2 * u }}>
        <View style={{ gap: 0.3 * u }}>
          <Text variant="rowTitle" accessibilityRole="header">
            {title}
          </Text>
          {detail ? (
            <Text variant="meta" color="text-2">
              {detail}
            </Text>
          ) : null}
        </View>
        <FocusGuide
          autoFocus
          trapFocusUp
          trapFocusDown
          trapFocusLeft
          trapFocusRight
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}
        >
          {options.map((o, i) => (
            <View
              key={o.label}
              style={{ width: columns > 1 ? (across - (columns - 1) * gap) / columns : '100%' }}
            >
              <Button
                variant={o.current ? 'primary' : 'overlay'}
                icon={o.icon ?? (o.current ? 'check' : undefined)}
                hasTVPreferredFocus={i === start}
                block
                onPress={o.onPress}
              >
                {o.label}
              </Button>
            </View>
          ))}
        </FocusGuide>
      </View>
    </View>
  )
}

/**
 * A question over the page before something that can't be taken back (signing out, a device):
 * its title and body, then Cancel first, so OK by accident changes nothing, and the action. Focus
 * stays inside it; Back is the app's to wire, and cancels.
 */
export function TvConfirm({
  title,
  body,
  cancel,
  action,
  icon,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  cancel: string
  action: string
  icon?: IconName
  onCancel: () => void
  onConfirm: () => void
}) {
  const theme = useTheme()
  const u = theme.u
  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={title}
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 40,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: alpha(theme.colors.bg, 0.8),
        },
      ]}
    >
      <View
        style={{
          maxWidth: 40 * u,
          alignItems: 'center',
          gap: 1.4 * u,
          padding: 2.4 * u,
          borderRadius: 1 * u,
          backgroundColor: theme.colors.s1,
        }}
      >
        <Text
          variant="heroTitle"
          size={2.2}
          accessibilityRole="header"
          style={{ textAlign: 'center' }}
        >
          {title}
        </Text>
        <Text variant="synopsis" color="text-2" style={{ textAlign: 'center' }}>
          {body}
        </Text>
        <FocusGuide
          autoFocus
          trapFocusUp
          trapFocusDown
          trapFocusLeft
          trapFocusRight
          style={{ flexDirection: 'row', gap: 1 * u }}
        >
          <Button variant="overlay" hasTVPreferredFocus onPress={onCancel}>
            {cancel}
          </Button>
          <Button variant="primary" icon={icon} onPress={onConfirm}>
            {action}
          </Button>
        </FocusGuide>
      </View>
    </View>
  )
}

/** A run of a notice's body, as `@highsea-tv/client/format`'s `inlineParts` splits it. */
export type TvInlineRun = { kind: 'text' | 'bold' | 'italic' | 'link'; text: string }

/**
 * A notice as a card in a list (the TV's Alerts): its icon, its title with a mark while it's new,
 * and its body, the bold and italic runs drawn as such and a link as its words, since a TV can't
 * follow one. A focus stop of its own, so the remote moves down through a list of them.
 */
export function TvNoticeCard({
  title,
  body,
  icon = 'announcement',
  warning,
  mark,
  preferred,
  onFocus,
  ref,
}: {
  title: string
  body: readonly TvInlineRun[]
  icon?: IconName
  /** Drawn in the warning colour rather than the accent's. */
  warning?: boolean
  /** A pill beside the title: "New". */
  mark?: string | null
  preferred?: boolean
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const radius = tokens.tv.radius.poster * u
  return (
    // biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, which has `text`
    <Focusable
      ref={ref}
      role="text"
      label={mark ? `${title}, ${mark}` : title}
      lift={1.015}
      radius={radius}
      preferred={preferred}
      onFocus={onFocus}
    >
      {(focused) => (
        <View
          style={{
            flexDirection: 'row',
            gap: 1.2 * u,
            padding: 1.6 * u,
            borderRadius: radius,
            backgroundColor: focused ? theme.colors.s2 : theme.colors.s1,
          }}
        >
          <View style={{ marginTop: 0.2 * u }}>
            <Icon
              name={icon}
              size={tokens.icon.sizeTv.max}
              color={warning ? 'badge-warning' : 'accent-text'}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 0.6 * u }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0.8 * u }}>
              <Text variant="button" style={{ flexShrink: 1 }}>
                {title}
              </Text>
              {mark ? (
                <View
                  style={{
                    borderRadius: tokens.radius.pill,
                    paddingHorizontal: 0.6 * u,
                    paddingVertical: 0.1 * u,
                    backgroundColor: theme.colors['accent-soft'],
                  }}
                >
                  <Text variant="pill" color="accent-text">
                    {mark}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="synopsis" color="text-2">
              {body.map((r, i) => (
                <Text
                  // biome-ignore lint/suspicious/noArrayIndexKey: the runs are stable for a given body
                  key={i}
                  variant="synopsis"
                  color={r.kind === 'text' || r.kind === 'italic' ? 'text-2' : 'text'}
                  weight={r.kind === 'bold' ? 600 : undefined}
                  style={r.kind === 'italic' ? { fontStyle: 'italic' } : undefined}
                >
                  {r.text}
                </Text>
              ))}
            </Text>
          </View>
        </View>
      )}
    </Focusable>
  )
}
