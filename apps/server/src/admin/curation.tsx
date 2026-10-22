'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A11 Curation (curation.md; checkpoint 8c, ADR 0048), ported from the prototype's
// curation/curation.tsx: what the household sees first. Announcements, with how far each has
// reached, and the featured sections in their home-screen order. Each opens its composer, where
// the client preview shows the draft on a TV, the web and a phone. A collection rule's summary
// names the collection from the rule options, since the source keeps its TMDB id.
import {
  type AnnouncementSummary,
  COLLECTION_TOPICS,
  CURATION_TOPICS,
  type Placement,
  type SectionSummary,
} from '@highsea-tv/api-contract'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
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
} from '@highsea-tv/ui-web'
import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import {
  StatusBadge,
  useAudienceSummary,
  useCurationT,
  usePeople,
  useScheduleSummary,
  useSourceSummary,
} from './curation-shared.tsx'
import { Loadable } from './loadable.tsx'
import { AdminPage } from './shell.tsx'

const severityIcon: Record<AnnouncementSummary['severity'], { icon: IconName; tone: string }> = {
  info: { icon: 'info', tone: 'text-info' },
  notice: { icon: 'announcement', tone: 'text-accent-text' },
  warning: { icon: 'warning', tone: 'text-warning' },
  critical: { icon: 'error', tone: 'text-danger' },
}

/** The admin's lists: their own changes, and a schedule's start or end. */
export const LIST_TOPICS = [CURATION_TOPICS.curation]

export const announcementPath = (id: string) => `/curation/announcements/${id}`
export const sectionPath = (id: string) => `/curation/featured/${id}`

export const useRuleOptions = () =>
  useQuery('curation:rule-options', (c) => c.curation.ruleOptions(), [
    'movies.updated',
    COLLECTION_TOPICS.collections,
  ])

