// SPDX-License-Identifier: AGPL-3.0-only
// A11 Curation (docs/product/curation.md): what the household sees first. Announcements, with how
// far each has reached, and the featured sections in their home-screen order. Each opens its
// composer, where a live client preview shows the draft on a TV, the web and a phone.
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  type IconName,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Progress,
  SortableList,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@highsea/ui-web'
import { type ReactNode, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { AnnouncementSummary, Placement, SectionSummary } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { audienceSummary, StatusBadge, scheduleSummary, useUsers } from './shared.tsx'

export const placementLabels: Record<Placement, string> = {
  banner: 'Banner',
  card: 'Home card',
  toast: 'Toast',
  modal: 'Dialog',
}

const severityIcon: Record<AnnouncementSummary['severity'], { icon: IconName; tone: string }> = {
  info: { icon: 'info', tone: 'text-info' },
  notice: { icon: 'announcement', tone: 'text-accent-text' },
  warning: { icon: 'warning', tone: 'text-warning' },
  critical: { icon: 'error', tone: 'text-danger' },
}

export const layoutLabels: Record<SectionSummary['layout'], string> = {
  hero: 'Hero',
  row: 'Row',
  spotlight: 'Spotlight',
}

export function sourceSummary(f: Pick<SectionSummary, 'source'>): string {
  if (f.source.kind === 'manual') return 'Picked by hand'
  const { rule, value } = f.source
  if (rule === 'recently-added') return `Recently added, last ${value.replace('d', ' days')}`
  if (rule === 'genre') return `Genre: ${value}`
  if (rule === 'collection') return `Collection: ${value.replace(/-/g, ' ')}`
  return `Saved filter: ${value}`
}

export function Curation({ tab = 'announcements' }: { tab?: 'announcements' | 'featured' }) {
  const [, navigate] = useLocation()
  return (
    <AdminPage
      title="Curation"
      description="What everyone sees first: your announcements, and the sections on every home screen."
      actions={
        <Button
          variant="primary"
          icon="add"
          onClick={() =>
            navigate(tab === 'featured' ? '/curation/featured/new' : '/curation/announcements/new')
          }
        >
          {tab === 'featured' ? 'New section' : 'New announcement'}
        </Button>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => navigate(v === 'featured' ? '/curation/featured' : '/curation')}
        variant="line"
      >
        <TabsList aria-label="Curation sections">
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="featured">Featured sections</TabsTrigger>
        </TabsList>
        <TabsContent value="announcements" className="pt-5">
          <Announcements />
        </TabsContent>
        <TabsContent value="featured" className="pt-5">
          <Sections />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- announcements

function Announcements() {
  const list = useQuery('curation:announcements', (c) => c.curation.announcements(), [
    'announcements.updated',
  ])
  const [, navigate] = useLocation()
  return (
    <Loadable query={list} what="the announcements">
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="announcement"
            title="No announcements yet"
            action={
              <Button variant="primary" onClick={() => navigate('/curation/announcements/new')}>
                Write one
              </Button>
            }
          >
            Tell everyone about movie night, a new remote address or a restart. Choose who sees it,
            where, and for how long.
          </EmptyState>
        ) : (
          <ul aria-label="Announcements" className="grid gap-3">
            {xs.map((a) => (
              <AnnouncementRow key={a.id} a={a} />
            ))}
          </ul>
        )
      }
    </Loadable>
  )
}

function AnnouncementRow({ a }: { a: AnnouncementSummary }) {
  const users = useUsers()
  const end = useAction((c, id: string) => c.curation.endAnnouncement(id))
  const remove = useAction((c, id: string) => c.curation.deleteAnnouncement(id))
  const [confirm, setConfirm] = useState(false)
  const s = severityIcon[a.severity]
  return (
    <li className="grid gap-3 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[minmax(0,1fr)_12rem_auto] medium:items-center">
      <div className="flex min-w-0 gap-3">
        <Icon name={s.icon} size={18} className={`mt-0.5 shrink-0 ${s.tone}`} />
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <a
              href={adminHref(`/curation/announcements/${a.id}`)}
              className="font-semibold text-text text-ui outline-none hover:underline focus-visible:ring-focus"
            >
              {a.title}
            </a>
            <StatusBadge status={a.status} />
            {a.acknowledgement === 'require' && <Badge tone="warning">Must acknowledge</Badge>}
          </p>
          <p className="text-caption text-text-3">
            {a.placements.map((p) => placementLabels[p]).join(', ')} ·{' '}
            {audienceSummary(a.audience, users.data)} · {scheduleSummary(a.schedule, a.status)}
          </p>
        </div>
      </div>
      <div className="grid gap-1">
        {a.status === 'draft' || a.status === 'scheduled' ? (
          <span className="text-caption text-text-3">Not shown yet</span>
        ) : (
          <>
            <span className="text-caption text-text-2">
              {a.acknowledgement === 'require' ? 'Acknowledged by' : 'Seen by'}{' '}
              <span className="font-mono text-figure">
                {a.seenBy} of {a.audienceSize}
              </span>
            </span>
            <Progress
              value={a.audienceSize ? (a.seenBy / a.audienceSize) * 100 : 0}
              tone="neutral"
              aria-label={`${a.title}: seen by ${a.seenBy} of ${a.audienceSize}`}
            />
          </>
        )}
      </div>
      <div className="flex gap-1 justify-self-end">
        <Button size="sm" icon="edit" asChild>
          <a href={adminHref(`/curation/announcements/${a.id}`)} aria-label={`Edit ${a.title}`}>
            Edit
          </a>
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="more"
              aria-label={`More for ${a.title}`}
            />
          </MenuTrigger>
          <MenuContent align="end">
            {(a.status === 'live' || a.status === 'scheduled') && (
              <MenuItem
                icon="close"
                onSelect={() =>
                  end.run(a.id).then(() =>
                    toast.success(`“${a.title}” ended`, {
                      description: 'It’s gone from every screen.',
                    }),
                  )
                }
              >
                End now
              </MenuItem>
            )}
            <MenuItem icon="delete" danger onSelect={() => setConfirm(true)}>
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${a.title}”?`}
        description="It leaves every screen, and the record of who saw it goes too. To keep the record, end it instead."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.run(a.id).then(() => toast({ title: `“${a.title}” deleted` }))}
      />
    </li>
  )
}

// ---------------------------------------------------------------- featured sections

function Sections() {
  const list = useQuery('curation:sections', (c) => c.curation.sections(), [
    'curation.updated',
    'movies.updated',
  ])
  const [, navigate] = useLocation()
  const reorder = useAction((c, ids: string[]) => c.curation.reorderSections(ids))
  // a dropped row stays where it landed while the server saves the order
  const [order, setOrder] = useState<string[] | null>(null)
  return (
    <Loadable query={list} what="the featured sections">
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="curation"
            title="No featured sections yet"
            action={
              <Button variant="primary" onClick={() => navigate('/curation/featured/new')}>
                Add a section
              </Button>
            }
          >
            Sections make up every home screen: a hero at the top, then rows and spotlights. Pick
            titles by hand, or let a rule keep them fresh.
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            <p className="text-caption text-text-3">
              In home-screen order. Continue watching always comes right after the hero.
            </p>
            <SortableList
              aria-label="Featured sections"
              items={order ? [...xs].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : xs}
              id={(f) => f.id}
              label={(f) => f.title}
              onChange={(next) => {
                const ids = next.map((f) => f.id)
                setOrder(ids)
                reorder.run(ids).finally(() => setOrder(null))
              }}
              className="gap-3"
              itemClassName="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border border-line bg-s1 p-4 expanded:grid-cols-[auto_minmax(0,1fr)_auto_auto] expanded:items-center"
            >
              {(f, handle) => <SectionRow f={f} handle={handle} />}
            </SortableList>
          </div>
        )
      }
    </Loadable>
  )
}

function SectionRow({ f, handle }: { f: SectionSummary; handle: ReactNode }) {
  const users = useUsers()
  const remove = useAction((c) => c.curation.deleteSection(f.id))
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      {handle}
      <div className="grid min-w-0 gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <a
            href={adminHref(`/curation/featured/${f.id}`)}
            className="font-semibold text-text text-ui outline-none hover:underline focus-visible:ring-focus"
          >
            {f.title}
          </a>
          {f.tagline && <span className="text-text-2 text-ui">{f.tagline}</span>}
          <Badge>{layoutLabels[f.layout]}</Badge>
          {f.status !== 'live' && <StatusBadge status={f.status} />}
        </p>
        <p className="text-caption text-text-3">
          {sourceSummary(f)} · <span className="font-mono text-figure">{f.itemCount}</span>{' '}
          {f.itemCount === 1 ? 'title' : 'titles'} · {audienceSummary(f.audience, users.data)}
        </p>
      </div>
      <ul
        aria-label={`${f.title}: titles`}
        className="col-start-2 flex gap-1.5 overflow-hidden expanded:col-start-auto"
      >
        {f.sample.map((m) => (
          <li key={m.id} className="w-9 shrink-0">
            <img
              src={m.poster}
              alt={m.title}
              className="aspect-poster w-full rounded-[4px] object-cover"
            />
          </li>
        ))}
      </ul>
      <div className="col-start-2 flex gap-1 justify-self-end expanded:col-start-auto">
        <Button size="sm" icon="edit" asChild>
          <a href={adminHref(`/curation/featured/${f.id}`)} aria-label={`Edit ${f.title}`}>
            Edit
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="delete"
          aria-label={`Delete ${f.title}`}
          onClick={() => setConfirm(true)}
        />
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete “${f.title}”?`}
        description="It leaves every home screen. The titles in it stay in the library."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.run().then(() => toast({ title: `“${f.title}” deleted` }))}
      />
    </>
  )
}
