// SPDX-License-Identifier: AGPL-3.0-only
// A7 Activity (docs/product/activity-downloads.md#activity): the queue, live, with the states that
// need a person (stalled, import blocked) explained in the row and fixed from it; then history and
// the blocklist. Members see the queue and history, but can't change them.
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
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
import { useState } from 'react'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { QueueItem } from '../../mock/types.ts'
import { bytes, duration, rate, relative } from '../format.ts'
import { Loadable } from '../loadable.tsx'
import { HistoryTable } from '../movies/detail.tsx'
import { isStaff } from '../nav.ts'
import { AdminPage, adminHref, useShell } from '../shell.tsx'
import { queueFilters, torrentStatus } from '../status.ts'

type Tab = 'queue' | 'history' | 'blocklist'

export function Activity() {
  const [tab, setTab] = useState<Tab>('queue')
  const queue = useQuery('queue', (c) => c.queue.list(), ['queue.changed', 'torrents.updated'])
  const blocklist = useQuery('blocklist', (c) => c.blocklist.list(), ['history.updated'])
  const staff = isStaff(useShell().role)
  return (
    <AdminPage
      title="Activity"
      description="What’s downloading for the library, what happened, and the releases highsea won’t grab again."
      actions={
        staff && (
          <Button icon="import" asChild>
            <a href={adminHref('/activity/import')}>Manual import</a>
          </Button>
        )
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label="Activity sections">
          <TabsTrigger value="queue" count={queue.data?.length || undefined}>
            Queue
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="blocklist" count={blocklist.data?.length || undefined}>
            Blocklist
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
  const { role } = useShell()
  const staff = isStaff(role)
  const queue = useQuery('queue', (c) => c.queue.list(), ['queue.changed', 'torrents.updated'])
  const [filter, setFilter] = useState<keyof typeof queueFilters>('all')
  const [removing, setRemoving] = useState<QueueItem | null>(null)
  const pause = useAction((c, id: string) => c.queue.pause(id))
  const resume = useAction((c, id: string) => c.queue.resume(id))
  const remove = useAction((c, id: string) => c.queue.remove(id, true))
  const force = useAction((c, id: string) => c.queue.forceImport(id))
  const alternative = useAction((c, id: string) => c.queue.searchAlternative(id))

  const fail = (what: string) => (e: Error) => toast.error(what, { description: e.message })

  return (
    <Loadable query={queue} what="the queue">
      {(xs) => {
        if (xs.length === 0)
          return (
            <EmptyState icon="downloads" title="The queue is empty">
              Movies show here while they download and import, then move to History.
            </EmptyState>
          )
        const counts = Object.fromEntries(
          Object.entries(queueFilters).map(([k, f]) => [k, xs.filter((q) => f(q.state)).length]),
        )
        const shown = xs.filter((q) => queueFilters[filter](q.state))
        return (
          <TableFrame>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TableToolbar>
                <TabsList aria-label="Filter the queue" className="max-w-full overflow-x-auto">
                  <TabsTrigger value="all" count={counts.all}>
                    All
                  </TabsTrigger>
                  <TabsTrigger value="downloading" count={counts.downloading}>
                    Downloading
                  </TabsTrigger>
                  <TabsTrigger value="seeding" count={counts.seeding}>
                    Importing and seeding
                  </TabsTrigger>
                  <TabsTrigger value="issues" count={counts.issues}>
                    Needs attention
                  </TabsTrigger>
                </TabsList>
                <span className="ms-auto font-mono text-figure text-text-3">
                  {rate(xs.reduce((s, q) => s + q.downRate, 0))} ↓
                </span>
              </TableToolbar>
              <TabsContent value={filter}>
                {shown.length === 0 ? (
                  <p className="px-3.5 py-8 text-center text-caption text-text-3">
                    Nothing here right now.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Movie</TableHead>
                        <TableHead>Quality</TableHead>
                        <TableHead numeric>Size</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead numeric>↓</TableHead>
                        <TableHead numeric>ETA</TableHead>
                        <TableHead>Status</TableHead>
                        {staff && (
                          <TableHead>
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shown.map((q) => {
                        const s = torrentStatus[q.state]
                        const issue = queueFilters.issues(q.state)
                        return (
                          <TableRow key={q.id}>
                            <TitleCell
                              title={
                                q.itemId ? (
                                  <a
                                    href={adminHref(`/movies/${q.itemId}`)}
                                    className="hover:underline"
                                  >
                                    {q.title}
                                    {q.year ? ` (${q.year})` : ''}
                                  </a>
                                ) : (
                                  q.title
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
                                aria-label={`${q.title} progress`}
                              />
                            </TableCell>
                            <TableCell numeric>{q.downRate ? rate(q.downRate) : '—'}</TableCell>
                            <TableCell numeric>
                              {q.state === 'downloading' && q.eta ? duration(q.eta) : '—'}
                            </TableCell>
                            <TableCell className={issue ? 'max-w-72 whitespace-normal' : undefined}>
                              <Badge tone={s.tone}>{s.label}</Badge>
                              {issue && q.stateReason && (
                                <p className="mt-1 text-caption text-text-3">{q.stateReason}</p>
                              )}
                            </TableCell>
                            {staff && (
                              <TableCell className="text-end">
                                <div className="flex items-center justify-end gap-1">
                                  {q.state === 'import-blocked' && (
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        alternative.run(q.torrentId).then(
                                          () =>
                                            toast({
                                              title: 'Blocklisted. Searching for another release',
                                              description: q.title,
                                            }),
                                          fail('Couldn’t search'),
                                        )
                                      }
                                    >
                                      Find another
                                    </Button>
                                  )}
                                  {q.state === 'stalled' && (
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        alternative.run(q.torrentId).then(
                                          () =>
                                            toast({
                                              title: 'Searching for a release with seeds',
                                              description: `${q.release} is blocklisted.`,
                                            }),
                                          fail('Couldn’t search'),
                                        )
                                      }
                                    >
                                      Replace
                                    </Button>
                                  )}
                                  <RowActions>
                                    {q.state === 'paused' ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        iconOnly
                                        icon="play"
                                        aria-label={`Resume ${q.title}`}
                                        onClick={() =>
                                          resume.run(q.torrentId).catch(fail('Couldn’t resume'))
                                        }
                                      />
                                    ) : q.state === 'downloading' ||
                                      q.state === 'queued' ||
                                      q.state === 'stalled' ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        iconOnly
                                        icon="pause"
                                        aria-label={`Pause ${q.title}`}
                                        onClick={() =>
                                          pause.run(q.torrentId).catch(fail('Couldn’t pause'))
                                        }
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
                                        aria-label={`More for ${q.title}`}
                                      />
                                    </MenuTrigger>
                                    <MenuContent>
                                      {q.state === 'import-blocked' && (
                                        <MenuItem
                                          icon="check"
                                          onSelect={() =>
                                            force.run(q.torrentId).then(
                                              () =>
                                                toast.success('Imported without the blocked file', {
                                                  description: q.title,
                                                }),
                                              fail('Couldn’t import'),
                                            )
                                          }
                                        >
                                          Import without the blocked file
                                        </MenuItem>
                                      )}
                                      <MenuItem
                                        icon="lock"
                                        onSelect={() =>
                                          alternative
                                            .run(q.torrentId)
                                            .catch(fail('Couldn’t search'))
                                        }
                                      >
                                        Blocklist and search again
                                      </MenuItem>
                                      <MenuItem
                                        icon="delete"
                                        danger
                                        onSelect={() => setRemoving(q)}
                                      >
                                        Remove from queue
                                      </MenuItem>
                                    </MenuContent>
                                  </Menu>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
                <ConfirmDialog
                  open={!!removing}
                  onOpenChange={(o) => !o && setRemoving(null)}
                  title={`Remove ${removing?.title ?? 'this download'}?`}
                  description="The download stops and its data is deleted. The movie stays in the library, still monitored."
                  confirmLabel="Remove"
                  destructive
                  onConfirm={() =>
                    removing &&
                    remove
                      .run(removing.torrentId)
                      .then(
                        () => toast({ title: 'Removed from the queue' }),
                        fail('Couldn’t remove it'),
                      )
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
  const data = useQuery(
    'activity-history',
    async (c) => {
      const [events, movies] = await Promise.all([c.history.list(), c.movies.list()])
      return { events, titles: Object.fromEntries(movies.map((m) => [m.id, m.title])) }
    },
    ['history.updated'],
  )
  return (
    <Loadable query={data} what="the history">
      {({ events, titles }) =>
        events.length === 0 ? (
          <EmptyState icon="clock" title="No history yet">
            Every grab, import, rename and subtitle download is recorded here.
          </EmptyState>
        ) : (
          <TableFrame>
            <HistoryTable events={events} titles={titles} showTitle />
          </TableFrame>
        )
      }
    </Loadable>
  )
}

// ---------------------------------------------------------------- blocklist

function Blocklist() {
  const { role } = useShell()
  const now = useNow()
  const list = useQuery('blocklist', (c) => c.blocklist.list(), ['history.updated'])
  const movies = useQuery('movies', (c) => c.movies.list(), ['movies.updated'])
  const title = (id: string) => movies.data?.find((m) => m.id === id)?.title ?? id
  const remove = useAction((c, id: string) => c.blocklist.remove(id))
  return (
    <Loadable query={list} what="the blocklist">
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState icon="shield" title="Nothing is blocklisted">
            Releases that fail, stall or carry something unsafe land here, so they’re never grabbed
            again.
          </EmptyState>
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Release</TableHead>
                  <TableHead>Indexer</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead numeric>When</TableHead>
                  {isStaff(role) && (
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((b) => (
                  <TableRow key={b.id}>
                    <TitleCell
                      title={
                        <a href={adminHref(`/movies/${b.itemId}`)} className="hover:underline">
                          {title(b.itemId)}
                        </a>
                      }
                      detail={b.sourceTitle}
                    />
                    <TableCell className="text-text-2">{b.indexer}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal text-text-2">
                      {b.reason}
                    </TableCell>
                    <TableCell numeric>{relative(b.date, now)}</TableCell>
                    {isStaff(role) && (
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            remove.run(b.id).then(() =>
                              toast({
                                title: 'Removed from the blocklist',
                                description: 'highsea may grab that release again.',
                              }),
                            )
                          }
                          aria-label={`Unblock ${b.sourceTitle}`}
                        >
                          Unblock
                        </Button>
                      </TableCell>
                    )}
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
