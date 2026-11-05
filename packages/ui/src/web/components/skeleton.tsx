// SPDX-License-Identifier: AGPL-3.0-only
// Placeholders while content loads. The sweep counts as a progress indicator, the one kind of
// motion allowed to loop (motion.md#choreography); reduced motion holds it still.
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-sm bg-[linear-gradient(90deg,var(--color-s2)_30%,var(--color-s3)_50%,var(--color-s2)_70%)] bg-size-[200%_100%] motion-safe:animate-shimmer motion-reduce:bg-s2',
        className,
      )}
      {...props}
    />
  )
}

/** Lines of text-shaped skeletons; the last line is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('grid gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lines
          key={i}
          className={cn('h-3', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </div>
  )
}
