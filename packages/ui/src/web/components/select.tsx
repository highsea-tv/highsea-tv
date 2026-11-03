'use client'
// SPDX-License-Identifier: AGPL-3.0-only
import { Select as SelectPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { type ControlSize, controlHit, controlSizes } from '../lib/control.ts'
import { controlBase, useFieldControl, useFieldState } from './field.tsx'
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
  /** As tall as a field and a button: 36, or 30 in dense places (controls.md). */
  size?: ControlSize
}

export function Select({
  options,
  placeholder,
  id,
  className,
  children,
  'aria-label': ariaLabel,
  size: ownSize,
  disabled: ownDisabled,
  ...props
}: SelectProps) {
  const { size, disabled } = useFieldState({ size: ownSize, disabled: ownDisabled })
  const s = controlSizes[size]
  const control = useFieldControl({
    id,
    'aria-describedby': props['aria-describedby'],
    'aria-invalid': props['aria-invalid'],
  })
  return (
    <SelectPrimitive.Root disabled={disabled} {...props}>
      <SelectPrimitive.Trigger
        {...control}
        data-control="select"
        aria-label={ariaLabel}
        className={cn(
          controlBase,
          controlHit,
          s.h,
          s.fieldPad,
          s.gap,
          s.text,
          'flex cursor-pointer items-center justify-between text-start data-[placeholder]:text-text-3',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <Icon name="chevron-down" className={cn(s.icon, 'text-text-3')} />
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
