'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// System (A16, system.md): the prototype's tabs, each at its own address. Status (`/system`) opens
// it, as in the prototype, with About below the disks: About is the server's addition (checkpoint
// 4, for TMDB's terms; checkpoint 5 adds the indexer catalog and Check now), and Status is where
// the server says who it is. Health (`/system/health`) lists what needs attention; Tasks (8a) every
// schedule with Run now. Checkpoint 8b adds Status, Logs (with crash reports), Events, Backups
// (the owner's alone, ADR 0032: an admin doesn't see the tab) and Updates.
import {
  API_PREFIX,
  type Backup,
  type CrashReport,
  DOWNLOAD_TOPICS,
  type HealthCheck,
  INDEXER_TOPICS,
  LOG_LEVELS,
  type LogEntry,
  OPERATIONS_TOPICS,
  type SystemStatus,
  type Task,
  TMDB_ATTRIBUTION,
} from '@highsea-tv/api-contract'
import { bytes, duration, percent } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useClient, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  type BadgeTone,
  Button,
  ConfirmDialog,
  EmptyState,
  Icon,
  type IconName,
  Input,
  Progress,
  Select,
  Skeleton,
  Stat,
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
  toast,
} from '@highsea-tv/ui-web'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { TmdbNotice } from './attribution.tsx'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { AdminPage, useShell } from './shell.tsx'
import { system as messages } from './system-messages.ts'
import { useNow, useRelative } from './time.ts'

type T = ReturnType<typeof useT<typeof messages>>

export const SYSTEM_TABS = [
  'status',
  'health',
  'tasks',
  'logs',
  'events',
  'backups',
  'updates',
] as const
export type SystemTab = (typeof SYSTEM_TABS)[number]
const tabPath = (tab: SystemTab) => (tab === 'status' ? '/system' : `/system/${tab}`)

/** Dates in the admin's language; English reads day-month, as the prototype does. */
const dateLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale)

