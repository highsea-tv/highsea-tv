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
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  type BadgeTone,
  Button,
  ConfirmDialog,
  Details,
  EmptyState,
  Figure,
  GetTheAppsDialog,
  Icon,
  type IconName,
  Panel,
  Press,
  ProgressBar,
  SearchField,
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
  Text,
  TextLink,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { type ReactNode, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { TmdbNotice } from './attribution.tsx'
import { Loadable } from './loadable.tsx'
import { Group } from './settings.tsx'
import { AdminPage, useShell } from './shell.tsx'
import { system as messages } from './system-messages.ts'
import { useTabAddress } from './tabs.ts'
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

/** Dates in the admin's language; English reads day-month, as the prototype does. */
const dateLocale = (locale: string) => (locale === 'en' ? 'en-GB' : locale)

const sp = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure
/** Health's and Events' measure (the web's max-w-200). */
const MEASURE = 800

export function System({ tab: asked = 'status' }: { tab?: SystemTab }) {
  const t = useT(messages)
  const setTab = useTabAddress<SystemTab>('/system', 'status')
  const owner = useShell().role === 'owner'
  const shown = SYSTEM_TABS.filter((id) => owner || id !== 'backups')
  const tab = shown.includes(asked) ? asked : 'status'
  const health = useQuery('system:health', (c) => c.system.healthChecks(), HEALTH_TOPICS)
  const problems = (health.data ?? []).filter((h) => h.level === 'warning' || h.level === 'error')
  const tabs = shown.map((id) => ({
    value: id,
    label: t(`tab.${id}`),
    count: id === 'health' ? problems.length || undefined : undefined,
  }))
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <View>
        {/* the tabs scroll sideways rather than wrap in a narrow window (the web's overflow-x-auto),
            and their rule runs the page's width, as the web's line list does */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View style={{ flexGrow: 1 }}>
            <Tabs
              variant="line"
              aria-label={t('sections')}
              options={tabs}
              value={tab}
              onValueChange={setTab}
            />
          </View>
        </ScrollView>
        <View
          role="tabpanel"
          aria-label={tabs.find((x) => x.value === tab)?.label}
          style={{ paddingTop: sp['5'] }}
        >
          {tab === 'status' ? (
            <Status />
          ) : tab === 'health' ? (
            <View style={{ maxWidth: MEASURE, gap: sp['3'] }}>
              <Text variant="caption" color="text-3">
                {t('health.description')}
              </Text>
              <Health />
            </View>
          ) : tab === 'tasks' ? (
            <Tasks />
          ) : tab === 'logs' ? (
            <Logs />
          ) : tab === 'events' ? (
            <Events />
          ) : tab === 'backups' ? (
            <Backups />
          ) : (
            <Updates />
          )}
        </View>
      </View>
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
  const side = useWindowAtLeast(breakpoints.expanded)
  const [apps, setApps] = useState(false)
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])
  const status = useQuery('system:status', (c) => c.system.status(), STATUS_TOPICS, {
    interval: STATUS_EVERY,
  })
  return (
    <View style={{ gap: GAP }}>
      <Loadable query={status} what={t('status.what')}>
        {(s) => (
          <View style={{ gap: GAP }}>
            <Panel>
              <StatRow>
                <Stat value={s.version} caption={t('status.version')} />
                <Stat
                  value={duration(Math.max(0, (now - Date.parse(s.startedAt)) / 1000), locale)}
                  caption={t('status.uptime')}
                />
                <Stat value={String(s.clientsConnected)} caption={t('status.apps')} />
                <Stat value={s.catalogVersion ?? '–'} caption={t('status.catalog')} />
              </StatRow>
            </Panel>
            <View style={{ flexDirection: side ? 'row' : 'column', gap: GAP }}>
              <View style={side ? HALF : undefined}>
                <Resources s={s} fill={side} />
              </View>
              <View style={side ? HALF : undefined}>
                <Panel title={t('status.addresses')} gap={tokens.space['2']} fill={side}>
                  <Details
                    terms="ui"
                    rows={[
                      {
                        term: t('status.lan'),
                        value:
                          s.addresses.local.length === 0 ? (
                            <Figure>{t('status.notSet')}</Figure>
                          ) : (
                            <View>
                              {s.addresses.local.map((a) => (
                                <Figure key={a} title={a}>
                                  {a}
                                </Figure>
                              ))}
                            </View>
                          ),
                      },
                      {
                        term: t('status.remote'),
                        value: <Figure>{s.addresses.public ?? t('status.notSet')}</Figure>,
                      },
                    ]}
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      columnGap: sp['4'],
                      rowGap: sp['1'],
                    }}
                  >
                    <TextLink href="/settings/network">{t('status.network')}</TextLink>
                    {/* the desktop app, with the address apps use (desktop-app.md › Get the apps) */}
                    <TextLink onPress={() => setApps(true)}>{t('status.getApps')}</TextLink>
                  </View>
                  <GetTheAppsDialog
                    open={apps}
                    onOpenChange={setApps}
                    server={info.data?.name ?? 'highsea'}
                    address={s.addresses.public ?? s.addresses.local[0] ?? ''}
                    onSay={(title, ok) => (ok ? toast({ title }) : toast.error(title))}
                  />
                </Panel>
              </View>
            </View>
            <Disks disks={s.disks} />
          </View>
        )}
      </Loadable>
      <View style={{ maxWidth: ABOUT_WIDTH }}>
        <About />
      </View>
    </View>
  )
}

