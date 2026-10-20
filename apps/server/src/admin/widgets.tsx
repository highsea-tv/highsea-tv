'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The widget registry's client half, ported from the prototype: one renderer per widget kind.
// Each fills the size it's given, fetches its own data and shows its own loading, empty and error
// states. A widget's data comes from a source public info lists (`sources`): the system feeds
// Storage and System health; `movies` (checkpoint 4) feeds Upcoming, Calendar and Recently added,
// and Storage's root folders; `indexers` (checkpoint 5) feeds Indexers. The rest show their empty states from dashboard.md, which are true on
// a server without those things yet, and call no route until their checkpoint adds it (Phase 3
// plan › Widgets); so do the movie widgets on a server without the `movies` source.

import { INDEXER_TOPICS, MEDIA_TOPICS, type Movie, type RootFolder } from '@highsea/api-contract'
import { bytes, bytesParts, duration, percent, rateParts, shortDate } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { type WidgetKind, widgetDefinition, widgetMessages } from '@highsea/personalization/widgets'
import { type Query, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  type FrameProps,
  Icon,
  Poster,
  Skeleton,
  SkeletonText,
  Sparkline,
  Stat,
  useClip,
  useWidth,
  WidgetFrame,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { widgets as messages } from './dashboard-messages.ts'
import { foldersOnDisk, releasesByDay } from './library-figures.ts'
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

/** What changes the movie widgets: the library, or one title in it. */
const MOVIE_TOPICS = [MEDIA_TOPICS.movies, MEDIA_TOPICS.item]

/**
 * Whether this server has a source yet: `undefined` until public info answers. Every widget asks
 * under one key; the SDK keeps each answer per widget, and it's a small public call.
 */
function useSource(source: 'movies' | 'indexers'): boolean | undefined {
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  return info.status === 'success' ? info.data.sources.includes(source) : undefined
}

const useMovieSource = () => useSource('movies')

/** The day a release is out, as the Upcoming badges show it ("Fri 24"), on the local calendar. */
const releaseDay = (day: string, locale: string) => shortDate(`${day}T12:00:00`, locale)

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
  const movies = useMovieSource()
  return movies ? <StorageWithFolders {...props} /> : <StorageOf {...props} folders={[]} />
}

/** With the library: the root folders on the disk, as what uses it. */
function StorageWithFolders(props: WidgetProps) {
  const folders = useQuery('widget:storage-folders', (c) => c.rootFolders.list(), [
    'settings.updated',
    MEDIA_TOPICS.movies,
  ])
  return <StorageOf {...props} folders={folders.data ?? []} />
}

