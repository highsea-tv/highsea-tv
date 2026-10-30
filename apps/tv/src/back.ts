// SPDX-License-Identifier: AGPL-3.0-only
// The remote's Back, per screen (the prototype's back.ts): the screen on view registers what Back
// does there (close a panel, hide the player's chrome); the root calls it. Without one, Back goes up
// a level, and at Home's root it's homeBack's (tv.md#remote-keys).
import { useIsFocused } from 'expo-router'
import { createContext, useContext, useEffect, useRef } from 'react'

export type BackRegistry = { current: (() => void) | null }

export const BackContext = createContext<BackRegistry>({ current: null })

/**
 * Registers this screen's Back while the screen is on view: a screen stays mounted under the ones
 * opened from it, and its Back isn't theirs. The latest registered handler wins; when an overlay
 * that registered its own unmounts, the one before it is back.
 */
export function useBack(handler: () => void) {
  const registry = useContext(BackContext)
  const focused = useIsFocused()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!focused) return
    const call = () => ref.current()
    const before = registry.current
    registry.current = call
    return () => {
      if (registry.current === call) registry.current = before
    }
  }, [registry, focused])
}
