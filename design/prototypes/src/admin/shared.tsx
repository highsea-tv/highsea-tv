// SPDX-License-Identifier: AGPL-3.0-only
// The admin's shared screens in the prototype (one-client-platform-d.md › D1 and D2): the same
// `@highsea-tv/admin` code the server's admin draws, here on the SDK over `@highsea-tv/mock`'s
// transport, answering from the screen's own mock so the toolbar's data, role and clock apply.
// The prototype's frame keeps its chrome; inside it, the page is the admin's. D1 moved the shell and
// System › Status; D2 the dashboard, the library and the work (`SHARED` below lists the addresses).

import { Activity, type ActivityTab } from '@highsea-tv/admin/activity.tsx'
import { CollectionPage } from '@highsea-tv/admin/collection.tsx'
import { Collections } from '@highsea-tv/admin/collections.tsx'
import { CollectionEditor } from '@highsea-tv/admin/collections-editor.tsx'
import { Curation } from '@highsea-tv/admin/curation.tsx'
import { AnnouncementEditor } from '@highsea-tv/admin/curation-announcement.tsx'
import { PreviewFrame } from '@highsea-tv/admin/curation-frame.tsx'
import { SectionEditor } from '@highsea-tv/admin/curation-section.tsx'
import { Dashboard } from '@highsea-tv/admin/dashboard.tsx'
import { Discover } from '@highsea-tv/admin/discover.tsx'
import { Downloads } from '@highsea-tv/admin/downloads.tsx'
import { ManualImport } from '@highsea-tv/admin/import.tsx'
import { Indexers, type IndexersTab } from '@highsea-tv/admin/indexers.tsx'
import { MoviesLibrary } from '@highsea-tv/admin/library.tsx'
import { LibraryImport } from '@highsea-tv/admin/library-import.tsx'
import { MovieDetail, type MovieTab } from '@highsea-tv/admin/movie-detail.tsx'
import { NavigationProvider } from '@highsea-tv/admin/navigation.tsx'
import { NowPlayingPage, type NowPlayingTab } from '@highsea-tv/admin/now-playing.tsx'
import { PersonPage } from '@highsea-tv/admin/person.tsx'
import { AdminShell } from '@highsea-tv/admin/shell.tsx'
import { Subtitles, type SubtitlesTab } from '@highsea-tv/admin/subtitles.tsx'
import { System } from '@highsea-tv/admin/system.tsx'
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
import { Route, Switch, useLocation, useSearch } from 'wouter'
import { useMock, useProto } from '../screen/screen.tsx'

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

function Host({ children, shell = true }: { children: ReactNode; shell?: boolean }) {
  const mock = useMock()
  const state = useProto()
  const [location, navigate] = useLocation()
  const search = useSearch()
  // one transport per mock, made with the toolbar's state it opened on; its changes follow below
  const initial = useRef(state).current
  const transport: MockTransport = useMemo(
    () =>
      createMockFetch({
        mock,
        storage: browserStorage,
        origin: window.location.origin,
        state: initial,
      }),
    [mock, initial],
  )
  // never disposed: it lives as long as the page's mock, and Strict Mode's second effect pass
  // (https://react.dev/reference/react/StrictMode) would dispose the one useMemo keeps
  useEffect(() => transport.setState(state), [transport, state])
  const client = useMemo(() => createClient({ fetch: transport }), [transport])

  // the session for the toolbar's role, made before the shell asks for anything
  const [ready, setReady] = useState<string | null>(null)
  const want = USERNAMES[userFor(state.role)] ?? 'theo'
  useEffect(() => {
    let live = true
    client.auth
      .session()
      .then(
        (s) => (s.user.username === want ? null : signIn(client, want)),
        () => signIn(client, want),
      )
      // with the toolbar's error state the server doesn't answer: the shell shows it, as it would
      .catch(() => {})
      .then(() => live && setReady(want))
    return () => {
      live = false
    }
  }, [client, want])

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
    }),
    [location, search, navigate],
  )
  // a user is sent to the web app, as the server's admin layout and the prototype's shell send them
  const role = state.role
  useEffect(() => {
    if (role === 'user') navigate('~/web', { replace: true })
  }, [role, navigate])
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
      e.preventDefault()
      // the web app is the prototype's own platform, beside the admin
      navigate(href.startsWith('/web') ? `~${href}` : href)
    },
    [navigate],
  )
  if (role === 'user' || ready !== want) return null
  return (
    <ClientProvider client={client}>
      <NavigationProvider value={navigation}>
        <ThemeProvider>
          <div style={{ display: 'contents' }} onClickCapture={follow}>
            {shell ? <AdminShell role={role}>{children}</AdminShell> : children}
          </div>
        </ThemeProvider>
      </NavigationProvider>
    </ClientProvider>
  )
}

/**
 * The addresses whose page is the admin's own screen; the rest are still the prototype's copies
 * (D3's settings, setup and sign-in, and Shows). A tab an address doesn't have stays with the
 * prototype's not-found page.
 */
export const SHARED: RegExp[] = [
  /^\/$/,
  /^\/movies$/,
  /^\/movies\/[^/]+$/,
  /^\/movies\/[^/]+\/(cast|files|history|search|subtitles)$/,
  /^\/discover$/,
  /^\/people\/[^/]+$/,
  /^\/collections$/,
  /^\/collections\/[^/]+$/,
  /^\/wanted(\/(cutoff|calendar))?$/,
  /^\/activity(\/(history|blocklist|import))?$/,
  /^\/downloads$/,
  /^\/now-playing(\/history)?$/,
  /^\/subtitles(\/(providers|languages|scoring))?$/,
  /^\/indexers(\/catalog)?$/,
  /^\/curation(\/featured)?$/,
  /^\/curation\/(announcements|featured)\/[^/]+$/,
  /^\/system(\/status)?$/,
]

/** Whether an address inside the admin draws the admin's own screen. */
export const isShared = (path: string): boolean => SHARED.some((r) => r.test(path))

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
        <Route>
          <System tab="status" />
        </Route>
      </Switch>
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
