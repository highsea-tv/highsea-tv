// SPDX-License-Identifier: AGPL-3.0-only
// Shows (docs/product/shows.md#library), laid out as Movies is: grid or table, a filter, a text
// filter and a sort, from Sonarr's series index. Each show has its monitored state, its episodes
// (how many of the monitored, aired ones have a file), the next to air, its network, size and
// whether it's still airing. The table selects rows for bulk edit, as Movies' does.

import { bytes } from '@highsea-tv/core/format'
import {
  Badge,
  type BadgeTone,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Poster,
  Progress,
  type ProgressTone,
  SegmentedControl,
  Select,
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
} from '@highsea-tv/ui-web'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { AdminShow } from '../../mock/types.ts'
import { Loadable, PosterSkeletons } from '../loadable.tsx'
import { showHref } from '../media/links.ts'
import { useStored } from '../movies/library.tsx'
import { AdminPage } from '../shell.tsx'

/** Monitored, aired episodes without a file (downloading ones included, as Sonarr counts them). */
export const missing = (s: AdminShow) => s.episodes.monitored - s.episodes.have

/** Airing or ended, as Sonarr's index shows it. */
export const showState = (s: AdminShow): { label: string; tone: BadgeTone } =>
  s.airing ? { label: 'Airing', tone: 'info' } : { label: 'Ended', tone: 'neutral' }

/** The episode bar's colour: whole, still to get, or not watched for. */
export const episodesTone = (s: AdminShow): ProgressTone =>
  !s.monitored ? 'neutral' : missing(s) > 0 ? 'warning' : 'success'

/** "24 of 25", Sonarr's have-of-monitored. */
export const episodesLine = (s: AdminShow) => `${s.episodes.have} of ${s.episodes.monitored}`

/** "12 Mar 2026": an air date, which is a day with no time. */
export const airDate = (day: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))

const filters = {
  all: { label: 'All', match: () => true },
  missing: { label: 'Missing episodes', match: (s: AdminShow) => s.monitored && missing(s) > 0 },
  airing: { label: 'Airing', match: (s: AdminShow) => s.airing },
  ended: { label: 'Ended', match: (s: AdminShow) => !s.airing },
  unmonitored: { label: 'Not monitored', match: (s: AdminShow) => !s.monitored },
} satisfies Record<string, { label: string; match: (s: AdminShow) => boolean }>
type Filter = keyof typeof filters

const sorts = {
  title: {
    label: 'Title',
    compare: (a: AdminShow, b: AdminShow) => a.sortTitle.localeCompare(b.sortTitle),
  },
  added: {
    label: 'Date added',
    compare: (a: AdminShow, b: AdminShow) => Date.parse(b.addedAt) - Date.parse(a.addedAt),
  },
  next: {
    label: 'Next airing',
    // the soonest first, then the shows with nothing to come, by title
    compare: (a: AdminShow, b: AdminShow) =>
      (a.nextAiring?.aired ?? '9999').localeCompare(b.nextAiring?.aired ?? '9999') ||
      a.sortTitle.localeCompare(b.sortTitle),
  },
  year: { label: 'Year', compare: (a: AdminShow, b: AdminShow) => b.year - a.year },
  size: { label: 'Size', compare: (a: AdminShow, b: AdminShow) => b.size - a.size },
} satisfies Record<string, { label: string; compare: (a: AdminShow, b: AdminShow) => number }>
type Sort = keyof typeof sorts

/** The grid's badge on the art: only what needs a look. */
function artStatus(s: AdminShow): { label: string; tone: BadgeTone } | null {
  if (!s.monitored) return { label: 'Not monitored', tone: 'neutral' }
  const n = missing(s)
  if (n > 0) return { label: `${n} missing`, tone: 'warning' }
  return null
}

