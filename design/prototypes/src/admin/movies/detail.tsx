// SPDX-License-Identifier: AGPL-3.0-only
// A6 Movie detail (docs/product/movies.md#movie-detail, media-pages.md). One page whether the
// movie is in the library or not. Not added: the summary, Overview (cast, trailers, collection,
// More like this, About) and Cast and crew, with Add movie. Added, it also gains the library's
// actions and tabs: Files (each version with its streams), History, Search (interactive: every
// release with the decision engine's verdict and reasons) and Subtitles (tracks with sync status,
// confidence and offset; manual search and pick; re-sync).

import { bytes, duration, percent, rate, relative } from '@highsea/core/format'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Progress,
  QualityTag,
  Select,
  Skeleton,
  Switch,
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
  Tooltip,
  toast,
} from '@highsea/ui-web'
import { Fragment, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useAction, useNow, useQuery } from '../../mock/hooks.tsx'
import type {
  DiscoverMovie,
  HistoryEventType,
  MediaFile,
  MediaItem,
  Release,
  Stream,
  SubtitleSearchResult,
  SubtitleTrack,
  SyncStatus,
} from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import {
  CastAndCrew,
  Definition,
  MediaOverview,
  MediaSummary,
  ReleaseLine,
  SummarySkeleton,
  useMovieMetadata,
} from '../media/sections.tsx'
import { isStaff } from '../nav.ts'
import { AdminPage, useShell } from '../shell.tsx'
import { torrentStatus } from '../status.ts'
import { AddMovieDialog } from './add-dialog.tsx'
import { movieStatus } from './library.tsx'

type Tab = 'overview' | 'cast' | 'files' | 'history' | 'search' | 'subtitles'

type Metadata = ReturnType<typeof useMovieMetadata>

/**
 * `/movies/:id`: one page and one address in every library state (ADR 0014). The id is the media
 * id, the same before and after adding. Not in the library, the page shows the metadata layer
 * with Add movie; once added it gains the library layer in place, at the same address.
 */
export function MovieDetail() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const meta = useMovieMetadata(id)
  if (meta.status === 'error')
    return (
      <AdminPage title="Movie">
        <EmptyState
          tone="error"
          icon="movie"
          title={meta.error.message}
          action={<Button onClick={() => navigate('/movies')}>Go to Movies</Button>}
        >
          It may have been removed. Discover finds every movie, in the library or not.
        </EmptyState>
      </AdminPage>
    )
  if (meta.status === 'loading')
    return (
      <AdminPage title="Movie">
        <SummarySkeleton />
      </AdminPage>
    )
  return meta.data.inLibrary ? <LibraryMovie id={id} meta={meta} /> : <MetadataMovie meta={meta} />
}

// ---------------------------------------------------------------- not in the library

function MetadataMovie({ meta }: { meta: Metadata }) {
  const { role } = useShell()
  const staff = isStaff(role)
  const [tab, setTab] = useState<Tab>('overview')
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const m = meta.data

  return (
    <AdminPage
      title={m?.title ?? 'Movie'}
      actions={
        m &&
        staff && (
          <Button variant="primary" icon="add" onClick={() => setAdding([m])}>
            Add movie
          </Button>
        )
      }
    >
      {m && (
        <>
          <MediaSummary item={m} meta={m} badges={<Badge tone="neutral">Not in the library</Badge>}>
            <ReleaseLine date={m.releaseDate} />
            {!staff && (
              <p className="text-caption text-text-3">
                Only owners and admins can add movies. Ask the server’s owner for this one.
              </p>
            )}
          </MediaSummary>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
            <TabsList aria-label="Movie sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="cast">Cast and crew</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="pt-5">
              <MediaOverview
                meta={meta}
                staff={staff}
                onAllCast={() => setTab('cast')}
                onAdd={setAdding}
              />
            </TabsContent>
            <TabsContent value="cast" className="pt-5">
              <CastAndCrew meta={meta} />
            </TabsContent>
          </Tabs>
        </>
      )}
      <AddMovieDialog
        movies={adding}
        onOpenChange={(o) => !o && setAdding([])}
        // the page itself turns into the library page, at the same address
        onAdded={() => {}}
      />
    </AdminPage>
  )
}

// ---------------------------------------------------------------- in the library

