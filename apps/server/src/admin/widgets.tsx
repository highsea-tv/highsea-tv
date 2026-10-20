'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The widget registry's client half, ported from the prototype: one renderer per widget kind.
// Each fills the size it's given, fetches its own data and shows its own loading, empty and error
// states. Milestone 1's server has one source, the system itself (public info's `sources`), so
// Storage and System health show data now. The rest show their empty states from dashboard.md,
// which are true on a server without those things yet, and call no route until their checkpoint
// adds it (Phase 3 plan › Widgets).

import { bytes, bytesParts, percent, rateParts } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { type WidgetKind, widgetDefinition, widgetMessages } from '@highsea/personalization/widgets'
import { type Query, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  type FrameProps,
  Skeleton,
  SkeletonText,
  Sparkline,
  Stat,
  useClip,
  WidgetFrame,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { widgets as messages } from './dashboard-messages.ts'
import { useNow } from './time.ts'

export type WidgetProps = {
  frame: FrameProps
  /** The placement's settings, filled from the widget's defaults by the server. */
  settings: Record<string, unknown>
  /** Header actions: Remove, in customize mode. */
  actions?: ReactNode
}

/** Disks change slowly and have no event: the widget asks again now and then. */
const STORAGE_INTERVAL = 30_000

/** A widget's frame, with its data's loading and error states handled. */
function Widget<T>({
  kind,
  frame,
  actions,
  meta,
  query,
  skeleton,
  children,
}: Omit<WidgetProps, 'settings'> & {
  kind: WidgetKind
  meta?: (data: T) => ReactNode
  query: Query<T>
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  const t = useT(messages)
  const tw = useT(widgetMessages)
  const locale = useLocale()
  const title = tw(`${kind}.title`)
  return (
    <WidgetFrame
      {...frame}
      title={title}
      // while arranging, the header needs its room for the handle and Remove
      meta={query.status === 'success' && meta && !frame.editing ? meta(query.data) : undefined}
      actions={actions}
      aria-label={title}
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
          title={t('error', { widget: title.toLocaleLowerCase(locale) })}
          action={
            <Button size="sm" onClick={query.refetch}>
              {t('retry')}
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

/** A widget whose source this server doesn't have yet: its frame and what's true without it. */
function Static({
  kind,
  frame,
  actions,
  meta,
  children,
}: Omit<WidgetProps, 'settings'> & { kind: WidgetKind; meta?: ReactNode; children: ReactNode }) {
  const tw = useT(widgetMessages)
  const title = tw(`${kind}.title`)
  return (
    <WidgetFrame
      {...frame}
      title={title}
      meta={frame.editing ? undefined : meta}
      actions={actions}
      aria-label={title}
    >
      {children}
    </WidgetFrame>
  )
}

/** The line under a clipped list: "3 more in System". */
function More({ count, page, path }: { count: number; page: string; path: string }) {
  const t = useT(messages)
  if (!count) return null
  return (
    <a
      href={path}
      className="shrink-0 self-start text-caption text-text-3 hover:text-text hover:underline"
    >
      {t('more', { count, page })}
    </a>
  )
}

/** The box a list fills and is clipped by. */
const fill = 'min-h-0 flex-1 overflow-y-clip'

// ---------------------------------------------------------------- network

function Network(props: WidgetProps) {
  const t = useT(messages)
  const [zero, unit] = rateParts(0)
  return (
    <Static {...props} kind="network" meta={t('network.meta')}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Stat value={zero} unit={t('network.down', { unit })} caption={t('network.none')} />
        <Stat
          value={zero}
          unit={t('network.up', { unit })}
          caption={t('network.seeding')}
          className="opacity-85"
        />
      </div>
      <Sparkline
        className="h-auto min-h-12 flex-1"
        series={[
          { values: [0, 0], className: 'text-text-3' },
          { values: [0, 0], className: 'text-accent', fill: true },
        ]}
      />
    </Static>
  )
}

// ---------------------------------------------------------------- storage

function Storage(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery('widget:storage', (c) => c.system.status(), [], {
    interval: STORAGE_INTERVAL,
  })
  // three rows and up: the legend becomes a list with a figure per line
  const tall = (props.frame.rows ?? 2) >= 3
  return (
    <Widget {...props} kind="storage" query={query} meta={(s) => s.disks[0]?.path}>
      {(s) => {
        const disk = s.disks[0]
        if (!disk) return <EmptyState size="sm" title={t('storage.none')} />
        const [free, unit] = bytesParts(disk.free)
        // what uses the space arrives with the library: until then, one bar for all of it
        const used = Math.max(0, disk.total - disk.free)
        return (
          <>
            <Stat value={free} unit={t('storage.free', { unit, total: bytes(disk.total) })} />
            <div
              role="img"
              aria-label={t('storage.bar', { percent: percent(used / Math.max(1, disk.total)) })}
              className="flex h-2 overflow-hidden rounded-full bg-s3"
            >
              <span
                className="bg-accent"
                style={{ width: `${(used / Math.max(1, disk.total)) * 100}%` }}
              />
            </div>
            <ul
              className={cn(
                'text-caption text-text-2',
                tall ? 'grid gap-1.5' : 'flex flex-wrap gap-x-3 gap-y-1',
              )}
            >
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-accent" />
                <span className={cn(tall && 'flex-1')}>{t('storage.used')}</span>{' '}
                <span className="font-mono text-text-3">{bytes(used)}</span>
              </li>
            </ul>
          </>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- indexers

function Indexers(props: WidgetProps) {
  const t = useT(messages)
  const router = useRouter()
  return (
    <Static {...props} kind="indexers">
      <EmptyState
        size="sm"
        icon="indexer"
        title={t('indexers.none')}
        action={
          <Button size="sm" variant="primary" onClick={() => router.push('/indexers')}>
            {t('indexers.add')}
          </Button>
        }
      >
        {t('indexers.noneBody')}
      </EmptyState>
    </Static>
  )
}

// ---------------------------------------------------------------- subtitles

function Subtitles(props: WidgetProps) {
  const t = useT(messages)
  return (
    <Static {...props} kind="subtitles" meta={t('subtitles.meta')}>
      <EmptyState size="sm" icon="subtitles" title={t('subtitles.none')}>
        {t('subtitles.noneBody')}
      </EmptyState>
    </Static>
  )
}

// ---------------------------------------------------------------- upcoming

function Upcoming(props: WidgetProps) {
  const t = useT(messages)
  const days = Number(props.settings.days ?? widgetDefinition('upcoming').settings.parse({}).days)
  return (
    <Static {...props} kind="upcoming" meta={t('upcoming.meta', { days })}>
      <EmptyState size="sm" icon="calendar" title={t('upcoming.none', { days })}>
        {t('upcoming.noneBody')}
      </EmptyState>
    </Static>
  )
}

// ---------------------------------------------------------------- announcement

function Announcement(props: WidgetProps) {
  const t = useT(messages)
  const router = useRouter()
  return (
    <Static {...props} kind="announcement">
      <EmptyState
        size="sm"
        icon="announcement"
        title={t('announcement.none')}
        action={
          <Button size="sm" onClick={() => router.push('/curation')}>
            {t('announcement.write')}
          </Button>
        }
      />
    </Static>
  )
}

// ---------------------------------------------------------------- queue

function Queue(props: WidgetProps) {
  const t = useT(messages)
  return (
    <Static {...props} kind="activity">
      <EmptyState size="sm" icon="downloads" title={t('activity.none')}>
        {t('activity.noneBody')}
      </EmptyState>
    </Static>
  )
}

// ---------------------------------------------------------------- recently added

function RecentlyAdded(props: WidgetProps) {
  const t = useT(messages)
  return (
    <Static {...props} kind="recently-added">
      <EmptyState size="sm" icon="movie" title={t('recent.none')}>
        {t('recent.noneBody')}
      </EmptyState>
    </Static>
  )
}

// ---------------------------------------------------------------- calendar

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const

function Calendar(props: WidgetProps) {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const today = new Date(now)
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(first)
  // the date each row starts on (zero or less is last month's tail)
  const weeks = Array.from({ length: Math.ceil((lead + days) / 7) }, (_, i) => i * 7 - lead + 1)
  return (
    <Static {...props} kind="calendar" meta={month}>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <table className="h-full w-full table-fixed border-separate border-spacing-0.5 text-center">
          <caption className="sr-only">{t('calendar.caption', { month })}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className="py-1 font-mono font-normal text-label text-text-3"
                >
                  {t(`calendar.${d}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((start) => (
              <tr key={start}>
                {WEEKDAYS.map((d, i) => {
                  const day = start + i
                  const valid = day >= 1 && day <= days
                  return (
                    <td
                      key={d}
                      aria-current={valid && day === today.getDate() ? 'date' : undefined}
                      className={cn(
                        'relative h-7 rounded-[6px] p-0 align-middle font-mono text-figure',
                        !valid && 'invisible',
                        day === today.getDate() ? 'bg-s3 text-text' : 'text-text-2',
                      )}
                    >
                      {valid ? day : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="shrink-0 text-caption text-text-3">{t('calendar.none')}</p>
      </div>
    </Static>
  )
}

// ---------------------------------------------------------------- system health

const levels = {
  ok: 'success',
  notice: 'info',
  warning: 'warning',
  error: 'danger',
} as const

function SystemHealth(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery('widget:system-health', (c) => c.system.healthChecks(), [
    'server.updated',
    'settings.updated',
  ])
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget
      {...props}
      kind="system-health"
      query={query}
      meta={(xs) => (xs.length ? t('health.meta', { count: xs.length }) : null)}
    >
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="success" title={t('health.none')} />
        ) : (
          <>
            <ul ref={clip.ref} className={cn('grid content-start gap-2.5', fill)}>
              {xs.map((h) => (
                <li key={h.id} className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={levels[h.level]}>{t(`health.${h.level}`)}</Badge>
                    <span className="text-caption text-text-3">{h.source}</span>
                  </div>
                  <p className="text-caption text-text-2">{h.message}</p>
                </li>
              ))}
            </ul>
            <More count={clip.hidden} page={t('page.system')} path="/system" />
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
