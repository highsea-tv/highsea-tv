// SPDX-License-Identifier: AGPL-3.0-only
// The top-level routes, one tree per platform. Paths mirror the products: `#/admin/movies/1`
// is the server's `/movies/[id]`; clients live under `#/web`, `#/mobile` and `#/tv`.
import { Redirect, Route, Switch } from 'wouter'
import { AdminApp } from './admin/admin-app.tsx'
import { MobileApp } from './mobile/mobile-app.tsx'
import { TvApp } from './tv/tv-app.tsx'
import { WebApp } from './web/web-app.tsx'

/**
 * Every route the routes test renders, per platform. Grows with each checkpoint. A route may carry
 * the toolbar's state after `?` (`/web/downloads?app=desktop`), for the states a URL can open.
 */
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
    '/admin/collections',
    '/admin/collections/new',
    '/admin/collections/sc-2010s',
    '/admin/collections/sc-staff',
    '/admin/collections/nowhere',
    '/admin/people/fritz-lang',
    '/admin/people/nobody',
    '/admin/activity',
    '/admin/now-playing',
    '/admin/downloads',
    '/admin/indexers',
    '/admin/subtitles',
    '/admin/curation',
    '/admin/curation/featured',
    '/admin/curation/announcements/new',
    '/admin/curation/announcements/an-movie-night',
    '/admin/curation/featured/fs-staff',
    '/admin/curation/featured/new',
    '/admin/wanted',
    '/admin/wanted/cutoff',
    '/admin/wanted/calendar',
    '/admin/activity/import',
    '/admin/settings',
    '/admin/settings/general',
    '/admin/settings/appearance',
    '/admin/settings/network',
    '/admin/settings/security',
    '/admin/settings/backups',
    '/admin/settings/users',
    '/admin/settings/media',
    '/admin/settings/profiles',
    '/admin/settings/profiles/qp-hd',
    '/admin/settings/profiles/new',
    '/admin/settings/profiles/formats/cf-dv',
    '/admin/settings/profiles/formats/new',
    '/admin/settings/quality',
    '/admin/settings/quality/sizes',
    '/admin/settings/lists',
    '/admin/settings/downloads',
    '/admin/settings/connections',
    '/admin/settings/playback',
    '/admin/settings/nowhere',
    '/admin/system',
    '/admin/system/health',
    '/admin/system/tasks',
    '/admin/system/logs',
    '/admin/system/events',
    '/admin/system/backups',
    '/admin/system/updates',
    '/admin/nowhere',
  ],
  web: [
    '/web',
    '/web/connect',
    '/web/library',
    '/web/movies/4',
    '/web/movies/107',
    '/web/play/4',
    '/web/search',
    '/web/collections/caminandes',
    '/web/library/collections',
    '/web/collections/sc-2010s',
    '/web/settings',
    '/web/settings/home',
    '/web/settings/devices',
    '/web/profile',
    '/web/downloads',
    '/web/downloads?app=desktop',
    '/web/movies/4?app=desktop',
    '/web/movies/107?app=desktop&os=windows',
    '/web/library?app=desktop&os=linux',
    '/web/play/4?app=desktop&os=windows',
    '/web/play/4?app=desktop&os=mac',
    '/web/downloads?app=desktop&os=windows',
    '/web/settings/about',
    '/web/settings/about?app=desktop&update=ready',
    '/web/connect?app=desktop&lan=asking',
    '/web/connect?app=desktop&lan=refused',
    '/web/play/4?stream=failed',
    '/web/play/4?stream=next-up',
    '/web/nowhere',
  ],
  mobile: [
    '/mobile',
    '/mobile/connect',
    '/mobile/library',
    '/mobile/movies/4',
    '/mobile/play/4',
    '/mobile/play/4?stream=stopped',
    '/mobile/search',
    '/mobile/collections/caminandes',
    '/mobile/library/collections',
    '/mobile/collections/sc-2010s',
    '/mobile/offline',
    '/mobile/you',
    '/mobile/you/appearance',
    '/mobile/you/home',
    '/mobile/you/servers',
  ],
  tv: [
    '/tv',
    '/tv/connect',
    '/tv/library',
    '/tv/movies/4',
    '/tv/play/4',
    '/tv/play/4?stream=failed',
    '/tv/play/4?stream=next-up',
    '/tv/search',
    '/tv/collections/caminandes',
    '/tv/library/collections',
    '/tv/collections/sc-2010s',
    '/tv/settings',
  ],
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
