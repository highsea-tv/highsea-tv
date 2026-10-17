// SPDX-License-Identifier: AGPL-3.0-only
// Action menus (row menus, "more" buttons). Every row action is reachable from one (admin.md#tables).
import { DropdownMenu } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { Kbd } from './kbd.tsx'
import { floatingSurface, menuItem } from './overlay.ts'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger
export const MenuGroup = DropdownMenu.Group

export function MenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          floatingSurface,
          'min-w-56 origin-(--radix-dropdown-menu-content-transform-origin) p-1.5',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

export type MenuItemProps = ComponentProps<typeof DropdownMenu.Item> & {
  icon?: IconName
  shortcut?: string
  /** Destructive actions read in the danger label color. */
  danger?: boolean
  children: ReactNode
}

export function MenuItem({ icon, shortcut, danger, className, children, ...props }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className={cn(
        menuItem,
        danger && 'text-badge-danger data-[highlighted]:text-badge-danger',
        className,
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <Kbd className="ms-auto">{shortcut}</Kbd>}
    </DropdownMenu.Item>
  )
}

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(menuItem, 'pe-8', className)} {...props}>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <DropdownMenu.ItemIndicator className="absolute end-2.5 inline-flex">
        <Icon name="check" size={16} className="text-accent-text" />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.CheckboxItem>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2.5 pt-2 pb-1 font-mono text-label text-text-3 uppercase', className)}
      {...props}
    />
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
}
