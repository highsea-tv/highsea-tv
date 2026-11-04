// SPDX-License-Identifier: AGPL-3.0-only
// The parts the gate and Settings share, drawn from the library and laid out by the form factor
// (controls.md › The form factor), never by the OS: C1's frame on touch and a pointer (the Lockup
// over a card, as the prototype's client/connect-flow.tsx draws it), a section's mono label, a list
// row with a mark or an icon and two lines, a notice, the server's identity on the TV, and asking
// before something can't be undone (the library's Dialog, or TvConfirm on the TV). Every size is
// a token, a sum of tokens or the control spec's (useControl), so nothing here is a value of its own.
import { useServer } from '@highsea-tv/client/data'
import { connectMessages, hostOf, seenWhen, shellMessages } from '@highsea-tv/client/gate'
import { settingsPageMessages } from '@highsea-tv/client/prefs'
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useCurrent, useServers } from '@highsea-tv/native/servers'
import { useMaybeSession, useReachableState } from '@highsea-tv/native/session'
import {
  Avatar,
  Button,
  Dialog,
  Icon,
  type IconName,
  type InlineRun,
  Lockup,
  Mark,
  Press,
  ScrollView,
  Sheet,
  Text,
  Toast,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { focusOn, TvConfirm, TvWords, type ViewHandle } from '@highsea-tv/ui/tv'
import { router, useIsFocused, usePathname } from 'expo-router'
import {
  type ComponentProps,
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  type AccessibilityRole,
  ActivityIndicator,
  type Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBack } from './back.tsx'
import { TV_GATE } from './gate-sizes.ts'
import { header as headerMessages } from './messages.ts'
import { useOpenServer } from './open-server.ts'
import { useWatching } from './profiles/state.tsx'

const { space } = tokens

/**
 * The roles of a row of tabs and of each tab. React Native gives iOS's tab bar trait to `tabbar`
 * only, and no trait at all to `tablist` or `tab` (React/Views/RCTViewManager.m), so a `tab` there
 * is a plain element that VoiceOver doesn't offer as a control. UIKit's own tab bar is a container
 * with the tab bar trait whose items are buttons, which VoiceOver reads as tabs, "Home, tab, 1 of
 * 5" (https://developer.apple.com/documentation/uikit/uiaccessibilitytraits/tabbar), so iOS draws
 * that. The web has no `tabbar` role and its tabs are `tab`s in a `tablist`
 * (https://www.w3.org/TR/wai-aria-1.2/#tablist). Selected state is set on each tab either way.
 */
export const TAB_ROW: AccessibilityRole = Platform.OS === 'web' ? 'tablist' : 'tabbar'
export const TAB: AccessibilityRole = Platform.OS === 'web' ? 'tab' : 'button'

/** A choice of one among several: the library's rule, which its Chip follows too. */
export { RADIO, radioState } from '@highsea-tv/ui'

/**
 * The TV head's stop for where the person is (the shell's Head hands it down). A TV page with no
 * stops of its own gives focus to it, since tvOS's focus engine only moves from a focused stop: with
 * nothing preferred on the page, nothing is focused after signing in and the remote does nothing
 * (UIFocusSystem, https://developer.apple.com/documentation/uikit/uifocussystem).
 */
export const HeadGoal = createContext<ViewHandle | null>(null)

/** What a page has asked of the shell, and which page asked, so only its own leaving clears it. */
export type ShellClaim<T> = { owner: object; value: T } | null

/**
 * What the pages ask of the shell around them, which the shell holds and draws by: where Down from
 * the TV's head goes (`down`), and whether the head or the top bar lies over the page (`overlay`).
 */
export type ShellAsks = {
  setDown: Dispatch<SetStateAction<ShellClaim<ViewHandle | null>>>
  setOverlay: Dispatch<SetStateAction<ShellClaim<true>>>
  /** How far the page under the chrome has scrolled, in points: what the chrome follows. */
  scroll: Animated.Value
}

/** The shell hands its setters down through this; outside a shell, asking does nothing. */
export const ShellAsk = createContext<ShellAsks | null>(null)

/**
 * Claims `value` from the shell while this page is the one on view: the stack keeps a page mounted
 * under the ones opened from it, so a page asks only while it's focused, and its leaving clears
 * only its own claim, never the one the page after it made.
 */
function useClaim<T>(
  set: Dispatch<SetStateAction<ShellClaim<T>>> | undefined,
  value: T,
  on: boolean,
) {
  const [owner] = useState(() => ({}))
  const focused = useIsFocused()
  useEffect(() => {
    if (!set || !focused || !on) return
    set({ owner, value })
    return () => set((c) => (c?.owner === owner ? null : c))
  }, [set, focused, on, value, owner])
}

/**
 * Where Down from the TV's head goes while this page is on view, when its first stop isn't straight
 * under the head (TvHead's `down`): Search's first key, say. Pass the stop's handle (a ref's
 * current, or a state set by a ref callback); null leaves Down to the focus engine.
 */
export const useHeadDown = (stop: ViewHandle | null) =>
  useClaim(useContext(ShellAsk)?.setDown, stop, stop !== null)

/** What a page under the chrome hands its scroller, so the chrome follows it (useChromeOverlay). */
export type ChromeScroll = {
  /** For the page's ScrollView or FlatList. */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
  scrollEventThrottle: number
  /** For a page that moves by a transform rather than scrolling (the TV's lift): how far, in points. */
  offset: (y: number) => void
  /** What the page leaves at its top for the chrome over it: the pointer's top bar, else 0 (the
   * TV's head scrolls away with the page, and touch draws none over it). */
  pad: number
}

/** The pointer's top bar at its least: the prototype's h-16 plus its py-2 (web/shell.tsx TopBar). */
export const TOP_BAR_HEIGHT = space['16'] + space['4']

/** A narrow window's line of destinations under the top bar: the prototype's pills, a line of 32
 * with its pb-2 (web/shell.tsx's TopBar below `medium:`). */
export const COMPACT_NAV_HEIGHT = space['8'] + space['2']

/** How often a scroller reports to the chrome: once a frame. */
const FRAME_MS = 16

/**
 * Lays the TV's head or the pointer's top bar over this page while it's on view, so its art runs
 * under them, as the prototypes draw a film's page: the page then starts at the screen's top and
 * keeps its own words clear of them. Touch has no bar at the top, so it does nothing there. Hand
 * what it returns to the page's scroller (`<ScrollView {...chrome}>`, or `chrome.offset(y)`), and
 * the chrome follows the page as the prototypes' does:
 * - the TV's head is the first thing in the page's flow and scrolls away with it (tv/kit.tsx's
 *   TvHead), so nothing passes under it;
 * - the pointer's top bar is sticky (web/shell.tsx's TopBar): clear, with only the page's
 *   background fading out behind it, until the page scrolls under it, then glass with its line.
 */
export function useChromeOverlay(on = true): ChromeScroll {
  const ask = useContext(ShellAsk)
  useClaim(ask?.setOverlay, true, on)
  const scroll = ask?.scroll
  const formFactor = useFormFactor()
  const pad =
    formFactor.input !== 'pointer'
      ? 0
      : formFactor.widthClass === 'compact'
        ? TOP_BAR_HEIGHT + COMPACT_NAV_HEIGHT
        : TOP_BAR_HEIGHT
  return useMemo(
    () => ({
      onScroll: (e) => scroll?.setValue(e.nativeEvent.contentOffset.y),
      scrollEventThrottle: FRAME_MS,
      offset: (y) => scroll?.setValue(y),
      pad,
    }),
    [scroll, pad],
  )
}

/** The server's name: what it calls itself once it answers, else the name this device knows. */
export function useServerName() {
  const current = useCurrent()
  return useServer().data?.name ?? current.server.name
}

/** A server's mark in a row: the prototype's 28. */
export const MARK = space['6'] + space['1']

/** The server's mark beside the TV's words: a control's icon and gap, in the TV's screen units,
 * since Mark multiplies its size by 1u itself (useControl's are already in points). */
const tvMark = tokens.controls.tv.md
export const TV_MARK = tvMark.icon + tvMark.gap

/** A gate screen's title on the TV, at the prototype's size and `leading-[1]`. */
export function TvGateTitle({
  children,
  size = TV_GATE.title,
}: {
  children: string
  size?: number
}) {
  const u = useTheme().u
  return (
    <Text
      variant="heroTitle"
      size={size}
      accessibilityRole="header"
      style={{ lineHeight: size * u }}
    >
      {children}
    </Text>
  )
}

/** C1's card on a pointer, no wider than the prototype's 28rem. */
const FRAME_WIDTH = space['16'] * 7

/** Back, for a screen's Back button: the screen before, or Home when there's none. */
export function goBack() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

/**
 * C1's frame on touch and a pointer: the Lockup centred over a card (s1, `line`, radius-lg,
 * shadow-2) with the step's title and, past the first step, Back as an arrow beside it. `flush`
 * leaves the content's sides to it, for rows that carry their own inset (Choose a server's lists).
 * `footer` stays at the screen's foot while the rest scrolls. On a pointer the frame sits in the
 * middle of the window, as the prototype's web does.
 */
export function GateFrame({
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
  const insets = useSafeAreaInsets()
  const pointer = useFormFactor().input === 'pointer'
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: pointer ? 'center' : 'flex-start',
          paddingTop: insets.top + space['1'],
          paddingBottom: (footer ? 0 : insets.bottom) + space['6'],
          paddingHorizontal: tokens.mobile.gutter,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // a field under the keyboard scrolls into view
        // (https://reactnative.dev/docs/scrollview#automaticallyadjustkeyboardinsets-ios)
        automaticallyAdjustKeyboardInsets
      >
        <View
          style={{
            width: '100%',
            maxWidth: pointer ? FRAME_WIDTH : undefined,
            alignSelf: 'center',
            gap: space['6'],
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: space['4'] }}>
            <Lockup size={space['5']} />
          </View>
          <View
            style={{
              gap: space['5'],
              paddingHorizontal: space['3'],
              paddingVertical: space['5'],
              borderRadius: tokens.radius.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.s1,
              boxShadow: tokens.elevation[2].boxShadow,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space['2'],
                paddingHorizontal: space['3'],
              }}
            >
              {back ? (
                <View style={{ marginStart: -space['2'] }}>
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
            <View style={{ gap: space['4'], paddingHorizontal: flush ? 0 : space['3'] }}>
              {children}
            </View>
          </View>
        </View>
      </ScrollView>
      {footer ? (
        <View
          // a row, so a button keeps its own width in the middle on every renderer, as the
          // prototype's centred foot (client/connect-flow.tsx)
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            paddingHorizontal: tokens.mobile.gutter,
            paddingTop: space['2'],
            paddingBottom: insets.bottom + space['4'],
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  )
}

/** Something that went wrong, as the prototype's Alert: badge-danger on its own tint. */
export function Notice({ children }: { children: string }) {
  const theme = useTheme()
  const tv = useFormFactor().input === 'tv'
  if (tv)
    return (
      <Text variant="pill" color="badge-danger" accessibilityRole="alert">
        {children}
      </Text>
    )
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: space['2'],
        alignItems: 'flex-start',
        borderRadius: tokens.radius.sm,
        backgroundColor: theme.colors['badge-danger-bg'],
        paddingHorizontal: space['3'],
        paddingVertical: space['2'],
      }}
    >
      <Icon name="alert" size={tokens.icon.size.sm} color="badge-danger" />
      <Text variant="callout" color="badge-danger" style={{ flex: 1 }}>
        {children}
      </Text>
    </View>
  )
}

/** A section's label: mono, uppercase, quiet, with what's beside it at the end. */
export function SectionLabel({ children, aside }: { children: string; aside?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['2'],
        minHeight: space['6'],
        paddingHorizontal: space['3'],
      }}
    >
      <Text
        variant="caption"
        mono
        color="text-3"
        accessibilityRole="header"
        style={{ textTransform: 'uppercase' }}
      >
        {children}
      </Text>
      {aside ? <View style={{ marginStart: 'auto' }}>{aside}</View> : null}
    </View>
  )
}

