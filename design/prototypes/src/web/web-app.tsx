// SPDX-License-Identifier: AGPL-3.0-only
// The web/desktop client (C2–C8): home, library, item detail, the player, search
// and downloads; connect, sign-in, settings, Connect a device and the profile are apps/client's (chrome/client.ts). The device's own theme and sound apply over all.

import { Button, EmptyState } from '@highsea-tv/ui'
import { Route, Switch, useLocation } from 'wouter'
import { useServerName } from '../client/data.ts'
import { SeedMusic } from '../client/music-player.ts'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { WhoPage } from '../client/who.tsx'
import { WebAlbum } from './album.tsx'
import { WebArtist } from './artist.tsx'
import { WebMusic } from './music.tsx'
import { WebPlayer } from './player.tsx'
import { WebPlaylist } from './playlist.tsx'
import { WebShell, webHref } from './shell.tsx'
import { WebShow } from './show.tsx'
import { WebShows } from './shows.tsx'
import { WindowFrame } from './window.tsx'

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
      <Route path="/who">
        <WhoPage />
      </Route>
      <Route path="/play/:id/start">
        <WebPlayer fromStart />
      </Route>
      <Route path="/play/:id">
        <WebPlayer />
      </Route>
      {/* the TV's destinations (the owner, 2026-10-30): Collections, Movies, Shows and Music */}
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
