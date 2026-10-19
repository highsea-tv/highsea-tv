// SPDX-License-Identifier: AGPL-3.0-only
// The TV client (C1–C7), in screen units with D-pad focus. Checkpoint 3 builds sign-in, home,
// library, item detail and the player; Search and Settings come at checkpoint 4. Back goes up a
// level: each screen says what that means (close a panel, hide the player's chrome), else Home.
import { useMemo, useState } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { useConnection, useServer } from '../client/data.ts'
import { TvRoot } from '../kit/tv/tv-root.tsx'
import { BackContext, type BackRegistry, useBack } from './back.ts'
import { TvConnect } from './connect.tsx'
import { TvDetail } from './detail.tsx'
import { TvHome } from './home.tsx'
import { GlobalNav, ServerIdentity, TvButton, TvMessage, tvHref } from './kit.tsx'
import { TvLibrary } from './library.tsx'
import { TvPlayer } from './player.tsx'

function Detail() {
  const [panel, setPanel] = useState(false)
  useBack(() => (panel ? setPanel(false) : history.back()))
  return <TvDetail panel={panel} onPanel={setPanel} />
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

function NotYet() {
  useBack(() => history.back())
  return (
    <>
      <ServerIdentity />
      <GlobalNav down="message" />
      <div data-group="message" data-go-up="nav" className="h-full">
        <TvMessage
          title="Not in the prototype yet"
          actions={
            <TvButton primary initial href={tvHref('/')}>
              Home
            </TvButton>
          }
        >
          Checkpoint 4 builds this screen.
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
      <Route path="/library">
        <TvLibrary />
      </Route>
      <Route path="/movies/:id">
        <Detail />
      </Route>
      <Route>
        <NotYet />
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
              .querySelector<HTMLElement>('[data-platform="tv"] [data-scroll="y"] [data-focusable]')
              ?.focus()
        }}
      >
        <Screens />
      </TvRoot>
    </BackContext.Provider>
  )
}
