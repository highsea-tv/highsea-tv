// SPDX-License-Identifier: AGPL-3.0-only
// The widget registry's client half: one renderer per widget kind. Each fetches its own data,
// updates live from server events, and shows its own loading, empty and error states. Each one
// fills the size it's given: lists show the rows that fit and say how many more there are, graphs
// and calendars stretch. The definitions (title, sizes, roles) are the server's:
// src/mock/widgets.ts.

import {
  bytes,
  bytesParts,
  duration,
  percent,
  rate,
  rateParts,
  shortDate,
} from '@highsea/core/format'
import { widgetDefinition } from '@highsea/personalization/widgets'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  type FrameProps,
  Poster,
  Progress,
  Skeleton,
  SkeletonText,
  Sparkline,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleCell,
  useClip,
  useWidth,
  WidgetFrame,
} from '@highsea/ui-web'
import { type ReactNode, useState } from 'react'
import { useLocation } from 'wouter'
import type { HighseaClient } from '../../mock/client.ts'
import { type Query, useNow, useQuery } from '../../mock/hooks.tsx'
import type { EventTopic, QueueItem, WidgetKind } from '../../mock/types.ts'
import { adminHref } from '../shell.tsx'
import { indexerStatus, queueFilters, torrentStatus } from '../status.ts'

export type WidgetProps = {
  frame: FrameProps
  /** Header actions: Remove, in customize mode. */
  actions?: ReactNode
}

