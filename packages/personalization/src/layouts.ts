// SPDX-License-Identifier: AGPL-3.0-only
// Dashboard layouts (dashboard.md › Decisions): each person's own, or their role's default until
// they save one. Order is the layout. Reset forgets rather than copies, so an owner's later change
// to the default still reaches that person. Staff widgets are filtered here, on the server, so no
// layout can leak them. A placement whose kind this version doesn't know (a widget removed in a
// later release) is kept but not returned, so a downgrade doesn't lose it.
import { AppError } from '@highsea/core'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import type { Ctx } from './context.ts'
import {
  allowed,
  isWidgetKind,
  normalize,
  roleDefault,
  type WidgetPlacement,
  type WidgetRole,
  widgetDefinition,
} from './widgets.ts'

export type LayoutScope = { kind: 'user'; userId: string } | { kind: 'role'; role: WidgetRole }

export type WidgetLayout = {
  scope: LayoutScope
  widgets: WidgetPlacement[]
  /** Null while nobody has saved it: a role default straight from the registry. */
  updatedAt: number | null
  /** True when the person has no layout of their own and sees their role's default. */
  inherited: boolean
}

export type Person = { id: string; role: WidgetRole }

const userScope = (id: string) => `user:${id}`
const roleScope = (role: WidgetRole) => `role:${role}`

/** A stored placement with a kind this version knows. */
const known = (w: unknown): w is WidgetPlacement =>
  !!w && typeof w === 'object' && isWidgetKind(String((w as { kind?: unknown }).kind))

/**
 * Checks what someone sends: one of each widget, ids unique, settings by each widget's schema.
 * Returns the placements normalized to their ranges.
 */
function checked(widgets: WidgetPlacement[]): WidgetPlacement[] {
  const kinds = new Set<string>()
  const ids = new Set<string>()
  for (const w of widgets) {
    if (kinds.has(w.kind))
      throw new AppError('invalid', 'Each widget can be on the dashboard once.', {
        reason: 'duplicate',
        kind: w.kind,
      })
    if (ids.has(w.id))
      throw new AppError('invalid', 'Two widgets have the same id.', { reason: 'duplicate-id' })
    kinds.add(w.kind)
    ids.add(w.id)
    const settings = widgetDefinition(w.kind).settings.safeParse(w.settings ?? {})
    if (!settings.success)
      throw new AppError('invalid', 'A widget’s settings aren’t valid.', {
        reason: 'settings',
        kind: w.kind,
        issues: settings.error.issues,
      })
  }
  return widgets.map(normalize)
}

export function createLayouts(ctx: Ctx) {
  const { db, clock, events } = ctx

  const row = (scope: string) =>
    db.select().from(schema.widgetLayouts).where(eq(schema.widgetLayouts.scope, scope)).get()

  const stored = (scope: string) => (row(scope)?.widgets as unknown[] | undefined) ?? undefined

  /** What `role` may see of a stored list, in order and within range. */
  const visible = (widgets: unknown[], role: WidgetRole) =>
    widgets
      .filter(known)
      .filter((w) => allowed(w.kind, role))
      .map(normalize)

  /** Placements to carry over on save: kinds this version doesn't know. */
  const unknownIn = (scope: string) => (stored(scope) ?? []).filter((w) => !known(w))

  const write = (
    scope: string,
    widgets: unknown[],
    owner: { userId: string } | { role: WidgetRole },
  ) => {
    const now = clock.now()
    const values = {
      widgets,
      updatedAt: now,
      userId: 'userId' in owner ? owner.userId : null,
      role: 'role' in owner ? owner.role : null,
    }
    db.insert(schema.widgetLayouts)
      .values({ scope, ...values })
      .onConflictDoUpdate({ target: schema.widgetLayouts.scope, set: values })
      .run()
  }

  const roleLayout = (role: WidgetRole): WidgetLayout => {
    const r = row(roleScope(role))
    return {
      scope: { kind: 'role', role },
      widgets: visible((r?.widgets as unknown[] | undefined) ?? roleDefault(role), role),
      updatedAt: r?.updatedAt ?? null,
      inherited: false,
    }
  }

  const layout = (person: Person): WidgetLayout => {
    const own = row(userScope(person.id))
    if (!own) return { ...roleLayout(person.role), inherited: true }
    return {
      scope: { kind: 'user', userId: person.id },
      widgets: visible(own.widgets as unknown[], person.role),
      updatedAt: own.updatedAt,
      inherited: false,
    }
  }

  return {
    layout,

    /** Saves a person's own layout. A widget their role can't see is refused, not dropped. */
    save(person: Person, widgets: WidgetPlacement[]): WidgetLayout {
      const refused = widgets.filter((w) => !allowed(w.kind, person.role))
      if (refused.length)
        throw new AppError('forbidden', 'Your role can’t add some of those widgets.', {
          reason: 'widget-not-allowed',
          kinds: refused.map((w) => w.kind),
        })
      const scope = userScope(person.id)
      write(scope, [...checked(widgets), ...unknownIn(scope)], { userId: person.id })
      events.emit({ topic: 'layout.updated', ids: [person.id] })
      return layout(person)
    },

    /** Forgets a person's own layout, so they see their role's default again. */
    reset(person: Person): WidgetLayout {
      db.delete(schema.widgetLayouts)
        .where(eq(schema.widgetLayouts.scope, userScope(person.id)))
        .run()
      events.emit({ topic: 'layout.updated', ids: [person.id] })
      return layout(person)
    },

    roleDefault: roleLayout,

    /**
     * Saves a role's default, without the widgets the role can't see; those come back in
     * `dropped` so the owner can be told.
     */
    saveRoleDefault(
      role: WidgetRole,
      widgets: WidgetPlacement[],
    ): WidgetLayout & { dropped: WidgetPlacement['kind'][] } {
      const kept = widgets.filter((w) => allowed(w.kind, role))
      const scope = roleScope(role)
      write(scope, [...checked(kept), ...unknownIn(scope)], { role })
      events.emit({ topic: 'layout.updated', ids: [scope] })
      return {
        ...roleLayout(role),
        dropped: widgets.filter((w) => !allowed(w.kind, role)).map((w) => w.kind),
      }
    },
  }
}

export type LayoutService = ReturnType<typeof createLayouts>
