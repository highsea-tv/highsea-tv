'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A multi-select: a select whose value is a set (stage 6's wish, design system 1.1 part B). The
// trigger is a select's field; the list is Radix's DropdownMenu with checkbox items, which gives
// the arrow keys, typeahead and `menuitemcheckbox` with its checked state. Choosing an item keeps
// the menu open by preventing its `onSelect`, as Radix documents
// (https://www.radix-ui.com/primitives/docs/components/dropdown-menu#checkboxitem).
import { DropdownMenu } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import type { ChoiceOption, MultiSelectCommon } from '../../shared/controls.ts'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { controlHit, controlSizes } from '../lib/control.ts'
import { controlBase, useFieldControl, useFieldState } from './field.tsx'
import { floatingSurface, menuItem } from './overlay.ts'

export type MultiSelectProps<V extends string = string> = MultiSelectCommon<V, IconName> & {
  id?: string
  className?: string
  'aria-describedby'?: string
  /** What the trigger shows once something is chosen. By default, the choices' labels in order. */
  summary?: (chosen: ChoiceOption<V, IconName>[]) => ReactNode
}

export function MultiSelect<V extends string = string>({
  options,
  value: controlled,
  defaultValue,
  onValueChange,
  placeholder,
  size: ownSize,
  disabled: ownDisabled,
  summary,
  id,
  className,
  'aria-label': ariaLabel,
  'aria-describedby': describedBy,
}: MultiSelectProps<V>) {
  const [uncontrolled, setUncontrolled] = useState<V[]>(defaultValue ?? [])
  const value = controlled ?? uncontrolled
  const control = useFieldControl({ id, 'aria-describedby': describedBy })
  const { size, disabled } = useFieldState({ size: ownSize, disabled: ownDisabled })
  const s = controlSizes[size]
  const chosen = options.filter((o) => value.includes(o.value))
  const toggle = (v: V, on: boolean) => {
    // keep the options' order, whatever order they were picked in
    const next = options.map((o) => o.value).filter((o) => (o === v ? on : value.includes(o)))
    setUncontrolled(next)
    onValueChange?.(next)
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        {...control}
        disabled={disabled}
        aria-label={ariaLabel}
        data-control="multi-select"
        data-placeholder={chosen.length === 0 ? '' : undefined}
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
          {chosen.length === 0
            ? placeholder
            : summary
              ? summary(chosen)
              : chosen.map((o) => o.label).join(', ')}
        </span>
        <Icon name="chevron-down" className={cn(s.icon, 'shrink-0 text-text-3')} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            floatingSurface,
            'max-h-(--radix-dropdown-menu-content-available-height) min-w-(--radix-dropdown-menu-trigger-width) origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto p-1.5',
          )}
        >
          {options.map((o) => (
            <DropdownMenu.CheckboxItem
              key={o.value}
              checked={value.includes(o.value)}
              disabled={o.disabled}
              onCheckedChange={(on) => toggle(o.value, on === true)}
              onSelect={(e) => e.preventDefault()}
              className={cn(menuItem, 'pe-8')}
            >
              {o.icon && <Icon name={o.icon} size={16} />}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <DropdownMenu.ItemIndicator className="absolute end-2.5 inline-flex">
                <Icon name="check" size={16} className="text-accent-text" />
              </DropdownMenu.ItemIndicator>
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
