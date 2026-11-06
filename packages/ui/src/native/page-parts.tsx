// SPDX-License-Identifier: AGPL-3.0-only
// A title page's parts (the prototypes' mobile/detail.tsx, web/detail.tsx and tv/detail.tsx),
// each one part with a form per form factor, so a film's page, a show's or an album's draws them
// at any: an action named by its icon, a person's round portrait with their role, and a card of
// facts. Each takes data and callbacks only; the app routes and words them.
import { breakpoints } from '@highsea-tv/tokens'
import { type ReactNode, type Ref, useState } from 'react'
import { type AccessibilityState, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { alpha } from './alpha.ts'
import { ariaRole } from './aria.ts'
import { Button } from './button.tsx'
import { focusVisible } from './dom'
import { Icon, type IconName } from './icon.tsx'
import { Image } from './image.tsx'
import { useLift } from './lift.ts'
import { OWN_SIZE } from './own-size.ts'
import { Press } from './press.tsx'
import { PHONE_SECTION_TITLE } from './section-heading.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'
import { Focusable, focusShadow, type ViewHandle } from './tv/focusable.tsx'
import type { TileSource } from './tv/tiles.tsx'

const tv = tokens.tv

/** The phone's round icon, in points: touch's 44-point target on its own. */
const ROUND = tokens.targets.touch
/** The phone's action, wide enough for a two-line name (the prototype's w-20). */
const NAMED_WIDTH = 80
/** A portrait's scale under a pointer (the web prototype's hover:scale-105 on cast photos). */
const PHOTO_LIFT = 1.05
/** A search result's portrait by touch (the phone prototype's size-16), in its 72 column (w-18). */
const RESULT_PHOTO = tokens.space['16']
const RESULT_WIDTH = tokens.space['16'] + tokens.space['2']
/** The pointer's chip's portrait (the web prototype's size-8). */
const CHIP_PHOTO = tokens.space['8']
/** The room a fact's label takes before its value on the TV, in units. */
const TV_LABEL_WIDTH = 9

/** The element with focus on the web, which a control's onFocus doesn't hand on; none elsewhere. */
const activeElement = () =>
  (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement ?? null

/** The room a row of the TV's actions keeps under it for the name that shows on focus, in units. */
export const ROUND_ACTION_ROOM = 1.8

export type NamedActionProps = {
  icon: IconName
  label: string
  /** A toggle (Watched), drawn on while true. */
  pressed?: boolean
  onPress: () => void
  /** The TV: it took focus. */
  onFocus?: () => void
  /**
   * It opens a menu or a dialog (a film's Audio and subtitles): `aria-haspopup` on the web, as
   * Button's, with `accessibilityState.expanded` while it's open (WAI-ARIA's menu button pattern,
   * https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/). The tooltip stays.
   */
  hasPopup?: 'menu' | 'dialog'
  /** Whether what it opens is open (`aria-expanded` on the web). */
  accessibilityState?: Pick<AccessibilityState, 'expanded'>
  ref?: Ref<ViewHandle>
}

/**
 * A title's secondary action, named by its icon:
 * - touch: an icon in a circle with its name under it, as the phone's streaming apps lay them out;
 *   a toggle is drawn filled while on;
 * - a pointer: an overlay icon button beside Play, its name in a tooltip above it while the
 *   pointer's over it or it has focus (the web prototype's Round); a toggle says what it does
 *   next in its name, as the prototype's Watched does;
 * - the TV: an icon button the size of Play (controls.md › Rules: controls in one row share one
 *   size), its name shown under it while it has focus (as the Apple TV app's), a toggle drawn as
 *   primary while on.
 * Its name is always read to the screen reader.
 */
export function NamedAction(props: NamedActionProps) {
  const input = useTheme().formFactor.input
  if (input === 'touch') return <TouchAction {...props} />
  return <IconAction {...props} />
}

function TouchAction({
  icon,
  label,
  pressed,
  onPress,
  hasPopup,
  accessibilityState,
}: NamedActionProps) {
  const theme = useTheme()
  const toggle = pressed !== undefined
  return (
    <Press
      onPress={onPress}
      haptic={toggle}
      {...ariaRole(toggle ? 'togglebutton' : 'button', toggle ? pressed : undefined)}
      accessibilityLabel={label}
      accessibilityState={{ ...(toggle ? { checked: pressed } : null), ...accessibilityState }}
      aria-expanded={accessibilityState?.expanded}
      {...(hasPopup ? { 'aria-haspopup': hasPopup } : null)}
      style={{
        width: NAMED_WIDTH,
        alignItems: 'center',
        gap: tokens.space['1'] + tokens.space['0.5'],
        paddingVertical: tokens.space['1'],
      }}
    >
      <View
        style={{
          width: ROUND,
          height: ROUND,
          borderRadius: ROUND / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.colors.text : alpha(theme.colors.text, 0.1),
        }}
      >
        <Icon name={icon} size={tokens.icon.size.md} color={pressed ? 'bg' : 'text'} />
      </View>
      <Text variant="caption" color="text-2" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Press>
  )
}

function IconAction({
  icon,
  label,
  pressed,
  onPress,
  onFocus,
  hasPopup,
  accessibilityState,
  ref,
}: NamedActionProps) {
  const theme = useTheme()
  const u = theme.u
  const isTv = theme.formFactor.input === 'tv'
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const named = focused || hovered
  return (
    <View style={{ alignItems: 'center' }}>
      <Button
        ref={ref}
        variant={isTv && pressed ? 'primary' : 'overlay'}
        icon={icon}
        iconOnly
        accessibilityLabel={label}
        accessibilityState={
          pressed === undefined && !accessibilityState
            ? undefined
            : { ...(pressed === undefined ? null : { checked: pressed }), ...accessibilityState }
        }
        hasPopup={hasPopup}
        onPress={onPress}
        onHoverChange={setHovered}
        onFocus={() => {
          // the name shows for the keyboard's focus, not a click's (`:focus-visible`, ./dom.web.ts);
          // the TV's focus always shows
          setFocused(isTv || focusVisible(activeElement()))
          onFocus?.()
        }}
        onBlur={() => setFocused(false)}
      />
      {isTv ? (
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
            opacity: named ? 1 : 0,
          }}
        >
          {label}
        </Text>
      ) : named ? (
        // the web's Tooltip: 6 above, on s4 with its shadow, in the caption type
        <View
          pointerEvents="none"
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '100%',
            marginBottom: tokens.space['1'] + tokens.space['0.5'],
            paddingHorizontal: tokens.space['2'] + tokens.space['0.5'],
            paddingVertical: tokens.space['1'] + tokens.space['0.5'],
            borderRadius: tokens.radius.sm,
            backgroundColor: theme.colors.s4,
            boxShadow: tokens.elevation[3].boxShadow,
          }}
        >
          <Text variant="caption" numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

export type PersonTileProps = {
  name: string
  role: string
  /** The portrait, from the app's media source; without one the TV shows initials. */
  photo: TileSource | undefined
  /**
   * In the form factor's unit: points, or units on the TV (8 by default there). Off the TV,
   * without one it fills the width its parent gives it, so inside a Row, which sizes its items by
   * their content, it's required.
   */
  width?: number
  /**
   * The portrait's size, in the same unit as `width`, when it's smaller than the tile: the width
   * by default for `cast`; for `result`, 64 by touch (in its 72 column) and 32 in the pointer's
   * chip. The TV's result is a button, whose picture is the button's.
   */
  photoSize?: number
  /**
   * `cast` (the default): a title's Cast and crew, the name and role under the portrait.
   * `result`: a person in Search's results, as the prototypes' search draws them: by touch the
   * portrait in a 72 column with the name under it on up to two lines and the role read out but
   * not drawn; with a pointer a chip of the photo, the name and the role as a second line; on the
   * TV a button with the photo before the name. `width` is the touch column's, 72 by default.
   */
  layout?: 'cast' | 'result'
  /** What it's read as: `name, role` by default. Search's says whose server it's on. */
  accessibilityLabel?: string
  onPress: () => void
  /** The TV: it took focus. */
  onFocus?: () => void
  /** The TV: focus starts here when the screen appears (`hasTVPreferredFocus`): Search's first person. */
  preferred?: boolean
  ref?: Ref<ViewHandle>
}

/**
 * A person as a round portrait with their name and role under it: a title's Cast and crew. On
 * touch it's a link with no more; with a pointer the portrait's circle grows while the pointer's
 * over it, as the prototype's cast does; on the TV it's a focus stop, the portrait lifting with
 * the ring and the name turning from `text-2` to `text`. `layout="result"` draws it as Search's
 * results do instead (PersonTileProps.layout).
 */
export function PersonTile(props: PersonTileProps) {
  const input = useTheme().formFactor.input
  if (props.layout === 'result') {
    if (input === 'tv') return <TvPersonResult {...props} />
    if (input === 'pointer') return <PersonChip {...props} />
    return <PersonResult {...props} />
  }
  if (input === 'tv') return <TvPerson {...props} />
  return <Person {...props} />
}

const labelOf = ({ name, role, accessibilityLabel }: PersonTileProps) =>
  accessibilityLabel ?? (role ? `${name}, ${role}` : name)

/** Search's person by touch: the portrait, the name under it on two lines, the role only read. */
function PersonResult(props: PersonTileProps) {
  const { name, photo, width = RESULT_WIDTH, photoSize = RESULT_PHOTO, onPress } = props
  return (
    <Press
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={labelOf(props)}
      style={{ width, alignItems: 'center', gap: tokens.space['1'] }}
    >
      <Circle source={photo} size={photoSize} lifted={false} />
      <Text variant="caption" color="text-2" align="center" numberOfLines={2} style={{ width }}>
        {name}
      </Text>
    </Press>
  )
}

/**
 * Search's person with a pointer: a chip of the photo, the name and the role under it, its fill
 * a step up under the pointer (the web prototype's `hover:bg-s2`).
 */
function PersonChip(props: PersonTileProps) {
  const { name, role, photo, photoSize = CHIP_PHOTO, onPress } = props
  const theme = useTheme()
  return (
    <Press
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={labelOf(props)}
      style={(s) => ({
        ...OWN_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space['2'] + tokens.space['0.5'],
        paddingVertical: tokens.space['1'],
        paddingLeft: tokens.space['1'],
        paddingRight: tokens.space['3'] + tokens.space['0.5'],
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: s.hovered ? theme.colors.s2 : theme.colors.s1,
      })}
    >
      <Circle source={photo} size={photoSize} lifted={false} />
      <View style={{ flexShrink: 1 }}>
        <Text variant="body" numberOfLines={1}>
          {name}
        </Text>
        {role ? (
          <Text variant="caption" color="text-3" numberOfLines={1}>
            {role}
          </Text>
        ) : null}
      </View>
    </Press>
  )
}

/** Search's person on the TV: a button with the photo before the name (the TV prototype's). */
function TvPersonResult(props: PersonTileProps) {
  return (
    <Button
      ref={props.ref}
      image={props.photo}
      accessibilityLabel={labelOf(props)}
      onPress={props.onPress}
      onFocus={props.onFocus}
      hasTVPreferredFocus={props.preferred}
    >
      {props.name}
    </Button>
  )
}

function Person(props: PersonTileProps) {
  const { name, role, photo, width, photoSize, onPress } = props
  const theme = useTheme()
  const pointer = theme.formFactor.input === 'pointer'
  const size = width === undefined ? ('100%' as const) : width
  return (
    <Press
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={labelOf(props)}
      style={{ width: size, alignItems: 'center' }}
    >
      {(s) => (
        <>
          <Circle source={photo} size={photoSize ?? size} lifted={pointer && s.hovered} />
          <Text
            variant="caption"
            weight={600}
            align="center"
            numberOfLines={1}
            style={{
              marginTop: pointer ? tokens.space['2'] : tokens.space['1'] + tokens.space['0.5'],
              width: size,
            }}
          >
            {name}
          </Text>
          <Text
            variant="caption"
            color="text-3"
            align="center"
            numberOfLines={1}
            style={{ width: size }}
          >
            {role}
          </Text>
        </>
      )}
    </Press>
  )
}

/**
 * A portrait's circle, the circle itself growing while `lifted` (a pointer's over it, as the web
 * prototype's `hover:scale-105`; the keyboard's focus takes the ring and no lift).
 */
function Circle({
  source,
  size,
  lifted,
  shadow,
}: {
  source: TileSource | undefined
  size: number | '100%'
  lifted: boolean
  /** A shadow under it (a person page's portrait); React Native draws it outside the clip. */
  shadow?: string
}) {
  const theme = useTheme()
  const lift = useLift(lifted, PHOTO_LIFT)
  return (
    <Animated.View
      style={[
        {
          width: size,
          aspectRatio: 1,
          borderRadius: tokens.radius.pill,
          overflow: 'hidden',
          backgroundColor: theme.colors.s1,
          boxShadow: shadow,
        },
        lift,
      ]}
    >
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={tokens.durations.color}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </Animated.View>
  )
}

function TvPerson(props: PersonTileProps) {
  const { name, role, photo, width = 8, photoSize, onPress, onFocus, ref } = props
  const theme = useTheme()
  const u = theme.u
  const size = width * u
  const portrait = (photoSize ?? width) * u
  return (
    <Focusable
      ref={ref}
      role="link"
      label={labelOf(props)}
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
              width: portrait,
              height: portrait,
              borderRadius: portrait / 2,
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

/**
 * A person page's portrait, by the form factor (the prototypes' person headers): 128 by touch
 * (mobile/person.tsx size-32), 144 with a pointer and 192 from a medium window up (web/person.tsx
 * size-36 and medium:size-48), each over the prototypes' shadow, and on the TV 13u under the TV's
 * focus shadow, as tv/person.tsx draws it. On `s1` until the photo comes. Read by the page's
 * heading, so it's hidden from assistive tech.
 */
export function PersonPortrait({
  photo,
  size,
}: {
  photo: TileSource | undefined
  /** In the form factor's unit (units on the TV), over the defaults above. */
  size?: number
}) {
  const theme = useTheme()
  const input = theme.formFactor.input
  const { width } = useWindowDimensions()
  const p = PORTRAIT
  const drawn =
    input === 'tv'
      ? (size ?? p.tv) * theme.u
      : (size ??
        (input === 'touch' ? p.touch : width >= breakpoints.medium ? p.pointerWide : p.pointer))
  const shadow =
    input === 'tv'
      ? focusShadow(theme.colors.text, theme.u, theme.focusRingScale)
      : input === 'touch'
        ? p.touchShadow
        : p.pointerShadow
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle source={photo} size={drawn} lifted={false} shadow={shadow} />
    </View>
  )
}

/** A person page's portrait's sizes and shadows (PersonPortrait). */
const PORTRAIT = {
  touch: tokens.space['16'] * 2,
  pointer: tokens.space['12'] * 3,
  pointerWide: tokens.space['16'] * 3,
  tv: 13,
  touchShadow: '0px 8px 24px rgba(0, 0, 0, 0.35)',
  pointerShadow: '0px 8px 32px rgba(0, 0, 0, 0.35)',
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()

/** A fact: its label, its value, and a page it opens. */
export type Fact = readonly [label: string, value: string, to?: string]

export type FactsCardProps = {
  title: string
  facts?: readonly Fact[]
  children?: ReactNode
  /**
   * The TV: what `children` say, read with the title as the card's one stop. A focusable view on
   * iOS and tvOS is one accessibility element that VoiceOver reads by its label alone, not its
   * children's (React Native's `accessible`), so words drawn as children are read only from here.
   */
  says?: string
  /**
   * A fact's page opened (its third part): touch and a pointer draw those values as links, and on
   * the TV each is a focus stop of its own inside the card, which then isn't one itself.
   */
  onOpen?: (to: string) => void
  /** The TV: its share of the row's width (1 by default). */
  grow?: number
  /** The TV: it took focus. */
  onFocus?: () => void
  /** Its title's heading level (2 by default: a section of the page). */
  level?: number
}

/**
 * A card of facts under its heading at a page's foot (About, Information, Languages and quality):
 * on touch the phone's card, with a pointer the web's, a step roomier in its title and body type,
 * and on the TV a focus stop of its own so the page scrolls to it and the remote can rest on it,
 * lifting only slightly as the featured card does, its surface stepping up a level.
 */
export function FactsCard(props: FactsCardProps) {
  const input = useTheme().formFactor.input
  if (input === 'tv') return <TvFacts {...props} />
  return <Facts {...props} />
}

function Facts({ title, facts, children, onOpen, level = 2 }: FactsCardProps) {
  const theme = useTheme()
  const pointer = theme.formFactor.input === 'pointer'
  const type = pointer ? 'body' : 'callout'
  // the labels' column is as wide as its widest label, as the prototypes' grid-cols-[auto_1fr]:
  // the labels are measured in a column of their own, drawn invisibly behind the card
  const [widest, setWidest] = useState<number | null>(null)
  return (
    <View
      style={{
        gap: pointer ? tokens.space['3'] : tokens.space['2'],
        padding: pointer ? tokens.space['5'] : tokens.space['4'],
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
      }}
    >
      <Text
        variant="title"
        size={pointer ? undefined : PHONE_SECTION_TITLE}
        accessibilityRole="header"
        aria-level={level}
      >
        {title}
      </Text>
      {children}
      {facts?.length ? (
        // the prototypes' gap-y-1.5 with a pointer and gap-y-1 by touch
        <View
          style={{ gap: pointer ? tokens.space['1'] + tokens.space['0.5'] : tokens.space['1'] }}
        >
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            onLayout={(e) => setWidest(e.nativeEvent.layout.width)}
            style={{ position: 'absolute', top: 0, left: 0, opacity: 0, alignItems: 'flex-start' }}
          >
            {facts.map(([label]) => (
              <Text key={label} variant={type} numberOfLines={1}>
                {label}
              </Text>
            ))}
          </View>
          {facts.map(([label, value, to]) => (
            <View key={label} style={{ flexDirection: 'row', columnGap: tokens.space['4'] }}>
              <Text
                variant={type}
                color="text-3"
                // at least the widest label, never less than its own: react-native-web's onLayout
                // reports offsetWidth, a whole pixel (its UIManager's getRect), so a fixed width
                // could fall a fraction short of the widest label and wrap it
                style={{ minWidth: widest ?? undefined, flexShrink: 0 }}
              >
                {label}
              </Text>
              {to && onOpen ? (
                <Press
                  accessibilityRole="link"
                  onPress={() => onOpen(to)}
                  style={{ flex: 1, alignItems: 'flex-start' }}
                >
                  {(s) => (
                    // the prototypes' link: `text`, underlined in `text-3`, the line turning
                    // `text` under a pointer
                    <Text
                      variant={type}
                      style={{
                        textDecorationLine: 'underline',
                        textDecorationColor: s.hovered ? theme.colors.text : theme.colors['text-3'],
                      }}
                    >
                      {value}
                    </Text>
                  )}
                </Press>
              ) : (
                <Text variant={type} color="text-2" style={{ flex: 1 }}>
                  {value}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function TvFacts({
  title,
  facts,
  children,
  says,
  grow = 1,
  onFocus,
  onOpen,
  level = 2,
}: FactsCardProps) {
  const theme = useTheme()
  const u = theme.u
  const radius = tv.radius.poster * u
  const linked = !!onOpen && !!facts?.some(([, , to]) => to)
  // a card with links is no stop of its own: its links are (the TV prototype's Facts, each link
  // `data-focusable` inside the card), and the card steps up while one of them has focus
  const [inside, setInside] = useState(false)
  const card = (focused: boolean) => (
    <View
      style={{
        flex: 1,
        gap: 0.9 * u,
        padding: 1.6 * u,
        borderRadius: radius,
        backgroundColor: focused ? theme.colors.s2 : alpha(theme.colors.s1, 0.8),
      }}
    >
      <Text variant="rowTitle" accessibilityRole="header" aria-level={level}>
        {title}
      </Text>
      {children}
      {facts ? (
        <View style={{ gap: 0.5 * u }}>
          {facts.map(([k, v, to]) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 1.2 * u }}>
              <Text variant="meta" color="text-3" style={{ minWidth: TV_LABEL_WIDTH * u }}>
                {k}
              </Text>
              {to && onOpen ? (
                <View style={{ flex: 1, alignItems: 'flex-start' }}>
                  <TvFactLink
                    value={v}
                    onPress={() => onOpen(to)}
                    onFocus={() => {
                      setInside(true)
                      onFocus?.()
                    }}
                    onBlur={() => setInside(false)}
                  />
                </View>
              ) : (
                <Text variant="meta" color="text-2" style={{ flex: 1 }}>
                  {v}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
  if (linked)
    return (
      <View role="group" accessibilityLabel={title} style={{ flex: grow, minWidth: 0 }}>
        {card(inside)}
      </View>
    )
  return (
    <View style={{ flex: grow, minWidth: 0 }}>
      {/* biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, which has `text` */}
      <Focusable
        role="text"
        label={title}
        description={[says, facts?.map(([k, v]) => `${k}: ${v}`).join(', ')]
          .filter(Boolean)
          .join(', ')}
        lift="banner"
        radius={radius}
        onFocus={onFocus}
        style={{ flex: 1 }}
      >
        {card}
      </Focusable>
    </View>
  )
}

/** A fact's link inside a TV card (the prototype's `quiet` text): it lifts and inverts on focus. */
const TV_LINK = { pad: 0.6, padY: 0.2, radius: 0.4 }

function TvFactLink({
  value,
  onPress,
  onFocus,
  onBlur,
}: {
  value: string
  onPress: () => void
  onFocus: () => void
  onBlur: () => void
}) {
  const theme = useTheme()
  const u = theme.u
  return (
    <Focusable
      role="link"
      label={value}
      ring={false}
      radius={TV_LINK.radius * u}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {(focused) => (
        <View
          style={{
            marginHorizontal: -TV_LINK.pad * u,
            paddingHorizontal: TV_LINK.pad * u,
            paddingVertical: TV_LINK.padY * u,
            borderRadius: TV_LINK.radius * u,
            backgroundColor: focused ? theme.colors.text : 'transparent',
          }}
        >
          <Text variant="meta" color={focused ? 'bg' : 'text'}>
            {value}
          </Text>
        </View>
      )}
    </Focusable>
  )
}
