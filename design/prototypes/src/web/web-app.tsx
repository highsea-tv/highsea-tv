// SPDX-License-Identifier: AGPL-3.0-only
// The web/desktop client (C1–C8): connect, home, library, item detail, the player,
// search, settings, the profile and downloads. The device's own theme and sound apply over all.
import { Button, EmptyState } from '@highsea-tv/ui-web'
import { Route, Switch, useLocation } from 'wouter'
import { ConnectFlow } from '../client/connect-flow.tsx'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { WebCollection } from './collection.tsx'
import { WebCollections } from './collections.tsx'
import { WebDetail } from './detail.tsx'
import { WebHome } from './home.tsx'
import { WebLibrary } from './library.tsx'
import { WebPlayer } from './player.tsx'
import { WebSearch } from './search.tsx'
import { WebDownloads, WebProfile, WebSettings } from './settings.tsx'
import { WebShell, webHref } from './shell.tsx'
import { WindowFrame } from './window.tsx'

function Connect() {
  const [, navigate] = useLocation()
  return <ConnectFlow onSignedIn={() => navigate('/')} />
}

export function WebApp() {
  const [location] = useLocation()
  return (
    <>
      <ApplyDevicePrefs platform="web" />
      {/* the desktop app's window chrome; the player draws its own, over the film */}
      {!location.startsWith('/play/') && <WindowFrame />}
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
        <WebPlayer fromStart />
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
          <main className="grid min-h-[70vh] place-items-center px-4">
            <EmptyState
              icon="search"
              title="There’s nothing at this address"
              action={
                <Button variant="primary" asChild>
                  <a href={webHref('/')}>Go home</a>
                </Button>
              }
            >
              It may have moved. Search finds every title on Harbor.
            </EmptyState>
          </main>
        </WebShell>
      </Route>
    </Switch>
  )
}
