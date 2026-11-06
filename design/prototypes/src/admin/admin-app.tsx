// SPDX-License-Identifier: AGPL-3.0-only
// The server admin (A1–A18). Sign-in and first-run setup stand alone; everything else sits in the
// shell. Pages a later checkpoint builds show a placeholder in the real page frame, so the shell
// can be walked end to end.
import { Button, EmptyState } from '@highsea-tv/ui'
import type { ReactNode } from 'react'
import { Redirect, Route, Switch, useLocation } from 'wouter'
import { Discover, discoverKinds } from './discover/discover.tsx'
import { Login } from './login.tsx'
import { type Page, pageGroups } from './nav.ts'
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
import { isShared, SharedAdmin, SharedPreviewFrame } from './shared.tsx'
import { AdminPage, AdminShell } from './shell.tsx'
import { ShowDetail, showTabs } from './shows/detail.tsx'
import { ShowsLibrary } from './shows/library.tsx'
import { System, type SystemTab, systemTabs } from './system/system.tsx'

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

/**
 * The pages still drawn by this prototype's own copies, by id (Shows, Settings and System's other
 * tabs, until D3); the admin's own screens are the shared ones, and the rest show a placeholder.
 */
const built: Record<string, () => ReactNode> = {
  shows: ShowsLibrary,
  settings: SettingsIndex,
  system: () => <System />,
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
      {/* the curation preview's frame, outside the shell (the server's /curation-frame) */}
      <Route path="/curation-frame">
        <SharedPreviewFrame />
      </Route>
      <Route>
        <Own />
      </Route>
    </Switch>
  )
}

/**
 * The admin's own screens, shared with the server's (one-client-platform-d.md › D1 and D2), in
 * their own shell; the rest (Shows, Settings, System's other tabs) are this prototype's copies
 * until D3 moves them. A tab a shared page doesn't have lands on the not-found page here.
 */
function Own() {
  const [location] = useLocation()
  if (isShared(location)) return <SharedAdmin />
  return (
    <AdminShell>
      <Switch>
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
        <Route path="/shows/:id/:tab">{(p) => tabOr(showTabs, p.tab, () => <ShowDetail />)}</Route>
        <Route path="/system/:tab">
          {(p) =>
            tabOr(
              systemTabs.map((t) => t.id),
              p.tab,
              (t: SystemTab) => <System tab={t} />,
            )
          }
        </Route>
        <Route path="/settings/profiles/formats/:id">{(p) => <FormatEditor id={p.id} />}</Route>
        <Route path="/settings/profiles/:id">{(p) => <ProfileEditor id={p.id} />}</Route>
        <Route path="/settings/quality/sizes">
          <SizeEditor />
        </Route>
        <Route path="/settings/:area">
          <SettingsArea pages={settingsAreas} />
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
  )
}
