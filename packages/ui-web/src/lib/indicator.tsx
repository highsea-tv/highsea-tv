// SPDX-License-Identifier: AGPL-3.0-only
// The sliding indicator behind tabs and segmented controls. It's measured against its own list
// (offsetLeft/offsetWidth), not the page, so the page scrolling or shifting above it never moves
// it; it slides with spring.quick only when the selection changes.
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { cn } from './cn.ts'

type Box = { left: number; width: number; animate: boolean }

/** Tracks the selected item (`data-state` active or checked) inside `list`. */
export function useIndicator(list: RefObject<HTMLElement | null>, selected: string) {
  const [box, setBox] = useState<Box | null>(null)
  const last = useRef<string | null>(null)
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const changed = last.current !== null && last.current !== selected
    last.current = selected
    const measure = (animate: boolean) => {
      const item = el.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"], [role="radio"][data-state="checked"]',
      )
      if (!item) return setBox(null)
      const left = item.offsetLeft
      const width = item.offsetWidth
      // ResizeObserver also reports once on observe: an unchanged box keeps its slide going
      setBox((b) => (b && b.left === left && b.width === width ? b : { left, width, animate }))
    }
    measure(changed)
    if (typeof ResizeObserver === 'undefined') return
    // a label or count changing width resizes it in place, without a slide
    const observer = new ResizeObserver(() => measure(false))
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => observer.disconnect()
  }, [list, selected])
  return box
}

const slide =
  'transform var(--duration-spring-quick) var(--ease-spring-quick), width var(--duration-spring-quick) var(--ease-spring-quick)'

/** The indicator itself: absolutely placed in the list (which must be `relative`), first child. */
export function Indicator({ box, className }: { box: Box | null; className: string }) {
  if (!box) return null
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute left-0', className)}
      style={{
        width: box.width,
        transform: `translateX(${box.left}px)`,
        transition: box.animate ? slide : 'none',
      }}
    />
  )
}