function LibraryMovie({ id, meta }: { id: string; meta: Metadata }) {
  const { role } = useShell()
  const staff = isStaff(role)
  const [, navigate] = useLocation()
  const movie = useQuery(`movie:${id}`, (c) => c.movies.get(id), ['item.updated', 'movies.updated'])
  const [tab, setTab] = useState<Tab>('overview')
  const [removing, setRemoving] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const update = useAction((c, patch: Partial<MediaItem>) => c.movies.update(id, patch))
  const search = useAction((c) => c.movies.bulkSearch([id]))
  const remove = useAction((c) => c.movies.delete(id, { deleteFiles }))

  const m = movie.data
  const actions =
    m && staff ? (
      <>
        <Button
          icon="search"
          loading={search.pending}
          disabled={m.status === 'available' || m.status === 'downloading'}
          onClick={() =>
            search.run().then(
              () =>
                toast({ title: `Searching for ${m.title}`, description: 'Follow it in Activity.' }),
              (e: Error) => toast.error('Search failed', { description: e.message }),
            )
          }
        >
          Search
        </Button>
        <Button variant="primary" icon="list" onClick={() => setTab('search')}>
          Interactive search
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" iconOnly icon="more" aria-label="More actions" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem icon="refresh" onSelect={() => toast({ title: 'Metadata refreshed' })}>
              Refresh metadata
            </MenuItem>
            <MenuItem icon="delete" danger onSelect={() => setRemoving(true)}>
              Remove from library
            </MenuItem>
          </MenuContent>
        </Menu>
      </>
    ) : undefined

  return (
    <AdminPage title={m?.title ?? 'Movie'} actions={actions}>
      {movie.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="movie"
          title={movie.error.message}
          action={<Button onClick={() => navigate('/movies')}>Go to Movies</Button>}
        >
          It may have been removed. The library lists everything that’s here.
        </EmptyState>
      ) : !m ? (
        <SummarySkeleton />
      ) : (
        <LibraryBody
          movie={m}
          meta={meta}
          staff={staff}
          tab={tab}
          onTab={setTab}
          onMonitor={(monitored) => update.run({ monitored })}
          onAdd={setAdding}
        />
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${m?.title ?? 'this movie'}?`}
        description={
          <span className="grid gap-3">
            It leaves the library and stops being monitored.
            <span className="flex items-center gap-2">
              <Checkbox
                id="delete-files"
                checked={deleteFiles}
                onCheckedChange={(v) => setDeleteFiles(v === true)}
              />
              <label htmlFor="delete-files">Also delete its files from disk</label>
            </span>
          </span>
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() =>
          remove.run().then(
            () => {
              toast.success(`${m?.title} removed`)
              navigate('/movies')
            },
            (e: Error) => toast.error('Couldn’t remove it', { description: e.message }),
          )
        }
      />
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}

function LibraryBody({
  movie: m,
  meta,
  staff,
  tab,
  onTab,
  onMonitor,
  onAdd,
}: {
  movie: MediaItem
  meta: Metadata
  staff: boolean
  tab: Tab
  onTab: (tab: Tab) => void
  onMonitor: (on: boolean) => void
  onAdd: (movies: DiscoverMovie[]) => void
}) {
  const s = movieStatus[m.status]
  return (
    <>
      <MediaSummary
        item={m}
        meta={meta.data}
        badges={
          <>
            <Badge tone={s.tone}>{s.label}</Badge>
            {m.versions.map((v) => (
              <QualityTag key={v.id}>{v.label}</QualityTag>
            ))}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-text-3">
          <span className="font-mono">{m.path}</span>
          {staff ? (
            <span className="flex items-center gap-2">
              <Switch
                id="monitored"
                checked={m.monitored}
                onCheckedChange={onMonitor}
                aria-describedby="monitored-hint"
              />
              <label htmlFor="monitored" className="text-text-2">
                Monitored
              </label>
              <span id="monitored-hint" className="sr-only">
                Grab and upgrade releases automatically
              </span>
            </span>
          ) : (
            <span>{m.monitored ? 'Monitored' : 'Not monitored'}</span>
          )}
        </div>
      </MediaSummary>
      <Tabs value={tab} onValueChange={(v) => onTab(v as Tab)} variant="line">
        <TabsList aria-label="Movie sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cast">Cast and crew</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          {staff && <TabsTrigger value="search">Search</TabsTrigger>}
          <TabsTrigger value="subtitles">Subtitles</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-5">
          <MediaOverview
            meta={meta}
            staff={staff}
            onAllCast={() => onTab('cast')}
            onAdd={onAdd}
            main={<InTheQueue movie={m} />}
            aside={<InTheLibrary movie={m} />}
          />
        </TabsContent>
        <TabsContent value="cast" className="pt-5">
          <CastAndCrew meta={meta} />
        </TabsContent>
        <TabsContent value="files" className="pt-5">
          <Files movie={m} />
        </TabsContent>
        <TabsContent value="history" className="pt-5">
          <History id={m.id} />
        </TabsContent>
        {staff && (
          <TabsContent value="search" className="pt-5">
            <InteractiveSearch movie={m} />
          </TabsContent>
        )}
        <TabsContent value="subtitles" className="pt-5">
          <Subtitles movie={m} staff={staff} />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ---------------------------------------------------------------- overview

function InTheLibrary({ movie: m }: { movie: MediaItem }) {
  const profiles = useQuery('profiles', async (c) => {
    const [quality, language] = await Promise.all([
      c.movies.qualityProfiles(),
      c.movies.languageProfiles(),
    ])
    return { quality, language }
  })
  const name = (id: string) => profiles.data?.quality.find((p) => p.id === id)?.name ?? id
  return (
    <section aria-labelledby="in-the-library" className="grid grid-cols-1 content-start gap-3">
      <h2 id="in-the-library" className="text-title text-text">
        In the library
      </h2>
      <Definition
        items={[
          [
            'Versions',
            m.versions.map((v) => `${v.label} (${name(v.qualityProfileId)})`).join(', '),
          ],
          [
            'Subtitles',
            profiles.data?.language.find((p) => p.id === m.languageProfileId)?.name ??
              m.languageProfileId,
          ],
          [
            'Minimum availability',
            { announced: 'Announced', 'in-cinemas': 'In cinemas', released: 'Released' }[
              m.minimumAvailability
            ],
          ],
          [
            'Root folder',
            <span key="root" className="font-mono">
              {m.rootFolder}
            </span>,
          ],
        ]}
      />
    </section>
  )
}

function InTheQueue({ movie: m }: { movie: MediaItem }) {
  const queue = useQuery('queue', (c) => c.queue.list(), ['queue.changed', 'torrents.updated'])
  const live = queue.data?.find((q) => q.itemId === m.id)
  if (!live) return null
  return (
    <section aria-labelledby="in-the-queue" className="grid grid-cols-1 content-start gap-3">
      <h2 id="in-the-queue" className="text-title text-text">
        In the queue
      </h2>
      <div className="grid grid-cols-1 gap-2 rounded-md border border-line bg-s1 p-3.5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-release text-text-2">
            {live.release}
          </span>
          <Badge tone={torrentStatus[live.state].tone}>{torrentStatus[live.state].label}</Badge>
        </div>
        <Progress
          value={live.progress * 100}
          tone={torrentStatus[live.state].bar}
          aria-label={`${m.title} progress`}
        />
        <p className="font-mono text-figure text-text-3">
          {percent(live.progress)}
          {live.downRate ? ` · ${rate(live.downRate)}` : ''}
          {live.eta ? ` · ${duration(live.eta)} left` : ''}
          {live.stateReason ? ` · ${live.stateReason}` : ''}
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- files

const streamLine = (s: Stream) =>
  s.type === 'video'
    ? `${s.codec.toUpperCase()} · ${s.width}×${s.height}${s.hdr !== 'none' ? ` · ${s.hdr.toUpperCase()}` : ''} · ${rate(s.bitrate / 8)}`
    : s.type === 'audio'
      ? `${s.codec.toUpperCase()} ${s.channels} · ${s.language}${s.title ? ` · ${s.title}` : ''}${s.default ? ' · default' : ''}`
      : `${s.codec} · ${s.language}${s.forced ? ' · forced' : ''}${s.hi ? ' · SDH' : ''}`

function Files({ movie: m }: { movie: MediaItem }) {
  const files = useQuery(`files:${m.id}`, (c) => c.movies.files(m.id), ['item.updated'])
  return (
    <Loadable query={files} what="the files">
      {(fs) => (
        <div className="grid gap-4">
          {m.versions.map((v) => {
            const f = fs.find((x) => x.versionId === v.id)
            return (
              <section
                key={v.id}
                aria-label={`${v.label} version`}
                className="grid gap-3 rounded-lg border border-line bg-s1 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <QualityTag>{v.label}</QualityTag>
                  {f ? (
                    <span className="font-mono text-figure text-text-2">{bytes(f.size)}</span>
                  ) : (
                    <Badge tone={m.status === 'downloading' ? 'accent' : 'danger'}>
                      {m.status === 'downloading' ? 'Downloading' : 'No file yet'}
                    </Badge>
                  )}
                </div>
                {f && <FileStreams file={f} />}
              </section>
            )
          })}
        </div>
      )}
    </Loadable>
  )
}

function FileStreams({ file: f }: { file: MediaFile }) {
  return (
    <>
      <p className="truncate font-mono text-release text-text-3" title={f.path}>
        {f.path}
      </p>
      <ul className="grid gap-1 text-ui">
        {f.streams.map((s) => (
          <li key={s.index} className="flex gap-3">
            <span className="w-16 shrink-0 text-text-3 capitalize">{s.type}</span>
            <span className="min-w-0 font-mono text-figure text-text-2">{streamLine(s)}</span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-text-3">
        Release <span className="font-mono">{f.sceneName}</span>
      </p>
    </>
  )
}

// ---------------------------------------------------------------- history

const historyLabel: Record<
  HistoryEventType,
  { label: string; icon: Parameters<typeof Icon>[0]['name'] }
> = {
  grabbed: { label: 'Grabbed', icon: 'download' },
  imported: { label: 'Imported', icon: 'check' },
  'import-failed': { label: 'Import failed', icon: 'error' },
  deleted: { label: 'Deleted', icon: 'delete' },
  renamed: { label: 'Renamed', icon: 'edit' },
  'subtitle-downloaded': { label: 'Subtitles downloaded', icon: 'subtitles' },
  'subtitle-synced': { label: 'Subtitles synced', icon: 'subtitle-sync' },
  blocklisted: { label: 'Blocklisted', icon: 'lock' },
}

export function HistoryTable({
  events,
  showTitle,
  titles,
}: {
  events: {
    id: string
    itemId: string
    type: HistoryEventType
    date: string
    sourceTitle: string
    indexer: string | null
    message: string | null
  }[]
  showTitle?: boolean
  titles?: Record<string, string>
}) {
  const now = useNow()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Event</TableHead>
          {showTitle && <TableHead>Movie</TableHead>}
          <TableHead>Release</TableHead>
          <TableHead>Source</TableHead>
          <TableHead numeric>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id} title={e.message ?? undefined}>
            <TableCell>
              <span className="flex items-center gap-2 text-text">
                <Icon name={historyLabel[e.type].icon} size={14} className="text-text-3" />
                {historyLabel[e.type].label}
              </span>
            </TableCell>
            {showTitle && (
              <TableCell>
                <a href={`#/admin/movies/${e.itemId}`} className="text-text hover:underline">
                  {titles?.[e.itemId] ?? e.itemId}
                </a>
              </TableCell>
            )}
            <TitleCell title={e.message ?? '—'} detail={e.sourceTitle} />
            <TableCell className="text-text-2">{e.indexer ?? '—'}</TableCell>
            <TableCell numeric>{relative(e.date, now)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function History({ id }: { id: string }) {
  const history = useQuery(`history:${id}`, (c) => c.movies.history(id), ['history.updated'])
  return (
    <Loadable query={history} what="the history">
      {(events) =>
        events.length === 0 ? (
          <EmptyState size="sm" icon="clock" title="Nothing has happened yet">
            Grabs, imports and subtitle downloads show here.
          </EmptyState>
        ) : (
          <TableFrame>
            <HistoryTable events={events} />
          </TableFrame>
        )
      }
    </Loadable>
  )
}

// ---------------------------------------------------------------- interactive search

function Reasons({ release: r }: { release: Release }) {
  return (
    <ul className="grid gap-1 text-caption">
      {r.reasons.map((reason) => (
        <li key={reason.message} className="flex items-start gap-1.5">
          <Icon
            name={
              reason.kind === 'accepted' ? 'check' : reason.kind === 'warning' ? 'warning' : 'close'
            }
            size={14}
            className={
              reason.kind === 'accepted'
                ? 'mt-px shrink-0 text-success'
                : reason.kind === 'warning'
                  ? 'mt-px shrink-0 text-warning'
                  : 'mt-px shrink-0 text-danger'
            }
          />
          <span className="text-text-2">{reason.message}</span>
        </li>
      ))}
    </ul>
  )
}

function InteractiveSearch({ movie: m }: { movie: MediaItem }) {
  const [run, setRun] = useState(0)
  const releases = useQuery(`releases:${m.id}:${run}`, (c) => c.movies.interactiveSearch(m.id))
  const [open, setOpen] = useState<string | null>(null)
  const [showRejected, setShowRejected] = useState(true)
  const grab = useAction((c, guid: string) => c.movies.grabRelease(m.id, guid))
  const [grabbed, setGrabbed] = useState<string | null>(null)

  const doGrab = (r: Release) =>
    grab.run(r.guid).then(
      () => {
        setGrabbed(r.guid)
        toast.success('Grabbed', {
          description: `${r.title} is downloading. Follow it in Activity.`,
        })
      },
      (e: Error) => toast.error('Couldn’t grab it', { description: e.message }),
    )

  return (
    <Loadable
      query={releases}
      what="releases"
      skeleton={
        <>
          <p className="text-caption text-text-3">Searching 5 indexers…</p>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </>
      }
    >
      {(rs) => {
        const shown = showRejected ? rs : rs.filter((r) => r.approved)
        return (
          <TableFrame>
            <TableToolbar>
              <span className="text-text">
                {rs.length} {rs.length === 1 ? 'release' : 'releases'}
              </span>
              <span className="text-text-3">
                {rs.filter((r) => r.approved).length} accepted by your profile
              </span>
              <span className="ms-auto flex items-center gap-2 text-text-2">
                <Switch
                  id="show-rejected"
                  checked={showRejected}
                  onCheckedChange={setShowRejected}
                />
                <label htmlFor="show-rejected">Show rejected</label>
              </span>
              <Button size="sm" icon="refresh" onClick={() => setRun(run + 1)}>
                Search again
              </Button>
            </TableToolbar>
            {rs.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-caption text-text-3">
                No indexer returned a release. Check Indexers, or try again later.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Release</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead numeric>Score</TableHead>
                    <TableHead numeric>Size</TableHead>
                    <TableHead numeric>Peers</TableHead>
                    <TableHead numeric>Age</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => {
                    const expanded = open === r.guid
                    return (
                      <Fragment key={r.guid}>
                        <TableRow>
                          <TitleCell title={r.indexer} detail={r.title} />
                          <TableCell>
                            <span className="flex gap-1">
                              <QualityTag>{r.quality}</QualityTag>
                              {r.customFormats.slice(0, 2).map((f) => (
                                <QualityTag key={f}>{f}</QualityTag>
                              ))}
                            </span>
                          </TableCell>
                          <TableCell numeric>{r.formatScore}</TableCell>
                          <TableCell numeric>{bytes(r.size)}</TableCell>
                          <TableCell numeric>
                            {r.seeders}/{r.leechers}
                          </TableCell>
                          <TableCell numeric>{duration(r.ageHours * 3600)}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : r.guid)}
                              className="rounded-sm"
                            >
                              <Badge tone={r.approved ? 'success' : 'danger'}>
                                {r.approved
                                  ? 'Accepted'
                                  : `Rejected (${r.reasons.filter((x) => x.kind === 'rejected').length})`}
                              </Badge>
                              <span className="sr-only">: show the reasons</span>
                            </button>
                          </TableCell>
                          <TableCell className="text-end">
                            {grabbed === r.guid ? (
                              <Badge tone="accent">Grabbed</Badge>
                            ) : (
                              <Tooltip
                                content={
                                  r.approved ? 'Grab' : 'Grab anyway: overrides your profile'
                                }
                              >
                                <Button
                                  size="sm"
                                  variant={r.approved ? 'primary' : 'ghost'}
                                  iconOnly
                                  icon="download"
                                  aria-label={`${r.approved ? 'Grab' : 'Grab anyway'} ${r.title}`}
                                  onClick={() => doGrab(r)}
                                  disabled={grab.pending}
                                />
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="whitespace-normal bg-s2">
                              <Reasons release={r} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </TableFrame>
        )
      }}
    </Loadable>
  )
}

// ---------------------------------------------------------------- subtitles

export const syncStatus: Record<
  SyncStatus,
  { label: string; tone: Parameters<typeof Badge>[0]['tone'] }
> = {
  synced: { label: 'Synced', tone: 'success' },
  syncing: { label: 'Syncing', tone: 'accent' },
  queued: { label: 'Waiting to sync', tone: 'neutral' },
  unsynced: { label: 'Not synced', tone: 'warning' },
  failed: { label: 'Sync failed', tone: 'danger' },
  'not-needed': { label: 'Embedded', tone: 'neutral' },
}

const offsetLabel = (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${Math.abs(ms)} ms`

function Subtitles({ movie: m, staff }: { movie: MediaItem; staff: boolean }) {
  const data = useQuery(
    `subtitles:${m.id}`,
    async (c) => {
      const [tracks, files, languages] = await Promise.all([
        c.subtitles.forItem(m.id),
        c.movies.files(m.id),
        c.subtitles.languages(),
      ])
      return { tracks, files, languages }
    },
    ['subtitles.updated', 'item.updated'],
  )
  const sync = useAction((c, trackId: string) => c.subtitles.sync(trackId))
  const offset = useAction((c, trackId: string, ms: number) => c.subtitles.setOffset(trackId, ms))
  const remove = useAction((c, trackId: string) => c.subtitles.delete(trackId))

  return (
    <Loadable query={data} what="the subtitles">
      {({ tracks, files, languages }) => {
        const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code
        const embedded = files.flatMap((f) =>
          f.streams.filter((s) => s.type === 'subtitle').map((s) => ({ file: f, stream: s })),
        )
        if (!files.length && !tracks.length)
          return (
            <EmptyState size="sm" icon="subtitles" title="No file to find subtitles for yet">
              Subtitles are searched and synced as soon as the movie is imported.
            </EmptyState>
          )
        return (
          <div className="grid gap-6">
            <TableFrame>
              <TableToolbar>
                <span className="text-text">Tracks</span>
                <span className="text-text-3">
                  {tracks.length} external · {embedded.length} embedded
                </span>
              </TableToolbar>
              {tracks.length + embedded.length === 0 ? (
                <p className="px-3.5 py-8 text-center text-caption text-text-3">
                  No subtitles yet. {staff ? 'Search below to pick some.' : ''}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Language</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead numeric>Score</TableHead>
                      <TableHead>Sync</TableHead>
                      <TableHead numeric>Offset</TableHead>
                      {staff && (
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tracks.map((t) => (
                      <TrackRow
                        key={t.id}
                        track={t}
                        language={name(t.language)}
                        staff={staff}
                        busy={sync.pending || offset.pending}
                        onSync={() =>
                          sync.run(t.id).then(
                            (r) =>
                              toast.success('Synced to the audio', {
                                description: `Offset ${offsetLabel(r.sync.offsetMs)}, ${percent(r.sync.confidence ?? 0)} confidence.`,
                              }),
                            (e: Error) => toast.error('Sync failed', { description: e.message }),
                          )
                        }
                        onOffset={(ms) => offset.run(t.id, ms)}
                        onRemove={() =>
                          remove.run(t.id).then(() => toast({ title: 'Subtitle deleted' }))
                        }
                      />
                    ))}
                    {embedded.map(({ file, stream }) => (
                      <TableRow key={`${file.id}-${stream.index}`}>
                        <TitleCell
                          title={name(stream.language)}
                          detail={`Stream ${stream.index} in ${file.path.split('/').pop()}`}
                        />
                        <TableCell className="text-text-2">Embedded</TableCell>
                        <TableCell numeric>—</TableCell>
                        <TableCell>
                          <Badge tone="neutral">Matches the video</Badge>
                        </TableCell>
                        <TableCell numeric>—</TableCell>
                        {staff && <TableCell />}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TableFrame>
            {staff && <SubtitleSearch movie={m} languages={languages} />}
          </div>
        )
      }}
    </Loadable>
  )
}

function TrackRow({
  track: t,
  language,
  staff,
  busy,
  onSync,
  onOffset,
  onRemove,
}: {
  track: SubtitleTrack
  language: string
  staff: boolean
  busy: boolean
  onSync: () => void
  onOffset: (ms: number) => void
  onRemove: () => void
}) {
  const s = syncStatus[t.sync.status]
  const flags = [t.forced && 'Forced', t.hi && 'SDH', t.format.toUpperCase()].filter(Boolean)
  return (
    <TableRow>
      <TitleCell
        title={`${language}${flags.length ? ` · ${flags.join(' · ')}` : ''}`}
        detail={t.path ?? undefined}
      />
      <TableCell className="text-text-2">{t.provider ?? 'Added by hand'}</TableCell>
      <TableCell numeric>{t.score ?? '—'}</TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          {t.sync.confidence !== null && (
            <span className="font-mono text-figure text-text-3">{percent(t.sync.confidence)}</span>
          )}
        </span>
      </TableCell>
      <TableCell numeric>
        {staff ? (
          <span className="inline-flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="remove"
              aria-label={`Show ${language} subtitles 50 ms earlier`}
              onClick={() => onOffset(t.sync.offsetMs - 50)}
              disabled={busy}
            />
            <output aria-label={`${language} offset`} className="w-16 text-center">
              {offsetLabel(t.sync.offsetMs)}
            </output>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="add"
              aria-label={`Show ${language} subtitles 50 ms later`}
              onClick={() => onOffset(t.sync.offsetMs + 50)}
              disabled={busy}
            />
          </span>
        ) : (
          offsetLabel(t.sync.offsetMs)
        )}
      </TableCell>
      {staff && (
        <TableCell className="text-end">
          <span className="inline-flex gap-1">
            <Tooltip content="Sync to the audio again">
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="subtitle-sync"
                aria-label={`Re-sync ${language}`}
                onClick={onSync}
                disabled={busy}
              />
            </Tooltip>
            <Tooltip content="Delete">
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="delete"
                aria-label={`Delete ${language} subtitles`}
                onClick={onRemove}
              />
            </Tooltip>
          </span>
        </TableCell>
      )}
    </TableRow>
  )
}

function SubtitleSearch({
  movie: m,
  languages,
}: {
  movie: MediaItem
  languages: { code: string; name: string }[]
}) {
  const [language, setLanguage] = useState('en')
  const [search, setSearch] = useState<string | null>(null)
  const results = useQuery(`sub-search:${m.id}:${search}`, (c) =>
    search ? c.subtitles.search(m.id, search) : Promise.resolve([] as SubtitleSearchResult[]),
  )
  const download = useAction((c, r: SubtitleSearchResult) => c.subtitles.download(m.id, r))
  return (
    <section aria-labelledby="sub-search" className="grid gap-3">
      <h2 id="sub-search" className="text-title text-text">
        Search for subtitles
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Language" className="w-56">
          <Select
            value={language}
            onValueChange={setLanguage}
            options={languages.map((l) => ({ value: l.code, label: l.name }))}
          />
        </Field>
        <Button icon="search" onClick={() => setSearch(language)}>
          Search providers
        </Button>
      </div>
      {search && (
        <Loadable query={results} what="subtitle results">
          {(rs) =>
            rs.length === 0 ? (
              <p className="text-caption text-text-3">
                No provider has subtitles in that language.
              </p>
            ) : (
              <TableFrame>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Release</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead numeric>Score</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rs.map((r) => (
                      <TableRow key={r.id}>
                        <TitleCell
                          title={[r.format.toUpperCase(), r.forced && 'Forced', r.hi && 'SDH']
                            .filter(Boolean)
                            .join(' · ')}
                          detail={r.releaseName}
                        />
                        <TableCell className="text-text-2">{r.provider}</TableCell>
                        <TableCell numeric>{r.score}</TableCell>
                        <TableCell className="text-end">
                          <Button
                            size="sm"
                            icon="download"
                            onClick={() =>
                              download.run(r).then(
                                () =>
                                  toast.success('Subtitles downloaded', {
                                    description: 'Synced to the audio and ready on every client.',
                                  }),
                                (e: Error) =>
                                  toast.error('Couldn’t download them', { description: e.message }),
                              )
                            }
                            aria-label={`Download ${r.releaseName} from ${r.provider}`}
                          >
                            Use
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            )
          }
        </Loadable>
      )}
    </section>
  )
}
