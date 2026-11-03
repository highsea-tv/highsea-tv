// SPDX-License-Identifier: AGPL-3.0-only
// Sheets and dialogs. A sheet is iOS's own page sheet, which swipes down to close
// (mobile.md › Platform conventions; https://reactnative.dev/docs/modal#presentationstyle-ios). A
// dialog is a card over a scrim in the middle of the screen; one that must be acknowledged has no
// way out but its button.
import type { ReactNode } from 'react'
import { Modal, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from './button.tsx'
import { ScrollView } from './scroll-view.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
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
          <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
          <Button
            variant="ghost"
            icon="close"
            iconOnly
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </View>
        <ScrollView
          contentContainerStyle={{
            padding: tokens.space['4'],
            paddingBottom: insets.bottom + tokens.space['6'],
            gap: tokens.space['3'],
          }}
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  )
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  /** Without it the dialog must be answered by its footer. */
  onClose?: () => void
  title: string
  children?: ReactNode
  footer?: ReactNode
}) {
  const theme = useTheme()
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose ?? (() => {})}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: tokens.space['6'],
          backgroundColor: 'rgba(0,0,0,0.6)',
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            gap: tokens.space['4'],
            padding: tokens.space['5'],
            borderRadius: tokens.radius.lg,
            backgroundColor: theme.colors.s3,
            borderWidth: 1,
            borderColor: theme.colors.line,
            boxShadow: tokens.elevation[4].boxShadow,
          }}
        >
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {children}
          {footer}
        </View>
      </View>
    </Modal>
  )
}
