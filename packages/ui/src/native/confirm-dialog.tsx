// SPDX-License-Identifier: AGPL-3.0-only
// The admin's confirmation (the web renderer's ConfirmDialog, web/components/dialog.tsx): a small
// dialog read as an alert dialog (https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/) with
// its question, a line under it, Cancel and the action. A destructive action is the danger
// button, and focus starts on Cancel so Enter never destroys by accident. Choosing either
// closes it; the action's `onConfirm` runs after.
// On the web it's read as `dialog`, not `alertdialog` as the web renderer's Radix AlertDialog is:
// react-native-web's Modal writes `role: 'dialog'` after the props it passes on
// (exports/Modal/ModalContent.js), so no prop can change it. It's still modal, named by its
// question, and focus starts on Cancel.
import type { ReactNode } from 'react'
import { Button } from './button.tsx'
import { Dialog } from './sheet.tsx'
import { Text } from './text.tsx'
import { tokens } from './theme.tsx'

export type ConfirmDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const ui = tokens.adminText.form
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onPress={() => {
              onClose()
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description == null ? null : typeof description === 'string' ? (
        <Text size={ui.size} leading={ui.leading} color="text-2">
          {description}
        </Text>
      ) : (
        description
      )}
    </Dialog>
  )
}
