// SPDX-License-Identifier: AGPL-3.0-only
// The remote's Back, per screen (tv.md#remote-keys; the prototype's tv/back.ts): the screen on view
// registers what Back does there (go back from the password to the code, close a section); the
// TV's root calls it. A screen's handler answers whether it took the press, and one that didn't
// hands it to the platform (leaving the app from the gate's first screen). Without one, Back goes
// back where the screen was opened from, or Home, and at Home it's the platform's. Only
// the TV's form factor mounts BackKeys, so a phone and a pointer keep their own Back.
//
// On tvOS the Menu key only reaches the app while it's held (./back-key.ts), so BackKeys alone
// holds or lets it go, from whether a screen on view says it's at its root (useLeaveOnBack). The
// screens set that state and BackKeys acts on it in its own effect, after its children's: a
// child's effects run before its parent's, so a screen that let the key go in its own effect
// would be overruled by the root holding it on a cold start.
import { router, useIsFocused, usePathname } from 'expo-router'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { holdMenuKey, useBackKey } from './back-key'

type BackRegistry = {
  current: (() => boolean) | null
  /** A screen on view is at its root; the function it returns says it no longer is. */
  root: () => () => void
}

const BackContext = createContext<BackRegistry>({ current: null, root: () => () => {} })

/**
 * Registers this screen's Back while the screen is on view: a screen stays mounted under the ones
 * opened from it, and its Back isn't theirs. The latest registered wins; when it unmounts, the one
 * before it is back.
 */
export function useBack(handler: () => boolean) {
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

/**
 * Lets Back leave highsea while this screen is on view and `atRoot` (Home with nothing open, or
 * Choose a server with no server to go back to). Outside the TV's BackKeys it does nothing.
 */
export function useLeaveOnBack(atRoot: boolean) {
  const registry = useContext(BackContext)
  const focused = useIsFocused()
  useEffect(() => {
    if (!focused || !atRoot) return
    return registry.root()
  }, [registry, focused, atRoot])
}

/** The TV's Back: the screen's own, else back a screen, else Home; at Home it's the platform's. */
export function BackKeys({ children }: { children: ReactNode }) {
  const [roots, setRoots] = useState(0)
  const root = useCallback(() => {
    setRoots((n) => n + 1)
    let done = false
    return () => {
      if (done) return
      done = true
      setRoots((n) => n - 1)
    }
  }, [])
  const registry = useMemo<BackRegistry>(() => ({ current: null, root }), [root])
  // after every child's effect, so the last word on the key is this one
  useEffect(() => holdMenuKey(roots === 0), [roots])
  useEffect(() => () => holdMenuKey(true), [])
  const pathname = usePathname()
  const path = useRef(pathname)
  path.current = pathname
  useBackKey(() => {
    if (registry.current) return registry.current()
    if (router.canGoBack()) {
      router.back()
      return true
    }
    if (path.current !== '/') {
      router.replace('/')
      return true
    }
    return false
  })
  return <BackContext.Provider value={registry}>{children}</BackContext.Provider>
}
