// SPDX-License-Identifier: AGPL-3.0-only
// The server admin (A1–A18). Sign-in and first-run setup stand alone; everything else sits in the
// shell. Pages a later checkpoint builds show a placeholder in the real page frame, so the shell
// can be walked end to end.
import { Button, EmptyState } from '@highsea-tv/ui'
import type { ReactNode } from 'react'
import { Redirect, Route, Switch, useLocation } from 'wouter'
import { Activity, type ActivityTab, activityTabs } from './activity/activity.tsx'
import { ManualImport } from './activity/import.tsx'
import { Collections } from './collections/collections.tsx'
import { CollectionEditor } from './collections/editor.tsx'
import { AnnouncementEditor } from './curation/announcement-editor.tsx'
import { Curation } from './curation/curation.tsx'
import { SectionEditor } from './curation/section-editor.tsx'
import { Dashboard } from './dashboard/dashboard.tsx'
import { Discover, discoverKinds } from './discover/discover.tsx'
import { Downloads } from './downloads/downloads.tsx'
import { Indexers, type IndexersTab, indexerTabs } from './indexers/indexers.tsx'
import { Login } from './login.tsx'
import { PersonPage } from './media/person.tsx'
import { MovieDetail, movieTabs } from './movies/detail.tsx'
import { MoviesLibrary } from './movies/library.tsx'
import { type Page, pageGroups } from './nav.ts'
import { NowPlaying, type NowPlayingTab, nowPlayingTabs } from './now-playing/now-playing.tsx'
import { Appearance } from './settings/appearance.tsx'
import { Connections } from './settings/connections.tsx'
import { FormatEditor, ProfileEditor, SizeEditor } from './settings/editors.tsx'
import { General } from './settings/general.tsx'
import { ImportLists } from './settings/lists.tsx'
import { MediaManagement } from './settings/media-management.tsx'
import { Migration } from './settings/migration.tsx'
import { Playback } from './settings/playback.tsx'
import {
  Backups,
  DownloadClient,
  Network,
  Profiles,
  QualitySizes,
  Security,
} from './settings/reference.tsx'
import { SettingsArea, SettingsIndex } from './settings/settings.tsx'
import { UsersDevices } from './settings/users.tsx'
import { Vpn } from './settings/vpn.tsx'
import { Setup } from './setup/setup.tsx'
import { SharedSystemStatus } from './shared.tsx'
import { AdminPage, AdminShell } from './shell.tsx'
import { ShowDetail, showTabs } from './shows/detail.tsx'
import { ShowsLibrary } from './shows/library.tsx'
import { Subtitles, type SubtitlesTab, subtitleTabs } from './subtitles/subtitles.tsx'
import { System, type SystemTab, systemTabs } from './system/system.tsx'
import { Wanted, type WantedTab, wantedTabs } from './wanted/wanted.tsx'

/** A page a later checkpoint builds. */
function Placeholder({ page }: { page: Page }) {
  return (
    <AdminPage title={page.label}>
      <EmptyState icon={page.icon} title="Not in the prototype yet">
        Checkpoint {page.checkpoint} builds {page.label}.
      </EmptyState>
    </AdminPage>
  )
}

function NotFound() {
  const [, navigate] = useLocation()
  return (
    <AdminPage title="Page not found">
      <div data-not-found="" className="contents">
        <EmptyState
          icon="search"
          title="There’s nothing at this address"
          action={<Button onClick={() => navigate('/')}>Go to the dashboard</Button>}
        >
          It may have moved. The search above finds pages, movies and actions.
        </EmptyState>
      </div>
    </AdminPage>
  )
}

/**
 * A page's tab from its address (`/wanted/{tab}`), or the not-found page for one it hasn't: an
 * address that names no tab draws nothing else.
 */
function tabOr<T extends string>(tabs: readonly string[], tab: string, page: (t: T) => ReactNode) {
  return tabs.includes(tab) ? page(tab as T) : <NotFound />
}

/** The pages built so far, by id; the rest show a placeholder. */
const built: Record<string, () => ReactNode> = {
  discover: () => <Discover />,
  movies: MoviesLibrary,
  shows: ShowsLibrary,
  collections: Collections,
  activity: () => <Activity />,
  'now-playing': () => <NowPlaying />,
  downloads: Downloads,
  indexers: () => <Indexers />,
  subtitles: () => <Subtitles />,
  curation: () => <Curation />,
  settings: SettingsIndex,
  system: () => <System />,
  wanted: () => <Wanted />,
}

