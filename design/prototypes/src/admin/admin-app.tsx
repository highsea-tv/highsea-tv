// SPDX-License-Identifier: AGPL-3.0-only
// The server admin (A1–A18). Sign-in and first-run setup stand alone; everything else sits in the
// shell. Pages a later checkpoint builds show a placeholder in the real page frame, so the shell
// can be walked end to end.
import { Button, EmptyState } from '@highsea/ui-web'
import type { ReactNode } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { Activity } from './activity/activity.tsx'
import { ManualImport } from './activity/import.tsx'
import { Collections } from './collections/collections.tsx'
import { CollectionEditor } from './collections/editor.tsx'
import { AnnouncementEditor } from './curation/announcement-editor.tsx'
import { Curation } from './curation/curation.tsx'
import { SectionEditor } from './curation/section-editor.tsx'
import { Dashboard } from './dashboard/dashboard.tsx'
import { Discover } from './discover/discover.tsx'
import { Downloads } from './downloads/downloads.tsx'
import { Indexers } from './indexers/indexers.tsx'
import { Login } from './login.tsx'
import { PersonPage } from './media/person.tsx'
import { MovieDetail } from './movies/detail.tsx'
import { MoviesLibrary } from './movies/library.tsx'
import { type Page, pageGroups } from './nav.ts'
import { Appearance } from './settings/appearance.tsx'
import { FormatEditor, ProfileEditor, SizeEditor } from './settings/editors.tsx'
import {
  Backups,
  Connections,
  DownloadClient,
  General,
  ImportLists,
  MediaManagement,
  Network,
  Profiles,
  QualitySizes,
  Security,
} from './settings/reference.tsx'
import { SettingsArea, SettingsIndex } from './settings/settings.tsx'
import { UsersDevices } from './settings/users.tsx'
import { Vpn } from './settings/vpn.tsx'
import { Setup } from './setup/setup.tsx'
import { AdminPage, AdminShell } from './shell.tsx'
import { Subtitles } from './subtitles/subtitles.tsx'
import { System, type SystemTab } from './system/system.tsx'
import { Wanted, type WantedTab } from './wanted/wanted.tsx'

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
      <EmptyState
        icon="search"
        title="There’s nothing at this address"
        action={<Button onClick={() => navigate('/')}>Go to the dashboard</Button>}
      >
        It may have moved. The search above finds pages, movies and actions.
      </EmptyState>
    </AdminPage>
  )
}

/** The pages built so far, by id; the rest show a placeholder. */
const built: Record<string, () => ReactNode> = {
  discover: Discover,
  movies: MoviesLibrary,
  collections: Collections,
  activity: Activity,
  downloads: Downloads,
  indexers: Indexers,
  subtitles: Subtitles,
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
  downloads: DownloadClient,
  connections: Connections,
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
      <Route>
        <AdminShell>
          <Switch>
            <Route path="/">
              <Dashboard />
            </Route>
            <Route path="/movies/:id">
              <MovieDetail />
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
            <Route path="/wanted/:tab">{(p) => <Wanted tab={p.tab as WantedTab} />}</Route>
            <Route path="/system/:tab">{(p) => <System tab={p.tab as SystemTab} />}</Route>
            <Route path="/activity/import">
              <ManualImport />
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
