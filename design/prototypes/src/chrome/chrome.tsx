// SPDX-License-Identifier: AGPL-3.0-only
// The prototype chrome: the toolbar, the stage with the platform frame, and the launcher. It owns
// the toolbar state and the current route (its own hash mirrors the screen's), and talks to the
// screen in the frame over postMessage. On a route apps/client holds (./client.ts), the frame holds
// the client instead, and the two talk over the frame channel (@highsea-tv/mock/frame): the
// frame's input and the toolbar's states down, the client's route and the role after a sign-in up.
import {
  FRAME_CHANNEL,
  frameStateOf,
  listenFrame,
  parseClientMessage,
  postFrame,
} from '@highsea-tv/mock/frame'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { platformHome } from '../flows.ts'
import { isMessage, post } from '../proto/bridge.ts'
import {
  createStore,
  loadState,
  type Platform,
  type ProtoState,
  platformOf,
  saveState,
} from '../proto/state.ts'
import {
  type ClientPlatform,
  chromePathOf,
  clientPathOf,
  FRAME_INPUTS,
  heldByClient,
} from './client.ts'
import { Launcher } from './launcher.tsx'
import { Stage } from './stage.tsx'
import { Toolbar } from './toolbar.tsx'

const store = createStore(loadState(), saveState)

const readHash = () => window.location.hash.replace(/^#/, '') || '/'

function useHashPath(): [string, (path: string, replace?: boolean) => void] {
  const path = useSyncExternalStore((notify) => {
    window.addEventListener('hashchange', notify)
    return () => window.removeEventListener('hashchange', notify)
  }, readHash)
  const set = useCallback((next: string, replace = false) => {
    if (next === readHash()) return
    if (replace) {
      history.replaceState(null, '', `#${next}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    } else window.location.hash = next
  }, [])
  return [path, set]
}

export function Chrome() {
  const state = useSyncExternalStore(store.subscribe, store.get)
  const [path, setPath] = useHashPath()
  const platform = platformOf(path)
  const frame = useRef<HTMLIFrameElement>(null)
  const [now, setNow] = useState<number | null>(null)
  // the path the screen last reported, so the chrome doesn't echo it back
  const [reported, setReported] = useState<string | null>(null)
  // whether the frame holds the client: decided on the chrome's own navigation, and kept while the
  // client reports where it went (adjusted while rendering, https://react.dev/learn/you-might-not-need-an-effect)
  const [hold, setHold] = useState(() => ({ path, on: heldByClient(path) }))
  let holding = hold.on
  if (hold.path !== path) {
    holding = reported === path && hold.on ? true : heldByClient(path)
    setHold({ path, on: holding })
  }
  holding &&= platform !== null && platform !== 'admin'
  const holdingRef = useRef(holding)
  holdingRef.current = holding
  // the route the chrome wants, for the client's `ready`, which may come after the chrome navigated
  const wanted = useRef(path)
  wanted.current = path

  useEffect(() => {
    document.documentElement.dataset.chrome = ''
    document.documentElement.dataset.theme = 'default'
  }, [])

  // the client's end: ready, its route, and the role a sign-in changed to
  useEffect(() => {
    if (!holding || !platform || platform === 'admin') return
    const p: ClientPlatform = platform
    return listenFrame(
      window,
      () => frame.current?.contentWindow,
      window.location.origin,
      parseClientMessage,
      (msg) => {
        if (msg.type === 'ready') {
          const target = frame.current?.contentWindow
          postState(target, p, store.get())
          // the frame opened at its `src`; if the chrome has moved on since, the client follows
          const want = clientPathOf(wanted.current)
          if (want !== null && want !== openedAt(frame.current))
            postFrame(
              target,
              { channel: FRAME_CHANNEL, type: 'navigate', path: want },
              window.location.origin,
            )
        } else if (msg.type === 'route') {
          const next = chromePathOf(p, msg.path)
          setReported(next)
          setPath(next, true)
        } else store.set((s) => (s.role === msg.role ? s : { ...s, role: msg.role }))
      },
    )
  }, [holding, platform, setPath])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (holdingRef.current) return
      if (!isMessage(e.data) || e.source !== frame.current?.contentWindow) return
      const msg = e.data
      if (msg.hs === 'ready')
        post(frame.current?.contentWindow, { hs: 'state', state: store.get() })
      else if (msg.hs === 'route') {
        setReported(msg.path)
        setPath(msg.path, true)
      } else if (msg.hs === 'clock') setNow(msg.now)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [setPath])

  useEffect(() => {
    if (holding && platform && platform !== 'admin')
      postState(frame.current?.contentWindow, platform, state)
    else post(frame.current?.contentWindow, { hs: 'state', state })
  }, [state, holding, platform])

  // the toolbar, the launcher or the browser's back button changed the route: tell the screen
  useEffect(() => {
    if (!platform || path === reported) return
    const clientPath = clientPathOf(path)
    if (holding && clientPath !== null)
      postFrame(
        frame.current?.contentWindow,
        { channel: FRAME_CHANNEL, type: 'navigate', path: clientPath },
        window.location.origin,
      )
    else if (!holding) post(frame.current?.contentWindow, { hs: 'navigate', path })
  }, [path, platform, holding, reported])

  const go = (next: string) => setPath(next)
  const switchPlatform = (p: Platform) => setPath(platformHome[p])

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <Toolbar
        state={state}
        set={store.set}
        path={path}
        platform={platform}
        now={now}
        onNavigate={go}
        onPlatform={switchPlatform}
        // while the frame holds the client, the toolbar dims what the client doesn't follow yet
        holding={holding}
      />
      {platform ? (
        <Stage
          ref={frame}
          platform={platform}
          width={state.width}
          path={path}
          client={holding ? (clientPathOf(path) ?? '/') : null}
        />
      ) : (
        <Launcher onOpen={go} />
      )}
    </div>
  )
}

/** The client's route the frame opened at: its `src`'s path under /web and its query, less `ff`. */
function openedAt(iframe: HTMLIFrameElement | null): string | null {
  if (!iframe?.src) return null
  const { pathname, searchParams } = new URL(iframe.src)
  if (!pathname.startsWith('/web')) return null
  searchParams.delete('ff')
  const query = searchParams.toString()
  return `${pathname.slice('/web'.length).replace(/\/+$/, '') || '/'}${query ? `?${query}` : ''}`
}

/** The frame's input and the toolbar's states, to the client in the frame. */
function postState(target: Window | null | undefined, platform: ClientPlatform, state: ProtoState) {
  postFrame(
    target,
    {
      channel: FRAME_CHANNEL,
      type: 'state',
      input: FRAME_INPUTS[platform],
      state: frameStateOf(state),
    },
    window.location.origin,
  )
}
