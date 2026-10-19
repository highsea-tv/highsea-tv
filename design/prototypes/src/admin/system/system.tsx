// SPDX-License-Identifier: AGPL-3.0-only
// A16 System (reference, docs/product/system.md): what the server is doing and how it's holding up.
// Status, health checks, scheduled tasks with Run now, the log, the live event stream, backups
// with restore, and updates. The one place, with the sidebar's server card, that shows health.
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
} from '@highsea/ui-web'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { Soon } from '../../kit/soon.tsx'
import { useAction, useClient, useNow, useQuery } from '../../mock/hooks.tsx'
import type { Backup, HealthCheck, Job, LogEntry, ServerEvent } from '../../mock/types.ts'
import { bytes, bytesParts, duration, percent, relative } from '../format.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'

const tabs = [
  { id: 'status', label: 'Status' },
  { id: 'health', label: 'Health' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'logs', label: 'Logs' },
  { id: 'events', label: 'Events' },
  { id: 'backups', label: 'Backups' },
  { id: 'updates', label: 'Updates' },
] as const

export type SystemTab = (typeof tabs)[number]['id']

export function System({ tab = 'status' }: { tab?: SystemTab }) {
  const [, navigate] = useLocation()
  const health = useQuery('system:health', (c) => c.system.health(), ['health.updated'])
  const problems = (health.data ?? []).filter((h) => h.level === 'warning' || h.level === 'error')
  return (
    <AdminPage title="System" description="What the server is doing, and how it’s holding up.">
      <Tabs
        value={tab}
        onValueChange={(v) => navigate(v === 'status' ? '/system' : `/system/${v}`)}
        variant="line"
      >
        <TabsList aria-label="System sections">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              count={t.id === 'health' ? problems.length || undefined : undefined}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="status" className="pt-5">
          <Status />
        </TabsContent>
        <TabsContent value="health" className="pt-5">
          <Health />
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
        <TabsContent value="backups" className="pt-5">
          <Backups />
        </TabsContent>
        <TabsContent value="updates" className="pt-5">
          <Updates />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- status

function Status() {
  const status = useQuery('system:status', (c) => c.system.status(), ['jobs.updated'])
  const server = useQuery('server', (c) => c.system.server(), ['server.updated'])
  const now = useNow()
  return (
    <Loadable query={status} what="the server’s status">
      {(s) => (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-s1 p-4 medium:grid-cols-4">
            <Stat value={s.version} caption="version" />
            <Stat value={duration((now - Date.parse(s.startedAt)) / 1000)} caption="up for" />
            <Stat value={String(server.data?.clientsConnected ?? 0)} caption="apps connected" />
            <Stat value={s.catalogVersion} caption="catalog" />
          </div>
          <div className="grid gap-4 expanded:grid-cols-2">
            <section
              aria-label="Resources"
              className="grid gap-3 rounded-lg border border-line bg-s1 p-4"
            >
              <h2 className="text-widget-title">Resources</h2>
              <p className="text-caption text-text-3">CPU, across 4 cores</p>
              <Progress value={s.cpu} showValue aria-label="CPU" />
              <p className="text-caption text-text-3">
                Memory: {bytes(s.memory.used)} of {bytes(s.memory.total)}
              </p>
              <Progress
                value={(s.memory.used / s.memory.total) * 100}
                showValue
                aria-label="Memory"
              />
            </section>
            <section
              aria-label="Addresses"
              className="grid content-start gap-2 rounded-lg border border-line bg-s1 p-4"
            >
              <h2 className="text-widget-title">Addresses</h2>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-ui">
                <dt className="text-text-3">On the LAN</dt>
                <dd className="truncate font-mono text-figure text-text">
                  {server.data?.addresses.local.join(', ')}
                </dd>
                <dt className="text-text-3">Remote</dt>
                <dd className="truncate font-mono text-figure text-text">
                  {server.data?.addresses.public ?? 'Not set'}
                </dd>
              </dl>
              <a
                href={adminHref('/settings/network')}
                className="text-caption text-text-2 underline underline-offset-2"
              >
                Network and remote access
              </a>
            </section>
          </div>
          <section
            aria-label="Disks"
            className="grid gap-4 rounded-lg border border-line bg-s1 p-4"
          >
            <h2 className="text-widget-title">Disks</h2>
            {s.disks.map((d) => {
              const used = d.total - d.free
              return (
                <div key={d.path} className="grid gap-1.5">
                  <p className="flex flex-wrap items-baseline gap-2 text-ui">
                    <span className="text-text">{d.label}</span>
                    <span className="font-mono text-figure text-text-3">{d.path}</span>
                    <span className="ms-auto text-text-2">
                      {bytes(d.free)} free of {bytes(d.total)}
                    </span>
                  </p>
                  <Progress
                    value={(used / d.total) * 100}
                    tone={d.free / d.total < 0.1 ? 'warning' : 'accent'}
                    aria-label={`${d.label}: ${percent(used / d.total)} used`}
                  />
                  <p className="text-caption text-text-3">
                    {Object.entries(d.usedBy)
                      .filter(([, v]) => v > 0)
                      .map(
                        ([k, v]) =>
                          `${k.charAt(0).toUpperCase()}${k.slice(1)} ${bytesParts(v).join(' ')}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              )
            })}
          </section>
        </div>
      )}
    </Loadable>
  )
}

// ---------------------------------------------------------------- health

const levels: Record<HealthCheck['level'], { tone: BadgeTone; icon: IconName; label: string }> = {
  ok: { tone: 'success', icon: 'success', label: 'OK' },
  notice: { tone: 'info', icon: 'info', label: 'Notice' },
  warning: { tone: 'warning', icon: 'warning', label: 'Warning' },
  error: { tone: 'danger', icon: 'error', label: 'Error' },
}

function Health() {
  const health = useQuery('system:health', (c) => c.system.health(), ['health.updated'])
  const run = useAction((c) => c.system.runJob('j-health'))
  const now = useNow()
  return (
    <Loadable query={health} what="the health checks">
      {(checks) => (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="me-auto text-caption text-text-3">
              highsea checks itself every 5 minutes: indexers, disks, downloads, the VPN and
              updates.
            </p>
            <Button
              size="sm"
              icon="refresh"
              loading={run.pending}
              onClick={() => run.run().then(() => toast({ title: 'Health check started' }))}
            >
              Check now
            </Button>
          </div>
          {checks.length === 0 ? (
            <EmptyState icon="success" title="Everything’s healthy">
              Nothing needs your attention.
            </EmptyState>
          ) : (
            <ul aria-label="Health checks" className="grid gap-2">
              {checks.map((c) => {
                const l = levels[c.level]
                return (
                  <li key={c.id} className="flex gap-3 rounded-lg border border-line bg-s1 p-4">
                    <Icon name={l.icon} size={18} className="mt-0.5 shrink-0 text-text-2" />
                    <div className="grid gap-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={l.tone}>{l.label}</Badge>
                        <span className="font-semibold text-text text-ui">{c.source}</span>
                        <span className="text-caption text-text-3">
                          since {relative(c.since, now)}
                        </span>
                      </p>
                      <p className="text-body text-text-2">{c.message}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Loadable>
  )
}

// ---------------------------------------------------------------- tasks

const jobState: Record<Job['state'], { tone: BadgeTone; label: string }> = {
  running: { tone: 'accent', label: 'Running' },
  queued: { tone: 'info', label: 'Queued' },
  idle: { tone: 'neutral', label: 'Idle' },
  failed: { tone: 'danger', label: 'Failed' },
}

function Tasks() {
  const jobs = useQuery('system:jobs', (c) => c.system.jobs(), ['jobs.updated'])
  const run = useAction((c, id: string) => c.system.runJob(id))
  const now = useNow()
  return (
    <Loadable query={jobs} what="the tasks">
      {(js) => (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Every</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {js.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="text-text">{j.name}</TableCell>
                  <TableCell className="w-44">
                    {j.state === 'running' && j.progress !== null ? (
                      <Progress
                        value={j.progress * 100}
                        showValue
                        aria-label={`${j.name} progress`}
                      />
                    ) : (
                      <Badge tone={jobState[j.state].tone}>{jobState[j.state].label}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-text-2">
                    {j.interval ? duration(j.interval) : 'When needed'}
                  </TableCell>
                  <TableCell className="text-text-2">
                    {j.lastRun ? relative(j.lastRun, now) : 'Never'}
                  </TableCell>
                  <TableCell className="text-text-2">
                    {j.nextRun ? relative(j.nextRun, now) : '—'}
                  </TableCell>
                  <TableCell className="text-end">
                    {j.interval !== null && (
                      <Button
                        size="sm"
                        icon="play"
                        disabled={j.state === 'running'}
                        aria-label={`Run ${j.name} now`}
                        onClick={() => run.run(j.id)}
                      >
                        Run now
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
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

const rank: Record<LogEntry['level'], number> = { debug: 0, info: 1, warn: 2, error: 3 }

const clockTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function Logs() {
  const logs = useQuery('system:logs', (c) => c.system.logs(), [
    'history.updated',
    'health.updated',
    'jobs.updated',
  ])
  const [level, setLevel] = useState<LogEntry['level']>('info')
  const [q, setQ] = useState('')
  return (
    <Loadable query={logs} what="the log">
      {(entries) => {
        const needle = q.trim().toLowerCase()
        const shown = entries.filter(
          (e) =>
            rank[e.level] >= rank[level] &&
            (!needle || `${e.logger} ${e.message}`.toLowerCase().includes(needle)),
        )
        return (
          <TableFrame>
            <TableToolbar>
              <Select
                aria-label="Show"
                value={level}
                onValueChange={(v) => setLevel(v as LogEntry['level'])}
                options={[
                  { value: 'debug', label: 'Everything' },
                  { value: 'info', label: 'Info and up' },
                  { value: 'warn', label: 'Warnings and errors' },
                  { value: 'error', label: 'Errors' },
                ]}
                className="w-52"
              />
              <Input
                icon="search"
                aria-label="Search the log"
                placeholder="Search the log"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-64"
              />
              <Soon size="sm" icon="download" className="ms-auto">
                Download logs
              </Soon>
            </TableToolbar>
            {shown.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-caption text-text-3">Nothing matches.</p>
            ) : (
              <ol aria-label="Log" className="grid divide-y divide-line font-mono text-figure">
                {shown.slice(0, 80).map((e, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: log lines can repeat exactly
                    key={i}
                    className="grid gap-1 px-3.5 py-2 medium:grid-cols-[10rem_4.5rem_7rem_minmax(0,1fr)] medium:gap-3"
                  >
                    <span className="text-text-3">{clockTime.format(new Date(e.time))}</span>
                    <span>
                      <Badge tone={logTone[e.level]}>{e.level}</Badge>
                    </span>
                    <span className="truncate text-text-2">{e.logger}</span>
                    <span className="break-words text-text">{e.message}</span>
                  </li>
                ))}
              </ol>
            )}
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- events

/** The live event stream every app listens to (SSE in the product), as it arrives. */
function Events() {
  const client = useClient()
  const now = useNow()
  const [seen, setSeen] = useState<{ at: number; event: ServerEvent }[]>([])
  useEffect(
    () =>
      client.events.subscribe((e) => {
        if (e.type !== 'tick') setSeen((s) => [{ at: client.now(), event: e }, ...s].slice(0, 40))
      }),
    [client],
  )
  return (
    <div className="grid gap-3">
      <p className="text-caption text-text-3">
        What the server tells every connected app, live. Apps refresh what they show from these.
      </p>
      {seen.length === 0 ? (
        <p
          aria-live="polite"
          className="rounded-lg border border-line bg-s1 p-6 text-center text-caption text-text-3"
        >
          Listening… Events appear here as the server sends them.
        </p>
      ) : (
        <ol
          aria-label="Events"
          aria-live="polite"
          className="grid divide-y divide-line rounded-lg border border-line bg-s1 font-mono text-figure"
        >
          {seen.map((s, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: events repeat; the order is the identity
              key={i}
              className="flex gap-3 px-3.5 py-2"
            >
              <span className="w-16 shrink-0 text-text-3">
                {relative(new Date(s.at).toISOString(), now)}
              </span>
              <span className="text-text">{s.event.type}</span>
              {'itemId' in s.event && s.event.itemId && (
                <span className="text-text-3">item {s.event.itemId}</span>
              )}
              {'id' in s.event && <span className="text-text-3">item {s.event.id}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- backups

const backupKind: Record<Backup['kind'], string> = {
  scheduled: 'Scheduled',
  manual: 'Made by hand',
  'pre-migration': 'Before an update',
}

const backupDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function Backups() {
  const backups = useQuery('system:backups', (c) => c.system.backups(), ['jobs.updated'])
  const make = useAction((c) => c.system.backupNow())
  const restore = useAction((c, id: string) => c.system.restore(id))
  const [restoring, setRestoring] = useState<Backup | null>(null)
  return (
    <Loadable query={backups} what="the backups">
      {(bs) => (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="me-auto text-caption text-text-3">
              Settings, users, history and the library’s records. Your media isn’t in them.{' '}
              <a
                href={adminHref('/settings/backups')}
                className="text-text-2 underline underline-offset-2"
              >
                Schedule
              </a>
            </p>
            <Button
              icon="backup"
              loading={make.pending}
              onClick={() =>
                make
                  .run()
                  .then(() =>
                    toast.success('Backup made', { description: 'It’s at the top of the list.' }),
                  )
              }
            >
              Back up now
            </Button>
          </div>
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Made</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead numeric>Size</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bs.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-text">
                      {backupDate.format(new Date(b.createdAt))}
                    </TableCell>
                    <TableCell className="text-text-2">{backupKind[b.kind]}</TableCell>
                    <TableCell numeric>{bytes(b.size)}</TableCell>
                    <TableCell className="text-end">
                      <span className="flex justify-end gap-1">
                        <Soon size="sm" variant="ghost" icon="download" aria-label="Download">
                          Download
                        </Soon>
                        <Button size="sm" onClick={() => setRestoring(b)}>
                          Restore
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <ConfirmDialog
            open={!!restoring}
            onOpenChange={(o) => !o && setRestoring(null)}
            title={`Restore the backup from ${restoring ? backupDate.format(new Date(restoring.createdAt)) : ''}?`}
            description="Harbor restarts on it: settings, users and history go back to that moment, and anything since is lost. Media files aren’t touched. Apps reconnect on their own."
            confirmLabel="Restore and restart"
            destructive
            onConfirm={() => {
              const b = restoring
              if (b)
                restore.run(b.id).then(() =>
                  toast({
                    title: 'Restoring',
                    description: 'Harbor is restarting. It’s back in about a minute.',
                  }),
                )
            }}
          />
        </div>
      )}
    </Loadable>
  )
}

// ---------------------------------------------------------------- updates

function Updates() {
  const updates = useQuery('system:updates', (c) => c.system.updates())
  return (
    <Loadable query={updates} what="the update check">
      {(u) => (
        <section
          aria-label="Update"
          className="grid max-w-160 gap-4 rounded-lg border border-line bg-s1 p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="accent">{u.channel === 'beta' ? 'Beta channel' : 'Stable channel'}</Badge>
            <p className="text-text text-ui">
              highsea <span className="font-mono text-figure">{u.latest}</span> is out. You have{' '}
              <span className="font-mono text-figure">{u.current}</span>.
            </p>
          </div>
          <ul className="grid list-disc gap-1 ps-5 text-body text-text-2">
            {u.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Soon variant="primary">Update and restart</Soon>
            <Button variant="ghost" asChild>
              <a href={adminHref('/settings/general')}>Update settings</a>
            </Button>
          </div>
          <p className="text-caption text-text-3">
            In Docker, pull the new image instead: highsea backs up before it migrates.
          </p>
        </section>
      )}
    </Loadable>
  )
}
