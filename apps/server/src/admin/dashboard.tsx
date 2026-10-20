'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A3 Dashboard (admin.md#main-area; docs/product/dashboard.md), ported from the prototype. The
// grid shows the person's own layout, or their role's default until they save one. Customize mode
// edits a draft: move, resize, add and remove widgets, then Done saves it. Owners can also make
// the draft the default for admins or members.

import { useLocale, useT } from '@highsea/i18n/react'
import {
  allowed,
  roleDefault,
  type WidgetKind,
  type WidgetPlacement,
  type WidgetRole,
  widgetDefinition,
  widgetDefinitions,
  widgetMessages,
} from '@highsea/personalization/widgets'
import { useAction, useQuery } from '@highsea/sdk/react'
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
  WidgetEditor,
  type WidgetEditorMessages,
} from '@highsea/ui-web'
import { useEffect, useMemo, useState } from 'react'
import { dashboard as messages } from './dashboard-messages.ts'
import { shell } from './messages.ts'
import { AdminPage, useShell } from './shell.tsx'
import { widgetRenderers } from './widgets.tsx'

const same = (a: WidgetPlacement[], b: WidgetPlacement[]) =>
  a.length === b.length &&
  a.every((w, i) => w.kind === b[i]?.kind && w.span === b[i]?.span && w.rows === b[i]?.rows)

/** The editor's announcements, from the catalog. */
function useEditorMessages(): Partial<WidgetEditorMessages> {
  const t = useT(messages)
  return useMemo(
    () => ({
      move: (name) => t('editor.move', { name }),
      help: t('editor.help'),
      pickedUp: (at) => t('editor.pickedUp', at),
      dragged: (at) => t('editor.dragged', at),
      dropped: (at) => t('editor.dropped', at),
      moved: (at) => t('editor.moved', at),
      cancelled: (name) => t('editor.cancelled', { name }),
      limit: (name, edge) => t('editor.limit', { name, edge }),
      resized: (size) => t('editor.resized', size),
      settled: (size) => t('editor.settled', size),
      resizeCancelled: t('editor.resizeCancelled'),
    }),
    [t],
  )
}

