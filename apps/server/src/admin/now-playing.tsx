'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (docs/product/now-playing.md; checkpoint 4.3a), ported from the prototype with real
// data: who's watching what now, how each stream is sent and why, and Stop with a message; then 30
// days of what was watched. The owner's and admins'. What real data changes from the prototype:
// - its **Prototype only · Slow a transcode** button is gone;
// - a transcode waiting for a free slot shows **Waiting**, with a line saying why;
// - a transcode's speed is unknown for its first seconds, so it reads "starting";
// - a title that has left the library has no link, and a film of unknown length no runtime;
// - the processor transcodes everything until 4.3b's hardware paths;
// - Downloads come with the apps that make them, so there's no Cancel yet.
import {
  type DeliveryMethod,
  SESSIONS_TOPICS,
  type StreamSession,
  type WatchRecord,
} from '@highsea-tv/api-contract'
import { duration } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
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
import { behind, clientIcon, mbps, methodTone, timecode } from './delivery.ts'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { nowPlaying as messages } from './now-playing-messages.ts'
import { AdminPage } from './shell.tsx'
import { useRelative } from './time.ts'

type Tab = 'now' | 'history'

const methodLabel = (m: DeliveryMethod) => `method.${m}` as const

export const useNowPlaying = () =>
  useQuery('sessions', (c) => c.sessions.list(), [SESSIONS_TOPICS.updated])

