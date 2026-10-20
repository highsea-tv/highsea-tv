'use client'
// SPDX-License-Identifier: AGPL-3.0-only
import { durations } from '@highsea/tokens'
import { useEffect, useState, useSyncExternalStore } from 'react'

/** Subscribes to a media query. Server renders and the first client render report `fallback`. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  )
}

export type Breakpoint = 'compact' | 'medium' | 'expanded' | 'wide'

/** The layout breakpoint (docs/design-language/spacing-layout.md#breakpoints). */
export function useBreakpoint(): Breakpoint {
  const medium = useMediaQuery('(min-width: 37.5rem)', true)
  const expanded = useMediaQuery('(min-width: 64rem)', true)
  const wide = useMediaQuery('(min-width: 90rem)')
  return wide ? 'wide' : expanded ? 'expanded' : medium ? 'medium' : 'compact'
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * Returns `value` once it has stayed the same for `ms` (default `duration.dwell`), so heavy work
 * bound to focus (hero artwork, prefetch) doesn't thrash while focus moves fast.
 */
export function useDwell<T>(value: T, ms: number = durations.dwell): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
