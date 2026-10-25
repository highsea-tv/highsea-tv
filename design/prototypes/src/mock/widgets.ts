// SPDX-License-Identifier: AGPL-3.0-only
// The widget registry as the prototype sees it: @highsea-tv/personalization's, plus the widgets
// proposed for a later checkpoint and not yet in the server's registry. Now playing is checkpoint
// 4.0b's (docs/product/now-playing.md); 4.3 moves it into the package when sessions are built.
import {
  type WidgetDefinition as BuiltDefinition,
  type WidgetKind as BuiltKind,
  type WidgetPlacement as BuiltPlacement,
  allowed as builtAllowed,
  widgetDefinitions as builtDefinitions,
  normalize as builtNormalize,
  roleDefault as builtRoleDefault,
  isWidgetKind,
  type WidgetRole,
  type WidgetSpan,
} from '@highsea-tv/personalization/widgets'

export type WidgetKind = BuiltKind | 'now-playing'
export type WidgetDefinition = Omit<BuiltDefinition, 'kind' | 'source'> & {
  kind: WidgetKind
  source: BuiltDefinition['source'] | 'playback'
}
export type WidgetPlacement = Omit<BuiltPlacement, 'kind'> & { kind: WidgetKind }
export type { WidgetRole, WidgetSpan }

// the registry's schema for a widget without settings, so the prototype needn't depend on zod
const none = (builtDefinitions.find((d) => d.kind === 'storage') as BuiltDefinition).settings

const proposed: WidgetDefinition[] = [
  {
    kind: 'now-playing',
    title: 'Now playing',
    description: 'Who’s watching what, and how each stream is sent.',
    width: [1, 4],
    height: [2, 5],
    defaultSpan: 2,
    defaultRows: 3,
    roles: ['owner', 'admin'],
    source: 'playback',
    settings: none,
  },
]

export const widgetDefinitions: WidgetDefinition[] = [...builtDefinitions, ...proposed]

export const widgetDefinition = (kind: WidgetKind) =>
  widgetDefinitions.find((d) => d.kind === kind) as WidgetDefinition

export const allowed = (kind: WidgetKind, role: WidgetRole) =>
  isWidgetKind(kind) ? builtAllowed(kind, role) : widgetDefinition(kind).roles.includes(role)

const clamp = (n: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, n))

export function normalize(w: WidgetPlacement): WidgetPlacement {
  if (isWidgetKind(w.kind)) return builtNormalize(w as BuiltPlacement)
  const def = widgetDefinition(w.kind)
  return {
    id: w.id,
    kind: w.kind,
    span: clamp(w.span, def.width) as WidgetSpan,
    rows: clamp(w.rows ?? def.defaultRows, def.height),
    settings: {},
  }
}

/**
 * The signed-off first arrangement, unchanged: Now playing is added from Customize. Whether it
 * should lead the owner's and admins' default is the owner's call at 4.0b's review.
 */
export const roleDefault = (role: WidgetRole): WidgetPlacement[] => builtRoleDefault(role)
