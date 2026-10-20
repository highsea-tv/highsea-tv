'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Level 3 (elevation.md): `s4` with `text` only, the level-3 shadow.
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { Kbd } from './kbd.tsx'

export const TooltipProvider = TooltipPrimitive.Provider

export type TooltipProps = {
  content: ReactNode
  /** A keyboard shortcut shown after the text. */
  shortcut?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Turns the tooltip off (for example, when a rail expands and labels are visible). */
  disabled?: boolean
  /** Controlled open state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  /** One focusable element. */
  children: ReactElement
}

export function Tooltip({
  content,
  shortcut,
  side = 'top',
  disabled,
  open,
  onOpenChange,
  className,
  children,
}: TooltipProps) {
  if (disabled) return children
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-50 flex max-w-64 origin-(--radix-tooltip-content-transform-origin) items-center gap-2 rounded-sm bg-s4 px-2.5 py-1.5 text-caption text-text shadow-3 data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in',
            className,
          )}
        >
          {content}
          {shortcut && <Kbd className="border-line-strong text-text">{shortcut}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
