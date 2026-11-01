// SPDX-License-Identifier: AGPL-3.0-only
// The mobile client (C1–C8), drawn inside the phone's safe areas: connect, the five tabs (Home,
// Search, Library, Offline, You), item detail, the player, settings under You, and signing in a
// TV (4.5a).

import { EmptyState } from '@highsea-tv/ui-web'
import { Route, Switch, useLocation } from 'wouter'
import { ConnectFlow } from '../client/connect-flow.tsx'
import { SeedMusic } from '../client/music-player.ts'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { MobileScreen } from '../kit/mobile/device.tsx'
import { MobileAlbum } from './album.tsx'
import { MobileArtist } from './artist.tsx'
import { MobileCollection } from './collection.tsx'
import { MobileCollections } from './collections.tsx'
import { MobileDetail } from './detail.tsx'
import { MobileHome } from './home.tsx'
import { MobileLibrary } from './library.tsx'
import { MobileOffline, MobileSearch, MobileSettingsScreen, MobileYou } from './more.tsx'
import { MobileMusic } from './music.tsx'
import { MobileNowPlaying } from './now-playing.tsx'
import { MobileLinkConfirm, MobileLinkScan } from './pair.tsx'
import { MobilePerson } from './person.tsx'
import { MobilePlayer } from './player.tsx'
import { MobileShell } from './shell.tsx'
import { MobileShow } from './show.tsx'
import { MobileShows } from './shows.tsx'

function Connect() {
  const [, navigate] = useLocation()
  return (
    <MobileScreen>
      <ConnectFlow
        platform="mobile"
        onSignedIn={() => navigate('/')}
        className="min-h-full bg-transparent"
      />
    </MobileScreen>
  )
}

export function MobileApp() {
  return (
    <>
      <ApplyDevicePrefs platform="mobile" />
      <SeedMusic />
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
      <Route path="/link">
        <MobileLinkScan />
      </Route>
      <Route path="/link/:code">
        <MobileLinkConfirm />
      </Route>
      <Route path="/now-playing">
        <MobileNowPlaying />
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
      <Route path="/library/music/artists">
        <MobileShell>
          <MobileMusic view="artists" />
        </MobileShell>
      </Route>
      <Route path="/library/music">
        <MobileShell>
          <MobileMusic view="albums" />
        </MobileShell>
      </Route>
      <Route path="/library/collections">
        <MobileShell>
          <MobileCollections />
        </MobileShell>
      </Route>
      <Route path="/library/shows">
        <MobileShell>
          <MobileShows />
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
      <Route path="/shows/:id">
        <MobileShell>
          <MobileShow />
        </MobileShell>
      </Route>
      <Route path="/music/albums/:id">
        <MobileShell>
          <MobileAlbum />
        </MobileShell>
      </Route>
      <Route path="/music/artists/:id">
        <MobileShell>
          <MobileArtist />
        </MobileShell>
      </Route>
      <Route path="/people/:id">
        <MobileShell>
          <MobilePerson />
        </MobileShell>
      </Route>
      <Route path="/collections/:id">
        <MobileShell>
          <MobileCollection />
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
          <div data-not-found="" className="grid min-h-[60vh] place-items-center px-4">
            <EmptyState icon="search" title="There’s nothing here">
              It may have moved. The tabs below lead everywhere.
            </EmptyState>
          </div>
        </MobileShell>
      </Route>
    </Switch>
  )
}
