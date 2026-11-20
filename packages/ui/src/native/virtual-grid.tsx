// SPDX-License-Identifier: AGPL-3.0-only
// A long grid of cells in its scroller that draws only the rows near the screen: the clients'
// library grid and the admin's Movies and Shows (HT-57) draw their posters through it, so a library
// of thousands stays light wherever it's shown. The rows are the library's `Virtual` list
// (TanStack Virtual's core, ./virtual.tsx), so it needs a scroll source above it: a ScrollView
// from this library, the clients' page or the admin's shell.
// - The page counts the columns from its own width and spacing; a row's cells share it by flex, so
//   a column opening beside them (a pointer's A–Z index, `lead`) narrows them as it goes.
// - Each row is a list of its own and each cell a listitem that gives its place in the whole
//   (aria-posinset of aria-setsize), since only some rows are drawn: WAI-ARIA 1.2's listitem
//   needs a list as its parent, and aria-setsize and aria-posinset are for sets not all in the DOM
//   (https://www.w3.org/TR/wai-aria-1.2/#listitem, #aria-setsize, #aria-posinset).
// - A row is keyed by its first item, which no other row holds, so a row keeps its state as the
//   window moves.
// - Outside a scroller (a test's bare page) it draws every row, as a short TableBody does.
import {
  Fragment,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import { Animated, type LayoutChangeEvent, View } from 'react-native'
import { useScrollSourceOrNull, Virtual, type VirtualList } from './virtual.tsx'

/** What a grid's page can ask of it: to scroll an item's row into view. */
export type VirtualGridHandle = {
  /** Scrolls the row holding item `index` to `offset` under the scroller's top. */
  toItem: (index: number, options: { animated: boolean; offset: number }) => void
}

export type VirtualGridProps<T> = {
  items: readonly T[]
  keyOf: (item: T) => string
  /** One cell, which fills its column's width. */
  render: (item: T, index: number) => ReactNode
  /** The grid's name for assistive tech, which reads it as a list. */
  label: string
  columns: number
  gap: { column: number; row: number }
  /** A row's height before it's measured. */
  estimate: number
  /** Room at the start of every row, for a column drawn over the page, as it opens and closes. */
  lead?: Animated.Value
  /** Rows drawn past each end of the screen: the TV's focus moves onto them before they show. */
  overscan?: number
  /** Its last row is drawn: a grid read a page at a time asks for the next (Virtual's `onEnd`). */
  onEnd?: () => void
  ref?: Ref<VirtualGridHandle>
}

/** A cell's place in the whole grid, for assistive tech (RN's types don't name these yet). */
const placeOf = (index: number, size: number) =>
  ({ 'aria-posinset': index + 1, 'aria-setsize': size }) as object

export function VirtualGrid<T>({
  items,
  keyOf,
  render,
  label,
  columns,
  gap,
  estimate,
  lead,
  overscan = 3,
  onEnd,
  ref,
}: VirtualGridProps<T>) {
  const list = useRef<VirtualList>(null)
  const scroller = useScrollSourceOrNull() !== null
  const across = Math.max(1, columns)
  const rows = useMemo(() => {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += across) out.push(items.slice(i, i + across))
    return out
  }, [items, across])
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handle reads this render's rows
  useImperativeHandle(ref, () => ({
    toItem: (index, { animated, offset }) => {
      const row = Math.floor(index / across)
      if (row < rows.length) list.current?.scrollToIndex(row, { animated, offset })
    },
  }))
  const drawRow = (r: number, onLayout?: (e: LayoutChangeEvent) => void) => {
    const row = rows[r] ?? []
    return (
      <View onLayout={onLayout} style={{ flexDirection: 'row' }}>
        {lead ? <Animated.View style={{ width: lead }} /> : null}
        <View
          role="list"
          // the first row names the grid; the rest are its continuation
          accessibilityLabel={r === 0 ? label : undefined}
          style={{ flex: 1, flexDirection: 'row', columnGap: gap.column }}
        >
          {Array.from({ length: across }, (_, c) => {
            const item = row[c]
            // a short last row keeps the columns' width with empty places
            return item === undefined ? (
              <View key={`empty-${String(c)}`} aria-hidden style={{ flex: 1 }} />
            ) : (
              <View
                key={keyOf(item)}
                role="listitem"
                {...placeOf(r * across + c, items.length)}
                style={{ flex: 1, minWidth: 0 }}
              >
                {render(item, r * across + c)}
              </View>
            )
          })}
        </View>
      </View>
    )
  }
  // outside a scroller every row is drawn, the last one with them
  useEffect(() => {
    if (!scroller && rows.length > 0) onEnd?.()
  }, [scroller, rows.length, onEnd])
  const rowKey = (r: number) => {
    const first = rows[r]?.[0]
    return first === undefined ? String(r) : keyOf(first)
  }
  if (!scroller)
    return (
      <View style={{ gap: gap.row }}>
        {rows.map((_, r) => (
          <Fragment key={rowKey(r)}>{drawRow(r)}</Fragment>
        ))}
      </View>
    )
  return (
    <Virtual
      ref={list}
      count={rows.length}
      estimateSize={() => estimate}
      getKey={rowKey}
      gap={gap.row}
      overscan={overscan}
      render={drawRow}
      onEnd={onEnd}
    />
  )
}
