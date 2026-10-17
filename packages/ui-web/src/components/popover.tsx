// SPDX-License-Identifier: AGPL-3.0-only
import { Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'
import { floatingSurface } from './overlay.ts'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverClose = PopoverPrimitive.Close
export const PopoverAnchor = PopoverPrimitive.Anchor

export function PopoverContent({
  className,
  sideOffset = 8,
  align = 'start',
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn(
          floatingSurface,
          'w-72 max-w-(--radix-popover-content-available-width) origin-(--radix-popover-content-transform-origin) p-4 text-ui',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
