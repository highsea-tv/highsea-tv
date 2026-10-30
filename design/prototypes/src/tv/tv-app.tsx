// SPDX-License-Identifier: AGPL-3.0-only
// The TV client (C1–C7), in screen units with D-pad focus: sign-in, home, library, item detail,
// the player, search and settings. Back goes up a level: each screen says what that means (close
// a panel, hide the player's chrome), else Home.
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { useConnection, useServer } from '../client/data.ts'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { TvRoot } from '../kit/tv/tv-root.tsx'
import { BackContext, type BackRegistry, useBack } from './back.ts'
import { TvCollection } from './collection.tsx'
import { TvCollections } from './collections.tsx'
import { TvConnect } from './connect.tsx'
import { TvDetail } from './detail.tsx'
import { TvHome } from './home.tsx'
import {
  GlobalNav,
  RailContext,
  type RailHost,
  railInset,
  ServerIdentity,
  TvButton,
  TvMessage,
  tvHref,
  useTvNav,
} from './kit.tsx'
import { TvLibrary } from './library.tsx'
import { TvPlayer } from './player.tsx'
import { TvSearch } from './search.tsx'
import { TvSettings } from './settings.tsx'

function Detail() {
  const [panel, setPanel] = useState(false)
  useBack(() => (panel ? setPanel(false) : history.back()))
  return <TvDetail panel={panel} onPanel={setPanel} />
}

function Collection() {
  useBack(() => history.back())
  return <TvCollection />
}

function Unreachable() {
  const server = useServer()
  const name = server.data?.name ?? 'Harbor'
  return (
    <>
      <ServerIdentity always />
      <TvMessage
        title={`Can’t reach ${name}`}
        actions={
          <>
            <TvButton primary initial icon="refresh" onClick={() => window.location.reload()}>
              Try again
            </TvButton>
            <TvButton icon="server" href={tvHref('/connect')}>
              Another server
            </TvButton>
          </>
        }
      >
        highsea tried {name} on this network and at its remote address. It may be off, or the
        network may be down.
      </TvMessage>
    </>
  )
}

function NotFound() {
  useBack(() => history.back())
  return (
    <>
      <ServerIdentity />
      <GlobalNav down="message" />
      <div data-group="message" data-go-up="nav" className="h-full">
        <TvMessage
          title="There’s nothing here"
          actions={
            <TvButton primary initial href={tvHref('/')}>
              Home
            </TvButton>
          }
        >
          It may have moved.
        </TvMessage>
      </div>
    </>
  )
}

function Screens() {
  const connection = useConnection()
  const [location] = useLocation()
  if (connection === 'offline' && location !== '/connect') return <Unreachable />
  return (
    <Switch>
      <Route path="/connect">
        <TvConnect />
      </Route>
      <Route path="/play/:id/start">
        <TvPlayer fromStart />
      </Route>
      <Route path="/play/:id">
        <TvPlayer />
      </Route>
      <Route path="/">
        <TvHome />
      </Route>
      <Route path="/library/collections">
        <TvCollections />
      </Route>
      <Route path="/library">
        <TvLibrary />
      </Route>
      <Route path="/movies/:id">
        <Detail />
      </Route>
      <Route path="/collections/:id">
        <Collection />
      </Route>
      <Route path="/search">
        <TvSearch />
      </Route>
      <Route path="/settings">
        <TvSettings />
      </Route>
      <Route>
        <NotFound />
      </Route>
    </Switch>
  )
}

export function TvApp() {
  const registry = useMemo<BackRegistry>(() => ({ current: null }), [])
  const [location, navigate] = useLocation()
  const nav = useTvNav()
  // with the left rail, the screens' inset is the rail's (kit.tsx), and Left at any screen's edge
  // focuses it; the player keeps the whole screen. The server's mark moves into the rail, so the
  // screens rise by the head it took (from 7cqw to the safe area's 3.2cqw): --tv-head
  const rail = nav === 'rail' && !location.startsWith('/play/')
  const inset = rail
    ? ({ '--tv-safe-x': `${railInset}cqw`, '--tv-head': '3.8cqw' } as CSSProperties)
    : undefined
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [shift, setShift] = useState(0)
  // where focus was in the page, for Right out of the rail
  const last = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement
      if (!el.closest('[data-group="rail"]')) last.current = el
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [])
  const host = useMemo<RailHost>(
    () => ({
      slot,
      // whole pixels: a fractional shift leaves a hairline at the page's edge
      push: (px) => setShift(Math.round(px)),
      leave: (fallback) => {
        const back = last.current?.isConnected
          ? last.current
          : document.querySelector<HTMLElement>(
              `[data-platform="tv"] [data-group="${CSS.escape(fallback)}"] [data-focusable]`,
            )
        back?.focus({ preventScroll: true })
      },
    }),
    [slot],
  )
  return (
    <BackContext.Provider value={registry}>
      <TvRoot
        onBack={() => {
          if (registry.current) registry.current()
          else if (location !== '/') navigate('/')
          else {
            const root = document.querySelector('[data-platform="tv"]')
            const top = root?.querySelector<HTMLElement>('[data-rows] [data-focusable]')
            // with the bar that scrolls away, Back from the top of Home goes on up to the bar, as
            // Menu does on tvOS (HIG, Tab bars); with the rail, on to the rail
            const bar = root?.querySelector<HTMLElement>(
              `[data-group="${nav === 'rail' ? 'rail' : 'nav'}"] [aria-current="page"]`,
            )
            const atTop =
              document.activeElement === top ||
              !!document.activeElement?.closest('[data-group="hero"]')
            if ((nav === 'scroll' || nav === 'rail') && atTop && bar) bar.focus()
            // at the home root, Back returns focus to the top row's first item (tv.md#remote-keys)
            else top?.focus()
          }
        }}
      >
        <ApplyDevicePrefs platform="tv" />
        <RailContext.Provider value={host}>
          {/* the page, which moves right while the rail is open; --tv-shift lets a full-screen
          backdrop reach back over the strip it leaves (kit.tsx's backdropReach) */}
          <div
            className="absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={
              {
                ...inset,
                '--tv-shift': `${shift}px`,
                transform: shift ? `translateX(${shift}px)` : undefined,
              } as CSSProperties
            }
            data-go-left={rail ? 'rail' : undefined}
          >
            <Screens />
          </div>
          <div ref={setSlot} className="contents" />
        </RailContext.Provider>
      </TvRoot>
    </BackContext.Provider>
  )
}
