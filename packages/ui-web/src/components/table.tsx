'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Dense data tables for admin: docs/design-language/platforms/admin.md#tables
import { type ComponentProps, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn.ts'

/** The card a table sits in: `s1`, a `line` border, scrolling sideways when it must. */
export function TableFrame({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('min-w-0 overflow-hidden rounded-lg border border-line bg-s1', className)}
      {...props}
    />
  )
}

/** The frame's header row: title, live summary, filter tabs, actions. */
export function TableToolbar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-line border-b px-3.5 py-3 text-ui',
        className,
      )}
      {...props}
    />
  )
}

/**
 * When the table is wider than its frame (a phone, or 200% text) it scrolls sideways, and the
 * scroller becomes a tab stop (a region named by the table, when it has a name), so a keyboard can scroll it too (WCAG 2.1.1).
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])
  return (
    // relative: absolutely positioned content (sr-only text) stays inside the scroller
    <div
      ref={ref}
      className="relative overflow-x-auto outline-none focus-visible:ring-focus"
      {...(scrolls ? { tabIndex: 0 } : {})}
      {...(scrolls && (props['aria-label'] || props['aria-labelledby'])
        ? {
            role: 'region',
            'aria-label': props['aria-label'],
            'aria-labelledby': props['aria-labelledby'],
          }
        : {})}
    >
      <table className={cn('w-full border-collapse text-ui', className)} {...props} />
    </div>
  )
}

export function TableHeader(props: ComponentProps<'thead'>) {
  return <thead {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&>tr:last-child>td]:border-b-0', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'group/row transition-tint hover:bg-s2 focus-within:bg-s2 data-[state=selected]:bg-accent-soft',
        className,
      )}
      {...props}
    />
  )
}

type Align = { numeric?: boolean; align?: 'start' | 'end' | 'center' }
const alignClass = ({ numeric, align }: Align) =>
  align === 'center' ? 'text-center' : align === 'end' || numeric ? 'text-end' : 'text-start'

/** Header cell: Geist 500 at 11.5px in `text-3`. */
export function TableHead({ className, numeric, align, ...props }: ComponentProps<'th'> & Align) {
  return (
    <th
      scope="col"
      className={cn(
        'h-9 whitespace-nowrap border-line border-b px-3 text-table-header text-text-3',
        alignClass({ numeric, align }),
        className,
      )}
      {...props}
    />
  )
}

/** Body cell. `numeric` cells are mono 12px `text-2`, tabular and end-aligned. */
export function TableCell({ className, numeric, align, ...props }: ComponentProps<'td'> & Align) {
  return (
    <td
      className={cn(
        'h-(--size-row-single) whitespace-nowrap border-line border-b px-3 py-2',
        numeric && 'font-mono text-figure text-text-2',
        alignClass({ numeric, align }),
        className,
      )}
      {...props}
    />
  )
}

export type TitleCellProps = Omit<ComponentProps<'td'>, 'title'> & {
  title: ReactNode
  /** The release name or path: mono 11px `text-3`, one line, truncated, full value on hover. */
  detail?: string
  /** A poster thumbnail (2:3) before the title, for rows that are media items. */
  art?: string
}

/** A two-line title cell. Release names never wrap (typography.md#line-length-and-truncation). */
export function TitleCell({ title, detail, art, className, ...props }: TitleCellProps) {
  const text = (
    <>
      <div className="truncate text-text">{title}</div>
      {detail && (
        <div className="truncate font-mono text-release text-text-3" title={detail}>
          {detail}
        </div>
      )}
    </>
  )
  return (
    <td
      className={cn('h-(--size-row) max-w-80 border-line border-b px-3 py-2', className)}
      {...props}
    >
      {art === undefined ? (
        text
      ) : (
        <div className="flex items-center gap-3">
          {/* decorative: the title beside it names the row */}
          <div className="aspect-poster w-7 shrink-0 overflow-hidden rounded-[4px] bg-s3">
            {art && (
              <img
                src={art}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">{text}</div>
        </div>
      )}
    </td>
  )
}

/** Row actions: shown on hover and focus. Always also put them in a row menu. */
export function RowActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-1 opacity-0 transition-tint group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100',
        className,
      )}
      {...props}
    />
  )
}
