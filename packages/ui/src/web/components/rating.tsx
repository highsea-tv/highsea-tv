'use client'
// SPDX-License-Identifier: AGPL-3.0-only
import { RadioGroup } from 'radix-ui'
import { useState } from 'react'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'

export type RatingProps = {
  /** 0–max, fractions allowed. */
  value: number
  max?: number
  size?: number
  /** Shows the number after the stars, in mono. */
  showValue?: boolean
  className?: string
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** A read-only star rating. Filled stars use the accent; the value is always in the label. */
export function Rating({ value, max = 5, size = 16, showValue = false, className }: RatingProps) {
  const clamped = Math.min(max, Math.max(0, value))
  const stars = Array.from({ length: max }, (_, i) => i)
  return (
    <span
      role="img"
      aria-label={`Rated ${fmt(clamped)} out of ${max}`}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <span className="relative inline-flex">
        <span className="inline-flex text-s4">
          {stars.map((i) => (
            <Icon key={i} name="star" size={size} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        <span
          className="absolute inset-y-0 start-0 inline-flex overflow-hidden text-accent"
          style={{ width: `${(clamped / max) * 100}%` }}
        >
          {stars.map((i) => (
            <Icon
              key={i}
              name="star"
              size={size}
              fill="currentColor"
              strokeWidth={0}
              className="shrink-0"
            />
          ))}
        </span>
      </span>
      {showValue && <span className="font-mono text-figure text-text-2">{fmt(clamped)}</span>}
    </span>
  )
}

export type RatingInputProps = {
  value?: number
  defaultValue?: number
  onValueChange?: (value: number) => void
  max?: number
  size?: number
  'aria-label': string
  className?: string
}

/** Pick a rating: a radio group of stars. Arrow keys move; hovering previews. */
export function RatingInput({
  value: controlled,
  defaultValue = 0,
  onValueChange,
  max = 5,
  size = 24,
  className,
  ...aria
}: RatingInputProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const [hover, setHover] = useState<number | null>(null)
  const value = controlled ?? uncontrolled
  const shown = hover ?? value
  return (
    <RadioGroup.Root
      value={value ? String(value) : ''}
      onValueChange={(v) => {
        const n = Number(v)
        setUncontrolled(n)
        onValueChange?.(n)
      }}
      orientation="horizontal"
      onPointerLeave={() => setHover(null)}
      className={cn('inline-flex', className)}
      {...aria}
    >
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <RadioGroup.Item
          key={n}
          value={String(n)}
          aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
          onPointerEnter={() => setHover(n)}
          className={cn(
            'grid cursor-pointer place-items-center rounded-sm p-0.5 transition-press motion-safe:active:scale-90',
            n <= shown ? 'text-accent' : 'text-text-3',
          )}
        >
          <Icon
            name="star"
            size={size}
            fill={n <= shown ? 'currentColor' : 'none'}
            strokeWidth={n <= shown ? 0 : 1.75}
          />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
