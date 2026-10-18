// SPDX-License-Identifier: AGPL-3.0-only
// The server admin (A1–A18). Sign-in and first-run setup stand alone; everything else sits in the
// shell. Pages a later checkpoint builds show a placeholder in the real page frame, so the shell
// can be walked end to end.
import { Button, EmptyState } from '@highsea/ui-web'
import { Route, Switch, useLocation, useParams } from 'wouter'
import { useQuery } from '../mock/hooks.tsx'
import { Dashboard } from './dashboard/dashboard.tsx'
import { Login } from './login.tsx'
import { isStaff, type Page, pageGroups } from './nav.ts'
import { Setup } from './setup/setup.tsx'
import { AdminPage, AdminShell, useShell } from './shell.tsx'

/** A page that isn't built yet, or one the signed-in role can't open. */
function Placeholder({ page }: { page: Page }) {
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
  return (
    <AdminPage title={page.label}>
      <EmptyState icon={page.icon} title="Not in the prototype yet">
        Checkpoint {page.checkpoint} builds {page.label}.
      </EmptyState>
    </AdminPage>
  )
}

function MovieDetail() {
  const { id } = useParams<{ id: string }>()
  const movie = useQuery(`movie:${id}`, (c) => c.movies.get(id))
  return (
    <AdminPage title={movie.data?.title ?? 'Movie'}>
      <EmptyState icon="movie" title="Not in the prototype yet">
        Checkpoint 2 builds the movie page.
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

const placeholders = pageGroups.flat().filter((p) => p.path !== '/')

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
            {placeholders.map((p) => (
              <Route key={p.id} path={p.path}>
                <Placeholder page={p} />
              </Route>
            ))}
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </AdminShell>
      </Route>
    </Switch>
  )
}