/** A line under a section's label: what discovery is doing, or why it found nothing. */
export function SectionNote({ children }: { children: string }) {
  return (
    <Text
      variant="caption"
      color="text-3"
      style={{ paddingHorizontal: space['3'], paddingVertical: space['2'] }}
    >
      {children}
    </Text>
  )
}

/**
 * A list row as the prototype's are drawn: a mark or an icon, two lines, and a chevron (or what's
 * `trailing`). It's one press target, at least a touch control's height and the row's padding.
 */
export function ListItem({
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
  trailing?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** The detail in mono, for an address. */
  mono?: boolean
  style?: Exclude<ComponentProps<typeof Press>['style'], (...a: never[]) => unknown>
}) {
  const theme = useTheme()
  const m = useControl()
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
          minHeight: m.height + space['4'],
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['3'],
          paddingHorizontal: space['3'],
          paddingVertical: space['2'] + space['0.5'],
          borderRadius: tokens.radius.md,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {lead ??
        (icon ? (
          <Icon name={icon} size={tokens.icon.size.md} color={danger ? 'badge-danger' : 'text-3'} />
        ) : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="body"
          weight={lead ? 600 : 400}
          color={danger ? 'badge-danger' : 'text'}
          numberOfLines={1}
        >
          {title}
        </Text>
        {detail ? (
          <Text variant="callout" color="text-3" mono={mono} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {pending ? (
        // the row's own label names it; the spinner is only its busy state
        <ActivityIndicator aria-hidden size="small" color={theme.colors['text-3']} />
      ) : (
        (trailing ??
        (onPress && !danger ? (
          <Icon name="chevron-right" size={tokens.icon.size.sm} color="text-3" />
        ) : null))
      )}
    </Press>
  )
}

/** Centred on the screen: a loading mark, or what's given. */
export function Centered({ children }: { children?: ReactNode }) {
  const theme = useTheme()
  const t = useT(settingsPageMessages)
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.mobile.gutter,
      }}
    >
      {children ?? (
        <ActivityIndicator accessibilityLabel={t('loading')} color={theme.colors['text-3']} />
      )}
    </View>
  )
}

