// SPDX-License-Identifier: AGPL-3.0-only
// The remote's Back, per screen: the screen on view registers what Back does there (close a panel,
// hide the player's chrome, go up a level); the TV root calls it. Without one, Back goes Home.
import { createContext, useContext, useEffect, useRef } from 'react'

export type BackRegistry = { current: (() => void) | null }

export const BackContext = createContext<BackRegistry>({ current: null })

/** Registers this screen's Back. The latest render's handler wins. */
export function useBack(handler: () => void) {
  const registry = useContext(BackContext)
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const call = () => ref.current()
    registry.current = call
    return () => {
      if (registry.current === call) registry.current = null
    }
  }, [registry])
}
