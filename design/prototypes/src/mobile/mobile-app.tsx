// SPDX-License-Identifier: AGPL-3.0-only
// The mobile client (C1–C8), drawn inside the phone's safe areas. Checkpoint 3 builds connect,
// home, library, item detail and the player; Search, Offline and You come at checkpoint 4.
import { Route, Switch, useLocation } from 'wouter'
import { ConnectFlow } from '../client/connect-flow.tsx'
import { MobileScreen } from '../kit/mobile/device.tsx'
import { NotBuilt } from '../kit/not-built.tsx'
import { MobileDetail } from './detail.tsx'
import { MobileHome } from './home.tsx'
import { MobileLibrary } from './library.tsx'
import { MobilePlayer } from './player.tsx'
import { MobileShell } from './shell.tsx'

function Connect() {
  const [, navigate] = useLocation()
  return (
    <MobileScreen>
      <ConnectFlow onSignedIn={() => navigate('/')} className="min-h-full bg-transparent" />
    </MobileScreen>
  )
}

export function MobileApp() {
  return (
    <Switch>
      <Route path="/connect">
        <Connect />
      </Route>
      <Route path="/play/:id/start">
        <MobilePlayer fromStart />
      </Route>
      <Route path="/play/:id">
        <MobilePlayer />
      </Route>
      <Route path="/">
        <MobileShell>
          <MobileHome />
        </MobileShell>
      </Route>
      <Route path="/library">
        <MobileShell>
          <MobileLibrary />
        </MobileShell>
      </Route>
      <Route path="/movies/:id">
        <MobileShell>
          <MobileDetail />
        </MobileShell>
      </Route>
      <Route>
        <MobileShell>
          <NotBuilt
            what="This tab of the mobile app"
            checkpoint={4}
            className="min-h-[60vh] bg-transparent"
          />
        </MobileShell>
      </Route>
    </Switch>
  )
}
