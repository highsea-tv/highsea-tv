// SPDX-License-Identifier: AGPL-3.0-only
// The mobile client (C2–C8), drawn inside the phone's safe areas: the five tabs (Home, Search,
// Library, Offline, You), item detail, the player, and signing in a TV (4.5a); connect, sign-in
// and settings are apps/client's (chrome/client.ts).

import { EmptyState } from '@highsea-tv/ui'
import { Redirect, Route, Switch } from 'wouter'
import { SeedMusic } from '../client/music-player.ts'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { MobileAlbum } from './album.tsx'
import { MobileArtist } from './artist.tsx'
import { MobileCollection } from './collection.tsx'
import { MobileCollections } from './collections.tsx'
import { MobileDetail } from './detail.tsx'
import { MobileHome } from './home.tsx'
import { MobileLibrary } from './library.tsx'
import { MobileOffline, MobileSearch, MobileYou } from './more.tsx'
import { MobileMusic } from './music.tsx'
import { MobileNowPlaying } from './now-playing.tsx'
import { MobileLinkConfirm, MobileLinkScan } from './pair.tsx'
import { MobilePerson } from './person.tsx'
import { MobilePlayer } from './player.tsx'
import { MobilePlaylist } from './playlist.tsx'
import { MobileShell } from './shell.tsx'
import { MobileShow } from './show.tsx'
import { MobileShows } from './shows.tsx'

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
      <Route path="/library/music/songs">
        <MobileShell>
          <MobileMusic view="songs" />
        </MobileShell>
      </Route>
      <Route path="/library/music/playlists">
        <MobileShell>
          <MobileMusic view="playlists" />
        </MobileShell>
      </Route>
      {/* Music's own addresses, as "Playing from" names them, are Library's views on the phone */}
      <Route path="/music/songs">
        <Redirect to="/library/music/songs" replace />
      </Route>
      <Route path="/music/playlists/:id">
        <MobileShell>
          <MobilePlaylist />
        </MobileShell>
      </Route>
      <Route path="/music/playlists">
        <Redirect to="/library/music/playlists" replace />
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
      <Route path="/shows/:id/episodes/:episode">
        <MobileShell>
          <MobileShow />
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
      <Route path="/you/who">
        <MobileShell>
          <MobileYou who />
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
