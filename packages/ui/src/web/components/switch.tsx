'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The toggles on the control spec (controls.md): a switch, a checkbox and a radio, with the shared
// `ToggleCommon` props plus Radix's. Off is `control-edge`, which reaches 3:1 on every surface
// (WCAG 1.4.11), and on is the accent fill. Each takes the touch hit area; a `label` puts the words
// beside it, inside a <label> so a click on them toggles it too
// (https://html.spec.whatwg.org/multipage/forms.html#the-label-element).
import {
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioPrimitive,
  Switch as SwitchPrimitive,
} from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import type { ToggleCommon } from '../../shared/controls.ts'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { controlDisabled, controlHit, controlInnerShape, controlSizes } from '../lib/control.ts'
import { useFieldControl } from './field.tsx'

/** The words beside a toggle, at the control's text size. */
function Labelled({
  label,
  hideLabel,
  children,
}: {
  label?: string
  hideLabel?: boolean
  children: ReactNode
}) {
  if (!label || hideLabel) return children
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is its child, Radix's <button role="checkbox">, a labelable element
    <label
      className={cn(
        controlSizes.md.gap,
        controlSizes.md.text,
        'inline-flex cursor-pointer items-center text-text has-[:disabled]:cursor-default has-[:disabled]:opacity-45',
      )}
    >
      {children}
      <span>{label}</span>
    </label>
  )
}

export type SwitchProps = Omit<ComponentProps<typeof SwitchPrimitive.Root>, keyof ToggleCommon> &
  ToggleCommon

/** A toggle: `control-edge` off, the accent fill on; the thumb travels with spring.quick. */
export function Switch({ className, label, hideLabel, ...props }: SwitchProps) {
  const control = useFieldControl(props)
  return (
    <Labelled label={label} hideLabel={hideLabel}>
      <SwitchPrimitive.Root
        {...props}
        aria-label={hideLabel ? label : props['aria-label']}
        {...control}
        data-control="switch"
        className={cn(
          // a switch's track is round on every platform, as the OS's are (controls.md › Looks)
          'inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full bg-control-edge p-[3px] transition-tint data-[state=checked]:bg-accent-fill',
          controlHit,
          controlDisabled,
          className,
        )}
      >
        <SwitchPrimitive.Thumb className="block size-4.5 rounded-full bg-text shadow-2 transition-press data-[state=checked]:translate-x-4 data-[state=checked]:bg-on-accent rtl:data-[state=checked]:-translate-x-4" />
      </SwitchPrimitive.Root>
    </Labelled>
  )
}

export type CheckboxProps = Omit<
  ComponentProps<typeof CheckboxPrimitive.Root>,
  'disabled' | 'defaultChecked' | 'onCheckedChange'
> &
  Omit<ToggleCommon, 'checked' | 'onCheckedChange'> & {
    /** `ToggleCommon`'s, plus the web's mixed state for a parent of some checked rows. */
    checked?: boolean | 'indeterminate'
    onCheckedChange?: (checked: boolean | 'indeterminate') => void
  }

/** The box is 18px in the control's corner less its inset; its hit area grows to 24 (WCAG 2.5.8). */
const box = `inline-grid size-4.5 shrink-0 cursor-pointer place-items-center border border-control-edge bg-s1 text-on-accent transition-tint before:absolute before:-inset-[3px] ${controlInnerShape}`

export function Checkbox({ className, label, hideLabel, ...props }: CheckboxProps) {
  const control = useFieldControl(props)
  return (
    <Labelled label={label} hideLabel={hideLabel}>
      <CheckboxPrimitive.Root
        {...props}
        aria-label={hideLabel ? label : props['aria-label']}
        {...control}
        data-control="checkbox"
        className={cn(
          box,
          controlHit,
          controlDisabled,
          'data-[state=checked]:border-transparent data-[state=checked]:bg-accent-fill data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-accent-fill',
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
    </Labelled>
  )
}

/**
 * Radios: one choice from a list, where a segmented control would be too wide (Settings' longer
 * choices). Radix's RadioGroup gives the arrow keys and roving focus
 * (https://www.radix-ui.com/primitives/docs/components/radio-group).
 */
export function RadioGroup({ className, ...props }: ComponentProps<typeof RadioPrimitive.Root>) {
  const control = useFieldControl(props)
  return <RadioPrimitive.Root {...props} {...control} className={cn('grid gap-2', className)} />
}

export type RadioProps = Omit<ComponentProps<typeof RadioPrimitive.Item>, 'disabled'> &
  Pick<ToggleCommon, 'disabled' | 'label' | 'hideLabel'>

/** One radio: an 18px ring, the accent fill with a dot when chosen. */
export function Radio({ className, label, hideLabel, ...props }: RadioProps) {
  return (
    <Labelled label={label} hideLabel={hideLabel}>
      <RadioPrimitive.Item
        {...props}
        aria-label={hideLabel ? label : props['aria-label']}
        data-control="radio"
        className={cn(
          'inline-grid size-4.5 shrink-0 cursor-pointer place-items-center rounded-full border border-control-edge bg-s1 transition-tint before:absolute before:-inset-[3px] data-[state=checked]:border-transparent data-[state=checked]:bg-accent-fill',
          controlHit,
          controlDisabled,
          className,
        )}
      >
        <RadioPrimitive.Indicator className="block size-2 rounded-full bg-on-accent" />
      </RadioPrimitive.Item>
    </Labelled>
  )
}
