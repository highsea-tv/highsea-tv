// SPDX-License-Identifier: AGPL-3.0-only
// Settings' areas in their four groups (the prototype's settings.tsx). Plain data, so the
// `/settings/{area}` route can check an id on the server.
import type { IconName } from '@highsea/ui-web'

export type AreaId =
  | 'general'
  | 'appearance'
  | 'network'
  | 'security'
  | 'backups'
  | 'users'
  | 'media'
  | 'profiles'
  | 'quality'
  | 'lists'
  | 'downloads'
  | 'subtitles'
  | 'connections'

export type Area = {
  id: AreaId
  icon: IconName
  /** Areas with a page of their own elsewhere (Subtitles). */
  href?: string
}

export const areaGroups: { id: 'server' | 'people' | 'library' | 'downloads'; areas: Area[] }[] = [
  {
    id: 'server',
    areas: [
      { id: 'general', icon: 'settings' },
      { id: 'appearance', icon: 'curation' },
      { id: 'network', icon: 'network' },
      { id: 'security', icon: 'shield' },
      { id: 'backups', icon: 'storage' },
    ],
  },
  { id: 'people', areas: [{ id: 'users', icon: 'users' }] },
  {
    id: 'library',
    areas: [
      { id: 'media', icon: 'folder' },
      { id: 'profiles', icon: 'list' },
      { id: 'quality', icon: 'storage' },
      { id: 'lists', icon: 'bookmark' },
    ],
  },
  {
    id: 'downloads',
    areas: [
      { id: 'downloads', icon: 'downloads' },
      { id: 'subtitles', icon: 'subtitles', href: '/subtitles' },
      { id: 'connections', icon: 'notification' },
    ],
  },
]

const areas = areaGroups.flatMap((g) => g.areas)
export const isArea = (id: string): id is AreaId => areas.some((a) => a.id === id)