/** `/settings/{area}`: A12 and A13 are core; the rest are reference pages (A15). */
const settingsAreas: Record<string, () => ReactNode> = {
  general: General,
  appearance: Appearance,
  network: Network,
  security: Security,
  backups: Backups,
  users: UsersDevices,
  media: MediaManagement,
  profiles: Profiles,
  quality: QualitySizes,
  lists: ImportLists,
  vpn: Vpn,
  playback: Playback,
  downloads: DownloadClient,
  connections: Connections,
  migration: Migration,
  // its settings live on the Subtitles page; an address typed by hand lands on them
  subtitles: () => <Redirect to="/subtitles/providers" replace />,
}

const pages = pageGroups.flat().filter((p) => p.path !== '/')

export function AdminApp() {
  return (
    <Switch>
      <Route path="/login">
        <Login />
      </Route>
      <Route path="/setup">
        <Setup />
      </Route>
      {/* the admin's own screens, shared with the server's (one-client-platform-d.md › D1), in
          their own shell; the rest are this prototype's copies until their batch moves them */}
      <Route path="/system">
        <SharedSystemStatus />
      </Route>
      <Route path="/system/status">
        <SharedSystemStatus />
      </Route>
      <Route>
        <AdminShell>
          <Switch>
            <Route path="/">
              <Dashboard />
            </Route>
            <Route path="/movies/:id">
              <MovieDetail />
            </Route>
            <Route path="/movies/:id/:tab">
              {(p) => tabOr(movieTabs, p.tab, () => <MovieDetail />)}
            </Route>
            <Route path="/discover/:kind">
              {(p) =>
                tabOr(
                  discoverKinds.filter((k) => k !== 'movies'),
                  p.kind,
                  (k: 'shows') => <Discover kind={k} />,
                )
              }
            </Route>
            <Route path="/shows/:id">
              <ShowDetail />
            </Route>
            <Route path="/shows/:id/:tab">
              {(p) => tabOr(showTabs, p.tab, () => <ShowDetail />)}
            </Route>
            <Route path="/people/:id">
              <PersonPage />
            </Route>
            <Route path="/collections/:id">
              <CollectionEditor />
            </Route>
            <Route path="/curation/featured">
              <Curation tab="featured" />
            </Route>
            <Route path="/curation/featured/:id">
              <SectionEditor />
            </Route>
            <Route path="/wanted/:tab">
              {(p) => tabOr(wantedTabs, p.tab, (t: WantedTab) => <Wanted tab={t} />)}
            </Route>
            <Route path="/system/:tab">
              {(p) =>
                tabOr(
                  systemTabs.map((t) => t.id),
                  p.tab,
                  (t: SystemTab) => <System tab={t} />,
                )
              }
            </Route>
            <Route path="/activity/import">
              <ManualImport />
            </Route>
            <Route path="/activity/:tab">
              {(p) => tabOr(activityTabs, p.tab, (t: ActivityTab) => <Activity tab={t} />)}
            </Route>
            <Route path="/now-playing/:tab">
              {(p) => tabOr(nowPlayingTabs, p.tab, (t: NowPlayingTab) => <NowPlaying tab={t} />)}
            </Route>
            <Route path="/indexers/:tab">
              {(p) => tabOr(indexerTabs, p.tab, (t: IndexersTab) => <Indexers tab={t} />)}
            </Route>
            <Route path="/subtitles/:tab">
              {(p) => tabOr(subtitleTabs, p.tab, (t: SubtitlesTab) => <Subtitles tab={t} />)}
            </Route>
            <Route path="/settings/profiles/formats/:id">{(p) => <FormatEditor id={p.id} />}</Route>
            <Route path="/settings/profiles/:id">{(p) => <ProfileEditor id={p.id} />}</Route>
            <Route path="/settings/quality/sizes">
              <SizeEditor />
            </Route>
            <Route path="/settings/:area">
              <SettingsArea pages={settingsAreas} />
            </Route>
            <Route path="/curation/announcements/:id">
              <AnnouncementEditor />
            </Route>
            {pages.map((p) => {
              const Page = built[p.id]
              return (
                <Route key={p.id} path={p.path}>
                  {Page ? <Page /> : <Placeholder page={p} />}
                </Route>
              )
            })}
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </AdminShell>
      </Route>
    </Switch>
  )
}
