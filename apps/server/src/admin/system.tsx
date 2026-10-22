'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// System (A16, system.md): the prototype's tabs, each at its own address, as far as checkpoint 8a
// builds them. Health (`/system`, and `/system/health` as the prototype has it) is the prototype's
// Health list with About below it: About is the server's addition (checkpoint 4, for TMDB's terms;
// checkpoint 5 adds the indexer catalog's version and Check now). Tasks (`/system/tasks`, 8a) lists
// every schedule with Run now. The prototype opens on Status, which comes with 8b's Status, Logs,
// Events, Backups and Updates; until then Health is the first tab.
import {
  DOWNLOAD_TOPICS,
  type HealthCheck,
  INDEXER_TOPICS,
  type Task,
  TMDB_ATTRIBUTION,
} from '@highsea/api-contract'
import { duration } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Icon,
  type IconName,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import { TmdbNotice } from './attribution.tsx'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { AdminPage } from './shell.tsx'
import { system as messages } from './system-messages.ts'
import { useNow, useRelative } from './time.ts'

export type SystemTab = 'health' | 'tasks'
const tabPath = (tab: SystemTab) => (tab === 'health' ? '/system' : `/system/${tab}`)

export function System({ tab = 'health' }: { tab?: SystemTab }) {
  const t = useT(messages)
  const router = useRouter()
  const health = useQuery('system:health', (c) => c.system.healthChecks(), HEALTH_TOPICS)
  const problems = (health.data ?? []).filter((h) => h.level === 'warning' || h.level === 'error')
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Tabs value={tab} onValueChange={(v) => router.push(tabPath(v as SystemTab))} variant="line">
        <TabsList aria-label={t('sections')}>
          <TabsTrigger value="health" count={problems.length || undefined}>
            {t('tab.health')}
          </TabsTrigger>
          <TabsTrigger value="tasks">{t('tab.tasks')}</TabsTrigger>
        </TabsList>
        <TabsContent value="health" className="pt-5">
          <div className="grid max-w-200 gap-6">
            <Group title={t('health.title')} description={t('health.description')}>
              <Health />
            </Group>
            <About />
            <p className="text-caption text-text-3">{t('later')}</p>
          </div>
        </TabsContent>
        <TabsContent value="tasks" className="pt-5">
          <Tasks />
        </TabsContent>
      </Tabs>
    </AdminPage>
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

/** What changes a check: the server and its settings, an indexer, a download or the VPN. */
const HEALTH_TOPICS = [
  'server.updated',
  'settings.updated',
  INDEXER_TOPICS.health,
  DOWNLOAD_TOPICS.queue,
  DOWNLOAD_TOPICS.vpn,
]

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
const taskName = (t: ReturnType<typeof useT<typeof messages>>, id: string) => {
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