/** The server's mark and name: the TV's screens start with it, as the prototype's tv/connect.tsx. */
export function TvIdentity() {
  const m = useControl()
  const name = useServers().current?.server.name ?? ''
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: m.gap }}>
      <Mark size={TV_MARK} />
      <Text variant="serverName">{name}</Text>
    </View>
  )
}

export type Confirmation = {
  title: string
  body: string
  cancel: string
  action: string
  icon?: IconName
  run: () => void
}

/**
 * What happened, as a toast would say it. `next` is for an action that leaves the screen (Sign out
 * lands on the sign-in): the note waits for the screen after it, and shows there.
 */
export type Said = { title: string; body?: string; next?: boolean }

/**
 * A note on its way to the screen: what was said, or an announcement's toast with its body's runs.
 * `path` is the screen it was said on (null for the app's own, shown on any screen), so a note
 * never shows on a screen other than the one that said it. A `next` note goes with the screens
 * the app moves to in the moment after it's said, and stays on the last.
 */
export type Note = {
  id: number
  title: string
  body?: string
  runs?: readonly InlineRun[]
  path: string | null
  /** Until when (ms since the epoch) it moves with the screens it lands on: a `next` note's. */
  follows?: number
}

/** How long a `next` note goes with the redirects after it's said (sign-out passes Home). */
const FOLLOW_MS = 1000

