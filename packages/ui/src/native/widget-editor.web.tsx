// SPDX-License-Identifier: AGPL-3.0-only
// Customize mode for the widget grid in a browser (admin.md#customizing; docs/product/dashboard.md),
// the web's side of ./widget-editor.tsx, as the web renderer's (web/components/widget-editor.tsx).
// Order is the layout: widgets flow through the 4/2/1-column grid of 84 rows, so moving one
// changes its index, and resizing changes how many columns and rows it spans, snapped to its range.
// react-native-web's Views are DOM elements, their refs the elements
// (https://necolas.github.io/react-native-web/docs/view/), so dnd-kit's sortable works on them as
// on any DOM node (https://dndkit.com/react/hooks/use-sortable), and the reflow animates them with
// the Web Animations API.
// Pointer: drag the handle and the widget lifts and follows the pointer, a placeholder shows where
// it will land, and the others slide aside. Drag the corner and the widget grows or shrinks under
// the pointer, its content reflowing live, with an outline of the size it will snap to; the others
// make room as it crosses each column or row.
// Keyboard: Space or Enter on the handle picks the widget up; arrows move it; Shift and an arrow
// resize it (left and right for width, up and down for height); Space or Enter drops; Escape puts
// it back. A live region announces each step.
import { Accessibility, PointerSensor } from '@dnd-kit/dom'
import { move as reorder } from '@dnd-kit/helpers'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { dragHandle, line, springs, springToCss, webText, widget } from '@highsea-tv/tokens'
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { View, type ViewStyle } from 'react-native'
import { Icon } from './icon.tsx'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'
import { WidgetGrid } from './widget.tsx'
import type { WidgetEditor as Native } from './widget-editor.tsx'
import {
  type EditableItem,
  type Place,
  type Size,
  type WidgetEditorFrameProps,
  type WidgetEditorProps,
  type WidgetSpan,
  widgetEditorMessages,
} from './widget-editor-shared.ts'

const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n))

/** `spring.quick` as a CSS duration and easing (motion.md); reduced motion's is 1ms. */
const timing = (reduced: boolean) => {
  const { duration, easing } = springToCss(springs.quick)
  return reduced ? { duration: 1, easing: 'linear' } : { duration, easing }
}

/** CSS that React Native's style types don't name (grid placement, cursors, touch). */
const css = (style: object) => style as unknown as ViewStyle

/** A key's event as react-native-web passes it: React's, with the DOM's event inside. */
type KeyEvent = {
  nativeEvent: { key: string; shiftKey?: boolean }
  preventDefault: () => void
  stopPropagation: () => void
}

