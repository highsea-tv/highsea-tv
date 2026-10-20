// SPDX-License-Identifier: AGPL-3.0-only
// A5 Movies library (docs/product/movies.md#library). Grid or table, a filter by status, a text
// filter and a sort. The table selects rows for bulk edit: monitor, quality profile, search and
// remove. An item with two versions (1080p beside 4K HDR) is one row with both.

import { shortDate } from '@highsea/core/format'
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
  QualityTag,
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
} from '@highsea/ui-web'
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { MediaItem, MediaStatus } from '../../mock/types.ts'
import { Loadable, PosterSkeletons } from '../loadable.tsx'
import { AdminPage, adminHref } from '../shell.tsx'

export const movieStatus: Record<MediaStatus, { label: string; tone: BadgeTone }> = {
  available: { label: 'Available', tone: 'success' },
  downloading: { label: 'Downloading', tone: 'accent' },
  queued: { label: 'Queued', tone: 'neutral' },
  missing: { label: 'Missing', tone: 'danger' },
  'cutoff-unmet': { label: 'Upgrade wanted', tone: 'warning' },
  unreleased: { label: 'Not released', tone: 'info' },
}

const filters = {
  all: { label: 'All', match: () => true },
  available: { label: 'Available', match: (s: MediaStatus) => s === 'available' },
  wanted: {
    label: 'Wanted',
    match: (s: MediaStatus) => s === 'missing' || s === 'cutoff-unmet',
  },
  downloading: {
    label: 'Downloading',
    match: (s: MediaStatus) => s === 'downloading' || s === 'queued',
  },
  unreleased: { label: 'Not released', match: (s: MediaStatus) => s === 'unreleased' },
} satisfies Record<string, { label: string; match: (s: MediaStatus) => boolean }>
type Filter = keyof typeof filters

const sorts = {
  title: {
    label: 'Title',
    compare: (a: MediaItem, b: MediaItem) => a.sortTitle.localeCompare(b.sortTitle),
  },
  added: {
    label: 'Date added',
    compare: (a: MediaItem, b: MediaItem) => Date.parse(b.addedAt) - Date.parse(a.addedAt),
  },
  year: { label: 'Year', compare: (a: MediaItem, b: MediaItem) => b.year - a.year },
  rating: { label: 'Rating', compare: (a: MediaItem, b: MediaItem) => b.rating - a.rating },
} satisfies Record<string, { label: string; compare: (a: MediaItem, b: MediaItem) => number }>
type Sort = keyof typeof sorts

function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(`highsea-proto:${key}`) as T | null) ?? initial
    } catch {
      return initial
    }
  })
  return [
    value,
    (v) => {
      setValue(v)
      try {
        localStorage.setItem(`highsea-proto:${key}`, v)
      } catch {}
    },
  ]
}

