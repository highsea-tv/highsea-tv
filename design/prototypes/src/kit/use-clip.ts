// SPDX-License-Identifier: AGPL-3.0-only
import { useLayoutEffect, useState } from 'react'

/**
 * Fits a list to a widget's height: items that would be cut off at the bottom are hidden, never
 * half-shown, and the count of hidden ones comes back so the widget can say "3 more". Pass `ref`
 * to the box that clips and `items` as a selector for the rows inside it. Re-checks when the box
 * resizes or its rows change. In tests (no layout) nothing is hidden.
 */
export function useClip<T extends HTMLElement>(items: string) {
  const [el, ref] = useState<T | null>(null)
  const [hidden, setHidden] = useState(0)
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const check = () => {
      const bottom = el.getBoundingClientRect().bottom
      let n = 0
      for (const item of el.querySelectorAll<HTMLElement>(items)) {
        item.style.visibility = ''
        if (item.getBoundingClientRect().bottom > bottom + 0.5) {
          item.style.visibility = 'hidden'
          n++
        }
      }
      setHidden(n)
    }
    check()
    const resize = new ResizeObserver(check)
    resize.observe(el)
    const rows = new MutationObserver(check)
    rows.observe(el, { childList: true, subtree: true })
    return () => {
      resize.disconnect()
      rows.disconnect()
    }
  }, [el, items])
  return { ref, hidden }
}
