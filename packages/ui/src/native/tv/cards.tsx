// SPDX-License-Identifier: AGPL-3.0-only
// The TV's larger parts (the prototype's tv/home.tsx and tv/settings.tsx): a menu over a page that
// a held OK opens (Continue watching's, as the Apple TV app's), a question before something that
// can't be taken back, and a notice that must be acknowledged. Each takes its words, artwork and
// actions as props, so any app on the TV's rule can draw them. The featured card is FeaturedCard's
// TV form now (../featured-card.tsx), TvFeaturedCard its old name (./aliases.ts).
import { Image } from 'expo-image'
import type { Ref } from 'react'
import { StyleSheet, View } from 'react-native'
import { alpha } from '../alpha.ts'
import { Button } from '../button.tsx'
import { Icon } from '../icon.tsx'
import type { IconName } from '../icons.ts'
import { type InlineRun, InlineText } from '../inline-text.tsx'
import { Text } from '../text.tsx'
import { useControl, useTheme } from '../theme.tsx'
import { FocusGuide } from './engine'
import { Focusable, type ViewHandle } from './focusable.tsx'
import type { TileSource } from './tiles.tsx'

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
          <Text variant="rowTitle" accessibilityRole="header" aria-level={2}>
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
          aria-level={2}
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

/** The acknowledgement's card: its width, gap, inset, title, image's gap and icon, in units. */
const ACKNOWLEDGE = {
  width: 44,
  gap: 1.4,
  pad: 2.4,
  title: 2.4,
  leading: 1.15,
  imageGap: 0.4,
  icon: 1.1,
}

/**
 * A notice that must be acknowledged, as a screen of its own over everything (the TV prototype's
 * tv/home.tsx AcknowledgeScreen): TvConfirm's card on the page's background, its image across the
 * card's top at 21:9, a line naming who it's from with the announcement's icon, its title and
 * body, and the one button that answers it. Focus starts on the button and can't leave it (a focus
 * guide with every trap), so the head behind it can't be reached; Back is the app's to wire, and
 * does nothing until it's answered. A TV can't follow a link, so the body's links are words.
 */
export function TvAcknowledge({
  eyebrow,
  title,
  body,
  image,
  action,
  onAcknowledge,
}: {
  /** Who it's from: "From the server's owner". */
  eyebrow: string
  title: string
  body: readonly InlineRun[]
  image?: TileSource
  /** The button's words: "Got it". */
  action: string
  onAcknowledge: () => void
}) {
  const theme = useTheme()
  const u = theme.u
  const pad = ACKNOWLEDGE.pad * u
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
          backgroundColor: theme.colors.bg,
        },
      ]}
    >
      <View
        style={{
          maxWidth: ACKNOWLEDGE.width * u,
          gap: ACKNOWLEDGE.gap * u,
          padding: pad,
          overflow: 'hidden',
          borderRadius: 1 * u,
          backgroundColor: theme.colors.s1,
        }}
      >
        {image ? (
          <Image
            source={image}
            style={{
              marginHorizontal: -pad,
              marginTop: -pad,
              marginBottom: ACKNOWLEDGE.imageGap * u,
              aspectRatio: 21 / 9,
            }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0.6 * u }}>
          <Icon name="announcement" size={ACKNOWLEDGE.icon} color="accent-text" />
          <Text variant="eyebrow" color="accent-text">
            {eyebrow}
          </Text>
        </View>
        <Text
          variant="heroTitle"
          size={ACKNOWLEDGE.title}
          accessibilityRole="header"
          aria-level={2}
          style={{ lineHeight: ACKNOWLEDGE.title * ACKNOWLEDGE.leading * u, letterSpacing: 0 }}
        >
          {title}
        </Text>
        <InlineText runs={body} variant="synopsis" />
        <FocusGuide
          autoFocus
          trapFocusUp
          trapFocusDown
          trapFocusLeft
          trapFocusRight
          style={{ flexDirection: 'row' }}
        >
          <Button variant="primary" hasTVPreferredFocus onPress={onAcknowledge}>
            {action}
          </Button>
        </FocusGuide>
      </View>
    </View>
  )
}

export type TvRadioOption = { value: string; label: string }

/**
 * A choice of one from a list under its heading, on the TV (a film's Audio and subtitles, and the
 * player's): each option a focus stop with the radio's role and `checked` (WAI-ARIA's radio group,
 * https://www.w3.org/WAI/ARIA/apg/patterns/radio/), a check before the one chosen, drawn inverted
 * (`text` under `bg`) while it has focus, as the TV prototype's menus draw their options.
 */
export function TvRadioGroup({
  title,
  options,
  value,
  onChange,
  preferred,
  firstRef,
}: {
  /** The group's heading, and its name to assistive tech: "Audio". */
  title: string
  options: readonly TvRadioOption[]
  /** The option chosen. */
  value: string
  onChange: (value: string) => void
  /** Focus starts on the first option when the screen appears. */
  preferred?: boolean
  /** The first option, for a screen to focus as it opens. */
  firstRef?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const m = useControl()
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ gap: m.inset }}>
      <Text variant="eyebrow" color="text-3">
        {title}
      </Text>
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <Focusable
            key={o.value}
            ref={i === 0 ? firstRef : undefined}
            role="radio"
            state={{ checked: on }}
            label={o.label}
            preferred={preferred && i === 0}
            ring={false}
            // a list's row lifts less than a button
            lift="row"
            radius={m.radius}
            onPress={() => onChange(o.value)}
          >
            {(focused) => {
              const fg = focused ? 'bg' : on ? 'text' : 'text-2'
              return (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: m.gap,
                    minHeight: m.height,
                    paddingHorizontal: m.fieldPad,
                    borderRadius: m.radius,
                    backgroundColor: focused ? theme.colors.text : 'transparent',
                  }}
                >
                  <View style={{ opacity: on ? 1 : 0 }}>
                    <Icon name="check" size={m.icon / theme.u} color={fg} />
                  </View>
                  <Text variant="button" color={fg} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {o.label}
                  </Text>
                </View>
              )
            }}
          </Focusable>
        )
      })}
    </View>
  )
}
