'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings (A12; docs/product/settings.md), ported from the prototype: an index of every area in
// four groups, and each area's page with the areas beside it from expanded widths. Users and
// devices is the area this checkpoint builds; the others say they come later.
import { useT } from '@highsea-tv/i18n/react'
import { Button, cn, EmptyState, Icon } from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'
import { type Area, type AreaId, areaGroupsFor } from './settings-areas.ts'
import { settings as messages } from './settings-messages.ts'
import { AdminPage, useShell } from './shell.tsx'

const areaHref = (a: Area) => a.href ?? `/settings/${a.id}`

/** `/settings`: every area, grouped, as cards that say what's inside. */
export function SettingsIndex() {
  const t = useT(messages)
  const groups = areaGroupsFor(useShell().role)
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <div className="grid gap-8">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`settings-${g.id}`} className="grid gap-3">
            <h2 id={`settings-${g.id}`} className="font-mono text-label text-text-3 uppercase">
              {t(`group.${g.id}`)}
            </h2>
            <ul className="grid gap-3 medium:grid-cols-2 wide:grid-cols-3">
              {g.areas.map((a) => (
                <li key={a.id}>
                  <a
                    href={areaHref(a)}
                    className="grid h-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-line bg-s1 p-4 outline-none transition-tint hover:bg-s2 focus-visible:ring-focus"
                  >
                    <Icon name={a.icon} size={18} className="row-span-2 mt-0.5 text-accent-text" />
                    <span className="font-semibold text-text text-ui">{t(`area.${a.id}`)}</span>
                    <span className="text-caption text-text-3">
                      {t(`area.${a.id}.description`)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AdminPage>
  )
}

/** The areas beside an area's page, from expanded widths. */
function AreaNav({ current }: { current: AreaId }) {
  const t = useT(messages)
  const groups = areaGroupsFor(useShell().role)
  return (
    <nav aria-label={t('nav')} className="hidden content-start gap-5 expanded:grid">
      {groups.map((g) => (
        <div key={g.id} className="grid gap-1">
          <p className="px-2.5 font-mono text-label text-text-3 uppercase">{t(`group.${g.id}`)}</p>
          <ul className="grid gap-0.5">
            {g.areas.map((a) => (
              <li key={a.id}>
                <a
                  href={areaHref(a)}
                  aria-current={a.id === current ? 'page' : undefined}
                  className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-text-2 text-ui outline-none hover:bg-text/6 hover:text-text focus-visible:ring-focus aria-[current=page]:bg-text/6 aria-[current=page]:text-text"
                >
                  {t(`area.${a.id}`)}
                  {a.href && <Icon name="external" size={12} className="text-text-3" />}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** An area's page: the page header, the nav beside it, and the area's content. Staff only. */
export function AreaPage({
  id,
  actions,
  children,
}: {
  id: AreaId
  actions?: ReactNode
  children: ReactNode
}) {
  const t = useT(messages)
  return (
    <AdminPage title={t(`area.${id}`)} description={t(`area.${id}.description`)} actions={actions}>
      <div className="grid gap-6 expanded:grid-cols-[13rem_minmax(0,1fr)]">
        <AreaNav current={id} />
        <div className="grid min-w-0 content-start gap-6">
          <a
            href="/settings"
            className="flex items-center gap-1 justify-self-start rounded-sm text-text-2 text-ui outline-none hover:text-text focus-visible:ring-focus expanded:hidden"
          >
            <Icon name="chevron-left" size={16} />
            {t('all')}
          </a>
          {children}
        </div>
      </div>
    </AdminPage>
  )
}

/** `/settings/{area}` for the areas later checkpoints build. */
export function LaterArea({ id }: { id: AreaId }) {
  const t = useT(messages)
  return (
    <AreaPage id={id}>
      <EmptyState icon="settings" title={t('later.title')}>
        {t('later.body')}
      </EmptyState>
    </AreaPage>
  )
}

/** A titled block of settings. */
export function Group({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn('grid gap-4 rounded-lg border border-line bg-s1 p-4 medium:p-5', className)}
    >
      <div className="grid gap-0.5">
        <h2 className="font-semibold text-text text-title">{title}</h2>
        {description && <p className="text-caption text-text-3">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** The save bar: sticks to the bottom while there are unsaved changes. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  const t = useT(messages)
  if (!dirty) return null
  return (
    <section
      aria-label={t('unsaved.label')}
      className="glass-bar sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line-strong px-4 py-3 shadow-3"
    >
      <span className="me-auto text-text-2 text-ui">{t('unsaved.body')}</span>
      <Button variant="ghost" onClick={onDiscard} disabled={saving}>
        {t('discard')}
      </Button>
      <Button variant="primary" onClick={onSave} loading={saving}>
        {t('save')}
      </Button>
    </section>
  )
}
