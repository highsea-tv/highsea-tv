// SPDX-License-Identifier: AGPL-3.0-only
// The admin's own parts (admin.md › Shell), drawn once in the library (one-client-platform-d.md ›
// D1) at the web renderer's sizes (web/components/sidebar.tsx, status-bar.tsx and page.tsx), so
// the admin on Next.js and its prototype draw the same thing through react-native-web: the
// sidebar with its groups, items and server card; the page's top row with the search that opens
// the command palette; and the status bar along the bottom. The admin is drawn with a pointer,
// at the admin's denser type (tokens.adminText) and sizes (tokens.density).
// A link is a Press with `href`, which react-native-web writes as an `<a>` (its View's `href`,
// https://necolas.github.io/react-native-web/docs/view/#href), so a browser can open it in a new
// tab and the host's router can take the click; `onPress` runs as well.
import {
  type ColorRole,
  line,
  REGULAR_WIDTH,
  searchTrigger,
  serverCard,
  sidebar,
  statusBar,
  webText,
  wrapBasis,
} from '@highsea-tv/tokens'
import { type ReactNode, useState, useSyncExternalStore } from 'react'
import { Dimensions, View } from 'react-native'
import { alpha } from './alpha.ts'
import { visuallyHidden } from './hidden-heading.tsx'
import { Icon } from './icon.tsx'
import type { IconName } from './icons.ts'
import { Image } from './image.tsx'
import { OWN_SIZE } from './own-size.ts'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'
import { webTitle } from './web-title.ts'

const ui = tokens.adminText.ui
const s = tokens.space

/** react-native-web's link props, which React Native's types don't name. */
const linkTo = (href: string | undefined) => (href ? ({ href } as object) : null)

// ---------------------------------------------------------------- the window's width

function subscribeWindow(change: () => void) {
  const subscription = Dimensions.addEventListener('change', change)
  return () => subscription.remove()
}

/**
 * Whether the window is at least `width` wide, through Dimensions as the ThemeProvider reads it.
 * A page rendered on the server takes it as wide enough, and the browser corrects it after
 * hydrating (https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
 */
export function useWindowAtLeast(width: number): boolean {
  return useSyncExternalStore(
    subscribeWindow,
    () => Dimensions.get('window').width >= width,
    () => true,
  )
}

/**
 * Whether the window is regular: at least the form-factor rule's one split (`REGULAR_WIDTH`, 768,
 * spacing-layout.md), where every client and the admin leave their compact layout.
 */
export function useRegularWindow(): boolean {
  return useWindowAtLeast(REGULAR_WIDTH)
}

// ---------------------------------------------------------------- the sidebar

export type SidebarProps = {
  /** The lockup. */
  header?: ReactNode
  /** The server card. */
  footer?: ReactNode
  /** Its groups. */
  children: ReactNode
  /** `sheet`: inside the compact menu's sheet, without its own width, surface and line. */
  inSheet?: boolean
  /** Its landmark's name. Default "Main". */
  label?: string
}

/** The admin's navigation: 216 wide on `s1` with a line at its end, the groups, then the card. */
export function Sidebar({ header, footer, children, inSheet, label = 'Main' }: SidebarProps) {
  const theme = useTheme()
  return (
    <View
      role="navigation"
      aria-label={label}
      style={
        inSheet
          ? { gap: s['0.5'], flexGrow: 1 }
          : {
              width: tokens.density.sidebar,
              flexShrink: 0,
              paddingHorizontal: s['2'] + s['0.5'],
              paddingVertical: s['4'],
              gap: s['0.5'],
              backgroundColor: theme.colors.s1,
              borderRightWidth: line.thin,
              borderRightColor: theme.colors.line,
              overflow: 'hidden',
            }
      }
    >
      {header ? (
        <View
          style={{
            paddingBottom: s['4'] + s['0.5'],
            paddingHorizontal: s['2'],
            paddingTop: s['0.5'],
          }}
        >
          {header}
        </View>
      ) : null}
      <View style={{ flexShrink: 1, gap: s['0.5'] }}>{children}</View>
      {footer ? <View style={{ marginTop: 'auto', paddingTop: s['4'] }}>{footer}</View> : null}
    </View>
  )
}

