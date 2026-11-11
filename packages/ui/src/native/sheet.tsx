// SPDX-License-Identifier: AGPL-3.0-only
// Sheets and dialogs. A sheet is iOS's own page sheet, which swipes down to close
// (mobile.md › Platform conventions; https://reactnative.dev/docs/modal#presentationstyle-ios). A
// dialog is a card over a scrim in the middle of the screen; one that must be acknowledged has no
// way out but its button. With a pointer the dialog is the web renderer's: no wider than its
// size's cap (sm 400, md 560, lg 800: web/components/dialog.tsx's max-w-100, 140 and 200), its
// footer's buttons in a row at its end. A dialog with a way out may draw the close button beside its
// title (`closable`), as the web renderer's DialogContent does by default; here it's asked for, so
// the dialogs answered by their footer keep their look.

import { useT } from '@highsea-tv/i18n/react'
import { line, sheet } from '@highsea-tv/tokens'
import { type ReactNode, useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { Modal, Platform, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from './button.tsx'
import { visuallyHidden } from './hidden-heading.tsx'
import { uiMessages } from './messages.ts'
import { useScrimStyle } from './scrim.ts'
import { ScrollView } from './scroll-view.tsx'
import { Text, textStyle } from './text.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'

// ---------------------------------------------------------------- yielding to a link

/**
 * The sheets and dialogs up now on iOS, each with how to close it for a link. React Native's Modal
 * is a view controller of its own that react-native-screens doesn't own, and a screen it presents
 * while such a Modal is still going away is never shown (react-native-screens' RNSScreenStack.mm,
 * "In case of presence of other (not managed by us) modal controllers, weird interactions might
 * arise"; https://github.com/software-mansion/react-native-screens/issues/2048). So before an app
 * follows a link (expo-router's `redirectSystemPath`, which it awaits:
 * https://docs.expo.dev/router/advanced/native-intent/), it closes them all with `yieldToLink` and
 * waits until iOS has dismissed them (the Modal's `onDismiss`, iOS only:
 * https://reactnative.dev/docs/modal#ondismiss-ios).
 */
const up = new Map<symbol, () => Promise<void>>()
let yielding = false
const yieldListeners = new Set<() => void>()
const setYielding = (next: boolean) => {
  yielding = next
  for (const l of yieldListeners) l()
}
const subscribeYield = (l: () => void) => {
  yieldListeners.add(l)
  return () => {
    yieldListeners.delete(l)
  }
}

/** The longest a Modal's dismissal is waited for, past iOS's own (about a third of a second). */
const YIELD_WAIT_MS = 1000
/** How long the Modals stay closed after the link, for the screen it leaves to lose its focus. */
const YIELD_HOLD_MS = 1000

/** Closes every sheet and dialog that's up on iOS, resolving once iOS has dismissed them. */
export async function yieldToLink(): Promise<void> {
  if (Platform.OS !== 'ios' || up.size === 0) return
  const closing = [...up.values()]
  setYielding(true)
  await Promise.all(closing.map((close) => close()))
  // the screen the link leaves closes its own Modal once it isn't focused; until then they stay shut
  setTimeout(() => setYielding(false), YIELD_HOLD_MS)
}

/** Whether a Modal is visible, given whether it's asked to be, and its part in `yieldToLink`. */
function useYielding(open: boolean): { visible: boolean; dismissed: () => void } {
  // the server never yields: without its snapshot React gives up server rendering the page
  // (https://react.dev/reference/react/useSyncExternalStore#adding-support-for-server-rendering)
  const shut = useSyncExternalStore(
    subscribeYield,
    () => yielding,
    () => false,
  )
  const waiting = useRef<(() => void) | null>(null)
  const visible = open && !shut
  useEffect(() => {
    if (Platform.OS !== 'ios' || !visible) return
    const id = Symbol('modal')
    up.set(
      id,
      () =>
        new Promise<void>((resolve) => {
          const done = () => {
            waiting.current = null
            resolve()
          }
          waiting.current = done
          setTimeout(done, YIELD_WAIT_MS)
        }),
    )
    return () => {
      up.delete(id)
    }
  }, [visible])
  return { visible, dismissed: () => waiting.current?.() }
}

export type SheetProps = {
  open: boolean
  onClose: () => void
  /** Once it has gone (React Native's Modal `onDismiss`), after `open` turns false. */
  onDismiss?: () => void
  title: string
  children: ReactNode
  /**
   * Its buttons, pinned under the scrolling body above the home indicator, in a row at its end
   * that wraps (the web renderer's SheetContent footer, mobile/library.tsx's Reset and Show).
   */
  footer?: ReactNode
  /**
   * With a pointer, the edge it comes from (the admin's detail and menu sheets): a panel the
   * window's height at that edge, as the web renderer's SheetContent `side`. Touch and the TV keep
   * the page sheet.
   */
  side?: 'right' | 'left'
  /** A pointer's side sheet: its widest (416 at the right and 320 at the left, the web's). */
  width?: number
  /** A pointer's side sheet: a line under the title. */
  description?: ReactNode
  /** A pointer's side sheet: the title is read but not shown (a menu sheet). */
  hideTitle?: boolean
  /** A pointer's side sheet: its padding, 24 unless given (the admin's menu sheet's 16, the web's p-4). */
  padding?: number
}

export function Sheet(props: SheetProps) {
  const pointer = useTheme().formFactor.input === 'pointer'
  if (pointer && props.side) return <SideSheet {...props} side={props.side} />
  return <PageSheet {...props} />
}

function PageSheet({ open, onClose, title, children, footer, onDismiss }: SheetProps) {
  const theme = useTheme()
  const t = useT(uiMessages)
  const insets = useSafeAreaInsets()
  const titleId = useId()
  const { visible, dismissed } = useYielding(open)
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={() => {
        dismissed()
        onDismiss?.()
      }}
      {...named(titleId)}
    >
      {/* iOS presents a page sheet below the status bar (UIModalPresentationPageSheet), while
          react-native-web's Modal ignores `presentationStyle` and fills the window, so on the web
          the sheet starts below the top inset as iOS's does, over the page's background */}
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.bg,
          paddingTop: Platform.OS === 'web' ? insets.top : 0,
        }}
      >
        <View style={{ flex: 1, backgroundColor: theme.colors.s1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: tokens.space['4'],
              paddingTop: tokens.space['3'],
              minHeight: sheet.header,
            }}
          >
            <Text
              variant="title"
              accessibilityRole="header"
              aria-level={2}
              nativeID={titleId}
              style={{ flex: 1 }}
            >
              {title}
            </Text>
            <Button
              variant="ghost"
              icon="close"
              iconOnly
              accessibilityLabel={t('close')}
              onPress={onClose}
            />
          </View>
          {/* a sheet holds forms: with the default ('never') a tap while the keyboard is up only
              closes it, so its buttons took two taps; 'handled' lets a button take the tap
              (https://reactnative.dev/docs/scrollview#keyboardshouldpersisttaps) */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: tokens.space['4'],
              paddingBottom: footer ? tokens.space['4'] : insets.bottom + tokens.space['6'],
              gap: tokens.space['3'],
            }}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                gap: tokens.space['2'],
                paddingHorizontal: tokens.space['4'],
                paddingTop: tokens.space['3'],
                paddingBottom: insets.bottom + tokens.space['4'],
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

