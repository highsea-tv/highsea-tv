// SPDX-License-Identifier: AGPL-3.0-only
// The prototype chrome: the toolbar, the stage with the platform frame, and the launcher. It owns
// the toolbar state and the current route (its own hash mirrors the screen's), and talks to the
// screen in the frame over postMessage.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { platformHome } from '../flows.ts'
import { isMessage, post } from '../proto/bridge.ts'
import { createStore, loadState, type Platform, platformOf, saveState } from '../proto/state.ts'
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
  const reported = useRef<string | null>(null)

  useEffect(() => {
    document.documentElement.dataset.chrome = ''
    document.documentElement.dataset.theme = 'default'
  }, [])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!isMessage(e.data) || e.source !== frame.current?.contentWindow) return
      const msg = e.data
      if (msg.hs === 'ready')
        post(frame.current?.contentWindow, { hs: 'state', state: store.get() })
      else if (msg.hs === 'route') {
        reported.current = msg.path
        setPath(msg.path, true)
      } else if (msg.hs === 'clock') setNow(msg.now)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [setPath])

  useEffect(() => {
    post(frame.current?.contentWindow, { hs: 'state', state })
  }, [state])

  // the toolbar, the launcher or the browser's back button changed the route: tell the screen
  useEffect(() => {
    if (platform && path !== reported.current)
      post(frame.current?.contentWindow, { hs: 'navigate', path })
  }, [path, platform])

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
      />
      {platform ? (
        <Stage ref={frame} platform={platform} width={state.width} path={path} />
      ) : (
        <Launcher onOpen={go} />
      )}
    </div>
  )
}
