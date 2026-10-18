// SPDX-License-Identifier: AGPL-3.0-only
// Every flow in the Phase 2 plan (docs/plans/phase-2-prototypes.md › flows): where it lives, which
// platforms it covers and which checkpoint builds it. The launcher and the toolbar read this.
import type { Platform } from './proto/state.ts'

export type Flow = {
  id: string
  title: string
  area: 'admin' | 'client'
  platforms: Platform[]
  fidelity: 'core' | 'reference'
  description: string
  /** The route per platform. Admin routes mirror the server's (`/movies/[id]` → `#/admin/movies/…`). */
  routes: Partial<Record<Platform, string>>
  /** The written spec, under docs/product/. */
  spec: string | null
  checkpoint: 1 | 2 | 3 | 4
  /** Built and clickable. */
  ready: boolean
  /** How to reach the interesting states. Shown in the launcher and the toolbar. */
  hints?: string[]
}

const admin = (
  id: string,
  title: string,
  route: string,
  checkpoint: Flow['checkpoint'],
  description: string,
  o: Partial<Flow> = {},
): Flow => ({
  id,
  title,
  area: 'admin',
  platforms: ['admin'],
  fidelity: 'core',
  description,
  routes: { admin: `/admin${route}` },
  spec: null,
  checkpoint,
  ready: false,
  ...o,
})

const client = (
  id: string,
  title: string,
  route: string,
  platforms: Platform[],
  checkpoint: Flow['checkpoint'],
  description: string,
  o: Partial<Flow> = {},
): Flow => ({
  id,
  title,
  area: 'client',
  platforms,
  fidelity: 'core',
  description,
  routes: Object.fromEntries(platforms.map((p) => [p, `/${p}${route}`])),
  spec: null,
  checkpoint,
  ready: false,
  ...o,
})

