// SPDX-License-Identifier: AGPL-3.0-only
// The navigation shell (one-client-platform.md › A, W7), one for every client, drawn by the form
// factor around the destinations' stack:
// - touch: the phone's five-tab bar at the foot (the prototype's mobile/shell.tsx): Home, Search,
//   Library, Offline and You, which opens Settings;
// - the TV: the head (the prototype's tv/kit.tsx, @highsea-tv/ui/tv's TvHead): the server at the
//   left, Search as its icon, Home, Collections and Movies centred, then Alerts and the account,
//   which opens Settings;
// - a pointer: the web's top bar (the prototype's web/shell.tsx): the server at the left, the TV's
//   destinations centred, Alerts and the profile at the right.
// Films only, so Shows and Music wait for their phases. While the server doesn't answer, the
// destinations give way to Unreachable, with Try again, Another server and Forget this server.
//
// The owner's announcements are the shell's, over every destination, as both prototypes' shells
// draw them (../../shell/announcements.tsx): one that must be acknowledged is a dialog with a
// pointer or touch, and on the TV a screen of its own over the page, with the head hidden; with a
// pointer, toasts. With a pointer the bell opens Alerts as a popover (../../shell/alerts.tsx), and
// carries a dot while any is new; on the TV it opens the Alerts page; the phone has none, so /alerts
// goes to Home there. Every note floats in one region at the page's foot (kit's NoteRegion): what
// the screen on view said, and the announcements' toasts.
//
// A page asks two things of the shell through kit (ShellAsk): where Down from the TV's head goes
// (useHeadDown), and that the head or the top bar lie over it, so its art runs under them
// (useChromeOverlay), as a film's page does. Over a page, the TV's head scrolls away with it
// (tv/kit.tsx's TvHead), and the top bar stays, clear until the page scrolls under it and then
// glass (web/shell.tsx's TopBar).
import { type destinationMessages, forgetMessages, shellMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { useCurrent } from '@highsea-tv/native/servers'
import { useMaybeSession, useReachableState } from '@highsea-tv/native/session'
import { blur, web } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  EmptyState,
  Icon,
  type IconName,
  Mark,
  Press,
  Text,
  tokens,
  UNCHOSEN_ALPHA,
  useControl,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { TvHead, TvHeadStop, TvMessage, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, Redirect, router, Stack, usePathname } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AccountMenu } from '../../account/menu.tsx'
import { useLeaveOnBack } from '../../back.tsx'
import { HistoryButtons, useDesktopTopBar } from '../../desktop/window.tsx'
import { useForget } from '../../forget.tsx'
import { useKeepsServers } from '../../host'
import {
  COMPACT_NAV_HEIGHT,
  HeadGoal,
  NoteRegion,
  ShellAsk,
  type ShellAsks,
  type ShellClaim,
  TAB,
  TAB_ROW,
  TOP_BAR_HEIGHT,
  TvIdentity,
  useServerName,
} from '../../kit.tsx'
import { AlertsPopover } from '../../shell/alerts.tsx'
import {
  ShellAnnouncements,
  TvAnnouncement,
  useHereAnnouncements,
} from '../../shell/announcements.tsx'

const { space } = tokens

type Destination = {
  path: string
  label: keyof typeof destinationMessages
  icon?: IconName
  /** Other pages that are this destination's own, which keep it marked. */
  owns?: string[]
}

/** The phone's tabs (mobile.md#home-tabs--carousel). Library's own pages include Collections'. */
const TABS: (Destination & { icon: IconName })[] = [
  { path: '/', label: 'home', icon: 'dashboard' },
  { path: '/search', label: 'search', icon: 'search' },
  { path: '/library', label: 'library', icon: 'library', owns: ['/collections'] },
  { path: '/offline', label: 'offline', icon: 'download' },
  { path: '/settings', label: 'you', icon: 'user' },
]

/** The TV's and the web's destinations: Search as its icon, then each kind, Collections first. */
const DESTINATIONS: Destination[] = [
  { path: '/search', label: 'search', icon: 'search' },
  { path: '/', label: 'home' },
  { path: '/collections', label: 'collections' },
  { path: '/movies', label: 'movies' },
]

