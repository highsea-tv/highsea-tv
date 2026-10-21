'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A7 Activity (activity-downloads.md#activity), ported from the prototype with real data: the
// queue, live, with the states that need a person (stalled, import blocked) explained in the row
// and fixed from it; then history and the blocklist. What real data changes from the prototype:
// - queue actions take the queue row's id (a download), which outlives its torrent;
// - history comes a page at a time, with Show more under it, and failed downloads are an event;
// - history and the blocklist rows carry the movie's title; a blocklist entry whose movie has
//   left the library shows the release alone.
import type { BlocklistEntry, HistoryEvent, QueueItem } from '@highsea/api-contract'
import { bytes, duration, rate } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import type { HighseaClient } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Progress,
  RowActions,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  toast,
} from '@highsea/ui-web'
import { type ComponentProps, useRef, useState } from 'react'
import { activity as messages } from './activity-messages.ts'
import { type QueueFilter, queueFilters, torrentTone } from './downloads-status.ts'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage } from './shell.tsx'
import { useRelative } from './time.ts'

type Tab = 'queue' | 'history' | 'blocklist'
type Filter = QueueFilter

const historyIcon: Record<HistoryEvent['type'], ComponentProps<typeof Icon>['name']> = {
  grabbed: 'download',
  imported: 'check',
  'import-failed': 'error',
  'download-failed': 'error',
  deleted: 'delete',
  renamed: 'edit',
  blocklisted: 'lock',
  'subtitle-downloaded': 'subtitles',
  'subtitle-synced': 'subtitle-sync',
  'subtitle-upgraded': 'subtitles',
  'subtitle-deleted': 'delete',
  'subtitle-sync-failed': 'warning',
}

const QUEUE_LIVE = ['queue.updated', 'torrents.updated']
const HISTORY_LIVE = ['history.updated', 'movies.updated']

const loadQueue = (c: HighseaClient) => c.queue.list()
const loadBlocklist = (c: HighseaClient) => c.blocklist.list()

/** The first `pages` pages of history, following the cursor. */
async function loadHistory(c: HighseaClient, pages: number) {
  const items: HistoryEvent[] = []
  let cursor: string | undefined
  for (let i = 0; i < pages; i++) {
    const page = await c.history.list({ query: { cursor } })
    items.push(...page.items)
    cursor = page.next ?? undefined
    if (!cursor) break
  }
  return { items, more: Boolean(cursor) }
}

