// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'

/**
 * An element's width, for layouts that depend on their container rather than the viewport (a
 * widget's columns follow its span). Pass `ref` to the element; it can mount later, after a
 * loading state. Starts at `fallback` until measured, and in tests.
 */
export function useWidth<T extends HTMLElement>(fallback = 1200) {
  const [el, ref] = useState<T | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return { ref, width }
}
