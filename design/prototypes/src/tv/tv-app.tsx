// SPDX-License-Identifier: AGPL-3.0-only
// The TV client (C1–C7), in screen units with D-pad focus: sign-in, home, library, item detail,
// the player, search and settings. Back goes up a level: each screen says what that means (close
// a panel, hide the player's chrome), else Home.
import { useMemo, useState } from 'react'
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
import { GlobalNav, ServerIdentity, TvButton, TvMessage, tvHref } from './kit.tsx'
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
      <ServerIdentity />
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
  return (
    <BackContext.Provider value={registry}>
      <TvRoot
        onBack={() => {
          if (registry.current) registry.current()
          else if (location !== '/') navigate('/')
          // at the home root, Back returns focus to the top row's first item (tv.md#remote-keys)
          else
            document
              .querySelector<HTMLElement>('[data-platform="tv"] [data-rows] [data-focusable]')
              ?.focus()
        }}
      >
        <ApplyDevicePrefs platform="tv" />
        <Screens />
      </TvRoot>
    </BackContext.Provider>
  )
}