export function Activity() {
  const t = useT(messages)
  const [tab, setTab] = useState<Tab>('queue')
  const queue = useQuery('queue', loadQueue, QUEUE_LIVE)
  const blocklist = useQuery('blocklist', loadBlocklist, ['history.updated'])
  return (
    <AdminPage
      title={t('title')}
      description={t('description')}
      actions={
        <Button icon="import" asChild>
          <a href="/activity/import">{t('manualImport')}</a>
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label={t('sections')}>
          <TabsTrigger value="queue" count={queue.data?.length || undefined}>
            {t('tab.queue')}
          </TabsTrigger>
          <TabsTrigger value="history">{t('tab.history')}</TabsTrigger>
          <TabsTrigger value="blocklist" count={blocklist.data?.length || undefined}>
            {t('tab.blocklist')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="pt-5">
          <Queue />
        </TabsContent>
        <TabsContent value="history" className="pt-5">
          <ActivityHistory />
        </TabsContent>
        <TabsContent value="blocklist" className="pt-5">
          <Blocklist />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- queue

function Queue() {
  const t = useT(messages)
  const locale = useLocale()
  const queue = useQuery('queue', loadQueue, QUEUE_LIVE)
  const [filter, setFilter] = useState<Filter>('all')
  const [removing, setRemoving] = useState<QueueItem | null>(null)
  const pause = useAction((c, id: string) => c.queue.pause({ params: { id } }))
  const resume = useAction((c, id: string) => c.queue.resume({ params: { id } }))
  const remove = useAction((c, id: string) =>
    c.queue.remove({ params: { id }, body: { deleteData: true, blocklist: false } }),
  )
  const force = useAction((c, id: string) => c.queue.forceImport({ params: { id } }))
  const alternative = useAction((c, id: string) =>
    c.queue.searchAlternative({ params: { id }, body: {} }),
  )

  const fail = (what: string) => (e: Error) => toast.error(what, { description: e.message })

  return (
    <Loadable query={queue} what={t('queue.what')}>
      {(xs) => {
        if (xs.length === 0)
          return (
            <EmptyState icon="downloads" title={t('queue.empty')}>
              {t('queue.emptyBody')}
            </EmptyState>
          )
        const counts = Object.fromEntries(
          Object.entries(queueFilters).map(([k, f]) => [k, xs.filter((q) => f(q.state)).length]),
        )
        const shown = xs.filter((q) => queueFilters[filter](q.state))
        return (
          <TableFrame>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TableToolbar>
                <TabsList aria-label={t('queue.filter')} className="max-w-full overflow-x-auto">
                  <TabsTrigger value="all" count={counts.all}>
                    {t('filter.all')}
                  </TabsTrigger>
                  <TabsTrigger value="downloading" count={counts.downloading}>
                    {t('filter.downloading')}
                  </TabsTrigger>
                  <TabsTrigger value="seeding" count={counts.seeding}>
                    {t('filter.seeding')}
                  </TabsTrigger>
                  <TabsTrigger value="issues" count={counts.issues}>
                    {t('filter.issues')}
                  </TabsTrigger>
                </TabsList>
                <span className="ms-auto font-mono text-figure text-text-3">
                  {rate(xs.reduce((s, q) => s + q.downRate, 0))} ↓
                </span>
              </TableToolbar>
              <TabsContent value={filter}>
                {shown.length === 0 ? (
                  <p className="px-3.5 py-8 text-center text-caption text-text-3">
                    {t('queue.none')}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('col.movie')}</TableHead>
                        <TableHead>{t('col.quality')}</TableHead>
                        <TableHead numeric>{t('col.size')}</TableHead>
                        <TableHead>{t('col.progress')}</TableHead>
                        <TableHead numeric>{t('col.down')}</TableHead>
                        <TableHead numeric>{t('col.eta')}</TableHead>
                        <TableHead>{t('col.status')}</TableHead>
                        <TableHead>
                          <span className="sr-only">{t('col.actions')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((q) => {
                        const s = torrentTone[q.state]
                        const issue = queueFilters.issues(q.state)
                        const title = `${q.title}${q.year ? ` (${q.year})` : ''}`
                        return (
                          <TableRow key={q.id}>
                            <TitleCell
                              title={
                                q.movieId ? (
                                  <a href={moviePath(q.movieId)} className="hover:underline">
                                    {title}
                                  </a>
                                ) : (
                                  title
                                )
                              }
                              detail={q.release}
                            />
                            <TableCell className="text-text-2">{q.quality ?? '—'}</TableCell>
                            <TableCell numeric>{bytes(q.size)}</TableCell>
                            <TableCell className="w-40">
                              <Progress
                                value={q.progress * 100}
                                tone={s.bar}
                                showValue
                                aria-label={t('progressOf', { title: q.title })}
                              />
                            </TableCell>
                            <TableCell numeric>{q.downRate ? rate(q.downRate) : '—'}</TableCell>
                            <TableCell numeric>
                              {q.state === 'downloading' && q.eta ? duration(q.eta, locale) : '—'}
                            </TableCell>
                            <TableCell className={issue ? 'max-w-72 whitespace-normal' : undefined}>
                              <Badge tone={s.tone}>{t(`state.${q.state}`)}</Badge>
                              {issue && q.stateReason && (
                                <p className="mt-1 text-caption text-text-3">{q.stateReason}</p>
                              )}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex items-center justify-end gap-1">
                                {q.state === 'import-blocked' && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      alternative.run(q.id).then(
                                        () =>
                                          toast({
                                            title: t('done.another'),
                                            description: q.title,
                                          }),
                                        fail(t('fail.search')),
                                      )
                                    }
                                  >
                                    {t('findAnother')}
                                  </Button>
                                )}
                                {q.state === 'stalled' && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      alternative.run(q.id).then(
                                        () =>
                                          toast({
                                            title: t('done.replace'),
                                            description: t('done.replaceBody', {
                                              release: q.release,
                                            }),
                                          }),
                                        fail(t('fail.search')),
                                      )
                                    }
                                  >
                                    {t('replace')}
                                  </Button>
                                )}
                                <RowActions>
                                  {q.state === 'paused' ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      iconOnly
                                      icon="play"
                                      aria-label={t('resume', { title: q.title })}
                                      onClick={() => resume.run(q.id).catch(fail(t('fail.resume')))}
                                    />
                                  ) : q.state === 'downloading' ||
                                    q.state === 'queued' ||
                                    q.state === 'stalled' ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      iconOnly
                                      icon="pause"
                                      aria-label={t('pause', { title: q.title })}
                                      onClick={() => pause.run(q.id).catch(fail(t('fail.pause')))}
                                    />
                                  ) : null}
                                </RowActions>
                                <Menu>
                                  <MenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      iconOnly
                                      icon="more"
                                      aria-label={t('more', { title: q.title })}
                                    />
                                  </MenuTrigger>
                                  <MenuContent>
                                    {q.state === 'import-blocked' && (
                                      <MenuItem
                                        icon="check"
                                        onSelect={() =>
                                          force.run(q.id).then(
                                            () =>
                                              toast.success(t('done.forced'), {
                                                description: q.title,
                                              }),
                                            fail(t('fail.import')),
                                          )
                                        }
                                      >
                                        {t('forceImport')}
                                      </MenuItem>
                                    )}
                                    <MenuItem
                                      icon="lock"
                                      onSelect={() =>
                                        alternative.run(q.id).catch(fail(t('fail.search')))
                                      }
                                    >
                                      {t('blocklistAgain')}
                                    </MenuItem>
                                    <MenuItem icon="delete" danger onSelect={() => setRemoving(q)}>
                                      {t('remove')}
                                    </MenuItem>
                                  </MenuContent>
                                </Menu>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
                <ConfirmDialog
                  open={!!removing}
                  onOpenChange={(o) => !o && setRemoving(null)}
                  title={t('remove.title', { title: removing?.title ?? t('remove.this') })}
                  description={t('remove.body')}
                  confirmLabel={t('remove.confirm')}
                  destructive
                  onConfirm={() =>
                    removing &&
                    remove
                      .run(removing.id)
                      .then(() => toast({ title: t('done.removed') }), fail(t('fail.remove')))
                  }
                />
              </TabsContent>
            </Tabs>
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- history

function ActivityHistory() {
  const t = useT(messages)
  const [pages, setPages] = useState(1)
  const data = useQuery(`activity-history:${pages}`, (c) => loadHistory(c, pages), HISTORY_LIVE)
  // Show more keeps what's on screen while the longer list loads
  const last = useRef<Awaited<ReturnType<typeof loadHistory>>>(null)
  if (data.status === 'success') last.current = data.data
  const kept = data.status === 'loading' && pages > 1 ? last.current : null
  const shown = kept
    ? { status: 'success' as const, data: kept, error: undefined, refetch: data.refetch }
    : data
  return (
    <Loadable query={shown} what={t('history.what')}>
      {({ items, more }) =>
        items.length === 0 ? (
          <EmptyState icon="clock" title={t('history.empty')}>
            {t('history.emptyBody')}
          </EmptyState>
        ) : (
          <div className="grid gap-4">
            <TableFrame>
              <HistoryTable events={items} showTitle />
            </TableFrame>
            {more && (
              <Button
                className="justify-self-center"
                loading={Boolean(kept)}
                onClick={() => setPages(pages + 1)}
              >
                {t('history.more')}
              </Button>
            )}
          </div>
        )
      }
    </Loadable>
  )
}

/** The prototype's HistoryTable (movies/detail.tsx), with the movie's title when `showTitle`. */
function HistoryTable({ events, showTitle }: { events: HistoryEvent[]; showTitle?: boolean }) {
  const t = useT(messages)
  const { relative } = useRelative()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('col.event')}</TableHead>
          {showTitle && <TableHead>{t('col.movie')}</TableHead>}
          <TableHead>{t('col.release')}</TableHead>
          <TableHead>{t('col.source')}</TableHead>
          <TableHead numeric>{t('col.when')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id} title={e.message ?? undefined}>
            <TableCell>
              <span className="flex items-center gap-2 text-text">
                <Icon name={historyIcon[e.type]} size={14} className="text-text-3" />
                {t(`event.${e.type}`)}
              </span>
            </TableCell>
            {showTitle && (
              <TableCell>
                <a href={moviePath(e.movieId)} className="text-text hover:underline">
                  {e.title}
                </a>
              </TableCell>
            )}
            <TitleCell
              title={e.message ?? e.sourceTitle ?? '—'}
              detail={e.message ? e.sourceTitle : undefined}
            />
            <TableCell className="text-text-2">{e.indexer ?? '—'}</TableCell>
            <TableCell numeric>{relative(e.date)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ---------------------------------------------------------------- blocklist

function Blocklist() {
  const t = useT(messages)
  const { relative } = useRelative()
  const list = useQuery('blocklist', loadBlocklist, ['history.updated'])
  const remove = useAction((c, id: string) => c.blocklist.remove({ params: { id } }))
  const release = (b: BlocklistEntry) => {
    if (b.movieId === null || b.title === null) return b.sourceTitle
    return (
      <a href={moviePath(b.movieId)} className="hover:underline">
        {b.title}
      </a>
    )
  }
  return (
    <Loadable query={list} what={t('blocklist.what')}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState icon="shield" title={t('blocklist.empty')}>
            {t('blocklist.emptyBody')}
          </EmptyState>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('col.release')}</TableHead>
                  <TableHead>{t('col.indexer')}</TableHead>
                  <TableHead>{t('col.reason')}</TableHead>
                  <TableHead numeric>{t('col.when')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('col.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((b) => (
                  <TableRow key={b.id}>
                    <TitleCell
                      title={release(b)}
                      detail={b.movieId === null ? undefined : b.sourceTitle}
                    />
                    <TableCell className="text-text-2">{b.indexer ?? '—'}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal text-text-2">
                      {b.reason}
                    </TableCell>
                    <TableCell numeric>{relative(b.date)}</TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          remove.run(b.id).then(
                            () =>
                              toast({
                                title: t('done.unblocked'),
                                description: t('done.unblockedBody'),
                              }),
                            (e: Error) =>
                              toast.error(t('fail.unblock'), { description: e.message }),
                          )
                        }
                        aria-label={t('unblockOf', { release: b.sourceTitle })}
                      >
                        {t('unblock')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )
      }
    </Loadable>
  )
}
