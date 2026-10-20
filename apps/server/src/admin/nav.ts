// SPDX-License-Identifier: AGPL-3.0-only
// The admin's pages, in the sidebar's groups (admin.md#sidebar), as the prototype has them.
import type { IconName } from '@highsea/ui-web'
import type { shell } from './messages.ts'

/** A label from the catalog's `nav.` messages, which take no values. */
type NavLabel = Extract<keyof typeof shell, `nav.${string}`>

export type Page = { id: string; label: NavLabel; icon: IconName; path: string }

export const pageGroups: Page[][] = [
  [
    { id: 'dashboard', label: 'nav.dashboard', icon: 'dashboard', path: '/' },
    { id: 'discover', label: 'nav.discover', icon: 'discover', path: '/discover' },
    { id: 'movies', label: 'nav.movies', icon: 'movie', path: '/movies' },
    { id: 'wanted', label: 'nav.wanted', icon: 'calendar', path: '/wanted' },
    { id: 'activity', label: 'nav.activity', icon: 'activity', path: '/activity' },
    { id: 'downloads', label: 'nav.downloads', icon: 'downloads', path: '/downloads' },
  ],
  [
    { id: 'indexers', label: 'nav.indexers', icon: 'indexer', path: '/indexers' },
    { id: 'subtitles', label: 'nav.subtitles', icon: 'subtitles', path: '/subtitles' },
    { id: 'curation', label: 'nav.curation', icon: 'curation', path: '/curation' },
  ],
  [
    { id: 'settings', label: 'nav.settings', icon: 'settings', path: '/settings' },
    { id: 'system', label: 'nav.system', icon: 'system', path: '/system' },
  ],
]

/** The page a path belongs to: `/movies/1` is under Movies. */
export function pageAt(path: string): Page | undefined {
  const all = pageGroups.flat()
  if (path === '/' || path === '') return all[0]
  return all.find((p) => p.path !== '/' && (path === p.path || path.startsWith(`${p.path}/`)))
}
