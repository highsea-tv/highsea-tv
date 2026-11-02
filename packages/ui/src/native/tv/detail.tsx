// SPDX-License-Identifier: AGPL-3.0-only
// A title page's parts on the TV (the prototype's tv/detail.tsx): the full-bleed art with its
// fades, the round actions beside Play, a person's round portrait, the cards of facts at the foot,
// and the dialog at the right of the screen that the tracks open in. They take words, artwork and
// actions as props and know nothing of a server, so any app on the TV's rule (a film's page, a
// show's, an album's) draws them.
import { Image } from 'expo-image'
import { type ReactNode, type Ref, useState } from 'react'
import { StyleSheet, TVFocusGuideView, View } from 'react-native'
import { Button } from '../button.tsx'
import type { IconName } from '../icons.ts'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { alpha } from './controls.tsx'
import { Focusable, focusShadow, type ViewHandle } from './focusable.tsx'
import type { TileSource } from './tiles.tsx'

const tv = tokens.tv

/** The art's height: one 16:9 screen, in units. */
export const BACKDROP_HEIGHT = 56.25

/**
 * The title's art, sharp and full bleed across the first screen, faded only where the words stand
 * (at the left and the foot), so the right half stays the picture's. It sits behind the page's
 * first screen and scrolls with it.
 */
