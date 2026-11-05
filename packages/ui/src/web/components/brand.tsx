// SPDX-License-Identifier: AGPL-3.0-only
// The highsea mark and lockup for product UI: live text and a live mark that follows the theme's
// accent (docs/brand/logo.md). The outlined files in @highsea-tv/brand are for everywhere else.
import { MARK_GRID, MARK_SMALL_BELOW, markGeometry } from '@highsea-tv/brand'
import { type ComponentProps, useId } from 'react'
import { cn } from '../lib/cn.ts'

export type MarkProps = {
  /** px. Below 24 the small variant (wider cuts) is used. */
  size?: number
  /** `brand`: the accent gradient. `mono`: currentColor. */
  paint?: 'brand' | 'mono'
  /** Names the mark. Without it the mark is decorative. */
  label?: string
  className?: string
}

export function Mark({ size = 24, paint = 'brand', label, className }: MarkProps) {
  const id = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const g = markGeometry
  const cut = size < MARK_SMALL_BELOW ? g.cutSmall : g.cut
  return (
    <svg
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('shrink-0', className)}
    >
      <defs>
        {paint === 'brand' && (
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--color-accent)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-accent-2)' }} />
          </linearGradient>
        )}
        <mask
          id={`${id}-m`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={MARK_GRID}
          height={MARK_GRID}
        >
          <rect width={MARK_GRID} height={MARK_GRID} fill="#fff" />
          {g.swells.map((d) => (
            <path key={d} d={d} stroke="#000" strokeWidth={cut} fill="none" strokeLinecap="round" />
          ))}
        </mask>
      </defs>
      <circle
        cx={g.disc.cx}
        cy={g.disc.cy}
        r={g.disc.r}
        fill={paint === 'brand' ? `url(#${id}-g)` : 'currentColor'}
        mask={`url(#${id}-m)`}
      />
    </svg>
  )
}

/**
 * The lockup from live text: the mark in a 1.15em box, 0.42em before `highsea tv`. Keep it at
 * least 96px wide; below that use the mark alone.
 */
export function Lockup({
  size = 17,
  className,
  style,
  ...props
}: ComponentProps<'span'> & {
  /** Font size in px. The mark switches to its small variant when its box is under 24px. */
  size?: number
}) {
  const markPx = Math.round(size * 1.15)
  return (
    <span
      role="img"
      aria-label="highsea tv"
      className={cn('inline-flex items-center gap-[0.42em] leading-none', className)}
      style={{ fontSize: size, ...style }}
      {...props}
    >
      <Mark size={markPx} />
      <span aria-hidden className="whitespace-nowrap font-semibold tracking-wordmark">
        highsea<span className="font-medium text-text-3"> tv</span>
      </span>
    </span>
  )
}
