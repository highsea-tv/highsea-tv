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
      checkpoint: 2,
    },
    {
      id: 'movies',
      label: 'Movies',
      icon: 'movie',
      path: '/movies',
      keywords: ['library'],
      checkpoint: 2,
    },
    {
      id: 'activity',
      label: 'Activity',
      icon: 'activity',
      path: '/activity',
      keywords: ['queue', 'history', 'blocklist'],
      checkpoint: 2,
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: 'downloads',
      path: '/downloads',
      staff: true,
      keywords: ['torrents', 'client', 'seeding'],
      checkpoint: 2,
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
      checkpoint: 2,
    },
    {
      id: 'subtitles',
      label: 'Subtitles',
      icon: 'subtitles',
      path: '/subtitles',
      staff: true,
      keywords: ['captions', 'sync'],
      checkpoint: 2,
    },
    {
      id: 'curation',
      label: 'Curation',
      icon: 'curation',
      path: '/curation',
      staff: true,
      keywords: ['announcements', 'featured'],
      checkpoint: 4,
    },
  ],
  [
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      path: '/settings',
      staff: true,
      keywords: ['preferences', 'appearance', 'users'],
      checkpoint: 4,
    },
    {
      id: 'system',
      label: 'System',
      icon: 'system',
      path: '/system',
      staff: true,
      keywords: ['logs', 'health', 'backups', 'tasks'],
      checkpoint: 4,
    },
  ],
]

export const isStaff = (role: UserRole | undefined) => role === 'owner' || role === 'admin'

/** The groups this role sees; empty groups drop out. */
export const pagesFor = (role: UserRole | undefined): Page[][] =>
  pageGroups.map((g) => g.filter((p) => !p.staff || isStaff(role))).filter((g) => g.length)

/** The page a location belongs to: `/movies/sintel` is under Movies. */
export function pageAt(location: string): Page | undefined {
  const all = pageGroups.flat()
  if (location === '/' || location === '') return all[0]
  return all.find(
    (p) => p.path !== '/' && (location === p.path || location.startsWith(`${p.path}/`)),
  )
}
