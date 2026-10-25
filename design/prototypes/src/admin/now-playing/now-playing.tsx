// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (docs/product/now-playing.md; checkpoint 4.0b, built at 4.3): who's watching what
// now, how each stream is sent and why, and Stop with a message; then 30 days of what was watched.
// Staff only, like the rest of the admin. In the prototype, **Prototype only · Slow a transcode**
// plays a transcode that can't keep up, and the empty server has nobody watching.

import { duration, percent, relative } from '@highsea-tv/core/format'
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Icon,
  Poster,
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
  Textarea,
  TitleCell,
  toast,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { SessionView } from '../../mock/sessions.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { behind, clientIcon, mbps, methods, timecode, transcodedBy } from './delivery.ts'

type Tab = 'now' | 'history'

export function NowPlaying() {
  const [tab, setTab] = useState<Tab>('now')
  const live = useQuery('sessions', (c) => c.sessions.list(), ['sessions.updated'])
  return (
    <AdminPage
      title="Now playing"
      description="Who’s watching what, how each stream is sent, and what was watched this month."
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label="Now playing sections">
          <TabsTrigger value="now" count={live.data?.sessions.length || undefined}>
            Now
          </TabsTrigger>
          <TabsTrigger value="history">Last 30 days</TabsTrigger>
        </TabsList>
        <TabsContent value="now" className="pt-5">
          <Now />
        </TabsContent>
        <TabsContent value="history" className="pt-5">
          <History />
        </TabsContent>
      </Tabs>
    </AdminPage>
  )
}

// ---------------------------------------------------------------- now

function Now() {
  const live = useQuery('sessions', (c) => c.sessions.list(), ['sessions.updated'])
  const slow = useAction((c) => c.sessions.simulateSlow())
  const [stopping, setStopping] = useState<SessionView | null>(null)
  return (
    <Loadable query={live} what="what’s playing">
      {(np) =>
        np.sessions.length === 0 ? (
          <EmptyState icon="play" title="Nobody is watching">
            Streams show here as they start, with who’s watching, on what, and how it’s sent.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-line p-4 medium:grid-cols-4">
              <Stat
                value={np.sessions.filter((s) => s.kind === 'stream').length}
                caption="Streams"
              />
              <Stat value={np.totalMbps.toFixed(1)} unit="Mbps" caption="Sent in all" />
              <Stat value={np.remoteMbps.toFixed(1)} unit="Mbps" caption="Away from home" />
              <Stat value={np.transcodes} caption="Transcodes" />
            </div>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
              {np.sessions.map((s) => (
                <SessionRow key={s.id} s={s} onStop={() => setStopping(s)} />
              ))}
            </ul>
            {np.sessions.some((s) => s.method === 'transcode' && s.kind === 'stream') && (
              <button
                type="button"
                onClick={() => slow.run()}
                className="justify-self-end rounded-sm border border-line border-dashed px-2 py-1 font-mono text-label text-text-3 outline-none hover:text-text focus-visible:ring-focus"
              >
                Prototype only · Slow a transcode
              </button>
            )}
            <StopDialog session={stopping} onClose={() => setStopping(null)} />
          </div>
        )
      }
    </Loadable>
  )
}