/**
 * The groups, each after the first with a hairline above it, as the web's NavGroup draws
 * between siblings (web/components/sidebar.tsx's `[&+&]:mt-2.5 [&+&]:border-t`).
 */
export function NavGroups({ groups }: { groups: ReactNode[] }) {
  const theme = useTheme()
  return (
    <>
      {groups.map((group, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: the groups are fixed, in order
          key={i}
          role="list"
          style={{
            gap: s['0.5'],
            ...(i > 0
              ? {
                  marginTop: s['2'] + s['0.5'],
                  paddingTop: s['2'] + s['0.5'],
                  borderTopWidth: line.thin,
                  borderTopColor: theme.colors.line,
                }
              : null),
          }}
        >
          {group}
        </View>
      ))}
    </>
  )
}

export type NavItemProps = {
  icon: IconName
  label: string
  /** Where it goes: drawn as a link. Without it, a button. */
  href?: string
  onPress?: () => void
  /** A count after the label (the library's size), in mono. */
  count?: number
  /** The page it's on: a 6% wash, the icon in accent, and `aria-current="page"`. */
  active?: boolean
}

/** A page in the sidebar: 32 tall at least, the icon 16 at 85%, the label, a count at its end. */
export function NavItem({ icon, label, href, onPress, count, active }: NavItemProps) {
  const theme = useTheme()
  return (
    <View role="listitem">
      <Press
        role={href ? 'link' : 'button'}
        accessibilityLabel={count === undefined ? undefined : `${label}, ${count}`}
        aria-current={active ? 'page' : undefined}
        onPress={onPress}
        {...linkTo(href)}
        style={({ hovered }) => ({
          minHeight: s['8'],
          flexDirection: 'row',
          alignItems: 'center',
          gap: s['2'] + s['0.5'],
          paddingHorizontal: s['2'] + s['0.5'],
          paddingVertical: sidebar.itemY,
          borderRadius: tokens.radius.sm,
          backgroundColor: active
            ? alpha(theme.colors.text, 0.06)
            : hovered
              ? theme.colors.s2
              : 'transparent',
        })}
      >
        {({ hovered }) => (
          <>
            <View style={{ opacity: active ? 1 : 0.85 }}>
              <Icon name={icon} size={tokens.icon.size.sm} color={active ? 'accent' : 'text-2'} />
            </View>
            <Text
              size={ui.size}
              leading={ui.leading}
              weight={active ? 500 : 400}
              color={active || hovered ? 'text' : 'text-2'}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
              {label}
            </Text>
            {count === undefined ? null : (
              <Text size={webText.label.size} mono color="text-3" aria-hidden>
                {count.toLocaleString()}
              </Text>
            )}
          </>
        )}
      </Press>
    </View>
  )
}

const statusDot: Record<'online' | 'degraded' | 'offline', ColorRole> = {
  online: 'success',
  degraded: 'warning',
  offline: 'danger',
}

export type ServerCardProps = {
  name: string
  /** Its version and clients, in a line. */
  detail: string
  status: keyof typeof statusDot
  /** The status in words, for screen readers. Default Online, Degraded or Offline. */
  statusLabel?: string
}

const STATUS_WORD = { online: 'Online', degraded: 'Degraded', offline: 'Offline' } as const

