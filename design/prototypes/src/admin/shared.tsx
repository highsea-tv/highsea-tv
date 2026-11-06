// SPDX-License-Identifier: AGPL-3.0-only
// The admin's shared screens in the prototype (one-client-platform-d.md › D1 and D2): the same
// `@highsea-tv/admin` code the server's admin draws, here on the SDK over `@highsea-tv/mock`'s
// transport, answering from the screen's own mock so the toolbar's data, role and clock apply.
// The prototype's frame keeps its chrome; inside it, the page is the admin's. D1 moved the shell and
// System › Status; D2 the dashboard, the library and the work; D3 Settings, System and the flows,
// so every admin address is drawn here, an unknown one by the admin's not-found page.

import { Activity, type ActivityTab } from '@highsea-tv/admin/activity.tsx'
import { Appearance } from '@highsea-tv/admin/appearance.tsx'
import { BackupsSettings } from '@highsea-tv/admin/backups.tsx'
import { CollectionPage } from '@highsea-tv/admin/collection.tsx'
import { Collections } from '@highsea-tv/admin/collections.tsx'
import { CollectionEditor } from '@highsea-tv/admin/collections-editor.tsx'
import { Connections } from '@highsea-tv/admin/connections.tsx'
import { Curation } from '@highsea-tv/admin/curation.tsx'
import { AnnouncementEditor } from '@highsea-tv/admin/curation-announcement.tsx'
import { PreviewFrame } from '@highsea-tv/admin/curation-frame.tsx'
import { SectionEditor } from '@highsea-tv/admin/curation-section.tsx'
import { Dashboard } from '@highsea-tv/admin/dashboard.tsx'
import { Discover } from '@highsea-tv/admin/discover.tsx'
import { DiscoverShows } from '@highsea-tv/admin/discover-shows.tsx'
import { DownloadClient } from '@highsea-tv/admin/download-client.tsx'
import { Downloads } from '@highsea-tv/admin/downloads.tsx'
import { General } from '@highsea-tv/admin/general.tsx'
import { ManualImport } from '@highsea-tv/admin/import.tsx'
import { Indexers, type IndexersTab } from '@highsea-tv/admin/indexers.tsx'
import { MoviesLibrary } from '@highsea-tv/admin/library.tsx'
import { LibraryImport } from '@highsea-tv/admin/library-import.tsx'
import { ImportLists } from '@highsea-tv/admin/lists.tsx'
import { Login } from '@highsea-tv/admin/login.tsx'
import { MediaManagement } from '@highsea-tv/admin/media-management.tsx'
import { Migration } from '@highsea-tv/admin/migration.tsx'
import { MovieDetail, type MovieTab } from '@highsea-tv/admin/movie-detail.tsx'
import { NavigationProvider } from '@highsea-tv/admin/navigation.tsx'
import { Network } from '@highsea-tv/admin/network.tsx'
import { AdminNotFound } from '@highsea-tv/admin/not-found.tsx'
import { NowPlayingPage, type NowPlayingTab } from '@highsea-tv/admin/now-playing.tsx'
import { PersonPage } from '@highsea-tv/admin/person.tsx'
import { PlaybackSettingsPage } from '@highsea-tv/admin/playback.tsx'
import { Profiles, QualitySizes } from '@highsea-tv/admin/profiles.tsx'
import { FormatEditor, ProfileEditor, SizeEditor } from '@highsea-tv/admin/quality-editors.tsx'
import { Security } from '@highsea-tv/admin/security.tsx'
import { SettingsIndex } from '@highsea-tv/admin/settings.tsx'
import { type AreaId, seesArea } from '@highsea-tv/admin/settings-areas.ts'
import { Setup } from '@highsea-tv/admin/setup.tsx'
import { AdminShell, useShell } from '@highsea-tv/admin/shell.tsx'
import { ShowDetail } from '@highsea-tv/admin/show-detail.tsx'
import { ShowsLibrary } from '@highsea-tv/admin/shows-library.tsx'
import { Subtitles, type SubtitlesTab } from '@highsea-tv/admin/subtitles.tsx'
import { System, type SystemTab } from '@highsea-tv/admin/system.tsx'
import { Users } from '@highsea-tv/admin/users.tsx'
import { Vpn } from '@highsea-tv/admin/vpn.tsx'
import { Wanted, type WantedTab } from '@highsea-tv/admin/wanted.tsx'
import { userFor } from '@highsea-tv/mock/mock'
import { browserStorage, createMockFetch, type MockTransport } from '@highsea-tv/mock/transport'
import { createClient, type HighseaClient } from '@highsea-tv/sdk'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { ThemeProvider } from '@highsea-tv/ui/native'
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Redirect, Route, Switch, useLocation, useSearch } from 'wouter'
import { useLatency, useMock, useProto } from '../screen/screen.tsx'

