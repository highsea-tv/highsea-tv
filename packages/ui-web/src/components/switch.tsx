// SPDX-License-Identifier: AGPL-3.0-only
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive } from 'radix-ui'
import type { ComponentProps } from 'react'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { useFieldControl } from './field.tsx'

/** A toggle: `s4` off, the accent fill on; the thumb travels with spring.quick. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  const control = useFieldControl(props)
  return (
    <SwitchPrimitive.Root
      {...props}
      {...control}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-s4 p-[3px] transition-tint data-[state=checked]:bg-accent-fill disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="block size-4.5 rounded-full bg-text shadow-2 transition-press data-[state=checked]:translate-x-4 data-[state=checked]:bg-on-accent rtl:data-[state=checked]:-translate-x-4" />
    </SwitchPrimitive.Root>
  )
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  const control = useFieldControl(props)
  return (
    <CheckboxPrimitive.Root
      {...props}
      {...control}
      className={cn(
        // the visible box is 18px; the hit area grows to 24px (WCAG 2.5.8)
        'relative inline-grid size-4.5 shrink-0 cursor-pointer place-items-center rounded-[5px] border border-line-strong bg-s1 text-on-accent transition-tint before:absolute before:-inset-[3px] data-[state=checked]:border-transparent data-[state=checked]:bg-accent-fill data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-accent-fill disabled:pointer-events-none disabled:opacity-45',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center">
        <Icon
          name={props.checked === 'indeterminate' ? 'remove' : 'check'}
          size={14}
          strokeWidth={2.5}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