const isHere = (path: string, pathname: string) =>
  path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)

/** A destination is marked on its own path, and on the pages it owns. */
const isMarked = (d: Destination, pathname: string) =>
  isHere(d.path, pathname) || (d.owns ?? []).some((p) => isHere(p, pathname))

const go = (path: string) => router.navigate(path as Href)

export default function Shell() {
  const theme = useTheme()
  const pathname = usePathname()
  const input = useFormFactor().input
  const { offline } = useReachableState()
  const [goal, setGoal] = useState<ViewHandle | null>(null)
  const [down, setDown] = useState<ShellClaim<ViewHandle | null>>(null)
  const [overlay, setOverlay] = useState<ShellClaim<true>>(null)
  // how far the page under the chrome has scrolled: the head follows it, the bar turns to glass
  const scroll = useRef(new Animated.Value(0)).current
  const asks = useMemo(() => ({ setDown, setOverlay, scroll }), [scroll])
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const id = scroll.addListener(({ value }) => setScrolled(value > STUCK))
    return () => scroll.removeListener(id)
  }, [scroll])
  // a page that lays the chrome over it starts at its top
  const owner = overlay?.owner
  useEffect(() => {
    if (owner) scroll.setValue(0)
  }, [owner, scroll])
  // the announcements need the server; Unreachable stands alone
  const must = useHereAnnouncements().modal
  const acknowledge = offline ? undefined : must
  const over = !offline && overlay !== null
  const content = offline ? (
    <Unreachable />
  ) : (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: input === 'touch' ? undefined : 'fade',
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    />
  )
  // the phone has no Alerts: its owner's announcements are Home's card
  if (input === 'touch' && isHere('/alerts', pathname)) return <Redirect href="/" />
  if (input === 'touch')
    return (
      <Asks value={asks}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          <View style={{ flex: 1 }}>
            {content}
            <NoteRegion />
          </View>
          {/* Connect a device is a step of its own, without the tabs (the prototype's mobile/pair.tsx) */}
          {isHere('/link', pathname) ? null : <TabBar />}
          {offline ? null : <ShellAnnouncements />}
        </View>
      </Asks>
    )
  if (input === 'tv') {
    const head = acknowledge ? null : (
      <Head reachable={!offline} onGoal={setGoal} down={down?.value ?? null} />
    )
    return (
      <Asks value={asks}>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
          {over ? null : head}
          <HeadGoal.Provider value={goal}>
            <View
              // hidden while an announcement must be acknowledged: nothing in it takes focus or
              // is read, and it keeps its place for after
              importantForAccessibility={acknowledge ? 'no-hide-descendants' : 'auto'}
              accessibilityElementsHidden={!!acknowledge}
              style={{ flex: 1, display: acknowledge ? 'none' : 'flex' }}
            >
              {content}
            </View>
          </HeadGoal.Provider>
          {over && head ? (
            <Over>
              <Animated.View
                pointerEvents="box-none"
                style={{ transform: [{ translateY: away(scroll) }] }}
              >
                {head}
              </Animated.View>
            </Over>
          ) : null}
          {acknowledge ? <TvAnnouncement item={acknowledge} /> : null}
          <NoteRegion />
        </View>
      </Asks>
    )
  }
  return (
    <Asks value={asks}>
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        {over ? null : <TopBar />}
        <View style={{ flex: 1 }}>{content}</View>
        {over ? (
          <Over>
            <TopBar over glass={scrolled} />
          </Over>
        ) : null}
        <NoteRegion />
        {offline ? null : <ShellAnnouncements />}
      </View>
    </Asks>
  )
}

/** What the pages ask of the shell (kit's ShellAsk). */
function Asks({ value, children }: { value: ShellAsks; children: ReactNode }) {
  return <ShellAsk.Provider value={value}>{children}</ShellAsk.Provider>
}

/** Only the web draws a blur behind the bar (react-native-web's backdropFilter). */
const BLURS = Platform.OS === 'web'
const BAR_BLUR = {
  backdropFilter: `blur(${blur.bar.radius}px) saturate(${blur.bar.saturate})`,
} as object

