// SPDX-License-Identifier: AGPL-3.0-only
// The TV client (C1–C7), in screen units with D-pad focus: sign-in, home, library, item detail,
// the player, search and settings. Back goes up a level: each screen says what that means (close
// a panel, hide the player's chrome), else Home.
import { useLayoutEffect, useMemo, useState } from 'react'
import { Route, Switch, useLocation, useSearch } from 'wouter'
import { useConnection, useServer } from '../client/data.ts'
import { SeedMusic } from '../client/music-player.ts'
import { ApplyDevicePrefs } from '../client/prefs.tsx'
import { TvRoot } from '../kit/tv/tv-root.tsx'
import { useProto } from '../screen/screen.tsx'
import { TvAlbum } from './album.tsx'
import { TvAlerts } from './alerts.tsx'
import { TvArtist } from './artist.tsx'
import { BackContext, type BackRegistry, useBack } from './back.ts'
import { TvCollection } from './collection.tsx'
import { TvCollections } from './collections.tsx'
import { TvConnect } from './connect.tsx'
import { TvDetail } from './detail.tsx'
import { TvHome } from './home.tsx'
import { ServerIdentity, TvButton, TvHead, TvMessage, tvHref } from './kit.tsx'
import { TvLibrary } from './library.tsx'
import { TvMusic } from './music.tsx'
import { TvNowPlaying, useMusicKeys } from './now-playing.tsx'
import { TvPerson } from './person.tsx'
import { TvPlayer } from './player.tsx'
import { TvSearch } from './search.tsx'
import { TvProfile } from './settings.tsx'
import { TvShow } from './show.tsx'
import { TvShows } from './shows.tsx'
import { TvLaunch, TvNewProfile, TvWho } from './who.tsx'

function Detail() {
  const [panel, setPanel] = useState(false)
  useBack(() => (panel ? setPanel(false) : history.back()))
  return <TvDetail panel={panel} onPanel={setPanel} />
}

function Collection() {
  useBack(() => history.back())
  return <TvCollection />
}

function Person() {
  useBack(() => history.back())
  return <TvPerson />
}

function Album() {
  useBack(() => history.back())
  return <TvAlbum />
}

function Show() {
  useBack(() => history.back())
  return <TvShow />
}

function Artist() {
  useBack(() => history.back())
  return <TvArtist />
}

function NowPlaying() {
  useBack(() => history.back())
  return <TvNowPlaying />
}

function Unreachable() {
  const server = useServer()
  const name = server.data?.name ?? 'Harbor'
  return (
    <>
      <ServerIdentity className="absolute top-(--tv-safe-y) left-(--tv-safe-x)" />
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
      <TvHead down="message" className="absolute inset-x-0 top-0 z-10 px-(--tv-safe-x)" />
      <div data-group="message" data-go-up="nav" data-not-found="" className="h-full">
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

/**
 * Whether the TV has opened yet in this page. It opens on who's watching (the owner, 2026-10-30):
 * the first time the prototype loads the TV at Home, it goes to `/start` instead, as the app does
 * when it launches. `?launch=done` opens Home itself, for the sweeps (the tests call `skipLaunch`), and so does the
 * admin's curation preview (`?preview`), which shows Home as a profile sees it.
 */
let launched = false

/** For the tests: the TV has opened already, so `/tv` is Home. */
export const skipLaunch = () => {
  launched = true
}

function Screens() {
  const connection = useConnection()
  const [location, navigate] = useLocation()
  const search = useSearch()
  const { preview } = useProto()
  useMusicKeys()
  // in an effect, so React's second render in development doesn't see the flag already set
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the TV first opens
  useLayoutEffect(() => {
    if (launched) return
    launched = true
    if (location === '/' && !preview && !new URLSearchParams(search).has('launch'))
      navigate('/start', { replace: true })
  }, [])
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
      <Route path="/collections">
        <TvCollections />
      </Route>
      <Route path="/movies">
        <TvLibrary />
      </Route>
      <Route path="/shows/:id/episodes/:episode">
        <Show />
      </Route>
      <Route path="/shows/:id">
        <Show />
      </Route>
      <Route path="/shows">
        <TvShows />
      </Route>
      <Route path="/now-playing">
        <NowPlaying />
      </Route>
      <Route path="/music/albums/:id">
        <Album />
      </Route>
      <Route path="/music/artists/:id">
        <Artist />
      </Route>
      <Route path="/music">
        <TvMusic />
      </Route>
      <Route path="/movies/:id">
        <Detail />
      </Route>
      <Route path="/people/:id">
        <Person />
      </Route>
      <Route path="/collections/:id">
        <Collection />
      </Route>
      <Route path="/search">
        <TvSearch />
      </Route>
      {/* Settings is on the profile (the owner, 2026-10-30); its old address opens it too */}
      {/* who's watching, a profile's PIN, and adding a profile (the owner, 2026-10-30) */}
      {/* where the TV opens (the owner, 2026-10-30): who's watching, or straight in */}
      <Route path="/start">
        <TvLaunch />
      </Route>
      <Route path="/who/new">
        <TvNewProfile />
      </Route>
      <Route path="/who">
        <TvWho />
      </Route>
      <Route path="/who/:id">
        <TvWho />
      </Route>
      <Route path="/alerts">
        <TvAlerts />
      </Route>
      <Route path="/profile">
        <TvProfile />
      </Route>
      <Route path="/settings">
        <TvProfile />
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
          else {
            const root = document.querySelector('[data-platform="tv"]')
            const top = root?.querySelector<HTMLElement>('[data-rows] [data-focusable]')
            // Back from the top of Home goes on up to the head, as Menu does on tvOS (HIG, Tab
            // bars)
            const bar = root?.querySelector<HTMLElement>('[data-group="nav"] [aria-current="page"]')
            const atTop =
              document.activeElement === top ||
              !!document.activeElement?.closest('[data-group="hero"]')
            if (atTop && bar) bar.focus()
            // at the home root, Back returns focus to the top row's first item (tv.md#remote-keys)
            else top?.focus()
          }
        }}
      >
        <ApplyDevicePrefs platform="tv" />
        <SeedMusic />
        <Screens />
      </TvRoot>
    </BackContext.Provider>
  )
}
