'use client'
import type { Torrent, TorrentFile, TorrentLimits, VpnStatus } from '@highsea-tv/api-contract'
import { bytes, duration, percent, rate } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import type { ColorRole } from '@highsea-tv/tokens'
// SPDX-License-Identifier: AGPL-3.0-only
// A8 Downloads (activity-downloads.md#downloads), ported from the prototype with real data: every
// torrent, the library's and manual ones, with live rates; a detail sheet with files and their
// priority, trackers and the seeding rule; add by magnet, address or file; global limits; and the
// VPN's state, always visible. What real data changes from the prototype:
// - categories come from the server (6b): the toolbar's filter lists the ones torrents use, as the
//   prototype's does, and Add's select offers manual and the owner's, not movies, which is the
//   library's (answer 5);
// - a finished manual torrent's sheet has a More menu with Import into the library, opening A17
//   on its folder (answer 7);
// - Add takes a .torrent file too, picked or dropped, sent as base64; any http(s) address passes,
//   since an indexer's download link rarely ends in .torrent, and the server has the last word;
// - rates refresh every two seconds, as no event announces them; changes come by `torrents.updated`;
// - the VPN line reads `vpn.status`, and an exit address not checked yet says so;
// - trackers can be not contacted yet, private torrents say so in General, and the seeding rule
//   carries its minimum time.
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).
import { admin, line } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Details,
  Dialog,
  EmptyState,
  Field,
  Figure,
  Icon,
  type IconName,
  Input,
  ProgressBar,
  Select,
  Sheet,
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
  TitleButton,
  TitleCell,
  toast,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { toBase64 } from './base64.ts'
import { downloads as messages } from './downloads-messages.ts'
import { torrentTone } from './downloads-status.ts'
import { Loadable } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { useRouter } from './navigation.tsx'
import { pickFile, useFileDrop } from './pick-file.ts'
import { AdminPage } from './shell.tsx'
import { NoneShown, Release, RowMenu, ToolbarFigure } from './table-parts.tsx'
import { useRelative } from './time.ts'

