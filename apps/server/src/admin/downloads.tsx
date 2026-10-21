'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A8 Downloads (activity-downloads.md#downloads), ported from the prototype with real data: every
// torrent, the library's and manual ones, with live rates; a detail sheet with files and their
// priority, trackers and the seeding rule; add by magnet, address or file; global limits; and the
// VPN's state, always visible. What real data changes from the prototype:
// - no categories in 6a: the toolbar's category filter and Add's category field are left out;
// - Add takes a .torrent file too, picked or dropped, sent as base64; any http(s) address passes,
//   since an indexer's download link rarely ends in .torrent, and the server has the last word;
// - rates refresh every two seconds, as no event announces them; changes come by `torrents.updated`;
// - the VPN line reads `vpn.status`, and an exit address not checked yet says so;
// - trackers can be not contacted yet, private torrents say so in General, and the seeding rule
//   carries its minimum time.
import type { Torrent, TorrentFile, TorrentLimits, VpnStatus } from '@highsea/api-contract'
import { bytes, duration, percent, rate } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Icon,
  type IconName,
  Input,
  Progress,
  Select,
  Sheet,
  SheetContent,
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
import { useRouter } from 'next/navigation'
import { type ReactNode, useState } from 'react'
import { toBase64 } from './base64.ts'
import { downloads as messages } from './downloads-messages.ts'
import { torrentTone } from './downloads-status.ts'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { AdminPage } from './shell.tsx'
import { useRelative } from './time.ts'

const MBps = 1_000_000
const LIVE = ['torrents.updated', 'queue.updated']
/** Rates change every second and no event says so: the list refetches quietly this often. */
const RATES_EVERY = 2_000
const VPN_SETTINGS = '/settings/vpn'

const states = {
  all: () => true,
  active: (t: Torrent) =>
    t.state === 'downloading' || t.state === 'queued' || t.state === 'checking',
  seeding: (t: Torrent) => t.state === 'seeding' || t.state === 'completed',
  paused: (t: Torrent) => t.state === 'paused',
  issues: (t: Torrent) =>
    t.state === 'stalled' || t.state === 'error' || t.state === 'import-blocked',
} satisfies Record<string, (t: Torrent) => boolean>
type StateFilter = keyof typeof states

const failed = (t: ReturnType<typeof useT<typeof messages>>) => (e: Error) =>
  toast.error(t('failed'), { description: e.message })

