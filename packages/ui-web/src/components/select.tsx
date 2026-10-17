// SPDX-License-Identifier: AGPL-3.0-only
import { Select as SelectPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { controlBase, useFieldControl } from './field.tsx'
import { floatingSurface, menuItem } from './overlay.ts'

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean }

export type SelectProps = Omit<ComponentProps<typeof SelectPrimitive.Root>, 'children'> & {
  options?: SelectOption[]
  placeholder?: ReactNode
  id?: string
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  /** Custom content (`SelectItem`, `SelectGroup`) instead of `options`. */
  children?: ReactNode
}

export function Select({
  options,
  placeholder,
  id,
  className,
  children,
  'aria-label': ariaLabel,
  ...props
}: SelectProps) {
  const control = useFieldControl({
    id,
    'aria-describedby': props['aria-describedby'],
    'aria-invalid': props['aria-invalid'],
  })
  return (
    <SelectPrimitive.Root {...props}>
      <SelectPrimitive.Trigger
        {...control}
        aria-label={ariaLabel}
        className={cn(
          controlBase,
          'flex h-(--size-input) cursor-pointer items-center justify-between gap-2 px-3 text-start data-[placeholder]:text-text-3',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <Icon name="chevron-down" size={16} className="text-text-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            floatingSurface,
            'max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-hidden',
          )}
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {children ??
              options?.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn(menuItem, 'pe-8', className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute end-2.5 inline-flex">
        <Icon name="check" size={16} className="text-accent-text" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export function SelectGroup({
  label,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Group> & { label: ReactNode }) {
  return (
    <SelectPrimitive.Group {...props}>
      <SelectPrimitive.Label className="px-2.5 pt-2 pb-1 font-mono text-label text-text-3 uppercase">
        {label}
      </SelectPrimitive.Label>
      {children}
    </SelectPrimitive.Group>
  )
}

export function SelectSeparator() {
  return <SelectPrimitive.Separator className="mx-1 my-1.5 h-px bg-line" />
}