export function System({ tab: asked = 'status' }: { tab?: SystemTab }) {
  const t = useT(messages)
  const router = useRouter()
  const owner = useShell().role === 'owner'
  const shown = SYSTEM_TABS.filter((id) => owner || id !== 'backups')
  const tab = shown.includes(asked) ? asked : 'status'
  const health = useQuery('system:health', (c) => c.system.healthChecks(), HEALTH_TOPICS)
  const problems = (health.data ?? []).filter((h) => h.level === 'warning' || h.level === 'error')
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Tabs value={tab} onValueChange={(v) => router.push(tabPath(v as SystemTab))} variant="line">
        <TabsList aria-label={t('sections')}>
          {shown.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              count={id === 'health' ? problems.length || undefined : undefined}
            >
              {t(`tab.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="status" className="pt-5">
          <Status />
        </TabsContent>
        <TabsContent value="health" className="pt-5">
          <div className="grid max-w-200 gap-3">
            <p className="text-caption text-text-3">{t('health.description')}</p>
            <Health />
          </div>
        </TabsContent>
        <TabsContent value="tasks" className="pt-5">
          <Tasks />
        </TabsContent>
        <TabsContent value="logs" className="pt-5">
          <Logs />
        </TabsContent>
        <TabsContent value="events" className="pt-5">
          <Events />
        </TabsContent>
        {owner && (
          <TabsContent value="backups" className="pt-5">
            <Backups />
          </TabsContent>
        )}
        <TabsContent value="updates" className="pt-5">
          <Updates />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- status

/** CPU and memory change without an event, so Status asks again this often. */
const STATUS_EVERY = 10_000

function Status() {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const status = useQuery('system:status', (c) => c.system.status(), STATUS_TOPICS, {
    interval: STATUS_EVERY,
  })
  return (
    <div className="grid gap-4">
      <Loadable query={status} what={t('status.what')}>
        {(s) => (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-4">
              <Stat value={s.version} caption={t('status.version')} />
              <Stat
                value={duration(Math.max(0, (now - Date.parse(s.startedAt)) / 1000), locale)}
                caption={t('status.uptime')}
              />
              <Stat value={String(s.clientsConnected)} caption={t('status.apps')} />
              <Stat value={s.catalogVersion ?? '–'} caption={t('status.catalog')} />
            </div>
            <div className="grid gap-4 expanded:grid-cols-2">
              <Resources s={s} />
              <section
                aria-label={t('status.addresses')}
                className="grid content-start gap-2 rounded-lg border border-line bg-s1 p-4"
              >
                <h2 className="text-widget-title">{t('status.addresses')}</h2>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-ui">
                  <dt className="text-text-3">{t('status.lan')}</dt>
                  <dd className="grid min-w-0 font-mono text-figure text-text">
                    {s.addresses.local.length === 0
                      ? t('status.notSet')
                      : s.addresses.local.map((a) => (
                          <span key={a} className="truncate" title={a}>
                            {a}
                          </span>
                        ))}
                  </dd>
                  <dt className="text-text-3">{t('status.remote')}</dt>
                  <dd className="truncate font-mono text-figure text-text">
                    {s.addresses.public ?? t('status.notSet')}
                  </dd>
                </dl>
                <a
                  href="/settings/network"
                  className="justify-self-start rounded-sm text-caption text-text-2 underline underline-offset-2 outline-none hover:text-text focus-visible:ring-focus"
                >
                  {t('status.network')}
                </a>
              </section>
            </div>
            <Disks disks={s.disks} />
          </div>
        )}
      </Loadable>
      <div className="max-w-200">
        <About />
      </div>
    </div>
  )
}

function Resources({ s }: { s: SystemStatus }) {
  const t = useT(messages)
  return (
    <section
      aria-label={t('status.resources')}
      className="grid content-start gap-3 rounded-lg border border-line bg-s1 p-4"
    >
      <h2 className="text-widget-title">{t('status.resources')}</h2>
      <p className="text-caption text-text-3">{t('status.cpu')}</p>
      <Progress value={s.cpu} showValue aria-label={t('status.cpuLabel')} />
      <p className="text-caption text-text-3">
        {t('status.memory', { used: bytes(s.memory.used), total: bytes(s.memory.total) })}
      </p>
      <Progress
        value={s.memory.total ? (s.memory.used / s.memory.total) * 100 : 0}
        showValue
        aria-label={t('status.memoryLabel')}
      />
      <p className="text-caption text-text-3">
        {t('status.process', {
          cpu: percent(s.process.cpu / 100),
          memory: bytes(s.process.memory),
        })}
      </p>
    </section>
  )
}

const USED_BY = ['movies', 'downloads', 'other'] as const

function Disks({ disks }: { disks: SystemStatus['disks'] }) {
  const t = useT(messages)
  return (
    <section
      aria-label={t('status.disks')}
      className="grid gap-4 rounded-lg border border-line bg-s1 p-4"
    >
      <h2 className="text-widget-title">{t('status.disks')}</h2>
      {disks.length === 0 && <p className="text-caption text-text-3">{t('status.noDisks')}</p>}
      {disks.map((d) => {
        const used = d.total - d.free
        const fraction = d.total ? used / d.total : 0
        return (
          <div key={d.path} className="grid min-w-0 gap-1.5">
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-ui">
              <span className="text-text">{d.label}</span>
              <span className="min-w-0 truncate font-mono text-figure text-text-3" title={d.path}>
                {d.path}
              </span>
              <span className="ms-auto text-text-2">
                {t('status.free', { free: bytes(d.free), total: bytes(d.total) })}
              </span>
            </p>
            <Progress
              value={fraction * 100}
              tone={d.total && d.free / d.total < 0.1 ? 'warning' : 'accent'}
              aria-label={t('status.used', { label: d.label, percent: percent(fraction) })}
            />
            <p className="text-caption text-text-3">
              {USED_BY.filter((k) => d.usedBy[k] > 0)
                .map((k) => t(`status.usedBy.${k}`, { size: bytes(d.usedBy[k]) }))
                .join(' · ')}
            </p>
          </div>
        )
      })}
    </section>
  )
}

/** The server, its version, the indexer catalog, and the services whose data it shows. */
function About() {
  const t = useT(messages)
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])
  return (
    <Group title={t('about.title')} description={t('about.description')}>
      <Loadable query={info} what={t('what')}>
        {(i) => (
          <dl className="grid gap-3 text-ui medium:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.name')}</dt>
            <dd className="text-text">{i.name}</dd>
            <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.version')}</dt>
            <dd className="font-mono text-figure text-text">{i.version}</dd>
            <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.catalog')}</dt>
            <dd>
              <Catalog />
            </dd>
            {i.attributions.length > 0 && (
              <>
                <dt className="text-caption text-text-3 medium:pt-0.5">{t('about.data')}</dt>
                <dd className="grid gap-3">
                  {i.attributions.map((a) =>
                    a.name === TMDB_ATTRIBUTION.name ? (
                      <TmdbNotice key={a.name} />
                    ) : (
                      // the notice names the service ("Subtitles provided by OpenSubtitles.com"),
                      // so it's the link; underlined, since colour alone doesn't mark a link
                      <p key={a.name} className="text-caption">
                        <a
                          href={a.url}
                          className="text-text-2 underline underline-offset-2 hover:text-text"
                        >
                          {a.notice || a.name}
                        </a>
                      </p>
                    ),
                  )}
                </dd>
              </>
            )}
          </dl>
        )}
      </Loadable>
    </Group>
  )
}

/** The indexer catalog's version and last check, and Check now. */
function Catalog() {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const status = useQuery('catalog-status', (c) => c.catalog.status(), [INDEXER_TOPICS.catalog])
  const check = useAction((c) => c.catalog.check())
  if (status.status === 'loading') return <Skeleton className="h-5 w-40" />
  if (status.status === 'error')
    return <p className="text-caption text-text-3">{status.error.message}</p>
  const s = status.data
  const ago = s.lastCheck ? duration((now - Date.parse(s.lastCheck.at)) / 1000, locale) : ''
  const onCheck = () => {
    const before = s.version
    check.run().then(
      (after) => {
        if (after.lastCheck && !after.lastCheck.ok)
          toast.error(t('catalog.failed'), { description: after.lastCheck.message ?? undefined })
        else if (after.version !== before)
          toast.success(t('catalog.updated', { version: after.version ?? '' }))
        else if (after.available)
          toast({
            title: t('catalog.available', { version: after.available.version }),
            description: t('catalog.availableBody'),
          })
        else toast({ title: t('catalog.current') })
        status.refetch()
      },
      (e: Error) => toast.error(t('catalog.failed'), { description: e.message }),
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-figure text-text">{s.version ?? t('catalog.none')}</span>
      {s.lastCheck && (
        <span className="text-caption text-text-3">
          {s.lastCheck.ok
            ? t('catalog.checked', { ago })
            : t('catalog.checkFailed', {
                ago,
                message: s.lastCheck.message ?? '',
              })}
        </span>
      )}
      <Button size="sm" icon="refresh" loading={check.pending} onClick={onCheck}>
        {t('catalog.check')}
      </Button>
    </div>
  )
}

const levels: Record<HealthCheck['level'], { tone: BadgeTone; icon: IconName }> = {
  ok: { tone: 'success', icon: 'success' },
  notice: { tone: 'info', icon: 'info' },
  warning: { tone: 'warning', icon: 'warning' },
  error: { tone: 'danger', icon: 'error' },
}

/** What changes a check: the server and its settings, an indexer, a download, the VPN, a backup. */
const HEALTH_TOPICS = [
  'server.updated',
  OPERATIONS_TOPICS.settings,
  INDEXER_TOPICS.health,
  DOWNLOAD_TOPICS.queue,
  DOWNLOAD_TOPICS.vpn,
  OPERATIONS_TOPICS.backups,
]

/** What Status shows that an event announces: the server, the catalog's version. */
const STATUS_TOPICS = ['server.updated', INDEXER_TOPICS.catalog]

/** The prototype's Health list: each check with its level, where it comes from and since when. */
function Health() {
  const t = useT(messages)
  const { relative } = useRelative()
  const health = useQuery('system:health', (c) => c.system.healthChecks(), HEALTH_TOPICS)
  return (
    <Loadable query={health} what={t('health.what')}>
      {(checks) =>
        checks.length === 0 ? (
          <EmptyState icon="success" title={t('health.none')}>
            {t('health.noneBody')}
          </EmptyState>
        ) : (
          <ul aria-label={t('health.label')} className="grid gap-2">
            {checks.map((c) => {
              const l = levels[c.level]
              return (
                <li key={c.id} className="flex gap-3 rounded-lg border border-line bg-s1 p-4">
                  <Icon name={l.icon} size={18} className="mt-0.5 shrink-0 text-text-2" />
                  <div className="grid gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge tone={l.tone}>{t(`health.${c.level}`)}</Badge>
                      <span className="font-semibold text-text text-ui">{c.source}</span>
                      <span className="text-caption text-text-3">
                        {t('health.since', { ago: relative(c.since) })}
                      </span>
                    </p>
                    <p className="text-body text-text-2">{c.message}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      }
    </Loadable>
  )
}

const taskStates: Record<Task['state'], BadgeTone> = {
  running: 'accent',
  queued: 'info',
  idle: 'neutral',
  failed: 'danger',
}

/** A task's name from its job type; a type without one shows as it is. */
const taskName = (t: T, id: string) => {
  const key = `task.${id}`
  return key in messages ? t(key as keyof typeof messages & `task.${string}`) : id
}

/** The prototype's Tasks table: every schedule, its state, interval, last and next run, Run now. */
function Tasks() {
  const t = useT(messages)
  const locale = useLocale()
  const { relative } = useRelative()
  const tasks = useQuery('system:tasks', (c) => c.system.tasks(), ['jobs.updated'])
  const run = useAction((c, id: string) => c.system.runTask({ params: { id } }))
  const onRun = (task: Task) => {
    const name = taskName(t, task.id)
    run.run(task.id).then(
      () => {
        toast({ title: t('tasks.started', { name }) })
        tasks.refetch()
      },
      (e: Error) => toast.error(t('tasks.failed', { name }), { description: e.message }),
    )
  }
  return (
    <Loadable query={tasks} what={t('tasks.what')}>
      {(ts) =>
        ts.length === 0 ? (
          <EmptyState icon="system" title={t('tasks.none')}>
            {t('tasks.noneBody')}
          </EmptyState>
        ) : (
          <TableFrame>
            <Table aria-label={t('tasks.label')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tasks.task')}</TableHead>
                  <TableHead>{t('tasks.state')}</TableHead>
                  <TableHead>{t('tasks.every')}</TableHead>
                  <TableHead>{t('tasks.lastRun')}</TableHead>
                  <TableHead>{t('tasks.nextRun')}</TableHead>
                  <TableHead>
                    <span className="sr-only">{t('tasks.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ts.map((task) => {
                  const name = taskName(t, task.id)
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="text-text">{name}</TableCell>
                      <TableCell className="w-44">
                        <div className="grid justify-items-start gap-1">
                          <Badge tone={taskStates[task.state]}>{t(`state.${task.state}`)}</Badge>
                          {task.state === 'failed' && task.lastError && (
                            <span className="text-caption text-text-3">{task.lastError}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-text-2">
                        {duration(task.interval, locale)}
                      </TableCell>
                      <TableCell className="text-text-2">
                        {task.lastRun ? relative(task.lastRun) : t('tasks.never')}
                      </TableCell>
                      <TableCell className="text-text-2">
                        {task.nextRun ? relative(task.nextRun) : t('tasks.off')}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          icon="play"
                          disabled={task.state === 'running' || task.state === 'queued'}
                          aria-label={t('tasks.runLabel', { name })}
                          onClick={() => onRun(task)}
                        >
                          {t('tasks.run')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        )
      }
    </Loadable>
  )
}

// ---------------------------------------------------------------- logs

const logTone: Record<LogEntry['level'], BadgeTone> = {
  debug: 'neutral',
  info: 'info',
  warn: 'warning',
  error: 'danger',
}

/** The lines asked for at a time; the server keeps 2,000 in memory. */
const LOG_LIMIT = 1000
/** Lines shown at once: the search narrows them. */
const LOG_SHOWN = 200

/** A line's text for the search: its source, message and fields. */
const logText = (e: LogEntry) =>
  `${e.source} ${e.message} ${e.fields ? JSON.stringify(e.fields) : ''}`.toLowerCase()

/**
 * The prototype's log, from the lines the server keeps in memory: the level is asked of the server,
 * the search narrows what came back as you type. The download has every line on disk.
 */
function Logs() {
  const t = useT(messages)
  const locale = useLocale()
  const [level, setLevel] = useState<LogEntry['level']>('info')
  const [q, setQ] = useState('')
  const logs = useQuery(
    `system:logs:${level}`,
    (c) => c.system.logs({ query: { level, limit: LOG_LIMIT } }),
    [OPERATIONS_TOPICS.logs],
  )
  const clock = new Intl.DateTimeFormat(dateLocale(locale), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const needle = q.trim().toLowerCase()
  return (
    <div className="grid gap-6">
      <TableFrame>
        <TableToolbar>
          <Select
            aria-label={t('logs.show')}
            value={level}
            onValueChange={(v) => setLevel(v as LogEntry['level'])}
            options={LOG_LEVELS.map((l) => ({ value: l, label: t(`logs.${l}`) }))}
            className="w-52"
          />
          <Input
            icon="search"
            type="search"
            aria-label={t('logs.search')}
            placeholder={t('logs.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-64"
          />
          <Button size="sm" icon="download" className="ms-auto" asChild>
            <a href={`${API_PREFIX}/system/logs/download`} download>
              {t('logs.download')}
            </a>
          </Button>
        </TableToolbar>
        <Loadable query={logs} what={t('logs.what')}>
          {(l) => {
            const shown = needle ? l.entries.filter((e) => logText(e).includes(needle)) : l.entries
            const size = l.files.reduce((sum, f) => sum + f.size, 0)
            return (
              <>
                {shown.length === 0 ? (
                  <p className="px-3.5 py-8 text-center text-caption text-text-3">
                    {t('logs.nothing')}
                  </p>
                ) : (
                  <ol
                    aria-label={t('logs.label')}
                    className="grid divide-y divide-line font-mono text-figure"
                  >
                    {shown.slice(0, LOG_SHOWN).map((e, i) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: log lines can repeat exactly
                        key={i}
                        className="grid gap-1 px-3.5 py-2 medium:grid-cols-[10rem_4.5rem_7rem_minmax(0,1fr)] medium:gap-3"
                      >
                        <span className="text-text-3">{clock.format(new Date(e.at))}</span>
                        <span>
                          <Badge tone={logTone[e.level]}>{e.level}</Badge>
                        </span>
                        <span className="truncate text-text-2" title={e.source}>
                          {e.source}
                        </span>
                        <span className="break-words text-text">{e.message}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="border-line border-t px-3.5 py-2 text-caption text-text-3">
                  {t('logs.kept', { days: String(l.files.length), size: bytes(size) })}
                </p>
              </>
            )
          }}
        </Loadable>
      </TableFrame>
      <Crashes />
    </div>
  )
}

/** Crash reports, each to download and attach to an issue; whether they're written is General's. */
function Crashes() {
  const t = useT(messages)
  const locale = useLocale()
  const crashes = useQuery('system:crashes', (c) => c.system.crashes(), [OPERATIONS_TOPICS.logs])
  const general = useQuery('settings:general', (c) => c.settings.general(), [
    OPERATIONS_TOPICS.settings,
  ])
  const when = new Intl.DateTimeFormat(dateLocale(locale), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <Group title={t('crashes.title')} description={t('crashes.description')}>
      {general.data && !general.data.crashReports && (
        <p className="text-caption text-text-2">
          <a
            href="/settings/general"
            className="rounded-sm underline underline-offset-2 outline-none hover:text-text focus-visible:ring-focus"
          >
            {t('crashes.off')}
          </a>
        </p>
      )}
      <Loadable query={crashes} what={t('crashes.what')}>
        {(cs: CrashReport[]) =>
          cs.length === 0 ? (
            <p className="text-caption text-text-3">{t('crashes.none')}</p>
          ) : (
            <ul aria-label={t('crashes.label')} className="grid gap-2">
              {cs.map((c) => {
                const at = when.format(new Date(c.at))
                return (
                  <li
                    key={c.id}
                    className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line px-3 py-2"
                  >
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-text text-ui" title={c.message}>
                        {c.message}
                      </span>
                      <span className="text-caption text-text-3">
                        {at} · <span className="font-mono">{c.origin}</span> · {bytes(c.size)}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" icon="download" asChild>
                      <a
                        href={`${API_PREFIX}/system/crashes/${encodeURIComponent(c.id)}`}
                        download
                        aria-label={t('crashes.downloadLabel', { at })}
                      >
                        {t('crashes.download')}
                      </a>
                    </Button>
                  </li>
                )
              })}
            </ul>
          )
        }
      </Loadable>
    </Group>
  )
}

// ---------------------------------------------------------------- events

/** Events kept on screen. */
const EVENTS_SHOWN = 40

/** The live event stream every app listens to, as it arrives. */
function Events() {
  const t = useT(messages)
  const locale = useLocale()
  const client = useClient()
  const [seen, setSeen] = useState<{ id: number; at: number; topic: string; ids?: string[] }[]>([])
  useEffect(
    () =>
      client.events.subscribe((e) =>
        setSeen((s) =>
          [{ id: e.id, at: e.at, topic: e.topic, ids: e.ids }, ...s].slice(0, EVENTS_SHOWN),
        ),
      ),
    [client],
  )
  const clock = new Intl.DateTimeFormat(dateLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return (
    <div className="grid max-w-200 gap-3">
      <p className="text-caption text-text-3">{t('events.intro')}</p>
      {seen.length === 0 ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-line bg-s1 p-6 text-center text-caption text-text-3"
        >
          {t('events.listening')}
        </p>
      ) : (
        <ol
          aria-label={t('events.label')}
          aria-live="polite"
          className="grid divide-y divide-line rounded-lg border border-line bg-s1 font-mono text-figure"
        >
          {seen.map((e, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a reset can repeat an id; the order is the identity
              key={i}
              className="flex min-w-0 gap-3 px-3.5 py-2"
            >
              <span className="w-20 shrink-0 text-text-3">{clock.format(new Date(e.at))}</span>
              <span className="shrink-0 text-text">{e.topic}</span>
              {e.ids && e.ids.length > 0 && (
                <span className="min-w-0 truncate text-text-3" title={e.ids.join(', ')}>
                  {e.ids.join(', ')}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- backups

function Backups() {
  const t = useT(messages)
  const locale = useLocale()
  const { relative } = useRelative()
  const backups = useQuery('system:backups', (c) => c.system.backups(), [OPERATIONS_TOPICS.backups])
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])
  const make = useAction((c) => c.system.backupNow())
  const restore = useAction((c, id: string) => c.system.restore({ params: { id } }))
  const remove = useAction((c, id: string) => c.system.deleteBackup({ params: { id } }))
  const [restoring, setRestoring] = useState<Backup | null>(null)
  const [deleting, setDeleting] = useState<Backup | null>(null)
  const [restarting, setRestarting] = useState(false)
  const name = info.data?.name ?? 'highsea'
  const format = new Intl.DateTimeFormat(dateLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const date = (b: Backup | null) => (b ? format.format(new Date(b.createdAt)) : '')

  if (restarting) return <Restarting name={name} />

  return (
    <Loadable query={backups} what={t('backups.what')}>
      {(list) => (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="me-auto grid gap-0.5 text-caption text-text-3">
              <p>{t('backups.intro')}</p>
              <p>
                {list.nextRun
                  ? t('backups.next', { when: relative(list.nextRun) })
                  : t('backups.off')}{' '}
                <a
                  href="/settings/backups"
                  className="rounded-sm text-text-2 underline underline-offset-2 outline-none hover:text-text focus-visible:ring-focus"
                >
                  {t('backups.schedule')}
                </a>
              </p>
            </div>
            <Button
              icon="backup"
              loading={make.pending}
              onClick={() =>
                make.run().then(
                  () => {
                    toast.success(t('backups.made'), { description: t('backups.madeBody') })
                    backups.refetch()
                  },
                  (e: Error) => toast.error(t('backups.makeFailed'), { description: e.message }),
                )
              }
            >
              {t('backups.now')}
            </Button>
          </div>
          {list.backups.length === 0 ? (
            <EmptyState icon="backup" title={t('backups.none')}>
              {t('backups.noneBody')}
            </EmptyState>
          ) : (
            <TableFrame>
              <Table aria-label={t('backups.label')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('backups.made.column')}</TableHead>
                    <TableHead>{t('backups.kind')}</TableHead>
                    <TableHead>{t('backups.version')}</TableHead>
                    <TableHead numeric>{t('backups.size')}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t('backups.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.backups.map((b) => {
                    const d = date(b)
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="text-text">
                          <div className="grid gap-0.5">
                            <span>{d}</span>
                            {b.problem && (
                              <span className="text-badge-warning text-caption">{b.problem}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-text-2">{t(`backups.kind.${b.kind}`)}</TableCell>
                        <TableCell className="font-mono text-figure text-text-2">
                          {b.version ?? '–'}
                        </TableCell>
                        <TableCell numeric>{bytes(b.size)}</TableCell>
                        <TableCell className="text-end">
                          <span className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" icon="download" asChild>
                              <a
                                href={`${API_PREFIX}/system/backups/${encodeURIComponent(b.id)}/download`}
                                download
                                aria-label={t('backups.downloadLabel', { date: d })}
                              >
                                {t('backups.download')}
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              disabled={b.problem !== null}
                              aria-label={t('backups.restoreLabel', { date: d })}
                              onClick={() => setRestoring(b)}
                            >
                              {t('backups.restore')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="delete"
                              iconOnly
                              aria-label={t('backups.deleteLabel', { date: d })}
                              onClick={() => setDeleting(b)}
                            />
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableFrame>
          )}
          <ConfirmDialog
            open={!!restoring}
            onOpenChange={(o) => !o && setRestoring(null)}
            title={t('backups.restoreTitle', { date: date(restoring) })}
            description={t('backups.restoreBody', { name })}
            confirmLabel={t('backups.restoreConfirm')}
            cancelLabel={t('backups.keep')}
            destructive
            onConfirm={() => {
              const b = restoring
              if (b)
                restore.run(b.id).then(
                  () => setRestarting(true),
                  (e: Error) => toast.error(t('backups.restoreFailed'), { description: e.message }),
                )
            }}
          />
          <ConfirmDialog
            open={!!deleting}
            onOpenChange={(o) => !o && setDeleting(null)}
            title={t('backups.deleteTitle', { date: date(deleting) })}
            description={t('backups.deleteBody')}
            confirmLabel={t('backups.deleteConfirm')}
            cancelLabel={t('backups.keep')}
            destructive
            onConfirm={() => {
              const b = deleting
              if (b)
                remove.run(b.id).then(
                  () => {
                    toast({ title: t('backups.deleted') })
                    backups.refetch()
                  },
                  (e: Error) => toast.error(t('backups.deleteFailed'), { description: e.message }),
                )
            }}
          />
        </div>
      )}
    </Loadable>
  )
}

/** How often the restarting page asks whether the server is back. */
const RESTART_POLL = 1500
/** A restart too quick to be seen down still counts once this has passed. */
const RESTART_GRACE = 20_000

/**
 * After a restore: the server exits and comes back on the backup. Asks `/api/health` until the
 * server has been away and answers again (any answer: a degraded server is up and says why on
 * Health), then reloads, which lands on sign-in if the restored database doesn't know this session.
 */
function Restarting({ name }: { name: string }) {
  const t = useT(messages)
  const client = useClient()
  useEffect(() => {
    const started = Date.now()
    let down = false
    let timer: ReturnType<typeof setTimeout>
    let stopped = false
    const back = () => down || Date.now() - started > RESTART_GRACE
    const tick = async () => {
      let up = true
      try {
        await client.system.health()
      } catch (e) {
        // status 0: nothing answered; any other status is the server answering
        up = (e as ApiError).status > 0
      }
      if (stopped) return
      if (!up) down = true
      else if (back()) return window.location.reload()
      timer = setTimeout(tick, RESTART_POLL)
    }
    timer = setTimeout(tick, RESTART_POLL)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [client])
  return (
    <section
      aria-live="polite"
      aria-label={t('restarting.title')}
      className="grid max-w-160 gap-3 rounded-lg border border-line bg-s1 p-5"
    >
      <h2 className="flex items-center gap-2 font-semibold text-text text-title">
        <Icon name="loading" size={18} className="motion-safe:animate-spin" />
        {t('restarting.title')}
      </h2>
      <p className="text-body text-text-2">{t('restarting.body', { name })}</p>
      <p className="text-caption text-text-3">{t('restarting.waiting')}</p>
    </section>
  )
}

// ---------------------------------------------------------------- updates

/** This version and the newest on the channel, from the signed catalog; Docker pulls the update. */
function Updates() {
  const t = useT(messages)
  const locale = useLocale()
  const { relative } = useRelative()
  const updates = useQuery('system:updates', (c) => c.system.updates(), [
    OPERATIONS_TOPICS.updates,
    OPERATIONS_TOPICS.settings,
    INDEXER_TOPICS.catalog,
  ])
  // the releases ride the catalog's manifest, so checking the catalog checks for updates
  const check = useAction((c) => c.catalog.check())
  const day = new Intl.DateTimeFormat(dateLocale(locale), { dateStyle: 'long', timeZone: 'UTC' })
  return (
    <Loadable query={updates} what={t('updates.what')}>
      {(u) => (
        <section
          aria-label={t('updates.label')}
          className="grid max-w-160 gap-4 rounded-lg border border-line bg-s1 p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={u.available ? 'accent' : 'neutral'}>{t(`updates.${u.channel}`)}</Badge>
            <p className="text-text text-ui">
              {u.available && u.latest
                ? t('updates.available', { latest: u.latest.version, current: u.current })
                : u.latest
                  ? t('updates.current', { current: u.current })
                  : t('updates.unknown', { current: u.current })}
            </p>
          </div>
          {u.available && u.latest && (
            <div className="grid gap-2">
              <p className="text-caption text-text-3">
                {t('updates.released', { date: day.format(new Date(u.latest.date)) })}
              </p>
              {u.latest.notes.length > 0 && (
                <ul
                  aria-label={t('updates.notes')}
                  className="grid list-disc gap-1 ps-5 text-body text-text-2"
                >
                  {u.latest.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {u.latest.url && (
                <a
                  href={u.latest.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 justify-self-start rounded-sm text-accent-text text-ui outline-none hover:underline focus-visible:ring-focus"
                >
                  {t('updates.notes')}
                  <Icon name="external" size={14} />
                </a>
              )}
            </div>
          )}
          <p className="text-caption text-text-3">{t('updates.docker')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon="refresh"
              loading={check.pending}
              onClick={() =>
                check.run().then(
                  () => updates.refetch(),
                  (e: Error) => toast.error(t('updates.checkFailed'), { description: e.message }),
                )
              }
            >
              {t('updates.check')}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href="/settings/general">{t('updates.settings')}</a>
            </Button>
            <span className="ms-auto text-caption text-text-3">
              {u.checkedAt
                ? t('updates.checked', { ago: relative(u.checkedAt) })
                : t('updates.never')}
            </span>
          </div>
        </section>
      )}
    </Loadable>
  )
}
