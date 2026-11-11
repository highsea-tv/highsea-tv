'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// A3 Dashboard (admin.md#main-area; docs/product/dashboard.md), ported from the prototype. The
// grid shows the person's own layout, or their role's default until they save one. Customize mode
// edits a draft: move, resize, add and remove widgets, then Done saves it. Owners can also make
// the draft the default for admins. Drawn with the library's native renderer since D2
// (one-client-platform-d.md), its editor's customize mode in widget-editor.web.tsx.

import { useLocale, useT } from '@highsea-tv/i18n/react'
import {
  allowed,
  roleDefault,
  type WidgetKind,
  type WidgetPlacement,
  type WidgetRole,
  widgetDefinition,
  widgetDefinitions,
  widgetMessages,
} from '@highsea-tv/personalization/widgets'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { line } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  Icon,
  Menu,
  type MenuOption,
  Press,
  Sheet,
  Text,
  toast,
  tokens,
  useTheme,
  WidgetEditor,
  type WidgetEditorMessages,
} from '@highsea-tv/ui/native'
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
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
  const [menu, setMenu] = useState(false)
  const more = useRef<ComponentRef<typeof View>>(null)
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

  // the owner sets the admins' default from here (dashboard.md › Customize)
  const makeAdminDefault = async () => {
    let dropped: WidgetKind[]
    try {
      dropped = (await saveDefault.run('admin', items)).dropped
    } catch (e) {
      return toast.error(t('defaultError'), { description: (e as Error).message })
    }
    toast.success(t('defaultSaved.admin'), {
      description: dropped.length
        ? t('defaultDropped.admin', {
            // "Network, Storage" (ECMA-402 Intl.ListFormat, a unit list)
            widgets: new Intl.ListFormat(locale, { type: 'unit', style: 'short' }).format(
              dropped.map(title),
            ),
            count: dropped.length,
          })
        : t('defaultReaches'),
    })
  }

  const menuItems: MenuOption[] = [
    { label: t('resetToDefault'), icon: 'replay', onSelect: resetToDefault },
    ...(role === 'owner'
      ? [
          {
            label: t('makeDefaultAdmins'),
            icon: 'shield',
            group: t('defaultLayout'),
            onSelect: makeAdminDefault,
          } satisfies MenuOption,
        ]
      : []),
  ]

  const actions = editing ? (
    <>
      <Button icon="add" onPress={() => setAdding(true)} disabled={!missing.length}>
        {t('addWidget')}
      </Button>
      <Button
        ref={more}
        variant="ghost"
        iconOnly
        icon="more"
        accessibilityLabel={t('moreOptions')}
        hasPopup="menu"
        accessibilityState={{ expanded: menu }}
        onPress={() => setMenu(true)}
      />
      <Menu
        title={t('moreOptions')}
        items={menuItems}
        open={menu}
        onClose={() => setMenu(false)}
        anchor={more}
      />
      <Button variant="ghost" onPress={() => setCustomizing(false)}>
        {t('cancel')}
      </Button>
      <Button variant="primary" icon="check" onPress={done} loading={save.pending || reset.pending}>
        {t('done')}
      </Button>
    </>
  ) : (
    <Button icon="grid" onPress={() => setCustomizing(true)} disabled={layout.status !== 'success'}>
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
          action={<Button onPress={layout.refetch}>{t('retry')}</Button>}
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
                    <View style={{ marginRight: -(tokens.space['1'] + tokens.space['0.5']) }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconOnly
                        icon="close"
                        accessibilityLabel={t('remove', { widget: title(w.kind) })}
                        onPress={() => remove(w.id)}
                      />
                    </View>
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
              onPress={() => (editing ? setAdding(true) : setCustomizing(true))}
            >
              {t('addWidget')}
            </Button>
          }
        >
          {t('emptyBody')}
        </EmptyState>
      )}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        side="right"
        title={t('sheetTitle')}
        description={t('sheetDescription')}
      >
        <View role="list" style={{ gap: tokens.space['2'] }}>
          {missing.map((d) => (
            <View key={d.kind} role="listitem">
              <AddRow
                title={title(d.kind)}
                description={tw(`${d.kind}.description`)}
                onPress={() => add(d.kind)}
              />
            </View>
          ))}
        </View>
      </Sheet>
    </AdminPage>
  )
}

/** A widget to add: its name and what it shows, with the add icon at the end. */
function AddRow({
  title,
  description,
  onPress,
}: {
  title: string
  description: string
  onPress: () => void
}) {
  const theme = useTheme()
  const ui = tokens.adminText.ui
  return (
    <Press
      onPress={onPress}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: tokens.space['3'],
        padding: tokens.space['3'],
        borderRadius: tokens.radius.md,
        borderWidth: line.thin,
        borderColor: hovered ? theme.colors['line-strong'] : theme.colors.line,
        backgroundColor: hovered ? theme.colors.s4 : theme.colors.s2,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: tokens.space['0.5'] }}>
        <Text size={ui.size} leading={ui.leading} weight={600}>
          {title}
        </Text>
        <Text variant="caption" color="text-2">
          {description}
        </Text>
      </View>
      <Icon name="add" size={tokens.icon.size.sm} color="text-3" />
    </Press>
  )
}
