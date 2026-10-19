// SPDX-License-Identifier: AGPL-3.0-only
// Settings (A12, A13 core; A15 reference: docs/product/settings.md). An index of every area in four
// groups; each area is its own page, `/settings/{area}`, with the areas beside it from expanded
// widths. Forms keep a draft and a save bar, so nothing changes until Save.
import { Button, cn, EmptyState, Icon, type IconName } from '@highsea/ui-web'
import { type ReactNode, useEffect, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { Settings as AllSettings, SettingsSection } from '../../mock/settings.ts'
import { AdminPage, adminHref } from '../shell.tsx'

export type Area = {
  id: string
  label: string
  icon: IconName
  description: string
  /** Areas with a page of their own elsewhere (Subtitles). */
  href?: string
}

export const areaGroups: { title: string; areas: Area[] }[] = [
  {
    title: 'Server',
    areas: [
      {
        id: 'general',
        label: 'General',
        icon: 'settings',
        description: 'Language, time zone, updates and logging.',
      },
      {
        id: 'appearance',
        label: 'Appearance',
        icon: 'curation',
        description: 'The server’s name and accent, themes, and sounds for every app.',
      },
      {
        id: 'network',
        label: 'Network and remote access',
        icon: 'network',
        description: 'The address apps use away from home, proxies, TLS and discovery.',
      },
      {
        id: 'security',
        label: 'Security',
        icon: 'shield',
        description: 'Two-step verification, passkeys and single sign-on.',
      },
      {
        id: 'backups',
        label: 'Backups',
        icon: 'storage',
        description: 'When highsea backs up its settings and database, and how many to keep.',
      },
    ],
  },
  {
    title: 'People',
    areas: [
      {
        id: 'users',
        label: 'Users and devices',
        icon: 'users',
        description: 'Who can sign in, what they can do, their devices, and API keys.',
      },
    ],
  },
  {
    title: 'Library',
    areas: [
      {
        id: 'media',
        label: 'Media management',
        icon: 'folder',
        description: 'File and folder names, hardlinks, NFO files and permissions.',
      },
      {
        id: 'profiles',
        label: 'Profiles and formats',
        icon: 'list',
        description: 'Quality profiles, custom formats and presets from the catalog.',
      },
      {
        id: 'quality',
        label: 'Quality sizes',
        icon: 'storage',
        description: 'How big a release can be for each quality.',
      },
      {
        id: 'lists',
        label: 'Import lists',
        icon: 'bookmark',
        description: 'Watchlists that add movies on their own.',
      },
    ],
  },
  {
    title: 'Downloads and alerts',
    areas: [
      {
        id: 'downloads',
        label: 'Download client',
        icon: 'downloads',
        description: 'The built-in torrent client: port, encryption and the VPN binding.',
      },
      {
        id: 'subtitles',
        label: 'Subtitles',
        icon: 'subtitles',
        description: 'Providers, languages and sync, on the Subtitles page.',
        href: '/subtitles',
      },
      {
        id: 'connections',
        label: 'Connections',
        icon: 'notification',
        description: 'Notifications to Discord, ntfy, email and more.',
      },
    ],
  },
]

export const areas = areaGroups.flatMap((g) => g.areas)

const areaHref = (a: Area) => adminHref(a.href ?? `/settings/${a.id}`)

/** `/settings`: every area, grouped, as cards that say what's inside. */
export function SettingsIndex() {
  return (
    <AdminPage title="Settings" description="How the server runs, who uses it, and how it looks.">
      <div className="grid gap-8">
        {areaGroups.map((g) => (
          <section key={g.title} aria-labelledby={`settings-${g.title}`} className="grid gap-3">
            <h2 id={`settings-${g.title}`} className="font-mono text-label text-text-3 uppercase">
              {g.title}
            </h2>
            <ul className="grid gap-3 medium:grid-cols-2 wide:grid-cols-3">
              {g.areas.map((a) => (
                <li key={a.id}>
                  <a
                    href={areaHref(a)}
                    className="grid h-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-line bg-s1 p-4 outline-none transition-tint hover:bg-s2 focus-visible:ring-focus"
                  >
                    <Icon name={a.icon} size={18} className="row-span-2 mt-0.5 text-accent-text" />
                    <span className="font-semibold text-text text-ui">{a.label}</span>
                    <span className="text-caption text-text-3">{a.description}</span>
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
function AreaNav({ current }: { current: string }) {
  return (
    <nav aria-label="Settings" className="hidden content-start gap-5 expanded:grid">
      {areaGroups.map((g) => (
        <div key={g.title} className="grid gap-1">
          <p className="px-2.5 font-mono text-label text-text-3 uppercase">{g.title}</p>
          <ul className="grid gap-0.5">
            {g.areas.map((a) => (
              <li key={a.id}>
                <a
                  href={areaHref(a)}
                  aria-current={a.id === current ? 'page' : undefined}
                  className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-text-2 text-ui outline-none hover:bg-text/6 hover:text-text focus-visible:ring-focus aria-[current=page]:bg-text/6 aria-[current=page]:text-text"
                >
                  {a.label}
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

/** An area's page: the page header, the nav beside it, and the area's content. */
export function AreaPage({
  id,
  actions,
  children,
}: {
  id: string
  actions?: ReactNode
  children: ReactNode
}) {
  const area = areas.find((a) => a.id === id)
  return (
    <AdminPage title={area?.label ?? 'Settings'} description={area?.description} actions={actions}>
      <div className="grid gap-6 expanded:grid-cols-[13rem_minmax(0,1fr)]">
        <AreaNav current={id} />
        <div className="grid min-w-0 content-start gap-6">
          <a
            href={adminHref('/settings')}
            className="flex items-center gap-1 justify-self-start rounded-sm text-text-2 text-ui outline-none hover:text-text focus-visible:ring-focus expanded:hidden"
          >
            <Icon name="chevron-left" size={16} />
            All settings
          </a>
          {children}
        </div>
      </div>
    </AdminPage>
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

/**
 * A settings section as a draft: edit freely, then Save or Discard from the bar that appears
 * once something changed.
 */
export function useSettingsDraft<K extends SettingsSection>(section: K) {
  // the async client drops the method's generic, so the section's type comes back by hand
  const query = useQuery(
    `settings:${section}`,
    (c) => c.settings.get(section) as Promise<AllSettings[K]>,
    ['settings.updated'],
  )
  const save = useAction((c, value: AllSettings[K]) => c.settings.save(section, value))
  const [draft, setDraft] = useState<AllSettings[K] | null>(null)
  useEffect(() => {
    if (query.status === 'success') setDraft((d) => d ?? query.data)
  }, [query.status, query.data])
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(query.data)
  return {
    query,
    draft,
    set: (patch: Partial<AllSettings[K]>) =>
      setDraft((d) => (d ? ({ ...d, ...patch } as AllSettings[K]) : d)),
    replace: (value: AllSettings[K]) => setDraft(value),
    dirty,
    save: () => (draft ? save.run(draft) : Promise.resolve(null)),
    saving: save.pending,
    discard: () => query.status === 'success' && setDraft(query.data),
  }
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
  if (!dirty) return null
  return (
    <section
      aria-label="Unsaved changes"
      className="glass-bar sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line-strong px-4 py-3 shadow-3"
    >
      <span className="me-auto text-text-2 text-ui">You have unsaved changes.</span>
      <Button variant="ghost" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button variant="primary" onClick={onSave} loading={saving}>
        Save
      </Button>
    </section>
  )
}

/** `/settings/{area}`: the area's page, or a not-found inside the settings frame. */
export function SettingsArea({ pages }: { pages: Record<string, () => ReactNode> }) {
  const { area } = useParams<{ area: string }>()
  const [, navigate] = useLocation()
  const Page = pages[area]
  if (Page) return <Page />
  return (
    <AreaPage id={area}>
      <EmptyState
        icon="settings"
        title="There’s no setting here"
        action={<Button onClick={() => navigate('/settings')}>All settings</Button>}
      >
        It may have moved. Settings lists every area.
      </EmptyState>
    </AreaPage>
  )
}
