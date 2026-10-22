'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A6 Movie detail (docs/product/movies.md#movie-detail-a6, media-pages.md), ported from the
// prototype's movies/detail.tsx. One page at one address, `/movies/{tmdbId}`, whether the movie is
// in the library or not (ADR 0014, amended 2026-10-20). Not added: the summary, Overview and Cast
// and crew, with Add movie. Added, it gains the library layer in place: Search, Interactive search
// and More in the header; the status, a tag per version, the path and Monitored; In the queue and
// In the library; the Files, History and Search tabs.
//
// What this checkpoint changes from the prototype (each listed in the checkpoint report):
// - search waits for an enabled indexer (decision 2): until there is one, Search is disabled with
//   the reason, and the Search tab says the same with a link to Indexers;
// - Search queues a search; the Search tab shows the last 30 minutes' results before searching
//   again and says which indexers didn't answer; size, peers and age show a dash when an indexer
//   omits them;
// - Grab sends the release's indexer; a rejected release's Grab anyway sends `force`, and a refusal
//   (on the blocklist, already grabbed, results expired) is the server's message in a toast;
// - In the queue shows a card for each of the movie's downloads, where the prototype shows its
//   first (a movie with two versions can have two);
// - History pages with Show more, which the prototype's single page doesn't need;
// - a file without a scene name leaves out the Release line;
// - the Subtitles tab: a bundled track says the release carried it; an image track (PGS, VobSub)
//   has no offset buttons or Re-sync, having no text to move; Re-sync toasts "Syncing {language}
//   to the audio" and the result when it arrives, and Use says whether a sync follows (checkpoint
//   7's changes real data forces); a correction that isn't one offset says so under the offset;
//   search results say which provider's terms ask for a credit, under the table; a search with no
//   provider on, or none answering, says so in place of the results;
// - Edit (in More) and the version list's add, edit and remove, which the prototype doesn't draw;
// - Remove keeps the page where it is, without its library layer (Addresses are TMDB ids);
// - a movie TMDB no longer has keeps its rows and address and says so (judgement call 4).

import {
  type DiscoverMovie,
  DOWNLOAD_TOPICS,
  type HistoryEvent,
  type LanguageProfile,
  LIST_TOPICS,
  MEDIA_TOPICS,
  type MediaFile,
  type MinimumAvailability,
  type Movie,
  type MovieUpdate,
  type MovieVersion,
  type QualityProfile,
  type Release,
  type RootFolder,
  SUBTITLE_TOPICS,
  type SubtitleSearchResult,
  type SubtitleTrack,
} from '@highsea/api-contract'
import { bytes, duration, percent, rate } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  type BadgeTone,
  Banner,
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
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useState } from 'react'
import { AddMovieDialog } from './add-dialog.tsx'
import { torrentTone } from './downloads-status.ts'
import { useSearchable } from './indexer-state.ts'
import { library } from './library-messages.ts'
import { Loadable } from './loadable.tsx'
import { movieStatus } from './media-links.ts'
import {
  CastAndCrew,
  Definition,
  MediaOverview,
  MediaSummary,
  MetadataError,
  type MetadataQuery,
  ReleaseLine,
  SummarySkeleton,
  useMovieMetadata,
} from './media-sections.tsx'
import { media } from './media-sections-messages.ts'
import { shell } from './messages.ts'
import { AVAILABILITY, loadHistory } from './movie-data.ts'
import { movieDetail as messages, torrentState } from './movie-detail-messages.ts'
import { AdminPage } from './shell.tsx'
import { useRelative } from './time.ts'

type Tab = 'overview' | 'cast' | 'files' | 'history' | 'search' | 'subtitles'

/** Where Discover finds a title by name: its search is kept in the address (movies.md). */
const discoverSearch = (title: string) => `/discover?q=${encodeURIComponent(title)}`

/** The route's id: TMDB ids are positive integers; anything else is an id TMDB doesn't know. */
export const parseTmdbId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null)

/**
 * `/movies/{tmdbId}`: the metadata in every state, and the library layer once the movie is added.
 * Adding or removing from the page swaps the layer at once; the next `movies.updated` confirms it.
 */
export function MovieDetail({ id: raw }: { id: string }) {
  const id = parseTmdbId(raw)
  if (id === null)
    return (
      <AdminPage title={<Title />}>
        <MetadataError error={Object.assign(new Error(''), { status: 404 })} />
      </AdminPage>
    )
  return <MovieById id={id} />
}

function Title() {
  const t = useT(messages)
  return <>{t('movie')}</>
}