/** How long a note stays, as the web's toasts do (the library's Toaster, web/components/toast.tsx). */
export const NOTE_MS = 6000

type Notes = {
  notes: readonly Note[]
  push: (note: Omit<Note, 'id' | 'path'>, path: string | null) => void
  /** The screens drawing what's said in place (SaidNote), which the region leaves to them. */
  inPlace: (path: string, on: boolean) => void
  placed: ReadonlySet<string>
  /** The screen on view now, read as a note is said. */
  here: () => string
}

const NotesContext = createContext<Notes>({
  notes: [],
  push: () => {},
  inPlace: () => {},
  placed: new Set(),
  here: () => '',
})

/**
 * Holds what was said and the announcements' toasts over the screens, each for NOTE_MS. A note is
 * the screen's that was on view when it was said (read then, so signing out, whose sign-in mounts
 * a new navigator before it speaks, says it on the sign-in), and goes when that screen does. The
 * shell's NoteRegion draws them, stacked, as the web's Toaster does; a screen that shows its note in
 * place (SaidNote, by its actions) draws its own instead.
 */
export function SaidProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const live = useRef(pathname)
  live.current = pathname
  const [notes, setNotes] = useState<readonly Note[]>([])
  const [placed, setPlaced] = useState<ReadonlySet<string>>(new Set())
  const next = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const all = timers.current
    return () => {
      for (const t of all) clearTimeout(t)
    }
  }, [])
  // a note goes with the screen that said it
  useEffect(() => {
    setNotes((n) => {
      const kept = n
        .map((x) =>
          x.follows !== undefined && x.path !== pathname && Date.now() < x.follows
            ? { ...x, path: pathname }
            : x,
        )
        .filter((x) => x.path === null || x.path === pathname)
      return kept.length === n.length && kept.every((x, i) => x === n[i]) ? n : kept
    })
  }, [pathname])
  // stable, so what holds them (useSay, SaidNote's effect) never runs again for a new note
  const here = useCallback(() => live.current, [])
  const push = useCallback<Notes['push']>((note, path) => {
    next.current += 1
    const id = next.current
    setNotes((n) => [...n, { ...note, id, path }])
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setNotes((n) => n.filter((x) => x.id !== id))
    }, NOTE_MS)
    timers.current.add(timer)
  }, [])
  const inPlace = useCallback<Notes['inPlace']>(
    (path, on) =>
      setPlaced((p) => {
        if (p.has(path) === on) return p
        const copy = new Set(p)
        if (on) copy.add(path)
        else copy.delete(path)
        return copy
      }),
    [],
  )
  const value = useMemo<Notes>(
    () => ({ notes, placed, here, push, inPlace }),
    [notes, placed, here, push, inPlace],
  )
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>
}

