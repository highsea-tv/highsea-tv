'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The page's scrollbar, drawn over the page. A classic scrollbar takes a column of its own, which
// shows only the page's background beside a hero or the glass top bar, and no CSS can lay it over
// the page (`overflow: overlay` is now an alias of `auto`:
// https://developer.chrome.com/docs/css-ui/scrollbar-styling). So the native bar is hidden
// (styles.css, `html[data-page-scrollbar]`) and this thin one draws over the page. Scrolling stays
// the browser's own: wheel, keys and the trackpad are untouched, and the bar is only a pointer
// handle, hidden from assistive tech as the native one is.
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn.ts'

const minThumb = 32
// the handle is 6px wide, 8px while hovered or dragged, growing away from the edge
const handle = 6
// the strip that takes the pointer reaches this far past the handle, towards the page
const reach = 8

type Metrics = { top: number; height: number } | null

function measure(inset: number): Metrics {
  const root = document.documentElement
  const view = root.clientHeight
  const total = root.scrollHeight
  if (total <= view + 1) return null
  const track = view - inset * 2
  const height = Math.max(minThumb, (track * view) / total)
  const top = (window.scrollY / (total - view)) * (track - height)
  return { top, height }
}

export type PageScrollbarProps = {
  /**
   * The gap between the handle and the window's edges, the same on every side. The desktop app on
   * macOS passes more, so the handle's ends clear the window's rounded corners.
   */
  inset?: number
  className?: string
}

export function PageScrollbar({ inset = 6, className }: PageScrollbarProps) {
  const [thumb, setThumb] = useState<Metrics>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ y: number; scroll: number } | null>(null)
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.pageScrollbar = ''
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setThumb(measure(inset)))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    // the page grows and shrinks as rows load and routes change. The bar's parent is the shell
    // that holds the page; the body may have a fixed height, the page overflowing it
    const observer = new ResizeObserver(update)
    observer.observe(strip.current?.parentElement ?? document.body)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer.disconnect()
      delete root.dataset.pageScrollbar
    }
  }, [inset])

  // pixels of page per pixel of track the thumb travels
  const ratio = (thumb: NonNullable<Metrics>) => {
    const root = document.documentElement
    return (root.scrollHeight - root.clientHeight) / (root.clientHeight - inset * 2 - thumb.height)
  }
  const onThumbDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, scroll: window.scrollY }
    setDragging(true)
  }
  const onThumbMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !thumb) return
    window.scrollTo({ top: drag.current.scroll + (e.clientY - drag.current.y) * ratio(thumb) })
  }
  const onThumbUp = () => {
    drag.current = null
    setDragging(false)
  }
  // a click on the track pages towards it, as the native bar does
  const onTrackDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!thumb) return
    const page = document.documentElement.clientHeight * 0.875
    window.scrollBy({ top: e.clientY - inset < thumb.top ? -page : page })
  }

  return (
    <div
      ref={strip}
      aria-hidden
      hidden={!thumb}
      onPointerDown={onTrackDown}
      style={{ top: inset, bottom: inset, width: inset + handle + reach }}
      className={cn('group/scrollbar fixed end-0 z-40', className)}
    >
      {thumb && (
        <div
          onPointerDown={onThumbDown}
          onPointerMove={onThumbMove}
          onPointerUp={onThumbUp}
          onPointerCancel={onThumbUp}
          style={{
            transform: `translateY(${thumb.top}px)`,
            height: thumb.height,
            paddingInlineEnd: inset,
          }}
          className="absolute inset-x-0 top-0 flex justify-end"
        >
          <div
            className={cn(
              'h-full w-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-text-3)_45%,transparent)] transition-tint group-hover/scrollbar:w-2 group-hover/scrollbar:bg-[color-mix(in_srgb,var(--color-text-3)_70%,transparent)]',
              dragging && 'w-2 bg-[color-mix(in_srgb,var(--color-text-3)_70%,transparent)]',
            )}
          />
        </div>
      )}
    </div>
  )
}