export function Downloads() {
  const t = useT(messages)
  const torrents = useQuery('torrents', (c) => c.downloads.list(), LIVE, {
    interval: RATES_EVERY,
  })
  const limits = useQuery('torrents:limits', (c) => c.downloads.limits(), ['torrents.updated'])
  const [filter, setFilter] = useState<StateFilter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingLimits, setEditingLimits] = useState(false)
  const pauseAll = useAction((c) => c.downloads.pauseAll())
  const resumeAll = useAction((c) => c.downloads.resumeAll())

  const actions = (
    <>
      <Button icon="speed" onClick={() => setEditingLimits(true)} disabled={!limits.data}>
        {t('limits')}
      </Button>
      <Button
        icon="pause"
        onClick={() =>
          pauseAll
            .run()
            .then(() => toast({ title: t('paused') }), failed(t))
            .then(torrents.refetch)
        }
        disabled={!torrents.data?.length}
      >
        {t('pauseAll')}
      </Button>
      <Button
        icon="play"
        onClick={() =>
          resumeAll
            .run()
            .then(() => toast({ title: t('resumed') }), failed(t))
            .then(torrents.refetch)
        }
        disabled={!torrents.data?.length}
      >
        {t('resumeAll')}
      </Button>
      <Button variant="primary" icon="add" onClick={() => setAdding(true)}>
        {t('add')}
      </Button>
    </>
  )

  return (
    <AdminPage title={t('title')} actions={actions}>
      {limits.data && <VpnBanner limits={limits.data} />}
      <Loadable query={torrents} what={t('what')}>
        {(ts) => {
          if (ts.length === 0)
            return (
              <EmptyState
                icon="downloads"
                title={t('empty.title')}
                action={
                  <Button variant="primary" icon="add" onClick={() => setAdding(true)}>
                    {t('add')}
                  </Button>
                }
              >
                {t('empty.body')}
              </EmptyState>
            )
          const shown = ts.filter(states[filter])
          const down = ts.reduce((s, x) => s + x.downRate, 0)
          const up = ts.reduce((s, x) => s + x.upRate, 0)
          return (
            <TableFrame>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as StateFilter)}>
                <TableToolbar>
                  <TabsList aria-label={t('filterBy')} className="max-w-full overflow-x-auto">
                    {(Object.keys(states) as StateFilter[]).map((k) => (
                      <TabsTrigger key={k} value={k} count={ts.filter(states[k]).length}>
                        {t(`filter.${k}`)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <span className="ms-auto font-mono text-figure text-text-3">
                    {t('totals', { down: rate(down), up: rate(up) })}
                  </span>
                </TableToolbar>
                <TabsContent value={filter}>
                  {shown.length === 0 ? (
                    <p className="px-3.5 py-8 text-center text-caption text-text-3">
                      {t('noMatch')}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('col.name')}</TableHead>
                          <TableHead numeric>{t('col.size')}</TableHead>
                          <TableHead>{t('col.progress')}</TableHead>
                          <TableHead numeric>↓</TableHead>
                          <TableHead numeric>↑</TableHead>
                          <TableHead numeric>{t('col.peers')}</TableHead>
                          <TableHead numeric>{t('col.ratio')}</TableHead>
                          <TableHead>{t('col.status')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shown.map((x) => {
                          const s = torrentTone[x.state]
                          return (
                            <TableRow key={x.id}>
                              <TitleCell
                                title={
                                  <button
                                    type="button"
                                    onClick={() => setOpen(x.id)}
                                    className="max-w-full truncate text-start hover:underline"
                                  >
                                    {x.name}
                                  </button>
                                }
                                detail={t('detail', {
                                  category: x.category,
                                  indexer: x.indexer ?? t('byHand'),
                                })}
                              />
                              <TableCell numeric>{bytes(x.size)}</TableCell>
                              <TableCell className="w-40">
                                <Progress
                                  value={x.progress * 100}
                                  tone={s.bar}
                                  showValue
                                  aria-label={t('progressOf', { name: x.name })}
                                />
                              </TableCell>
                              <TableCell numeric>{x.downRate ? rate(x.downRate) : '—'}</TableCell>
                              <TableCell numeric>{x.upRate ? rate(x.upRate) : '—'}</TableCell>
                              <TableCell numeric>
                                {x.seeds.connected}/{x.peers.connected}
                              </TableCell>
                              <TableCell numeric>{x.ratio.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge tone={s.tone}>{t(`state.${x.state}`)}</Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </TableFrame>
          )
        }}
      </Loadable>
      <TorrentSheet
        torrent={torrents.data?.find((x) => x.id === open) ?? null}
        onOpenChange={(o) => !o && setOpen(null)}
        onChanged={torrents.refetch}
      />
      <AddTorrentDialog open={adding} onOpenChange={setAdding} onAdded={torrents.refetch} />
      {limits.data && (
        <LimitsDialog
          // a fresh form each time it opens, from what's saved
          key={editingLimits ? 'open' : 'closed'}
          open={editingLimits}
          onOpenChange={setEditingLimits}
          limits={limits.data}
          onSaved={limits.refetch}
        />
      )}
    </AdminPage>
  )
}

// ---------------------------------------------------------------- VPN

function vpnLine(
  v: VpnStatus,
  t: ReturnType<typeof useT<typeof messages>>,
): [IconName, string, string, ReactNode] {
  const provider = v.provider ?? ''
  switch (v.state) {
    case 'connected': {
      const exit = !v.exitIp
        ? t('vpn.unknownExit')
        : v.country
          ? t('vpn.exit', { ip: v.exitIp, country: v.country })
          : v.exitIp
      return [
        'shield',
        'text-success',
        t('vpn.through', { provider }),
        [exit, v.forwardedPort && t('vpn.port', { port: v.forwardedPort })]
          .filter(Boolean)
          .join(' · '),
      ]
    }
    case 'connecting':
      return ['loading', 'text-text-3', t('vpn.connecting', { provider }), t('vpn.connectingLine')]
    case 'off':
      return ['warning', 'text-warning', t('vpn.off'), t('vpn.offLine')]
    default:
      return [
        'error',
        'text-danger',
        v.state === 'down' ? t('vpn.down', { provider }) : t('vpn.failed'),
        t('vpn.stoppedLine'),
      ]
  }
}

function VpnBanner({ limits: l }: { limits: TorrentLimits }) {
  const t = useT(messages)
  const status = useQuery('vpn:status', (c) => c.vpn.status(), ['vpn.updated'])
  const v = status.data
  if (!v) return null
  const [icon, tone, title, line] = vpnLine(v, t)
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-s1 px-3.5 py-2.5 text-ui"
    >
      <Icon name={icon} size={16} className={tone} />
      <span className="font-medium text-text">{title}</span>
      <span className="text-text-2">{line}</span>
      {v.state === 'off' && (
        <a href={VPN_SETTINGS} className="text-text underline underline-offset-2">
          {t('vpn.setUp')}
        </a>
      )}
      <span className="ms-auto font-mono text-figure text-text-3">
        {l.downloadRate ? t('rate.down', { rate: rate(l.downloadRate) }) : t('rate.downUnlimited')}{' '}
        · {l.uploadRate ? t('rate.up', { rate: rate(l.uploadRate) }) : t('rate.upUnlimited')}
      </span>
    </div>
  )
}

function LimitsDialog({
  open,
  onOpenChange,
  limits,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  limits: TorrentLimits
  onSaved: () => void
}) {
  const t = useT(messages)
  const [down, setDown] = useState(String(limits.downloadRate / MBps))
  const [up, setUp] = useState(String(limits.uploadRate / MBps))
  const save = useAction((c, body: TorrentLimits) => c.downloads.setLimits({ body }))
  const valid = (v: string) => v.trim() !== '' && Number(v) >= 0 && !Number.isNaN(Number(v))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={t('limits.title')}
        description={t('limits.description')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!valid(down) || !valid(up)}
              loading={save.pending}
              onClick={() =>
                save
                  .run({
                    downloadRate: Math.round(Number(down) * MBps),
                    uploadRate: Math.round(Number(up) * MBps),
                  })
                  .then(() => {
                    onSaved()
                    onOpenChange(false)
                    toast.success(t('limits.saved'))
                  }, failed(t))
              }
            >
              {t('save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label={t('limits.download')} error={valid(down) ? undefined : t('limits.invalid')}>
            <Input
              inputMode="decimal"
              value={down}
              onChange={(e) => setDown(e.target.value)}
              end={<span className="text-caption text-text-3">{t('limits.unit')}</span>}
            />
          </Field>
          <Field label={t('limits.upload')} error={valid(up) ? undefined : t('limits.invalid')}>
            <Input
              inputMode="decimal"
              value={up}
              onChange={(e) => setUp(e.target.value)}
              end={<span className="text-caption text-text-3">{t('limits.unit')}</span>}
            />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- add

const LINK = /^(magnet:\?xt=urn:btih:|https?:\/\/.+)/i

function AddTorrentDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onAdded: () => void
}) {
  const t = useT(messages)
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [inputKey, setInputKey] = useState(0)
  const [start, setStart] = useState(true)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const add = useAction(
    async (c, input: { urlOrMagnet?: string; torrent?: string; paused: boolean }) =>
      c.downloads.add({ body: input }),
  )
  const trimmed = link.trim()
  const linkError = file
    ? undefined
    : !trimmed
      ? t('add.needOne')
      : LINK.test(trimmed)
        ? undefined
        : t('add.linkInvalid')

  const reset = () => {
    setLink('')
    setFile(null)
    setInputKey((k) => k + 1)
    setTouched(false)
    setError(null)
  }
  const choose = (f: File | undefined) => {
    setFile(f ?? null)
    setError(null)
  }
  const submit = async () => {
    setTouched(true)
    if (linkError) return
    try {
      const added = await add.run(
        file
          ? { torrent: await toBase64(file), paused: !start }
          : { urlOrMagnet: trimmed, paused: !start },
      )
      onAdded()
      onOpenChange(false)
      reset()
      toast.success(t('add.added'), { description: added.name })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent
        size="md"
        title={t('add.title')}
        description={t('add.description')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" icon="add" loading={add.pending} onClick={submit}>
              {t('add.submit')}
            </Button>
          </>
        }
      >
        {/* the whole form takes a dropped file; the file field is the way in from a keyboard */}
        <fieldset
          aria-label={t('add.title')}
          className="grid min-w-0 gap-4"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) e.preventDefault()
          }}
          onDrop={(e) => {
            const dropped = e.dataTransfer.files[0]
            if (!dropped) return
            e.preventDefault()
            choose(dropped)
          }}
        >
          <Field
            label={t('add.link')}
            hint={t('add.linkHint')}
            error={touched && linkError ? linkError : undefined}
          >
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="magnet:?xt=urn:btih:…"
              spellCheck={false}
              disabled={!!file}
              className="font-mono"
            />
          </Field>
          <Field label={t('add.file')} hint={t('add.fileHint')}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={inputKey}
                type="file"
                accept=".torrent,application/x-bittorrent"
                aria-label={t('add.file')}
                onChange={(e) => choose(e.target.files?.[0])}
                className="max-w-full text-caption text-text-2 file:me-3 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-s2 file:px-3 file:py-1.5 file:text-text file:text-ui"
              />
              {file && (
                <>
                  <span className="font-mono text-figure text-text-3">
                    {t('add.fileChosen', { name: file.name, size: bytes(file.size) })}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFile(null)
                      setInputKey((k) => k + 1)
                    }}
                  >
                    {t('add.fileClear')}
                  </Button>
                </>
              )}
            </div>
          </Field>
          <Field inline label={t('add.start')}>
            <Checkbox checked={start} onCheckedChange={(v) => setStart(v === true)} />
          </Field>
          {error && (
            <p role="alert" className="text-caption text-danger">
              {t('add.failed')}: {error}
            </p>
          )}
        </fieldset>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- detail

const PRIORITIES: TorrentFile['priority'][] = ['high', 'normal', 'skip']

const fileName = (path: string) => path.split('/').pop() ?? path

function TorrentSheet({
  torrent: x,
  onOpenChange,
  onChanged,
}: {
  torrent: Torrent | null
  onOpenChange: (o: boolean) => void
  onChanged: () => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const { relative } = useRelative()
  const router = useRouter()
  const [removing, setRemoving] = useState(false)
  const [deleteData, setDeleteData] = useState(false)
  const pause = useAction((c, id: string) => c.downloads.pause({ params: { id } }))
  const resume = useAction((c, id: string) => c.downloads.resume({ params: { id } }))
  const remove = useAction((c, id: string, data: boolean) =>
    c.downloads.delete({ params: { id }, body: { deleteData: data } }),
  )
  const priority = useAction((c, id: string, path: string, p: TorrentFile['priority']) =>
    c.downloads.setFilePriority({ params: { id }, body: { path, priority: p } }),
  )
  const then = (p: Promise<unknown>) => p.then(onChanged, failed(t))

  return (
    <Sheet open={!!x} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={x?.name ?? t('sheet.fallback')}
        description={
          x
            ? t('sheet.description', { status: t(`state.${x.state}`), size: bytes(x.size) })
            : undefined
        }
        className="w-[min(40rem,100vw-2rem)]"
      >
        {x && (
          <div className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              {x.state === 'paused' ? (
                <Button size="sm" icon="play" onClick={() => then(resume.run(x.id))}>
                  {t('resume')}
                </Button>
              ) : (
                <Button size="sm" icon="pause" onClick={() => then(pause.run(x.id))}>
                  {t('pause')}
                </Button>
              )}
              {x.movieId !== null && (
                <Button
                  size="sm"
                  icon="movie"
                  onClick={() => x.movieId !== null && router.push(moviePath(x.movieId))}
                >
                  {t('openMovie')}
                </Button>
              )}
              <Button size="sm" variant="danger" icon="delete" onClick={() => setRemoving(true)}>
                {t('remove')}
              </Button>
            </div>
            {x.stateReason && (
              <p className="rounded-md border border-line bg-s2 p-3 text-caption text-text-2">
                {x.stateReason}
              </p>
            )}
            <Tabs defaultValue="general" variant="line">
              <TabsList aria-label={t('details')} className="max-w-full overflow-x-auto">
                <TabsTrigger value="general">{t('tab.general')}</TabsTrigger>
                <TabsTrigger value="files" count={x.files.length}>
                  {t('tab.files')}
                </TabsTrigger>
                <TabsTrigger value="trackers" count={x.trackers.length}>
                  {t('tab.trackers')}
                </TabsTrigger>
                <TabsTrigger value="seeding">{t('tab.seeding')}</TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="pt-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
                  {(
                    [
                      [
                        t('general.progress'),
                        t('general.progressValue', {
                          percent: percent(x.progress),
                          size: bytes(x.size),
                        }),
                      ],
                      [
                        t('general.speed'),
                        t('totals', { down: rate(x.downRate), up: rate(x.upRate) }),
                      ],
                      [t('general.eta'), x.eta ? duration(x.eta, locale) : '—'],
                      [
                        t('general.seeds'),
                        t('general.count', { connected: x.seeds.connected, total: x.seeds.total }),
                      ],
                      [
                        t('general.peers'),
                        t('general.count', { connected: x.peers.connected, total: x.peers.total }),
                      ],
                      [
                        t('general.uploaded'),
                        t('general.uploadedValue', {
                          size: bytes(x.uploaded),
                          ratio: x.ratio.toFixed(2),
                        }),
                      ],
                      [t('general.added'), relative(x.addedAt)],
                      [t('general.swarm'), x.private ? t('swarm.private') : t('swarm.public')],
                      [t('general.savedTo'), x.savePath],
                      [t('general.hash'), x.infoHash],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-text-3">{k}</dt>
                      <dd className="min-w-0 break-all font-mono text-figure text-text-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </TabsContent>
              <TabsContent value="files" className="pt-4">
                {x.files.length === 0 ? (
                  <p className="text-caption text-text-3">{t('noFiles')}</p>
                ) : (
                  <ul className="grid gap-3">
                    {x.files.map((f) => (
                      <li key={f.path} className="grid gap-1.5">
                        <div className="flex items-center gap-3">
                          <span
                            className="min-w-0 flex-1 truncate font-mono text-release text-text-2"
                            title={f.path}
                          >
                            {f.path.split('/').slice(1).join('/') || f.path}
                          </span>
                          <span className="font-mono text-figure text-text-3">{bytes(f.size)}</span>
                          <Select
                            value={f.priority}
                            onValueChange={(p) =>
                              then(priority.run(x.id, f.path, p as TorrentFile['priority']))
                            }
                            aria-label={t('priorityFor', { name: fileName(f.path) })}
                            options={PRIORITIES.map((p) => ({
                              value: p,
                              label: t(`priority.${p}`),
                            }))}
                            className="w-40"
                          />
                        </div>
                        <Progress
                          size="sm"
                          value={f.priority === 'skip' ? 0 : f.progress * 100}
                          aria-label={t('progressOf', { name: fileName(f.path) })}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="trackers" className="pt-4">
                {x.trackers.length === 0 ? (
                  <p className="text-caption text-text-3">{t('noTrackers')}</p>
                ) : (
                  <ul className="grid gap-2">
                    {x.trackers.map((tr) => (
                      <li key={tr.url} className="grid gap-0.5 rounded-md border border-line p-3">
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-mono text-release text-text-2">
                            {tr.url}
                          </span>
                          <Badge
                            tone={
                              tr.status === 'working'
                                ? 'success'
                                : tr.status === 'error'
                                  ? 'danger'
                                  : tr.status === 'not-contacted'
                                    ? 'neutral'
                                    : 'info'
                            }
                          >
                            {t(`tracker.${tr.status}`)}
                          </Badge>
                        </div>
                        <span className="text-caption text-text-3">
                          {t('tracker.peers', { count: tr.peers })}
                          {tr.message ? ` · ${tr.message}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="seeding" className="grid gap-3 pt-4 text-ui">
                <SeedingRule torrent={x} />
              </TabsContent>
            </Tabs>
          </div>
        )}
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title={t('remove.title')}
          description={
            <span className="grid gap-3">
              {t('remove.body')}
              <span className="flex items-center gap-2">
                <Checkbox
                  id="delete-data"
                  checked={deleteData}
                  onCheckedChange={(v) => setDeleteData(v === true)}
                />
                <label htmlFor="delete-data">{t('remove.data')}</label>
              </span>
            </span>
          }
          confirmLabel={t('remove')}
          destructive
          onConfirm={() =>
            x &&
            remove.run(x.id, deleteData).then(() => {
              setDeleteData(false)
              onChanged()
              onOpenChange(false)
              toast({ title: t('remove.done') })
            }, failed(t))
          }
        />
      </SheetContent>
    </Sheet>
  )
}

/** The rule's sentence with its two values in bold, wherever the catalog puts them. */
function SeedingRule({ torrent: x }: { torrent: Torrent }) {
  const t = useT(messages)
  const locale = useLocale()
  const rule = x.seedingRule
  const values: Record<string, string> = {
    '\uE000': rule.ratio === null ? '∞' : String(rule.ratio),
    '\uE001': rule.minutes ? duration(rule.minutes * 60, locale) : t('seeding.ever'),
  }
  const parts = t('seeding.rule', { ratio: '\uE000', time: '\uE001' }).split(/([\uE000\uE001])/)
  return (
    <>
      <p className="text-text-2">
        {parts.map((p, i) =>
          values[p] ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: the sentence's parts never reorder
            <strong key={i} className="text-text">
              {values[p]}
            </strong>
          ) : (
            p
          ),
        )}
      </p>
      {rule.minMinutes ? (
        <p className="text-text-2">
          {t('seeding.minimum', { time: duration(rule.minMinutes * 60, locale) })}
        </p>
      ) : null}
      <p className="text-caption text-text-3">{t('seeding.note')}</p>
    </>
  )
}