/** Says what happened, on the screen on view as it's said (or, with `next`, the one after it). */
export function useSay() {
  const { push, here } = useContext(NotesContext)
  return useCallback(
    ({ next, ...said }: Said) =>
      push(next ? { ...said, follows: Date.now() + FOLLOW_MS } : said, here()),
    [push, here],
  )
}

/** Puts a note on every screen: the announcements' toasts. */
export const useNote = () => useContext(NotesContext).push

/** A note's card: the library's Toast, its body's runs keeping their bold, italic and links. */
function NoteCard({ note }: { note: Note }) {
  return <Toast title={note.title} body={note.runs ? plainRuns(note.runs) : note.body} />
}

/** Runs as their words, for the Toast's plain body. */
const plainRuns = (runs: readonly InlineRun[]) => runs.map((r) => r.text).join('')

/**
 * What this screen said, drawn in place by its actions, as a film's page shows Mark as watched's
 * note under its buttons; the shell's region leaves this screen's notes to it while it's mounted.
 */
export function SaidNote() {
  const { notes, inPlace } = useContext(NotesContext)
  const pathname = usePathname()
  const focused = useIsFocused()
  useEffect(() => {
    if (!focused) return
    inPlace(pathname, true)
    return () => inPlace(pathname, false)
  }, [focused, inPlace, pathname])
  const note = notes.findLast((x) => x.path === pathname)
  if (!note) return null
  return <NoteCard note={note} />
}

/** A note's widest with a pointer: the web's toast (w-96). */
export const NOTE_WIDTH = space['16'] * 6

/**
 * The one place notes float, which the shell draws over every destination: the app's own (an
 * announcement's toast) and what the screen on view said, unless it draws them in place. Stacked
 * at the page's foot, newest last, as the web's Toaster: with a pointer at the end inside the
 * gutter; by touch across the gutter, above the tab bar; on the TV at the foot's end inside the
 * safe area.
 */
export function NoteRegion() {
  const { notes, placed } = useContext(NotesContext)
  const pathname = usePathname()
  const input = useFormFactor().input
  const theme = useTheme()
  const u = theme.u
  const gutter = usePageGutter()
  const shown = notes.filter(
    (x) => x.path === null || (x.path === pathname && !placed.has(pathname)),
  )
  if (shown.length === 0) return null
  const tv = input === 'tv'
  const inset = tv ? tokens.tv.safe.x * u : gutter
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: inset,
        right: inset,
        bottom: tv ? tokens.tv.safe.y * u : space['4'],
        alignItems: input === 'touch' ? 'stretch' : 'flex-end',
        gap: space['2'],
      }}
    >
      {shown.map((x) => (
        <View
          key={x.id}
          style={{
            maxWidth: input === 'pointer' ? NOTE_WIDTH : undefined,
            boxShadow: tv ? undefined : tokens.elevation[2].boxShadow,
          }}
        >
          <NoteCard note={x} />
        </View>
      ))}
    </View>
  )
}

