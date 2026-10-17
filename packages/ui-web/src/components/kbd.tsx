// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

/** A keyboard hint: mono, in a `line-strong` outline. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong px-1.5 font-mono text-[11px] text-text-3 leading-none',
        className,
      )}
      {...props}
    />
  )
}

/** `⌘` on Apple platforms, `Ctrl` elsewhere. */
export function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl'
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
}
