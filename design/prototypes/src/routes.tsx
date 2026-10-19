// SPDX-License-Identifier: AGPL-3.0-only
// The top-level routes, one tree per platform. Paths mirror the products: `#/admin/movies/1`
// is the server's `/movies/[id]`; clients live under `#/web`, `#/mobile` and `#/tv`.
import { Redirect, Route, Switch } from 'wouter'
import { AdminApp } from './admin/admin-app.tsx'
import { MobileApp } from './mobile/mobile-app.tsx'
import { TvApp } from './tv/tv-app.tsx'
import { WebApp } from './web/web-app.tsx'

/** Every route the routes test renders, per platform. Grows with each checkpoint. */
export const screenRoutes: Record<'admin' | 'web' | 'mobile' | 'tv', string[]> = {
  admin: [
    '/admin',
    '/admin/login',
    '/admin/setup',
    '/admin/discover',
    '/admin/movies',
    '/admin/movies/1',
    '/admin/movies/nowhere',
    '/admin/movies/107',
    '/admin/people/fritz-lang',
    '/admin/people/nobody',
    '/admin/activity',
    '/admin/downloads',
    '/admin/indexers',
    '/admin/subtitles',
    '/admin/nowhere',
  ],
  web: [
    '/web',
    '/web/home/b',
    '/web/connect',
    '/web/library',
    '/web/movies/4',
    '/web/movies/107',
    '/web/play/4',
    '/web/search',
  ],
  mobile: ['/mobile', '/mobile/connect', '/mobile/library', '/mobile/movies/4', '/mobile/play/4'],
  tv: ['/tv', '/tv/connect', '/tv/library', '/tv/movies/4', '/tv/play/4'],
}

export function Routes() {
  return (
    <Switch>
      <Route path="/admin" nest>
        <AdminApp />
      </Route>
      <Route path="/web" nest>
        <WebApp />
      </Route>
      <Route path="/mobile" nest>
        <MobileApp />
      </Route>
      <Route path="/tv" nest>
        <TvApp />
      </Route>
      <Route>
        <Redirect to="/admin" replace />
      </Route>
    </Switch>
  )
}
