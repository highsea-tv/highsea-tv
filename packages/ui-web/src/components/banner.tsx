'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Announcements from the server owner, as a full-width banner or a home card. Dismissible unless
// the owner requires acknowledgement. Color is never the only signal: each tone has an icon.
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { Button } from './button.tsx'

export type BannerTone = 'announcement' | 'info' | 'success' | 'warning' | 'danger'

const tones: Record<BannerTone, { icon: IconName; disc: string; edge: string }> = {
  announcement: {
    icon: 'announcement',
    disc: 'bg-accent-soft text-accent-text',
    edge: 'border-line',
  },
  info: { icon: 'info', disc: 'bg-badge-info-bg text-info', edge: 'border-info/30' },
  success: { icon: 'success', disc: 'bg-badge-success-bg text-success', edge: 'border-success/30' },
  warning: { icon: 'warning', disc: 'bg-badge-warning-bg text-warning', edge: 'border-warning/30' },
  danger: { icon: 'error', disc: 'bg-badge-danger-bg text-danger', edge: 'border-danger/35' },
}

export type BannerProps = {
  title: ReactNode
  children?: ReactNode
  tone?: BannerTone
  /** `bar` spans the top of a page; `card` sits in the home feed. */
  variant?: 'bar' | 'card'
  /** A call to action (a link or button). */
  action?: ReactNode
  /** Shows a dismiss button. */
  onDismiss?: () => void
  /** The owner requires acknowledgement: an Acknowledge button replaces dismiss. */
  onAcknowledge?: () => void
  acknowledgeLabel?: string
  className?: string
}

export function Banner({
  title,
  children,
  tone = 'announcement',
  variant = 'bar',
  action,
  onDismiss,
  onAcknowledge,
  acknowledgeLabel = 'Got it',
  className,
}: BannerProps) {
  const t = tones[tone]
  return (
    <section
      aria-label={typeof title === 'string' ? title : 'Announcement'}
      className={cn(
        'flex items-start gap-3 border bg-s1 text-ui',
        variant === 'bar' ? 'rounded-md px-4 py-3' : 'rounded-lg p-4',
        t.edge,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('grid size-8 shrink-0 place-items-center rounded-full', t.disc)}
      >
        <Icon name={t.icon} size={16} />
      </span>
      <div
        className={cn(
          'min-w-0 flex-1',
          variant === 'bar' && 'medium:flex medium:items-center medium:gap-3',
        )}
      >
        <div className="min-w-0 flex-1 py-1">
          <p className="font-semibold text-text">{title}</p>
          {children && <div className="mt-0.5 text-text-2">{children}</div>}
        </div>
        {(action || onAcknowledge) && (
          <div
            className={cn(
              'flex shrink-0 flex-wrap gap-2',
              variant === 'bar' ? 'mt-2 medium:mt-0' : 'mt-3',
            )}
          >
            {action}
            {onAcknowledge && (
              <Button size="sm" variant="secondary" onClick={onAcknowledge}>
                {acknowledgeLabel}
              </Button>
            )}
          </div>
        )}
      </div>
      {onDismiss && !onAcknowledge && (
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="close"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-me-1.5"
        />
      )}
    </section>
  )
}