/** Between Status's panels (the web's gap-4). */
const GAP = tokens.space['4']
/** About's measure (the web's max-w-200, 800). */
const ABOUT_WIDTH = 800
/** A column of two side by side. */
const HALF = { flex: 1, flexBasis: 0, minWidth: 0 } as const

/** The four figures: two to a row in a compact window, four otherwise. */
function StatRow({ children }: { children: ReactNode[] }) {
  const four = useWindowAtLeast(breakpoints.medium)
  const per = four ? 4 : 2
  const rows: ReactNode[][] = []
  for (let i = 0; i < children.length; i += per) rows.push(children.slice(i, i + per))
  return (
    <View style={{ gap: GAP }}>
      {rows.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the rows are fixed, in order
        <View key={i} style={{ flexDirection: 'row', gap: GAP }}>
          {row.map((cell, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the cells are fixed, in order
            <View key={j} style={HALF}>
              {cell}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

function Resources({ s, fill }: { s: SystemStatus; fill: boolean }) {
  const t = useT(messages)
  return (
    <Panel title={t('status.resources')} fill={fill}>
      <Text variant="caption" color="text-3">
        {t('status.cpu')}
      </Text>
      <ProgressBar look="panel" value={s.cpu} showValue label={t('status.cpuLabel')} />
      <Text variant="caption" color="text-3">
        {t('status.memory', { used: bytes(s.memory.used), total: bytes(s.memory.total) })}
      </Text>
      <ProgressBar
        look="panel"
        value={s.memory.total ? (s.memory.used / s.memory.total) * 100 : 0}
        showValue
        label={t('status.memoryLabel')}
      />
      <Text variant="caption" color="text-3">
        {t('status.process', {
          cpu: percent(s.process.cpu / 100),
          memory: bytes(s.process.memory),
        })}
      </Text>
    </Panel>
  )
}

const USED_BY = ['movies', 'downloads', 'other'] as const

function Disks({ disks }: { disks: SystemStatus['disks'] }) {
  const t = useT(messages)
  const ui = tokens.adminText.ui
  return (
    <Panel title={t('status.disks')} gap={GAP}>
      {disks.length === 0 && (
        <Text variant="caption" color="text-3">
          {t('status.noDisks')}
        </Text>
      )}
      {disks.map((d) => {
        const used = d.total - d.free
        const fraction = d.total ? used / d.total : 0
        return (
          <View key={d.path} style={{ gap: tokens.space['1'] + tokens.space['0.5'], minWidth: 0 }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                columnGap: tokens.space['2'],
                minWidth: 0,
              }}
            >
              <Text size={ui.size} leading={ui.leading}>
                {d.label}
              </Text>
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Figure color="text-3" title={d.path}>
                  {d.path}
                </Figure>
              </View>
              <Text
                size={ui.size}
                leading={ui.leading}
                color="text-2"
                style={{ marginStart: 'auto' }}
              >
                {t('status.free', { free: bytes(d.free), total: bytes(d.total) })}
              </Text>
            </View>
            <ProgressBar
              look="panel"
              value={fraction * 100}
              tone={d.total && d.free / d.total < 0.1 ? 'warning' : 'accent'}
              label={t('status.used', { label: d.label, percent: percent(fraction) })}
            />
            <Text variant="caption" color="text-3">
              {USED_BY.filter((k) => d.usedBy[k] > 0)
                .map((k) => t(`status.usedBy.${k}`, { size: bytes(d.usedBy[k]) }))
                .join(' · ')}
            </Text>
          </View>
        )
      })}
    </Panel>
  )
}

/** About's terms' column in a regular window (the web's 10rem). */
const TERM_WIDTH = 160

/** The server, its version, the indexer catalog, and the services whose data it shows. */
function About() {
  const t = useT(messages)
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])
  return (
    <Panel look="group" title={t('about.title')} description={t('about.description')}>
      <Loadable query={info} what={t('what')}>
        {(i) => (
          <Details
            stack
            termWidth={TERM_WIDTH}
            gap={tokens.space['3']}
            rows={[
              { term: t('about.name'), value: i.name },
              { term: t('about.version'), value: <Figure>{i.version}</Figure> },
              { term: t('about.catalog'), value: <Catalog /> },
              ...(i.attributions.length > 0
                ? [
                    {
                      term: t('about.data'),
                      value: (
                        <View style={{ gap: tokens.space['3'] }}>
                          {i.attributions.map((a) =>
                            a.name === TMDB_ATTRIBUTION.name ? (
                              <TmdbNotice key={a.name} />
                            ) : (
                              // the notice names the service ("Subtitles provided by
                              // OpenSubtitles.com"), so it's the link
                              <TextLink key={a.name} href={a.url}>
                                {a.notice || a.name}
                              </TextLink>
                            ),
                          )}
                        </View>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Loadable>
    </Panel>
  )
}

/** The indexer catalog's version and last check, and Check now. */
function Catalog() {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const status = useQuery('catalog-status', (c) => c.catalog.status(), [INDEXER_TOPICS.catalog])
  const check = useAction((c) => c.catalog.check())
  if (status.status === 'loading') return <Skeleton width={160} height={20} />
  if (status.status === 'error')
    return (
      <Text variant="caption" color="text-3">
        {status.error.message}
      </Text>
    )
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
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: tokens.space['3'],
        rowGap: tokens.space['1'],
      }}
    >
      <Figure>{s.version ?? t('catalog.none')}</Figure>
      {s.lastCheck && (
        <Text variant="caption" color="text-3">
          {s.lastCheck.ok
            ? t('catalog.checked', { ago })
            : t('catalog.checkFailed', { ago, message: s.lastCheck.message ?? '' })}
        </Text>
      )}
      <Button size="sm" icon="refresh" loading={check.pending} onPress={onCheck}>
        {t('catalog.check')}
      </Button>
    </View>
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

/** A list of rows in a box, each but the first with the line above it (the web's divide-y). */
const divided = (i: number, line: string) =>
  i > 0 ? { borderTopWidth: 1, borderTopColor: line } : null

/** Text that breaks anywhere rather than overflow (the web's overflow-wrap: anywhere). */
const ANYWHERE = { overflowWrap: 'anywhere' } as object

/** The prototype's Health list: each check with its level, where it comes from and since when. */
function Health() {
  const t = useT(messages)
  const theme = useTheme()
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
          <View role="list" aria-label={t('health.label')} style={{ gap: sp['2'] }}>
            {checks.map((c) => {
              const l = levels[c.level]
              return (
                <View
                  key={c.id}
                  role="listitem"
                  style={{
                    flexDirection: 'row',
                    gap: sp['3'],
                    padding: sp['4'],
                    borderWidth: 1,
                    borderColor: theme.colors.line,
                    borderRadius: tokens.radius.lg,
                    backgroundColor: theme.colors.s1,
                  }}
                >
                  <View style={{ marginTop: sp['0.5'] }}>
                    <Icon name={l.icon} size={18} color="text-2" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: sp['1'] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: sp['2'],
                      }}
                    >
                      <Badge tone={l.tone}>{t(`health.${c.level}`)}</Badge>
                      <Text size={ui.size} leading={ui.leading} weight={600}>
                        {c.source}
                      </Text>
                      <Text variant="caption" color="text-3">
                        {t('health.since', { ago: relative(c.since) })}
                      </Text>
                    </View>
                    <Text color="text-2" style={ANYWHERE}>
                      {c.message}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
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

/** A cell's words in `text-2`, as the web's `text-text-2` cells. */
function Muted({ children }: { children: string }) {
  return (
    <Text size={ui.size} leading={ui.leading} color="text-2" numberOfLines={1}>
      {children}
    </Text>
  )
}

/** The state column's width (the web's w-44). */
const STATE_WIDTH = 176

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
            <Table label={t('tasks.label')}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('tasks.task')}</TableHead>
                  <TableHead width={STATE_WIDTH}>{t('tasks.state')}</TableHead>
                  <TableHead>{t('tasks.every')}</TableHead>
                  <TableHead>{t('tasks.lastRun')}</TableHead>
                  <TableHead>{t('tasks.nextRun')}</TableHead>
                  <TableHead hidden>{t('tasks.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ts.map((task) => {
                  const name = taskName(t, task.id)
                  return (
                    <TableRow key={task.id}>
                      <TableCell>{name}</TableCell>
                      <TableCell maxWidth={STATE_WIDTH}>
                        <View style={{ gap: sp['1'], alignItems: 'flex-start', minWidth: 0 }}>
                          <Badge tone={taskStates[task.state]}>{t(`state.${task.state}`)}</Badge>
                          {task.state === 'failed' && task.lastError ? (
                            <Text variant="caption" color="text-3">
                              {task.lastError}
                            </Text>
                          ) : null}
                        </View>
                      </TableCell>
                      <TableCell>
                        <Muted>{duration(task.interval, locale)}</Muted>
                      </TableCell>
                      <TableCell>
                        <Muted>{task.lastRun ? relative(task.lastRun) : t('tasks.never')}</Muted>
                      </TableCell>
                      <TableCell>
                        <Muted>{task.nextRun ? relative(task.nextRun) : t('tasks.off')}</Muted>
                      </TableCell>
                      <TableCell align="end">
                        <Button
                          size="sm"
                          icon="play"
                          disabled={task.state === 'running' || task.state === 'queued'}
                          accessibilityLabel={t('tasks.runLabel', { name })}
                          onPress={() => onRun(task)}
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
/** The toolbar's level menu and search (the web's w-52 and w-64). */
const LEVEL_WIDTH = 208
const SEARCH_WIDTH = 256
/** A line's columns from a medium window up: time, level, source (the web's 10rem 4.5rem 7rem). */
const LOG_COLUMNS = [160, 72, 112] as const
/** A row's padding (the web's px-3.5 py-2). */
const ROW_PAD = { paddingHorizontal: sp['3'] + sp['0.5'], paddingVertical: sp['2'] } as const

/** A line's text for the search: its source, message and fields. */
const logText = (e: LogEntry) =>
  `${e.source} ${e.message} ${e.fields ? JSON.stringify(e.fields) : ''}`.toLowerCase()

/** The log's figures: mono 12 (the web's font-mono text-figure). */
function Mono({
  children,
  color = 'text',
  title,
  truncate,
}: {
  children: string
  color?: 'text' | 'text-2' | 'text-3'
  title?: string
  truncate?: boolean
}) {
  return (
    <Text
      size={figure.size}
      leading={figure.leading}
      mono
      color={color}
      numberOfLines={truncate ? 1 : undefined}
      {...(title ? ({ title } as object) : null)}
      style={truncate ? undefined : ANYWHERE}
    >
      {children}
    </Text>
  )
}

/**
 * The prototype's log, from the lines the server keeps in memory: the level is asked of the server,
 * the search narrows what came back as you type. The download has every line on disk.
 */
function Logs() {
  const t = useT(messages)
  const theme = useTheme()
  const locale = useLocale()
  const columns = useWindowAtLeast(breakpoints.medium)
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
    <View style={{ gap: sp['6'] }}>
      <TableFrame>
        <TableToolbar>
          <View style={{ width: LEVEL_WIDTH }}>
            <Select
              aria-label={t('logs.show')}
              value={level}
              onValueChange={(v) => setLevel(v as LogEntry['level'])}
              options={LOG_LEVELS.map((l) => ({ value: l, label: t(`logs.${l}`) }))}
            />
          </View>
          <View style={{ width: SEARCH_WIDTH, maxWidth: '100%' }}>
            <SearchField
              label={t('logs.search')}
              role="searchbox"
              placeholder={t('logs.search')}
              clearLabel={t('logs.clear')}
              value={q}
              onChangeText={setQ}
            />
          </View>
          <View style={{ marginStart: 'auto' }}>
            <Button
              size="sm"
              icon="download"
              href={`${API_PREFIX}/system/logs/download`}
              follow="download"
            >
              {t('logs.download')}
            </Button>
          </View>
        </TableToolbar>
        <Loadable query={logs} what={t('logs.what')}>
          {(l) => {
            const shown = needle ? l.entries.filter((e) => logText(e).includes(needle)) : l.entries
            const size = l.files.reduce((sum, f) => sum + f.size, 0)
            return (
              <>
                {shown.length === 0 ? (
                  <View
                    style={{
                      paddingHorizontal: ROW_PAD.paddingHorizontal,
                      paddingVertical: sp['8'],
                    }}
                  >
                    <Text variant="caption" color="text-3" align="center">
                      {t('logs.nothing')}
                    </Text>
                  </View>
                ) : (
                  <View role="list" aria-label={t('logs.label')}>
                    {shown.slice(0, LOG_SHOWN).map((e, i) => (
                      <View
                        // biome-ignore lint/suspicious/noArrayIndexKey: log lines can repeat exactly
                        key={i}
                        role="listitem"
                        style={[
                          ROW_PAD,
                          {
                            flexDirection: columns ? 'row' : 'column',
                            // the level's badge on the line's baseline, not its padded top
                            // (https://reactnative.dev/docs/layout-props#alignitems)
                            alignItems: columns ? 'baseline' : 'stretch',
                            gap: columns ? sp['3'] : sp['1'],
                          },
                          divided(i, theme.colors.line),
                        ]}
                      >
                        <View style={columns ? { width: LOG_COLUMNS[0] } : undefined}>
                          <Mono color="text-3">{clock.format(new Date(e.at))}</Mono>
                        </View>
                        <View
                          style={[
                            { alignItems: 'flex-start' },
                            columns ? { width: LOG_COLUMNS[1] } : null,
                          ]}
                        >
                          <Badge tone={logTone[e.level]}>{e.level}</Badge>
                        </View>
                        <View style={columns ? { width: LOG_COLUMNS[2], minWidth: 0 } : undefined}>
                          <Mono color="text-2" title={e.source} truncate>
                            {e.source}
                          </Mono>
                        </View>
                        <View style={{ flex: columns ? 1 : undefined, minWidth: 0 }}>
                          <Mono>{e.message}</Mono>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                <View style={[ROW_PAD, { borderTopWidth: 1, borderTopColor: theme.colors.line }]}>
                  <Text variant="caption" color="text-3">
                    {t('logs.kept', { days: String(l.files.length), size: bytes(size) })}
                  </Text>
                </View>
              </>
            )
          }}
        </Loadable>
      </TableFrame>
      <Crashes />
    </View>
  )
}

/** Crash reports, each to download and attach to an issue; whether they're written is General's. */
function Crashes() {
  const t = useT(messages)
  const theme = useTheme()
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
      {general.data && !general.data.crashReports ? (
        <TextLink href="/settings/general">{t('crashes.off')}</TextLink>
      ) : null}
      <Loadable query={crashes} what={t('crashes.what')}>
        {(cs: CrashReport[]) =>
          cs.length === 0 ? (
            <Text variant="caption" color="text-3">
              {t('crashes.none')}
            </Text>
          ) : (
            <View role="list" aria-label={t('crashes.label')} style={{ gap: sp['2'] }}>
              {cs.map((c) => {
                const at = when.format(new Date(c.at))
                return (
                  <View
                    key={c.id}
                    role="listitem"
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      columnGap: sp['3'],
                      rowGap: sp['1'],
                      minWidth: 0,
                      paddingHorizontal: sp['3'],
                      paddingVertical: sp['2'],
                      borderWidth: 1,
                      borderColor: theme.colors.line,
                      borderRadius: tokens.radius.md,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        size={ui.size}
                        leading={ui.leading}
                        numberOfLines={1}
                        {...({ title: c.message } as object)}
                      >
                        {c.message}
                      </Text>
                      <Text variant="caption" color="text-3">
                        {`${at} · `}
                        <Text variant="caption" color="text-3" mono>
                          {c.origin}
                        </Text>
                        {` · ${bytes(c.size)}`}
                      </Text>
                    </View>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="download"
                      href={`${API_PREFIX}/system/crashes/${encodeURIComponent(c.id)}`}
                      follow="download"
                      accessibilityLabel={t('crashes.downloadLabel', { at })}
                    >
                      {t('crashes.download')}
                    </Button>
                  </View>
                )
              })}
            </View>
          )
        }
      </Loadable>
    </Group>
  )
}

// ---------------------------------------------------------------- events

/** Events kept on screen. */
const EVENTS_SHOWN = 40
/** An event's time column (the web's w-20). */
const EVENT_TIME = 80

/** The live event stream every app listens to, as it arrives. */
function Events() {
  const t = useT(messages)
  const theme = useTheme()
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
  const box = {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: tokens.radius.lg,
    backgroundColor: theme.colors.s1,
  } as const
  return (
    <View style={{ maxWidth: MEASURE, gap: sp['3'] }}>
      <Text variant="caption" color="text-3">
        {t('events.intro')}
      </Text>
      {seen.length === 0 ? (
        <View aria-live="polite" style={[box, { padding: sp['6'] }]}>
          <Text variant="caption" color="text-3" align="center">
            {t('events.listening')}
          </Text>
        </View>
      ) : (
        <View role="list" aria-label={t('events.label')} aria-live="polite" style={box}>
          {seen.map((e, i) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: a reset can repeat an id; the order is the identity
              key={i}
              role="listitem"
              style={[
                ROW_PAD,
                { flexDirection: 'row', flexWrap: 'wrap', columnGap: sp['3'], minWidth: 0 },
                divided(i, theme.colors.line),
              ]}
            >
              <View style={{ width: EVENT_TIME, flexShrink: 0 }}>
                <Mono color="text-3">{clock.format(new Date(e.at))}</Mono>
              </View>
              <View style={{ minWidth: 0, flexShrink: 1 }}>
                <Mono>{e.topic}</Mono>
              </View>
              {e.ids && e.ids.length > 0 ? (
                <View style={{ minWidth: 0, flexShrink: 1 }}>
                  <Mono color="text-3" title={e.ids.join(', ')} truncate>
                    {e.ids.join(', ')}
                  </Mono>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
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
        <View style={{ gap: sp['3'] }}>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] }}
          >
            <View style={{ marginEnd: 'auto', gap: sp['0.5'], flexShrink: 1 }}>
              <Text variant="caption" color="text-3">
                {t('backups.intro')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                  columnGap: sp['1'],
                }}
              >
                <Text variant="caption" color="text-3">
                  {list.nextRun
                    ? t('backups.next', { when: relative(list.nextRun) })
                    : t('backups.off')}
                </Text>
                <TextLink href="/settings/backups">{t('backups.schedule')}</TextLink>
              </View>
            </View>
            <Button
              icon="backup"
              loading={make.pending}
              onPress={() =>
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
          </View>
          {list.backups.length === 0 ? (
            <EmptyState icon="backup" title={t('backups.none')}>
              {t('backups.noneBody')}
            </EmptyState>
          ) : (
            <TableFrame>
              <Table label={t('backups.label')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('backups.made.column')}</TableHead>
                    <TableHead>{t('backups.kind')}</TableHead>
                    <TableHead>{t('backups.version')}</TableHead>
                    <TableHead numeric>{t('backups.size')}</TableHead>
                    <TableHead hidden>{t('backups.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.backups.map((b) => {
                    const d = date(b)
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <View style={{ gap: sp['0.5'] }}>
                            <Text size={ui.size} leading={ui.leading} numberOfLines={1}>
                              {d}
                            </Text>
                            {b.problem ? (
                              <Text variant="caption" color="badge-warning">
                                {b.problem}
                              </Text>
                            ) : null}
                          </View>
                        </TableCell>
                        <TableCell>
                          <Muted>{t(`backups.kind.${b.kind}`)}</Muted>
                        </TableCell>
                        <TableCell>
                          <Mono color="text-2">{b.version ?? '–'}</Mono>
                        </TableCell>
                        <TableCell numeric>{bytes(b.size)}</TableCell>
                        <TableCell align="end">
                          <View style={{ flexDirection: 'row', gap: sp['1'] }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="download"
                              href={`${API_PREFIX}/system/backups/${encodeURIComponent(b.id)}/download`}
                              follow="download"
                              accessibilityLabel={t('backups.downloadLabel', { date: d })}
                            >
                              {t('backups.download')}
                            </Button>
                            <Button
                              size="sm"
                              disabled={b.problem !== null}
                              accessibilityLabel={t('backups.restoreLabel', { date: d })}
                              onPress={() => setRestoring(b)}
                            >
                              {t('backups.restore')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="delete"
                              iconOnly
                              accessibilityLabel={t('backups.deleteLabel', { date: d })}
                              onPress={() => setDeleting(b)}
                            />
                          </View>
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
            onClose={() => setRestoring(null)}
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
            onClose={() => setDeleting(null)}
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
        </View>
      )}
    </Loadable>
  )
}

/** How often the restarting page asks whether the server is back. */
const RESTART_POLL = 1500
/** A restart too quick to be seen down still counts once this has passed. */
const RESTART_GRACE = 20_000
/** Restarting's and Updates' measure (the web's max-w-160). */
const NARROW = 640

/**
 * After a restore: the server exits and comes back on the backup. Asks `/api/health` until the
 * server has been away and answers again (any answer: a degraded server is up and says why on
 * Health), then reloads, which lands on sign-in if the restored database doesn't know this session.
 */
function Restarting({ name }: { name: string }) {
  const t = useT(messages)
  const theme = useTheme()
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
    <View
      role="region"
      aria-live="polite"
      aria-label={t('restarting.title')}
      style={{
        maxWidth: NARROW,
        gap: sp['3'],
        padding: sp['5'],
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['2'] }}>
        {/* the web's spinning loading icon: the platform's own activity indicator, as Button's */}
        <ActivityIndicator aria-hidden size="small" color={theme.colors.text} />
        <Text variant="title" accessibilityRole="header" aria-level={2}>
          {t('restarting.title')}
        </Text>
      </View>
      <Text color="text-2">{t('restarting.body', { name })}</Text>
      <Text variant="caption" color="text-3">
        {t('restarting.waiting')}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- updates

/** This version and the newest on the channel, from the signed catalog; Docker pulls the update. */
function Updates() {
  const t = useT(messages)
  const theme = useTheme()
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
        <View
          role="region"
          aria-label={t('updates.label')}
          style={{
            maxWidth: NARROW,
            gap: sp['4'],
            padding: sp['5'],
            borderWidth: 1,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.lg,
            backgroundColor: theme.colors.s1,
          }}
        >
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['3'] }}
          >
            <Badge tone={u.available ? 'accent' : 'neutral'}>{t(`updates.${u.channel}`)}</Badge>
            <Text size={ui.size} leading={ui.leading} style={{ flexShrink: 1 }}>
              {u.available && u.latest
                ? t('updates.available', { latest: u.latest.version, current: u.current })
                : u.latest
                  ? t('updates.current', { current: u.current })
                  : t('updates.unknown', { current: u.current })}
            </Text>
          </View>
          {u.available && u.latest ? (
            <View style={{ gap: sp['2'] }}>
              <Text variant="caption" color="text-3">
                {t('updates.released', { date: day.format(new Date(u.latest.date)) })}
              </Text>
              {u.latest.notes.length > 0 ? (
                <View role="list" aria-label={t('updates.notes')} style={{ gap: sp['1'] }}>
                  {u.latest.notes.map((n) => (
                    <View
                      key={n}
                      role="listitem"
                      style={{ flexDirection: 'row', gap: sp['2'], paddingStart: sp['2'] }}
                    >
                      {/* the web's list-disc marker */}
                      <Text color="text-2" aria-hidden>
                        •
                      </Text>
                      <Text color="text-2" style={{ flex: 1, minWidth: 0 }}>
                        {n}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {u.latest.url ? (
                <NotesLink href={u.latest.url}>{t('updates.notes')}</NotesLink>
              ) : null}
            </View>
          ) : null}
          <Text variant="caption" color="text-3">
            {t('updates.docker')}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] }}
          >
            <Button
              size="sm"
              icon="refresh"
              loading={check.pending}
              onPress={() =>
                check.run().then(
                  () => updates.refetch(),
                  (e: Error) => toast.error(t('updates.checkFailed'), { description: e.message }),
                )
              }
            >
              {t('updates.check')}
            </Button>
            <Button size="sm" variant="ghost" href="/settings/general">
              {t('updates.settings')}
            </Button>
            <Text variant="caption" color="text-3" style={{ marginStart: 'auto' }}>
              {u.checkedAt
                ? t('updates.checked', { ago: relative(u.checkedAt) })
                : t('updates.never')}
            </Text>
          </View>
        </View>
      )}
    </Loadable>
  )
}

/** The release's notes on GitHub, in a new tab, in the accent with the external icon (the web's). */
function NotesLink({ href, children }: { href: string; children: string }) {
  return (
    <Press
      role="link"
      {...({ href, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object)}
      style={{ alignSelf: 'flex-start', borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['1'] + sp['0.5'] }}>
          <Text
            size={ui.size}
            leading={ui.leading}
            color="accent-text"
            style={hovered ? { textDecorationLine: 'underline' } : undefined}
          >
            {children}
          </Text>
          <Icon name="external" size={14} color="accent-text" />
        </View>
      )}
    </Press>
  )
}
