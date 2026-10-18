// SPDX-License-Identifier: AGPL-3.0-only
// A3 Dashboard (admin.md#main-area; docs/product/dashboard.md). The grid shows the user's own
// layout, or their role's default until they save one. Customize mode edits a draft: move,
// resize, add and remove widgets, then Done saves it. Owners can also make the draft the default
// for admins or members.
import {
  Button,
  EmptyState,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Sheet,
  SheetContent,
  toast,
} from '@highsea/ui-web'
import { useEffect, useState } from 'react'
import { WidgetEditor } from '../../kit/widget-editor.tsx'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { UserRole, WidgetKind, WidgetPlacement } from '../../mock/types.ts'
import { allowed, roleDefault, widgetDefinition, widgetDefinitions } from '../../mock/widgets.ts'
import { AdminPage, useShell } from '../shell.tsx'
import { widgetRenderers } from './widgets.tsx'

const same = (a: WidgetPlacement[], b: WidgetPlacement[]) =>
  a.length === b.length &&
  a.every((w, i) => w.kind === b[i]?.kind && w.span === b[i]?.span && w.rows === b[i]?.rows)

const roleName: Record<UserRole, string> = {
  owner: 'owners',
  admin: 'admins',
  member: 'members',
  restricted: 'restricted users',
}

export function Dashboard() {
  const { role, customizing, setCustomizing } = useShell()
  const layout = useQuery('layout', (c) => c.dashboard.layout(), ['layout.updated'])
  // the draft while customizing; `fromDefault` marks a draft that started from Reset
  const [draft, setDraft] = useState<WidgetPlacement[] | null>(null)
  const [fromDefault, setFromDefault] = useState<WidgetPlacement[] | null>(null)
  const [adding, setAdding] = useState(false)

  const save = useAction((c, widgets: WidgetPlacement[]) => c.dashboard.saveLayout(widgets))
  const reset = useAction((c) => c.dashboard.resetLayout())
  const loadDefault = useAction((c, r: UserRole) => c.dashboard.roleDefault(r))
  const saveDefault = useAction((c, r: UserRole, widgets: WidgetPlacement[]) =>
    c.dashboard.saveRoleDefault(r, widgets),
  )

  // leaving customize mode (Done, Cancel, or navigating away) drops the draft
  useEffect(() => {
    if (!customizing) {
      setDraft(null)
      setFromDefault(null)
    }
  }, [customizing])

  const saved = layout.data?.widgets ?? roleDefault(role)
  const editing = customizing && layout.status === 'success'
  const items = editing ? (draft ?? saved) : saved
  const missing = widgetDefinitions.filter(
    (d) => allowed(d.kind, role) && !items.some((w) => w.kind === d.kind),
  )

  const add = (kind: WidgetKind) => {
    const def = widgetDefinition(kind)
    setDraft([...items, { id: `w-${kind}`, kind, span: def.defaultSpan, rows: def.defaultRows }])
    setAdding(false)
    toast({ title: `${def.title} added at the end`, description: 'Move it where you want it.' })
  }

  const remove = (id: string) => setDraft(items.filter((w) => w.id !== id))

  const resetToDefault = async () => {
    const widgets = await loadDefault.run(role).catch(() => null)
    if (!widgets) return toast.error('Couldn’t load the default layout')
    setDraft(widgets)
    setFromDefault(widgets)
  }

  const done = async () => {
    try {
      if (!draft || same(draft, saved)) {
        // nothing changed, unless Reset asked to forget a saved layout
        if (fromDefault && !layout.data?.inherited) await reset.run()
      } else if (fromDefault && same(draft, fromDefault)) await reset.run()
      else await save.run(draft)
    } catch (e) {
      return toast.error('Couldn’t save the dashboard', { description: (e as Error).message })
    }
    setCustomizing(false)
    if (draft || fromDefault) toast.success('Dashboard saved')
  }

  const makeDefault = async (target: UserRole) => {
    const dropped = items.filter((w) => !allowed(w.kind, target))
    try {
      await saveDefault.run(target, items)
    } catch (e) {
      return toast.error('Couldn’t set the default', { description: (e as Error).message })
    }
    toast.success(`New ${roleName[target]} start from this layout`, {
      description: dropped.length
        ? `${dropped.map((w) => widgetDefinition(w.kind).title).join(', ')} ${dropped.length === 1 ? 'is' : 'are'} left out: ${roleName[target]} can’t see ${dropped.length === 1 ? 'it' : 'them'}.`
        : `People who haven’t customized their dashboard see it now.`,
    })
  }

  const actions = editing ? (
    <>
      <Button icon="add" onClick={() => setAdding(true)} disabled={!missing.length}>
        Add widget
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" iconOnly icon="more" aria-label="More layout options" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon="replay" onSelect={resetToDefault}>
            Reset to default
          </MenuItem>
          {role === 'owner' && (
            <>
              <MenuSeparator />
              <MenuLabel>Default layout</MenuLabel>
              <MenuItem icon="shield" onSelect={() => makeDefault('admin')}>
                Make this the default for admins
              </MenuItem>
              <MenuItem icon="users" onSelect={() => makeDefault('member')}>
                Make this the default for members
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      <Button variant="ghost" onClick={() => setCustomizing(false)}>
        Cancel
      </Button>
      <Button variant="primary" icon="check" onClick={done} loading={save.pending || reset.pending}>
        Done
      </Button>
    </>
  ) : (
    <Button icon="grid" onClick={() => setCustomizing(true)} disabled={layout.status !== 'success'}>
      Customize
    </Button>
  )

  return (
    <AdminPage
      title="Dashboard"
      description={
        editing
          ? 'Drag a widget by its handle to move it, or by its corner to make it wider or taller. Nothing is saved until you press Done.'
          : undefined
      }
      actions={actions}
    >
      {layout.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title="Couldn’t load your dashboard"
          action={<Button onClick={layout.refetch}>Try again</Button>}
        >
          {layout.error.message}
        </EmptyState>
      ) : (
        <WidgetEditor
          items={items}
          editing={editing}
          onChange={setDraft}
          range={(w) => widgetDefinition(w.kind)}
          label={(w) => widgetDefinition(w.kind).title}
          render={(w, frame) => {
            const Render = widgetRenderers[w.kind]
            return (
              <Render
                key={w.id}
                frame={frame}
                actions={
                  editing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon="close"
                      aria-label={`Remove ${widgetDefinition(w.kind).title}`}
                      onClick={() => remove(w.id)}
                      className="-me-1.5"
                    />
                  ) : undefined
                }
              />
            )
          }}
        />
      )}
      {layout.status === 'success' && items.length === 0 && (
        <EmptyState
          icon="grid"
          title="Your dashboard is empty"
          action={
            <Button
              variant="primary"
              icon="add"
              onClick={() => (editing ? setAdding(true) : setCustomizing(true))}
            >
              Add widget
            </Button>
          }
        >
          Add the widgets you want to see first.
        </EmptyState>
      )}
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent
          side="right"
          title="Add a widget"
          description="Widgets go at the end of the grid. Move them once they’re in."
        >
          <ul className="grid gap-2">
            {missing.map((d) => (
              <li key={d.kind}>
                <button
                  type="button"
                  onClick={() => add(d.kind)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-md border border-line bg-s2 p-3 text-start transition-tint hover:border-line-strong hover:bg-s4"
                >
                  <span className="font-semibold text-text text-ui">{d.title}</span>
                  <Icon name="add" size={16} className="row-span-2 text-text-3" />
                  <span className="text-caption text-text-2">{d.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </AdminPage>
  )
}
