'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A7 Activity (activity-downloads.md#activity), ported from the prototype with real data: the
// queue, live, with the states that need a person (stalled, import blocked) explained in the row
// and fixed from it; then history and the blocklist. What real data changes from the prototype:
// - queue actions take the queue row's id (a download), which outlives its torrent;
// - history comes a page at a time, with Show more under it, and failed downloads are an event;
// - history and the blocklist rows carry the movie's title; a blocklist entry whose movie has
//   left the library shows the release alone.
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).
import type { BlocklistEntry, HistoryEvent, QueueItem } from '@highsea-tv/api-contract'
import { bytes, duration, rate } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { HighseaClient } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  type IconName,
  type MenuOption,
  ProgressBar,
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
  Text,
  TitleCell,
  TitleLink,
  toast,
  tokens,
} from '@highsea-tv/ui/native'
import { useRef, useState } from 'react'
import { View } from 'react-native'
import { activity as messages } from './activity-messages.ts'
import { type QueueFilter, queueFilters, torrentTone } from './downloads-status.ts'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage } from './shell.tsx'
import { Muted, NoneShown, RowMenu, ToolbarFigure } from './table-parts.tsx'
import { useTabAddress } from './tabs.ts'
import { useRelative } from './time.ts'

export type ActivityTab = 'queue' | 'history' | 'blocklist'
type Tab = ActivityTab
type Filter = QueueFilter

const s = tokens.space
const ui = tokens.adminText.ui