function MovieById({ id }: { id: number }) {
  const t = useT(messages)
  const meta = useMovieMetadata(id)
  // what the page just did, until the metadata's own `inLibrary` catches up
  const [override, setOverride] = useState<boolean | null>(null)
  const known = meta.data?.inLibrary
  const removed = useCallback(() => setOverride(false), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: a change in the metadata settles it
  useEffect(() => setOverride(null), [known])

  if (meta.status === 'error')
    return (
      <AdminPage title={t('movie')}>
        <MetadataError error={meta.error} />
      </AdminPage>
    )
  if (meta.status === 'loading')
    return (
      <AdminPage title={t('movie')}>
        <SummarySkeleton />
      </AdminPage>
    )
  const inLibrary = override ?? meta.data.inLibrary
  return inLibrary ? (
    <LibraryMovie id={id} meta={meta} onRemoved={removed} />
  ) : (
    <MetadataMovie meta={meta} onAdded={() => setOverride(true)} />
  )
}

// ---------------------------------------------------------------- not in the library

function MetadataMovie({ meta, onAdded }: { meta: MetadataQuery; onAdded: () => void }) {
  const t = useT(messages)
  const tm = useT(media)
  const [tab, setTab] = useState<Tab>('overview')
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const m = meta.data
  if (!m) return null

  return (
    <AdminPage
      title={m.title}
      actions={
        <Button variant="primary" icon="add" onClick={() => setAdding([m])}>
          {t('addMovie')}
        </Button>
      }
    >
      <MediaSummary item={m} meta={m} badges={<Badge tone="neutral">{tm('notInLibrary')}</Badge>}>
        <ReleaseLine date={m.releaseDate} />
      </MediaSummary>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
        <TabsList aria-label={tm('sections')}>
          <TabsTrigger value="overview">{tm('tab.overview')}</TabsTrigger>
          <TabsTrigger value="cast">{tm('tab.cast')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-5">
          <MediaOverview meta={meta} onAllCast={() => setTab('cast')} onAdd={setAdding} />
        </TabsContent>
        <TabsContent value="cast" className="pt-5">
          <CastAndCrew meta={meta} />
        </TabsContent>
      </Tabs>
      <AddMovieDialog
        movies={adding}
        onOpenChange={(o) => !o && setAdding([])}
        // the page itself turns into the library page, at the same address; adding a
        // collection's other parts leaves this one as it is
        onAdded={(items) => {
          if (items.some((x) => x.id === m.id)) onAdded()
        }}
      />
    </AdminPage>
  )
}

// ---------------------------------------------------------------- in the library

/** The library's options: quality and language profiles for names, root folders for Edit. */
function useLibraryOptions() {
  return useQuery('movie-options', async (c) => {
    const [quality, language, folders] = await Promise.all([
      c.quality.profiles(),
      c.subtitles.languageProfiles(),
      c.rootFolders.list(),
    ])
    return { quality, language, folders }
  })
}

type Options = {
  quality: QualityProfile[]
  language: LanguageProfile[]
  folders: RootFolder[]
}

function LibraryMovie({
  id,
  meta,
  onRemoved,
}: {
  id: number
  meta: MetadataQuery
  onRemoved: () => void
}) {
  const t = useT(messages)
  const ts = useT(shell)
  const router = useRouter()
  const movie = useQuery(`movie:${id}`, (c) => c.movies.get({ params: { id } }), [
    'movies.updated',
    'item.updated',
  ])
  const options = useLibraryOptions()
  // removed elsewhere: back to the metadata alone, until the metadata's `inLibrary` says so too
  const missing = movie.status === 'error' && (movie.error as ApiError).status === 404
  useEffect(() => {
    if (missing) onRemoved()
  }, [missing, onRemoved])
  // an action's answer, shown until the next fetch replaces what it was based on
  const [latest, setLatest] = useState<{ base: Movie | undefined; movie: Movie } | null>(null)
  const m = latest && latest.base === movie.data ? latest.movie : movie.data
  const keep = (next: Movie) => setLatest({ base: movie.data, movie: next })

  const [tab, setTab] = useState<Tab>('overview')
  const [removing, setRemoving] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [exclude, setExclude] = useState(false)
  // "Don't add it again" only means something once a list exists (checkpoint 8a)
  const lists = useQuery('import-lists', (c) => c.importLists.list(), [LIST_TOPICS.lists])
  const hasLists = (lists.data?.length ?? 0) > 0
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const [monitoring, setMonitoring] = useState<boolean | null>(null)

  const update = useAction((c, body: MovieUpdate) => c.movies.update({ params: { id }, body }))
  const refresh = useAction((c) => c.movies.refresh({ params: { id } }))
  const searchable = useSearchable()
  const search = useAction((c) => c.movies.bulk({ body: { action: 'search', ids: [id] } }))
  const remove = useAction((c, o: { files: boolean; exclude: boolean }) =>
    c.movies.delete({
      params: { id },
      query: { deleteFiles: o.files ? 'true' : 'false', ...(o.exclude ? { exclude: 'true' } : {}) },
    }),
  )

  const onMonitor = (monitored: boolean) => {
    setMonitoring(monitored)
    update.run({ monitored }).then(
      (next) => {
        keep(next)
        setMonitoring(null)
      },
      (e: Error) => {
        setMonitoring(null)
        toast.error(t('monitored.failed'), { description: e.message })
      },
    )
  }

  const title = m?.title ?? meta.data?.title ?? t('movie')
  const actions = m ? (
    <>
      {searchable.canSearch ? (
        <Button
          icon="search"
          loading={search.pending}
          onClick={() =>
            search.run().then(
              () =>
                toast({
                  title: t('search.toast', { title: m.title }),
                  description: t('search.toastBody'),
                }),
              (e: Error) => toast.error(t('search.failed'), { description: e.message }),
            )
          }
        >
          {t('search')}
        </Button>
      ) : (
        <Tooltip content={t('noIndexers')}>
          {/* a disabled button takes no focus, so its wrapper carries the reason (Radix Tooltip) */}
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the focusable wrapper Radix documents for a disabled trigger */}
          <span tabIndex={0} className="inline-flex rounded-sm">
            <Button icon="search" disabled>
              {t('search')}
            </Button>
          </span>
        </Tooltip>
      )}
      <Button variant="primary" icon="list" onClick={() => setTab('search')}>
        {t('interactiveSearch')}
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" iconOnly icon="more" aria-label={t('more')} />
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon="edit" onSelect={() => setEditing(true)}>
            {t('edit')}
          </MenuItem>
          <MenuItem
            icon="refresh"
            onSelect={() =>
              refresh.run().then(
                () =>
                  toast({
                    title: t('refresh.toast', { title: m.title }),
                    description: t('refresh.toastBody'),
                  }),
                (e: Error) => toast.error(t('refresh.failed'), { description: e.message }),
              )
            }
          >
            {t('refresh')}
          </MenuItem>
          <MenuItem icon="delete" danger onSelect={() => setRemoving(true)}>
            {t('remove')}
          </MenuItem>
        </MenuContent>
      </Menu>
    </>
  ) : undefined

  return (
    <AdminPage title={title} actions={actions}>
      {movie.status === 'error' && !missing ? (
        <EmptyState
          tone="error"
          icon="movie"
          title={ts('load.error', { what: t('library.what') })}
          action={<Button onClick={movie.refetch}>{ts('retry')}</Button>}
        >
          {movie.error.message}
        </EmptyState>
      ) : !m ? (
        <SummarySkeleton />
      ) : (
        <>
          {(m.gone || meta.data?.gone) && (
            <Banner
              tone="warning"
              variant="card"
              title={t('gone.title')}
              action={
                <Button size="sm" onClick={() => router.push(discoverSearch(m.title))}>
                  {t('gone.action')}
                </Button>
              }
            >
              {t('gone.body')}
            </Banner>
          )}
          <LibraryBody
            movie={m}
            meta={meta}
            options={options.data}
            tab={tab}
            onTab={setTab}
            monitored={monitoring ?? m.monitored}
            onMonitor={onMonitor}
            onAdd={setAdding}
            onChange={keep}
          />
        </>
      )}
      <ConfirmDialog
        open={removing}
        onOpenChange={(o) => {
          setRemoving(o)
          if (!o) {
            setDeleteFiles(false)
            setExclude(false)
          }
        }}
        title={t('remove.title', { title })}
        description={
          <span className="grid gap-3">
            {t('remove.body')}
            <span className="flex items-center gap-2">
              <Checkbox
                id="delete-files"
                checked={deleteFiles}
                onCheckedChange={(v) => setDeleteFiles(v === true)}
              />
              <label htmlFor="delete-files">{t('remove.files')}</label>
            </span>
            {hasLists && (
              <span className="flex items-center gap-2">
                <Checkbox
                  id="exclude-from-lists"
                  checked={exclude}
                  onCheckedChange={(v) => setExclude(v === true)}
                />
                <label htmlFor="exclude-from-lists">{t('remove.exclude')}</label>
              </span>
            )}
          </span>
        }
        confirmLabel={t('remove.confirm')}
        destructive
        onConfirm={() =>
          remove.run({ files: deleteFiles, exclude: hasLists && exclude }).then(
            () => {
              toast.success(t('remove.done', { title }))
              // the page stays at its address, without its library layer
              onRemoved()
            },
            (e: Error) => toast.error(t('remove.failed'), { description: e.message }),
          )
        }
      />
      {m && (
        <EditDialog
          open={editing}
          onOpenChange={setEditing}
          movie={m}
          options={options}
          onSaved={keep}
        />
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}

function LibraryBody({
  movie: m,
  meta,
  options,
  tab,
  onTab,
  monitored,
  onMonitor,
  onAdd,
  onChange,
}: {
  movie: Movie
  meta: MetadataQuery
  options: Options | undefined
  tab: Tab
  onTab: (tab: Tab) => void
  monitored: boolean
  onMonitor: (on: boolean) => void
  onAdd: (movies: DiscoverMovie[]) => void
  onChange: (movie: Movie) => void
}) {
  const t = useT(messages)
  const tm = useT(media)
  const tl = useT(library)
  const s = movieStatus[m.status]
  return (
    <>
      <MediaSummary
        item={m}
        meta={meta.data}
        badges={
          <>
            <Badge tone={s.tone}>{tl(s.label)}</Badge>
            {m.versions.map((v) => (
              <QualityTag key={v.id}>{v.label}</QualityTag>
            ))}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-text-3">
          <span className="min-w-0 break-all font-mono">{m.path}</span>
          <span className="flex items-center gap-2">
            <Switch
              id="monitored"
              checked={monitored}
              onCheckedChange={onMonitor}
              aria-describedby="monitored-hint"
            />
            <label htmlFor="monitored" className="text-text-2">
              {t('monitored')}
            </label>
            <span id="monitored-hint" className="sr-only">
              {t('monitored.hint')}
            </span>
          </span>
        </div>
      </MediaSummary>
      <Tabs value={tab} onValueChange={(v) => onTab(v as Tab)} variant="line">
        <TabsList aria-label={tm('sections')}>
          <TabsTrigger value="overview">{tm('tab.overview')}</TabsTrigger>
          <TabsTrigger value="cast">{tm('tab.cast')}</TabsTrigger>
          <TabsTrigger value="files">{t('tab.files')}</TabsTrigger>
          <TabsTrigger value="history">{t('tab.history')}</TabsTrigger>
          <TabsTrigger value="search">{t('tab.search')}</TabsTrigger>
          <TabsTrigger value="subtitles">{t('tab.subtitles')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-5">
          <MediaOverview
            meta={meta}
            onAllCast={() => onTab('cast')}
            onAdd={onAdd}
            main={<InTheQueue movie={m} />}
            aside={<InTheLibrary movie={m} options={options} onChange={onChange} />}
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
        <TabsContent value="search" className="pt-5">
          <SearchTab id={m.id} />
        </TabsContent>
        <TabsContent value="subtitles" className="pt-5">
          <Subtitles movie={m} />
        </TabsContent>
      </Tabs>
    </>
  )
}

// ---------------------------------------------------------------- overview: in the queue

/** What changes a download's card: the queue, and each torrent's progress. */
const QUEUE_TOPICS = [DOWNLOAD_TOPICS.queue, DOWNLOAD_TOPICS.torrents]

/** The movie's downloads with live progress; nothing while it has none. */
function InTheQueue({ movie: m }: { movie: Movie }) {
  const t = useT(messages)
  const ts = useT(torrentState)
  const locale = useLocale()
  const queue = useQuery('queue', (c) => c.queue.list(), QUEUE_TOPICS)
  const live = queue.data?.filter((q) => q.movieId === m.id) ?? []
  if (!live.length) return null
  return (
    <section aria-labelledby="in-the-queue" className="grid grid-cols-1 content-start gap-3">
      <h2 id="in-the-queue" className="text-title text-text">
        {t('inTheQueue')}
      </h2>
      {live.map((q) => (
        <div
          key={q.id}
          className="grid grid-cols-1 gap-2 rounded-md border border-line bg-s1 p-3.5"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-release text-text-2">
              {q.release}
            </span>
            <Badge tone={torrentTone[q.state].tone}>{ts(q.state)}</Badge>
          </div>
          <Progress
            value={q.progress * 100}
            tone={torrentTone[q.state].bar}
            aria-label={t('queue.progress', { title: m.title })}
          />
          <p className="font-mono text-figure text-text-3">
            {percent(q.progress)}
            {q.downRate ? ` · ${rate(q.downRate)}` : ''}
            {q.eta ? ` · ${t('queue.left', { duration: duration(q.eta, locale) })}` : ''}
            {q.stateReason ? ` · ${q.stateReason}` : ''}
          </p>
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------- overview: in the library

function InTheLibrary({
  movie: m,
  options,
  onChange,
}: {
  movie: Movie
  options: Options | undefined
  onChange: (movie: Movie) => void
}) {
  const t = useT(messages)
  const profile = (pid: string) => options?.quality.find((p) => p.id === pid)?.name ?? pid
  const language =
    m.languageProfileId === null
      ? t('subtitles.none')
      : (options?.language.find((p) => p.id === m.languageProfileId)?.name ?? m.languageProfileId)
  return (
    <section aria-labelledby="in-the-library" className="grid grid-cols-1 content-start gap-3">
      <h2 id="in-the-library" className="text-title text-text">
        {t('inTheLibrary')}
      </h2>
      <Definition
        items={[
          [
            t('versions'),
            <Versions
              key="versions"
              movie={m}
              profile={profile}
              quality={options?.quality ?? []}
              onChange={onChange}
            />,
          ],
          [t('subtitles'), language],
          [t('availability'), t(`availability.${m.minimumAvailability}`)],
          [
            t('rootFolder'),
            <span key="root" className="break-all font-mono">
              {m.rootFolder}
            </span>,
          ],
        ]}
      />
    </section>
  )
}

/**
 * The version list (ADR 0012): each version with its profile, Edit and Remove on each and Add
 * version after them. A movie keeps at least one, so the last can't be removed (the
 * server answers 409 `last-version` too). The prototype lists the versions as one line; the
 * buttons are the smallest addition that gives them their actions.
 */
function Versions({
  movie: m,
  profile,
  quality,
  onChange,
}: {
  movie: Movie
  profile: (id: string) => string
  quality: QualityProfile[]
  onChange: (movie: Movie) => void
}) {
  const t = useT(messages)
  const [dialog, setDialog] = useState<{ version: MovieVersion | null } | null>(null)
  const [removing, setRemoving] = useState<MovieVersion | null>(null)
  const remove = useAction((c, versionId: string) =>
    c.movies.removeVersion({ params: { id: m.id, versionId } }),
  )
  const last = m.versions.length === 1
  return (
    <>
      <ul className="grid gap-1">
        {m.versions.map((v) => (
          <li key={v.id} className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 flex-1">
              {t('version', { label: v.label, profile: profile(v.qualityProfileId) })}
            </span>
            <span className="flex shrink-0">
              <Tooltip content={t('editVersion', { label: v.label })}>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="edit"
                  aria-label={t('editVersion', { label: v.label })}
                  onClick={() => setDialog({ version: v })}
                />
              </Tooltip>
              <Tooltip content={last ? t('lastVersion') : t('removeVersion', { label: v.label })}>
                <span tabIndex={last ? 0 : undefined} className="inline-flex rounded-sm">
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon="delete"
                    aria-label={t('removeVersion', { label: v.label })}
                    disabled={last}
                    onClick={() => setRemoving(v)}
                  />
                </span>
              </Tooltip>
            </span>
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="ghost"
        icon="add"
        className="-ms-2 mt-1"
        onClick={() => setDialog({ version: null })}
      >
        {t('addVersion')}
      </Button>
      {dialog && (
        <VersionDialog
          movie={m}
          version={dialog.version}
          quality={quality}
          onOpenChange={(o) => !o && setDialog(null)}
          onSaved={onChange}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t('removeVersion.title', { label: removing?.label ?? '' })}
        description={t('removeVersion.body')}
        confirmLabel={t('remove.confirm')}
        destructive
        onConfirm={() => {
          const v = removing
          if (!v) return
          remove.run(v.id).then(
            (next) => {
              onChange(next)
              toast.success(t('versionRemoved', { label: v.label }))
            },
            (e: Error) => toast.error(t('version.failed'), { description: e.message }),
          )
        }}
      />
    </>
  )
}

function VersionDialog({
  movie: m,
  version: v,
  quality,
  onOpenChange,
  onSaved,
}: {
  movie: Movie
  /** Null adds one. */
  version: MovieVersion | null
  quality: QualityProfile[]
  onOpenChange: (open: boolean) => void
  onSaved: (movie: Movie) => void
}) {
  const t = useT(messages)
  const [label, setLabel] = useState(v?.label ?? '')
  const [profileId, setProfileId] = useState(v?.qualityProfileId ?? quality[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = useAction((c) => {
    const body = { label: label.trim(), qualityProfileId: profileId }
    return v
      ? c.movies.updateVersion({ params: { id: m.id, versionId: v.id }, body })
      : c.movies.addVersion({ params: { id: m.id }, body })
  })
  const submit = async () => {
    if (!label.trim()) return setError(t('versionDialog.labelEmpty'))
    setError(null)
    try {
      const next = await save.run()
      onSaved(next)
      onOpenChange(false)
      toast.success(
        v ? t('versionSaved', { label: label.trim() }) : t('versionAdded', { label: label.trim() }),
      )
    } catch {
      // shown in the dialog
    }
  }
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={v ? t('versionDialog.edit', { label: v.label }) : t('versionDialog.add')}
        description={v ? t('versionDialog.editBody') : t('versionDialog.addBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              icon={v ? undefined : 'add'}
              loading={save.pending}
              disabled={!profileId}
              onClick={submit}
            >
              {v ? t('save') : t('add')}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label={t('versionDialog.label')} hint={t('versionDialog.labelHint')} error={error}>
            <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label={t('qualityProfile')}>
            <Select
              value={profileId}
              onValueChange={setProfileId}
              options={quality.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          {save.error && (
            <p role="alert" className="text-caption text-danger">
              {save.error.message}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- edit

/** Select can't hold an empty value, so "no subtitle languages" has a name of its own. */
const NO_LANGUAGES = 'none'

/**
 * Edit: the add dialog's options that belong to the movie rather than a version (MovieUpdate):
 * folder, subtitle languages, minimum availability and Monitored. Not in the prototype; the
 * smallest addition that reaches `movies.update`, laid out as the add dialog is.
 */
function EditDialog({
  open,
  onOpenChange,
  movie: m,
  options,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  movie: Movie
  options: ReturnType<typeof useLibraryOptions>
  onSaved: (movie: Movie) => void
}) {
  const t = useT(messages)
  const initial = () => ({
    rootFolder: m.rootFolder,
    languageProfileId: m.languageProfileId,
    minimumAvailability: m.minimumAvailability,
    monitored: m.monitored,
  })
  const [form, setForm] = useState(initial)
  // biome-ignore lint/correctness/useExhaustiveDependencies: each opening starts from the movie
  useEffect(() => {
    if (open) setForm(initial())
  }, [open])
  const save = useAction((c, body: MovieUpdate) => c.movies.update({ params: { id: m.id }, body }))
  const submit = async () => {
    try {
      const next = await save.run(form)
      onSaved(next)
      onOpenChange(false)
      toast.success(t('saved', { title: m.title }))
    } catch {
      // shown in the dialog
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={t('editDialog.title', { title: m.title })}
        description={t('editDialog.body')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={save.pending}
              disabled={options.status !== 'success'}
            >
              {t('save')}
            </Button>
          </>
        }
      >
        <Loadable query={options} what={t('editDialog.what')}>
          {(o) => (
            <div className="grid gap-4 medium:grid-cols-2">
              <Field
                label={t('rootFolder')}
                hint={t('rootFolder.hint')}
                className="medium:col-span-2"
              >
                <Select
                  value={form.rootFolder}
                  onValueChange={(rootFolder) => setForm({ ...form, rootFolder })}
                  options={withCurrent(
                    o.folders.map((f) => f.path),
                    m.rootFolder,
                  ).map((p) => ({ value: p, label: p }))}
                  className="font-mono"
                />
              </Field>
              <Field label={t('languageProfile')}>
                <Select
                  value={form.languageProfileId ?? NO_LANGUAGES}
                  onValueChange={(v) =>
                    setForm({ ...form, languageProfileId: v === NO_LANGUAGES ? null : v })
                  }
                  options={[
                    { value: NO_LANGUAGES, label: t('subtitles.none') },
                    ...o.language.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Field>
              <Field label={t('availability')} hint={t('availability.hint')}>
                <Select
                  value={form.minimumAvailability}
                  onValueChange={(v) =>
                    setForm({ ...form, minimumAvailability: v as MinimumAvailability })
                  }
                  options={AVAILABILITY.map((a) => ({ value: a, label: t(`availability.${a}`) }))}
                />
              </Field>
              <Field
                inline
                label={t('monitored')}
                hint={t('monitored.longHint')}
                className="medium:col-span-2"
              >
                <Switch
                  checked={form.monitored}
                  onCheckedChange={(monitored) => setForm({ ...form, monitored })}
                />
              </Field>
              {save.error && (
                <p role="alert" className="text-caption text-danger medium:col-span-2">
                  {save.error.message}
                </p>
              )}
            </div>
          )}
        </Loadable>
      </DialogContent>
    </Dialog>
  )
}

/** The movie's folder stays choosable even when it's no longer a root folder. */
const withCurrent = (paths: string[], current: string) =>
  paths.includes(current) ? paths : [current, ...paths]

// ---------------------------------------------------------------- files

type Stream = MediaFile['streams'][number]

/** One card per version: its file with the probe's streams, or why it has none. */
function Files({ movie: m }: { movie: Movie }) {
  const t = useT(messages)
  const files = useQuery(`files:${m.id}`, (c) => c.movies.files({ params: { id: m.id } }), [
    MEDIA_TOPICS.item,
  ])
  return (
    <Loadable query={files} what={t('files.what')}>
      {(fs) => (
        <div className="grid gap-4">
          {m.versions.map((v) => {
            const f = fs.find((x) => x.versionId === v.id)
            return (
              <section
                key={v.id}
                aria-label={t('files.version', { label: v.label })}
                className="grid gap-3 rounded-lg border border-line bg-s1 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <QualityTag>{v.label}</QualityTag>
                  {f ? (
                    <span className="font-mono text-figure text-text-2">{bytes(f.size)}</span>
                  ) : (
                    <Badge tone={m.status === 'downloading' ? 'accent' : 'danger'}>
                      {m.status === 'downloading' ? t('files.downloading') : t('files.none')}
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
  const t = useT(messages)
  const line = (s: Stream) =>
    s.type === 'video'
      ? `${s.codec.toUpperCase()} · ${s.width}×${s.height}${s.hdr !== 'none' ? ` · ${s.hdr.toUpperCase()}` : ''} · ${rate(s.bitrate / 8)}`
      : s.type === 'audio'
        ? `${s.codec.toUpperCase()} ${s.channels} · ${s.language}${s.title ? ` · ${s.title}` : ''}${s.default ? ` · ${t('stream.default')}` : ''}`
        : `${s.codec} · ${s.language}${s.forced ? ` · ${t('stream.forced')}` : ''}${s.hi ? ` · ${t('stream.sdh')}` : ''}`
  return (
    <>
      <p className="truncate font-mono text-release text-text-3" title={f.path}>
        {f.path}
      </p>
      <ul className="grid gap-1 text-ui">
        {f.streams.map((s) => (
          <li key={s.index} className="flex gap-3">
            <span className="w-16 shrink-0 text-text-3">{t(`stream.${s.type}`)}</span>
            <span className="min-w-0 font-mono text-figure text-text-2">{line(s)}</span>
          </li>
        ))}
      </ul>
      {f.sceneName && (
        <p className="text-caption text-text-3">
          {t('files.release')} <span className="font-mono">{f.sceneName}</span>
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------- history

const historyIcon: Record<HistoryEvent['type'], IconName> = {
  grabbed: 'download',
  imported: 'check',
  'import-failed': 'error',
  'download-failed': 'error',
  deleted: 'delete',
  renamed: 'edit',
  blocklisted: 'lock',
  'subtitle-downloaded': 'subtitles',
  'subtitle-synced': 'subtitle-sync',
  'subtitle-upgraded': 'subtitles',
  'subtitle-deleted': 'delete',
  'subtitle-sync-failed': 'warning',
}

/** The movie's history, newest first, a page at a time; an event elsewhere asks again. */
function History({ id }: { id: number }) {
  const t = useT(messages)
  const { relative } = useRelative()
  const [pages, setPages] = useState(1)
  const history = useQuery(`history:${id}:${pages}`, (c) => loadHistory(c, id, pages), [
    DOWNLOAD_TOPICS.history,
  ])
  return (
    <Loadable query={history} what={t('history.what')}>
      {({ items, next }) =>
        items.length === 0 ? (
          <EmptyState size="sm" icon="clock" title={t('history.none')}>
            {t('history.noneBody')}
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            <TableFrame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('history.event')}</TableHead>
                    <TableHead>{t('history.release')}</TableHead>
                    <TableHead>{t('history.source')}</TableHead>
                    <TableHead numeric>{t('history.when')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((e) => (
                    <TableRow key={e.id} title={e.message ?? undefined}>
                      <TableCell>
                        <span className="flex items-center gap-2 text-text">
                          <Icon name={historyIcon[e.type]} size={14} className="text-text-3" />
                          {t(`history.${e.type}`)}
                        </span>
                      </TableCell>
                      <TitleCell
                        title={e.message ?? e.sourceTitle ?? t('search.unknown')}
                        detail={e.message ? e.sourceTitle : undefined}
                      />
                      <TableCell className="text-text-2">
                        {e.indexer ?? t('search.unknown')}
                      </TableCell>
                      <TableCell numeric>{relative(e.date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
            {next && (
              <Button size="sm" className="justify-self-start" onClick={() => setPages(pages + 1)}>
                {t('history.more')}
              </Button>
            )}
          </div>
        )
      }
    </Loadable>
  )
}

// ---------------------------------------------------------------- search

/**
 * Interactive search (movies.md › Search tab). While no indexer is enabled, decision 2's reason and
 * where to fix it; then the releases, judged by the movie's first version's profile.
 */
function SearchTab({ id }: { id: number }) {
  const t = useT(messages)
  const router = useRouter()
  const searchable = useSearchable()
  if (!searchable.ready)
    return (
      <div aria-busy className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    )
  if (!searchable.canSearch)
    return (
      <EmptyState
        size="sm"
        icon="indexers"
        title={t('noIndexers')}
        action={<Button onClick={() => router.push('/indexers')}>{t('goToIndexers')}</Button>}
      />
    )
  return <InteractiveSearch id={id} indexers={searchable.enabled} />
}

type Found = { releases: Release[]; failed: { indexer: string; message: string }[] }

/**
 * The prototype's InteractiveSearch on real results. Opening the tab shows the last 30 minutes'
 * results when there are some, so coming back doesn't cost every indexer a query; Search again
 * always searches.
 */
function InteractiveSearch({ id, indexers }: { id: number; indexers: number }) {
  const t = useT(messages)
  const locale = useLocale()
  const [run, setRun] = useState(0)
  const releases = useQuery(`releases:${id}:${run}`, async (c): Promise<Found> => {
    if (run === 0) {
      const cached = await c.movies.releases({ params: { id } })
      if (cached.length) return { releases: cached, failed: [] }
    }
    return c.movies.interactiveSearch({ params: { id } })
  })
  const [open, setOpen] = useState<string | null>(null)
  const [showRejected, setShowRejected] = useState(true)
  const dash = t('search.unknown')
  // a rejected release's button is Grab anyway: it overrides the profile, so it sends `force`
  const grab = useAction((c, r: Release) =>
    c.movies.grabRelease({
      params: { id, guid: r.guid },
      body: { indexerId: r.indexerId, ...(r.approved ? {} : { force: true }) },
    }),
  )
  const [grabbed, setGrabbed] = useState<string | null>(null)
  const doGrab = (r: Release) =>
    grab.run(r).then(
      () => {
        setGrabbed(r.guid)
        toast.success(t('grab.done'), { description: t('grab.doneBody', { title: r.title }) })
      },
      (e: Error) => toast.error(t('grab.failed'), { description: e.message }),
    )

  return (
    <Loadable
      query={releases}
      what={t('search.what')}
      skeleton={
        <>
          <p className="text-caption text-text-3">{t('search.searching', { count: indexers })}</p>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </>
      }
    >
      {({ releases: rs, failed }) => {
        const shown = showRejected ? rs : rs.filter((r) => r.approved)
        return (
          <div className="grid gap-3">
            <TableFrame>
              <TableToolbar>
                <span className="text-text">{t('search.count', { count: rs.length })}</span>
                <span className="text-text-3">
                  {t('search.accepted', { count: rs.filter((r) => r.approved).length })}
                </span>
                <span className="ms-auto flex items-center gap-2 text-text-2">
                  <Switch
                    id="show-rejected"
                    checked={showRejected}
                    onCheckedChange={setShowRejected}
                  />
                  <label htmlFor="show-rejected">{t('search.showRejected')}</label>
                </span>
                <Button size="sm" icon="refresh" onClick={() => setRun(run + 1)}>
                  {t('search.again')}
                </Button>
              </TableToolbar>
              {rs.length === 0 ? (
                <p className="px-3.5 py-8 text-center text-caption text-text-3">
                  {t('search.none')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('search.release')}</TableHead>
                      <TableHead>{t('search.quality')}</TableHead>
                      <TableHead numeric>{t('search.score')}</TableHead>
                      <TableHead numeric>{t('search.size')}</TableHead>
                      <TableHead numeric>{t('search.peers')}</TableHead>
                      <TableHead numeric>{t('search.age')}</TableHead>
                      <TableHead>{t('search.decision')}</TableHead>
                      <TableHead>
                        <span className="sr-only">{t('search.actions')}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((r) => {
                      const expanded = open === r.guid
                      const rejected = r.reasons.filter((x) => x.kind === 'rejected').length
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
                            <TableCell numeric>{r.size === null ? dash : bytes(r.size)}</TableCell>
                            <TableCell numeric>
                              {r.seeders ?? dash}/{r.leechers ?? dash}
                            </TableCell>
                            <TableCell numeric>
                              {r.ageHours === null ? dash : duration(r.ageHours * 3600, locale)}
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                aria-expanded={expanded}
                                onClick={() => setOpen(expanded ? null : r.guid)}
                                className="rounded-sm"
                              >
                                <Badge tone={r.approved ? 'success' : 'danger'}>
                                  {r.approved
                                    ? t('search.approved')
                                    : t('search.rejected', { count: rejected })}
                                </Badge>
                                <span className="sr-only">{t('search.reasons')}</span>
                              </button>
                            </TableCell>
                            <TableCell className="text-end">
                              {grabbed === r.guid ? (
                                <Badge tone="accent">{t('search.grabbed')}</Badge>
                              ) : (
                                <Tooltip
                                  content={t(
                                    r.approved ? 'search.grabTip' : 'search.grabAnywayTip',
                                  )}
                                >
                                  <Button
                                    size="sm"
                                    variant={r.approved ? 'primary' : 'ghost'}
                                    iconOnly
                                    icon="download"
                                    aria-label={t(
                                      r.approved ? 'search.grab' : 'search.grabAnyway',
                                      { title: r.title },
                                    )}
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
            {failed.length > 0 && (
              <ul className="grid gap-1 text-caption text-text-3">
                {failed.map((f) => (
                  <li key={f.indexer}>
                    {t('search.failedIndexer', { indexer: f.indexer, message: f.message })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      }}
    </Loadable>
  )
}

/** Why a release was accepted or rejected, as the decision engine said it. */
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

// ---------------------------------------------------------------- subtitles

type SyncStatus = SubtitleTrack['sync']['status']

/** Each sync status's badge tone; its label is `sync.{status}`. */
const syncTone: Record<SyncStatus, BadgeTone> = {
  synced: 'success',
  syncing: 'accent',
  queued: 'neutral',
  unsynced: 'warning',
  failed: 'danger',
  'not-needed': 'neutral',
}

/**
 * An embedded stream's language: ffprobe gives ISO 639-2 (`eng`), which the subtitle language list
 * (ISO 639-1) doesn't hold, and Intl.DisplayNames canonicalizes it to its 639-1 name.
 */
function streamLanguage(code: string, locale: string, unknown: string): string {
  if (code === 'und') return unknown
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

const SUBTITLE_TAB_TOPICS = [SUBTITLE_TOPICS.subtitles, MEDIA_TOPICS.item]

/** Image subtitles (PGS, VobSub) a release carried: nothing to sync or move. */
const IMAGE_FORMATS = new Set(['sup', 'idx'])

const offsetLabel = (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${Math.abs(ms)}`

/** A sync's end, from Waiting to sync or Syncing to one of these. */
const SETTLED: SyncStatus[] = ['synced', 'unsynced', 'failed']

/**
 * The prototype's Subtitles tab: the sidecars highsea keeps (downloaded and bundled), then the
 * file's own streams, read-only; then Search for subtitles. Re-sync runs in the background, so it
 * toasts at once and again when the result arrives, while the tab is open.
 */
function Subtitles({ movie: m }: { movie: Movie }) {
  const t = useT(messages)
  const locale = useLocale()
  const data = useQuery(
    `subtitles:${m.id}`,
    async (c) => {
      const [tracks, files, languages] = await Promise.all([
        c.subtitles.forItem({ params: { id: m.id } }),
        c.movies.files({ params: { id: m.id } }),
        c.subtitles.languages(),
      ])
      return { tracks, files, languages }
    },
    SUBTITLE_TAB_TOPICS,
  )
  const remove = useAction((c, trackId: string) => c.subtitles.delete({ params: { id: trackId } }))
  const sync = useAction((c, trackId: string) => c.subtitles.sync({ params: { id: trackId } }))
  const offset = useAction((c, trackId: string, ms: number) =>
    c.subtitles.setOffset({ params: { id: trackId }, body: { ms } }),
  )
  // the tracks Re-synced from this tab, by id: their language, and whether a read has shown them
  // waiting yet, since the read before Re-sync's still shows the last result
  const [syncing, setSyncing] = useState<Record<string, { language: string; seen: boolean }>>({})
  const tracks = data.status === 'success' ? data.data.tracks : null
  useEffect(() => {
    if (!tracks) return
    const seen = tracks.filter(
      (r) => syncing[r.id]?.seen === false && !SETTLED.includes(r.sync.status),
    )
    const done = tracks.filter((r) => syncing[r.id]?.seen && SETTLED.includes(r.sync.status))
    if (!seen.length && !done.length) return
    for (const r of done) {
      const language = syncing[r.id]?.language ?? ''
      if (r.sync.status === 'synced')
        toast.success(t('subs.synced', { language }), {
          description: t('subs.syncedBody', {
            offset: offsetLabel(r.sync.offsetMs),
            confidence: percent(r.sync.confidence ?? 0),
          }),
        })
      else if (r.sync.status === 'unsynced')
        toast({
          title: t('subs.kept', { language }),
          tone: 'warning',
          description: t('subs.keptBody', { confidence: percent(r.sync.confidence ?? 0) }),
        })
      else toast.error(t('subs.syncFailed', { language }))
    }
    setSyncing((was) => {
      const next = { ...was }
      for (const r of seen) next[r.id] = { language: was[r.id]?.language ?? '', seen: true }
      for (const r of done) delete next[r.id]
      return next
    })
  }, [tracks, syncing, t])

  return (
    <Loadable query={data} what={t('subs.what')}>
      {({ tracks, files, languages }) => {
        const name = (code: string) =>
          languages.find((l) => l.code === code)?.name ??
          streamLanguage(code, locale, t('subs.unknown'))
        const embedded = files.flatMap((f) =>
          f.streams.flatMap((s) => (s.type === 'subtitle' ? [{ file: f, stream: s }] : [])),
        )
        if (!files.length && !tracks.length)
          return (
            <EmptyState size="sm" icon="subtitles" title={t('subs.noFile')}>
              {t('subs.noFileBody')}
            </EmptyState>
          )
        return (
          <div className="grid gap-6">
            <TableFrame>
              <TableToolbar>
                <span className="text-text">{t('subs.tracks')}</span>
                <span className="text-text-3">
                  {t('subs.counts', { external: tracks.length, embedded: embedded.length })}
                </span>
              </TableToolbar>
              {tracks.length + embedded.length === 0 ? (
                <p className="px-3.5 py-8 text-center text-caption text-text-3">{t('subs.none')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('subs.language')}</TableHead>
                      <TableHead>{t('subs.source')}</TableHead>
                      <TableHead numeric>{t('subs.score')}</TableHead>
                      <TableHead>{t('subs.sync')}</TableHead>
                      <TableHead numeric>{t('subs.offset')}</TableHead>
                      <TableHead>
                        <span className="sr-only">{t('subs.actions')}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tracks.map((track) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        language={name(track.language)}
                        busy={sync.pending || offset.pending}
                        onSync={() => {
                          const language = name(track.language)
                          sync.run(track.id).then(
                            () => {
                              setSyncing((was) => ({
                                ...was,
                                [track.id]: { language, seen: false },
                              }))
                              toast({ title: t('subs.syncing', { language }) })
                            },
                            (e: Error) =>
                              toast.error(t('subs.syncFailed', { language }), {
                                description: e.message,
                              }),
                          )
                        }}
                        onOffset={(ms) =>
                          offset
                            .run(track.id, ms)
                            .catch((e: Error) =>
                              toast.error(t('subs.offsetFailed'), { description: e.message }),
                            )
                        }
                        onRemove={() =>
                          remove.run(track.id).then(
                            () => toast({ title: t('subs.deleted') }),
                            (e: Error) =>
                              toast.error(t('subs.deleteFailed'), { description: e.message }),
                          )
                        }
                      />
                    ))}
                    {embedded.map(({ file, stream }) => (
                      <TableRow key={`${file.id}-${stream.index}`}>
                        <TitleCell
                          title={[
                            name(stream.language),
                            stream.forced && t('stream.forced'),
                            stream.hi && t('stream.sdh'),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          detail={t('subs.stream', {
                            index: stream.index,
                            file: file.path.split('/').pop() ?? file.path,
                          })}
                        />
                        <TableCell className="text-text-2">{t('subs.embedded')}</TableCell>
                        <TableCell numeric>—</TableCell>
                        <TableCell>
                          <Badge tone="neutral">{t('subs.matchesVideo')}</Badge>
                        </TableCell>
                        <TableCell numeric>—</TableCell>
                        <TableCell />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TableFrame>
            {files.length > 0 && <SubtitleSearch id={m.id} languages={languages} />}
          </div>
        )
      }}
    </Loadable>
  )
}

function TrackRow({
  track: s,
  language,
  busy,
  onSync,
  onOffset,
  onRemove,
}: {
  track: SubtitleTrack
  language: string
  busy: boolean
  onSync: () => void
  onOffset: (ms: number) => void
  onRemove: () => void
}) {
  const t = useT(messages)
  const flags = [s.forced && t('stream.forced'), s.hi && t('stream.sdh'), s.format.toUpperCase()]
  const shown = flags.filter(Boolean)
  const movable = !IMAGE_FORMATS.has(s.format)
  const waiting = s.sync.status === 'queued' || s.sync.status === 'syncing'
  return (
    <TableRow>
      <TitleCell title={[language, ...shown].join(' · ')} detail={s.path} />
      <TableCell className="text-text-2">
        {s.kind === 'bundled' ? t('subs.bundled') : (s.provider ?? t('subs.byHand'))}
      </TableCell>
      <TableCell numeric>{s.score ?? '—'}</TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <Badge tone={syncTone[s.sync.status]}>{t(`sync.${s.sync.status}`)}</Badge>
          {s.sync.confidence !== null && (
            <span className="font-mono text-figure text-text-3">{percent(s.sync.confidence)}</span>
          )}
        </span>
      </TableCell>
      <TableCell numeric>
        {movable ? (
          <span className="inline-grid justify-items-end gap-0.5">
            <span className="inline-flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="remove"
                aria-label={t('subs.earlier', { language })}
                onClick={() => onOffset(s.sync.offsetMs - 50)}
                disabled={busy || waiting}
              />
              <output aria-label={t('subs.offsetLabel', { language })} className="w-16 text-center">
                {t('subs.ms', { value: offsetLabel(s.sync.offsetMs) })}
              </output>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="add"
                aria-label={t('subs.later', { language })}
                onClick={() => onOffset(s.sync.offsetMs + 50)}
                disabled={busy || waiting}
              />
            </span>
            {s.sync.detail && <span className="text-caption text-text-3">{s.sync.detail}</span>}
          </span>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell className="text-end">
        <span className="inline-flex gap-1">
          {movable && (
            <Tooltip content={t('subs.resync')}>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="subtitle-sync"
                aria-label={t('subs.resyncLabel', { language })}
                onClick={onSync}
                disabled={busy || waiting}
              />
            </Tooltip>
          )}
          <Tooltip content={t('subs.delete')}>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="delete"
              aria-label={t('subs.deleteLabel', { language })}
              onClick={onRemove}
            />
          </Tooltip>
        </span>
      </TableCell>
    </TableRow>
  )
}

/** Why a search found nothing to show: no provider on, or none answered (the server's reasons). */
const searchRefusal = (error: unknown) => {
  const reason = ((error as ApiError).details as { reason?: string } | undefined)?.reason
  return reason === 'no-providers' || reason === 'providers-failed' ? reason : null
}

function SubtitleSearch({
  id,
  languages,
}: {
  id: number
  languages: { code: string; name: string }[]
}) {
  const t = useT(messages)
  const [language, setLanguage] = useState(
    languages.some((l) => l.code === 'en') ? 'en' : (languages[0]?.code ?? ''),
  )
  // each Search asks the providers again; the results stay put while the tab is open
  const [search, setSearch] = useState<{ language: string; run: number } | null>(null)
  const results = useQuery(`subtitle-search:${id}:${search?.language}:${search?.run}`, (c) =>
    search
      ? c.subtitles.search({ params: { id }, body: { language: search.language } })
      : Promise.resolve([] as SubtitleSearchResult[]),
  )
  const download = useAction((c, r: SubtitleSearchResult) =>
    c.subtitles.download({ params: { id }, body: { resultId: r.id } }),
  )
  const refusal = results.status === 'error' ? searchRefusal(results.error) : null
  return (
    <section aria-labelledby="sub-search" className="grid gap-3">
      <h2 id="sub-search" className="text-title text-text">
        {t('subs.search')}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('subs.language')} className="w-56">
          <Select
            value={language}
            onValueChange={setLanguage}
            options={languages.map((l) => ({ value: l.code, label: l.name }))}
          />
        </Field>
        <Button icon="search" onClick={() => setSearch({ language, run: (search?.run ?? 0) + 1 })}>
          {t('subs.searchProviders')}
        </Button>
      </div>
      {search &&
        (refusal ? (
          <p className="text-caption text-text-3">{t(`subs.${refusal}`)}</p>
        ) : (
          <Loadable query={results} what={t('subs.resultsWhat')}>
            {(rs) =>
              rs.length === 0 ? (
                <p className="text-caption text-text-3">{t('subs.noResults')}</p>
              ) : (
                <div className="grid gap-2">
                  <TableFrame>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('subs.release')}</TableHead>
                          <TableHead>{t('subs.provider')}</TableHead>
                          <TableHead numeric>{t('subs.score')}</TableHead>
                          <TableHead>
                            <span className="sr-only">{t('subs.actions')}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rs.map((r) => (
                          <TableRow key={r.id}>
                            <TitleCell
                              title={
                                [
                                  r.format?.toUpperCase(),
                                  r.forced && t('stream.forced'),
                                  r.hi && t('stream.sdh'),
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || r.language
                              }
                              detail={r.releaseName}
                            />
                            <TableCell className="text-text-2">{r.provider}</TableCell>
                            <TableCell numeric>{r.score}</TableCell>
                            <TableCell className="text-end">
                              <Button
                                size="sm"
                                icon="download"
                                disabled={download.pending}
                                onClick={() =>
                                  download.run(r).then(
                                    (track) =>
                                      // a sync follows unless Sync to the audio is off
                                      toast.success(
                                        t('subs.downloaded'),
                                        track.sync.status === 'queued'
                                          ? { description: t('subs.downloadedSyncing') }
                                          : undefined,
                                      ),
                                    (e: Error) =>
                                      toast.error(t('subs.downloadFailed'), {
                                        description: e.message,
                                      }),
                                  )
                                }
                                aria-label={t('subs.useLabel', {
                                  release: r.releaseName,
                                  provider: r.provider,
                                })}
                              >
                                {t('subs.use')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableFrame>
                  {/* the line OpenSubtitles.com's terms ask for where its subtitles are picked */}
                  {[...new Set(rs.flatMap((r) => (r.attribution ? [r.attribution] : [])))].map(
                    (line) => (
                      <p key={line} className="text-caption text-text-3">
                        {line}
                      </p>
                    ),
                  )}
                </div>
              )
            }
          </Loadable>
        ))}
    </section>
  )
}