const sp = tokens.space
const ui = tokens.adminText.ui
const MBps = 1_000_000
const LIVE = ['torrents.updated', 'queue.updated']
/** Rates change every second and no event says so: the list refetches quietly this often. */
const RATES_EVERY = 2_000
const VPN_SETTINGS = '/settings/vpn'
/** The category filter (the web's w-44), the progress column (w-40) and a file's priority (w-40). */
const CATEGORY_WIDTH = admin.downloads.categoryWidth
const PROGRESS_WIDTH = admin.progressWidth
const PRIORITY_WIDTH = admin.downloads.priorityWidth
/** The detail sheet's widest (the web's min(40rem, 100vw - 2rem); the sheet keeps the margin). */
const SHEET_WIDTH = admin.downloads.sheetWidth

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
  const [category, setCategory] = useState('all')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingLimits, setEditingLimits] = useState(false)
  const pauseAll = useAction((c) => c.downloads.pauseAll())
  const resumeAll = useAction((c) => c.downloads.resumeAll())

  const actions = (
    <>
      <Button icon="speed" onPress={() => setEditingLimits(true)} disabled={!limits.data}>
        {t('limits')}
      </Button>
      <Button
        icon="pause"
        onPress={() =>
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
        onPress={() =>
          resumeAll
            .run()
            .then(() => toast({ title: t('resumed') }), failed(t))
            .then(torrents.refetch)
        }
        disabled={!torrents.data?.length}
      >
        {t('resumeAll')}
      </Button>
      <Button variant="primary" icon="add" onPress={() => setAdding(true)}>
        {t('add')}
      </Button>
    </>
  )

  return (
    <AdminPage title={t('title')} actions={actions}>
      <View style={{ gap: sp['5'], minWidth: 0 }}>
        {limits.data && <VpnBanner limits={limits.data} />}
        <Loadable query={torrents} what={t('what')}>
          {(ts) => {
            if (ts.length === 0)
              return (
                <EmptyState
                  icon="downloads"
                  title={t('empty.title')}
                  action={
                    <Button variant="primary" icon="add" onPress={() => setAdding(true)}>
                      {t('add')}
                    </Button>
                  }
                >
                  {t('empty.body')}
                </EmptyState>
              )
            const used = [...new Set(ts.map((x) => x.category))].sort()
            const shown = ts
              .filter(states[filter])
              .filter((x) => category === 'all' || x.category === category)
            const down = ts.reduce((s, x) => s + x.downRate, 0)
            const up = ts.reduce((s, x) => s + x.upRate, 0)
            return (
              <TableFrame>
                <TableToolbar>
                  <Tabs<StateFilter>
                    aria-label={t('filterBy')}
                    size="sm"
                    value={filter}
                    onValueChange={setFilter}
                    options={(Object.keys(states) as StateFilter[]).map((k) => ({
                      value: k,
                      label: t(`filter.${k}`),
                      count: ts.filter(states[k]).length,
                    }))}
                  />
                  <View style={{ width: CATEGORY_WIDTH }}>
                    <Select
                      size="sm"
                      value={used.includes(category) ? category : 'all'}
                      onValueChange={setCategory}
                      aria-label={t('category')}
                      options={[
                        { value: 'all', label: t('category.all') },
                        ...used.map((c) => ({ value: c, label: sentence(c) })),
                      ]}
                    />
                  </View>
                  <ToolbarFigure>{t('totals', { down: rate(down), up: rate(up) })}</ToolbarFigure>
                </TableToolbar>
                <View role="tabpanel" aria-label={t(`filter.${filter}`)}>
                  {shown.length === 0 ? (
                    <NoneShown>{t('noMatch')}</NoneShown>
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
                              <TableCell tall truncate>
                                <TitleCell
                                  title={
                                    <TitleButton onPress={() => setOpen(x.id)}>
                                      {x.name}
                                    </TitleButton>
                                  }
                                  detail={t('detail', {
                                    category: x.category,
                                    indexer: x.indexer ?? t('byHand'),
                                  })}
                                />
                              </TableCell>
                              <TableCell numeric>{bytes(x.size)}</TableCell>
                              <TableCell>
                                <View style={{ width: PROGRESS_WIDTH }}>
                                  <ProgressBar
                                    look="panel"
                                    value={x.progress * 100}
                                    tone={s.bar}
                                    showValue
                                    label={t('progressOf', { name: x.name })}
                                  />
                                </View>
                              </TableCell>
                              <TableCell numeric>{x.downRate ? rate(x.downRate) : '—'}</TableCell>
                              <TableCell numeric>{x.upRate ? rate(x.upRate) : '—'}</TableCell>
                              <TableCell numeric>
                                {`${x.seeds.connected}/${x.peers.connected}`}
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
                </View>
              </TableFrame>
            )
          }}
        </Loadable>
      </View>
      <TorrentSheet
        torrent={torrents.data?.find((x) => x.id === open) ?? null}
        onClose={() => setOpen(null)}
        onChanged={torrents.refetch}
      />
      <AddTorrentDialog open={adding} onClose={() => setAdding(false)} onAdded={torrents.refetch} />
      {limits.data && (
        <LimitsDialog
          // a fresh form each time it opens, from what's saved
          key={editingLimits ? 'open' : 'closed'}
          open={editingLimits}
          onClose={() => setEditingLimits(false)}
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
): [IconName, ColorRole, string, string] {
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
        'success',
        t('vpn.through', { provider }),
        [exit, v.forwardedPort && t('vpn.port', { port: v.forwardedPort })]
          .filter(Boolean)
          .join(' · '),
      ]
    }
    case 'connecting':
      return ['loading', 'text-3', t('vpn.connecting', { provider }), t('vpn.connectingLine')]
    case 'off':
      return ['warning', 'warning', t('vpn.off'), t('vpn.offLine')]
    default:
      return [
        'error',
        'danger',
        v.state === 'down' ? t('vpn.down', { provider }) : t('vpn.failed'),
        t('vpn.stoppedLine'),
      ]
  }
}

function VpnBanner({ limits: l }: { limits: TorrentLimits }) {
  const t = useT(messages)
  const theme = useTheme()
  const status = useQuery('vpn:status', (c) => c.vpn.status(), ['vpn.updated'])
  const v = status.data
  if (!v) return null
  const [icon, tone, title, detail] = vpnLine(v, t)
  const down = l.downloadRate
    ? t('rate.down', { rate: rate(l.downloadRate) })
    : t('rate.downUnlimited')
  const up = l.uploadRate ? t('rate.up', { rate: rate(l.uploadRate) }) : t('rate.upUnlimited')
  return (
    <View
      role="status"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: sp['3'],
        rowGap: sp['1'],
        paddingHorizontal: sp['3'] + sp['0.5'],
        paddingVertical: sp['2'] + sp['0.5'],
        borderWidth: line.thin,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.md,
        backgroundColor: theme.colors.s1,
        minWidth: 0,
      }}
    >
      <Icon name={icon} size={tokens.icon.size.sm} color={tone} />
      <Text size={ui.size} leading={ui.leading} weight={500}>
        {title}
      </Text>
      <Text size={ui.size} leading={ui.leading} color="text-2">
        {detail}
      </Text>
      {v.state === 'off' && (
        <TextLink href={VPN_SETTINGS} look="ui">
          {t('vpn.setUp')}
        </TextLink>
      )}
      <ToolbarFigure>{`${down} · ${up}`}</ToolbarFigure>
    </View>
  )
}

