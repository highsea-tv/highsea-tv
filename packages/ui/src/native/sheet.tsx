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
import { type ReactNode, useId } from 'react'
import { Modal, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from './button.tsx'
import { uiMessages } from './messages.ts'
import { ScrollView } from './scroll-view.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  onDismiss,
}: {
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
}) {
  const theme = useTheme()
  const t = useT(uiMessages)
  const insets = useSafeAreaInsets()
  const titleId = useId()
  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      {...named(titleId)}
    >
      <View style={{ flex: 1, backgroundColor: theme.colors.s1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: tokens.space['4'],
            paddingTop: tokens.space['3'],
            minHeight: 56,
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
        <ScrollView
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
    </Modal>
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
  children,
  footer,
  size = 'md',
  closable = false,
}: {
  open: boolean
  /** Without it the dialog must be answered by its footer. */
  onClose?: () => void
  title: string
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
  return (
    <Modal
      visible={open}
      transparent
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
          backgroundColor: 'rgba(0,0,0,0.6)',
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            width: pointer ? '100%' : undefined,
            maxWidth: pointer ? DIALOG_WIDTH[size] : undefined,
            gap: tokens.space['4'],
            padding: tokens.space['5'],
            borderRadius: tokens.radius.lg,
            backgroundColor: theme.colors.s3,
            borderWidth: 1,
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
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                iconOnly
                accessibilityLabel={t('close')}
                onPress={onClose}
              />
            </View>
          ) : (
            <Text variant="title" accessibilityRole="header" aria-level={2} nativeID={titleId}>
              {title}
            </Text>
          )}
          {children}
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