type Resize = {
  id: string
  origin: EditableItem[]
  x: number
  y: number
  /** The frame's size when the drag started (px). */
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

function WebWidgetEditor<T extends EditableItem>({
  items,
  editing,
  onChange,
  range,
  label,
  render,
  messages,
}: WidgetEditorProps<T>) {
  const m = { ...widgetEditorMessages, ...messages }
  const reduced = useMotionReduced()
  const grid = useRef<HTMLElement | null>(null)
  const [grab, setGrab] = useState<{ id: string; origin: T[] } | null>(null)
  const [resizing, setResizing] = useState<Resize | null>(null)
  const [message, setMessage] = useState('')
  const help = useId()
  // pointer moves arrive through window listeners: read the latest props from refs
  const latest = useRef({ items, onChange, range, reduced })
  latest.current = { items, onChange, range, reduced }
  // moving a widget moves its DOM node, which drops focus: put it back on the handle
  const refocus = useRef<string | null>(null)

  const place = (list: EditableItem[], item: T): Place => ({
    name: label(item),
    index: list.findIndex((x) => x.id === item.id) + 1,
    count: list.length,
  })
  const size = (item: T, span: number, rows: number): Size => ({ name: label(item), span, rows })

  // ---- layout animation. Keyboard moves and resizes reflow the grid in one commit; each widget
  // that moved glides from where it was (FLIP on `translate`). While dnd-kit is dragging, it
  // animates the reorder itself, so this only keeps its record of positions.
  const rects = useRef(new Map<string, { x: number; y: number }>())
  const dragging = useRef(false)

  const measure = (animate: boolean) => {
    const el = grid.current
    if (!el?.querySelectorAll) return
    const next = new Map<string, { x: number; y: number }>()
    const { duration, easing } = timing(latest.current.reduced)
    for (const node of el.querySelectorAll<HTMLElement>(':scope > [data-widget-id]')) {
      if (node.hasAttribute('data-dnd-placeholder') || node.hasAttribute('data-dnd-dragging'))
        continue
      const id = node.dataset.widgetId ?? ''
      const at = { x: node.offsetLeft, y: node.offsetTop }
      next.set(id, at)
      const was = rects.current.get(id)
      if (!animate || !was || id === resizing?.id || typeof node.animate !== 'function') continue
      const dx = was.x - at.x
      const dy = was.y - at.y
      if (dx || dy) node.animate({ translate: [`${dx}px ${dy}px`, '0 0'] }, { duration, easing })
    }
    rects.current = next
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after every commit, as the web renderer's
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after every commit, as the web renderer's
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

  const onHandleKey = (item: T) => (e: KeyEvent) => {
    const { key, shiftKey } = e.nativeEvent
    const grabbed = grab?.id === item.id
    if (key === ' ' || key === 'Enter') {
      e.preventDefault()
      if (grabbed) {
        setGrab(null)
        setMessage(m.dropped(place(items, item)))
      } else {
        setGrab({ id: item.id, origin: items })
        setMessage(m.pickedUp({ ...place(items, item), span: item.span, rows: item.rows }))
      }
      return
    }
    if (!grabbed) return
    if (key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onChange(grab.origin)
      setGrab(null)
      setMessage(m.cancelled(label(item)))
    } else if (shiftKey && key.startsWith('Arrow')) {
      e.preventDefault()
      const { width, height } = range(item)
      const wider = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0
      const taller = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
      const span = clamp(item.span + wider, [width[0], Math.min(width[1], 4)])
      const rows = clamp(item.rows + taller, height)
      if (resize(item.id, span, rows)) {
        refocus.current = item.id
        setMessage(m.resized(size(item, span, rows)))
      } else
        setMessage(
          m.limit(
            label(item),
            wider > 0 ? 'wide' : wider < 0 ? 'narrow' : taller > 0 ? 'tall' : 'short',
          ),
        )
    } else if (key.startsWith('Arrow')) {
      e.preventDefault()
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
      const index = items.findIndex((x) => x.id === item.id)
      const next = move(item.id, index + step)
      setMessage(
        next ? m.moved(place(next, item)) : m.limit(label(item), step < 0 ? 'first' : 'last'),
      )
    }
  }

  // ---- pointer resize, from the corner. The frame follows the pointer freely (clamped to the
  // widget's range and the grid's edge); its grid area snaps to the nearest whole size as it goes.

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after every commit, as the web renderer's
  useEffect(() => {
    if (!resizing) return
    const r = resizing
    const px = (n: number, unit: number) => n * unit + (n - 1) * r.gap
    const frameOf = () => grid.current?.querySelector<HTMLElement>(`[data-widget-id="${r.id}"]`)
    const onMove = (e: globalThis.PointerEvent) => {
      const item = latest.current.items.find((x) => x.id === r.id)
      if (!item) return
      const { width, height } = latest.current.range(item as T)
      const cols: [number, number] = [width[0], Math.min(width[1], r.cols)]
      const w = r.start.w + (e.clientX - r.x)
      const h = r.start.h + (e.clientY - r.y)
      const span = clamp(Math.round((w + r.gap) / (r.col + r.gap)), cols)
      const rows = clamp(Math.round((h + r.gap) / (r.row + r.gap)), height)
      if (resize(r.id, span, rows)) setMessage(m.resized(size(item as T, span, rows)))
      setResizing({
        ...r,
        room: (grid.current?.clientWidth ?? 0) - (frameOf()?.offsetLeft ?? 0),
        w: clamp(w, [px(cols[0], r.col), px(cols[1], r.col)]),
        h: clamp(h, [px(height[0], r.row), px(height[1], r.row)]),
      })
    }
    const finish = (cancelled: boolean) => () => {
      const frame = frameOf()
      const item = latest.current.items.find((x) => x.id === r.id)
      setResizing(null)
      if (cancelled) {
        latest.current.onChange(r.origin as T[])
        setMessage(m.resizeCancelled)
        return
      }
      if (!frame || !item) return
      // settle from the free size into the snapped one
      const { duration, easing } = timing(latest.current.reduced)
      frame.animate?.(
        {
          width: [`${r.w}px`, `${px(Math.min(item.span, r.cols), r.col)}px`],
          height: [`${r.h}px`, `${px(item.rows, r.row)}px`],
        },
        { duration, easing },
      )
      setMessage(m.settled(size(item as T, item.span, item.rows)))
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

  const onCornerDown = (item: T) => (e: ReactPointerEvent<HTMLElement>) => {
    const el = grid.current
    if (e.button !== 0 || !el) return
    e.preventDefault()
    e.stopPropagation()
    const frame = e.currentTarget.closest<HTMLElement>('[data-widget-id]')
    const style = getComputedStyle(el)
    const cols = columns()
    const gap = Number.parseFloat(style.columnGap) || tokens.density.widgetGap
    const row = Number.parseFloat(style.gridAutoRows) || tokens.density.widgetRow
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
        if (item) setMessage(m.dragged(place(latest.current.items, item as T)))
      }}
      onDragEnd={(event) => {
        const id = event.operation.source?.id
        const item = latest.current.items.find((x) => x.id === id)
        if (event.canceled) {
          dragging.current = false
          if (item) setMessage(m.cancelled(label(item as T)))
          return
        }
        const next = reorder(latest.current.items, event)
        latest.current.onChange(next)
        if (item) setMessage(m.dropped(place(next, item as T)))
        // the commit that follows lands where dnd-kit already put things: don't animate it
        requestAnimationFrame(() => {
          dragging.current = false
        })
      }}
    >
      <View style={{ position: 'relative' }}>
        <WidgetGrid ref={grid as never} rows>
          {items.map((item, index) => {
            const { width, height } = range(item)
            return (
              <Sortable
                key={item.id}
                item={item}
                index={index}
                editing={editing}
                grabbed={grab?.id === item.id}
                resizing={resizing?.id === item.id ? resizing : null}
                moveLabel={m.move(label(item))}
                help={help}
                resizable={width[0] !== width[1] || height[0] !== height[1]}
                onHandleKey={onHandleKey(item)}
                onHandleBlur={() => {
                  // a move re-parents the node and blurs it; that isn't the user leaving
                  if (grab?.id === item.id && !refocus.current) {
                    setGrab(null)
                    setMessage(m.dropped(place(items, item)))
                  }
                }}
                onCornerDown={onCornerDown(item)}
                render={render}
              />
            )
          })}
        </WidgetGrid>
        <Text nativeID={help} style={css({ display: 'none' })}>
          {m.help}
        </Text>
        <Text {...({ 'aria-live': 'assertive' } as object)} style={css(VISUALLY_HIDDEN)}>
          {message}
        </Text>
      </View>
    </DragDropProvider>
  )
}

/** Read and not seen (the usual visually-hidden clip, the web's `sr-only`). */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
}

function Sortable<T extends EditableItem>({
  item,
  index,
  editing,
  grabbed,
  resizing,
  moveLabel,
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
  moveLabel: string
  help: string
  resizable: boolean
  onHandleKey: (e: KeyEvent) => void
  onHandleBlur: () => void
  onCornerDown: (e: ReactPointerEvent<HTMLElement>) => void
  render: (item: T, frame: WidgetEditorFrameProps) => ReactNode
}) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const [transition] = useState(() =>
    typeof document === 'undefined' ? undefined : { ...timing(reduced), idle: false },
  )
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    index,
    disabled: !editing,
    transition,
  })
  const lifted = isDragging || grabbed || resizing !== null
  const held = grabbed || isDragging

  // while resizing, the frame takes the pointer's size; the outline shows the size it snaps to
  let sized: ViewStyle | null = null
  let outline: ReactNode = null
  if (resizing) {
    const px = (n: number, unit: number) => n * unit + (n - 1) * resizing.gap
    const span = Math.min(item.span, resizing.cols)
    sized = css({
      width: Math.min(resizing.w, Math.max(0, resizing.room)),
      height: resizing.h,
      justifySelf: 'start',
      alignSelf: 'flex-start',
      zIndex: 20,
    })
    outline = (
      <View
        aria-hidden
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -line.thin,
          top: -line.thin,
          width: px(span, resizing.col),
          height: px(item.rows, resizing.row),
          borderRadius: tokens.radius.md,
          borderWidth: line.thin,
          borderStyle: 'dashed',
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors['accent-soft'],
        }}
      >
        <View
          style={{
            position: 'absolute',
            right: tokens.space['1'] + tokens.space['0.5'],
            bottom: tokens.space['1'] + tokens.space['0.5'],
            paddingHorizontal: tokens.space['1'] + tokens.space['0.5'],
            paddingVertical: tokens.space['0.5'],
            borderRadius: tokens.radius.sm,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text size={webText.label.size} leading={1.4} mono color="on-accent">
            {`${span} × ${item.rows}`}
          </Text>
        </View>
      </View>
    )
  }

  return render(item, {
    ref: ref as never,
    span: item.span,
    rows: item.rows,
    editing,
    dataSet: { widgetId: item.id },
    style: [
      lifted
        ? {
            borderColor: theme.colors.accent,
            borderStyle: 'solid',
            boxShadow: tokens.elevation[3].boxShadow,
          }
        : null,
      isDragging ? css({ cursor: 'grabbing' }) : null,
      sized,
    ] as unknown as ViewStyle,
    handle: (
      <Press
        ref={handleRef as never}
        accessibilityLabel={moveLabel}
        {...({ 'aria-describedby': help, dataSet: { handle: '' } } as object)}
        onKeyDown={onHandleKey as never}
        onBlur={onHandleBlur}
        style={({ hovered }) => [
          {
            width: dragHandle,
            height: dragHandle,
            marginLeft: -(tokens.space['1'] + tokens.space['0.5']),
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: tokens.radius.xs,
            backgroundColor: held
              ? theme.colors['accent-soft']
              : hovered
                ? theme.colors.s3
                : 'transparent',
          },
          css({ cursor: held ? 'grabbing' : 'grab', touchAction: 'none' }),
        ]}
      >
        {({ hovered }) => (
          <Icon
            name="drag"
            size={tokens.icon.size.sm}
            color={held ? 'accent-text' : hovered ? 'text' : 'text-3'}
          />
        )}
      </Press>
    ),
    resize: resizable ? (
      <>
        {outline}
        <View
          aria-hidden
          {...({ onPointerDown: onCornerDown } as object)}
          style={[
            {
              position: 'absolute',
              right: 0,
              bottom: 0,
              zIndex: 10,
              width: tokens.targets.pointer,
              height: tokens.targets.pointer,
              padding: tokens.space['1'],
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
            },
            css({ cursor: 'nwse-resize', touchAction: 'none' }),
          ]}
        >
          <View
            style={{
              width: widget.resizeMark,
              height: widget.resizeMark,
              borderRightWidth: line.thick,
              borderBottomWidth: line.thick,
              borderBottomRightRadius: tokens.radius['2xs'],
              borderColor: theme.colors['text-3'],
            }}
          />
        </View>
      </>
    ) : (
      <View style={css({ display: 'none' })} />
    ),
  })
}

export const WidgetEditor = WebWidgetEditor as typeof Native
