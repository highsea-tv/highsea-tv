// SPDX-License-Identifier: AGPL-3.0-only
// Customize mode for the widget grid (admin.md#customizing; docs/product/dashboard.md). Order is
// the layout: widgets flow through the 4/2/1-column grid of 84px rows, so moving one changes its
// index, and resizing changes how many columns and rows it spans, snapped to its range.
//
// Pointer: drag the handle and the widget lifts and follows the pointer, a placeholder shows where
// it will land, and the others slide aside (dnd-kit's sortable). Drag the corner and the widget
// grows or shrinks under the pointer, its content reflowing live, with an outline of the size it
// will snap to; the others make room as it crosses each column or row.
// Keyboard: Space or Enter on the handle picks the widget up; arrows move it; Shift and an arrow
// resize it (left and right for width, up and down for height); Space or Enter drops; Escape puts
// it back. A live region announces each step.
import { Accessibility, PointerSensor } from '@dnd-kit/dom'
import { move as reorder } from '@dnd-kit/helpers'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { cn, Icon, type WidgetFrameProps, WidgetGrid } from '@highsea/ui-web'
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { WidgetSpan } from '../mock/types.ts'

export type EditableItem = { id: string; span: WidgetSpan; rows: number }

/** The sizes a widget allows: [narrowest, widest] in columns, [shortest, tallest] in rows. */
export type SizeRange = { width: [number, number]; height: [number, number] }

/** What the editor passes to each widget's frame. Spread it onto a `WidgetFrame`. */
export type FrameProps = Pick<
  WidgetFrameProps,
  'span' | 'rows' | 'editing' | 'handle' | 'resize'
> & {
  ref?: Ref<HTMLElement>
  className?: string
  style?: CSSProperties
  'data-widget-id': string
}

export type WidgetEditorProps<T extends EditableItem> = {
  items: T[]
  editing: boolean
  onChange: (items: T[]) => void
  range: (item: T) => SizeRange
  label: (item: T) => string
  render: (item: T, frame: FrameProps) => ReactNode
  className?: string
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const sizeLabel = (span: number, rows: number) =>
  `${plural(span, 'column')} wide and ${plural(rows, 'row')} tall`
const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n))

/** The quick spring, from the motion tokens (1ms under reduced motion). */
export function timing() {
  const root = getComputedStyle(document.documentElement)
  const duration = Number.parseFloat(root.getPropertyValue('--duration-spring-quick'))
  const easing = root.getPropertyValue('--ease-spring-quick').trim()
  return { duration: Number.isFinite(duration) ? duration : 300, easing: easing || 'ease-out' }
}

type Resize = {
  id: string
  origin: EditableItem[]
  x: number
  y: number
  /** The frame's size when the drag started, and now (px). */
  start: { w: number; h: number }
  w: number
  h: number
  /** How far the frame can grow before the grid's edge: wider asks wrap to the next row. */
  room: number
  /** One column and one row of the grid, the gap between them, and the column count. */
  col: number
  row: number
  gap: number
  cols: number
}

