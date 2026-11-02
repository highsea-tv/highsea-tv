// SPDX-License-Identifier: AGPL-3.0-only
// The admin status bar (admin.md#status-and-live-data), from the archived Signal layout: one thin
// row at the bottom with the server, version, clients, resources and background jobs. Values
// update in place, without motion and without announcements; the System page has the detail.
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export function StatusBar({
  className,
  'aria-label': label = 'Server status',
  ...props
}: ComponentProps<'section'>) {
  // a labelled region, so it's reachable from the landmarks list wherever the bar is placed
  return (
    <section
      aria-label={label}
      className={cn(
        'flex h-7 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-line border-t bg-s1 px-4 font-mono text-[11px] text-text-3',
        className,
      )}
      {...props}
    />
  )
}

const dots = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-text-3',
}

const hide = {
  medium: 'max-medium:hidden',
  expanded: 'max-expanded:hidden',
  wide: 'max-wide:hidden',
}

export type StatusItemProps = {
  children: ReactNode
  /** A status dot before the text. The text always says the status too. */
  dot?: keyof typeof dots
  /** Pushes this item and the ones after it to the end. */
  end?: boolean
  /** Hidden below this breakpoint: low-priority items go first (resources, then version). */
  hideBelow?: keyof typeof hide
  className?: string
}

export function StatusItem({ children, dot, end, hideBelow, className }: StatusItemProps) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5',
        end && 'ms-auto',
        hideBelow && hide[hideBelow],
        className,
      )}
      data-figures=""
    >
      {dot && <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dots[dot])} />}
      <span className="truncate">{children}</span>
    </span>
  )
}
