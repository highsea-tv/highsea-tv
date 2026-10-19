// SPDX-License-Identifier: AGPL-3.0-only
// The web/desktop client (C1–C8). Checkpoint 3 builds connect, home (two options), library, item
// detail and the player; Search, Downloads and Settings come at checkpoint 4.
import { Route, Switch, useLocation } from 'wouter'
import { ConnectFlow } from '../client/connect-flow.tsx'
import { NotBuilt } from '../kit/not-built.tsx'
import { WebDetail } from './detail.tsx'
import { savedOption, WebHome } from './home.tsx'
import { WebLibrary } from './library.tsx'
import { WebPlayer } from './player.tsx'
import { WebShell } from './shell.tsx'

function Connect() {
  const [, navigate] = useLocation()
  return <ConnectFlow onSignedIn={() => navigate('/')} />
}

export function WebApp() {
  return (
    <Switch>
      <Route path="/connect">
        <Connect />
      </Route>
      <Route path="/play/:id/start">
        <WebPlayer fromStart />
      </Route>
      <Route path="/play/:id">
        <WebPlayer />
      </Route>
      <Route path="/">
        <WebShell overHero={savedOption() === 'a'}>
          <WebHome option={savedOption()} />
        </WebShell>
      </Route>
      <Route path="/home/a">
        <WebShell overHero>
          <WebHome option="a" />
        </WebShell>
      </Route>
      <Route path="/home/b">
        <WebShell>
          <WebHome option="b" />
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
      <Route>
        <WebShell>
          <NotBuilt what="This page of the web client" checkpoint={4} className="min-h-[70vh]" />
        </WebShell>
      </Route>
    </Switch>
  )
}