export function WidgetEditor<T extends EditableItem>({
  items,
  editing,
  onChange,
  range,
  label,
  render,
  className,
}: WidgetEditorProps<T>) {
  const grid = useRef<HTMLDivElement>(null)
  const [grab, setGrab] = useState<{ id: string; origin: T[] } | null>(null)
  const [resizing, setResizing] = useState<Resize | null>(null)
  const [message, setMessage] = useState('')
  const help = useId()
  // pointer moves arrive through window listeners: read the latest props from refs
  const latest = useRef({ items, onChange, range })
  latest.current = { items, onChange, range }
  // moving a widget moves its DOM node, which drops focus: put it back on the handle
  const refocus = useRef<string | null>(null)

  const position = (list: EditableItem[], id: string) =>
    `position ${list.findIndex((x) => x.id === id) + 1} of ${list.length}`

  // ---- layout animation. Keyboard moves and resizes reflow the grid in one commit; each widget
  // that moved glides from where it was (FLIP on `translate`). While dnd-kit is dragging, it
  // animates the reorder itself, so this only keeps its record of positions.
  const rects = useRef(new Map<string, { x: number; y: number }>())
  const dragging = useRef(false)

  const measure = (animate: boolean) => {
    const el = grid.current
    if (!el) return
    const next = new Map<string, { x: number; y: number }>()
    const { duration, easing } = timing()
    for (const node of el.querySelectorAll<HTMLElement>(':scope > [data-widget-id]')) {
      if (node.hasAttribute('data-dnd-placeholder') || node.hasAttribute('data-dnd-dragging'))
        continue
      const id = node.dataset.widgetId ?? ''
      const at = { x: node.offsetLeft, y: node.offsetTop }
      next.set(id, at)
      const was = rects.current.get(id)
      if (!animate || !was || id === resizing?.id) continue
      const dx = was.x - at.x
      const dy = was.y - at.y
      if (dx || dy) node.animate({ translate: [`${dx}px ${dy}px`, '0 0'] }, { duration, easing })
    }
    rects.current = next
  }

  useLayoutEffect(() => {
    measure(editing && !dragging.current)
    const id = refocus.current
    if (!id) return
    refocus.current = null
    grid.current
      ?.querySelector<HTMLElement>(`[data-widget-id="${id}"] [data-handle]`)
      ?.focus({ preventScroll: true })
  })

  // the window resizing moves widgets without a commit: keep the record current, unanimated
  useEffect(() => {
    const el = grid.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure(false))
    observer.observe(el)
    return () => observer.disconnect()
  })

  const columns = () => {
    const el = grid.current
    if (!el) return 4
    return Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length)
  }

  const move = (id: string, to: number) => {
    const { items, onChange } = latest.current
    const from = items.findIndex((x) => x.id === id)
    const target = Math.max(0, Math.min(items.length - 1, to))
    if (from < 0 || from === target) return null
    const next = [...items]
    const [moved] = next.splice(from, 1)
    if (moved) next.splice(target, 0, moved)
    refocus.current = id
    onChange(next)
    return next
  }

  const resize = (id: string, span: number, rows: number) => {
    const { items, onChange } = latest.current
    const item = items.find((x) => x.id === id)
    if (!item || (item.span === span && item.rows === rows)) return false
    onChange(items.map((x) => (x.id === id ? { ...x, span: span as WidgetSpan, rows } : x)))
    return true
  }

  // ---- keyboard

  const onHandleKey = (item: T) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const grabbed = grab?.id === item.id
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (grabbed) {
        setGrab(null)
        setMessage(`${label(item)} dropped at ${position(items, item.id)}.`)
      } else {
        setGrab({ id: item.id, origin: items })
        setMessage(
          `${label(item)} picked up, ${position(items, item.id)}, ${sizeLabel(item.span, item.rows)}. Arrow keys move it. Shift and an arrow key resize it. Space drops it, Escape cancels.`,
        )
      }
      return
    }
    if (!grabbed) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onChange(grab.origin)
      setGrab(null)
      setMessage(`Move cancelled. ${label(item)} is back where it was.`)
    } else if (e.shiftKey && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const { width, height } = range(item)
      const wider = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      const taller = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const span = clamp(item.span + wider, [width[0], Math.min(width[1], 4)])
      const rows = clamp(item.rows + taller, height)
      if (resize(item.id, span, rows)) {
        refocus.current = item.id
        setMessage(`${label(item)} is now ${sizeLabel(span, rows)}.`)
      } else
        setMessage(
          `${label(item)} is already as ${
            wider > 0 ? 'wide' : wider < 0 ? 'narrow' : taller > 0 ? 'tall' : 'short'
          } as it goes.`,
        )
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1
      const index = items.findIndex((x) => x.id === item.id)
      const next = move(item.id, index + step)
      setMessage(
        next
          ? `${label(item)} moved to ${position(next, item.id)}.`
          : `${label(item)} is already ${step < 0 ? 'first' : 'last'}.`,
      )
    }
  }

  // ---- pointer resize, from the corner. The frame follows the pointer freely (clamped to the
  // widget's range and the grid's edge); its grid area snaps to the nearest whole size as it goes.

  useEffect(() => {
    if (!resizing) return
    const r = resizing
    const px = (n: number, unit: number) => n * unit + (n - 1) * r.gap
    const onMove = (e: globalThis.PointerEvent) => {
      const item = latest.current.items.find((x) => x.id === r.id)
      if (!item) return
      const { width, height } = latest.current.range(item as T)
      const cols: [number, number] = [width[0], Math.min(width[1], r.cols)]
      const w = r.start.w + (e.clientX - r.x)
      const h = r.start.h + (e.clientY - r.y)
      const span = clamp(Math.round((w + r.gap) / (r.col + r.gap)), cols)
      const rows = clamp(Math.round((h + r.gap) / (r.row + r.gap)), height)
      if (resize(r.id, span, rows))
        setMessage(`${label(item as T)} is now ${sizeLabel(span, rows)}.`)
      const frame = grid.current?.querySelector<HTMLElement>(`[data-widget-id="${r.id}"]`)
      setResizing({
        ...r,
        room: (grid.current?.clientWidth ?? 0) - (frame?.offsetLeft ?? 0),
        w: clamp(w, [px(cols[0], r.col), px(cols[1], r.col)]),
        h: clamp(h, [px(height[0], r.row), px(height[1], r.row)]),
      })
    }
    const finish = (cancelled: boolean) => () => {
      const frame = grid.current?.querySelector<HTMLElement>(`[data-widget-id="${r.id}"]`)
      const item = latest.current.items.find((x) => x.id === r.id)
      setResizing(null)
      if (cancelled) {
        latest.current.onChange(r.origin as T[])
        setMessage('Resize cancelled.')
        return
      }
      if (!frame || !item) return
      // settle from the free size into the snapped one
      const { duration, easing } = timing()
      frame.animate(
        {
          width: [`${r.w}px`, `${px(Math.min(item.span, r.cols), r.col)}px`],
          height: [`${r.h}px`, `${px(item.rows, r.row)}px`],
        },
        { duration, easing },
      )
      setMessage(`${label(item as T)} resized to ${sizeLabel(item.span, item.rows)}.`)
    }
    const onUp = finish(false)
    const onCancel = finish(true)
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  })

  const onCornerDown = (item: T) => (e: PointerEvent<HTMLSpanElement>) => {
    const el = grid.current
    if (e.button !== 0 || !el) return
    e.preventDefault()
    e.stopPropagation()
    const frame = e.currentTarget.closest<HTMLElement>('[data-widget-id]')
    const style = getComputedStyle(el)
    const cols = columns()
    const gap = Number.parseFloat(style.columnGap) || 12
    const row = Number.parseFloat(style.gridAutoRows) || 84
    const col = (el.clientWidth - gap * (cols - 1)) / cols
    const w = frame?.offsetWidth ?? col
    const h = frame?.offsetHeight ?? row
    setResizing({
      id: item.id,
      origin: items,
      x: e.clientX,
      y: e.clientY,
      start: { w, h },
      w,
      h,
      room: el.clientWidth - (frame?.offsetLeft ?? 0),
      col,
      row,
      gap,
      cols,
    })
  }

  return (
    <DragDropProvider
      sensors={[PointerSensor]}
      // the handle keeps its own keyboard model and live region (above)
      plugins={(defaults) => defaults.filter((p) => p !== Accessibility)}
      onDragStart={(event) => {
        dragging.current = true
        const item = latest.current.items.find((x) => x.id === event.operation.source?.id)
        if (item)
          setMessage(`${label(item as T)} picked up, ${position(latest.current.items, item.id)}.`)
      }}
      onDragEnd={(event) => {
        const id = event.operation.source?.id
        const item = latest.current.items.find((x) => x.id === id)
        if (event.canceled) {
          dragging.current = false
          if (item) setMessage(`Move cancelled. ${label(item as T)} is back where it was.`)
          return
        }
        const next = reorder(latest.current.items, event)
        latest.current.onChange(next)
        if (item) setMessage(`${label(item as T)} dropped at ${position(next, item.id)}.`)
        // the commit that follows lands where dnd-kit already put things: don't animate it
        requestAnimationFrame(() => {
          dragging.current = false
        })
      }}
    >
      <div className={cn('relative', className)}>
        <WidgetGrid ref={grid} rows>
          {items.map((item, index) => {
            const live = resizing?.id === item.id ? resizing : null
            return (
              <Sortable
                key={item.id}
                item={item}
                index={index}
                editing={editing}
                grabbed={grab?.id === item.id}
                resizing={live}
                label={label(item)}
                help={help}
                resizable={(() => {
                  const { width, height } = range(item)
                  return width[0] !== width[1] || height[0] !== height[1]
                })()}
                onHandleKey={onHandleKey(item)}
                onHandleBlur={() => {
                  // a move re-parents the node and blurs it; that isn't the user leaving
                  if (grab?.id === item.id && !refocus.current) {
                    setGrab(null)
                    setMessage(`${label(item)} dropped at ${position(items, item.id)}.`)
                  }
                }}
                onCornerDown={onCornerDown(item)}
                render={render}
              />
            )
          })}
        </WidgetGrid>
        <p id={help} hidden>
          Press Space to pick up. Then the arrow keys move it, Shift and an arrow key resize it,
          Space drops it, and Escape cancels.
        </p>
        <p aria-live="assertive" className="sr-only">
          {message}
        </p>
      </div>
    </DragDropProvider>
  )
}

