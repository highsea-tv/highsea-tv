// SPDX-License-Identifier: AGPL-3.0-only
// The web client (C1 to C8, ADR 0053), served by the server at /web. The gate comes first: a
// server not set up yet sends the owner to its setup, nobody signed in gets the sign-in, and a
// server that stops answering gets Unreachable. Then the routes, the prototype's
// (design/prototypes/src/web/web-app.tsx), under /web. Links are plain anchors, as the design
// system's Poster and Button render them; same-app ones are taken over here so a click changes
// the route without loading the page again.
import type { CurrentSession } from '@highsea-tv/api-contract'
import { useSession } from '@highsea-tv/client/data'
import { ApiError, createClient } from '@highsea-tv/sdk'
import { ClientProvider, useClient } from '@highsea-tv/sdk/react'
import { Skeleton, UIProvider } from '@highsea-tv/ui-web'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Router, Switch, useLocation } from 'wouter'
import { WebCollection, WebCollections } from './collections.tsx'
import { DesktopRoot, DesktopUnreachable, useDesktop } from './desktop/root.tsx'
import { WindowFrame } from './desktop/window.tsx'
import { WebDetail } from './detail.tsx'
import { WebHome } from './home.tsx'
import { hostFetch, inApp } from './host.ts'
import { WebLibrary } from './library.tsx'
import { WebPlayer } from './player.tsx'
import { ApplyDevicePrefs } from './prefs.tsx'
import { WebSearch } from './search.tsx'
import { WebDownloads, WebProfile, WebSettings } from './settings.tsx'
import {
  BASE,
  NotFound,
  ReachableContext,
  SessionContext,
  Unreachable,
  useServerName,
  WebShell,
} from './shell.tsx'
import { SignIn } from './sign-in.tsx'

export function App() {
  return (
    <UIProvider>
      {inApp ? <DesktopRoot>{(key) => <Connected key={key} />}</DesktopRoot> : <Connected />}
    </UIProvider>
  )
}

/** One server's client, its routes and its gate. The desktop app makes a new one per server. */
function Connected() {
  const client = useMemo(() => createClient({ fetch: hostFetch }), [])
  return (
    <ClientProvider client={client}>
      <Router base={BASE}>
        <Chrome />
        <Gate />
      </Router>
    </ClientProvider>
  )
}

/** The desktop app's window chrome; the player draws its own, over the film. */
function Chrome() {
  const [location] = useLocation()
  return location.startsWith('/play/') ? null : <WindowFrame />
}

const unreachable = (e: unknown) => e instanceof ApiError && e.code === 'unavailable'

function Gate() {
  const session = useSession()
  const app = useDesktop()
  if (session.status === 'loading') return <Loading />
  if (session.status === 'error') {
    if (session.error instanceof ApiError && session.error.status === 401)
      return <SignIn onSignedIn={session.refetch} />
    if (unreachable(session.error))
      return app ? (
        <DesktopUnreachable
          name={app.current.name}
          onRetry={() => app.reconnect().then(session.refetch)}
          onSwitch={app.choose}
          className="min-h-screen bg-bg text-text"
        />
      ) : (
        <Unreachable name={window.location.host} onRetry={session.refetch} />
      )
    return <SignIn onSignedIn={session.refetch} />
  }
  return <SignedIn session={session.data} />
}

function Loading() {
  return (
    <div aria-busy className="grid min-h-screen place-items-center bg-bg">
      <Skeleton className="h-8 w-40" />
    </div>
  )
}

/** How often the app checks the event stream is open, and asks the server when it isn't. */
const CHECK_MS = 3000

/**
 * Whether the server answers. Every signed-in screen keeps the event stream open (the SDK's
 * queries subscribe to it); while it's down, the health check says whether the server is gone or
 * the stream is only reconnecting.
 */
function useReachable() {
  const client = useClient()
  const [offline, setOffline] = useState(false)
  const check = useCallback(async () => {
    if (client.events.connected()) return setOffline(false)
    try {
      await client.system.health()
      setOffline(false)
    } catch (e) {
      // a health check that answers anything at all means the server is there
      setOffline(unreachable(e))
    }
  }, [client])
  useEffect(() => {
    const stop = client.events.subscribe(() => {})
    const timer = setInterval(check, CHECK_MS)
    return () => {
      clearInterval(timer)
      stop()
    }
  }, [client, check])
  return { offline, retry: () => void check() }
}

/** Takes over clicks on links inside the app, so they change the route in place. */
function useLinks() {
  const [, navigate] = useLocation()
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      // the app's window shows only highsea: another site, or a new tab, opens in the browser
      // (Tauri's webviews open no windows of their own; https://v2.tauri.app/plugin/opener/)
      const leaves = url.origin !== window.location.origin || (a.target && a.target !== '_self')
      if (inApp && leaves && /^https?:$/.test(url.protocol)) {
        e.preventDefault()
        void openUrl(url.href)
        return
      }
      if (leaves) return
      if (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) return
      e.preventDefault()
      navigate(url.pathname.slice(BASE.length) + url.search + url.hash || '/')
    }
    document.addEventListener('click', on)
    return () => document.removeEventListener('click', on)
  }, [navigate])
}

/** A new page starts at its top, as a page load would. */
function useScrollToTop() {
  const [location] = useLocation()
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change of route is the trigger
  useEffect(() => {
    // braces, so the effect returns nothing: React calls anything an effect returns as its cleanup
    window.scrollTo(0, 0)
  }, [location])
}

function SignedIn({ session }: { session: CurrentSession }) {
  const reachable = useReachable()
  useLinks()
  useScrollToTop()
  return (
    <SessionContext.Provider value={session}>
      <ReachableContext.Provider value={reachable}>
        <ApplyDevicePrefs />
        <Title />
        <Routes />
      </ReachableContext.Provider>
    </SessionContext.Provider>
  )
}

/** The tab names the server, as the admin's does. */
function Title() {
  const name = useServerName()
  useEffect(() => {
    document.title = name
  }, [name])
  return null
}

function Routes() {
  return (
    <Switch>
      <Route path="/play/:id/start">
        <WebPlayer />
      </Route>
      <Route path="/play/:id">
        <WebPlayer />
      </Route>
      <Route path="/">
        <WebShell overHero>
          <WebHome />
        </WebShell>
      </Route>
      <Route path="/library/collections">
        <WebShell>
          <WebCollections />
        </WebShell>
      </Route>
      <Route path="/library">
        <WebShell>
          <WebLibrary />
        </WebShell>
      </Route>
      <Route path="/movies/:id">
        <WebShell overHero>
          <WebDetail />
        </WebShell>
      </Route>
      <Route path="/collections/:id">
        <WebShell>
          <WebCollection />
        </WebShell>
      </Route>
      <Route path="/search">
        <WebShell>
          <WebSearch />
        </WebShell>
      </Route>
      <Route path="/settings/:section?">
        <WebShell>
          <WebSettings />
        </WebShell>
      </Route>
      <Route path="/profile">
        <WebShell>
          <WebProfile />
        </WebShell>
      </Route>
      <Route path="/downloads">
        <WebShell>
          <WebDownloads />
        </WebShell>
      </Route>
      <Route>
        <WebShell>
          <NotFound />
        </WebShell>
      </Route>
    </Switch>
  )
}