export function NowPlayingPage() {
  const t = useT(messages)
  const [tab, setTab] = useState<Tab>('now')
  const live = useNowPlaying()
  return (
    <AdminPage title={t('title')} description={t('description')}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label={t('sections')}>
          <TabsTrigger
            value="now"
            count={live.data?.sessions.filter((s) => !s.stopped).length || undefined}
          >
            {t('tab.now')}
          </TabsTrigger>
          <TabsTrigger value="history">{t('tab.history')}</TabsTrigger>
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
  const t = useT(messages)
  const live = useNowPlaying()
  const [stopping, setStopping] = useState<StreamSession | null>(null)
  return (
    <Loadable query={live} what={t('now.what')}>
      {(np) =>
        np.sessions.length === 0 ? (
          <EmptyState icon="play" title={t('now.empty')}>
            {t('now.emptyBody')}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-line p-4 medium:grid-cols-4">
              <Stat
                value={np.sessions.filter((s) => s.kind === 'stream' && !s.stopped).length}
                caption={t('stat.streams')}
              />
              <Stat value={np.totalMbps.toFixed(1)} unit="Mbps" caption={t('stat.total')} />
              <Stat value={np.remoteMbps.toFixed(1)} unit="Mbps" caption={t('stat.remote')} />
              <Stat value={np.transcodes} caption={t('stat.transcodes')} />
            </div>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
              {np.sessions.map((s) => (
                <SessionRow key={s.id} s={s} onStop={() => setStopping(s)} />
              ))}
            </ul>
            <StopDialog session={stopping} onClose={() => setStopping(null)} />
          </div>
        )
      }
    </Loadable>
  )
}

function SessionRow({ s, onStop }: { s: StreamSession; onStop: () => void }) {
  const t = useT(messages)
  const late = behind(s)
  const waiting = !s.stopped && s.state === 'waiting'
  const href = s.item.tmdbId === null ? undefined : moviePath(s.item.tmdbId)
  const by = s.hardware ? t(`path.${s.hardware}`) : t('processor')
  return (
    <li
      className={cn(
        'grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-4 rounded-lg border border-line bg-s1 p-4',
        s.stopped && 'opacity-60',
      )}
      aria-label={`${s.user.displayName}, ${s.item.title}`}
    >
      <Poster title={s.item.title} src={s.item.poster ?? undefined} href={href} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            {href ? (
              <a href={href} className="font-medium text-text hover:underline">
                {s.item.title}
              </a>
            ) : (
              <span className="font-medium text-text">{s.item.title}</span>
            )}
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
              <Badge tone="neutral">{t('state.stopped')}</Badge>
            ) : s.state === 'paused' ? (
              <Badge tone="neutral">{t('state.paused')}</Badge>
            ) : waiting ? (
              <Badge tone="warning">{t('state.waiting')}</Badge>
            ) : late ? (
              <Badge tone="danger">{t('state.behind')}</Badge>
            ) : (
              <Badge tone="success">{t('state.playing')}</Badge>
            )}
            <Badge tone={methodTone[s.method]} dot={false}>
              {t(methodLabel(s.method))}
            </Badge>
            {!s.stopped && (
              <Button size="sm" variant="ghost" onClick={onStop}>
                {t('stop')}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-1">
          <Progress
            value={s.runtime ? (s.position / s.runtime) * 100 : 0}
            tone={late ? 'danger' : 'accent'}
            aria-label={t('watchedSoFar')}
          />
          <div className="font-mono text-figure text-text-3">
            {s.runtime
              ? t('of', { position: timecode(s.position), runtime: timecode(s.runtime) })
              : timecode(s.position)}
          </div>
        </div>

        {s.stopped ? (
          <p className="text-caption text-text-2">
            {s.stopped.message
              ? t('stoppedByWith', { name: s.stopped.by, message: s.stopped.message })
              : t('stoppedBy', { name: s.stopped.by })}
          </p>
        ) : (
          <dl className="grid gap-x-6 gap-y-1 text-caption [overflow-wrap:anywhere] medium:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-text-3">{t('sentAs')}</dt>
            <dd className="font-mono text-figure text-text-2">
              {s.sent} · {mbps(s.mbps)}
            </dd>
            <dt className="text-text-3">{t('from')}</dt>
            <dd className="font-mono text-figure text-text-2">{s.version}</dd>
            <dt className="text-text-3">{t('network')}</dt>
            <dd className="text-text-2">
              {t(`network.${s.network}`)}
              <span className="ms-2 font-mono text-figure text-text-3">{s.address}</span>
            </dd>
            {s.method === 'transcode' && !waiting && (
              <>
                <dt className="text-text-3">{t('transcodedBy')}</dt>
                <dd className={late ? 'text-badge-danger' : 'text-text-2'}>
                  {s.speed === null
                    ? t('starting', { by })
                    : t('speed', { by, speed: s.speed.toFixed(1) })}
                </dd>
              </>
            )}
          </dl>
        )}

        {!s.stopped && (s.reasons.length > 0 || late || waiting) && (
          <ul className="grid gap-1 border-line border-t pt-3 text-caption text-text-2">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
            {late && (
              <li className="text-badge-danger">
                {t('behind.before', { name: s.user.displayName })}
                <a href="/settings/playback" className="underline">
                  {t('settingsLink')}
                </a>
                {t('behind.after')}
              </li>
            )}
            {waiting && (
              <li>
                {t('waiting.before')}
                <a href="/settings/playback" className="underline">
                  {t('settingsLink')}
                </a>
                {t('waiting.after')}
              </li>
            )}
          </ul>
        )}
      </div>
    </li>
  )
}

function StopDialog({ session, onClose }: { session: StreamSession | null; onClose: () => void }) {
  const t = useT(messages)
  const [message, setMessage] = useState('')
  const stop = useAction((c, id: string, m: string) =>
    c.sessions.stop({ params: { id }, body: { message: m } }),
  )
  const close = () => {
    onClose()
    setMessage('')
  }
  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && close()}>
      <DialogContent
        size="sm"
        title={session ? t('stop.title', { name: session.user.displayName }) : ''}
        description={t('stop.description')}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t('stop.keep')}
            </Button>
            <Button
              variant="danger"
              loading={stop.pending}
              onClick={() =>
                session &&
                stop.run(session.id, message).then(
                  () => {
                    toast({ title: t('stop.done') })
                    close()
                  },
                  (e) => {
                    // it ended on its own while the dialog was open
                    if (e instanceof ApiError && e.code === 'not-found') {
                      toast({ title: t('stop.gone') })
                      close()
                    } else toast.error(t('stop.failed'), { description: (e as Error).message })
                  },
                )
              }
            >
              {t('stop.confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('stop.message')} hint={t('stop.hint')}>
          <Textarea
            value={message}
            rows={3}
            maxLength={200}
            placeholder={t('stop.placeholder')}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- history

function History() {
  const t = useT(messages)
  const locale = useLocale()
  const { relative } = useRelative()
  const history = useQuery('sessions:history', (c) => c.sessions.history({ query: {} }), [
    SESSIONS_TOPICS.updated,
  ])
  const [person, setPerson] = useState('everyone')
  return (
    <Loadable query={history} what={t('history.what')}>
      {(all: WatchRecord[]) => {
        const people = [...new Map(all.map((w) => [w.user.id, w.user.displayName])).entries()]
        const xs = person === 'everyone' ? all : all.filter((w) => w.user.id === person)
        return all.length === 0 ? (
          <EmptyState icon="clock" title={t('history.empty')}>
            {t('history.emptyBody')}
          </EmptyState>
        ) : (
          <TableFrame>
            <TableToolbar>
              <span className="me-auto text-caption text-text-3">
                {t('history.count', { count: xs.length })}
              </span>
              <Select
                aria-label={t('history.whose')}
                value={person}
                onValueChange={setPerson}
                options={[
                  { value: 'everyone', label: t('history.everyone') },
                  ...people.map(([value, label]) => ({ value, label })),
                ]}
                className="w-44"
              />
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('history.movie')}</TableHead>
                  <TableHead>{t('history.who')}</TableHead>
                  <TableHead>{t('history.device')}</TableHead>
                  <TableHead>{t('history.sentAs')}</TableHead>
                  <TableHead numeric>{t('history.watched')}</TableHead>
                  <TableHead numeric>{t('history.when')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {xs.map((w) => (
                  <TableRow key={w.id}>
                    <TitleCell
                      art={w.item.poster ?? undefined}
                      title={
                        w.item.tmdbId === null ? (
                          w.item.title
                        ) : (
                          <a href={moviePath(w.item.tmdbId)} className="hover:underline">
                            {w.item.title}
                          </a>
                        )
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
                      <Badge tone={methodTone[w.method]} dot={false}>
                        {t(methodLabel(w.method))}
                      </Badge>
                      {w.network === 'remote' && (
                        <span className="ms-2 text-caption text-text-3">{t('history.away')}</span>
                      )}
                    </TableCell>
                    <TableCell numeric>
                      {w.finished ? t('history.all') : duration(w.watched, locale)}
                    </TableCell>
                    <TableCell numeric>{relative(w.startedAt)}</TableCell>
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