export function Dashboard() {
  const t = useT(messages)
  const ts = useT(shell)
  const tw = useT(widgetMessages)
  const locale = useLocale()
  const { role, customizing, setCustomizing } = useShell()
  const layout = useQuery('layout', (c) => c.dashboard.layout(), ['layout.updated'])
  // the draft while customizing; `fromDefault` marks a draft that started from Reset
  const [draft, setDraft] = useState<WidgetPlacement[] | null>(null)
  const [fromDefault, setFromDefault] = useState<WidgetPlacement[] | null>(null)
  const [adding, setAdding] = useState(false)
  const editorMessages = useEditorMessages()

  const save = useAction((c, widgets: WidgetPlacement[]) =>
    c.dashboard.saveLayout({ body: { widgets } }),
  )
  const reset = useAction((c) => c.dashboard.resetLayout())
  const loadDefault = useAction((c, r: WidgetRole) =>
    c.dashboard.roleDefault({ params: { role: r } }),
  )
  const saveDefault = useAction((c, r: WidgetRole, widgets: WidgetPlacement[]) =>
    c.dashboard.saveRoleDefault({ params: { role: r }, body: { widgets } }),
  )

  // leaving customize mode (Done, Cancel, or navigating away) drops the draft
  useEffect(() => {
    if (!customizing) {
      setDraft(null)
      setFromDefault(null)
    }
  }, [customizing])

  const title = (kind: WidgetKind) => tw(`${kind}.title`)
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
    toast({ title: t('added', { widget: title(kind) }), description: t('addedBody') })
  }

  const remove = (id: string) => setDraft(items.filter((w) => w.id !== id))

  const resetToDefault = async () => {
    const def = await loadDefault.run(role).catch(() => null)
    if (!def) return toast.error(t('resetError'))
    setDraft(def.widgets)
    setFromDefault(def.widgets)
  }

  const done = async () => {
    try {
      if (!draft || same(draft, saved)) {
        // nothing changed, unless Reset asked to forget a saved layout
        if (fromDefault && !layout.data?.inherited) await reset.run()
      } else if (fromDefault && same(draft, fromDefault)) await reset.run()
      else await save.run(draft)
    } catch (e) {
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    setCustomizing(false)
    if (draft || fromDefault) toast.success(t('saved'))
  }

  const makeDefault = async (target: WidgetRole) => {
    let dropped: WidgetKind[]
    try {
      dropped = (await saveDefault.run(target, items)).dropped
    } catch (e) {
      return toast.error(t('defaultError'), { description: (e as Error).message })
    }
    // only admins and members get a default from here (dashboard.md › Customize)
    const to = target === 'admin' ? 'admin' : 'member'
    toast.success(t(`defaultSaved.${to}`), {
      description: dropped.length
        ? t(`defaultDropped.${to}`, {
            // "Network, Storage" (ECMA-402 Intl.ListFormat, a unit list)
            widgets: new Intl.ListFormat(locale, { type: 'unit', style: 'short' }).format(
              dropped.map(title),
            ),
            count: dropped.length,
          })
        : t('defaultReaches'),
    })
  }

  const actions = editing ? (
    <>
      <Button icon="add" onClick={() => setAdding(true)} disabled={!missing.length}>
        {t('addWidget')}
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" iconOnly icon="more" aria-label={t('moreOptions')} />
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon="replay" onSelect={resetToDefault}>
            {t('resetToDefault')}
          </MenuItem>
          {role === 'owner' && (
            <>
              <MenuSeparator />
              <MenuLabel>{t('defaultLayout')}</MenuLabel>
              <MenuItem icon="shield" onSelect={() => makeDefault('admin')}>
                {t('makeDefaultAdmins')}
              </MenuItem>
              <MenuItem icon="users" onSelect={() => makeDefault('member')}>
                {t('makeDefaultMembers')}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      <Button variant="ghost" onClick={() => setCustomizing(false)}>
        {t('cancel')}
      </Button>
      <Button variant="primary" icon="check" onClick={done} loading={save.pending || reset.pending}>
        {t('done')}
      </Button>
    </>
  ) : (
    <Button icon="grid" onClick={() => setCustomizing(true)} disabled={layout.status !== 'success'}>
      {t('customize')}
    </Button>
  )

  return (
    <AdminPage
      title={ts('dashboard.title')}
      description={editing ? t('editing') : undefined}
      actions={actions}
    >
      {layout.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title={t('loadError')}
          action={<Button onClick={layout.refetch}>{t('retry')}</Button>}
        >
          {layout.error.message}
        </EmptyState>
      ) : (
        <WidgetEditor
          items={items}
          editing={editing}
          onChange={setDraft}
          range={(w) => widgetDefinition(w.kind)}
          label={(w) => title(w.kind)}
          messages={editorMessages}
          render={(w, frame) => {
            const Render = widgetRenderers[w.kind]
            return (
              <Render
                key={w.id}
                frame={frame}
                settings={w.settings ?? {}}
                actions={
                  editing ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon="close"
                      aria-label={t('remove', { widget: title(w.kind) })}
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
          title={t('emptyTitle')}
          action={
            <Button
              variant="primary"
              icon="add"
              onClick={() => (editing ? setAdding(true) : setCustomizing(true))}
            >
              {t('addWidget')}
            </Button>
          }
        >
          {t('emptyBody')}
        </EmptyState>
      )}
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent side="right" title={t('sheetTitle')} description={t('sheetDescription')}>
          <ul className="grid gap-2">
            {missing.map((d) => (
              <li key={d.kind}>
                <button
                  type="button"
                  onClick={() => add(d.kind)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-md border border-line bg-s2 p-3 text-start transition-tint hover:border-line-strong hover:bg-s4"
                >
                  <span className="font-semibold text-text text-ui">{title(d.kind)}</span>
                  <Icon name="add" size={16} className="row-span-2 text-text-3" />
                  <span className="text-caption text-text-2">{tw(`${d.kind}.description`)}</span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </AdminPage>
  )
}