export function TvBackdrop({ source }: { source: TileSource | undefined }) {
  const theme = useTheme()
  const u = theme.u
  const bg = theme.colors.bg
  const frame = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BACKDROP_HEIGHT * u,
  } as const
  return (
    <View pointerEvents="none" style={[frame, { backgroundColor: theme.colors.s1 }]}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(90deg, ${bg} 0%, ${alpha(bg, 0.85)} 22%, transparent 58%), linear-gradient(0deg, ${bg} 4%, transparent 40%)`,
          },
        ]}
      />
    </View>
  )
}

/**
 * A secondary action as an icon button beside the page's first, the same size (controls.md ›
 * Rules: controls in one row share one size), its name shown under it while it has focus and
 * always read to VoiceOver. `pressed` marks a toggle that's on (Mark as watched).
 */
export function TvRoundAction({
  icon,
  label,
  pressed,
  onPress,
  onFocus,
  ref,
}: {
  icon: IconName
  label: string
  pressed?: boolean
  onPress: () => void
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}) {
  const u = useTheme().u
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ alignItems: 'center' }}>
      <Button
        ref={ref}
        variant={pressed ? 'primary' : 'overlay'}
        icon={icon}
        iconOnly
        accessibilityLabel={label}
        onPress={onPress}
        onFocus={() => {
          setFocused(true)
          onFocus?.()
        }}
        onBlur={() => setFocused(false)}
      />
      <Text
        variant="pill"
        weight={600}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          top: '100%',
          marginTop: 0.7 * u,
          width: 20 * u,
          textAlign: 'center',
          opacity: focused ? 1 : 0,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

/** The room a row of round actions keeps under it for the name that shows on focus, in units. */
export const ROUND_ACTION_ROOM = 1.8

/** A person as a round portrait with their name and role under it: a title's cast and crew. */
export function TvPersonTile({
  name,
  role,
  photo,
  width = 8,
  onPress,
  onFocus,
  ref,
}: {
  name: string
  role: string
  photo: TileSource | undefined
  /** In units. */
  width?: number
  onPress: () => void
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const size = width * u
  return (
    <Focusable
      ref={ref}
      role="link"
      label={role ? `${name}, ${role}` : name}
      lift="poster"
      ring={false}
      onPress={onPress}
      onFocus={onFocus}
      width={size}
    >
      {(focused) => (
        <View style={{ width: size, alignItems: 'center' }}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: 'hidden',
              backgroundColor: theme.colors.s2,
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: focused
                ? focusShadow(theme.colors.text, u, theme.focusRingScale)
                : undefined,
            }}
          >
            {photo ? (
              <Image
                source={photo}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text variant="rowTitle" color="text-3">
                {initials(name)}
              </Text>
            )}
          </View>
          <Text
            variant="pill"
            weight={600}
            color={focused ? 'text' : 'text-2'}
            numberOfLines={1}
            style={{ marginTop: 0.9 * u, textAlign: 'center' }}
          >
            {name}
          </Text>
          <Text variant="pill" color="text-3" numberOfLines={1} style={{ textAlign: 'center' }}>
            {role}
          </Text>
        </View>
      )}
    </Focusable>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

/**
 * A card of words at a page's foot, a focus stop of its own so the page scrolls to it and the
 * remote can rest on it: its heading, then `children` or `facts` as label and value lines. It lifts
 * only slightly on focus, as the featured card does, and its surface steps up a level.
 */
export function TvInfoCard({
  title,
  facts,
  children,
  grow = 1,
  onFocus,
}: {
  title: string
  /** Label and value lines; a third part (a page to open) isn't drawn on the TV yet. */
  facts?: readonly (readonly [label: string, value: string, to?: string])[]
  children?: ReactNode
  /** Its share of the row's width. */
  grow?: number
  onFocus?: () => void
}) {
  const theme = useTheme()
  const u = theme.u
  const radius = tv.radius.poster * u
  return (
    <View style={{ flex: grow, minWidth: 0 }}>
      {/* biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, which has `text` */}
      <Focusable
        role="text"
        label={title}
        lift={1.015}
        radius={radius}
        onFocus={onFocus}
        style={{ flex: 1 }}
      >
        {(focused) => (
          <View
            style={{
              flex: 1,
              gap: 0.9 * u,
              padding: 1.6 * u,
              borderRadius: radius,
              backgroundColor: focused ? theme.colors.s2 : alpha(theme.colors.s1, 0.8),
            }}
          >
            <Text variant="rowTitle" accessibilityRole="header">
              {title}
            </Text>
            {children}
            {facts ? (
              <View style={{ gap: 0.5 * u }}>
                {facts.map(([k, v]) => (
                  <View key={k} style={{ flexDirection: 'row', gap: 1.2 * u }}>
                    <Text variant="meta" color="text-3" style={{ minWidth: 9 * u }}>
                      {k}
                    </Text>
                    <Text variant="meta" color="text-2" style={{ flex: 1 }}>
                      {v}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </Focusable>
    </View>
  )
}

/** A thin progress bar with the time left beside it: where a title's resume stands. */
export function TvProgressLine({
  progress,
  label,
  width = 11,
}: {
  /** 0–1. */
  progress: number
  label: string
  /** The bar's width, in units. */
  width?: number
}) {
  const theme = useTheme()
  const u = theme.u
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0.8 * u }}>
      <View
        style={{
          height: 0.3 * u,
          width: width * u,
          borderRadius: 999,
          overflow: 'hidden',
          backgroundColor: alpha(theme.colors.text, 0.2),
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
      <Text variant="pill" color="text-2">
        {label}
      </Text>
    </View>
  )
}

/**
 * A dialog at the right of the screen over a page (the tracks, a setting's choices): inset half the
 * safe area, rounded, on `s1` at 95% with a shadow, keeping focus inside it (a focus guide with
 * every trap) until Back closes it, which is the app's to wire.
 */
export function TvSideDialog({
  label,
  width = 32,
  children,
}: {
  label: string
  /** In units. */
  width?: number
  children: ReactNode
}) {
  const theme = useTheme()
  const u = theme.u
  const inset = { x: (tv.safe.x / 2) * u, y: (tv.safe.y / 2) * u }
  return (
    <TVFocusGuideView
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
      accessibilityLabel={label}
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: inset.y,
        bottom: inset.y,
        right: inset.x,
        zIndex: 30,
        width: width * u,
        gap: 1.6 * u,
        paddingHorizontal: 2.4 * u,
        paddingVertical: 2.4 * u,
        borderRadius: 1 * u,
        backgroundColor: alpha(theme.colors.s1, 0.95),
        boxShadow: tokens.elevation[4].boxShadow,
      }}
    >
      {children}
    </TVFocusGuideView>
  )
}