/** A side sheet's widest by its edge (the web renderer's w-[min(26rem,…)] and w-[min(20rem,…)]). */
const SIDE_WIDTH = { right: 416, left: 320 } as const
/** The space a side sheet leaves beside it in a narrow window (the web's 100vw - 2rem). */
const SIDE_MARGIN = tokens.space['8']

/**
 * A pointer's side sheet (web/components/dialog.tsx's SheetContent at `right` or `left`): over the
 * scrim, `s3` with the extra-large corner on its inner side and the fourth elevation, 24 of padding
 * and 20 between its title, body and footer, the whole of it scrolling. Escape and a press on the
 * scrim close it (React Native's Modal `onRequestClose`, which react-native-web calls on Escape).
 */
function SideSheet({
  open,
  onClose,
  onDismiss,
  title,
  description,
  hideTitle,
  children,
  footer,
  side,
  width,
  padding = tokens.space['6'],
}: SheetProps & { side: 'right' | 'left' }) {
  const theme = useTheme()
  const t = useT(uiMessages)
  const titleId = useId()
  const { visible, dismissed } = useYielding(open)
  const scrim = useScrimStyle()
  const corner = tokens.radius.xl
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={() => {
        dismissed()
        onDismiss?.()
      }}
      {...named(titleId)}
    >
      <View
        style={{
          flex: 1,
          flexDirection: side === 'right' ? 'row-reverse' : 'row',
          ...scrim,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            width: width ?? SIDE_WIDTH[side],
            maxWidth: `calc(100% - ${SIDE_MARGIN}px)` as unknown as number,
            height: '100%',
            backgroundColor: theme.colors.s3,
            borderTopLeftRadius: side === 'right' ? corner : 0,
            borderBottomLeftRadius: side === 'right' ? corner : 0,
            borderTopRightRadius: side === 'left' ? corner : 0,
            borderBottomRightRadius: side === 'left' ? corner : 0,
            boxShadow: tokens.elevation[4].boxShadow,
            overflow: 'hidden',
          }}
        >
          <ScrollView contentContainerStyle={{ padding, gap: tokens.space['5'] }}>
            {hideTitle ? (
              <HiddenTitle id={titleId}>{title}</HiddenTitle>
            ) : (
              <View
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space['3'] }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: tokens.space['1'] }}>
                  <Text
                    variant="title"
                    accessibilityRole="header"
                    aria-level={2}
                    nativeID={titleId}
                  >
                    {title}
                  </Text>
                  {description == null ? null : typeof description === 'string' ? (
                    <Text
                      size={tokens.adminText.form.size}
                      leading={tokens.adminText.form.leading}
                      color="text-2"
                    >
                      {description}
                    </Text>
                  ) : (
                    description
                  )}
                </View>
                <TitleClose label={t('close')} onPress={onClose} />
              </View>
            )}
            <View style={{ minWidth: 0 }}>{children}</View>
            {footer ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                  gap: tokens.space['2'],
                }}
              >
                {footer}
              </View>
            ) : null}
          </ScrollView>
        </View>
        {/* the scrim beside it closes it, as the web's overlay does */}
        <Pressable
          accessible={false}
          tabIndex={-1}
          onPress={onClose}
          style={{ flex: 1, alignSelf: 'stretch' }}
        />
      </View>
    </Modal>
  )
}

