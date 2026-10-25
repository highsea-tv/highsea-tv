'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Dialogs and sheets. Both rise with spring.base and leave with a 140ms fade (motion.md); they
// sit at elevation level 4 over a blurred `bg` scrim (elevation.md).
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { Button } from './button.tsx'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

const scrim =
  'fixed inset-0 z-50 glass-scrim data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out'

function CloseButton() {
  return (
    <DialogPrimitive.Close asChild>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon="close"
        aria-label="Close"
        className="-me-1.5"
      />
    </DialogPrimitive.Close>
  )
}

type HeaderProps = { title: ReactNode; description?: ReactNode; closable: boolean }

function Header({ title, description, closable }: HeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid min-w-0 flex-1 gap-1">
        <DialogPrimitive.Title className="text-title [overflow-wrap:anywhere]">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="text-form text-text-2 [overflow-wrap:anywhere]">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      {closable && <CloseButton />}
    </div>
  )
}

export type DialogContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  /** Buttons, end-aligned under the body. The primary action goes last. */
  footer?: ReactNode
  /** Shows the close button. Default true. */
  closable?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const widths = { sm: 'max-w-100', md: 'max-w-140', lg: 'max-w-200' }

export function DialogContent({
  title,
  description,
  footer,
  closable = true,
  size = 'md',
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      {/* the overlay doubles as the scroll container, so tall dialogs scroll with the page */}
      <DialogPrimitive.Overlay
        className={cn(scrim, 'grid place-items-center overflow-y-auto p-4 medium:p-10')}
      >
        <DialogPrimitive.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-5 rounded-lg bg-s3 p-6 text-text shadow-4 outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-dialog-in',
            widths[size],
            className,
          )}
          {...props}
        >
          <Header title={title} description={description} closable={closable} />
          {children}
          {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  )
}

export type ConfirmDialogProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The element that opens it. */
  trigger?: ReactNode
  title: ReactNode
  /** Explain the consequences before confirming (accessibility.md#understandable). */
  description: ReactNode
  confirmLabel: ReactNode
  cancelLabel?: ReactNode
  /** Destructive confirmations use the danger fill. */
  destructive?: boolean
  onConfirm: () => void
}

/** A yes/no decision. Cancel takes initial focus for destructive actions. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  ...root
}: ConfirmDialogProps) {
  return (
    <Dialog {...root}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        size="sm"
        role="alertdialog"
        title={title}
        description={description}
        closable={false}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" autoFocus={destructive}>
                {cancelLabel}
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </DialogClose>
          </>
        }
      />
    </Dialog>
  )
}

// ---------- sheets

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export type SheetSide = 'bottom' | 'right' | 'left'

const sides: Record<SheetSide, string> = {
  bottom:
    'inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full max-w-160 rounded-t-xl pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-sheet-in-bottom',
  right:
    'inset-y-0 end-0 h-dvh w-[min(26rem,100vw-2rem)] rounded-s-xl data-[state=open]:animate-sheet-in-right',
  left: 'inset-y-0 start-0 h-dvh w-[min(20rem,100vw-2rem)] rounded-e-xl data-[state=open]:animate-sheet-in-left',
}

export type SheetContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  /** Hides the title visually (it's still announced). For menu sheets. */
  hideTitle?: boolean
  side?: SheetSide
  footer?: ReactNode
}

export function SheetContent({
  title,
  description,
  hideTitle = false,
  side = 'bottom',
  footer,
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={scrim} />
      <DialogPrimitive.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed z-50 flex flex-col gap-5 overflow-y-auto bg-s3 p-6 text-text shadow-4 outline-none data-[state=closed]:animate-fade-out',
          sides[side],
          className,
        )}
        {...props}
      >
        {side === 'bottom' && (
          <div
            aria-hidden
            className="-mt-2.5 mx-auto h-1 w-9 shrink-0 rounded-full bg-line-strong"
          />
        )}
        {hideTitle ? (
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        ) : (
          <Header title={title} description={description} closable />
        )}
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
