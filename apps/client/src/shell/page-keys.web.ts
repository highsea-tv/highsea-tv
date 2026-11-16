// SPDX-License-Identifier: AGPL-3.0-only
// The page's key presses in a browser window: a `keydown` listener on the document, which every
// key press reaches unless a part stops it (https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event).
import { useEffect, useRef } from 'react'
import type { usePageKeys as native } from './page-keys.ts'

export const usePageKeys: typeof native = (onKey) => {
  const latest = useRef(onKey)
  latest.current = onKey
  useEffect(() => {
    if (typeof document === 'undefined') return
    const key = (e: KeyboardEvent) => latest.current(e)
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
}