/** The seed's people by id (packages/mock/src/seed.ts), for signing in as the toolbar's role. */
const USERNAMES: Record<string, string> = { 'u-ines': 'ines', 'u-theo': 'theo', 'u-ruth': 'ruth' }

/**
 * Signs the page's browser in as the toolbar's role, as someone would at `/login`: the mock takes
 * any password, and the owner's second factor any six digits but zeros (packages/mock/src/server.ts).
 */
async function signIn(client: HighseaClient, username: string) {
  const r = await client.auth.signIn({ body: { username, password: 'prototype' } })
  if (r.status === 'two-factor')
    await client.auth.twoFactor({ body: { challenge: r.challenge, code: '123456' } })
}

function Host({
  children,
  shell = true,
  signIn: signsIn = true,
}: {
  children: ReactNode
  shell?: boolean
  /** Signs in as the toolbar's role first; sign-in and setup (D3) are drawn signed out. */
  signIn?: boolean
}) {
  const mock = useMock()
  const state = useProto()
  const [location, navigate] = useLocation()
  const search = useSearch()
  // one transport per mock, made with the toolbar's state it opened on; its changes follow below
  const initial = useRef(state).current
  const latency = useLatency()
  const transport: MockTransport = useMemo(
    () =>
      createMockFetch({
        mock,
        storage: browserStorage,
        origin: window.location.origin,
        state: initial,
        latency,
      }),
    [mock, initial, latency],
  )
  const client = useMemo(() => createClient({ fetch: transport }), [transport])

  // the session for the toolbar's role, made before the shell asks for anything
  const [ready, setReady] = useState<string | null>(null)
  const want = USERNAMES[userFor(state.role)] ?? 'theo'
  // the toolbar's latest state, applied once the session is made
  const latest = useRef(state)
  latest.current = state
  // never disposed: it lives as long as the page's mock, and Strict Mode's second effect pass
  // (https://react.dev/reference/react/StrictMode) would dispose the one useMemo keeps
  useEffect(() => {
    if (ready === want) transport.setState(state)
  }, [transport, state, ready, want])
  useEffect(() => {
    let live = true
    if (!signsIn) {
      transport.setState(latest.current)
      setReady(want)
      return
    }
    // signing in is the prototype's, not the screen's: the toolbar's loading and error states
    // apply to what the shell asks for, so the session is made with the server answering
    transport.setState({ ...latest.current, data: 'populated' })
    client.auth
      .session()
      .then(
        (s) => (s.user.username === want ? null : signIn(client, want)),
        () => signIn(client, want),
      )
      .catch(() => {})
      .then(() => {
        if (!live) return
        // applied before the shell draws, so its first calls already see the toolbar's state
        transport.setState(latest.current)
        setReady(want)
      })
    return () => {
      live = false
    }
  }, [client, transport, want, signsIn])

  const navigation = useMemo(
    () => ({
      router: {
        push: (href: string) => navigate(href),
        replace: (href: string) => navigate(href, { replace: true }),
      },
      pathname: location,
      searchParams: new URLSearchParams(search),
      // a document the admin loads (the curation preview's frame) is this page on the admin's route
      href: (path: string) => `./index.html?screen&preview#/admin${path}`,
      // after signing in or setting up, the server loads the page afresh; here the router moves
      load: (path: string) => navigate(path),
    }),
    [location, search, navigate],
  )
  // a user is sent to the web app, as the server's admin layout and the prototype's shell send them
  const role = state.role
  // (sign-in and setup are drawn signed out, so no one is sent away from them)
  const away = role === 'user' && signsIn
  useEffect(() => {
    if (away) navigate('~/web', { replace: true })
  }, [away, navigate])
  // the screens' links are real addresses (`/movies/1`), as on the server; here they're the hash
  // router's, so a plain click moves the router instead of loading the address (a modified click,
  // or a link to another tab, is left to the browser)
  const follow = useCallback(
    (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return
      const a = (e.target as Element).closest?.('a[href]')
      const href = a?.getAttribute('href')
      if (!a || !href?.startsWith('/') || href.startsWith('//') || a.getAttribute('target')) return
      // a download (a backup, the logs, a crash report) is a file, which the browser asks for
      if (a.hasAttribute('download')) return
      e.preventDefault()
      // the web app is the prototype's own platform, beside the admin
      navigate(href.startsWith('/web') ? `~${href}` : href)
    },
    [navigate],
  )
  if (away || ready !== want) return null
  return (
    <ClientProvider client={client}>
      <NavigationProvider value={navigation}>
        <ThemeProvider>
          <div style={{ display: 'contents' }} onClickCapture={follow}>
            {/* a user never reaches the shell: drawn signed in, they're sent away above */}
            {shell && role !== 'user' ? <AdminShell role={role}>{children}</AdminShell> : children}
          </div>
        </ThemeProvider>
      </NavigationProvider>
    </ClientProvider>
  )
}

