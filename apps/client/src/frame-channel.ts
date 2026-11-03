// SPDX-License-Identifier: AGPL-3.0-only
// The client's end of the prototypes' frame channel (@highsea-tv/mock/frame), for the root layout.
// In mock mode, framed by the prototypes' chrome on the web, it follows the frame: the form factor's
// input and the toolbar's theme for ThemeProvider, the toolbar's states for the mock transport, and
// the chrome's navigation; and it tells the chrome its route, the role after a sign-in and that
// it's ready. Opened directly, the address's `?ff=` still sets the input (./form-factor.web.ts),
// and in mock mode the address's toolbar states stand in for the chrome's (`mock.query`).
// A real build, or the phone and the TV, never listens: without mock mode `mock` is undefined, and
// the hook gives the `?ff=` setting alone.
import type { ThemeId } from '@highsea-tv/mock/state'
import type { FormFactorSetting } from '@highsea-tv/tokens'
import { router, usePathname } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { formFactorOverride } from './form-factor'
import { settingOf } from './frame.ts'
import { mock } from './transport.ts'

export type FrameChannel = {
  /** What ThemeProvider's `formFactor` takes: the frame's input, or `?ff=`'s, or nothing. */
  formFactor: FormFactorSetting | undefined
  /** The toolbar's theme in mock mode, which ThemeProvider draws with; nothing otherwise. */
  theme: ThemeId | undefined
  /** ThemeProvider's `fontScale`: 2 for the toolbar's 200% text, nothing otherwise. */
  fontScale: number | undefined
  /** ThemeProvider's `reducedMotion`: the toolbar's in mock mode, nothing otherwise (the OS's). */
  reducedMotion: boolean | undefined
  /** Inside the prototypes' chrome, in mock mode. */
  framed: boolean
}

/** Simulated seconds per real second for the toolbar's time, as the prototypes run the mock. */
const SPEEDS = { play: 1, pause: 0, fast: 10 } as const

/** The chrome's window, when the page is framed on the web. */
const parentWindow = (): Window | null =>
  typeof window !== 'undefined' && window.parent && window.parent !== window ? window.parent : null

/**
 * Call once, in the root layout (inside Expo Router, so the route can be read), and pass
 * `formFactor` and the theme to ThemeProvider. The `?ff=` read is kept from the first render, since
 * the router changes the address as the client is used.
 */
export function useFrameChannel(): FrameChannel {
  const pathname = usePathname()
  const [channel, setChannel] = useState<FrameChannel>(() => ({
    formFactor: settingOf(formFactorOverride()),
    theme: mock?.query.theme,
    fontScale: mock?.query.largeText ? 2 : undefined,
    // off is no choice: the OS's setting stands (ThemeProvider reads it when this is undefined)
    reducedMotion: mock?.query.reducedMotion || undefined,
    framed: false,
  }))
  const link = useRef<{ route(path: string): void } | null>(null)
  const route = useRef(pathname)
  route.current = pathname

  useEffect(() => {
    if (!mock) return
    const speed = { current: SPEEDS[mock.query.time ?? 'play'] as number }
    const stopClock = mock.transport.mock.run(() => speed.current)
    const parent = parentWindow()
    if (!parent) return stopClock
    const frame = mock.frame.linkFrame({
      self: window,
      parent,
      origin: window.location.origin,
      transport: mock.transport,
      onState: (input, state) => {
        speed.current = SPEEDS[state.time]
        const next: FrameChannel = {
          formFactor: input,
          theme: state.theme,
          fontScale: state.largeText ? 2 : undefined,
          reducedMotion: state.reducedMotion || undefined,
          framed: true,
        }
        setChannel((c) =>
          (Object.keys(next) as (keyof FrameChannel)[]).every((k) => c[k] === next[k]) ? c : next,
        )
      },
      onNavigate: (path) => {
        if (path !== route.current) router.navigate(path as never)
      },
    })
    link.current = frame
    frame.route(route.current)
    const stopRole = mock.onRole(frame.role)
    return () => {
      stopRole()
      frame.close()
      link.current = null
      stopClock()
    }
  }, [])

  useEffect(() => {
    link.current?.route(pathname)
  }, [pathname])

  return channel
}
