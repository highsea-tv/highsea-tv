// SPDX-License-Identifier: AGPL-3.0-only
// Settings' areas in their five groups (System and its Migration area came with 6b) (the prototype's settings.tsx). Plain data, so the
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
  | 'vpn'
  | 'downloads'
  | 'subtitles'
  | 'connections'
  | 'migration'

export type Area = {
  id: AreaId
  icon: IconName
  /** Areas with a page of their own elsewhere (Subtitles). */
  href?: string
  /** The owner's alone: left out for admins (ADR 0032). */
  ownerOnly?: true
}

export const areaGroups: {
  id: 'server' | 'people' | 'library' | 'downloads' | 'system'
  areas: Area[]
}[] = [
  {
    id: 'server',
    areas: [
      { id: 'general', icon: 'settings' },
      { id: 'appearance', icon: 'curation' },
      { id: 'network', icon: 'network' },
      { id: 'security', icon: 'shield', ownerOnly: true },
      { id: 'backups', icon: 'storage', ownerOnly: true },
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
      { id: 'vpn', icon: 'shield', ownerOnly: true },
      // the port and encryption are network settings, the owner's (checkpoint 6's access table)
      { id: 'downloads', icon: 'downloads', ownerOnly: true },
      { id: 'subtitles', icon: 'subtitles', href: '/subtitles' },
      { id: 'connections', icon: 'notification' },
    ],
  },
  // the one-time importers take another program's credentials: the owner's (the owner's answer 10)
  { id: 'system', areas: [{ id: 'migration', icon: 'import', ownerOnly: true }] },
]

const areas = areaGroups.flatMap((g) => g.areas)
export const isArea = (id: string): id is AreaId => areas.some((a) => a.id === id)

/** Whether `role` sees the area: Security, Backups, VPN, Download client and Migration are the owner's alone. */
export const seesArea = (id: AreaId, role: string) =>
  role === 'owner' || !areas.find((a) => a.id === id)?.ownerOnly

/** The groups `role` sees. */
export const areaGroupsFor = (role: string) =>
  areaGroups.map((g) => ({ ...g, areas: g.areas.filter((a) => seesArea(a.id, role)) }))
