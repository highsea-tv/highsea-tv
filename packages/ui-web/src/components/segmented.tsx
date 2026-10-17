// SPDX-License-Identifier: AGPL-3.0-only
// A segmented control: one choice from a few, as a radio group with a sliding thumb.
import { motion } from 'motion/react'
import { RadioGroup } from 'radix-ui'
import { type ReactNode, useId, useState } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { springQuick } from '../lib/motion.ts'

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
  const id = useId()
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => {
        setUncontrolled(next)
        onValueChange?.(next)
      }}
      orientation="horizontal"
      className={cn('inline-flex rounded-full border border-line bg-s2 p-[3px]', className)}
      {...aria}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'relative inline-flex cursor-pointer items-center gap-1.5 rounded-full text-text-3 transition-tint hover:text-text-2 data-[state=checked]:text-text',
            size === 'md' ? 'h-7.5 px-3.5 text-ui' : 'h-6 px-2.5 text-[12px]',
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`${id}-thumb`}
              transition={springQuick}
              aria-hidden
              className="absolute inset-0 rounded-full bg-s4 shadow-2"
            />
          )}
          {o.icon && <Icon name={o.icon} size={16} className="relative" />}
          <span className="relative">{o.label}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