/** The server at the sidebar's foot: a dot with a soft ring, its name and a line under it. */
export function ServerCard({ name, detail, status, statusLabel }: ServerCardProps) {
  const theme = useTheme()
  const dot = theme.colors[statusDot[status]]
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['2'] + s['0.5'],
        padding: s['2'] + s['0.5'],
        borderWidth: line.thin,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.md,
        backgroundColor: theme.colors.s2,
      }}
    >
      <View
        aria-hidden
        style={{
          width: s['2'],
          height: s['2'],
          borderRadius: tokens.radius.pill,
          backgroundColor: dot,
          boxShadow: `0 0 0 3px ${alpha(dot, 0.25)}`,
          flexShrink: 0,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text size={ui.size} leading={ui.leading} weight={500} numberOfLines={1}>
          {name}
          <Text size={ui.size} leading={ui.leading} style={HIDDEN_TEXT}>
            {`: ${statusLabel ?? STATUS_WORD[status]}`}
          </Text>
        </Text>
        <Text size={webText.label.size} leading={1.4} color="text-3" numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </View>
  )
}

/**
 * Read, never seen: the library's one visually hidden style (the web's `sr-only`,
 * https://www.w3.org/WAI/WCAG22/Techniques/css/C7), and transparent, since a nested Text on iOS
 * and Android takes no layout styles.
 */
const HIDDEN_TEXT = { ...visuallyHidden, opacity: 0 }

// ---------------------------------------------------------------- the page's top row

export type SearchTriggerProps = {
  onPress: () => void
  /** What the palette searches. Default "Search library, TMDB, actions". */
  label?: string
}

/**
 * Looks like a search field and opens the command palette, with the shortcut's hint. In a
 * compact window it folds to an icon button with the same name.
 */
export function SearchTrigger({
  onPress,
  label = 'Search library, TMDB, actions',
}: SearchTriggerProps) {
  const mod = useModKey()
  const theme = useTheme()
  const m = useControl()
  const wide = theme.formFactor.widthClass !== 'compact'
  return (
    <Press
      accessibilityLabel={label}
      aria-keyshortcuts="Meta+K Control+K"
      onPress={onPress}
      slop={{ height: m.height, width: wide ? undefined : m.height }}
      style={({ hovered }) => ({
        height: m.height,
        width: wide ? searchTrigger.width : m.height,
        maxWidth: wide ? '32vw' : undefined,
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: wide ? 'flex-start' : 'center',
        gap: s['2'],
        paddingHorizontal: wide ? s['3'] : 0,
        borderWidth: line.thin,
        borderColor: hovered ? theme.colors['line-strong'] : theme.colors.line,
        borderRadius: m.radius,
        backgroundColor: theme.colors.s1,
      })}
    >
      {({ hovered }) => (
        <>
          <Icon name="search" size={tokens.icon.size.sm} color={hovered ? 'text-2' : 'text-3'} />
          {wide ? (
            <Text
              size={m.text}
              color={hovered ? 'text-2' : 'text-3'}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
              {label}
            </Text>
          ) : null}
          {wide ? <Kbd>{`${mod}K`}</Kbd> : null}
        </>
      )}
    </Press>
  )
}

/** Its corner, as the web's Kbd (`rounded-[5px]`, onto `radius.2xs`). */
const KBD_RADIUS = tokens.radius['2xs']

/** A keyboard hint: mono 11 in a `line-strong` outline, hidden from screen readers (the label says it). */
export function Kbd({ children }: { children: string }) {
  const theme = useTheme()
  return (
    <View
      aria-hidden
      style={{
        minWidth: s['5'],
        height: s['5'],
        paddingHorizontal: s['1'] + s['0.5'],
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: line.thin,
        borderColor: theme.colors['line-strong'],
        borderRadius: KBD_RADIUS,
      }}
    >
      <Text size={webText.label.size} leading={1} mono color="text-3">
        {children}
      </Text>
    </View>
  )
}

/** `⌘` on Apple's platforms, `Ctrl` elsewhere, read from the browser's navigator. */
function readModKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
}

/**
 * The shortcut's modifier: `Ctrl` on the server and while hydrating, then the browser's own, so
 * the text matches when it hydrates (web/components/mod-key.tsx: Node has a navigator too, and
 * answers from the server's platform;
 * https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering).
 */
export function useModKey(): string {
  return useSyncExternalStore(
    () => () => {},
    readModKey,
    () => 'Ctrl',
  )
}

