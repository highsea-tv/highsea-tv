// SPDX-License-Identifier: AGPL-3.0-only
// The admin's pages, in the sidebar's groups (admin.md#sidebar), as the prototype has them.
import type { IconName } from '@highsea/ui-web'
import type { shell } from './messages.ts'

type Id =
  | 'dashboard'
  | 'discover'
  | 'movies'
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
  /** Owners and admins only. Members manage the library, not the server. */
  staff?: boolean
}

const page = (id: Id, icon: IconName, path: string, staff?: boolean): Page => ({
  id,
  label: `nav.${id}`,
  keywords: `keywords.${id}`,
  icon,
  path,
  staff,
})

export const pageGroups: Page[][] = [
  [
    page('dashboard', 'dashboard', '/'),
    page('discover', 'discover', '/discover'),
    page('movies', 'movie', '/movies'),
    page('wanted', 'calendar', '/wanted'),
    page('activity', 'activity', '/activity'),
    page('downloads', 'downloads', '/downloads', true),
  ],
  [
    page('indexers', 'indexer', '/indexers', true),
    page('subtitles', 'subtitles', '/subtitles', true),
    page('curation', 'curation', '/curation', true),
  ],
  [page('settings', 'settings', '/settings', true), page('system', 'system', '/system', true)],
]

export type Role = 'owner' | 'admin' | 'member' | 'restricted'

export const isStaff = (role: Role | undefined) => role === 'owner' || role === 'admin'

/** The groups this role sees; empty groups drop out. */
export const pagesFor = (role: Role | undefined): Page[][] =>
  pageGroups.map((g) => g.filter((p) => !p.staff || isStaff(role))).filter((g) => g.length)

/** The page a path belongs to: `/movies/1` is under Movies. */
export function pageAt(path: string): Page | undefined {
  const all = pageGroups.flat()
  if (path === '/' || path === '') return all[0]
  return all.find((p) => p.path !== '/' && (path === p.path || path.startsWith(`${p.path}/`)))
}