function LimitsDialog({
  open,
  onClose,
  limits,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  limits: TorrentLimits
  onSaved: () => void
}) {
  const t = useT(messages)
  const [down, setDown] = useState(String(limits.downloadRate / MBps))
  const [up, setUp] = useState(String(limits.uploadRate / MBps))
  const save = useAction((c, body: TorrentLimits) => c.downloads.setLimits({ body }))
  const valid = (v: string) => v.trim() !== '' && Number(v) >= 0 && !Number.isNaN(Number(v))
  return (
    <Dialog
      open={open}
      onClose={onClose}
      closable
      size="sm"
      title={t('limits.title')}
      description={t('limits.description')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!valid(down) || !valid(up)}
            loading={save.pending}
            onPress={() =>
              save
                .run({
                  downloadRate: Math.round(Number(down) * MBps),
                  uploadRate: Math.round(Number(up) * MBps),
                })
                .then(() => {
                  onSaved()
                  onClose()
                  toast.success(t('limits.saved'))
                }, failed(t))
            }
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <View style={{ gap: sp['4'] }}>
        <Field label={t('limits.download')} error={valid(down) ? undefined : t('limits.invalid')}>
          <Input end={t('limits.unit')} inputMode="decimal" value={down} onChangeText={setDown} />
        </Field>
        <Field label={t('limits.upload')} error={valid(up) ? undefined : t('limits.invalid')}>
          <Input end={t('limits.unit')} inputMode="decimal" value={up} onChangeText={setUp} />
        </Field>
      </View>
    </Dialog>
  )
}

// ---------------------------------------------------------------- add

const LINK = /^(magnet:\?xt=urn:btih:|https?:\/\/.+)/i
/** A category's name as a label: its own name, in sentence case (prototype-gaps.md, stage 5). */
const sentence = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)
const TORRENT_FILES = '.torrent,application/x-bittorrent'

/** Torrents added without a category go here (judgement call 25). */
const MANUAL = 'manual'

function AddTorrentDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const t = useT(messages)
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [start, setStart] = useState(true)
  const [category, setCategory] = useState(MANUAL)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const categories = useQuery('torrents:categories', (c) => c.downloads.categories(), [
    'torrents.updated',
  ])
  const add = useAction(
    async (
      c,
      input: { urlOrMagnet?: string; torrent?: string; paused: boolean; category: string },
    ) => c.downloads.add({ body: input }),
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
    setTouched(false)
    setError(null)
  }
  const close = () => {
    reset()
    onClose()
  }
  const choose = (f: File) => {
    setFile(f)
    setError(null)
  }
  // the whole form takes a dropped file; Choose a .torrent file is the way in from a keyboard
  const dropTarget = useFileDrop(choose)
  const submit = async () => {
    setTouched(true)
    if (linkError) return
    try {
      const added = await add.run(
        file
          ? { torrent: await toBase64(file), paused: !start, category }
          : { urlOrMagnet: trimmed, paused: !start, category },
      )
      onAdded()
      close()
      toast.success(t('add.added'), { description: added.name })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      closable
      title={t('add.title')}
      description={t('add.description')}
      footer={
        <>
          <Button variant="ghost" onPress={close}>
            {t('cancel')}
          </Button>
          <Button variant="primary" icon="add" loading={add.pending} onPress={submit}>
            {t('add.submit')}
          </Button>
        </>
      }
    >
      <View
        ref={dropTarget}
        role="group"
        aria-label={t('add.title')}
        style={{ gap: sp['4'], minWidth: 0 }}
      >
        <Field
          label={t('add.link')}
          hint={t('add.linkHint')}
          error={touched && linkError ? linkError : undefined}
          disabled={!!file}
        >
          <Input
            mono
            value={link}
            onChangeText={setLink}
            placeholder="magnet:?xt=urn:btih:…"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Field>
        <Field label={t('add.file')} hint={t('add.fileHint')}>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] }}
          >
            <Button icon="import" onPress={() => pickFile(TORRENT_FILES, choose)}>
              {t('add.fileChoose')}
            </Button>
            {file && (
              <>
                <Figure color="text-3">
                  {t('add.fileChosen', { name: file.name, size: bytes(file.size) })}
                </Figure>
                <Button size="sm" variant="ghost" onPress={() => setFile(null)}>
                  {t('add.fileClear')}
                </Button>
              </>
            )}
          </View>
        </Field>
        <Field label={t('add.category')} hint={t('add.categoryHint')}>
          <Select
            value={category}
            onValueChange={setCategory}
            options={(categories.data ?? [{ name: MANUAL }])
              .filter((c) => c.name !== 'movies')
              .map((c) => ({ value: c.name, label: sentence(c.name) }))}
          />
        </Field>
        <Checkbox label={t('add.start')} checked={start} onCheckedChange={setStart} />
        {error && (
          <Text role="alert" variant="caption" color="badge-danger">
            {`${t('add.failed')}: ${error}`}
          </Text>
        )}
      </View>
    </Dialog>
  )
}

// ---------------------------------------------------------------- detail

const PRIORITIES: TorrentFile['priority'][] = ['high', 'normal', 'skip']
type SheetTab = 'general' | 'files' | 'trackers' | 'seeding'

const fileName = (path: string) => path.split('/').pop() ?? path

/** A17 on the torrent's content: its folder, or its one file (the scan takes either). */
export const importPath = (x: Pick<Torrent, 'savePath' | 'name'>) =>
  `/activity/import?path=${encodeURIComponent(`${x.savePath.replace(/\/+$/, '')}/${x.name}`)}`

