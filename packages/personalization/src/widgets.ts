// SPDX-License-Identifier: AGPL-3.0-only
// The widget registry (roadmap › personalization; dashboard.md), moved from the prototype's
// mock/widgets.ts: what each widget is, the sizes it allows, who may add it, the data it reads and
// its settings. Renderers live with each app. A size is a width in columns of the 4-column grid
// and a height in 84px rows; resizing snaps to whole columns and rows within each widget's range.
// Browser-safe: the admin, the prototype and the clients import it as `/widgets`.
import { defineMessages } from '@highsea/i18n'
import { z } from 'zod'

export const WIDGET_KINDS = [
  'network',
  'storage',
  'indexers',
  'subtitles',
  'upcoming',
  'announcement',
  'activity',
  'recently-added',
  'calendar',
  'system-health',
] as const
export type WidgetKind = (typeof WIDGET_KINDS)[number]

export type WidgetSpan = 1 | 2 | 3 | 4

/** The dashboard is the admin's, so only staff have one (ADR 0032). */
export type WidgetRole = 'owner' | 'admin'

/**
 * Where a widget's data comes from. The server's public info lists the sources it has; a widget
 * whose source isn't there shows its empty state and calls nothing.
 */
export const WIDGET_SOURCES = [
  'system',
  'movies',
  'indexers',
  'downloads',
  'subtitles',
  'curation',
] as const
export type WidgetSource = (typeof WIDGET_SOURCES)[number]

/** Where a widget sits: its place in the order, its width in columns, its height in rows. */
export type WidgetPlacement = {
  id: string
  kind: WidgetKind
  span: WidgetSpan
  rows: number
  /** The widget's settings, by its schema; missing ones take the defaults. */
  settings?: Record<string, unknown>
}

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
  /** Roles that may add it. */
  roles: WidgetRole[]
  source: WidgetSource
  /** Settings with their defaults: parsing `{}` gives what the widget shows untouched. */
  settings: z.ZodType<Record<string, unknown>>
}

/** Each widget's title and one-line description (ADR 0021): `{kind}.title`, `{kind}.description`. */
export const widgetMessages = defineMessages({
  'network.title': 'Network',
  'network.description': 'Download and upload speed over the last 10 minutes.',
  'storage.title': 'Storage',
  'storage.description': 'Free space on each disk, and what uses it.',
  'indexers.title': 'Indexers',
  'indexers.description': 'Which indexers are healthy, slow or backing off.',
  'subtitles.title': 'Subtitles',
  'subtitles.description': 'Subtitles synced today and the ones still waiting.',
  'upcoming.title': 'Upcoming',
  'upcoming.description': 'Monitored movies released in the next 14 days.',
  'announcement.title': 'Announcement',
  'announcement.description': 'The announcement your clients see right now.',
  'activity.title': 'Queue',
  'activity.description': 'Everything downloading, importing or waiting, live.',
  'recently-added.title': 'Recently added',
  'recently-added.description': 'The newest movies in the library.',
  'calendar.title': 'Calendar',
  'calendar.description': 'This month’s releases at a glance.',
  'system-health.title': 'System health',
  'system-health.description': 'Health checks that need attention.',
})

const staff: WidgetRole[] = ['owner', 'admin']

const none = z.strictObject({})

const define = (
  kind: WidgetKind,
  d: Omit<WidgetDefinition, 'kind' | 'title' | 'description' | 'settings'> & {
    settings?: WidgetDefinition['settings']
  },
): WidgetDefinition => ({
  kind,
  title: widgetMessages[`${kind}.title`],
  description: widgetMessages[`${kind}.description`],
  ...d,
  settings: d.settings ?? none,
})

export const widgetDefinitions: WidgetDefinition[] = [
  define('network', {
    width: [1, 2],
    height: [2, 4],
    defaultSpan: 2,
    defaultRows: 2,
    roles: staff,
    source: 'downloads',
    settings: z.strictObject({ minutes: z.int().min(5).max(60).default(10) }),
  }),
  define('storage', {
    width: [1, 4],
    height: [2, 4],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
    source: 'system',
  }),
  define('indexers', {
    width: [1, 4],
    height: [2, 6],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
    source: 'indexers',
  }),
  define('subtitles', {
    width: [1, 4],
    height: [2, 3],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
    source: 'subtitles',
  }),
  define('upcoming', {
    width: [1, 4],
    height: [2, 6],
    defaultSpan: 2,
    defaultRows: 2,
    roles: staff,
    source: 'movies',
    settings: z.strictObject({ days: z.int().min(1).max(90).default(14) }),
  }),
  define('announcement', {
    width: [1, 4],
    height: [2, 4],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
    source: 'curation',
  }),
  define('activity', {
    width: [1, 4],
    height: [3, 8],
    defaultSpan: 4,
    defaultRows: 5,
    roles: staff,
    source: 'downloads',
    settings: z.strictObject({
      filter: z.enum(['all', 'downloading', 'seeding', 'issues']).default('all'),
    }),
  }),
  define('recently-added', {
    width: [1, 4],
    height: [3, 6],
    defaultSpan: 2,
    defaultRows: 3,
    roles: staff,
    source: 'movies',
  }),
  define('calendar', {
    width: [1, 4],
    height: [3, 5],
    defaultSpan: 2,
    defaultRows: 3,
    roles: staff,
    source: 'movies',
  }),
  define('system-health', {
    width: [1, 4],
    height: [2, 4],
    defaultSpan: 1,
    defaultRows: 2,
    roles: staff,
    source: 'system',
  }),
]

export const isWidgetKind = (kind: string): kind is WidgetKind =>
  (WIDGET_KINDS as readonly string[]).includes(kind)

export const widgetDefinition = (kind: WidgetKind) =>
  widgetDefinitions.find((d) => d.kind === kind) as WidgetDefinition

/** The most rows a widget may span, across the registry. */
export const MAX_ROWS = Math.max(...widgetDefinitions.map((d) => d.height[1]))

const place = (kind: WidgetKind, span?: WidgetSpan, rows?: number): WidgetPlacement => ({
  id: `w-${kind}`,
  kind,
  span: span ?? widgetDefinition(kind).defaultSpan,
  rows: rows ?? widgetDefinition(kind).defaultRows,
})

const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n))

/**
 * Keeps a placement within its widget's range, and fills its settings from the defaults. Layouts
 * saved before heights existed get the default height. Settings that no longer parse (a schema
 * that changed) fall back to the defaults.
 */
export function normalize(w: WidgetPlacement): WidgetPlacement {
  const def = widgetDefinition(w.kind)
  const settings = def.settings.safeParse(w.settings ?? {})
  return {
    id: w.id,
    kind: w.kind,
    span: clamp(w.span, def.width) as WidgetSpan,
    rows: clamp(w.rows ?? def.defaultRows, def.height),
    settings: settings.success ? settings.data : def.settings.parse({}),
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

/** The owner and admins start from the same arrangement; each role's can be saved apart. */
export const roleDefault = (_role: WidgetRole): WidgetPlacement[] => ownerDefault

export const allowed = (kind: WidgetKind, role: WidgetRole) =>
  widgetDefinition(kind).roles.includes(role)