/** TvConfirm, closed by the remote's Back while it's open, as Cancel closes it. */
function TvAsk(props: ComponentProps<typeof TvConfirm>) {
  useBack(() => {
    props.onCancel()
    return true
  })
  return <TvConfirm {...props} />
}

/**
 * Asking before something can't be undone (forgetting a server, signing out): `ask` opens it and
 * `prompt` is drawn where the screen puts it. The library's Dialog, with Cancel and the action in
 * danger; on the TV, TvConfirm, which the remote moves over.
 */
export function useConfirm() {
  const [open, setOpen] = useState<Confirmation | null>(null)
  const tv = useFormFactor().input === 'tv'
  const close = () => setOpen(null)
  const prompt = !open ? null : tv ? (
    <TvAsk
      title={open.title}
      body={open.body}
      cancel={open.cancel}
      action={open.action}
      icon={open.icon}
      onCancel={close}
      onConfirm={() => {
        close()
        open.run()
      }}
    />
  ) : (
    <Dialog
      open
      onClose={close}
      title={open.title}
      footer={
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            gap: space['2'],
          }}
        >
          <Button variant="ghost" onPress={close}>
            {open.cancel}
          </Button>
          <Button
            variant="danger"
            onPress={() => {
              close()
              open.run()
            }}
          >
            {open.action}
          </Button>
        </View>
      }
    >
      <Text variant="body" color="text-2">
        {open.body}
      </Text>
    </Dialog>
  )
  return { ask: setOpen, prompt }
}

/**
 * A destination not built yet (one-client-platform.md › A: the screens come in part B): its name
 * and a line saying so, under the shell, so the navigation can be walked end to end.
 */
export function Coming({ title }: { title: string }) {
  const t = useT(shellMessages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const tv = useFormFactor().input === 'tv'
  const touch = useFormFactor().input === 'touch'
  const u = theme.u
  const goal = useContext(HeadGoal)
  useEffect(() => {
    if (tv) focusOn(goal)
  }, [tv, goal])
  if (tv)
    return (
      <View
        style={{
          flex: 1,
          paddingHorizontal: tokens.tv.safe.x * u,
          paddingTop: tokens.tv.safe.y * u,
          backgroundColor: theme.colors.bg,
        }}
      >
        <Text variant="heroTitle" accessibilityRole="header">
          {title}
        </Text>
        <TvWords title={t('comingBody')} />
      </View>
    )
  return (
    <View
      style={{
        flex: 1,
        gap: space['2'],
        paddingTop: (touch ? insets.top : 0) + space['6'],
        paddingHorizontal: touch ? tokens.mobile.gutter : space['8'],
        backgroundColor: theme.colors.bg,
      }}
    >
      <Text variant={touch ? 'largeTitle' : 'heading'} accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color="text-2">
        {t('comingBody')}
      </Text>
    </View>
  )
}

/**
 * A control that comes in a later version, as the prototype's kit/soon.tsx draws it: the button,
 * held off, saying so to a screen reader.
 */
export function Soon({ children, icon }: { children: string; icon?: IconName }) {
  const t = useT(settingsPageMessages)
  return (
    <Button size="sm" icon={icon} disabled accessibilityHint={t('soon')}>
      {children}
    </Button>
  )
}

/** The phone header's height: the prototype's h-12. */
const HEADER = space['12']
/** The server's mark in the header's switcher, and the account's avatar: the prototype's 26 and 36. */
const HEADER_MARK = space['6'] + space['0.5']
const HEADER_AVATAR = space['8'] + space['1']

/**
 * The phone's header on every destination (the prototype's mobile/shell.tsx Header): the page's
 * title at the start, or on Home, with no title, the server switcher (its mark, its name, Connected
 * remotely while it's reached from outside, and a chevron opening the sheet of servers); then the
 * account's avatar at the end, which opens You. A page draws it first in its scrolling content, under
 * the safe area's top, so it scrolls away with the page as the prototype's does. The title is the
 * phone's largeTitle (30), as the prototype's 28 has no token of its own.
 */
export function TouchHeader({ title }: { title?: string }) {
  const t = useT(shellMessages)
  // the profile watching now when the server serves profiles (B3), else the person signed in
  const watching = useWatching()
  const signedIn = useMaybeSession()?.user.displayName ?? ''
  const person = watching?.name ?? signedIn
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['2'],
        minHeight: HEADER,
        paddingHorizontal: tokens.mobile.gutter,
      }}
    >
      {title ? (
        <Text
          variant="largeTitle"
          accessibilityRole="header"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {title}
        </Text>
      ) : (
        <ServerSwitcher />
      )}
      <Press
        onPress={() => router.navigate('/settings')}
        accessibilityRole="link"
        accessibilityLabel={t('account', { name: person })}
        slop={{ height: HEADER_AVATAR, width: HEADER_AVATAR }}
        style={{ marginStart: 'auto', borderRadius: HEADER_AVATAR / 2 }}
      >
        <Avatar name={person} tone={watching?.tone} size={HEADER_AVATAR} />
      </Press>
    </View>
  )
}

