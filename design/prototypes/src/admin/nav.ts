// SPDX-License-Identifier: AGPL-3.0-only
// The admin's pages, in the sidebar's groups (admin.md#sidebar). Paths mirror the server's routes.
import type { IconName } from '@highsea/ui-web'
import type { UserRole } from '../mock/types.ts'

export type Page = {
  id: string
  label: string
  icon: IconName
  /** Relative to `#/admin`. */
  path: string
  /** Owners and admins only. Members manage the library, not the server. */
  staff?: boolean
  keywords?: string[]
  /** The checkpoint that builds it, while it's a placeholder. */
  checkpoint?: number
}

export const pageGroups: Page[][] = [
  [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/', keywords: ['home'] },
    {
      id: 'discover',
      label: 'Discover',
      icon: 'discover',
      path: '/discover',
      keywords: ['add', 'search', 'tmdb', 'trending'],
    },
    {
      id: 'movies',
      label: 'Movies',
      icon: 'movie',
      path: '/movies',
      keywords: ['library'],
    },
    {
      id: 'wanted',
      label: 'Wanted',
      icon: 'calendar',
      path: '/wanted',
      keywords: ['missing', 'cutoff', 'calendar', 'upcoming', 'ical'],
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: 'activity',
      path: '/activity',
      keywords: ['queue', 'history', 'blocklist', 'manual import'],
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: 'downloads',
      path: '/downloads',
      staff: true,
      keywords: ['torrents', 'client', 'seeding'],
    },
  ],
  [
    {
      id: 'indexers',
      label: 'Indexers',
      icon: 'indexer',
      path: '/indexers',
      staff: true,
      keywords: ['trackers', 'catalog'],
    },
    {
      id: 'subtitles',
      label: 'Subtitles',
      icon: 'subtitles',
      path: '/subtitles',
      staff: true,
      keywords: ['captions', 'sync'],
    },
    {
      id: 'curation',
      label: 'Curation',
      icon: 'curation',
      path: '/curation',
      staff: true,
      keywords: ['announcements', 'featured', 'hero', 'home screen'],
    },
  ],
  [
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      path: '/settings',
      staff: true,
      keywords: ['preferences', 'appearance', 'users', 'devices', 'themes', 'api keys', 'security'],
    },
    {
      id: 'system',
      label: 'System',
      icon: 'system',
      path: '/system',
      staff: true,
      keywords: ['logs', 'health', 'backups', 'tasks', 'events', 'updates', 'restore'],
    },
  ],
]

export const isStaff = (role: UserRole | undefined) => role === 'owner' || role === 'admin'

/** The groups this role sees; empty groups drop out. */
export const pagesFor = (role: UserRole | undefined): Page[][] =>
  pageGroups.map((g) => g.filter((p) => !p.staff || isStaff(role))).filter((g) => g.length)

/** The page a location belongs to: `/movies/1` is under Movies. */
export function pageAt(location: string): Page | undefined {
  const all = pageGroups.flat()
  if (location === '/' || location === '') return all[0]
  return all.find(
    (p) => p.path !== '/' && (location === p.path || location.startsWith(`${p.path}/`)),
  )
}
