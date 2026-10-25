// SPDX-License-Identifier: AGPL-3.0-only
// The admin's pages, in the sidebar's groups (admin.md#sidebar). Paths mirror the server's routes.
// Only the owner and admins open the admin (ADR 0032), so every page is theirs.
import type { IconName } from '@highsea-tv/ui-web'

export type Page = {
  id: string
  label: string
  icon: IconName
  /** Relative to `#/admin`. */
  path: string
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
      id: 'collections',
      label: 'Collections',
      icon: 'library',
      path: '/collections',
      keywords: ['smart collections', 'rules', 'lists', 'picks'],
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
      id: 'now-playing',
      label: 'Now playing',
      icon: 'play',
      path: '/now-playing',
      keywords: ['sessions', 'streams', 'watching', 'transcodes', 'stop'],
    },
    {
      id: 'downloads',
      label: 'Downloads',
      icon: 'downloads',
      path: '/downloads',
      keywords: ['torrents', 'client', 'seeding'],
    },
  ],
  [
    {
      id: 'indexers',
      label: 'Indexers',
      icon: 'indexer',
      path: '/indexers',
      keywords: ['trackers', 'catalog'],
    },
    {
      id: 'subtitles',
      label: 'Subtitles',
      icon: 'subtitles',
      path: '/subtitles',
      keywords: ['captions', 'sync'],
    },
    {
      id: 'curation',
      label: 'Curation',
      icon: 'curation',
      path: '/curation',
      keywords: ['announcements', 'featured', 'hero', 'home screen'],
    },
  ],
  [
    {
      id: 'settings',
      label: 'Settings',
      icon: 'settings',
      path: '/settings',
      keywords: ['preferences', 'appearance', 'users', 'devices', 'themes', 'api keys', 'security'],
    },
    {
      id: 'system',
      label: 'System',
      icon: 'system',
      path: '/system',
      keywords: ['logs', 'health', 'backups', 'tasks', 'events', 'updates', 'restore'],
    },
  ],
]

/** The page a location belongs to: `/movies/1` is under Movies. */
export function pageAt(location: string): Page | undefined {
  const all = pageGroups.flat()
  if (location === '/' || location === '') return all[0]
  return all.find(
    (p) => p.path !== '/' && (location === p.path || location.startsWith(`${p.path}/`)),
  )
}