/** A widget's frame, with its data's loading and error states handled. */
function Widget<T>({
  kind,
  frame,
  actions,
  meta,
  query,
  skeleton,
  children,
}: WidgetProps & {
  kind: WidgetKind
  meta?: (data: T) => ReactNode
  query: Query<T>
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  const def = widgetDefinition(kind)
  return (
    <WidgetFrame
      {...frame}
      title={def.title}
      // while arranging, the header needs its room for the handle and Remove
      meta={query.status === 'success' && meta && !frame.editing ? meta(query.data) : undefined}
      actions={actions}
      aria-label={def.title}
      aria-busy={query.status === 'loading' || undefined}
    >
      {query.status === 'loading' ? (
        (skeleton ?? (
          <div className="grid gap-2.5">
            <Skeleton className="h-6 w-24" />
            <SkeletonText lines={2} />
          </div>
        ))
      ) : query.status === 'error' ? (
        <EmptyState
          size="sm"
          tone="error"
          title={`Couldn’t load ${def.title.toLowerCase()}`}
          action={
            <Button size="sm" onClick={query.refetch}>
              Try again
            </Button>
          }
        >
          {query.error.message}
        </EmptyState>
      ) : (
        children(query.data)
      )}
    </WidgetFrame>
  )
}

/** The line under a clipped list: "3 more in Indexers". */
function More({ count, page, path }: { count: number; page: string; path: string }) {
  if (!count) return null
  return (
    <a
      href={adminHref(path)}
      className="shrink-0 self-start text-caption text-text-3 hover:text-text hover:underline"
    >
      {count} more in {page}
    </a>
  )
}

/** The box a list fills and is clipped by. */
const fill = 'min-h-0 flex-1 overflow-y-clip'

function useWidgetQuery<T>(
  kind: WidgetKind,
  fetch: (c: HighseaClient) => Promise<T>,
  live: EventTopic[] = [],
) {
  return useQuery(`widget:${kind}`, fetch, live)
}

// ---------------------------------------------------------------- network

function Network(props: WidgetProps) {
  const query = useWidgetQuery(
    'network',
    async (c) => {
      const [speeds, torrents] = await Promise.all([c.system.speeds(), c.downloads.list()])
      return {
        speeds,
        down: torrents.reduce((s, t) => s + t.downRate, 0),
        up: torrents.reduce((s, t) => s + t.upRate, 0),
        active: torrents.filter((t) => t.state === 'downloading').length,
      }
    },
    ['tick'],
  )
  return (
    <Widget {...props} kind="network" query={query} meta={() => 'last 10 min'}>
      {(d) => {
        const [down, downUnit] = rateParts(d.down)
        const [up, upUnit] = rateParts(d.up)
        return (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <Stat
                value={down}
                unit={`${downUnit} ↓`}
                caption={
                  d.active
                    ? `${d.active} ${d.active === 1 ? 'download' : 'downloads'}`
                    : 'Nothing downloading'
                }
              />
              <Stat value={up} unit={`${upUnit} ↑`} caption="seeding" className="opacity-85" />
            </div>
            <Sparkline
              className="h-auto min-h-12 flex-1"
              series={[
                { values: d.speeds.map((s) => s.up), className: 'text-text-3' },
                { values: d.speeds.map((s) => s.down), className: 'text-accent', fill: true },
              ]}
            />
          </>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- storage

const usage = [
  { key: 'movies', label: 'Movies', fill: 'bg-accent' },
  { key: 'tv', label: 'TV', fill: 'bg-accent-2' },
  { key: 'music', label: 'Music', fill: 'bg-info' },
  { key: 'downloads', label: 'Downloads', fill: 'bg-warning' },
  { key: 'other', label: 'Other', fill: 'bg-text-3' },
] as const

function Storage(props: WidgetProps) {
  const query = useWidgetQuery('storage', (c) => c.system.status(), ['torrents.updated'])
  // three rows and up: the legend becomes a list with a figure per line
  const tall = (props.frame.rows ?? 2) >= 3
  return (
    <Widget {...props} kind="storage" query={query} meta={(s) => s.disks[0]?.path}>
      {(s) => {
        const disk = s.disks[0]
        if (!disk) return <EmptyState size="sm" title="No disks reported" />
        const [free, unit] = bytesParts(disk.free)
        const parts = usage.filter((u) => disk.usedBy[u.key] > 0)
        return (
          <>
            <Stat value={free} unit={`${unit} free of ${bytes(disk.total)}`} />
            <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-s3">
              {parts.map((u) => (
                <span
                  key={u.key}
                  className={u.fill}
                  style={{ width: `${(disk.usedBy[u.key] / disk.total) * 100}%` }}
                />
              ))}
            </div>
            <ul
              className={cn(
                'text-caption text-text-2',
                tall ? 'grid gap-1.5' : 'flex flex-wrap gap-x-3 gap-y-1',
              )}
            >
              {parts.map((u) => (
                <li key={u.key} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn('size-2 shrink-0 rounded-[2px]', u.fill)} />
                  <span className={cn(tall && 'flex-1')}>{u.label}</span>{' '}
                  <span className="font-mono text-text-3">{bytes(disk.usedBy[u.key])}</span>
                </li>
              ))}
            </ul>
          </>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- indexers

function Indexers(props: WidgetProps) {
  const [, navigate] = useLocation()
  const now = useNow()
  const query = useWidgetQuery('indexers', (c) => c.indexers.list(), ['indexers.updated'])
  const wide = props.frame.span !== 1
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget
      {...props}
      kind="indexers"
      query={query}
      meta={(xs) =>
        xs.length
          ? `${xs.filter((x) => x.health === 'healthy').length} of ${xs.length} healthy`
          : null
      }
    >
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState
            size="sm"
            icon="indexer"
            title="No indexers yet"
            action={
              <Button size="sm" variant="primary" onClick={() => navigate('/indexers')}>
                Add indexers
              </Button>
            }
          >
            Searches need at least one. The catalog adds public ones in a click.
          </EmptyState>
        ) : (
          <>
            <ul ref={clip.ref} className={cn('grid content-start gap-1.5 text-ui', fill)}>
              {xs.map((x) => {
                const status = indexerStatus[x.health]
                const left = x.backoffUntil ? (Date.parse(x.backoffUntil) - now) / 1000 : 0
                return (
                  <li key={x.id} className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        x.health === 'healthy'
                          ? 'bg-success'
                          : x.health === 'backoff'
                            ? 'bg-warning'
                            : x.health === 'failing'
                              ? 'bg-danger'
                              : 'bg-text-3',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-text">
                      {x.name}
                      <span className="sr-only">: {status.label}</span>
                    </span>
                    {wide && (
                      <span className="font-mono text-figure text-text-3">
                        {x.stats.grabs24h} grabs
                      </span>
                    )}
                    <span
                      className={cn(
                        'shrink-0 font-mono text-figure',
                        x.health === 'backoff' ? 'text-warning' : 'text-text-3',
                      )}
                    >
                      {x.health === 'backoff'
                        ? `retry in ${duration(left)}`
                        : `${x.stats.avgResponseMs} ms`}
                    </span>
                  </li>
                )
              })}
            </ul>
            <More count={clip.hidden} page="Indexers" path="/indexers" />
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- subtitles

function Subtitles(props: WidgetProps) {
  const query = useWidgetQuery('subtitles', (c) => c.subtitles.stats(), ['subtitles.updated'])
  return (
    <Widget {...props} kind="subtitles" query={query} meta={() => 'today'}>
      {(s) =>
        s.syncedToday === 0 && s.waiting === 0 ? (
          <EmptyState size="sm" icon="subtitles" title="No subtitles yet">
            highsea finds and syncs them as movies arrive.
          </EmptyState>
        ) : (
          <>
            <Stat value={s.syncedToday} unit="synced" caption={`${s.waiting} waiting`} />
            <Progress
              value={(s.syncedToday / Math.max(1, s.syncedToday + s.waiting)) * 100}
              tone="success"
              aria-label="Subtitles synced today"
            />
            <p className="text-caption text-text-3">
              Average offset corrected {(s.avgOffsetMs / 1000).toFixed(2)} s · confidence{' '}
              {s.avgConfidence.toFixed(2)}
            </p>
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- upcoming

function Upcoming(props: WidgetProps) {
  const query = useWidgetQuery('upcoming', (c) => c.movies.upcoming(14), ['item.updated'])
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget {...props} kind="upcoming" query={query} meta={() => 'next 14 days'}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="calendar" title="Nothing due in the next 14 days">
            Monitored movies show here before they release.
          </EmptyState>
        ) : (
          <>
            <ul ref={clip.ref} className={cn('grid content-start gap-2 text-ui', fill)}>
              {xs.map((m, i) => (
                <li key={m.id} className="flex min-w-0 items-center gap-2.5">
                  <Badge
                    dot={false}
                    tone={i === 0 ? 'accent' : 'neutral'}
                    className="w-16 justify-center"
                  >
                    {shortDate(m.releaseDate)}
                  </Badge>
                  <a
                    href={adminHref(`/movies/${m.id}`)}
                    className="min-w-0 flex-1 truncate text-text hover:underline"
                  >
                    {m.title}
                  </a>
                  <span className="shrink-0 text-caption text-text-3">
                    {m.versions.map((v) => v.label).join(' + ')}
                  </span>
                </li>
              ))}
            </ul>
            <More count={clip.hidden} page="Movies" path="/movies" />
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- announcement

const until = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// two rows hold the title and details; taller widgets show the message too
const bodyLines: Record<number, string | undefined> = { 3: 'line-clamp-3', 4: 'line-clamp-7' }

function Announcement(props: WidgetProps) {
  const [, navigate] = useLocation()
  const body = bodyLines[props.frame.rows ?? 2]
  const query = useWidgetQuery('announcement', (c) => c.announcements.active(), [
    'announcements.updated',
  ])
  return (
    <Widget
      {...props}
      kind="announcement"
      query={query}
      meta={(xs) => (xs.length ? <Badge tone="success">Live</Badge> : null)}
    >
      {(xs) => {
        const a = xs[0]
        if (!a)
          return (
            <EmptyState
              size="sm"
              icon="announcement"
              title="No announcement is live"
              action={
                <Button size="sm" onClick={() => navigate('/curation')}>
                  Write one
                </Button>
              }
            />
          )
        const audience = a.audience.kind === 'everyone' ? 'All clients' : 'Some viewers'
        return (
          <div className="grid content-start gap-1">
            <p className="font-semibold text-text text-ui">{a.title}</p>
            <p className="text-caption text-text-3">
              {audience} · {a.placements.join(' + ')}
              {a.schedule.end ? ` · until ${until.format(new Date(a.schedule.end))}` : ''}
            </p>
            {body && (
              <p className={cn('mt-1 text-caption text-text-2', body)}>
                {a.body.replaceAll('**', '')}
              </p>
            )}
          </div>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- queue

function QueueRows({ items, layout }: { items: QueueItem[]; layout: 'table' | 'mid' | 'stacked' }) {
  if (layout === 'stacked')
    return (
      <ul className="-mx-(--size-widget-padding) grid">
        {items.map((q) => {
          const s = torrentStatus[q.state]
          return (
            <li
              key={q.id}
              className="grid gap-1.5 border-line border-t px-(--size-widget-padding) py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-text text-ui">{q.title}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <Progress
                value={q.progress * 100}
                tone={s.bar}
                showValue
                aria-label={`${q.title} progress`}
              />
              <p className="truncate font-mono text-figure text-text-3">
                {q.state === 'downloading'
                  ? `${rate(q.downRate)} · ${q.eta ? `${duration(q.eta)} left` : '—'}`
                  : (q.stateReason ?? bytes(q.size))}
              </p>
            </li>
          )
        })}
      </ul>
    )
  const full = layout === 'table'
  return (
    <div className="relative -mx-(--size-widget-padding) overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            {full && <TableHead numeric>Size</TableHead>}
            <TableHead>Progress</TableHead>
            <TableHead numeric>↓</TableHead>
            {full && <TableHead numeric>↑</TableHead>}
            <TableHead numeric>ETA</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((q) => {
            const s = torrentStatus[q.state]
            return (
              <TableRow key={q.id} title={q.stateReason ?? undefined}>
                <TitleCell
                  title={
                    q.itemId ? (
                      <a href={adminHref(`/movies/${q.itemId}`)} className="hover:underline">
                        {q.title}
                      </a>
                    ) : (
                      q.title
                    )
                  }
                  detail={q.release}
                />
                {full && <TableCell numeric>{bytes(q.size)}</TableCell>}
                <TableCell className="w-40">
                  <Progress
                    value={q.progress * 100}
                    tone={s.bar}
                    showValue
                    aria-label={`${q.title} progress`}
                  />
                </TableCell>
                <TableCell numeric>{q.downRate ? rate(q.downRate) : '—'}</TableCell>
                {full && <TableCell numeric>{q.upRate ? rate(q.upRate) : '—'}</TableCell>}
                <TableCell numeric>
                  {q.state === 'downloading' && q.eta
                    ? duration(q.eta)
                    : q.state === 'queued'
                      ? 'queued'
                      : '—'}
                </TableCell>
                <TableCell>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function Queue(props: WidgetProps) {
  const query = useWidgetQuery('activity', (c) => c.queue.list(), [
    'queue.changed',
    'torrents.updated',
  ])
  const [filter, setFilter] = useState<keyof typeof queueFilters>('all')
  const { ref: body, width } = useWidth<HTMLDivElement>()
  const layout = width >= 760 ? 'table' : width >= 520 ? 'mid' : 'stacked'
  const clip = useClip<HTMLDivElement>('tbody > tr, ul > li')
  return (
    <Widget
      {...props}
      kind="activity"
      query={query}
      meta={(xs) =>
        xs.length
          ? `${xs.length} ${xs.length === 1 ? 'item' : 'items'} · ${rate(xs.reduce((s, q) => s + q.downRate, 0))}`
          : null
      }
      skeleton={
        <div className="grid gap-3">
          <Skeleton className="h-7 w-64" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      }
    >
      {(xs) => {
        if (xs.length === 0)
          return (
            <EmptyState size="sm" icon="downloads" title="The queue is empty">
              Movies you add show here while they download and import.
            </EmptyState>
          )
        const counts = Object.fromEntries(
          Object.entries(queueFilters).map(([k, f]) => [k, xs.filter((q) => f(q.state)).length]),
        )
        const shown = xs.filter((q) => queueFilters[filter](q.state))
        return (
          <div ref={body} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <Tabs
              value={filter}
              onValueChange={(v) => setFilter(v as typeof filter)}
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
            >
              <TabsList
                aria-label="Filter the queue"
                className="max-w-full justify-self-start overflow-x-auto"
              >
                <TabsTrigger value="all" count={counts.all}>
                  All
                </TabsTrigger>
                <TabsTrigger value="downloading" count={counts.downloading}>
                  Downloading
                </TabsTrigger>
                <TabsTrigger value="seeding" count={counts.seeding}>
                  Seeding
                </TabsTrigger>
                <TabsTrigger value="issues" count={counts.issues}>
                  Issues
                </TabsTrigger>
              </TabsList>
              <TabsContent ref={clip.ref} value={filter} className={cn('min-w-0', fill)}>
                {shown.length ? (
                  <QueueRows items={shown} layout={layout} />
                ) : (
                  <p className="py-4 text-center text-caption text-text-3">
                    Nothing here right now.
                  </p>
                )}
              </TabsContent>
            </Tabs>
            <More count={clip.hidden} page="Activity" path="/activity" />
          </div>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- recently added

function RecentlyAdded(props: WidgetProps) {
  const query = useWidgetQuery('recently-added', (c) => c.movies.recent(24), ['item.updated'])
  const { ref: row, width } = useWidth<HTMLDivElement>()
  const columns = Math.max(2, Math.min(8, Math.floor((width + 12) / 112)))
  // as many rows of posters as fit the height; a cut-off row is hidden
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget
      {...props}
      kind="recently-added"
      query={query}
      skeleton={
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-poster rounded-poster" />
          ))}
        </div>
      }
    >
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="movie" title="Nothing added yet">
            New movies show here once they’re imported.
          </EmptyState>
        ) : (
          <div ref={row} className="flex min-h-0 flex-1 flex-col">
            <ul
              ref={clip.ref}
              className={cn('grid content-start gap-3', fill)}
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {xs.slice(0, columns * 4).map((m) => (
                <li key={m.id}>
                  <Poster
                    title={m.title}
                    src={m.art.poster}
                    href={adminHref(`/movies/${m.id}`)}
                    showTitle
                    caption={m.year}
                  />
                </li>
              ))}
            </ul>
          </div>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- calendar

const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })

function Calendar(props: WidgetProps) {
  const now = useNow()
  const query = useWidgetQuery('calendar', (c) => c.movies.upcoming(45), ['item.updated'])
  const today = new Date(now)
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  return (
    <Widget {...props} kind="calendar" query={query} meta={() => monthName.format(first)}>
      {(xs) => {
        const byDay = new Map<number, string[]>()
        for (const m of xs) {
          const d = new Date(m.releaseDate)
          if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear())
            byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), m.title])
        }
        // the date each row starts on (zero or less is last month's tail)
        const weeks = Array.from(
          { length: Math.ceil((lead + days) / 7) },
          (_, i) => i * 7 - lead + 1,
        )
        return (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <table className="h-full w-full table-fixed border-separate border-spacing-0.5 text-center">
              <caption className="sr-only">Releases in {monthName.format(first)}</caption>
              <thead>
                <tr>
                  {weekdays.map((w) => (
                    <th
                      key={w}
                      scope="col"
                      className="py-1 font-mono font-normal text-label text-text-3"
                    >
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((start) => (
                  <tr key={start}>
                    {weekdays.map((w, d) => {
                      const day = start + d
                      const titles = byDay.get(day)
                      const valid = day >= 1 && day <= days
                      return (
                        <td
                          key={w}
                          aria-current={valid && day === today.getDate() ? 'date' : undefined}
                          className={cn(
                            'relative h-7 rounded-[6px] p-0 align-middle font-mono text-figure',
                            !valid && 'invisible',
                            day === today.getDate() ? 'bg-s3 text-text' : 'text-text-2',
                            titles && 'font-semibold text-accent-text',
                          )}
                        >
                          {valid ? day : ''}
                          {titles && (
                            <>
                              <span className="sr-only">: {titles.join(', ')}</span>
                              <span
                                aria-hidden
                                className="-translate-x-1/2 absolute start-1/2 bottom-0.5 size-1 rounded-full bg-accent"
                              />
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {byDay.size === 0 && (
              <p className="shrink-0 text-caption text-text-3">No releases this month.</p>
            )}
          </div>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- system health

const levels = {
  ok: { tone: 'success', label: 'OK' },
  notice: { tone: 'info', label: 'Notice' },
  warning: { tone: 'warning', label: 'Warning' },
  error: { tone: 'danger', label: 'Error' },
} as const

function SystemHealth(props: WidgetProps) {
  const query = useWidgetQuery('system-health', (c) => c.system.health(), ['health.updated'])
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget
      {...props}
      kind="system-health"
      query={query}
      meta={(xs) => (xs.length ? `${xs.length} to check` : null)}
    >
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="success" title="Everything looks healthy" />
        ) : (
          <>
            <ul ref={clip.ref} className={cn('grid content-start gap-2.5', fill)}>
              {xs.map((h) => (
                <li key={h.id} className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={levels[h.level].tone}>{levels[h.level].label}</Badge>
                    <span className="text-caption text-text-3">{h.source}</span>
                  </div>
                  <p className="text-caption text-text-2">{h.message}</p>
                </li>
              ))}
            </ul>
            <More count={clip.hidden} page="System" path="/system" />
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- registry

export const widgetRenderers: Record<WidgetKind, (props: WidgetProps) => ReactNode> = {
  network: Network,
  storage: Storage,
  indexers: Indexers,
  subtitles: Subtitles,
  upcoming: Upcoming,
  announcement: Announcement,
  activity: Queue,
  'recently-added': RecentlyAdded,
  calendar: Calendar,
  'system-health': SystemHealth,
}

export { percent }
