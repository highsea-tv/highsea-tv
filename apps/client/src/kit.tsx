// SPDX-License-Identifier: AGPL-3.0-only
// The parts the gate and Settings share, drawn from the library and laid out by the form factor
// (controls.md › The form factor), never by the OS: C1's frame on touch and a pointer (the Lockup
// over a card, as the prototype's client/connect-flow.tsx draws it), a section's mono label, a list
// row with a mark or an icon and two lines, a notice, the server's identity on the TV, and asking
// before something can't be undone (the library's Dialog, or TvConfirm on the TV). Every size is
// a token, a sum of tokens or the control spec's (useControl), so nothing here is a value of its own.
import { shellMessages } from '@highsea-tv/client/gate'
import { settingsPageMessages } from '@highsea-tv/client/prefs'
import { useT } from '@highsea-tv/i18n/react'
import { useServers } from '@highsea-tv/native/servers'
import {
  Button,
  Dialog,
  Icon,
  type IconName,
  Lockup,
  Mark,
  Press,
  ScrollView,
  Text,
  tokens,
  useControl,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { focusOn, TvConfirm, TvWords, type ViewHandle } from '@highsea-tv/ui/tv'
import { router } from 'expo-router'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { type AccessibilityRole, ActivityIndicator, Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBack } from './back.tsx'

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

/**
 * A choice of one among several (a theme): `radio` on the web, with `checked`
 * (https://www.w3.org/TR/wai-aria-1.2/#radio). React Native gives `radio` no trait on iOS either,
 * so there it's a button with the selected trait, as UIKit's own lists of choices are
 * (https://developer.apple.com/documentation/uikit/uiaccessibilitytraits/selected).
 */
export const RADIO: AccessibilityRole = Platform.OS === 'web' ? 'radio' : 'button'
export const radioState = (on: boolean): { checked?: boolean; selected?: boolean } =>
  Platform.OS === 'web' ? { checked: on } : { selected: on }

/**
 * The TV head's stop for where the person is (the shell's Head hands it down). A TV page with no
 * stops of its own gives focus to it, since tvOS's focus engine only moves from a focused stop: with
 * nothing preferred on the page, nothing is focused after signing in and the remote does nothing
 * (UIFocusSystem, https://developer.apple.com/documentation/uikit/uifocussystem).
 */
export const HeadGoal = createContext<ViewHandle | null>(null)

/** A server's mark in a row: the prototype's 28. */
export const MARK = space['6'] + space['1']

/** The server's mark beside the TV's words: a control's icon and gap, in the TV's screen units,
 * since Mark multiplies its size by 1u itself (useControl's are already in points). */
const tvMark = tokens.controls.tv.md
export const TV_MARK = tvMark.icon + tvMark.gap

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

/** What the screen after an action says happened ("Signed out of Harbor"), as a toast would. */
export type Said = { title: string; body?: string }

/** How long it stays, as the web's toasts do (the library's Toaster, web/components/toast.tsx). */
const SAID_MS = 6000

const SaidContext = createContext<{ said: Said | null; say: (said: Said) => void }>({
  said: null,
  say: () => {},
})

/**
 * Holds what was said over the screens: signing out mounts a new navigator (../app/_layout.tsx's
 * Nav) whose sign-in says it. The native apps have no toast stack (the library's parity.ts), so the
 * screen that comes next draws it with SaidNote, and it goes after a moment.
 */
export function SaidProvider({ children }: { children: ReactNode }) {
  const [said, setSaid] = useState<Said | null>(null)
  useEffect(() => {
    if (!said) return
    const timer = setTimeout(() => setSaid(null), SAID_MS)
    return () => clearTimeout(timer)
  }, [said])
  return <SaidContext.Provider value={{ said, say: setSaid }}>{children}</SaidContext.Provider>
}

export const useSay = () => useContext(SaidContext).say

/** What was just said, if anything: calm, announced politely. */
export function SaidNote() {
  const said = useContext(SaidContext).said
  const theme = useTheme()
  const tv = useFormFactor().input === 'tv'
  if (!said) return null
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        gap: space['2'],
        alignItems: 'flex-start',
        borderRadius: tokens.radius.sm,
        backgroundColor: tv ? undefined : theme.colors.s2,
        paddingHorizontal: tv ? 0 : space['3'],
        paddingVertical: tv ? 0 : space['2'],
      }}
    >
      <View style={{ flex: tv ? undefined : 1 }}>
        <Text variant={tv ? 'pill' : 'callout'} weight={600}>
          {said.title}
        </Text>
        {said.body ? (
          <Text variant={tv ? 'pill' : 'callout'} color="text-2">
            {said.body}
          </Text>
        ) : null}
      </View>
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