const historyIcon: Record<HistoryEvent['type'], IconName> = {
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

export function Activity({ tab = 'queue' }: { tab?: Tab }) {
  const t = useT(messages)
  const setTab = useTabAddress<Tab>('/activity', 'queue')
  const queue = useQuery('queue', loadQueue, QUEUE_LIVE)
  const blocklist = useQuery('blocklist', loadBlocklist, ['history.updated'])
  const options = [
    { value: 'queue' as const, label: t('tab.queue'), count: queue.data?.length || undefined },
    { value: 'history' as const, label: t('tab.history') },
    {
      value: 'blocklist' as const,
      label: t('tab.blocklist'),
      count: blocklist.data?.length || undefined,
    },
  ]
  return (
    <AdminPage
      title={t('title')}
      description={t('description')}
      actions={
        <Button icon="import" href="/activity/import">
          {t('manualImport')}
        </Button>
      }
    >
      <Tabs<Tab>
        variant="line"
        aria-label={t('sections')}
        value={tab}
        onValueChange={setTab}
        options={options}
      />
      <View role="tabpanel" aria-label={t(`tab.${tab}`)} style={{ paddingTop: s['5'] }}>
        {tab === 'queue' ? <Queue /> : tab === 'history' ? <ActivityHistory /> : <Blocklist />}
      </View>
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
        ) as Record<Filter, number>
        const shown = xs.filter((q) => queueFilters[filter](q.state))
        return (
          <TableFrame>
            <TableToolbar>
              <Tabs<Filter>
                aria-label={t('queue.filter')}
                value={filter}
                onValueChange={setFilter}
                options={(['all', 'downloading', 'seeding', 'issues'] as const).map((k) => ({
                  value: k,
                  label: t(`filter.${k}`),
                  count: counts[k],
                }))}
              />
              <ToolbarFigure>{`${rate(xs.reduce((n, q) => n + q.downRate, 0))} ↓`}</ToolbarFigure>
            </TableToolbar>
            <View role="tabpanel" aria-label={t(`filter.${filter}`)}>
              {shown.length === 0 ? (
                <NoneShown>{t('queue.none')}</NoneShown>
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
                      <TableHead hidden>{t('col.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((q) => {
                      const tone = torrentTone[q.state]
                      const issue = queueFilters.issues(q.state)
                      const title = `${q.title}${q.year ? ` (${q.year})` : ''}`
                      const more: MenuOption[] = [
                        ...(q.state === 'import-blocked'
                          ? [
                              {
                                label: t('forceImport'),
                                icon: 'check' as const,
                                onSelect: () =>
                                  force
                                    .run(q.id)
                                    .then(
                                      () =>
                                        toast.success(t('done.forced'), { description: q.title }),
                                      fail(t('fail.import')),
                                    ),
                              },
                            ]
                          : []),
                        {
                          label: t('blocklistAgain'),
                          icon: 'lock',
                          onSelect: () => alternative.run(q.id).catch(fail(t('fail.search'))),
                        },
                        { label: t('remove'), icon: 'delete', onSelect: () => setRemoving(q) },
                      ]
                      return (
                        <TableRow key={q.id}>
                          <TableCell tall>
                            <TitleCell
                              title={
                                q.movieId ? (
                                  <TitleLink href={moviePath(q.movieId)}>{title}</TitleLink>
                                ) : (
                                  title
                                )
                              }
                              detail={q.release}
                            />
                          </TableCell>
                          <TableCell>
                            <Text size={ui.size} leading={ui.leading} color="text-2">
                              {q.quality ?? '—'}
                            </Text>
                          </TableCell>
                          <TableCell numeric>{bytes(q.size)}</TableCell>
                          <TableCell>
                            <View style={{ width: PROGRESS_WIDTH }}>
                              <ProgressBar
                                look="panel"
                                value={q.progress * 100}
                                tone={tone.bar}
                                showValue
                                label={t('progressOf', { title: q.title })}
                              />
                            </View>
                          </TableCell>
                          <TableCell numeric>{q.downRate ? rate(q.downRate) : '—'}</TableCell>
                          <TableCell numeric>
                            {q.state === 'downloading' && q.eta ? duration(q.eta, locale) : '—'}
                          </TableCell>
                          <TableCell maxWidth={issue ? REASON_WIDTH : undefined}>
                            <View style={{ gap: s['1'], alignItems: 'flex-start', minWidth: 0 }}>
                              <Badge tone={tone.tone}>{t(`state.${q.state}`)}</Badge>
                              {issue && q.stateReason ? (
                                <Text variant="caption" color="text-3">
                                  {q.stateReason}
                                </Text>
                              ) : null}
                            </View>
                          </TableCell>
                          <TableCell align="end">
                            <View
                              style={{ flexDirection: 'row', alignItems: 'center', gap: s['1'] }}
                            >
                              {q.state === 'import-blocked' && (
                                <Button
                                  size="sm"
                                  onPress={() =>
                                    alternative
                                      .run(q.id)
                                      .then(
                                        () =>
                                          toast({ title: t('done.another'), description: q.title }),
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
                                  onPress={() =>
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
                                    accessibilityLabel={t('resume', { title: q.title })}
                                    onPress={() => resume.run(q.id).catch(fail(t('fail.resume')))}
                                  />
                                ) : q.state === 'downloading' ||
                                  q.state === 'queued' ||
                                  q.state === 'stalled' ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    iconOnly
                                    icon="pause"
                                    accessibilityLabel={t('pause', { title: q.title })}
                                    onPress={() => pause.run(q.id).catch(fail(t('fail.pause')))}
                                  />
                                ) : null}
                              </RowActions>
                              <RowMenu label={t('more', { title: q.title })} items={more} />
                            </View>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </View>
            <ConfirmDialog
              open={!!removing}
              onClose={() => setRemoving(null)}
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
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

/** A progress column's width (the web's w-40). */
const PROGRESS_WIDTH = 160
/** A cell that wraps its reason (the web's max-w-72). */
const REASON_WIDTH = 288
/** The blocklist's reason (the web's max-w-80). */
const BLOCK_REASON_WIDTH = 320

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
    ? {
        status: 'success' as const,
        data: kept,
        error: undefined,
        refetch: data.refetch,
        refresh: data.refresh,
      }
    : data
  return (
    <Loadable query={shown} what={t('history.what')}>
      {({ items, more }) =>
        items.length === 0 ? (
          <EmptyState icon="clock" title={t('history.empty')}>
            {t('history.emptyBody')}
          </EmptyState>
        ) : (
          <View style={{ gap: s['4'] }}>
            <TableFrame>
              <HistoryTable events={items} showTitle />
            </TableFrame>
            {more && (
              <View style={{ alignItems: 'center' }}>
                <Button loading={Boolean(kept)} onPress={() => setPages(pages + 1)}>
                  {t('history.more')}
                </Button>
              </View>
            )}
          </View>
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
          <TableRow key={e.id}>
            <TableCell>
              <Icon name={historyIcon[e.type]} size={14} color="text-3" />
              <Text size={ui.size} leading={ui.leading} numberOfLines={1}>
                {t(`event.${e.type}`)}
              </Text>
            </TableCell>
            {showTitle && (
              <TableCell>
                <TitleLink href={moviePath(e.movieId)}>{e.title}</TitleLink>
              </TableCell>
            )}
            <TableCell tall={Boolean(e.message && e.sourceTitle)}>
              <TitleCell
                title={e.message ?? e.sourceTitle ?? '—'}
                detail={e.message ? (e.sourceTitle ?? undefined) : undefined}
              />
            </TableCell>
            <TableCell>
              <Muted>{e.indexer ?? '—'}</Muted>
            </TableCell>
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
  const release = (b: BlocklistEntry) =>
    b.movieId === null || b.title === null ? (
      b.sourceTitle
    ) : (
      <TitleLink href={moviePath(b.movieId)}>{b.title}</TitleLink>
    )
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
                  <TableHead hidden>{t('col.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell tall={b.movieId !== null}>
                      <TitleCell
                        title={release(b)}
                        detail={b.movieId === null ? undefined : b.sourceTitle}
                      />
                    </TableCell>
                    <TableCell>
                      <Muted>{b.indexer ?? '—'}</Muted>
                    </TableCell>
                    <TableCell maxWidth={BLOCK_REASON_WIDTH}>
                      <Text size={ui.size} leading={ui.leading} color="text-2">
                        {b.reason}
                      </Text>
                    </TableCell>
                    <TableCell numeric>{relative(b.date)}</TableCell>
                    <TableCell align="end">
                      <Button
                        size="sm"
                        variant="ghost"
                        accessibilityLabel={t('unblockOf', { release: b.sourceTitle })}
                        onPress={() =>
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
