// SPDX-License-Identifier: AGPL-3.0-only
import { type RefObject, useEffect } from 'react'
import { useSound } from '../sound/context.tsx'
import { createSpatialNavigator } from './navigator.ts'

/**
 * Arrow-key (D-pad) navigation inside `ref` using the spatial model. Plays `navigate` on moves;
 * at an edge, focus stays put and nudges silently.
 */
export function useSpatialNavigation(ref: RefObject<HTMLElement | null>, enabled = true): void {
  const play = useSound()
  useEffect(() => {
    const root = ref.current
    if (!root || !enabled) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const nav = createSpatialNavigator(root, {
      onMove: () => play('navigate'),
      reducedMotion: () => reduce.matches,
    })
    const onResize = () => nav.refresh()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      nav.destroy()
    }
  }, [ref, enabled, play])
}
