// SPDX-License-Identifier: AGPL-3.0-only
// The web/desktop client (C1–C8): connect, home, library, item detail, the player,
// search, settings, the profile and downloads. The device's own theme and sound apply over all.

import { Button, EmptyState } from '@highsea-tv/ui'
import { Redirect, Route, Switch, useLocation } from 'wouter'
import { ConnectFlow } from '../client/connect-flow.tsx'
import { useServerName } from '../client/data.ts'
import { SeedMusic } from '../client/music-player.ts'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { WhoPage } from '../client/who.tsx'
import { WebAlbum } from './album.tsx'
import { WebArtist } from './artist.tsx'
import { WebCollection } from './collection.tsx'
import { WebCollections } from './collections.tsx'
import { WebDetail } from './detail.tsx'
import { WebHome } from './home.tsx'
import { WebLibrary } from './library.tsx'
import { WebLink, WebLinkConfirm } from './link.tsx'
import { WebMusic } from './music.tsx'
import { WebPerson } from './person.tsx'
import { WebPlayer } from './player.tsx'
import { WebPlaylist } from './playlist.tsx'
import { WebSearch } from './search.tsx'
import { WebDownloads, WebProfile, WebSettings } from './settings.tsx'
import { WebShell, webHref } from './shell.tsx'
import { WebShow } from './show.tsx'
import { WebShows } from './shows.tsx'
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
      <SeedMusic />
      {/* the desktop app's window chrome; the player draws its own, over the film */}
      {!location.startsWith('/play/') && <WindowFrame />}
      <Routes />
    </>
  )
}

function Routes() {
  const server = useServerName()
  return (
    <Switch>
      <Route path="/connect">
        <Connect />
      </Route>
      <Route path="/who">
        <WhoPage />
      </Route>
      <Route path="/play/:id/start">
        <WebPlayer fromStart />
      </Route>
      <Route path="/play/:id">
        <WebPlayer />
      </Route>
      <Route path="/">
        <WebShell overHero="bloom">
          <WebHome />
        </WebShell>
      </Route>
      {/* the TV's destinations (the owner, 2026-10-30): Collections, Movies, Shows and Music */}
      <Route path="/collections">
        <WebShell>
          <WebCollections />
        </WebShell>
      </Route>
      <Route path="/movies">
        <WebShell>
          <WebLibrary />
        </WebShell>
      </Route>
      <Route path="/shows/:id/episodes/:episode">
        <WebShell overHero>
          <WebShow />
        </WebShell>
      </Route>
      <Route path="/shows/:id">
        <WebShell overHero>
          <WebShow />
        </WebShell>
      </Route>
      <Route path="/shows">
        <WebShell>
          <WebShows />
        </WebShell>
      </Route>
      <Route path="/music/albums/:id">
        <WebShell overHero>
          <WebAlbum />
        </WebShell>
      </Route>
      <Route path="/music/artists/:id">
        <WebShell overHero>
          <WebArtist />
        </WebShell>
      </Route>
      <Route path="/music/playlists/:id">
        <WebShell overHero>
          <WebPlaylist />
        </WebShell>
      </Route>
      <Route path="/music/artists">
        <WebShell>
          <WebMusic view="artists" />
        </WebShell>
      </Route>
      <Route path="/music/songs">
        <WebShell>
          <WebMusic view="songs" />
        </WebShell>
      </Route>
      <Route path="/music/playlists">
        <WebShell>
          <WebMusic view="playlists" />
        </WebShell>
      </Route>
      <Route path="/music">
        <WebShell>
          <WebMusic view="albums" />
        </WebShell>
      </Route>
      {/* the library's old addresses */}
      <Route path="/library/collections">
        <Redirect to="/collections" replace />
      </Route>
      <Route path="/library">
        <Redirect to="/movies" replace />
      </Route>
      <Route path="/movies/:id">
        <WebShell overHero>
          <WebDetail />
        </WebShell>
      </Route>
      <Route path="/people/:id">
        <WebShell overHero>
          <WebPerson />
        </WebShell>
      </Route>
      <Route path="/collections/:id">
        <WebShell>
          <WebCollection />
        </WebShell>
      </Route>
      <Route path="/search/:q?">
        <WebShell>
          <WebSearch />
        </WebShell>
      </Route>
      <Route path="/settings/:section?">
        <WebShell>
          <WebSettings />
        </WebShell>
      </Route>
      <Route path="/link/:code">
        <WebShell>
          <WebLinkConfirm />
        </WebShell>
      </Route>
      <Route path="/link">
        <WebShell>
          <WebLink />
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
          <main data-not-found="" className="grid min-h-[70vh] place-items-center px-4">
            <EmptyState
              icon="search"
              title="There’s nothing at this address"
              action={
                <Button variant="primary" asChild>
                  <a href={webHref('/')}>Go home</a>
                </Button>
              }
            >
              It may have moved. Search finds every title on {server}.
            </EmptyState>
          </main>
        </WebShell>
      </Route>
    </Switch>
  )
}
