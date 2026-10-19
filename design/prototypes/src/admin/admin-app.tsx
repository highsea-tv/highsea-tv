// SPDX-License-Identifier: AGPL-3.0-only
// The server admin (A1–A18). Sign-in and first-run setup stand alone; everything else sits in the
// shell. Pages a later checkpoint builds show a placeholder in the real page frame, so the shell
// can be walked end to end.
import { Button, EmptyState } from '@highsea/ui-web'
import type { ReactNode } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { Activity } from './activity/activity.tsx'
import { Dashboard } from './dashboard/dashboard.tsx'
import { Discover } from './discover/discover.tsx'
import { Downloads } from './downloads/downloads.tsx'
import { Indexers } from './indexers/indexers.tsx'
import { Login } from './login.tsx'
import { MovieDetail } from './movies/detail.tsx'
import { MoviesLibrary } from './movies/library.tsx'
import { isStaff, type Page, pageGroups } from './nav.ts'
import { Setup } from './setup/setup.tsx'
import { AdminPage, AdminShell, useShell } from './shell.tsx'
import { Subtitles } from './subtitles/subtitles.tsx'

/** Owners and admins only: anyone else sees why, and the way back. */
function Staff({ page, children }: { page: Page; children: ReactNode }) {
  const { role } = useShell()
  const [, navigate] = useLocation()
  if (page.staff && !isStaff(role))
    return (
      <AdminPage title={page.label}>
        <EmptyState
          icon="lock"
          title={`Only owners and admins can open ${page.label}`}
          action={<Button onClick={() => navigate('/')}>Go to the dashboard</Button>}
        >
          Ask the server’s owner if you need access.
        </EmptyState>
      </AdminPage>
    )
  return <>{children}</>
}

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
  activity: Activity,
  downloads: Downloads,
  indexers: Indexers,
  subtitles: Subtitles,
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
            {pages.map((p) => {
              const Page = built[p.id]
              return (
                <Route key={p.id} path={p.path}>
                  <Staff page={p}>{Page ? <Page /> : <Placeholder page={p} />}</Staff>
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