export function ShowsLibrary() {
  const [, navigate] = useLocation()
  const shows = useQuery('admin-shows', (c) => c.shows.list(), ['shows.updated'])
  const profiles = useQuery('quality-profiles', (c) => c.movies.qualityProfiles())
  const [view, setView] = useStored<'grid' | 'table'>('shows-view', 'grid')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('title')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)

  // no bulk calls in the mock's shows: each one, in turn
  const bulkEdit = useAction(async (c, ids: string[], patch: Partial<AdminShow>) => {
    for (const id of ids) await c.shows.edit(id, patch)
  })
  const bulkSearch = useAction(async (c, ids: string[]) => {
    for (const id of ids) await c.shows.search(id)
  })
  const bulkRemove = useAction(async (c, ids: string[]) => {
    for (const id of ids) await c.shows.remove(id)
  })

  const all = shows.data ?? []
  const counts = Object.fromEntries(
    Object.entries(filters).map(([k, f]) => [k, all.filter((s) => f.match(s)).length]),
  ) as Record<Filter, number>
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return all
      .filter((s) => filters[filter].match(s))
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.network.toLowerCase().includes(q) ||
          String(s.year).includes(q),
      )
      .sort(sorts[sort].compare)
  }, [all, filter, text, sort])

  const ids = [...selected].filter((id) => all.some((s) => s.id === id))
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }
  const everyShown = shown.length > 0 && shown.every((s) => selected.has(s.id))

  const bulk = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run()
      toast.success(label)
      setSelected(new Set())
    } catch (e) {
      toast.error('That didn’t work', { description: (e as Error).message })
    }
  }
  const plural = (n: number) => `${n} ${n === 1 ? 'show' : 'shows'}`

  const actions = (
    <>
      <SegmentedControl
        aria-label="View"
        size="sm"
        value={view}
        onValueChange={(v) => setView(v as typeof view)}
        options={[
          { value: 'grid', label: 'Grid', icon: 'grid' },
          { value: 'table', label: 'Table', icon: 'list' },
        ]}
      />
      <Button variant="primary" icon="add" onClick={() => navigate('/discover/shows')}>
        Add show
      </Button>
    </>
  )

  return (
    <AdminPage title="Shows" actions={actions}>
      <Loadable
        query={shows}
        what="the library"
        skeleton={view === 'grid' ? <PosterSkeletons /> : undefined}
      >
        {() =>
          all.length === 0 ? (
            <EmptyState
              icon="tv"
              title="No shows yet"
              action={
                <Button
                  variant="primary"
                  icon="discover"
                  onClick={() => navigate('/discover/shows')}
                >
                  Discover shows
                </Button>
              }
            >
              Add a show and highsea finds each episode, downloads it and files it here.
            </EmptyState>
          ) : (
            <TableFrame>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TableToolbar>
                  <TabsList aria-label="Filter shows" className="max-w-full overflow-x-auto">
                    {(Object.keys(filters) as Filter[]).map((k) => (
                      <TabsTrigger key={k} value={k} count={counts[k]}>
                        {filters[k].label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <div className="ms-auto flex min-w-0 flex-wrap items-center gap-2">
                    <Input
                      type="search"
                      icon="filter"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Filter by title"
                      aria-label="Filter by title or network"
                      className="w-48"
                    />
                    <Select
                      value={sort}
                      onValueChange={(v) => setSort(v as Sort)}
                      aria-label="Sort by"
                      options={(Object.keys(sorts) as Sort[]).map((k) => ({
                        value: k,
                        label: sorts[k].label,
                      }))}
                      className="w-36"
                    />
                  </div>
                </TableToolbar>
                {ids.length > 0 && (
                  <div
                    role="toolbar"
                    aria-label="Bulk edit"
                    className="flex flex-wrap items-center gap-2 border-line border-b bg-accent-soft px-3.5 py-2 text-ui"
                  >
                    <span className="me-auto font-medium text-text">
                      {plural(ids.length)} selected
                    </span>
                    <Button
                      size="sm"
                      icon="search"
                      loading={bulkSearch.pending}
                      onClick={() =>
                        bulk(`Searching for ${plural(ids.length)}`, () => bulkSearch.run(ids))
                      }
                    >
                      Search
                    </Button>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button size="sm" iconEnd="chevron-down">
                          Edit
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem
                          icon="bookmark"
                          onSelect={() =>
                            bulk(`${plural(ids.length)} monitored`, () =>
                              bulkEdit.run(ids, { monitored: true }),
                            )
                          }
                        >
                          Monitor
                        </MenuItem>
                        <MenuItem
                          icon="close"
                          onSelect={() =>
                            bulk(`${plural(ids.length)} no longer monitored`, () =>
                              bulkEdit.run(ids, { monitored: false }),
                            )
                          }
                        >
                          Stop monitoring
                        </MenuItem>
                        <MenuSeparator />
                        <MenuLabel>Quality profile</MenuLabel>
                        {(profiles.data ?? []).map((p) => (
                          <MenuItem
                            key={p.id}
                            onSelect={() =>
                              bulk(`${plural(ids.length)} moved to ${p.name}`, () =>
                                bulkEdit.run(ids, { qualityProfileId: p.id }),
                              )
                            }
                          >
                            {p.name}
                          </MenuItem>
                        ))}
                      </MenuContent>
                    </Menu>
                    <Button
                      size="sm"
                      variant="danger"
                      icon="delete"
                      onClick={() => setConfirm(true)}
                    >
                      Remove
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                  </div>
                )}
                <TabsContent value={filter}>
                  {shown.length === 0 ? (
                    <p className="px-3.5 py-8 text-center text-caption text-text-3">
                      No shows match. Try another filter.
                    </p>
                  ) : view === 'grid' ? (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5 p-3.5">
                      {shown.map((s) => {
                        const art = artStatus(s)
                        return (
                          <li key={s.id} className="grid content-start gap-2">
                            <Poster
                              title={s.title}
                              src={s.art.poster}
                              href={showHref(s)}
                              status={
                                art && (
                                  <Badge overlay tone={art.tone} className="max-w-full">
                                    <span className="truncate">{art.label}</span>
                                  </Badge>
                                )
                              }
                              showTitle
                              caption={
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span>{s.year}</span>
                                  <span aria-hidden>·</span>
                                  <span className="truncate font-mono">{episodesLine(s)}</span>
                                </span>
                              }
                            />
                            <Progress
                              value={
                                s.episodes.monitored
                                  ? (s.episodes.have / s.episodes.monitored) * 100
                                  : 0
                              }
                              tone={episodesTone(s)}
                              aria-label={`${s.title}: ${episodesLine(s)} episodes`}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              aria-label="Select every show shown"
                              checked={everyShown}
                              onCheckedChange={(v) =>
                                setSelected(
                                  v === true ? new Set(shown.map((s) => s.id)) : new Set(),
                                )
                              }
                            />
                          </TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Network</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead numeric>Seasons</TableHead>
                          <TableHead className="w-36">Episodes</TableHead>
                          <TableHead>Next airing</TableHead>
                          <TableHead numeric>Size</TableHead>
                          <TableHead>Monitored</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shown.map((s) => {
                          const state = showState(s)
                          return (
                            <TableRow
                              key={s.id}
                              data-state={selected.has(s.id) ? 'selected' : undefined}
                            >
                              <TableCell>
                                <Checkbox
                                  aria-label={`Select ${s.title}`}
                                  checked={selected.has(s.id)}
                                  onCheckedChange={(v) => toggle(s.id, v === true)}
                                />
                              </TableCell>
                              <TitleCell
                                title={
                                  <a href={showHref(s)} className="hover:underline">
                                    {s.title}
                                  </a>
                                }
                                detail={s.path}
                                art={s.art.poster}
                              />
                              <TableCell className="text-text-2">{s.network || '—'}</TableCell>
                              <TableCell>
                                <Badge tone={state.tone}>{state.label}</Badge>
                              </TableCell>
                              <TableCell numeric>{s.seasons}</TableCell>
                              <TableCell>
                                <span className="grid gap-1">
                                  <span className="font-mono text-figure text-text-2">
                                    {episodesLine(s)}
                                  </span>
                                  <Progress
                                    value={
                                      s.episodes.monitored
                                        ? (s.episodes.have / s.episodes.monitored) * 100
                                        : 0
                                    }
                                    tone={episodesTone(s)}
                                    aria-label={`${s.title}: ${episodesLine(s)} episodes`}
                                  />
                                </span>
                              </TableCell>
                              <TableCell>
                                {s.nextAiring ? (
                                  <span className="grid">
                                    <span className="text-text">{airDate(s.nextAiring.aired)}</span>
                                    <span className="font-mono text-release text-text-3">
                                      {s.nextAiring.code}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-text-3">—</span>
                                )}
                              </TableCell>
                              <TableCell numeric>{bytes(s.size)}</TableCell>
                              <TableCell className="text-text-2">
                                {s.monitored ? 'Yes' : 'No'}
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
        }
      </Loadable>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${plural(ids.length)}?`}
        description="They leave the library and stop being monitored. Their files stay on disk."
        confirmLabel="Remove"
        destructive
        onConfirm={() => bulk(`${plural(ids.length)} removed`, () => bulkRemove.run(ids))}
      />
    </AdminPage>
  )
}
