// SPDX-License-Identifier: AGPL-3.0-only
// Pull to refresh on Home (client-home.md#interactions, checkpoint 4.0b): from the top of the
// page, pull down past the line and let go, and Home asks the server again. Touch on a phone; a
// mouse drag does the same in the prototype, so it can be reviewed on a desktop.
import { cn, Icon } from '@highsea-tv/ui-web'
import { type ReactNode, useRef, useState } from 'react'

/** How far to pull before letting go refreshes, in px. */
const LINE = 72
/** Pulling moves the page at this fraction of the finger, as iOS and Android do. */
const DRAG = 0.5

/** The nearest ancestor that scrolls: Home's screen. */
const scroller = (el: HTMLElement | null) => {
  for (let e = el?.parentElement; e; e = e.parentElement)
    if (e.scrollHeight > e.clientHeight && getComputedStyle(e).overflowY !== 'visible') return e
  return null
}

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => void
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const start = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const begin = (y: number) => {
    if (refreshing || (scroller(root.current)?.scrollTop ?? 0) > 0) return
    start.current = y
  }
  const move = (y: number) => {
    if (start.current === null) return
    setPull(Math.max(0, (y - start.current) * DRAG))
  }
  const end = async () => {
    if (start.current === null) return
    start.current = null
    if (pull < LINE) return setPull(0)
    setRefreshing(true)
    setPull(LINE * 0.75)
    // the refetch is instant in the mock, so the spinner shows for a moment, as it would
    onRefresh()
    await new Promise((r) => setTimeout(r, 900))
    setRefreshing(false)
    setPull(0)
  }

  const past = pull >= LINE
  return (
    <div
      ref={root}
      className={cn(pull > 0 && 'select-none')}
      onTouchStart={(e) => begin(e.touches[0]?.clientY ?? 0)}
      onTouchMove={(e) => move(e.touches[0]?.clientY ?? 0)}
      onTouchEnd={end}
      onPointerDown={(e) => e.pointerType === 'mouse' && begin(e.clientY)}
      onPointerMove={(e) => e.pointerType === 'mouse' && move(e.clientY)}
      onPointerUp={(e) => e.pointerType === 'mouse' && end()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && end()}
    >
      <div
        aria-hidden={!refreshing && pull === 0}
        className={cn(
          'grid place-items-end justify-center overflow-hidden text-[13px] text-text-3',
          start.current === null && 'transition-[height] duration-200',
        )}
        style={{ height: pull }}
      >
        <span role="status" className="flex items-center gap-2 pb-2">
          <Icon
            name={refreshing ? 'loading' : 'refresh'}
            size={16}
            className={cn(refreshing && 'motion-safe:animate-spin')}
            style={refreshing ? undefined : { transform: `rotate(${(pull / LINE) * 270}deg)` }}
          />
          {refreshing
            ? 'Refreshing'
            : past
              ? 'Let go to refresh'
              : pull > 0
                ? 'Pull to refresh'
                : ''}
        </span>
      </div>
      {children}
    </div>
  )
}