export function Curation({ tab = 'announcements' }: { tab?: 'announcements' | 'featured' }) {
  const t = useCurationT()
  const router = useRouter()
  return (
    <AdminPage
      title={t('title')}
      description={t('description')}
      actions={
        <Button
          variant="primary"
          icon="add"
          onClick={() =>
            router.push(tab === 'featured' ? sectionPath('new') : announcementPath('new'))
          }
        >
          {tab === 'featured' ? t('newSection') : t('newAnnouncement')}
        </Button>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => router.push(v === 'featured' ? '/curation/featured' : '/curation')}
        variant="line"
      >
        <TabsList aria-label={t('sections')}>
          <TabsTrigger value="announcements">{t('tab.announcements')}</TabsTrigger>
          <TabsTrigger value="featured">{t('tab.featured')}</TabsTrigger>
        </TabsList>
        <TabsContent value="announcements" className="pt-5">
          {tab === 'announcements' && <Announcements />}
        </TabsContent>
        <TabsContent value="featured" className="pt-5">
          {tab === 'featured' && <Sections />}
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- announcements

function Announcements() {
  const t = useCurationT()
  const router = useRouter()
  const list = useQuery('curation:announcements', (c) => c.curation.announcements(), [
    ...LIST_TOPICS,
    'users.updated',
  ])
  return (
    <Loadable query={list} what={t('announcements.what')}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="announcement"
            title={t('announcements.none')}
            action={
              <Button variant="primary" onClick={() => router.push(announcementPath('new'))}>
                {t('announcements.write')}
              </Button>
            }
          >
            {t('announcements.noneBody')}
          </EmptyState>
        ) : (
          <ul aria-label={t('announcements.label')} className="grid gap-3">
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
  const t = useCurationT()
  const people = usePeople()
  const audience = useAudienceSummary()
  const schedule = useScheduleSummary()
  const end = useAction((c) => c.curation.endAnnouncement({ params: { id: a.id } }))
  const remove = useAction((c) => c.curation.removeAnnouncement({ params: { id: a.id } }))
  const [confirm, setConfirm] = useState(false)
  const s = severityIcon[a.severity]
  const failed = (e: Error) => toast.error(t('failed'), { description: e.message })
  return (
    <li className="grid gap-3 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[minmax(0,1fr)_12rem_auto] medium:items-center">
      <div className="flex min-w-0 gap-3">
        <Icon name={s.icon} size={18} className={`mt-0.5 shrink-0 ${s.tone}`} />
        <div className="grid min-w-0 gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <a
              href={announcementPath(a.id)}
              className="font-semibold text-text text-ui outline-none hover:underline focus-visible:ring-focus"
            >
              {a.title}
            </a>
            <StatusBadge status={a.status} />
            {a.acknowledgement === 'require' && (
              <Badge tone="warning">{t('mustAcknowledge')}</Badge>
            )}
          </p>
          <p className="text-caption text-text-3">
            {a.placements.map((p: Placement) => t(`placement.${p}`)).join(', ')} ·{' '}
            {audience(a.audience, people.data)} · {schedule(a.schedule, a.status)}
          </p>
        </div>
      </div>
      <div className="grid gap-1">
        {a.status === 'draft' || a.status === 'scheduled' ? (
          <span className="text-caption text-text-3">{t('notShown')}</span>
        ) : (
          <>
            <span className="text-caption text-text-2">
              {a.acknowledgement === 'require' ? t('acknowledgedBy') : t('seenBy')}{' '}
              <span className="font-mono text-figure">
                {t('ofAudience', { seen: a.seenBy, size: a.audienceSize })}
              </span>
            </span>
            <Progress
              value={a.audienceSize ? (a.seenBy / a.audienceSize) * 100 : 0}
              tone="neutral"
              aria-label={t('seenLabel', { title: a.title, seen: a.seenBy, size: a.audienceSize })}
            />
          </>
        )}
      </div>
      <div className="flex gap-1 justify-self-end">
        <Button size="sm" icon="edit" asChild>
          <a href={announcementPath(a.id)} aria-label={t('editNamed', { title: a.title })}>
            {t('edit')}
          </a>
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="more"
              aria-label={t('moreFor', { title: a.title })}
            />
          </MenuTrigger>
          <MenuContent align="end">
            {(a.status === 'live' || a.status === 'scheduled') && (
              <MenuItem
                icon="close"
                onSelect={() =>
                  end
                    .run()
                    .then(() =>
                      toast.success(t('ended', { title: a.title }), {
                        description: t('endedBody'),
                      }),
                    )
                    .catch(failed)
                }
              >
                {t('endNow')}
              </MenuItem>
            )}
            <MenuItem icon="delete" danger onSelect={() => setConfirm(true)}>
              {t('delete')}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('deleteTitle', { title: a.title })}
        description={t('deleteAnnouncementBody')}
        confirmLabel={t('delete')}
        destructive
        onConfirm={() =>
          remove
            .run()
            .then(() => toast({ title: t('deleted', { title: a.title }) }))
            .catch(failed)
        }
      />
    </li>
  )
}

// ---------------------------------------------------------------- featured sections

function Sections() {
  const t = useCurationT()
  const router = useRouter()
  const list = useQuery('curation:sections', (c) => c.curation.sections(), [
    ...LIST_TOPICS,
    'movies.updated',
  ])
  const reorder = useAction((c, ids: string[]) => c.curation.orderSections({ body: { ids } }))
  // a dropped row stays where it landed while the server saves the order
  const [order, setOrder] = useState<string[] | null>(null)
  return (
    <Loadable query={list} what={t('featured.what')}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            icon="curation"
            title={t('featured.none')}
            action={
              <Button variant="primary" onClick={() => router.push(sectionPath('new'))}>
                {t('featured.add')}
              </Button>
            }
          >
            {t('featured.noneBody')}
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            <p className="text-caption text-text-3">{t('featured.order')}</p>
            <SortableList
              aria-label={t('featured.label')}
              items={order ? [...xs].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : xs}
              id={(f) => f.id}
              label={(f) => f.title}
              onChange={(next) => {
                const ids = next.map((f) => f.id)
                setOrder(ids)
                reorder
                  .run(ids)
                  .catch((e: Error) => toast.error(t('failed'), { description: e.message }))
                  .finally(() => setOrder(null))
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
  const t = useCurationT()
  const people = usePeople()
  const options = useRuleOptions()
  const audience = useAudienceSummary()
  const source = useSourceSummary()
  const remove = useAction((c) => c.curation.removeSection({ params: { id: f.id } }))
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      {handle}
      <div className="grid min-w-0 gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <a
            href={sectionPath(f.id)}
            className="font-semibold text-text text-ui outline-none hover:underline focus-visible:ring-focus"
          >
            {f.title}
          </a>
          {f.tagline && <span className="text-text-2 text-ui">{f.tagline}</span>}
          <Badge>{t(`layout.${f.layout}`)}</Badge>
          {f.status !== 'live' && <StatusBadge status={f.status} />}
        </p>
        <p className="text-caption text-text-3">
          {source(f.source, [...(options.data?.smart ?? []), ...(options.data?.collections ?? [])])}{' '}
          ·{' '}
          <span className="font-mono text-figure">
            {t('featured.count', { count: f.itemCount })}
          </span>{' '}
          · {audience(f.audience, people.data)}
        </p>
      </div>
      <ul
        aria-label={t('featured.titles', { title: f.title })}
        className="col-start-2 flex gap-1.5 overflow-hidden expanded:col-start-auto"
      >
        {f.sample.map((m) => (
          <li key={m.id} className="w-9 shrink-0">
            {m.poster ? (
              // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
              <img
                src={m.poster}
                alt={m.title}
                className="aspect-poster w-full rounded-[4px] object-cover"
              />
            ) : (
              <span
                role="img"
                aria-label={m.title}
                className="block aspect-poster w-full rounded-[4px] bg-s2"
              />
            )}
          </li>
        ))}
      </ul>
      <div className="col-start-2 flex gap-1 justify-self-end expanded:col-start-auto">
        <Button size="sm" icon="edit" asChild>
          <a href={sectionPath(f.id)} aria-label={t('editNamed', { title: f.title })}>
            {t('edit')}
          </a>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          icon="delete"
          aria-label={t('deleteNamed', { title: f.title })}
          onClick={() => setConfirm(true)}
        />
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('deleteTitle', { title: f.title })}
        description={t('deleteSectionBody')}
        confirmLabel={t('delete')}
        destructive
        onConfirm={() =>
          remove
            .run()
            .then(() => toast({ title: t('deleted', { title: f.title }) }))
            .catch((e: Error) => toast.error(t('failed'), { description: e.message }))
        }
      />
    </>
  )
}
