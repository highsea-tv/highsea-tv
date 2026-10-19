// SPDX-License-Identifier: AGPL-3.0-only
// Status badges: a dot and a label on a tinted pill, never color alone (color.md#status-colors).
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-s3 text-text-2',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-badge-success-bg text-badge-success',
  warning: 'bg-badge-warning-bg text-badge-warning',
  danger: 'bg-badge-danger-bg text-badge-danger',
  info: 'bg-badge-info-bg text-badge-info',
}

// On artwork the pill is glass, so only the dot carries the tone.
const dots: Record<BadgeTone, string> = {
  neutral: 'bg-text-2',
  accent: 'bg-accent-text',
  success: 'bg-badge-success',
  warning: 'bg-badge-warning',
  danger: 'bg-badge-danger',
  info: 'bg-badge-info',
}

export type BadgeProps = ComponentProps<'span'> & {
  tone?: BadgeTone
  /** The status dot. Default true; plain badges (counts, tags) turn it off. */
  dot?: boolean
  /** Sits on artwork: a glass pill with a tinted dot (elevation.md, small badges over artwork). */
  overlay?: boolean
}

export function Badge({
  tone = 'neutral',
  dot = true,
  overlay = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-(--size-badge) shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-semibold text-[12px]',
        overlay ? 'glass-badge text-text' : tones[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className={cn('size-1.5 rounded-full', overlay ? dots[tone] : 'bg-current')}
        />
      )}
      {children}
    </span>
  )
}

/**
 * Quality markers (4K, HDR, DV, 1080p, CC) are text pills, not icons: 600-weight caps in a
 * `line-strong` outline (iconography.md#not-icons). `overlay` sits on artwork with a blur.
 */
export function QualityTag({
  overlay = false,
  className,
  ...props
}: ComponentProps<'span'> & { overlay?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-[5px] border px-1.5 font-mono font-semibold text-[11px] uppercase leading-none tracking-[0.04em]',
        overlay ? 'glass-badge border-transparent text-text' : 'border-line-strong text-text-2',
        className,
      )}
      {...props}
    />
  )
}
