'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A segmented control: one choice from a few, as a radio group with a sliding thumb (measured in
// the control, so page scrolls and layout shifts never move it).
import { RadioGroup } from 'radix-ui'
import { type ReactNode, useRef, useState } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { Indicator, useIndicator } from '../lib/indicator.tsx'

export type SegmentedOption = { value: string; label: ReactNode; icon?: IconName }

export type SegmentedControlProps = {
  options: SegmentedOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  'aria-label': string
  size?: 'md' | 'sm'
  className?: string
}

export function SegmentedControl({
  options,
  value: controlled,
  defaultValue,
  onValueChange,
  size = 'md',
  className,
  ...aria
}: SegmentedControlProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? options[0]?.value ?? '')
  const value = controlled ?? uncontrolled
  const ref = useRef<HTMLDivElement>(null)
  const box = useIndicator(ref, value)
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => {
        setUncontrolled(next)
        onValueChange?.(next)
      }}
      orientation="horizontal"
      ref={ref}
      className={cn(
        'relative inline-flex rounded-full border border-line bg-s2 p-[3px]',
        className,
      )}
      {...aria}
    >
      <Indicator box={box} className="inset-y-[3px] rounded-full bg-s4 shadow-2" />
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full text-text-3 transition-tint hover:text-text-2 data-[state=checked]:text-text',
            size === 'md' ? 'h-7.5 px-3.5 text-ui' : 'h-6 px-2.5 text-[12px]',
          )}
        >
          {o.icon && <Icon name={o.icon} size={16} className="relative" />}
          <span className="relative">{o.label}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
