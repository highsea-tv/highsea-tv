// SPDX-License-Identifier: AGPL-3.0-only
// The screen inside the frame: the toolbar's state applied (theme, motion, text size, sound),
// the mock client for the chosen data state and role, and the routes. Tests render `ScreenApp`
// directly with a memory location; the app renders `FramedScreen`, which talks to the chrome.
import { UIProvider } from '@highsea/ui-web'
import { MotionConfig } from 'motion/react'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type BaseLocationHook, Router, useLocation } from 'wouter'
import { navigate, useHashLocation } from 'wouter/use-hash-location'
import { createClient, type Mock } from '../mock/client.ts'
import { ClientProvider } from '../mock/hooks.tsx'
import { inFrame, isMessage, post } from '../proto/bridge.ts'
import {
  loadState,
  type Platform,
  type ProtoState,
  platformOf,
  stateFromParams,
  type TimeMode,
} from '../proto/state.ts'
import { Routes } from '../routes.tsx'
import { applyEnvironment } from './environment.ts'

const speeds: Record<TimeMode, number> = { play: 1, pause: 0, fast: 10 }

const ProtoContext = createContext<ProtoState | null>(null)

/** The toolbar state, for the few screens that show prototype-only affordances. */
export function useProto(): ProtoState {
  const state = useContext(ProtoContext)
  if (!state) throw new Error('useProto needs a ScreenApp')
  return state
}

function Platformed({ state, children }: { state: ProtoState; children: ReactNode }) {
  const [location] = useLocation()
  const platform: Platform = platformOf(location) ?? 'admin'
  return (
    <UIProvider
      // admin plays the same pack 6 dB down (admin.md#sound)
      sound={{ enabled: state.sound[platform], volume: platform === 'admin' ? 0.5 : 1 }}
    >
      <MotionConfig reducedMotion={state.reducedMotion ? 'always' : 'user'}>
        {children}
      </MotionConfig>
    </UIProvider>
  )
}

export type ScreenAppProps = {
  mock: Mock
  state: ProtoState
  /** The router's location hook. Default: the hash (`#/admin/...`). */
  hook?: BaseLocationHook
  /** Simulated latency per call, in ms. Tests use 0. */
  latency?: number
  children?: ReactNode
}

export function ScreenApp({
  mock,
  state,
  hook = useHashLocation,
  latency,
  children,
}: ScreenAppProps) {
  const client = useMemo(
    () => createClient(mock, { data: state.data, role: state.role, latency }),
    [mock, state.data, state.role, latency],
  )
  useLayoutEffect(() => applyEnvironment(state), [state])

  const speed = useRef(speeds[state.time])
  speed.current = speeds[state.time]
  useEffect(() => mock.run(() => speed.current), [mock])

  return (
    <ProtoContext.Provider value={state}>
      <ClientProvider client={client}>
        <Router hook={hook}>
          <Platformed state={state}>
            <Routes />
            {children}
          </Platformed>
        </Router>
      </ClientProvider>
    </ProtoContext.Provider>
  )
}

/** Reports the route to the chrome, so its hash and toolbar follow the screen. */
function RouteReporter() {
  const [location] = useLocation()
  useEffect(() => post(window.parent, { hs: 'route', path: location }), [location])
  return null
}

/**
 * The screen as the app runs it: state from the chrome over postMessage (or from URL parameters
 * when opened on its own), and the clock reported back for the toolbar's readout.
 */
export function FramedScreen({ mock }: { mock: Mock }) {
  const [state, setState] = useState(() =>
    stateFromParams(new URLSearchParams(window.location.search), loadState()),
  )
  const framed = inFrame()

  useEffect(() => {
    document.documentElement.dataset.screen = ''
    if (!framed) return
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !isMessage(e.data)) return
      if (e.data.hs === 'state') setState(e.data.state)
      else if (e.data.hs === 'navigate') navigate(e.data.path)
    }
    window.addEventListener('message', onMessage)
    post(window.parent, { hs: 'ready' })
    const stop = mock.clock.onAdvance((_, now) => post(window.parent, { hs: 'clock', now }))
    post(window.parent, { hs: 'clock', now: mock.clock.now() })
    return () => {
      window.removeEventListener('message', onMessage)
      stop()
    }
  }, [framed, mock])

  return (
    <ScreenApp mock={mock} state={state}>
      {framed && <RouteReporter />}
    </ScreenApp>
  )
}