export function MoviesLibrary() {
  const [, navigate] = useLocation()
  const movies = useQuery('movies', (c) => c.movies.list(), ['item.updated', 'movies.updated'])
  const profiles = useQuery('quality-profiles', (c) => c.movies.qualityProfiles())
  const [view, setView] = useStored<'grid' | 'table'>('movies-view', 'grid')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('title')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)

  const bulkUpdate = useAction((c, ids: string[], patch: Partial<MediaItem>) =>
    c.movies.bulkUpdate(ids, patch),
  )
  const bulkProfile = useAction((c, ids: string[], profileId: string) =>
    c.movies.bulkSetQualityProfile(ids, profileId),
  )
  const bulkSearch = useAction((c, ids: string[]) => c.movies.bulkSearch(ids))
  const bulkDelete = useAction((c, ids: string[]) => c.movies.bulkDelete(ids, false))

  const all = movies.data ?? []
  const counts = Object.fromEntries(
    Object.entries(filters).map(([k, f]) => [k, all.filter((m) => f.match(m.status)).length]),
  ) as Record<Filter, number>
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return all
      .filter((m) => filters[filter].match(m.status))
      .filter((m) => !q || m.title.toLowerCase().includes(q) || String(m.year).includes(q))
      .sort(sorts[sort].compare)
  }, [all, filter, text, sort])

  const ids = [...selected].filter((id) => all.some((m) => m.id === id))
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }
  const everyShown = shown.length > 0 && shown.every((m) => selected.has(m.id))

  const bulk = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run()
      toast.success(label)
      setSelected(new Set())
    } catch (e) {
      toast.error('That didn’t work', { description: (e as Error).message })
    }
  }
  const plural = (n: number) => `${n} ${n === 1 ? 'movie' : 'movies'}`

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
      <Button variant="primary" icon="add" onClick={() => navigate('/discover')}>
        Add movie
      </Button>
    </>
  )

  return (
    <AdminPage title="Movies" actions={actions}>
      <Loadable
        query={movies}
        what="the library"
        skeleton={view === 'grid' ? <PosterSkeletons /> : undefined}
      >
        {() =>
          all.length === 0 ? (
            <EmptyState
              icon="movie"
              title="No movies yet"
              action={
                <Button variant="primary" icon="discover" onClick={() => navigate('/discover')}>
                  Discover movies
                </Button>
              }
            >
              Add a movie and highsea finds a release, downloads it and files it here.
            </EmptyState>
          ) : (
            <TableFrame>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TableToolbar>
                  <TabsList aria-label="Filter by status" className="max-w-full overflow-x-auto">
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
                      aria-label="Filter by title"
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
                              bulkUpdate.run(ids, { monitored: true }),
                            )
                          }
                        >
                          Monitor
                        </MenuItem>
                        <MenuItem
                          icon="close"
                          onSelect={() =>
                            bulk(`${plural(ids.length)} no longer monitored`, () =>
                              bulkUpdate.run(ids, { monitored: false }),
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
                                bulkProfile.run(ids, p.id),
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
                      No movies match. Try another filter.
                    </p>
                  ) : view === 'grid' ? (
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5 p-3.5">
                      {shown.map((m) => (
                        <li key={m.id}>
                          <Poster
                            title={m.title}
                            src={m.art.poster}
                            href={adminHref(`/movies/${m.id}`)}
                            quality={m.quality}
                            status={
                              m.status !== 'available' && (
                                <Badge
                                  overlay
                                  tone={movieStatus[m.status].tone}
                                  className="max-w-full"
                                >
                                  <span className="truncate">{movieStatus[m.status].label}</span>
                                </Badge>
                              )
                            }
                            showTitle
                            caption={m.year}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              aria-label="Select every movie shown"
                              checked={everyShown}
                              onCheckedChange={(v) =>
                                setSelected(
                                  v === true ? new Set(shown.map((m) => m.id)) : new Set(),
                                )
                              }
                            />
                          </TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead numeric>Year</TableHead>
                          <TableHead>Versions</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Monitored</TableHead>
                          <TableHead numeric>Added</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shown.map((m) => (
                          <TableRow
                            key={m.id}
                            data-state={selected.has(m.id) ? 'selected' : undefined}
                          >
                            <TableCell>
                              <Checkbox
                                aria-label={`Select ${m.title}`}
                                checked={selected.has(m.id)}
                                onCheckedChange={(v) => toggle(m.id, v === true)}
                              />
                            </TableCell>
                            <TitleCell
                              title={
                                <a href={adminHref(`/movies/${m.id}`)} className="hover:underline">
                                  {m.title}
                                </a>
                              }
                              detail={m.path}
                              art={m.art.poster}
                            />
                            <TableCell numeric>{m.year}</TableCell>
                            <TableCell>
                              <span className="flex gap-1">
                                {m.versions.map((v) => (
                                  <QualityTag key={v.id}>{v.label}</QualityTag>
                                ))}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge tone={movieStatus[m.status].tone}>
                                {movieStatus[m.status].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-text-2">
                              {m.monitored ? 'Yes' : 'No'}
                            </TableCell>
                            <TableCell numeric>{shortDate(m.addedAt)}</TableCell>
                          </TableRow>
                        ))}
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
        onConfirm={() => bulk(`${plural(ids.length)} removed`, () => bulkDelete.run(ids))}
      />
    </AdminPage>
  )
}
