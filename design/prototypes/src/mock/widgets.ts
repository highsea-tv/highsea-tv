// SPDX-License-Identifier: AGPL-3.0-only
// The widget registry's server half: what each widget is, the sizes it allows and who may add it
// (roadmap › personalization). Renderers live with the dashboard. A size is a width in columns of
// the 4-column grid and a height in 84px rows; resizing snaps to whole columns and rows within
// each widget's range.
import type { UserRole, WidgetKind, WidgetPlacement, WidgetSpan } from './types.ts'

export type WidgetDefinition = {
  kind: WidgetKind
  title: string
  description: string
  /** Narrowest and widest, in columns of the 4-column grid. */
  width: [WidgetSpan, WidgetSpan]
  /** Shortest and tallest, in rows. */
  height: [number, number]
  defaultSpan: WidgetSpan
  defaultRows: number
  /** Roles that may add it. Owners and admins see everything. */
  roles: UserRole[]
}

const all: UserRole[] = ['owner', 'admin', 'member']
const staff: UserRole[] = ['owner', 'admin']

export const widgetDefinitions: WidgetDefinition[] = [
  {
    kind: 'network',
    title: 'Network',
    description: 'Download and upload speed over the last 10 minutes.',
    width: [1, 2],
    height: [2, 4],
    defaultSpan: 2,
    defaultRows: 2,
    roles: staff,
  },
  {
    kind: 'storage',
    title: 'Storage',
    description: 'Free space on each disk, and what uses it.',
    width: [1, 4],
    height: [2, 4],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
  },
  {
    kind: 'indexers',
    title: 'Indexers',
    description: 'Which indexers are healthy, slow or backing off.',
    width: [1, 4],
    height: [2, 6],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
  },
  {
    kind: 'subtitles',
    title: 'Subtitles',
    description: 'Subtitles synced today and the ones still waiting.',
    width: [1, 4],
    height: [2, 3],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
  },
  {
    kind: 'upcoming',
    title: 'Upcoming',
    description: 'Monitored movies released in the next 14 days.',
    width: [1, 4],
    height: [2, 6],
    defaultSpan: 2,
    defaultRows: 2,
    roles: all,
  },
  {
    kind: 'announcement',
    title: 'Announcement',
    description: 'The announcement your clients see right now.',
    width: [1, 4],
    height: [2, 4],
    defaultSpan: 1,
    defaultRows: 2,
    roles: all,
  },
  {
    kind: 'activity',
    title: 'Queue',
    description: 'Everything downloading, importing or waiting, live.',
    width: [1, 4],
    height: [3, 8],
    defaultSpan: 4,
    defaultRows: 5,
    roles: all,
  },
  {
    kind: 'recently-added',
    title: 'Recently added',
    description: 'The newest movies in the library.',
    width: [1, 4],
    height: [3, 6],
    defaultSpan: 2,
    defaultRows: 3,
    roles: all,
  },
  {
    kind: 'calendar',
    title: 'Calendar',
    description: 'This month’s releases at a glance.',
    width: [1, 4],
    height: [3, 5],
    defaultSpan: 2,
    defaultRows: 3,
    roles: all,
  },
  {
    kind: 'system-health',
    title: 'System health',
    description: 'Health checks that need attention.',
    width: [1, 4],
    height: [2, 4],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
  },
]

export const widgetDefinition = (kind: WidgetKind) =>
  widgetDefinitions.find((d) => d.kind === kind) as WidgetDefinition

const place = (kind: WidgetKind, span?: WidgetSpan, rows?: number): WidgetPlacement => ({
  id: `w-${kind}`,
  kind,
  span: span ?? widgetDefinition(kind).defaultSpan,
  rows: rows ?? widgetDefinition(kind).defaultRows,
})

const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n))

/** Keeps a placement within its widget's range; layouts saved before heights get the default. */
export function normalize(w: WidgetPlacement): WidgetPlacement {
  const def = widgetDefinition(w.kind)
  return {
    ...w,
    span: clamp(w.span, def.width) as WidgetSpan,
    rows: clamp(w.rows ?? def.defaultRows, def.height),
  }
}

/** The arrangement from admin.md › main area, then the queue across the full width. */
export const ownerDefault: WidgetPlacement[] = [
  place('network'),
  place('storage'),
  place('indexers'),
  place('subtitles'),
  place('upcoming'),
  place('announcement'),
  place('activity'),
]

/** Members manage the library but not the server: no network, storage or indexers. */
export const memberDefault: WidgetPlacement[] = [
  place('recently-added'),
  place('upcoming', 2, 3),
  place('activity'),
]

export const roleDefault = (role: UserRole): WidgetPlacement[] =>
  role === 'owner' || role === 'admin' ? ownerDefault : memberDefault

export const allowed = (kind: WidgetKind, role: UserRole) =>
  widgetDefinition(kind).roles.includes(role)
