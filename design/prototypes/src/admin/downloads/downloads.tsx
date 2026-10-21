// SPDX-License-Identifier: AGPL-3.0-only
// A8 Downloads (docs/product/activity-downloads.md#downloads): the built-in torrent client. Every
// torrent, the library's and manual ones, with live rates; a detail sheet with files and their
// priority, peers, trackers and the seeding rule; add by magnet or file; global limits; and the
// VPN binding, always visible, because a leak is the one failure that matters most here.

import { bytes, duration, percent, rate, relative } from '@highsea/core/format'
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
import { type ReactNode, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type { Torrent, TorrentFile, TorrentLimits } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'
import { torrentStatus } from '../status.ts'

const MBps = 1_000_000

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
const stateLabels: Record<StateFilter, string> = {
  all: 'All',
  active: 'Active',
  seeding: 'Seeding',
  paused: 'Paused',
  issues: 'Needs attention',
}

export function Downloads() {
  const torrents = useQuery('torrents', (c) => c.downloads.list(), ['torrents.updated', 'tick'])
  const limits = useQuery('limits', (c) => c.downloads.limits(), ['torrents.updated'])
  const [filter, setFilter] = useState<StateFilter>('all')
  const [category, setCategory] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingLimits, setEditingLimits] = useState(false)
  const pauseAll = useAction((c) => c.downloads.pauseAll())
  const resumeAll = useAction((c) => c.downloads.resumeAll())

  const actions = (
    <>
      <Button icon="speed" onClick={() => setEditingLimits(true)} disabled={!limits.data}>
        Limits
      </Button>
      <Button
        icon="pause"
        onClick={() => pauseAll.run().then(() => toast({ title: 'Downloads paused' }))}
        disabled={!torrents.data?.length}
      >
        Pause all
      </Button>
      <Button
        icon="play"
        onClick={() => resumeAll.run().then(() => toast({ title: 'Downloads resumed' }))}
        disabled={!torrents.data?.length}
      >
        Resume all
      </Button>
      <Button variant="primary" icon="add" onClick={() => setAdding(true)}>
        Add torrent
      </Button>
    </>
  )

  return (
    <AdminPage title="Downloads" actions={actions}>
      {limits.data && <VpnBanner limits={limits.data} />}
      <Loadable query={torrents} what="the torrent client">
        {(ts) => {
          if (ts.length === 0)
            return (
              <EmptyState
                icon="downloads"
                title="No torrents"
                action={
                  <Button variant="primary" icon="add" onClick={() => setAdding(true)}>
                    Add torrent
                  </Button>
                }
              >
                Releases highsea grabs for the library show here, with anything you add yourself.
              </EmptyState>
            )
          const categories = [...new Set(ts.map((t) => t.category))]
          const shown = ts
            .filter(states[filter])
            .filter((t) => category === 'all' || t.category === category)
          const down = ts.reduce((s, t) => s + t.downRate, 0)
          const up = ts.reduce((s, t) => s + t.upRate, 0)
          return (
            <TableFrame>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as StateFilter)}>
                <TableToolbar>
                  <TabsList aria-label="Filter by state" className="max-w-full overflow-x-auto">
                    {(Object.keys(states) as StateFilter[]).map((k) => (
                      <TabsTrigger key={k} value={k} count={ts.filter(states[k]).length}>
                        {stateLabels[k]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <Select
                    value={category}
                    onValueChange={setCategory}
                    aria-label="Category"
                    options={[
                      { value: 'all', label: 'Every category' },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                    className="w-44"
                  />
                  <span className="ms-auto font-mono text-figure text-text-3">
                    {rate(down)} ↓ · {rate(up)} ↑
                  </span>
                </TableToolbar>
                <TabsContent value={filter}>
                  {shown.length === 0 ? (
                    <p className="px-3.5 py-8 text-center text-caption text-text-3">
                      No torrents match.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead numeric>Size</TableHead>
                          <TableHead>Progress</TableHead>
                          <TableHead numeric>↓</TableHead>
                          <TableHead numeric>↑</TableHead>
                          <TableHead numeric>Peers</TableHead>
                          <TableHead numeric>Ratio</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shown.map((t) => {
                          const s = torrentStatus[t.state]
                          return (
                            <TableRow key={t.id}>
                              <TitleCell
                                title={
                                  <button
                                    type="button"
                                    onClick={() => setOpen(t.id)}
                                    className="max-w-full truncate text-start hover:underline"
                                  >
                                    {t.name}
                                  </button>
                                }
                                detail={`${t.category} · ${t.indexer ?? 'Added by hand'}`}
                              />
                              <TableCell numeric>{bytes(t.size)}</TableCell>
                              <TableCell className="w-40">
                                <Progress
                                  value={t.progress * 100}
                                  tone={s.bar}
                                  showValue
                                  aria-label={`${t.name} progress`}
                                />
                              </TableCell>
                              <TableCell numeric>{t.downRate ? rate(t.downRate) : '—'}</TableCell>
                              <TableCell numeric>{t.upRate ? rate(t.upRate) : '—'}</TableCell>
                              <TableCell numeric>
                                {t.seeds.connected}/{t.peers.connected}
                              </TableCell>
                              <TableCell numeric>{t.ratio.toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge tone={s.tone}>{s.label}</Badge>
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
        torrent={torrents.data?.find((t) => t.id === open) ?? null}
        onOpenChange={(o) => !o && setOpen(null)}
      />
      <AddTorrentDialog open={adding} onOpenChange={setAdding} />
      {limits.data && (
        <LimitsDialog open={editingLimits} onOpenChange={setEditingLimits} limits={limits.data} />
      )}
    </AdminPage>
  )
}

// ---------------------------------------------------------------- VPN

function VpnBanner({ limits: l }: { limits: TorrentLimits }) {
  const status = useQuery('vpn:status', (c) => c.vpn.status(), ['vpn.updated'])
  const v = status.data
  if (!v) return null
  const rates = (
    <span className="ms-auto font-mono text-figure text-text-3">
      {l.downRateLimit ? `↓ ${rate(l.downRateLimit)}` : '↓ unlimited'} ·{' '}
      {l.upRateLimit ? `↑ ${rate(l.upRateLimit)}` : '↑ unlimited'}
    </span>
  )
  const [icon, tone, title, line]: [IconName, string, string, ReactNode] =
    v.state === 'connected'
      ? [
          'shield',
          'text-success',
          `Through ${v.provider}`,
          [`${v.exitIp} (${v.country})`, v.forwardedPort && `Port ${v.forwardedPort}`]
            .filter(Boolean)
            .join(' · '),
        ]
      : v.state === 'connecting'
        ? [
            'loading',
            'text-text-3',
            `Connecting to ${v.provider}…`,
            'Torrents wait until the tunnel is up.',
          ]
        : v.state === 'off'
          ? [
              'warning',
              'text-warning',
              'No VPN',
              'Torrents use your own connection. Anyone in the swarm can see your address.',
            ]
          : [
              'error',
              'text-danger',
              v.state === 'down' ? `${v.provider} is down` : 'The VPN couldn’t connect',
              'Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection.',
            ]
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-s1 px-3.5 py-2.5 text-ui"
    >
      <Icon name={icon} size={16} className={tone} />
      <span className="font-medium text-text">{title}</span>
      <span className="text-text-2">{line}</span>
      {v.state === 'off' && (
        <a href={adminHref('/settings/vpn')} className="text-text underline underline-offset-2">
          Set up a VPN
        </a>
      )}
      {rates}
    </div>
  )
}

function LimitsDialog({
  open,
  onOpenChange,
  limits,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  limits: TorrentLimits
}) {
  const [down, setDown] = useState(String(limits.downRateLimit / MBps))
  const [up, setUp] = useState(String(limits.upRateLimit / MBps))
  const save = useAction((c, patch: Partial<TorrentLimits>) => c.downloads.setLimits(patch))
  const valid = (v: string) => v.trim() !== '' && Number(v) >= 0 && !Number.isNaN(Number(v))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Speed limits"
        description="For every torrent together. 0 means no limit."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!valid(down) || !valid(up)}
              loading={save.pending}
              onClick={() =>
                save
                  .run({ downRateLimit: Number(down) * MBps, upRateLimit: Number(up) * MBps })
                  .then(() => {
                    onOpenChange(false)
                    toast.success('Limits saved')
                  })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Download" error={valid(down) ? undefined : 'Enter 0 or more.'}>
            <Input
              inputMode="decimal"
              value={down}
              onChange={(e) => setDown(e.target.value)}
              end={<span className="text-caption text-text-3">MB/s</span>}
            />
          </Field>
          <Field label="Upload" error={valid(up) ? undefined : 'Enter 0 or more.'}>
            <Input
              inputMode="decimal"
              value={up}
              onChange={(e) => setUp(e.target.value)}
              end={<span className="text-caption text-text-3">MB/s</span>}
            />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- add

function AddTorrentDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [link, setLink] = useState('')
  const [category, setCategory] = useState('movies')
  const [start, setStart] = useState(true)
  const [touched, setTouched] = useState(false)
  const add = useAction((c) =>
    c.downloads.add({
      urlOrMagnet: link.trim(),
      category,
      savePath: `/data/downloads/complete/${category}`,
      startImmediately: start,
    }),
  )
  const valid =
    /^magnet:\?xt=urn:btih:/i.test(link.trim()) || /^https?:\/\/.+\.torrent$/i.test(link.trim())
  const submit = () => {
    setTouched(true)
    if (!valid) return
    add.run().then((t) => {
      onOpenChange(false)
      setLink('')
      setTouched(false)
      toast.success('Torrent added', { description: t.name })
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title="Add a torrent"
        description="Manual torrents aren’t imported into the library. Use Discover for movies."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon="add" loading={add.pending} onClick={submit}>
              Add
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field
            label="Magnet link or .torrent URL"
            hint="Starts with magnet:?xt=urn:btih: or ends in .torrent."
            error={touched && !valid ? 'That isn’t a magnet link or a .torrent URL.' : undefined}
          >
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="magnet:?xt=urn:btih:…"
              spellCheck={false}
              className="font-mono"
            />
          </Field>
          <Field label="Category" hint="Sets the folder it saves to.">
            <Select
              value={category}
              onValueChange={setCategory}
              options={[
                { value: 'movies', label: 'movies' },
                { value: 'manual', label: 'manual' },
              ]}
            />
          </Field>
          <Field inline label="Start right away">
            <Checkbox checked={start} onCheckedChange={(v) => setStart(v === true)} />
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- detail

const priorities: { value: TorrentFile['priority']; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'skip', label: 'Don’t download' },
]

function TorrentSheet({
  torrent: t,
  onOpenChange,
}: {
  torrent: Torrent | null
  onOpenChange: (o: boolean) => void
}) {
  const now = useNow()
  const [, navigate] = useLocation()
  const [removing, setRemoving] = useState(false)
  const [deleteData, setDeleteData] = useState(false)
  const pause = useAction((c, id: string) => c.downloads.pause(id))
  const resume = useAction((c, id: string) => c.downloads.resume(id))
  const remove = useAction((c, id: string) => c.downloads.delete(id, deleteData))
  const priority = useAction((c, id: string, path: string, p: TorrentFile['priority']) =>
    c.downloads.setFilePriority(id, path, p),
  )
  return (
    <Sheet open={!!t} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={t?.name ?? 'Torrent'}
        description={t ? `${torrentStatus[t.state].label} · ${bytes(t.size)}` : undefined}
        className="w-[min(40rem,100vw-2rem)]"
      >
        {t && (
          <div className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              {t.state === 'paused' ? (
                <Button size="sm" icon="play" onClick={() => resume.run(t.id)}>
                  Resume
                </Button>
              ) : (
                <Button size="sm" icon="pause" onClick={() => pause.run(t.id)}>
                  Pause
                </Button>
              )}
              {t.itemId && (
                <Button size="sm" icon="movie" onClick={() => navigate(`/movies/${t.itemId}`)}>
                  Open the movie
                </Button>
              )}
              <Button size="sm" variant="danger" icon="delete" onClick={() => setRemoving(true)}>
                Remove
              </Button>
            </div>
            {t.stateReason && (
              <p className="rounded-md border border-line bg-s2 p-3 text-caption text-text-2">
                {t.stateReason}
              </p>
            )}
            <Tabs defaultValue="general" variant="line">
              <TabsList aria-label="Torrent details" className="max-w-full overflow-x-auto">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="files" count={t.files.length}>
                  Files
                </TabsTrigger>
                <TabsTrigger value="trackers" count={t.trackers.length}>
                  Trackers
                </TabsTrigger>
                <TabsTrigger value="seeding">Seeding</TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="pt-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-ui">
                  {(
                    [
                      ['Progress', `${percent(t.progress)} of ${bytes(t.size)}`],
                      ['Speed', `${rate(t.downRate)} ↓ · ${rate(t.upRate)} ↑`],
                      ['Time left', t.eta ? duration(t.eta) : '—'],
                      ['Seeds', `${t.seeds.connected} of ${t.seeds.total}`],
                      ['Peers', `${t.peers.connected} of ${t.peers.total}`],
                      ['Uploaded', `${bytes(t.uploaded)} · ratio ${t.ratio.toFixed(2)}`],
                      ['Added', relative(t.addedAt, now)],
                      ['Saved to', t.savePath],
                      ['Info hash', t.infoHash],
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
                <ul className="grid gap-3">
                  {t.files.map((f) => (
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
                            priority.run(t.id, f.path, p as TorrentFile['priority'])
                          }
                          aria-label={`Priority for ${f.path.split('/').pop()}`}
                          options={priorities}
                          className="w-40"
                        />
                      </div>
                      <Progress
                        size="sm"
                        value={f.priority === 'skip' ? 0 : f.progress * 100}
                        aria-label={`${f.path.split('/').pop()} progress`}
                      />
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="trackers" className="pt-4">
                <ul className="grid gap-2">
                  {t.trackers.map((tr) => (
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
                                : 'info'
                          }
                        >
                          {tr.status === 'working'
                            ? 'Working'
                            : tr.status === 'error'
                              ? 'Not responding'
                              : 'Updating'}
                        </Badge>
                      </div>
                      <span className="text-caption text-text-3">
                        {tr.peers} peers{tr.message ? ` · ${tr.message}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="seeding" className="grid gap-3 pt-4 text-ui">
                <p className="text-text-2">
                  Seeds until it reaches a ratio of{' '}
                  <strong className="text-text">{t.seedingRule.ratio ?? '∞'}</strong> or has seeded
                  for{' '}
                  <strong className="text-text">
                    {t.seedingRule.minutes ? duration(t.seedingRule.minutes * 60) : 'ever'}
                  </strong>
                  , whichever comes first. Then it stops; the library’s copy stays.
                </p>
                <p className="text-caption text-text-3">
                  Rules come from the indexer’s settings: private trackers usually ask for more.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        )}
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title="Remove this torrent?"
          description={
            <span className="grid gap-3">
              It stops seeding. A movie already imported stays in the library.
              <span className="flex items-center gap-2">
                <Checkbox
                  id="delete-data"
                  checked={deleteData}
                  onCheckedChange={(v) => setDeleteData(v === true)}
                />
                <label htmlFor="delete-data">Also delete the downloaded data</label>
              </span>
            </span>
          }
          confirmLabel="Remove"
          destructive
          onConfirm={() =>
            t &&
            remove.run(t.id).then(() => {
              onOpenChange(false)
              toast({ title: 'Torrent removed' })
            })
          }
        />
      </SheetContent>
    </Sheet>
  )
}