function Sortable<T extends EditableItem>({
  item,
  index,
  editing,
  grabbed,
  resizing,
  label,
  help,
  resizable,
  onHandleKey,
  onHandleBlur,
  onCornerDown,
  render,
}: {
  item: T
  index: number
  editing: boolean
  grabbed: boolean
  resizing: Resize | null
  label: string
  help: string
  resizable: boolean
  onHandleKey: (e: KeyboardEvent<HTMLButtonElement>) => void
  onHandleBlur: () => void
  onCornerDown: (e: PointerEvent<HTMLSpanElement>) => void
  render: (item: T, frame: FrameProps) => ReactNode
}) {
  const [transition] = useState(() =>
    typeof document === 'undefined' ? undefined : { ...timing(), idle: false },
  )
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    index,
    disabled: !editing,
    transition,
  })
  const lifted = isDragging || grabbed || resizing !== null

  // while resizing, the frame takes the pointer's size; the outline shows the size it snaps to
  let style: CSSProperties | undefined
  let outline: ReactNode = null
  if (resizing) {
    const px = (n: number, unit: number) => n * unit + (n - 1) * resizing.gap
    style = {
      width: Math.min(resizing.w, Math.max(0, resizing.room)),
      height: resizing.h,
      justifySelf: 'start',
      alignSelf: 'start',
      zIndex: 20,
    }
    outline = (
      <span
        aria-hidden
        className="pointer-events-none absolute start-[-1px] top-[-1px] rounded-md border border-accent border-dashed bg-accent-soft"
        style={{
          width: px(Math.min(item.span, resizing.cols), resizing.col),
          height: px(item.rows, resizing.row),
        }}
      >
        <span className="absolute end-1.5 bottom-1.5 rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[11px] text-on-accent">
          {Math.min(item.span, resizing.cols)} × {item.rows}
        </span>
      </span>
    )
  }

  return render(item, {
    ref,
    span: item.span,
    rows: item.rows,
    editing,
    'data-widget-id': item.id,
    style,
    className: cn(lifted && 'border-accent border-solid shadow-3', isDragging && 'cursor-grabbing'),
    handle: (
      <button
        ref={handleRef}
        type="button"
        aria-label={`Move ${label}`}
        aria-describedby={help}
        onKeyDown={onHandleKey}
        data-handle=""
        onBlur={onHandleBlur}
        className={cn(
          '-ms-1.5 grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-[6px] text-text-3 transition-tint hover:bg-s3 hover:text-text',
          (grabbed || isDragging) && 'cursor-grabbing bg-accent-soft text-accent-text',
        )}
      >
        <Icon name="drag" size={16} />
      </button>
    ),
    resize: resizable ? (
      <>
        {outline}
        <span
          aria-hidden
          onPointerDown={onCornerDown}
          className="absolute end-0 bottom-0 z-10 grid size-6 cursor-nwse-resize touch-none place-items-end p-1"
        >
          <span className="size-3 rounded-br-[5px] border-text-3 border-e-2 border-b-2" />
        </span>
      </>
    ) : (
      <span hidden />
    ),
  })
}