export type PageHeaderProps = {
  title: string
  /** A short line under the title. */
  description?: ReactNode
  /** Usually a SearchTrigger. */
  search?: ReactNode
  /** Secondary actions, then the primary one last. */
  actions?: ReactNode
  /** Before the title: the compact menu's button. */
  start?: ReactNode
}

/** The page's top row: the title, the search, the actions. It wraps rather than squeezes. */
export function PageHeader({ title, description, search, actions, start }: PageHeaderProps) {
  return (
    <View
      role="banner"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: s['3'],
        rowGap: s['2'],
      }}
    >
      {start}
      {/* a 160 basis: the actions wrap to a second row before the title truncates */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: statusBar.itemBasis, minWidth: 0 }}>
        <Text variant="heading" role="heading" aria-level={1} numberOfLines={1}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color="text-3" style={{ marginTop: s['1'] }}>
            {description}
          </Text>
        ) : null}
      </View>
      {search}
      {actions ? (
        <View
          style={{
            maxWidth: '100%',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: s['2'],
          }}
        >
          {actions}
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------- the status bar

/**
 * The admin's status bar (admin.md › Status and live data): one row 28 tall at the bottom, on
 * `s1` with a line above it, in mono 11 and text-3. Values change in place, without motion and
 * without announcements; the System page has the detail.
 */
export function StatusBar({
  children,
  label = 'Server status',
}: {
  children: ReactNode
  /** Its region's name. */
  label?: string
}) {
  const theme = useTheme()
  return (
    <View
      role="region"
      aria-label={label}
      style={{
        height: s['6'] + s['1'],
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['4'],
        paddingHorizontal: s['4'],
        overflow: 'hidden',
        backgroundColor: theme.colors.s1,
        borderTopWidth: line.thin,
        borderTopColor: theme.colors.line,
      }}
    >
      {children}
    </View>
  )
}

const itemDot: Record<'success' | 'warning' | 'danger' | 'neutral', ColorRole> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'text-3',
}

export type StatusItemProps = {
  children: string
  /** A dot before the text, which says the status too. */
  dot?: keyof typeof itemDot
  /** Pushes this item and the ones after it to the end. */
  end?: boolean
  /**
   * Hidden in a compact window, narrower than the form-factor rule's one split (`REGULAR_WIDTH`,
   * 768): the version and the resources.
   */
  hideCompact?: boolean
}

export function StatusItem({ children, dot, end, hideCompact }: StatusItemProps) {
  const theme = useTheme()
  const shown = useWindowAtLeast(hideCompact ? REGULAR_WIDTH : 0)
  if (!shown) return null
  return (
    <View
      style={{
        minWidth: 0,
        flexShrink: end ? 1 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['1'] + s['0.5'],
        marginLeft: end ? 'auto' : undefined,
      }}
    >
      {dot ? (
        <View
          aria-hidden
          style={{
            width: s['1'] + s['0.5'],
            height: s['1'] + s['0.5'],
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors[itemDot[dot]],
          }}
        />
      ) : null}
      <Text size={webText.label.size} mono color="text-3" numberOfLines={1} style={{ minWidth: 0 }}>
        {children}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- panels and figures

export type PanelProps = {
  /** Its heading, and its region's name. Without one it's a frame round its content (a row of Stats). */
  title?: string
  /** A line under the title. */
  description?: ReactNode
  /**
   * `widget`: a status panel's heading, in the admin's widget title (13 semibold), with 16 of
   * padding. `group`: a settings group's, in the title style, 20 of padding in a regular window.
   */
  look?: 'widget' | 'group'
  /** The gap between its rows (12 by default; a group's is 16). */
  gap?: number
  /** Fill its column's height, so panels side by side end together (a grid's row, on the web). */
  fill?: boolean
  children: ReactNode
}

/**
 * A region of a page on `s1`, with a line round it and the large corner: System's panels and the
 * settings' groups (the web's `rounded-lg border border-line bg-s1 p-4` and settings.tsx's Group).
 */
export function Panel({
  title,
  description,
  look = 'widget',
  gap,
  fill = false,
  children,
}: PanelProps) {
  const theme = useTheme()
  const group = look === 'group'
  const wide = theme.formFactor.widthClass !== 'compact'
  const heading = tokens.adminText['widget-title']
  return (
    <View
      role={title ? 'region' : undefined}
      aria-label={title}
      style={{
        gap: gap ?? (group ? s['4'] : s['3']),
        padding: group && wide ? s['5'] : s['4'],
        borderWidth: line.thin,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
        minWidth: 0,
        flexGrow: fill ? 1 : undefined,
      }}
    >
      {title ? (
        <View style={{ gap: s['0.5'] }}>
          {group ? (
            <Text variant="title" weight={600} role="heading" aria-level={2}>
              {title}
            </Text>
          ) : (
            <Text
              size={heading.size}
              leading={heading.leading}
              weight={600}
              role="heading"
              aria-level={2}
            >
              {title}
            </Text>
          )}
          {description ? (
            <Text variant="caption" color="text-3">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  )
}

export type StatProps = {
  value: string
  /** After the value, in the admin's ui type. */
  unit?: string
  caption?: string
}

/** A figure in a panel or widget: 26 semibold with the display tracking, a caption under it. */
export function Stat({ value, unit, caption }: StatProps) {
  const size = serverCard.mark
  return (
    <View style={{ minWidth: 0, gap: s['1'] }}>
      <Text
        size={size}
        leading={1}
        weight={600}
        style={{ letterSpacing: tokens.tracking.display * size }}
      >
        {value}
        {unit ? (
          <Text size={ui.size} leading={ui.leading} color="text-2" style={{ letterSpacing: 0 }}>
            {` ${unit}`}
          </Text>
        ) : null}
      </Text>
      {caption ? (
        <Text variant="caption" color="text-3">
          {caption}
        </Text>
      ) : null}
    </View>
  )
}

export type TextLinkProps = {
  /** Where it leads. Without it, it's a button drawn as a link, for `onPress` (Status's Get the apps). */
  href?: string
  children: string
  onPress?: () => void
  /** The caption style (by default) or the admin's ui type. */
  look?: 'caption' | 'ui'
}

/** A link in running text's place: text-2, underlined (colour alone doesn't mark a link), text on hover. */
export function TextLink({ href, children, onPress, look = 'caption' }: TextLinkProps) {
  return (
    <Press
      role={href ? 'link' : 'button'}
      onPress={onPress}
      {...linkTo(href)}
      style={{ ...OWN_SIZE, borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <Text
          variant={look === 'caption' ? 'caption' : undefined}
          size={look === 'ui' ? ui.size : undefined}
          leading={look === 'ui' ? ui.leading : undefined}
          color={hovered ? 'text' : 'text-2'}
          style={{ textDecorationLine: 'underline' }}
        >
          {children}
        </Text>
      )}
    </Press>
  )
}

export type DetailsProps = {
  /** Each term and what it is, in order. */
  rows: readonly { term: string; value: ReactNode }[]
  /** The terms' column: `auto` as wide as the widest, or a width in points (About's 160). */
  termWidth?: number | 'auto'
  /** Stack each term over its value in a compact window (About's), rather than beside it. */
  stack?: boolean
  /** Between rows (6 by default). */
  gap?: number
  /** The terms' type: the caption style (About's), or the admin's ui type (Addresses'). */
  terms?: 'caption' | 'ui'
}

/**
 * Terms and their values, a description list (System's Addresses and About): the terms in the
 * caption style and text-3, each value beside its term. A value that's text is drawn in the
 * admin's ui type; anything else as it's given.
 */
export function Details({
  rows,
  termWidth = 'auto',
  stack = false,
  gap,
  terms = 'caption',
}: DetailsProps) {
  const theme = useTheme()
  const stacked = stack && theme.formFactor.widthClass === 'compact'
  const rowGap = gap ?? s['1'] + s['0.5']
  // `auto`: each term measured, and every term then as wide as the widest, so the values share one
  // column (the web's grid-cols-[auto_1fr]); drawn on the server, the terms take their own widths
  // until the browser has measured them
  const [widths, setWidths] = useState<Record<string, number>>({})
  const widest = Math.max(0, ...Object.values(widths))
  const measure = (term: string) =>
    termWidth === 'auto' && !stacked
      ? {
          onLayout: (e: { nativeEvent: { layout: { width: number } } }) => {
            const w = Math.ceil(e.nativeEvent.layout.width)
            setWidths((was) => (was[term] === w ? was : { ...was, [term]: w }))
          },
        }
      : null
  return (
    <View role="list" style={{ gap: rowGap }}>
      {rows.map((r) => (
        <View
          key={r.term}
          role="listitem"
          style={{
            flexDirection: stacked ? 'column' : 'row',
            columnGap: s['4'],
            rowGap: s['1'],
            // each value on its term's first baseline, whatever its type or a badge's padding
            // (https://reactnative.dev/docs/layout-props#alignitems: `baseline`)
            alignItems: stacked ? 'stretch' : 'baseline',
          }}
        >
          <View
            style={
              stacked
                ? undefined
                : termWidth === 'auto'
                  ? { flexShrink: 0, minWidth: widest || undefined }
                  : { width: termWidth, flexShrink: 0 }
            }
          >
            <Text
              {...measure(r.term)}
              variant={terms === 'caption' ? 'caption' : undefined}
              size={terms === 'ui' ? ui.size : undefined}
              leading={terms === 'ui' ? ui.leading : undefined}
              color="text-3"
              style={{ alignSelf: 'flex-start' }}
            >
              {r.term}
            </Text>
          </View>
          <View style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>
            {typeof r.value === 'string' ? (
              <Text size={ui.size} leading={ui.leading}>
                {r.value}
              </Text>
            ) : (
              r.value
            )}
          </View>
        </View>
      ))}
    </View>
  )
}

/** A figure, path or address in mono, the admin's `figure` type (12): System's addresses and versions. */
export function Figure({
  children,
  color = 'text',
  title,
}: {
  children: string
  color?: ColorRole
  /** Shown in full on hover when it's cut short. */
  title?: string
}) {
  const figure = tokens.adminText.figure
  return (
    <Text
      size={figure.size}
      leading={figure.leading}
      mono
      color={color}
      numberOfLines={1}
      {...({ ref: webTitle(title) } as object)}
    >
      {children}
    </Text>
  )
}

export type AttributionProps = {
  /** The service's logo: its own file, unmodified, as its terms ask, with its name. */
  logo: { src: string; alt: string; width: number; height: number }
  /** Where the logo leads (the service's site, in a new tab). */
  href: string
  /** The notice in the terms' words. */
  notice: string
}

/**
 * A data service's logo and notice (System › About's TMDB, https://www.themoviedb.org/api-terms-of-use
 * § 3): the logo 12 tall, less prominent than highsea's marks, linking to the service, the notice
 * beside it, wrapping under it in a narrow window.
 */
export function Attribution({ logo, href, notice }: AttributionProps) {
  const height = s['3']
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: s['3'],
        rowGap: s['2'],
      }}
    >
      <Press
        role="link"
        {...({ href, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object)}
        style={{ borderRadius: tokens.radius.sm, flexShrink: 0 }}
      >
        <Image
          source={{ uri: logo.src }}
          accessibilityLabel={logo.alt}
          contentFit="contain"
          style={{ height, width: (height * logo.width) / logo.height }}
        />
      </Press>
      <Text
        variant="caption"
        color="text-3"
        style={{ flexGrow: 1, flexShrink: 1, flexBasis: wrapBasis }}
      >
        {notice}
      </Text>
    </View>
  )
}