/** A title read but not shown: HiddenHeading's visually-hidden box, with the id that names the sheet. */
function HiddenTitle({ id, children }: { id: string; children: string }) {
  return (
    <View pointerEvents="none" style={visuallyHidden}>
      <Text accessibilityRole="header" aria-level={2} nativeID={id} numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}

/**
 * Names a Modal by its title. On the web react-native-web's Modal is the `role="dialog"` element
 * and passes its other props to it (exports/Modal/ModalContent.js), and its Text writes `nativeID`
 * as `id`, so the dialog is `aria-labelledby` its title (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
 * React Native's Modal has no such prop.
 */
const named = (id: string) => ({ 'aria-labelledby': id }) as object

/** A pointer's dialog's widest, by its size (the web renderer's). */
const DIALOG_WIDTH = { sm: 400, md: 560, lg: 800 } as const

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closable = false,
}: {
  open: boolean
  /** Without it the dialog must be answered by its footer. */
  onClose?: () => void
  title: string
  /** A line under the title, in the admin's form type and `text-2` (the web's DialogContent's). */
  description?: string
  children?: ReactNode
  /** Its buttons: with a pointer in a row at its end that wraps; by touch as they're given. */
  footer?: ReactNode
  /** A pointer: how wide it may grow (md by default). Touch's fills the screen's width less its margin. */
  size?: keyof typeof DIALOG_WIDTH
  /** Draws the close button beside the title (with `onClose`). */
  closable?: boolean
}) {
  const theme = useTheme()
  const t = useT(uiMessages)
  const pointer = theme.formFactor.input === 'pointer'
  const titleId = useId()
  const { visible, dismissed } = useYielding(open)
  const scrim = useScrimStyle()
  return (
    <Modal
      visible={visible}
      transparent
      onDismiss={dismissed}
      animationType="fade"
      onRequestClose={onClose ?? (() => {})}
      statusBarTranslucent
      {...named(titleId)}
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: pointer ? 'center' : undefined,
          padding: tokens.space['6'],
          ...scrim,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            width: pointer ? '100%' : undefined,
            maxWidth: pointer ? DIALOG_WIDTH[size] : undefined,
            maxHeight: '100%',
            gap: tokens.space['4'],
            padding: tokens.space['5'],
            borderRadius: tokens.radius.lg,
            backgroundColor: theme.colors.s3,
            borderWidth: line.thin,
            borderColor: theme.colors.line,
            boxShadow: tokens.elevation[4].boxShadow,
          }}
        >
          {closable && onClose ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space['3'] }}
            >
              <Text
                variant="title"
                accessibilityRole="header"
                aria-level={2}
                nativeID={titleId}
                style={{ flex: 1 }}
              >
                {title}
              </Text>
              <TitleClose label={t('close')} onPress={onClose} />
            </View>
          ) : (
            <Text variant="title" accessibilityRole="header" aria-level={2} nativeID={titleId}>
              {title}
            </Text>
          )}
          {description ? (
            <Text
              size={tokens.adminText.form.size}
              leading={tokens.adminText.form.leading}
              color="text-2"
              style={{ marginTop: -tokens.space['3'] }}
            >
              {description}
            </Text>
          ) : null}
          {/* a body taller than the window scrolls between the title and the footer, which stay
              in view, as the web's dialogs did; menus open in their own Modal, so nothing is clipped */}
          {children ? (
            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: tokens.space['4'] }}
            >
              {children}
            </ScrollView>
          ) : null}
          {footer && pointer ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                gap: tokens.space['2'],
              }}
            >
              {footer}
            </View>
          ) : (
            footer
          )}
        </View>
      </View>
    </Modal>
  )
}

/**
 * The close button beside a sheet's or dialog's title, centred on the title's first line: the row
 * tops them both (a title that wraps keeps its first line by the button, as the web's
 * `items-start` header), and the button, taller than the title's line, is raised by half the
 * difference so its icon sits on that line rather than below it (HT-4).
 */
function TitleClose({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme()
  const m = useControl('sm')
  const line = textStyle(theme, 'title').lineHeight
  return (
    <View style={{ marginTop: Math.min(0, (line - m.height) / 2) }}>
      <Button
        variant="ghost"
        size="sm"
        icon="close"
        iconOnly
        accessibilityLabel={label}
        onPress={onPress}
      />
    </View>
  )
}
