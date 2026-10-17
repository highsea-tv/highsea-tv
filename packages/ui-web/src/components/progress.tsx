// SPDX-License-Identifier: AGPL-3.0-only
// Progress bars: accent while downloading, success when complete, warning when stalled. The
// width animates with duration.color; numbers update without animation (admin.md#status-and-live-data).
import { Progress as ProgressPrimitive } from 'radix-ui'
import { cn } from '../lib/cn.ts'

export type ProgressTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

const fills: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-3',
}

export type ProgressProps = {
  /** 0–100, or `null` while the total is unknown. */
  value: number | null
  tone?: ProgressTone
  size?: 'sm' | 'md'
  /** Shows the percentage beside the bar, so progress never relies on the bar alone. */
  showValue?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  className?: string
}

const format = (v: number) => `${v < 10 && v > 0 && v % 1 ? v.toFixed(1) : Math.round(v)}%`

export function Progress({
  value,
  tone = 'accent',
  size = 'sm',
  showValue = false,
  className,
  ...aria
}: ProgressProps) {
  const clamped = value === null ? null : Math.min(100, Math.max(0, value))
  const bar = (
    <ProgressPrimitive.Root
      value={clamped}
      getValueLabel={(v) => format(v)}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-s3',
        size === 'sm' ? 'h-[5px]' : 'h-2',
        !showValue && className,
      )}
      {...aria}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'h-full rounded-full',
          fills[tone],
          clamped === null
            ? 'w-2/5 motion-safe:animate-indeterminate motion-reduce:w-full motion-reduce:opacity-40'
            : 'transition-tint',
        )}
        style={clamped === null ? undefined : { width: `${clamped}%` }}
      />
    </ProgressPrimitive.Root>
  )
  if (!showValue) return bar
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {bar}
      <span aria-hidden className="w-11 shrink-0 text-end font-mono text-figure text-text-2">
        {clamped === null ? '—' : format(clamped)}
      </span>
    </div>
  )
}
