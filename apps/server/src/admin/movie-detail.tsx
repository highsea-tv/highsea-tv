'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A6 Movie detail (docs/product/movies.md#movie-detail-a6, media-pages.md), ported from the
// prototype's movies/detail.tsx. One page at one address, `/movies/{tmdbId}`, whether the movie is
// in the library or not (ADR 0014, amended 2026-10-20). Not added: the summary, Overview and Cast
// and crew, with Add movie. Added, it gains the library layer in place: Search, Interactive search
// and More in the header; the status, a tag per version, the path and Monitored; In the library
// with the versions; the Files, History and Search tabs.
//
// What this checkpoint changes from the prototype (each listed in the checkpoint report):
// - search waits for indexers (decision 2): Search is disabled with the reason, and the Search tab
//   says the same with a link to Indexers;
// - Files and History show their empty states: files and history arrive with checkpoint 6;
// - no Subtitles tab (checkpoint 7) and no In the queue card (checkpoint 6);
// - Edit (in More) and the version list's add, edit and remove, which the prototype doesn't draw;
// - Remove keeps the page where it is, without its library layer (Addresses are TMDB ids);
// - a movie TMDB no longer has keeps its rows and address and says so (judgement call 4).

import type {
  DiscoverMovie,
  LanguageProfile,
  MinimumAvailability,
  Movie,
  MovieUpdate,
  MovieVersion,
  QualityProfile,
  RootFolder,
} from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  QualityTag,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  toast,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { AddMovieDialog } from './add-dialog.tsx'
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
import { AVAILABILITY } from './movie-data.ts'
import { movieDetail as messages } from './movie-detail-messages.ts'
import { AdminPage } from './shell.tsx'

type Tab = 'overview' | 'cast' | 'files' | 'history' | 'search'

/**
 * Whether highsea can search for releases yet. Indexers arrive with checkpoint 5; until then
 * search is shown but disabled, with the reason (checkpoint 4 plan, decision 2).
 */
const CAN_SEARCH = false

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
      c.quality.languageProfiles(),
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
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const [monitoring, setMonitoring] = useState<boolean | null>(null)

  const update = useAction((c, body: MovieUpdate) => c.movies.update({ params: { id }, body }))
  const refresh = useAction((c) => c.movies.refresh({ params: { id } }))
  const remove = useAction((c, files: boolean) =>
    c.movies.delete({ params: { id }, query: { deleteFiles: files ? 'true' : 'false' } }),
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
      <Tooltip content={t('noIndexers')}>
        {/* a disabled button takes no focus, so its wrapper carries the reason (Radix Tooltip) */}
        <span tabIndex={CAN_SEARCH ? undefined : 0} className="inline-flex rounded-sm">
          <Button icon="search" disabled={!CAN_SEARCH}>
            {t('search')}
          </Button>
        </span>
      </Tooltip>
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
          if (!o) setDeleteFiles(false)
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
          </span>
        }
        confirmLabel={t('remove.confirm')}
        destructive
        onConfirm={() =>
          remove.run(deleteFiles).then(
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
        </TabsList>
        <TabsContent value="overview" className="pt-5">
          <MediaOverview
            meta={meta}
            onAllCast={() => onTab('cast')}
            onAdd={onAdd}
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
          <EmptyState size="sm" icon="clock" title={t('history.none')}>
            {t('history.noneBody')}
          </EmptyState>
        </TabsContent>
        <TabsContent value="search" className="pt-5">
          <SearchTab />
        </TabsContent>
      </Tabs>
    </>
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

// ---------------------------------------------------------------- files and search

/** One card per version. Files arrive with importing (checkpoint 6), so each says it has none. */
function Files({ movie: m }: { movie: Movie }) {
  const t = useT(messages)
  return (
    <div className="grid gap-4">
      {m.versions.map((v) => (
        <section
          key={v.id}
          aria-label={t('files.version', { label: v.label })}
          className="grid gap-3 rounded-lg border border-line bg-s1 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <QualityTag>{v.label}</QualityTag>
            {v.fileId === null && (
              <Badge tone={m.status === 'downloading' ? 'accent' : 'danger'}>
                {m.status === 'downloading' ? t('files.downloading') : t('files.none')}
              </Badge>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Interactive search waits for indexers (decision 2): the reason, and where to fix it. */
function SearchTab(): ReactNode {
  const t = useT(messages)
  const router = useRouter()
  return (
    <EmptyState
      size="sm"
      icon="indexers"
      title={t('noIndexers')}
      action={<Button onClick={() => router.push('/indexers')}>{t('goToIndexers')}</Button>}
    />
  )
}
