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
    {
      ready: true,
      spec: 'docs/product/movies.md',
      hints: [
        'Search “nanook” for one to add; library movies show as In library.',
        'A poster opens the movie’s page, the same page in or out of the library.',
        'Leave Search now on: the movie downloads, imports and gets subtitles on the clock.',
      ],
    },
  ),
  admin(
    'A5',
    'Movies library',
    '/movies',
    2,
    'Grid and table views, filters, bulk edit, multiple versions per item.',
    {
      ready: true,
      spec: 'docs/product/movies.md',
      hints: [
        'Switch to Table, tick a few rows, then use the bulk bar.',
        'Sintel and Spring each have two versions, 1080p and 4K HDR.',
      ],
    },
  ),
  admin(
    'A6',
    'Movie detail',
    '/movies/1',
    2,
    'One page in or out of the library: cast and crew, trailers, collection, people. Once added: files and streams, history, interactive search, subtitles.',
    {
      ready: true,
      spec: 'docs/product/media-pages.md',
      hints: [
        'Not added yet: #/admin/movies/107 (Nanook of the North). Add it and the same page, at the same address, gains the library tabs.',
        'Night of the Living Dead (#/admin/movies/30) has a collection with two parts missing; Fritz Lang’s page marks his films by library state.',
        'Interactive search: open a Rejected badge for the reasons; Grab anyway overrides the profile.',
        'Subtitles tab: nudge the offset in 50 ms steps, or re-sync to the audio.',
      ],
    },
  ),
  admin(
    'A7',
    'Activity',
    '/activity',
    2,
    'The live queue (stalled, blocked, rejected), history and blocklist.',
    {
      ready: true,
      spec: 'docs/product/activity-downloads.md',
      hints: [
        'Needs attention holds the stalled Cosmos Laundromat and the blocked Nosferatu.',
        'Nosferatu: Find another blocklists it and grabs the next release.',
      ],
    },
  ),
  admin(
    'A8',
    'Downloads',
    '/downloads',
    2,
    'The torrent client: files, peers, trackers, seeding rules, limits and the VPN binding.',
    {
      ready: true,
      spec: 'docs/product/activity-downloads.md',
      hints: [
        'Open a torrent for its files, trackers and seeding rule.',
        'Add torrent takes a magnet:?xt=urn:btih: link.',
      ],
    },
  ),
  admin(
    'A9',
    'Indexers',
    '/indexers',
    2,
    'The catalog browser, one-click public add, private forms with inline help, health and backoff.',
    {
      ready: true,
      spec: 'docs/product/indexers.md',
      hints: [
        'Retry now clears the backoff on the indexer that’s backing off.',
        'Catalog: Add a public one in one click; Set up a private one, and use the API key “wrong” to see the test fail.',
      ],
    },
  ),
  admin(
    'A10',
    'Subtitles',
    '/subtitles',
    2,
    'The wanted list; providers, language profiles, scoring and sync settings.',
    {
      ready: true,
      spec: 'docs/product/subtitles.md',
      hints: [
        'Search all fills the wanted list.',
        'Languages: edit a profile to reorder languages and set the cutoff.',
      ],
    },
  ),
  admin(
    'A11',
    'Curation',
    '/curation',
    4,
    'Announcement and featured-section composers with a live preview on TV, web and mobile.',
    {
      ready: true,
      spec: 'docs/product/curation.md',
      hints: [
        'New announcement: the preview updates as you type. Switch TV, Web and Mobile above it.',
        'Audience → Roles, then Preview as Ruth: the preview says she isn’t in the audience.',
        'Featured sections: Edit Staff picks; the preview scrolls to it on every platform.',
      ],
    },
  ),
  admin(
    'A12',
    'Appearance',
    '/settings/appearance',
    4,
    'The theme editor, the server’s default theme and branding, sound settings.',
    {
      ready: true,
      spec: 'docs/product/appearance.md',
      hints: [
        'Rename the server and Save: the clients’ switcher and TV pick it up.',
        'New theme: drag Quiet text dark and watch the contrast audit catch it; Fix repairs it.',
      ],
    },
  ),
  admin(
    'A13',
    'Users and devices',
    '/settings/users',
    4,
    'Users, roles and permissions, library access, invites; devices with revoke; API keys.',
    {
      ready: true,
      spec: 'docs/product/users-devices.md',
      hints: [
        'Invite someone: the link shows once the invite exists.',
        'API keys → New API key: the secret shows once, then only its prefix.',
      ],
    },
  ),
  admin(
    'A14',
    'Wanted and calendar',
    '/wanted',
    4,
    'Missing and cutoff unmet; the calendar and its iCal link.',
    {
      fidelity: 'reference',
      ready: true,
      spec: 'docs/product/wanted.md',
      hints: ['Search all sends the missing movies to Activity.'],
    },
  ),
  admin(
    'A15',
    'Settings',
    '/settings',
    4,
    'One page per settings area, from media management to backups.',
    {
      fidelity: 'reference',
      ready: true,
      spec: 'docs/product/settings.md',
      hints: ['Change anything: a save bar appears. Media management previews file names live.'],
    },
  ),
  admin(
    'A16',
    'System',
    '/system',
    4,
    'Status, health, tasks, logs, events, backups, catalog version and updates.',
    {
      fidelity: 'reference',
      ready: true,
      spec: 'docs/product/system.md',
      hints: ['Tasks → Run now, then watch Events and Logs follow it.'],
    },
  ),
  admin(
    'A17',
    'Manual import',
    '/activity/import',
    4,
    'A file browser, matched items, the rename preview and import.',
    {
      fidelity: 'reference',
      ready: true,
      spec: 'docs/product/manual-import.md',
      hints: ['The home video matched nothing: choose a movie for it, or leave it.'],
    },
  ),
  client(
    'C1',
    'Connect to a server',
    '/connect',
    ['web', 'mobile', 'tv'],
    3,
    'LAN discovery, add by URL, sign in (by code on TV), the server switcher and failover.',
    {
      ready: true,
      spec: 'docs/product/connectivity.md',
      hints: [
        'Servers answer discovery over two seconds; type harbor.example.net to connect remotely.',
        'Sign in as ines with any password for the two-step code (any six digits but 000000).',
        'TV: wait eight seconds and the phone “approves” the code; or press OK on Use a password.',
        'Toolbar › Connection: Remote shows the failover; Unreachable shows what to do.',
      ],
    },
  ),
  client(
    'C2',
    'Home',
    '',
    ['web', 'mobile', 'tv'],
    3,
    'Featured sections and announcements. Two web options to choose between.',
    {
      ready: true,
      spec: 'docs/product/client-home.md',
      hints: [
        'Web: pick between A (full-bleed hero) and B (contained hero) with the Prototype switch.',
        'An announcement asks to be acknowledged first; Movie night is a dismissible banner or card.',
        'TV: Up from Play opens the global navigation.',
      ],
    },
  ),
  client(
    'C3',
    'Library browse',
    '/library',
    ['web', 'mobile', 'tv'],
    3,
    'The movies grid with sort and filter; alphabet jump on TV.',
    {
      ready: true,
      spec: 'docs/product/client-library.md',
      hints: ['TV: Left from the first column enters the alphabet rail.'],
    },
  ),
  client(
    'C4',
    'Item detail',
    '/movies/4',
    ['web', 'mobile', 'tv'],
    3,
    'Hero, play or resume, versions, cast, related, subtitle and audio defaults.',
    {
      ready: true,
      spec: 'docs/product/client-detail.md',
      hints: [
        'Tears of Steel is a third watched: Resume, or Play from the start. Picks are remembered.',
      ],
    },
  ),
  client(
    'C5',
    'Player chrome',
    '/play/4',
    ['web', 'mobile', 'tv'],
    3,
    'Scrubber, track and subtitle pickers, the subtitle offset nudge, the remote mapping.',
    {
      ready: true,
      spec: 'docs/product/player.md',
      hints: [
        'Turn English subtitles on, then nudge the timing in 50 ms steps and watch the preview.',
        'Web: Space, ← →, M and F. TV: OK, ← → on the scrubber, ↓ for tracks, Back.',
      ],
    },
  ),
  client(
    'C6',
    'Search',
    '/search',
    ['web', 'mobile', 'tv'],
    4,
    'Instant results; an on-screen keyboard on TV.',
    {
      fidelity: 'reference',
      ready: true,
      spec: 'docs/product/client-search.md',
      hints: ['Try “lang”: Fritz Lang’s films, and him under People.'],
    },
  ),
  client(
    'C7',
    'Settings',
    '/settings',
    ['web', 'mobile', 'tv'],
    4,
    'Themes, sounds, home layout, servers, devices, about.',
    {
      routes: { web: '/web/settings', mobile: '/mobile/you/appearance', tv: '/tv/settings' },
      ready: true,
      spec: 'docs/product/client-settings.md',
      hints: [
        'Pick a theme: only this device changes.',
        'Home screen: hide or move a row, then go Home on another platform. It follows you.',
      ],
    },
  ),
  client(
    'C8',
    'Profile and You',
    '/you',
    ['mobile', 'web'],
    4,
    'Account, servers, offline downloads, the way into settings.',
    {
      fidelity: 'reference',
      routes: { mobile: '/mobile/you', web: '/web/profile' },
      ready: true,
      spec: 'docs/product/client-settings.md',
    },
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
