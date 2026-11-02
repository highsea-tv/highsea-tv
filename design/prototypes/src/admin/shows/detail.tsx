// SPDX-License-Identifier: AGPL-3.0-only
// A show's page (docs/product/shows.md#show-page), laid out as a movie's is: the summary with the
// path and Monitored, then tabs. Seasons is Sonarr's series page: each season with its monitor
// switch, its episode count and Search, and each episode with its own switch, number, title, air
// date, state, file and Search. Files lists every file once, a double episode's file noted. Edit
// and Remove, and Search for the whole show, are in the header.

import { bytes } from '@highsea-tv/core/format'
import {
  Badge,
  type BadgeTone,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogContent,
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
} from '@highsea-tv/ui'
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type {
  AdminEpisode,
  AdminSeason,
  AdminShow,
  AdminShowDetail,
  EpisodeStatus,
} from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { MediaSummary, SummarySkeleton } from '../media/sections.tsx'
import { AdminPage } from '../shell.tsx'
import { useTabAddress } from '../tabs.ts'
import { useShowOptions } from './add-dialog.tsx'
import { airDate, episodesLine, showState } from './library.tsx'

/** The tabs, each at its own address (`/shows/{id}/{tab}`, Seasons at `/shows/{id}`). */
export const showTabs = ['seasons', 'files'] as const
type Tab = (typeof showTabs)[number]

function useTab(id: string) {
  const { tab } = useParams<{ tab?: string }>()
  const shown = showTabs.find((t) => t === tab) ?? 'seasons'
  const go = useTabAddress<Tab>(`/shows/${id}`, 'seasons')
  return [shown, go] as const
}

export const episodeStatus: Record<EpisodeStatus, { label: string; tone: BadgeTone }> = {
  available: { label: 'Available', tone: 'success' },
  downloading: { label: 'Downloading', tone: 'accent' },
  missing: { label: 'Missing', tone: 'danger' },
  'cutoff-unmet': { label: 'Upgrade wanted', tone: 'warning' },
  unaired: { label: 'Not aired', tone: 'info' },
}

const pad = (n: number) => String(n).padStart(2, '0')
/** S01E02, or S01E01–E02 for a file that holds both. */
export const episodeCode = (season: number, numbers: number[]) =>
  `S${pad(season)}E${pad(numbers[0] ?? 0)}${numbers.length > 1 ? `–E${pad(numbers[numbers.length - 1] ?? 0)}` : ''}`

/** Monitored, with no file or one below the cutoff: what a search looks for. */
const wanted = (e: AdminEpisode) =>
  e.monitored && (e.status === 'missing' || e.status === 'cutoff-unmet')

/**
 * A season's line, counted as the show's is: aired episodes monitored or on disk, how many have a
 * file, and its files' size (each file once).
 */
function seasonFigures(season: AdminSeason) {
  const aired = season.episodes.filter((e) => (e.monitored || e.file) && e.status !== 'unaired')
  const files = new Map(season.episodes.flatMap((e) => (e.file ? [[e.file.path, e.file]] : [])))
  return {
    have: aired.filter((e) => e.file).length,
    monitored: aired.length,
    size: [...files.values()].reduce((n, f) => n + f.size, 0),
  }
}

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const dirname = (path: string) => path.slice(0, path.lastIndexOf('/'))

type Scope = { season?: number; episode?: string }