function SessionRow({ s, onStop }: { s: SessionView; onStop: () => void }) {
  const now = useNow()
  const m = methods[s.method]
  const late = behind(s)
  const download = s.kind === 'download'
  return (
    <li
      className={cn(
        'grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-4 rounded-lg border border-line bg-s1 p-4',
        s.stopped && 'opacity-60',
      )}
      aria-label={`${s.user.displayName}, ${s.item.title}`}
    >
      <Poster title={s.item.title} src={s.item.poster} href={adminHref(`/movies/${s.item.id}`)} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <a
              href={adminHref(`/movies/${s.item.id}`)}
              className="font-medium text-text hover:underline"
            >
              {s.item.title}
            </a>
            {s.item.year && <span className="ms-2 text-text-3">{s.item.year}</span>}
            <div className="mt-0.5 flex items-center gap-1.5 text-caption text-text-2">
              <Icon name={clientIcon[s.client]} size={14} aria-hidden />
              <span className="truncate">
                {s.user.displayName} · {s.deviceName}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {s.stopped ? (
              <Badge tone="neutral">Stopped</Badge>
            ) : download ? (
              <Badge tone="accent">Downloading</Badge>
            ) : s.state === 'paused' ? (
              <Badge tone="neutral">Paused</Badge>
            ) : late ? (
              <Badge tone="danger">Can’t keep up</Badge>
            ) : (
              <Badge tone="success">Playing</Badge>
            )}
            <Badge tone={m.tone} dot={false}>
              {m.label}
            </Badge>
            {!s.stopped && (
              <Button size="sm" variant="ghost" onClick={onStop}>
                {download ? 'Cancel' : 'Stop'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-1">
          <Progress
            value={(s.position / s.runtime) * 100}
            tone={late ? 'danger' : 'accent'}
            aria-label={download ? 'Made so far' : 'Watched so far'}
          />
          <div className="flex justify-between font-mono text-figure text-text-3">
            <span>
              {download
                ? `${percent(s.position / s.runtime)} made`
                : `${timecode(s.position)} of ${timecode(s.runtime)}`}
            </span>
            <span>{download ? `Started ${duration((now - s.startedAt) / 1000)} ago` : ''}</span>
          </div>
        </div>

        {s.stopped ? (
          <p className="text-caption text-text-2">
            Stopped by {s.stopped.by}
            {s.stopped.message ? `: “${s.stopped.message}”` : '.'}
          </p>
        ) : (
          <dl className="grid gap-x-6 gap-y-1 text-caption [overflow-wrap:anywhere] medium:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-text-3">Sent as</dt>
            <dd className="font-mono text-figure text-text-2">
              {s.sent} · {mbps(s.mbps)}
            </dd>
            <dt className="text-text-3">From</dt>
            <dd className="font-mono text-figure text-text-2">{s.version}</dd>
            <dt className="text-text-3">Network</dt>
            <dd className="text-text-2">
              {s.network === 'lan' ? 'At home' : 'Away from home'}
              <span className="ms-2 font-mono text-figure text-text-3">{s.address}</span>
            </dd>
            {s.method === 'transcode' && (
              <>
                <dt className="text-text-3">Transcoded by</dt>
                <dd className={late ? 'text-badge-danger' : 'text-text-2'}>{transcodedBy(s)}</dd>
              </>
            )}
          </dl>
        )}

        {!s.stopped && (s.reasons.length > 0 || late) && (
          <ul className="grid gap-1 border-line border-t pt-3 text-caption text-text-2">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {late && (
              <li className="text-badge-danger">
                The transcode runs slower than the film, so {s.user.displayName}’s player keeps
                waiting for it. Turn on hardware acceleration in{' '}
                <a href={adminHref('/settings/playback')} className="underline">
                  Settings › Playback
                </a>
                , or lower what’s sent away from home.
              </li>
            )}
          </ul>
        )}
      </div>
    </li>
  )
}

function StopDialog({ session, onClose }: { session: SessionView | null; onClose: () => void }) {
  const [message, setMessage] = useState('')
  const stop = useAction((c, id: string, m: string) => c.sessions.stop(id, m))
  const close = () => {
    onClose()
    setMessage('')
  }
  const download = session?.kind === 'download'
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && close()}>
      <DialogContent
        size="sm"
        title={
          session
            ? download
              ? `Cancel ${session.user.displayName}’s download?`
              : `Stop ${session.user.displayName}’s stream?`
            : ''
        }
        description={
          download
            ? 'The copy on their device is deleted. They can download it again.'
            : 'Their player stops and shows your message. They can start it again.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Keep playing
            </Button>
            <Button
              variant="danger"
              loading={stop.pending}
              onClick={() =>
                session &&
                stop.run(session.id, message).then(() => {
                  toast({ title: download ? 'Download cancelled' : 'Stream stopped' })
                  close()
                })
              }
            >
              {download ? 'Cancel download' : 'Stop stream'}
            </Button>
          </>
        }
      >
        <Field label="Message" hint="Optional. Shown in their player, with your name.">
          <Textarea
            value={message}
            rows={3}
            maxLength={200}
            placeholder="The server is restarting in five minutes."
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- history

function History() {
  const now = useNow()
  const history = useQuery('sessions:history', (c) => c.sessions.history(), ['sessions.updated'])
  const [person, setPerson] = useState('everyone')
  return (
    <Loadable query={history} what="the last 30 days">
      {(all) => {
        const people = [...new Map(all.map((w) => [w.user.id, w.user.displayName])).entries()]
        const xs = person === 'everyone' ? all : all.filter((w) => w.user.id === person)
        return all.length === 0 ? (
          <EmptyState icon="clock" title="Nothing watched yet">
            Every stream is recorded here for 30 days: who, what, on which device and how it was
            sent.
          </EmptyState>
        ) : (
          <TableFrame>
            <TableToolbar>
              <span className="me-auto text-caption text-text-3">
                {xs.length} {xs.length === 1 ? 'film' : 'films'} watched
              </span>
              <Select
                aria-label="Whose history"
                value={person}
                onValueChange={setPerson}
                options={[
                  { value: 'everyone', label: 'Everyone' },
                  ...people.map(([value, label]) => ({ value, label })),
                ]}
                className="w-44"
              />
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Movie</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Sent as</TableHead>
                  <TableHead numeric>Watched</TableHead>
                  <TableHead numeric>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((w) => (
                  <TableRow key={w.id}>
                    <TitleCell
                      art={w.item.poster}
                      title={
                        <a href={adminHref(`/movies/${w.item.id}`)} className="hover:underline">
                          {w.item.title}
                        </a>
                      }
                    />
                    <TableCell className="text-text-2">{w.user.displayName}</TableCell>
                    <TableCell className="text-text-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name={clientIcon[w.client]} size={14} aria-hidden />
                        {w.deviceName}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={methods[w.method].tone} dot={false}>
                        {methods[w.method].label}
                      </Badge>
                      {w.network === 'remote' && (
                        <span className="ms-2 text-caption text-text-3">away</span>
                      )}
                    </TableCell>
                    <TableCell numeric>{w.finished ? 'All' : duration(w.watched)}</TableCell>
                    <TableCell numeric>{relative(w.startedAt, now)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )
      }}
    </Loadable>
  )
}