function StorageOf({ folders, ...props }: WidgetProps & { folders: RootFolder[] }) {
  const t = useT(messages)
  const query = useQuery('widget:storage', (c) => c.system.status(), [], {
    interval: STORAGE_INTERVAL,
  })
  // three rows and up: the legend becomes a list with a figure per line
  const tall = (props.frame.rows ?? 2) >= 3
  return (
    <Widget
      {...props}
      kind="storage"
      query={query}
      // a long data path truncates rather than pushing the title out (the prototype's is /data)
      meta={(s) =>
        s.disks[0] && (
          <span title={s.disks[0].path} className="block max-w-[10rem] truncate">
            {s.disks[0].path}
          </span>
        )
      }
    >
      {(s) => {
        const disk = s.disks[0]
        if (!disk) return <EmptyState size="sm" title={t('storage.none')} />
        const [free, unit] = bytesParts(disk.free)
        // the space files take arrives with importing (checkpoint 6): until then one bar for all
        // of it, and the root folders on the disk with how many movies each holds
        const used = Math.max(0, disk.total - disk.free)
        const here = foldersOnDisk(folders, disk)
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
              {here.map((f) => (
                <li key={f.id} className="flex min-w-0 items-center gap-1.5">
                  <Icon name="folder" size={12} className="shrink-0 text-text-3" />
                  <span
                    className={cn('min-w-0 truncate font-mono', tall && 'flex-1')}
                    title={f.path}
                  >
                    {f.path}
                  </span>{' '}
                  <span className="shrink-0 text-text-3">
                    {t('storage.movies', { count: f.movies })}
                  </span>
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

function NoIndexers() {
  const t = useT(messages)
  const router = useRouter()
  return (
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
  )
}

function Indexers(props: WidgetProps) {
  const source = useSource('indexers')
  if (source) return <IndexerList {...props} />
  return (
    <Static {...props} kind="indexers">
      {source === undefined ? <SkeletonText lines={3} /> : <NoIndexers />}
    </Static>
  )
}

const healthDot = {
  healthy: 'bg-success',
  backoff: 'bg-warning',
  failing: 'bg-danger',
  disabled: 'bg-text-3',
} as const

/** Installed indexers with their health; a health change or a search updates it (ADR 0035). */
function IndexerList(props: WidgetProps) {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const query = useQuery('widget:indexers', (c) => c.indexers.list(), [
    INDEXER_TOPICS.indexers,
    INDEXER_TOPICS.health,
  ])
  const wide = props.frame.span !== 1
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget
      {...props}
      kind="indexers"
      query={query}
      meta={(xs) =>
        xs.length
          ? t('indexers.meta', {
              healthy: xs.filter((x) => x.health === 'healthy').length,
              count: xs.length,
            })
          : null
      }
    >
      {(xs) =>
        xs.length === 0 ? (
          <NoIndexers />
        ) : (
          <>
            <ul ref={clip.ref} className={cn('grid content-start gap-1.5 text-ui', fill)}>
              {xs.map((x) => {
                const left = x.backoffUntil ? (Date.parse(x.backoffUntil) - now) / 1000 : 0
                return (
                  <li key={x.id} className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className={cn('size-1.5 shrink-0 rounded-full', healthDot[x.health])}
                    />
                    <span className="min-w-0 flex-1 truncate text-text">
                      {x.name}
                      <span className="sr-only">: {t(`indexers.${x.health}`)}</span>
                    </span>
                    {wide && (
                      <span className="font-mono text-figure text-text-3">
                        {t('indexers.grabs', { count: x.stats.grabs24h })}
                      </span>
                    )}
                    <span
                      className={cn(
                        'shrink-0 font-mono text-figure',
                        x.health === 'backoff' ? 'text-warning' : 'text-text-3',
                      )}
                    >
                      {x.health === 'backoff'
                        ? t('indexers.retry', { in: duration(left, locale) })
                        : x.stats.avgResponseMs === null
                          ? t('indexers.noQueries')
                          : t('indexers.ms', { ms: Math.round(x.stats.avgResponseMs) })}
                    </span>
                  </li>
                )
              })}
            </ul>
            <More count={clip.hidden} page={t('page.indexers')} path="/indexers" />
          </>
        )
      }
    </Widget>
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

const upcomingDays = (settings: Record<string, unknown>) =>
  Number(settings.days ?? widgetDefinition('upcoming').settings.parse({}).days)

function Upcoming(props: WidgetProps) {
  const t = useT(messages)
  const movies = useMovieSource()
  const days = upcomingDays(props.settings)
  if (movies) return <UpcomingMovies {...props} />
  return (
    <Static {...props} kind="upcoming" meta={t('upcoming.meta', { days })}>
      {movies === undefined ? (
        <SkeletonText lines={3} />
      ) : (
        <EmptyState size="sm" icon="calendar" title={t('upcoming.none', { days })}>
          {t('upcoming.noneBody')}
        </EmptyState>
      )}
    </Static>
  )
}

function UpcomingMovies(props: WidgetProps) {
  const t = useT(messages)
  const locale = useLocale()
  const days = upcomingDays(props.settings)
  const query = useQuery(
    `widget:upcoming:${days}`,
    (c) => c.movies.upcoming({ query: { days } }),
    MOVIE_TOPICS,
  )
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget {...props} kind="upcoming" query={query} meta={() => t('upcoming.meta', { days })}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="calendar" title={t('upcoming.none', { days })}>
            {t('upcoming.noneBody')}
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
                    {m.releaseDate ? releaseDay(m.releaseDate, locale) : '–'}
                  </Badge>
                  <a
                    href={`/movies/${m.id}`}
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
            <More count={clip.hidden} page={t('page.movies')} path="/movies" />
          </>
        )
      }
    </Widget>
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

const posterSkeleton = (
  <div className="grid grid-cols-4 gap-3">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="aspect-poster rounded-poster" />
    ))}
  </div>
)

function RecentlyAdded(props: WidgetProps) {
  const t = useT(messages)
  const movies = useMovieSource()
  if (movies) return <RecentMovies {...props} />
  return (
    <Static {...props} kind="recently-added">
      {movies === undefined ? (
        posterSkeleton
      ) : (
        <EmptyState size="sm" icon="movie" title={t('recent.none')}>
          {t('recent.noneBody')}
        </EmptyState>
      )}
    </Static>
  )
}

/** The most the widget shows: eight columns of posters, three rows. */
const RECENT_LIMIT = 24

function RecentMovies(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery(
    'widget:recently-added',
    (c) => c.movies.recent({ query: { limit: RECENT_LIMIT } }),
    MOVIE_TOPICS,
  )
  const { ref: row, width } = useWidth<HTMLDivElement>()
  const columns = Math.max(2, Math.min(8, Math.floor((width + 12) / 112)))
  // as many rows of posters as fit the height; a cut-off row is hidden
  const clip = useClip<HTMLUListElement>(':scope > li')
  return (
    <Widget {...props} kind="recently-added" query={query} skeleton={posterSkeleton}>
      {(xs: Movie[]) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="movie" title={t('recent.none')}>
            {t('recent.addedBody')}
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
                    src={m.art.poster ?? undefined}
                    href={`/movies/${m.id}`}
                    showTitle
                    caption={m.year ?? undefined}
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

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const

/** Far enough ahead to cover the rest of any month. */
const CALENDAR_DAYS = 45

function Calendar(props: WidgetProps) {
  const movies = useMovieSource()
  return movies ? <CalendarMovies {...props} /> : <CalendarOf {...props} />
}

function CalendarMovies(props: WidgetProps) {
  const query = useQuery(
    'widget:calendar',
    (c) => c.movies.upcoming({ query: { days: CALENDAR_DAYS } }),
    MOVIE_TOPICS,
  )
  return <CalendarOf {...props} releases={query.data} />
}

/** The month, with each day that has a release marked; without `releases`, a month with none. */
function CalendarOf({ releases, ...props }: WidgetProps & { releases?: Movie[] }) {
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
  const byDay = releasesByDay(releases ?? [], today.getFullYear(), today.getMonth())
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
                  const titles = valid ? byDay.get(day) : undefined
                  return (
                    <td
                      key={d}
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
          <p className="shrink-0 text-caption text-text-3">{t('calendar.none')}</p>
        )}
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