/** The web's background laid from the border's edge (react-native-web passes it to CSS as written). */
const ORIGIN_BORDER = { backgroundOrigin: 'border-box' } as object

/** How far a page scrolls under the top bar before it turns to glass: the prototype's 8. */
const STUCK = space['2']

/** The head goes up with the page, as far as it has, and never below its place (an overscroll). */
const away = (scroll: Animated.Value) =>
  scroll.interpolate({ inputRange: [0, 1], outputRange: [0, -1], extrapolateLeft: 'clamp' })

/** The head or the top bar laid over the page, which starts at the screen's top under it. */
function Over({ children }: { children: ReactNode }) {
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
      {children}
    </View>
  )
}

/** The phone's tab bar, as the prototype draws it: s1, a line above, the accent on the current tab. */
function TabBar() {
  const t = useT(shellMessages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  return (
    <View
      accessibilityRole={TAB_ROW}
      accessibilityLabel={t('main')}
      style={{
        flexDirection: 'row',
        minHeight: space['16'],
        paddingBottom: insets.bottom,
        backgroundColor: theme.colors.s1,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.line,
      }}
    >
      {TABS.map((tab) => {
        const here = isMarked(tab, pathname)
        const color = here ? 'accent-text' : 'text-3'
        return (
          <Press
            key={tab.path}
            haptic
            accessibilityRole={TAB}
            accessibilityState={{ selected: here }}
            accessibilityLabel={t(tab.label)}
            onPress={() => {
              // a tab marked from one of its pages goes back to the tab's own page
              if (pathname !== tab.path) go(tab.path)
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space['0.5'],
              minHeight: space['16'],
            }}
          >
            <Icon name={tab.icon} size={tokens.icon.size.md} color={color} />
            <Text variant="tabLabel" color={color} maxFontSizeMultiplier={1.4}>
              {t(tab.label)}
            </Text>
          </Press>
        )
      })}
    </View>
  )
}

/**
 * The TV's head on every destination: Up from the page lands on the current destination, or on the
 * bell or the account when one of theirs is open.
 */
function Head({
  reachable,
  onGoal,
  down,
}: {
  reachable: boolean
  /** Told the stop Up lands on, which a page with no stops of its own focuses (kit's HeadGoal). */
  onGoal: (goal: ViewHandle | null) => void
  /** Where Down from the head goes, as the page asked (kit's useHeadDown). */
  down: ViewHandle | null
}) {
  const t = useT(shellMessages)
  const pathname = usePathname()
  const alerts = isHere('/alerts', pathname)
  const account = isHere('/settings', pathname)
  const landing =
    alerts || account
      ? null
      : (DESTINATIONS.find((d) => isHere(d.path, pathname)) ?? DESTINATIONS[1])
  const fresh = useHereAnnouncements().unread.length
  const person = useMaybeSession()?.user.displayName ?? ''
  const [tab, setTab] = useState<ViewHandle | null>(null)
  const [bell, setBell] = useState<ViewHandle | null>(null)
  const [me, setMe] = useState<ViewHandle | null>(null)
  const goal = landing ? tab : alerts ? bell : me
  useEffect(() => onGoal(goal), [goal, onGoal])
  return (
    <TvHead
      label={t('main')}
      goal={goal}
      down={down}
      reachable={reachable}
      start={<TvIdentity />}
      center={DESTINATIONS.map((d) => (
        <TvHeadStop
          key={d.path}
          ref={d === landing ? setTab : undefined}
          label={t(d.label)}
          text={d.icon ? undefined : t(d.label)}
          icon={d.icon}
          here={isHere(d.path, pathname)}
          disabled={!reachable}
          onPress={() => go(d.path)}
        />
      ))}
      end={
        <>
          <TvHeadStop
            ref={setBell}
            label={fresh ? t('alertsNew', { count: fresh }) : t('alerts')}
            icon="notification"
            dot={fresh > 0}
            here={alerts}
            disabled={!reachable}
            onPress={() => go('/alerts')}
          />
          <TvHeadStop
            ref={setMe}
            label={t('account', { name: person })}
            avatar={person}
            here={account}
            disabled={!reachable}
            onPress={() => go('/settings')}
          />
        </>
      }
    />
  )
}

/** `aria-current="page"` for the destination shown, which React Native's types don't list. */
const pageMark = (here: boolean) =>
  (here ? { 'aria-current': 'page' } : {}) as Record<string, never>

/**
 * The web's top bar: the server, the destinations, then Alerts and the profile. The server and the
 * profile go to Choose a server and Settings for now; their menus (the prototype's web/shell.tsx)
 * come with part B. Laid `over` a page (kit's useChromeOverlay) it has no line or fill of its own,
 * only the page's background fading out behind it, as the prototype's starts over a hero; once the
 * page has scrolled under it, it's `glass`, as the prototype's glass-bar: the background at the bar
 * blur's opacity with the blur behind it where the web has one, else the solid fallback's.
 */
function TopBar({ over = false, glass = false }: { over?: boolean; glass?: boolean }) {
  const t = useT(shellMessages)
  const theme = useTheme()
  const m = useControl()
  const pathname = usePathname()
  const name = useServerName()
  const away = useMaybeSession()?.away ?? false
  // below 768 the bar is the prototype's narrow one (web/shell.tsx's TopBar under `medium:`): the
  // server, then Search, Alerts and the profile on one line, and the destinations as pills on a
  // line of their own that scrolls sideways, so nothing wraps or runs past the edge
  const compact = useFormFactor().widthClass === 'compact'
  const gutter = usePageGutter()
  // the desktop app's drag region and, on a Mac, room for its window buttons (desktop/window.tsx)
  const desktop = useDesktopTopBar(gutter)
  // a plain browser is its own server's: its name, with no list to switch to
  const keeps = useKeepsServers()
  const clear = over && !glass
  // the server is the prototype's ghost Button (web/shell.tsx's ServerSwitcher) at every width:
  // its 24 mark, the control's text in the ghost look's weight and colour, and the button's
  // padding, so the mark sits that far inside the page's gutter
  const ghost = tokens.controls.buttonLooks.ghost
  const identity = (
    <>
      <Mark size={tokens.icon.size.lg} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text
          variant="body"
          weight={ghost.weight}
          color={ghost.label}
          size={m.text}
          numberOfLines={1}
        >
          {name}
        </Text>
        {away ? (
          <Text variant="caption" color="text-3" numberOfLines={1}>
            {t('remotely')}
          </Text>
        ) : null}
      </View>
    </>
  )
  const row = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.gap,
    minHeight: m.height,
    paddingHorizontal: m.pad,
    borderRadius: m.radius,
    // react-native-web's View doesn't shrink by default (flexShrink 0, its View's own style),
    // where CSS's flex items do: the server's name gives way, not the bar's end
    flexShrink: 1,
    minWidth: 0,
  } as const
  const server = keeps ? (
    <Press
      onPress={() => router.push('/connect')}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t('switchServer')}`}
      style={row}
    >
      {identity}
      <Icon name="chevron-down" size={tokens.icon.size.sm} color="text-3" />
    </Press>
  ) : (
    <View style={row}>{identity}</View>
  )
  const fill = {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: clear ? 'transparent' : theme.colors.line,
    backgroundColor: clear
      ? 'transparent'
      : glass
        ? alpha(theme.colors.bg, BLURS ? blur.bar.opacity : blur.fallbackOpacity)
        : theme.colors.bg,
    // the prototype's bg-[linear-gradient(var(--color-bg),transparent)], as TvPage's fade
    backgroundImage: clear ? `linear-gradient(180deg, ${theme.colors.bg}, transparent)` : undefined,
    // laid from the border's edge, as the prototype's bg-origin-border: a background image starts
    // at the padding box and repeats, while it's painted under the border too (CSS Backgrounds 3,
    // background-origin's initial padding-box, background-clip's border-box), so the gradient's
    // solid start would be drawn again in the transparent line, a dark rule across the backdrop
    ...(clear ? ORIGIN_BORDER : null),
    ...(glass && BLURS ? BAR_BLUR : null),
  }
  if (compact)
    return (
      <View style={fill} {...desktop.drag}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['3'],
            minHeight: TOP_BAR_HEIGHT,
            paddingHorizontal: gutter,
            paddingVertical: space['2'],
            ...desktop.start,
          }}
        >
          {server}
          <View
            style={{
              marginStart: 'auto',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['2'],
            }}
          >
            {/* Search is the icon at the bar's end; the line below has the rest */}
            <BarLink d={DESTINATIONS[0]} pathname={pathname} />
            <BarEnd />
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          role="navigation"
          accessibilityLabel={t('main')}
          contentContainerStyle={{
            gap: space['1'],
            paddingHorizontal: gutter,
            paddingBottom: space['2'],
          }}
        >
          {DESTINATIONS.filter((d) => !d.icon).map((d) => {
            const here = isHere(d.path, pathname)
            return (
              <Press
                key={d.path}
                role="link"
                accessibilityLabel={t(d.label)}
                {...pageMark(here)}
                onPress={() => go(d.path)}
                style={{
                  minHeight: COMPACT_NAV_HEIGHT - space['2'],
                  justifyContent: 'center',
                  paddingHorizontal: space['3'],
                  borderRadius: tokens.radius.pill,
                  // the prototype's aria-[current=page]:bg-text/10
                  backgroundColor: here ? alpha(theme.colors.text, 0.1) : 'transparent',
                }}
              >
                {/* unchosen, the prototype's text-text/65, as BarLink's */}
                <Text variant="body" weight={600} style={{ opacity: here ? 1 : UNCHOSEN_ALPHA }}>
                  {t(d.label)}
                </Text>
              </Press>
            )
          })}
        </ScrollView>
      </View>
    )
  // the prototype's bar from 768: its line under a row of at least 80 (min-h-20 with py-2), the
  // row no wider than the page (max-w-[1680px], mx-auto) inside the page's gutter
  // (`px-4 medium:px-8 wide:px-16`, usePageGutter)
  return (
    <View style={fill} {...desktop.drag}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          // react-native-web's View packs a wrapping row's lines at the start (alignContent
          // 'flex-start' in its View's own style, dist/exports/View/index.js), where CSS's
          // `normal` stretches the one line to the row's height: centred, as the prototype's
          // items sit in the middle of its 80
          alignContent: 'center',
          columnGap: space['3'],
          rowGap: space['2'],
          width: '100%',
          maxWidth: web.maxWidth,
          alignSelf: 'center',
          minHeight: TOP_BAR_HEIGHT,
          paddingHorizontal: gutter,
          paddingVertical: space['2'],
          ...desktop.start,
        }}
      >
        <HistoryButtons />
        {server}
        <View
          role="navigation"
          accessibilityLabel={t('main')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['1'],
            marginHorizontal: 'auto',
          }}
        >
          {DESTINATIONS.map((d) => (
            <BarLink key={d.path} d={d} pathname={pathname} />
          ))}
        </View>
        <BarEnd />
      </View>
    </View>
  )
}

/** A destination in the top bar: its icon (Search) or its name. */
function BarLink({ d, pathname }: { d: Destination; pathname: string }) {
  const t = useT(shellMessages)
  const m = useControl()
  const here = isHere(d.path, pathname)
  // the narrow bar's Search is the prototype's ghost button, in `text-2`
  const compact = useFormFactor().widthClass === 'compact'
  // each destination a link, the one shown marked as the page (WAI-ARIA's aria-current, which
  // react-native-web hands to the element)
  return (
    <Press
      role="link"
      accessibilityLabel={t(d.label)}
      {...pageMark(here)}
      onPress={() => go(d.path)}
      style={{
        minHeight: m.height,
        minWidth: m.height,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: d.icon ? 0 : m.fieldPad,
        borderRadius: m.radius,
        // the current one is marked by its colour alone, the icon's as the names' (the
        // prototype's web/shell.tsx: `text-text`, no fill)
      }}
    >
      {/* the prototype's `text-text/65` unchosen: one colour's glyphs at an opacity draw as that
          colour at the same alpha, and the library's Icon and Text take colour roles only */}
      <View style={{ opacity: here || compact ? 1 : UNCHOSEN_ALPHA }}>
        {d.icon ? (
          <Icon name={d.icon} size={m.icon} color={here || !compact ? 'text' : 'text-2'} />
        ) : (
          <Text variant="body" weight={600}>
            {t(d.label)}
          </Text>
        )}
      </View>
    </Press>
  )
}

/** The top bar's end: Alerts, then the account menu (../../account/menu.tsx). */
function BarEnd() {
  const t = useT(shellMessages)
  const fresh = useHereAnnouncements().unread.length
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
      <AlertsPopover
        trigger={(bell) => (
          <View ref={bell.anchor}>
            <Button
              variant="ghost"
              iconOnly
              icon="notification"
              hasPopup="dialog"
              accessibilityState={{ expanded: bell.open }}
              accessibilityLabel={fresh ? t('alertsNew', { count: fresh }) : t('alerts')}
              onPress={bell.toggle}
            />
            {/* the library's Button has no dot yet */}
            {fresh > 0 ? <NewDot /> : null}
          </View>
        )}
      />
      <AccountMenu />
    </View>
  )
}

/** The bell's dot while an announcement is new: the prototype's, on the button's top end corner. */
const DOT = space['2'] + space['0.5']
const DOT_AT = space['1'] + space['0.5']

function NewDot() {
  const theme = useTheme()
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: DOT_AT,
        end: DOT_AT,
        width: DOT,
        height: DOT,
        borderRadius: tokens.radius.pill,
        borderWidth: space['0.5'],
        borderColor: theme.colors.bg,
        backgroundColor: theme.colors.accent,
      }}
    />
  )
}

/** The server doesn't answer: what to do about it, in place of the destinations. */
function Unreachable() {
  const t = useT(shellMessages)
  const f = useT(forgetMessages)
  const theme = useTheme()
  const tv = useFormFactor().input === 'tv'
  const { retry } = useReachableState()
  const current = useCurrent()
  const { forget, prompt } = useForget()
  // a plain browser is its server's, with no list to pick another from or forget this one in
  const keeps = useKeepsServers()
  const name = current.server.name
  const another = () => router.push('/connect')
  const forgetIt = () => forget(current.server.id, name)
  // it stands in for the shell's screens, Home among them, so with nothing behind it the TV's Back
  // leaves highsea as Home's would, rather than going to a Home that isn't there
  useLeaveOnBack(!router.canGoBack())
  if (tv)
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <TvMessage
          title={t('unreachableTitle', { name })}
          actions={
            <>
              <Button variant="primary" hasTVPreferredFocus icon="refresh" onPress={retry}>
                {t('tryAgain')}
              </Button>
              {keeps ? (
                <>
                  <Button variant="overlay" icon="server" onPress={another}>
                    {t('anotherServer')}
                  </Button>
                  <Button variant="overlay" icon="delete" onPress={forgetIt}>
                    {f('thisServer')}
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          {t('unreachableBody', { name })}
        </TvMessage>
        {prompt}
      </View>
    )
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.mobile.gutter,
        backgroundColor: theme.colors.bg,
      }}
    >
      <View style={{ width: '100%', maxWidth: space['16'] * 7 }}>
        <EmptyState
          icon="network"
          title={t('unreachableTitle', { name })}
          action={
            <View style={{ flex: 1, gap: space['2'] }}>
              <Button variant="primary" icon="refresh" block onPress={retry}>
                {t('tryAgain')}
              </Button>
              {keeps ? (
                <>
                  <Button block onPress={another}>
                    {t('switchServer')}
                  </Button>
                  <Button variant="danger-ghost" block onPress={forgetIt}>
                    {f('thisServer')}
                  </Button>
                </>
              ) : null}
            </View>
          }
        >
          {t('unreachableBody', { name })}
        </EmptyState>
      </View>
      {prompt}
    </View>
  )
}
