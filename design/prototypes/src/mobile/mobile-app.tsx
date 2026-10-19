// SPDX-License-Identifier: AGPL-3.0-only
// The mobile client (C1–C8), drawn inside the phone's safe areas: connect, the five tabs (Home,
// Search, Library, Offline, You), item detail, the player, and settings under You.
import { EmptyState } from '@highsea/ui-web'
import { Route, Switch, useLocation } from 'wouter'
import { ConnectFlow } from '../client/connect-flow.tsx'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { MobileScreen } from '../kit/mobile/device.tsx'
import { MobileDetail } from './detail.tsx'
import { MobileHome } from './home.tsx'
import { MobileLibrary } from './library.tsx'
import { MobileOffline, MobileSearch, MobileSettingsScreen, MobileYou } from './more.tsx'
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
    <>
      <ApplyDevicePrefs platform="mobile" />
      <Routes />
    </>
  )
}

function Routes() {
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
      <Route path="/search">
        <MobileShell>
          <MobileSearch />
        </MobileShell>
      </Route>
      <Route path="/offline">
        <MobileShell>
          <MobileOffline />
        </MobileShell>
      </Route>
      <Route path="/you">
        <MobileShell>
          <MobileYou />
        </MobileShell>
      </Route>
      <Route path="/you/:section">
        <MobileShell>
          <MobileSettingsScreen />
        </MobileShell>
      </Route>
      <Route>
        <MobileShell>
          <div className="grid min-h-[60vh] place-items-center px-4">
            <EmptyState icon="search" title="There’s nothing here">
              It may have moved. The tabs below lead everywhere.
            </EmptyState>
          </div>
        </MobileShell>
      </Route>
    </Switch>
  )
}
