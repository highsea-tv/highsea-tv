// SPDX-License-Identifier: AGPL-3.0-only
// Dashboard widgets: `s1`, a `line` border, `radius-md`, 14px padding, in a 4/2/1-column grid with
// a 12px gap (admin.md#main-area). Edit mode shows the drag handle and resize corner; the
// drag-and-resize behavior itself is designed in Phase 2.
import type { ComponentProps, ReactNode } from 'react'
import { Icon } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'

export function WidgetGrid({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-(--size-widget-gap) medium:grid-cols-2 expanded:grid-cols-4',
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
  /** Customize mode: drag handle and resize corner. */
  editing?: boolean
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
  editing = false,
  className,
  children,
  ...props
}: WidgetFrameProps) {
  return (
    <section
      className={cn(
        'relative grid min-w-0 content-start gap-2.5 rounded-md border border-line bg-s1 p-(--size-widget-padding)',
        spans[span],
        editing && 'border-line-strong border-dashed',
        className,
      )}
      {...props}
    >
      <header className="flex min-h-6 items-center gap-2">
        {editing && (
          <Icon name="drag" size={16} className="-ms-1 shrink-0 cursor-grab text-text-3" />
        )}
        <h3 className="min-w-0 flex-1 truncate text-text text-widget-title">{title}</h3>
        {meta && <div className="shrink-0 text-[12px] text-text-3">{meta}</div>}
        {actions}
      </header>
      {children}
      {editing && (
        <span
          aria-hidden
          className="absolute end-1 bottom-1 size-3 cursor-se-resize rounded-br-[5px] border-text-3 border-e-2 border-b-2"
        />
      )}
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