/** The header's server: its name and how it's reached, opening the sheet of servers. */
function ServerSwitcher() {
  const h = useT(headerMessages)
  const m = useControl()
  const name = useServerName()
  const away = useMaybeSession()?.away ?? false
  const [open, setOpen] = useState(false)
  return (
    <>
      <Press
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          away ? `${h('switcher', { name })}, ${h('away')}` : h('switcher', { name })
        }
        slop={{ height: m.height }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['2'],
          minHeight: m.height,
          minWidth: 0,
          flexShrink: 1,
        }}
      >
        <Mark size={HEADER_MARK} />
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text variant="title" weight={600} numberOfLines={1}>
            {name}
          </Text>
          {away ? (
            <Text variant="caption" color="text-3" numberOfLines={1}>
              {h('away')}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-down" size={tokens.icon.size.sm} color="text-3" />
      </Press>
      <ServerSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The sheet of servers this phone knows (the prototype's ServerSheet): each as Choose a server's
 * row, the one in use with how it's reached and a check, the others with Choose a server's line;
 * choosing another opens it as Choose a server does, and Add a server goes there.
 */
function ServerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const h = useT(headerMessages)
  const t = useT(shellMessages)
  const c = useT(connectMessages)
  const locale = useLocale()
  const servers = useServers()
  const current = useCurrent()
  const away = useMaybeSession()?.away ?? false
  const { offline } = useReachableState()
  const openServer = useOpenServer()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = Date.now()
  const choose = async (id: string) => {
    setPending(id)
    setError(null)
    const refused = await openServer.openKnown(id)
    setPending(null)
    if (refused) setError(refused)
    else onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={h('servers')}>
      {error ? <Notice>{error}</Notice> : null}
      <View style={{ gap: space['1'] }}>
        {servers.known.map((k) => {
          const here = k.id === current.server.id
          return (
            <ListItem
              key={k.id}
              lead={<Mark size={MARK} />}
              title={k.name}
              detail={
                here
                  ? h(offline ? 'unreachable' : away ? 'away' : 'here')
                  : c('knownLine', {
                      address: hostOf(k.addresses[0]?.url ?? ''),
                      signedIn: String(k.signedIn),
                      when: ((w) => (w === 'now' ? w : relative(w, now, locale)))(
                        seenWhen(k.lastSeen, now),
                      ),
                    })
              }
              pending={pending === k.id}
              disabled={pending !== null}
              trailing={
                here ? (
                  <Icon name="check" size={tokens.icon.size.sm} color="accent-text" />
                ) : undefined
              }
              onPress={here ? onClose : () => void choose(k.id)}
            />
          )
        })}
      </View>
      <Button
        icon="add"
        block
        onPress={() => {
          onClose()
          router.push('/connect')
        }}
      >
        {t('addServer')}
      </Button>
    </Sheet>
  )
}