function TorrentSheet({
  torrent: x,
  onClose,
  onChanged,
}: {
  torrent: Torrent | null
  onClose: () => void
  onChanged: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const router = useRouter()
  const [tab, setTab] = useState<SheetTab>('general')
  const [removing, setRemoving] = useState(false)
  const [deleteData, setDeleteData] = useState(false)
  const pause = useAction((c, id: string) => c.downloads.pause({ params: { id } }))
  const resume = useAction((c, id: string) => c.downloads.resume({ params: { id } }))
  const remove = useAction((c, id: string, data: boolean) =>
    c.downloads.delete({ params: { id }, body: { deleteData: data } }),
  )
  const then = (p: Promise<unknown>) => p.then(onChanged, failed(t))
  const close = () => {
    setTab('general')
    onClose()
  }

  return (
    <Sheet
      open={!!x}
      onClose={close}
      side="right"
      width={SHEET_WIDTH}
      title={x?.name ?? t('sheet.fallback')}
      description={
        x
          ? t('sheet.description', { status: t(`state.${x.state}`), size: bytes(x.size) })
          : undefined
      }
    >
      {x && (
        <View style={{ gap: sp['5'], minWidth: 0 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp['2'] }}>
            {x.state === 'paused' ? (
              <Button size="sm" icon="play" onPress={() => then(resume.run(x.id))}>
                {t('resume')}
              </Button>
            ) : (
              <Button size="sm" icon="pause" onPress={() => then(pause.run(x.id))}>
                {t('pause')}
              </Button>
            )}
            {x.movieId !== null && (
              <Button
                size="sm"
                icon="movie"
                onPress={() => x.movieId !== null && router.push(moviePath(x.movieId))}
              >
                {t('openMovie')}
              </Button>
            )}
            <Button size="sm" variant="danger" icon="delete" onPress={() => setRemoving(true)}>
              {t('remove')}
            </Button>
            {x.manual && (
              <RowMenu
                label={t('more', { name: x.name })}
                items={[
                  {
                    label: x.progress < 1 ? t('importLater') : t('import'),
                    icon: 'import',
                    disabled: x.progress < 1,
                    onSelect: () => router.push(importPath(x)),
                  },
                ]}
              />
            )}
          </View>
          {x.stateReason && (
            <View
              style={{
                padding: sp['3'],
                borderWidth: line.thin,
                borderColor: theme.colors.line,
                borderRadius: tokens.radius.md,
                backgroundColor: theme.colors.s2,
              }}
            >
              <Text variant="caption" color="text-2">
                {x.stateReason}
              </Text>
            </View>
          )}
          <View style={{ minWidth: 0 }}>
            <Tabs<SheetTab>
              variant="line"
              aria-label={t('details')}
              value={tab}
              onValueChange={setTab}
              options={[
                { value: 'general', label: t('tab.general') },
                { value: 'files', label: t('tab.files'), count: x.files.length },
                { value: 'trackers', label: t('tab.trackers'), count: x.trackers.length },
                { value: 'seeding', label: t('tab.seeding') },
              ]}
            />
            <View role="tabpanel" aria-label={t(`tab.${tab}`)} style={{ paddingTop: sp['4'] }}>
              {tab === 'general' ? (
                <General torrent={x} />
              ) : tab === 'files' ? (
                <Files torrent={x} onChanged={onChanged} />
              ) : tab === 'trackers' ? (
                <Trackers torrent={x} />
              ) : (
                <SeedingRule torrent={x} />
              )}
            </View>
          </View>
        </View>
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={t('remove.title')}
        description={
          <View style={{ gap: sp['3'] }}>
            <Text variant="caption" color="text-2">
              {t('remove.body')}
            </Text>
            <Checkbox
              label={t('remove.data')}
              checked={deleteData}
              onCheckedChange={setDeleteData}
            />
          </View>
        }
        confirmLabel={t('remove')}
        destructive
        onConfirm={() =>
          x &&
          remove.run(x.id, deleteData).then(() => {
            setDeleteData(false)
            setRemoving(false)
            onChanged()
            close()
            toast({ title: t('remove.done') })
          }, failed(t))
        }
      />
    </Sheet>
  )
}

function General({ torrent: x }: { torrent: Torrent }) {
  const t = useT(messages)
  const locale = useLocale()
  const { relative } = useRelative()
  const rows: [string, string][] = [
    [
      t('general.progress'),
      t('general.progressValue', { percent: percent(x.progress), size: bytes(x.size) }),
    ],
    [t('general.speed'), t('totals', { down: rate(x.downRate), up: rate(x.upRate) })],
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
      t('general.uploadedValue', { size: bytes(x.uploaded), ratio: x.ratio.toFixed(2) }),
    ],
    [t('general.added'), relative(x.addedAt)],
    [t('general.swarm'), x.private ? t('swarm.private') : t('swarm.public')],
    [t('general.savedTo'), x.savePath],
    [t('general.hash'), x.infoHash],
  ]
  return (
    <Details
      terms="ui"
      gap={sp['2']}
      rows={rows.map(([term, value]) => ({ term, value: <Value>{value}</Value> }))}
    />
  )
}

/** A value in General: mono `figure` in text-2, broken anywhere so a hash or a path wraps. */
function Value({ children }: { children: string }) {
  const figure = tokens.adminText.figure
  return (
    <Text
      size={figure.size}
      leading={figure.leading}
      mono
      color="text-2"
      style={{ minWidth: 0, flexShrink: 1, wordBreak: 'break-all' } as object}
    >
      {children}
    </Text>
  )
}

function Files({ torrent: x, onChanged }: { torrent: Torrent; onChanged: () => void }) {
  const t = useT(messages)
  const priority = useAction((c, id: string, path: string, p: TorrentFile['priority']) =>
    c.downloads.setFilePriority({ params: { id }, body: { path, priority: p } }),
  )
  if (x.files.length === 0)
    return (
      <Text variant="caption" color="text-3">
        {t('noFiles')}
      </Text>
    )
  return (
    <View role="list" style={{ gap: sp['3'] }}>
      {x.files.map((f) => (
        <View key={f.path} role="listitem" style={{ gap: sp['1'] + sp['0.5'], minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['3'] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Release>{f.path.split('/').slice(1).join('/') || f.path}</Release>
            </View>
            <Figure color="text-3">{bytes(f.size)}</Figure>
            <View style={{ width: PRIORITY_WIDTH }}>
              <Select
                size="sm"
                value={f.priority}
                onValueChange={(p) =>
                  priority
                    .run(x.id, f.path, p as TorrentFile['priority'])
                    .then(onChanged, failed(t))
                }
                aria-label={t('priorityFor', { name: fileName(f.path) })}
                options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
              />
            </View>
          </View>
          <ProgressBar
            look="panel"
            value={f.priority === 'skip' ? 0 : f.progress * 100}
            label={t('progressOf', { name: fileName(f.path) })}
          />
        </View>
      ))}
    </View>
  )
}

const trackerTone = (status: Torrent['trackers'][number]['status']) =>
  status === 'working'
    ? 'success'
    : status === 'error'
      ? 'danger'
      : status === 'not-contacted'
        ? 'neutral'
        : 'info'

function Trackers({ torrent: x }: { torrent: Torrent }) {
  const t = useT(messages)
  const theme = useTheme()
  if (x.trackers.length === 0)
    return (
      <Text variant="caption" color="text-3">
        {t('noTrackers')}
      </Text>
    )
  return (
    <View role="list" style={{ gap: sp['2'] }}>
      {x.trackers.map((tr) => (
        <View
          key={tr.url}
          role="listitem"
          style={{
            gap: sp['0.5'],
            padding: sp['3'],
            borderWidth: line.thin,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.md,
            minWidth: 0,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: sp['2'] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Release>{tr.url}</Release>
            </View>
            <Badge tone={trackerTone(tr.status)}>{t(`tracker.${tr.status}`)}</Badge>
          </View>
          <Text variant="caption" color="text-3">
            {`${t('tracker.peers', { count: tr.peers })}${tr.message ? ` · ${tr.message}` : ''}`}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** The rule's sentence with its two values in bold, wherever the catalog puts them. */
function SeedingRule({ torrent: x }: { torrent: Torrent }) {
  const t = useT(messages)
  const locale = useLocale()
  const rule = x.seedingRule
  const values: Record<string, string> = {
    '': rule.ratio === null ? '∞' : String(rule.ratio),
    '': rule.minutes ? duration(rule.minutes * 60, locale) : t('seeding.ever'),
  }
  const parts = t('seeding.rule', { ratio: '', time: '' }).split(/([])/)
  return (
    <View style={{ gap: sp['3'] }}>
      <Text size={ui.size} leading={ui.leading} color="text-2">
        {parts.map((p, i) =>
          values[p] ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: the sentence's parts never reorder
            <Text key={i} size={ui.size} leading={ui.leading} weight={600} color="text">
              {values[p]}
            </Text>
          ) : (
            p
          ),
        )}
      </Text>
      {rule.minMinutes ? (
        <Text size={ui.size} leading={ui.leading} color="text-2">
          {t('seeding.minimum', { time: duration(rule.minMinutes * 60, locale) })}
        </Text>
      ) : null}
      <Text variant="caption" color="text-3">
        {t('seeding.note')}
      </Text>
    </View>
  )
}