/** A Settings area the toolbar's role can't see is not found, as the server's page says (D3). */
function OwnerArea({ id, children }: { id: AreaId; children: ReactNode }) {
  const { role } = useShell()
  return seesArea(id, role) ? children : <AdminNotFound />
}

/** `/activity/import`: Manual import, or Library import with `?mode=library`. */
function ImportPage() {
  const query = new URLSearchParams(useSearch())
  return query.get('mode') === 'library' ? (
    <LibraryImport root={query.get('root') ?? ''} />
  ) : (
    <ManualImport initialPath={query.get('path') ?? undefined} />
  )
}

/** The admin's own screens at their addresses, in one shell (the server's `app/(admin)` routes). */
export function SharedAdmin() {
  return (
    <Host>
      <Switch>
        <Route path="/">
          <Dashboard />
        </Route>
        <Route path="/movies">
          <MoviesLibrary />
        </Route>
        <Route path="/movies/:id">{(p) => <MovieDetail id={p.id} />}</Route>
        <Route path="/movies/:id/:tab">
          {(p) => <MovieDetail id={p.id} tab={p.tab as MovieTab} />}
        </Route>
        <Route path="/discover">
          <Discover />
        </Route>
        <Route path="/discover/shows">
          <DiscoverShows />
        </Route>
        <Route path="/shows">
          <ShowsLibrary />
        </Route>
        <Route path="/shows/:id">{(p) => <ShowDetail id={p.id} />}</Route>
        <Route path="/shows/:id/files">{(p) => <ShowDetail id={p.id} tab="files" />}</Route>
        <Route path="/people/:id">{(p) => <PersonPage id={p.id} />}</Route>
        <Route path="/collections">
          <Collections />
        </Route>
        <Route path="/collections/:id">
          {(p) =>
            p.id === 'new' || p.id.startsWith('sc-') ? (
              <CollectionEditor id={p.id} />
            ) : (
              <CollectionPage id={p.id} />
            )
          }
        </Route>
        <Route path="/wanted">
          <Wanted tab="missing" />
        </Route>
        <Route path="/wanted/:tab">{(p) => <Wanted tab={p.tab as WantedTab} />}</Route>
        <Route path="/activity">
          <Activity />
        </Route>
        <Route path="/activity/import">
          <ImportPage />
        </Route>
        <Route path="/activity/:tab">{(p) => <Activity tab={p.tab as ActivityTab} />}</Route>
        <Route path="/downloads">
          <Downloads />
        </Route>
        <Route path="/now-playing">
          <NowPlayingPage />
        </Route>
        <Route path="/now-playing/:tab">
          {(p) => <NowPlayingPage tab={p.tab as NowPlayingTab} />}
        </Route>
        <Route path="/subtitles">
          <Subtitles />
        </Route>
        <Route path="/subtitles/:tab">{(p) => <Subtitles tab={p.tab as SubtitlesTab} />}</Route>
        <Route path="/indexers">
          <Indexers />
        </Route>
        <Route path="/indexers/:tab">{(p) => <Indexers tab={p.tab as IndexersTab} />}</Route>
        <Route path="/curation">
          <Curation tab="announcements" />
        </Route>
        <Route path="/curation/featured">
          <Curation tab="featured" />
        </Route>
        <Route path="/curation/announcements/:id">{(p) => <AnnouncementEditor id={p.id} />}</Route>
        <Route path="/curation/featured/:id">{(p) => <SectionEditor id={p.id} />}</Route>
        <Route path="/settings/connections">
          <Connections />
        </Route>
        <Route path="/settings/lists">
          <ImportLists />
        </Route>
        <Route path="/settings/migration">
          <Migration />
        </Route>
        <Route path="/settings/users">
          <Users />
        </Route>
        <Route path="/settings/network">
          <OwnerArea id="network">
            <Network />
          </OwnerArea>
        </Route>
        <Route path="/settings/security">
          <OwnerArea id="security">
            <Security />
          </OwnerArea>
        </Route>
        <Route path="/settings/vpn">
          <OwnerArea id="vpn">
            <Vpn />
          </OwnerArea>
        </Route>
        <Route path="/settings/media">
          <MediaManagement />
        </Route>
        <Route path="/settings/profiles">
          <Profiles />
        </Route>
        <Route path="/settings/profiles/formats/:id">{(p) => <FormatEditor id={p.id} />}</Route>
        <Route path="/settings/profiles/:id">{(p) => <ProfileEditor id={p.id} />}</Route>
        <Route path="/settings/quality">
          <QualitySizes />
        </Route>
        <Route path="/settings/quality/sizes">
          <SizeEditor />
        </Route>
        <Route path="/settings">
          <SettingsIndex />
        </Route>
        <Route path="/settings/general">
          <General />
        </Route>
        <Route path="/settings/appearance">
          <Appearance />
        </Route>
        <Route path="/settings/playback">
          <PlaybackSettingsPage />
        </Route>
        <Route path="/settings/downloads">
          <OwnerArea id="downloads">
            <DownloadClient />
          </OwnerArea>
        </Route>
        <Route path="/settings/backups">
          <OwnerArea id="backups">
            <BackupsSettings />
          </OwnerArea>
        </Route>
        {/* its settings live on the Subtitles page, as the server's /settings/subtitles redirects */}
        <Route path="/settings/subtitles">
          <Redirect to="/subtitles/providers" replace />
        </Route>
        <Route path="/system">
          <System tab="status" />
        </Route>
        <Route path="/system/:tab">{(p) => <System tab={p.tab as SystemTab} />}</Route>
        <Route>
          <AdminNotFound />
        </Route>
      </Switch>
    </Host>
  )
}

/** Sign-in (A18), outside the shell and signed out, as the server's `/login` (D3). */
export function SharedLogin() {
  return (
    <Host shell={false} signIn={false}>
      <Login />
    </Host>
  )
}

/** First-run setup (A2), outside the shell and signed out, as the server's `/setup` (D3). */
export function SharedSetup() {
  return (
    <Host shell={false} signIn={false}>
      <Setup />
    </Host>
  )
}

/** The curation preview's frame (A11), outside the shell so it takes the app's width. */
export function SharedPreviewFrame() {
  return (
    <Host shell={false}>
      <PreviewFrame />
    </Host>
  )
}
