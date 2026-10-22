// SPDX-License-Identifier: AGPL-3.0-only
// The admin's pages, in the sidebar's groups (admin.md#sidebar), as the prototype has them. Only the
// owner and admins open the admin (ADR 0032), so it has one shape.
import type { IconName } from '@highsea/ui-web'
import type { shell } from './messages.ts'

type Id =
  | 'dashboard'
  | 'discover'
  | 'movies'
  | 'collections'
  | 'wanted'
  | 'activity'
  | 'downloads'
  | 'indexers'
  | 'subtitles'
  | 'curation'
  | 'settings'
  | 'system'

export type Page = {
  id: Id
  label: `nav.${Id}` & keyof typeof shell
  keywords: `keywords.${Id}` & keyof typeof shell
  icon: IconName
  path: string
}

const page = (id: Id, icon: IconName, path: string): Page => ({
  id,
  label: `nav.${id}`,
  keywords: `keywords.${id}`,
  icon,
  path,
})

export const pageGroups: Page[][] = [
  [
    page('dashboard', 'dashboard', '/'),
    page('discover', 'discover', '/discover'),
    page('movies', 'movie', '/movies'),
    page('collections', 'library', '/collections'),
    page('wanted', 'calendar', '/wanted'),
    page('activity', 'activity', '/activity'),
    page('downloads', 'downloads', '/downloads'),
  ],
  [
    page('indexers', 'indexer', '/indexers'),
    page('subtitles', 'subtitles', '/subtitles'),
    page('curation', 'curation', '/curation'),
  ],
  [page('settings', 'settings', '/settings'), page('system', 'system', '/system')],
]

/** The people who open the admin. A user gets the refusal page instead (decision 9). */
export type Role = 'owner' | 'admin'

/** The page a path belongs to: `/movies/1` is under Movies. */
export function pageAt(path: string): Page | undefined {
  const all = pageGroups.flat()
  if (path === '/' || path === '') return all[0]
  return all.find((p) => p.path !== '/' && (path === p.path || path.startsWith(`${p.path}/`)))
}