export function ShowDetail() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const show = useQuery(`admin-show:${id}`, (c) => c.shows.get(id), ['shows.updated'])
  const profiles = useQuery('quality-profiles', (c) => c.movies.qualityProfiles())
  const [tab, setTab] = useTab(id)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const edit = useAction((c, patch: Partial<AdminShow>) => c.shows.edit(id, patch))
  const search = useAction((c, scope: Scope) => c.shows.search(id, scope))
  const monitorSeason = useAction((c, season: number, on: boolean) =>
    c.shows.monitorSeason(id, season, on),
  )
  const monitorEpisode = useAction((c, episode: string, on: boolean) =>
    c.shows.monitorEpisode(id, episode, on),
  )
  const remove = useAction((c) => c.shows.remove(id))

  const s = show.data
  const fail = (title: string) => (e: Error) => toast.error(title, { description: e.message })

  /** Search for the show, a season or an episode, and say what it found to look for. */
  const look = (scope: Scope, what: string) =>
    search.run(scope).then(
      (r) =>
        r.found > 0
          ? toast({
              title: `Searching for ${what}`,
              description: `${r.found} ${r.found === 1 ? 'episode' : 'episodes'} to find. Follow it in Activity.`,
            })
          : toast({
              title: `Nothing to search for in ${what}`,
              description: 'Every monitored episode that has aired has a file at its cutoff.',
            }),
      fail('Search failed'),
    )

  const actions = s ? (
    <>
      <Button
        variant="primary"
        icon="search"
        loading={search.pending}
        disabled={!s.monitored || !s.seasonList.some((x) => x.episodes.some(wanted))}
        onClick={() => look({}, s.title)}
      >
        Search
      </Button>
      <Button icon="edit" onClick={() => setEditing(true)}>
        Edit
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

  const profileName = (pid: string) => profiles.data?.find((p) => p.id === pid)?.name ?? pid

  return (
    <AdminPage title={s?.title ?? 'Show'} actions={actions}>
      {show.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="tv"
          title={show.error.message}
          action={<Button onClick={() => navigate('/shows')}>Go to Shows</Button>}
        >
          It may have been removed. Discover finds every show, in the library or not.
        </EmptyState>
      ) : !s ? (
        <SummarySkeleton />
      ) : (
        <>
          <Summary
            show={s}
            profile={profileName(s.qualityProfileId)}
            onMonitor={(monitored) => edit.run({ monitored }).catch(fail('Couldn’t save that'))}
          />
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} variant="line">
            <TabsList aria-label="Show sections">
              <TabsTrigger value="seasons">Seasons</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
            <TabsContent value="seasons" className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-5">
              <Seasons
                show={s}
                searching={search.pending}
                onSearch={look}
                onMonitorSeason={(n, on) =>
                  monitorSeason.run(n, on).catch(fail('Couldn’t save that'))
                }
                onMonitorEpisode={(e, on) =>
                  monitorEpisode.run(e, on).catch(fail('Couldn’t save that'))
                }
              />
            </TabsContent>
            <TabsContent value="files" className="pt-5">
              <Files show={s} />
            </TabsContent>
          </Tabs>
        </>
      )}
      {s && editing && <EditShowDialog show={s} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${s?.title ?? 'this show'}?`}
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
          remove.run().then(() => {
            toast.success(`${s?.title} removed`)
            navigate('/shows')
          }, fail('Couldn’t remove it'))
        }
      />
    </AdminPage>
  )
}

// ---------------------------------------------------------------- summary

function Summary({
  show: s,
  profile,
  onMonitor,
}: {
  show: AdminShowDetail
  profile: string
  onMonitor: (on: boolean) => void
}) {
  const state = showState(s)
  return (
    <MediaSummary
      // a show has no still of its own; the summary draws only the poster and backdrop
      item={{ ...s, art: { ...s.art, still: s.art.backdrop } }}
      badges={
        <>
          <Badge tone={state.tone}>{state.label}</Badge>
          <QualityTag>{profile}</QualityTag>
        </>
      }
    >
      <p className="flex flex-wrap gap-x-2 text-caption text-text-2">
        {s.endYear && (
          <>
            <span className="font-mono">
              {s.year}–{s.endYear}
            </span>
            <span aria-hidden>·</span>
          </>
        )}
        {s.network && (
          <>
            <span>{s.network}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span>
          {s.seasons} {s.seasons === 1 ? 'season' : 'seasons'}
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="font-mono">{episodesLine(s)}</span> episodes
        </span>
        <span aria-hidden>·</span>
        <span className="font-mono">{bytes(s.size)}</span>
      </p>
      {s.nextAiring && (
        <p className="text-caption text-text-2">
          Next: <span className="font-mono">{s.nextAiring.code}</span> “{s.nextAiring.title}”,{' '}
          {airDate(s.nextAiring.aired)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-text-3">
        <span className="min-w-0 font-mono [overflow-wrap:anywhere]">{s.path}</span>
        <span className="flex items-center gap-2">
          <Switch
            id="monitored"
            checked={s.monitored}
            onCheckedChange={onMonitor}
            aria-describedby="monitored-hint"
          />
          <label htmlFor="monitored" className="text-text-2">
            Monitored
          </label>
          <span id="monitored-hint" className="sr-only">
            Grab new episodes in monitored seasons, and upgrade them
          </span>
        </span>
      </div>
    </MediaSummary>
  )
}

// ---------------------------------------------------------------- seasons

function Seasons({
  show: s,
  searching,
  onSearch,
  onMonitorSeason,
  onMonitorEpisode,
}: {
  show: AdminShowDetail
  searching: boolean
  onSearch: (scope: Scope, what: string) => void
  onMonitorSeason: (season: number, on: boolean) => void
  onMonitorEpisode: (episode: string, on: boolean) => void
}) {
  // the latest season starts open, as Sonarr's page does; the rest one click away
  const latest = Math.max(0, ...s.seasonList.map((x) => x.number))
  const [open, setOpen] = useState<Set<number>>(() => new Set([latest]))
  const toggle = (n: number) => {
    const next = new Set(open)
    if (next.has(n)) next.delete(n)
    else next.add(n)
    setOpen(next)
  }
  if (s.seasonList.length === 0)
    return (
      <EmptyState icon="tv" title="No seasons yet">
        TMDB hasn’t listed any episodes for this show yet. They show here once it does.
      </EmptyState>
    )
  return s.seasonList.map((season) => (
    <SeasonSection
      key={season.number}
      show={s}
      season={season}
      open={open.has(season.number)}
      onToggle={() => toggle(season.number)}
      searching={searching}
      onSearch={onSearch}
      onMonitor={(on) => onMonitorSeason(season.number, on)}
      onMonitorEpisode={onMonitorEpisode}
    />
  ))
}

function SeasonSection({
  show: s,
  season,
  open,
  onToggle,
  searching,
  onSearch,
  onMonitor,
  onMonitorEpisode,
}: {
  show: AdminShowDetail
  season: AdminSeason
  open: boolean
  onToggle: () => void
  searching: boolean
  onSearch: (scope: Scope, what: string) => void
  onMonitor: (on: boolean) => void
  onMonitorEpisode: (episode: string, on: boolean) => void
}) {
  const f = seasonFigures(season)
  const body = `season-${season.number}`
  const switchId = `${body}-monitored`
  const episodes = [...season.episodes].sort((a, b) => a.number - b.number)
  return (
    <section aria-labelledby={`${body}-title`}>
      <TableFrame>
        <TableToolbar>
          <h3 id={`${body}-title`} className="min-w-0 font-medium text-text text-ui">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={body}
              onClick={onToggle}
              className="flex min-w-0 items-center gap-2 rounded-sm text-start outline-none focus-visible:ring-focus"
            >
              <Icon
                name="chevron-right"
                size={16}
                className={
                  open
                    ? 'rotate-90 text-text-3 transition-transform motion-reduce:transition-none'
                    : 'text-text-3 transition-transform motion-reduce:transition-none'
                }
              />
              <span className="truncate">{season.title}</span>
            </button>
          </h3>
          <span className="font-mono text-figure text-text-3">
            {f.have} of {f.monitored}
            <span className="sr-only"> episodes</span> · {bytes(f.size)}
          </span>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <Switch id={switchId} checked={season.monitored} onCheckedChange={onMonitor} />
              <label htmlFor={switchId} className="text-text-2">
                Monitored
                <span className="sr-only">: {season.title}</span>
              </label>
            </span>
            <Button
              size="sm"
              icon="search"
              disabled={searching || !s.monitored || !season.episodes.some(wanted)}
              onClick={() => onSearch({ season: season.number }, `${s.title}, ${season.title}`)}
            >
              Search<span className="sr-only"> {season.title}</span>
            </Button>
          </div>
        </TableToolbar>
        {open && (
          <div id={body}>
            {episodes.length === 0 ? (
              <p className="px-3.5 py-8 text-center text-caption text-text-3">
                No episodes listed yet.
              </p>
            ) : (
              <Table aria-label={`${season.title} episodes`}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">
                      <span className="sr-only">Monitored</span>
                    </TableHead>
                    <TableHead numeric className="w-10">
                      #
                    </TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Air date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Search</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {episodes.map((e) => (
                    <EpisodeRow
                      key={e.id}
                      episode={e}
                      searching={searching}
                      onMonitor={(on) => onMonitorEpisode(e.id, on)}
                      onSearch={() =>
                        onSearch(
                          { episode: e.id },
                          `${s.title} ${episodeCode(e.season, [e.number])}`,
                        )
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </TableFrame>
    </section>
  )
}

function EpisodeRow({
  episode: e,
  searching,
  onMonitor,
  onSearch,
}: {
  episode: AdminEpisode
  searching: boolean
  onMonitor: (on: boolean) => void
  onSearch: () => void
}) {
  const st = episodeStatus[e.status]
  const code = episodeCode(e.season, [e.number])
  const label = `${code} ${e.title}`
  return (
    <TableRow className={e.monitored ? undefined : 'text-text-3'}>
      <TableCell>
        <Switch checked={e.monitored} onCheckedChange={onMonitor} aria-label={`Monitor ${label}`} />
      </TableCell>
      <TableCell numeric>{e.number}</TableCell>
      <TableCell className={e.monitored ? 'text-text' : 'text-text-3'}>{e.title}</TableCell>
      <TableCell className="whitespace-nowrap text-text-2">{airDate(e.aired)}</TableCell>
      <TableCell>
        <span className="grid min-w-24 gap-1">
          <Badge tone={st.tone} className="justify-self-start">
            {st.label}
          </Badge>
          {e.status === 'downloading' && (
            <Progress value={e.progress ?? 0} aria-label={`${label} progress`} />
          )}
        </span>
      </TableCell>
      <TableCell>
        <EpisodeFile episode={e} />
      </TableCell>
      <TableCell className="text-end">
        <Tooltip content="Search for this episode">
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon="search"
            aria-label={`Search for ${label}`}
            disabled={searching || !wanted(e)}
            onClick={onSearch}
          />
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

function EpisodeFile({ episode: e }: { episode: AdminEpisode }) {
  const f = e.file
  if (!f) return <span className="text-text-3">—</span>
  return (
    <span className="grid min-w-0 max-w-80 gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <QualityTag>{f.quality}</QualityTag>
        <span className="font-mono text-figure text-text-2">{bytes(f.size)}</span>
        {f.releaseGroup && <span className="text-caption text-text-3">{f.releaseGroup}</span>}
      </span>
      <span className="truncate font-mono text-release text-text-3" title={f.path}>
        {basename(f.path)}
      </span>
      {f.episodes.length > 1 && (
        <span className="text-caption text-text-3">
          One file for {episodeCode(e.season, f.episodes)}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------- files

function Files({ show: s }: { show: AdminShowDetail }) {
  const files = [
    ...new Map(
      s.seasonList
        .flatMap((x) => x.episodes)
        .flatMap((e) =>
          e.file ? [[e.file.path, { file: e.file, season: e.season }] as const] : [],
        ),
    ).values(),
  ].sort((a, b) => a.season - b.season || (a.file.episodes[0] ?? 0) - (b.file.episodes[0] ?? 0))
  if (files.length === 0)
    return (
      <EmptyState icon="folder" title="No files yet">
        Episodes show here as they’re imported into {s.path}.
      </EmptyState>
    )
  return (
    <TableFrame>
      <TableToolbar>
        <span className="text-text-2">
          {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
          <span className="font-mono">{bytes(s.size)}</span>
        </span>
      </TableToolbar>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Episodes</TableHead>
            <TableHead>File</TableHead>
            <TableHead>Quality</TableHead>
            <TableHead>Release group</TableHead>
            <TableHead numeric>Size</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map(({ file: f, season }) => (
            <TableRow key={f.path}>
              <TableCell className="whitespace-nowrap font-mono text-text">
                {episodeCode(season, f.episodes)}
              </TableCell>
              <TitleCell title={basename(f.path)} detail={dirname(f.path)} />
              <TableCell>
                <QualityTag>{f.quality}</QualityTag>
              </TableCell>
              <TableCell className="text-text-2">{f.releaseGroup ?? '—'}</TableCell>
              <TableCell numeric>{bytes(f.size)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}

// ---------------------------------------------------------------- edit

function EditShowDialog({
  show: s,
  onOpenChange,
}: {
  show: AdminShowDetail
  onOpenChange: (open: boolean) => void
}) {
  const options = useShowOptions()
  const [form, setForm] = useState({
    monitored: s.monitored,
    qualityProfileId: s.qualityProfileId,
    rootFolder: s.rootFolder,
    seasonFolders: s.seasonFolders,
  })
  const save = useAction((c) => c.shows.edit(s.id, form))
  const submit = () =>
    save.run().then(
      () => {
        onOpenChange(false)
        toast.success(`${s.title} saved`)
      },
      () => {
        // the error shows in the dialog
      },
    )
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        title={`Edit ${s.title}`}
        description="Seasons and episodes are monitored on their own, on the Seasons tab."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={save.pending}
              disabled={options.status !== 'success'}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Loadable query={options} what="the profiles">
            {(o) => (
              <div className="grid gap-4">
                <Field
                  inline
                  label="Monitored"
                  hint="Grab new episodes in monitored seasons, and upgrade them until the profile’s cutoff."
                >
                  <Switch
                    checked={form.monitored}
                    onCheckedChange={(monitored) => setForm({ ...form, monitored })}
                  />
                </Field>
                <Field label="Quality profile">
                  <Select
                    value={form.qualityProfileId}
                    onValueChange={(qualityProfileId) => setForm({ ...form, qualityProfileId })}
                    options={o.quality.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Field>
                <Field
                  label="Root folder"
                  hint={
                    form.rootFolder === s.rootFolder
                      ? undefined
                      : `Its files move to ${form.rootFolder}/${s.title} (${s.year}).`
                  }
                >
                  <Select
                    value={form.rootFolder}
                    onValueChange={(rootFolder) => setForm({ ...form, rootFolder })}
                    options={o.folders.map((f) => ({ value: f, label: f }))}
                    className="font-mono"
                  />
                </Field>
                <Field
                  inline
                  label="Season folders"
                  hint="Each season’s files go in a folder of their own, such as Season 01."
                >
                  <Switch
                    checked={form.seasonFolders}
                    onCheckedChange={(seasonFolders) => setForm({ ...form, seasonFolders })}
                  />
                </Field>
              </div>
            )}
          </Loadable>
          {save.error && (
            <p role="alert" className="text-caption text-danger">
              {save.error.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
