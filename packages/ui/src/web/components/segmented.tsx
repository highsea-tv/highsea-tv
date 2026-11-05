'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A segmented control: one choice from a few, as a radio group with a sliding thumb (measured in
// the control, so page scrolls and layout shifts never move it). One look with segmented tabs
// (controls.md › Rules): an `s2` track at the control's height, a `control-selected` thumb.
// Radix's RadioGroup gives the arrow keys and roving focus
// (https://www.radix-ui.com/primitives/docs/components/radio-group#keyboard-interactions).
import { RadioGroup } from 'radix-ui'
import { type ReactNode, useRef, useState } from 'react'
import type { ChoiceOption, SegmentedCommon } from '../../shared/controls.ts'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import {
  controlHit,
  controlSizes,
  segmentedItem,
  segmentedThumb,
  segmentedTrack,
} from '../lib/control.ts'
import { Indicator, useIndicator } from '../lib/indicator.tsx'

/** `ChoiceOption`, with room on the web for a label that isn't plain text. */
export type SegmentedOption<V extends string = string> = Omit<
  ChoiceOption<V, IconName>,
  'label'
> & { label: ReactNode }

export type SegmentedControlProps<V extends string = string> = Omit<
  SegmentedCommon<V, IconName>,
  'options'
> & {
  options: SegmentedOption<V>[]
  className?: string
}

export function SegmentedControl<V extends string = string>({
  options,
  value: controlled,
  defaultValue,
  onValueChange,
  size = 'md',
  block = false,
  className,
  ...aria
}: SegmentedControlProps<V>) {
  const [uncontrolled, setUncontrolled] = useState<string>(defaultValue ?? options[0]?.value ?? '')
  const value = controlled ?? uncontrolled
  const ref = useRef<HTMLDivElement>(null)
  const box = useIndicator(ref, value)
  const s = controlSizes[size]
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => {
        setUncontrolled(next)
        onValueChange?.(next as V)
      }}
      orientation="horizontal"
      ref={ref}
      data-control="segmented-control"
      className={cn(
        segmentedTrack[size],
        // wider than its column (200% text on a phone), it scrolls rather than pushing the page
        'overflow-x-auto [scrollbar-width:none]',
        block && 'flex w-full',
        className,
      )}
      {...aria}
    >
      <Indicator box={box} className={segmentedThumb} />
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            segmentedItem[size],
            controlHit,
            'data-[state=checked]:font-semibold data-[state=checked]:text-text',
            block && 'flex-1',
          )}
        >
          {o.icon && <Icon name={o.icon} className={cn(s.icon, 'relative')} />}
          <span className="relative">{o.label}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
