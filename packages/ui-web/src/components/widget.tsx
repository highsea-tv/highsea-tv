// SPDX-License-Identifier: AGPL-3.0-only
// Dashboard widgets: `s1`, a `line` border, `radius-md`, 14px padding, in a 4/2/1-column grid with
// a 12px gap (admin.md#main-area). With `rows`, the grid has fixed 84px rows and each widget spans
// a number of them; its body fills the height and clips. Edit mode shows the drag handle and
// resize corner; an editor passes its own interactive `handle` and `resize` to replace the
// decorative ones.
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'

export type WidgetGridProps = ComponentProps<'div'> & {
  /** Fixed-height rows (`size-widget-row`), for widgets that set `rows`. */
  rows?: boolean
}

export function WidgetGrid({ rows = false, className, ...props }: WidgetGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-(--size-widget-gap) medium:grid-cols-2 expanded:grid-cols-4',
        rows && 'auto-rows-(--size-widget-row)',
        className,
      )}
      {...props}
    />
  )
}

export type WidgetFrameProps = Omit<ComponentProps<'section'>, 'title'> & {
  title: ReactNode
  /** Right side of the header: a live summary or the widget's own health. */
  meta?: ReactNode
  /** Header actions (a menu button). */
  actions?: ReactNode
  /** Columns to span in the 4-column grid. */
  span?: 1 | 2 | 3 | 4
  /** Rows to span in a `WidgetGrid` with `rows`. The body fills the height and clips. */
  rows?: number
  /** Customize mode: drag handle and resize corner. */
  editing?: boolean
  /** In edit mode, replaces the decorative drag icon (a focusable handle with its own keys). */
  handle?: ReactNode
  /** In edit mode, replaces the decorative resize corner. */
  resize?: ReactNode
}

const rowSpans: Record<number, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
  4: 'row-span-4',
  5: 'row-span-5',
  6: 'row-span-6',
  7: 'row-span-7',
  8: 'row-span-8',
}

const spans = {
  1: '',
  2: 'medium:col-span-2',
  3: 'medium:col-span-2 expanded:col-span-3',
  4: 'medium:col-span-2 expanded:col-span-4',
}

export function WidgetFrame({
  title,
  meta,
  actions,
  span = 1,
  rows,
  editing = false,
  handle,
  resize,
  className,
  children,
  ...props
}: WidgetFrameProps) {
  return (
    <section
      className={cn(
        'relative grid min-w-0 gap-2.5 rounded-md border border-line bg-s1 p-(--size-widget-padding)',
        spans[span],
        rows ? cn('grid-rows-[auto_minmax(0,1fr)]', rowSpans[rows]) : 'content-start',
        editing && 'border-line-strong border-dashed',
        className,
      )}
      {...props}
    >
      <header className="flex min-h-6 items-center gap-2">
        {editing &&
          (handle ?? (
            <Icon name="drag" size={16} className="-ms-1 shrink-0 cursor-grab text-text-3" />
          ))}
        <h3 className="min-w-0 flex-1 truncate text-text text-widget-title">{title}</h3>
        {meta && <div className="shrink-0 text-[12px] text-text-3">{meta}</div>}
        {actions}
      </header>
      {rows ? (
        <div data-widget-body="" className="flex min-h-0 min-w-0 flex-col gap-2.5 overflow-y-clip">
          {children}
        </div>
      ) : (
        children
      )}
      {editing &&
        (resize ?? (
          <span
            aria-hidden
            className="absolute end-1 bottom-1 size-3 cursor-se-resize rounded-br-[5px] border-text-3 border-e-2 border-b-2"
          />
        ))}
    </section>
  )
}

export type StatProps = {
  value: ReactNode
  unit?: ReactNode
  /** A short line under the value. */
  caption?: ReactNode
  className?: string
}

/** A headline stat: the value in Geist 600, the unit in Geist 400 `text-2` ("18.4 MB/s"). */
export function Stat({ value, unit, caption, className }: StatProps) {
  return (
    <div className={cn('grid gap-1', className)}>
      <div className="font-semibold text-[26px] leading-none tracking-display" data-figures="">
        {value}
        {unit && <span className="ms-1 font-normal text-text-2 text-ui tracking-[0]">{unit}</span>}
      </div>
      {caption && <div className="text-caption text-text-3">{caption}</div>}
    </div>
  )
}