export const flows: Flow[] = [
  admin(
    'A1',
    'Shell',
    '/',
    1,
    'Sidebar (full, rail, sheet), ⌘K palette, status bar, toasts and announcement banners.',
    {
      ready: true,
      spec: 'docs/product/admin-shell.md',
      hints: [
        'Press ⌘K (Ctrl K) for the palette: pages, actions and every title.',
        'Set Width to 768 for the icon rail, 390 for the menu sheet.',
        'Switch Server to Member to see what members don’t.',
      ],
    },
  ),
  admin(
    'A18',
    'Login',
    '/login',
    1,
    'Local sign-in, the two-factor step and the single sign-on button.',
    {
      ready: true,
      spec: 'docs/product/login.md',
      hints: [
        'Any username works. Password “wrong” shows the error; “locked” shows rate limiting.',
        'Ines has two-factor on: any 6 digits pass, 000000 fails.',
      ],
    },
  ),
  admin(
    'A2',
    'Setup wizard',
    '/setup',
    1,
    'Name, owner account, folders with the hardlink check, starter indexers, subtitles, remote access, cloud link.',
    {
      ready: true,
      spec: 'docs/product/setup.md',
      hints: [
        'Pick /mnt/nas/movies as the movies folder to see the different-disk warning.',
        'Progress is remembered across reloads; “Start over” in the header resets it.',
      ],
    },
  ),
  admin(
    'A3',
    'Dashboard',
    '/',
    1,
    'The default widgets and the queue, live; Customize mode with drag, resize, add and remove, by pointer or keyboard.',
    {
      ready: true,
      spec: 'docs/product/dashboard.md',
      hints: [
        'Customize, then drag a widget by its handle or its corner.',
        'Keyboard: focus a handle, press Space to grab, arrows to move, Shift+arrows to resize, Space to drop, Escape to cancel.',
        'Time 10× makes downloads finish, import and get subtitles.',
      ],
    },
  ),
  admin(
    'A4',
    'Discover → add movie',
    '/discover',
    2,
    'Search and trending, then the add dialog: folder, profiles, monitoring, search now.',
  ),
  admin(
    'A5',
    'Movies library',
    '/movies',
    2,
    'Grid and table views, filters, bulk edit, multiple versions per item.',
  ),
  admin(
    'A6',
    'Movie detail',
    '/movies/sintel',
    2,
    'Overview, files and streams, history, interactive search with decision reasons, and the Subtitles tab.',
  ),
  admin(
    'A7',
    'Activity',
    '/activity',
    2,
    'The live queue (stalled, blocked, rejected), history and blocklist.',
  ),
  admin(
    'A8',
    'Downloads',
    '/downloads',
    2,
    'The torrent client: files, peers, trackers, seeding rules, limits and the VPN binding.',
  ),
  admin(
    'A9',
    'Indexers',
    '/indexers',
    2,
    'The catalog browser, one-click public add, private forms with inline help, health and backoff.',
  ),
  admin(
    'A10',
    'Subtitles',
    '/subtitles',
    2,
    'The wanted list; providers, language profiles, scoring and sync settings.',
  ),
  admin(
    'A11',
    'Curation',
    '/curation',
    4,
    'Announcement and featured-section composers with a live preview on TV, web and mobile.',
  ),
  admin(
    'A12',
    'Appearance',
    '/settings/appearance',
    4,
    'The theme editor, the server’s default theme and branding, sound settings.',
  ),
  admin(
    'A13',
    'Users and devices',
    '/settings/users',
    4,
    'Users, roles and permissions, library access, invites; devices with revoke; API keys.',
  ),
  admin(
    'A14',
    'Wanted and calendar',
    '/wanted',
    4,
    'Missing and cutoff unmet; the calendar and its iCal link.',
    { fidelity: 'reference' },
  ),
  admin(
    'A15',
    'Settings',
    '/settings',
    4,
    'One page per settings area, from media management to backups.',
    { fidelity: 'reference' },
  ),
  admin(
    'A16',
    'System',
    '/system',
    4,
    'Status, health, tasks, logs, events, backups, catalog version and updates.',
    { fidelity: 'reference' },
  ),
  admin(
    'A17',
    'Manual import',
    '/activity/import',
    4,
    'A file browser, matched items, the rename preview and import.',
    { fidelity: 'reference' },
  ),
  client(
    'C1',
    'Connect to a server',
    '/connect',
    ['web', 'mobile', 'tv'],
    3,
    'LAN discovery, add by URL, sign in (by code on TV), the server switcher and failover.',
    {
      ready: false,
    },
  ),
  client(
    'C2',
    'Home',
    '',
    ['web', 'mobile', 'tv'],
    3,
    'Featured sections and announcements. Two web options to choose between.',
  ),
  client(
    'C3',
    'Library browse',
    '/library',
    ['web', 'mobile', 'tv'],
    3,
    'The movies grid with sort and filter; alphabet jump on TV.',
  ),
  client(
    'C4',
    'Item detail',
    '/movies/sintel',
    ['web', 'mobile', 'tv'],
    3,
    'Hero, play or resume, versions, cast, related, subtitle and audio defaults.',
  ),
  client(
    'C5',
    'Player chrome',
    '/play/sintel',
    ['web', 'mobile', 'tv'],
    3,
    'Scrubber, track and subtitle pickers, the subtitle offset nudge, the remote mapping.',
  ),
  client(
    'C6',
    'Search',
    '/search',
    ['web', 'mobile', 'tv'],
    4,
    'Instant results; an on-screen keyboard on TV.',
    { fidelity: 'reference' },
  ),
  client(
    'C7',
    'Settings',
    '/settings',
    ['web', 'mobile', 'tv'],
    4,
    'Themes, sounds, home layout, servers, devices, about.',
  ),
  client(
    'C8',
    'Profile and You',
    '/you',
    ['mobile', 'web'],
    4,
    'Account, servers, offline downloads, the way into settings.',
    { fidelity: 'reference' },
  ),
]

/** The flow a path belongs to: the longest route that prefixes it. */
export function flowFor(path: string): Flow | undefined {
  let best: Flow | undefined
  let length = -1
  for (const f of flows)
    for (const r of Object.values(f.routes)) {
      const route = r || '/'
      const match = route === path || path.startsWith(route.endsWith('/') ? route : `${route}/`)
      if (match && route.length > length && f.ready) {
        best = f
        length = route.length
      }
    }
  return best
}

/** Where a platform starts when you switch to it. */
export const platformHome: Record<Platform, string> = {
  admin: '/admin',
  web: '/web',
  mobile: '/mobile',
  tv: '/tv',
}
