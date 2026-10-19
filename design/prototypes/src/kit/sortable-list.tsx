// SPDX-License-Identifier: AGPL-3.0-only
// A vertical list reordered by a drag handle, the way the dashboard's widgets are (widget-editor):
// Pointer: drag the handle; the row lifts and follows, and the others slide aside (dnd-kit's
// sortable). Keyboard: Space or Enter on the handle picks the row up, Up and Down move it, Space
// drops it, Escape puts it back. A live region announces each step.
import { Accessibility, PointerSensor } from '@dnd-kit/dom'
import { move as reorder } from '@dnd-kit/helpers'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { cn, Icon } from '@highsea/ui-web'
import { type KeyboardEvent, type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { timing } from './widget-editor.tsx'

export type SortableListProps<T> = {
  items: T[]
  id: (item: T) => string
  /** The row's name, for the handle ("Move Sintel") and the announcements. */
  label: (item: T) => string
  onChange: (next: T[]) => void
  /** Names the list. */
  'aria-label': string
  className?: string
  /** Classes for each row (the `li`). Rows lift with an accent border while moving. */
  itemClassName?: string
  disabled?: boolean
  /** The row's content; put `handle` first. */
  children: (item: T, handle: ReactNode) => ReactNode
}

export function SortableList<T>({
  items,
  id,
  label,
  onChange,
  className,
  itemClassName,
  disabled = false,
  children,
  ...aria
}: SortableListProps<T>) {
  const [grab, setGrab] = useState<{ id: string; origin: T[] } | null>(null)
  const [message, setMessage] = useState('')
  const help = useId()
  const list = useRef<HTMLOListElement>(null)
  const latest = useRef({ items, onChange })
  latest.current = { items, onChange }
  // moving a row moves its DOM node, which drops focus: put it back on the handle
  const refocus = useRef<string | null>(null)
  useLayoutEffect(() => {
    const key = refocus.current
    if (!key) return
    refocus.current = null
    list.current
      ?.querySelector<HTMLElement>(`[data-sortable-id="${CSS.escape(key)}"] [data-handle]`)
      ?.focus({ preventScroll: true })
  })

  const position = (xs: T[], key: string) =>
    `position ${xs.findIndex((x) => id(x) === key) + 1} of ${xs.length}`

  const onHandleKey = (item: T) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const key = id(item)
    const grabbed = grab?.id === key
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (grabbed) {
        setGrab(null)
        setMessage(`${label(item)} dropped at ${position(items, key)}.`)
      } else {
        setGrab({ id: key, origin: items })
        setMessage(
          `${label(item)} picked up, ${position(items, key)}. Up and Down move it. Space drops it, Escape cancels.`,
        )
      }
      return
    }
    if (!grabbed) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      refocus.current = key
      onChange(grab.origin)
      setGrab(null)
      setMessage(`Move cancelled. ${label(item)} is back where it was.`)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const from = items.findIndex((x) => id(x) === key)
      const to = from + (e.key === 'ArrowUp' ? -1 : 1)
      if (to < 0 || to >= items.length) {
        setMessage(`${label(item)} is already ${to < 0 ? 'first' : 'last'}.`)
        return
      }
      const next = [...items]
      const [moved] = next.splice(from, 1)
      if (moved !== undefined) next.splice(to, 0, moved)
      refocus.current = key
      onChange(next)
      setMessage(`${label(item)} moved to ${position(next, key)}.`)
    }
  }

  return (
    <DragDropProvider
      sensors={[PointerSensor]}
      // the handle keeps its own keyboard model and live region (above)
      plugins={(defaults) => defaults.filter((p) => p !== Accessibility)}
      onDragStart={(event) => {
        const item = latest.current.items.find((x) => id(x) === event.operation.source?.id)
        if (item)
          setMessage(`${label(item)} picked up, ${position(latest.current.items, id(item))}.`)
      }}
      onDragEnd={(event) => {
        const key = event.operation.source?.id
        const item = latest.current.items.find((x) => id(x) === key)
        if (event.canceled) {
          if (item) setMessage(`Move cancelled. ${label(item)} is back where it was.`)
          return
        }
        const ids = latest.current.items.map(id)
        const order = reorder(ids, event)
        const next = order.flatMap((k) => latest.current.items.filter((x) => id(x) === k))
        latest.current.onChange(next)
        if (item) setMessage(`${label(item)} dropped at ${position(next, id(item))}.`)
      }}
    >
      <ol ref={list} className={cn('grid', className)} {...aria}>
        {items.map((item, index) => (
          <Row
            key={id(item)}
            id={id(item)}
            index={index}
            disabled={disabled}
            grabbed={grab?.id === id(item)}
            label={label(item)}
            help={help}
            className={itemClassName}
            onHandleKey={onHandleKey(item)}
            onHandleBlur={() => {
              // a move re-parents the node and blurs it; that isn't the user leaving
              if (grab?.id === id(item) && !refocus.current) {
                setGrab(null)
                setMessage(`${label(item)} dropped at ${position(items, id(item))}.`)
              }
            }}
          >
            {(handle) => children(item, handle)}
          </Row>
        ))}
      </ol>
      <p id={help} hidden>
        Press Space to pick up. Then Up and Down move it, Space drops it, and Escape cancels.
      </p>
      <p aria-live="assertive" className="sr-only">
        {message}
      </p>
    </DragDropProvider>
  )
}

function Row({
  id,
  index,
  disabled,
  grabbed,
  label,
  help,
  className,
  onHandleKey,
  onHandleBlur,
  children,
}: {
  id: string
  index: number
  disabled: boolean
  grabbed: boolean
  label: string
  help: string
  className?: string
  onHandleKey: (e: KeyboardEvent<HTMLButtonElement>) => void
  onHandleBlur: () => void
  children: (handle: ReactNode) => ReactNode
}) {
  const [transition] = useState(() =>
    typeof document === 'undefined' ? undefined : { ...timing(), idle: false },
  )
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled, transition })
  const lifted = isDragging || grabbed
  return (
    <li
      ref={ref}
      data-sortable-id={id}
      className={cn(className, lifted && 'relative z-10 border-accent shadow-3')}
    >
      {children(
        <button
          ref={handleRef}
          type="button"
          aria-label={`Move ${label}`}
          aria-describedby={help}
          disabled={disabled}
          onKeyDown={onHandleKey}
          onBlur={onHandleBlur}
          data-handle=""
          className={cn(
            'grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-[6px] text-text-3 transition-tint hover:bg-s3 hover:text-text focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-45',
            lifted && 'cursor-grabbing bg-accent-soft text-accent-text',
          )}
        >
          <Icon name="drag" size={16} />
        </button>,
      )}
    </li>
  )
}
