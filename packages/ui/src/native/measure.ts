// SPDX-License-Identifier: AGPL-3.0-only
// Layouts that follow their container rather than the window, as the web renderer's
// (web/lib/measure.ts): widgets fit their rows and spans. A View's width comes from its layout
// (`onLayout`, https://reactnative.dev/docs/view#onlayout). The clip reads the rows' boxes, which
// only the web can: react-native-web's View is a DOM element, its ref the element
// (https://necolas.github.io/react-native-web/docs/view/), so the same ResizeObserver and
// MutationObserver check runs on it. Off the web (a phone or TV never draws the admin) nothing is
// hidden and the box's `overflow: hidden` clips.
import { useLayoutEffect, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

/** The DOM's boxes and observers, which React Native's types leave out: only the web has them. */
type Row = { getBoundingClientRect(): { bottom: number }; style: { visibility: string } }
type Box = {
  getBoundingClientRect(): { bottom: number }
  querySelectorAll?(s: string): Iterable<Row>
}
type Observer = { observe(target: unknown, options?: object): void; disconnect(): void }
type Observe = new (callback: () => void) => Observer
const dom = globalThis as { ResizeObserver?: Observe; MutationObserver?: Observe }

/**
 * Fits a list to a widget's height: rows that would be cut off at the bottom are hidden, never
 * half-shown, and the count of hidden ones comes back so the widget can say "3 more". Pass `ref`
 * to the View that clips and `items` as a selector for the rows inside it. Re-checks when the box
 * resizes or its rows change. In tests (no layout) nothing is hidden.
 */
export function useClip(items: string) {
  const [el, ref] = useState<unknown>(null)
  const [hidden, setHidden] = useState(0)
  useLayoutEffect(() => {
    const box = el as Box | null
    const { ResizeObserver, MutationObserver } = dom
    if (!box?.querySelectorAll || !ResizeObserver || !MutationObserver) return
    const rowsOf = box.querySelectorAll.bind(box)
    const check = () => {
      const bottom = box.getBoundingClientRect().bottom
      let n = 0
      for (const item of rowsOf(items)) {
        item.style.visibility = ''
        if (item.getBoundingClientRect().bottom > bottom + 0.5) {
          item.style.visibility = 'hidden'
          n++
        }
      }
      setHidden(n)
    }
    // The rows are watched too (HT-47): one that grows after the box was checked (posters whose
    // width follows the widget's, a title that wraps) moves the rows under it past the edge
    // without the box resizing or a row being added. Hiding a row doesn't resize it, so this
    // can't loop, and observing a row twice is one observation
    // (https://drafts.csswg.org/resize-observer/#dom-resizeobserver-observe).
    const resize = new ResizeObserver(check)
    const watch = () => {
      for (const item of rowsOf(items)) resize.observe(item)
      check()
    }
    watch()
    resize.observe(box)
    const rows = new MutationObserver(watch)
    rows.observe(box, { childList: true, subtree: true })
    return () => {
      resize.disconnect()
      rows.disconnect()
    }
  }, [el, items])
  return { ref: ref as (node: unknown) => void, hidden }
}

/**
 * A View's width, for layouts that depend on their container (a widget's columns follow its
 * span). Pass `onLayout` to the View; it can mount later, after a loading state. `fallback` until
 * measured, and in tests.
 */
export function useWidth(fallback = 1200) {
  const [width, setWidth] = useState(fallback)
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w > 0) setWidth(w)
  }
  return { onLayout, width }
}

/**
 * A View's width and height, for layouts that fit both (a widget's posters are as wide as leaves a
 * whole row in its height). As `useWidth`: pass `onLayout` to the View. The height is 0 until
 * measured, and in tests.
 */
export function useSize(fallback = 1200) {
  const [size, setSize] = useState({ width: fallback, height: 0 })
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width > 0)
      setSize((was) => (was.width === width && was.height === height ? was : { width, height }))
  }
  return { onLayout, ...size }
}
