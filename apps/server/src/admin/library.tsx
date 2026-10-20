'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A5 Movies library (docs/product/movies.md#library-a5), ported from the prototype. Grid or table
// in one frame, status tabs with counts, a title filter and a sort. The table selects rows for
// bulk edit: monitor, quality profile, search and remove. A movie with two versions (1080p beside
// 4K HDR) is one row with a tag for each.
//
// What real data changes:
// - the library is paged on the server (cursor paging, phase-3-server.md › Paging and sorting):
//   the tab counts come with each page, and Show more under the frame loads the next 60;
// - the status tab, title filter and sort live in the address, so Back keeps them;
// - the statuses are the server's (available, wanted, downloading, not released, not monitored);
// - the grid has no quality tags on the art until files exist (checkpoint 6);
// - bulk Search is shown but disabled until indexers exist (checkpoint 4 plan, decision 2).
import {
  type BulkInput,
  MOVIE_SORTS,
  type MoviePage,
  type MovieStatus,
} from '@highsea/api-contract'
import { shortDate } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
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
  Tooltip,
  toast,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import { useDeferredValue, useRef, useState, useSyncExternalStore } from 'react'
import { useAddressParam } from './address.ts'
import { library as messages } from './library-messages.ts'
import { Loadable, PosterSkeletons } from './loadable.tsx'
import { moviePath, movieStatus } from './media-links.ts'
import { type LibraryFilters, loadMovies, PAGE } from './movie-data.ts'
import { AdminPage } from './shell.tsx'

/** The tabs movies.md lists. Not monitored movies show under All. */
const TABS = ['all', 'available', 'wanted', 'downloading', 'not-released'] as const satisfies (
  | 'all'
  | MovieStatus
)[]
type Tab = (typeof TABS)[number]
type Sort = (typeof MOVIE_SORTS)[number]

/** Grid or table, remembered per browser (movies.md › Library). */
const VIEW_KEY = 'highsea:movies-view'
const viewListeners = new Set<() => void>()
/** For this page's life when storage is blocked (a private window, cleared site data). */
let unstoredView: 'grid' | 'table' = 'grid'

function readView(): 'grid' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid'
  } catch {
    return unstoredView
  }
}

/**
 * The stored view as an external store: the server, and hydration, render the grid, and React
 * re-renders with the stored view once hydrated, without a mismatch (react.dev, useSyncExternalStore
 * › "Adding support for server rendering": getServerSnapshot is used during hydration).
 */
function useStoredView(): ['grid' | 'table', (v: 'grid' | 'table') => void] {
  const value = useSyncExternalStore(
    (l) => {
      viewListeners.add(l)
      return () => viewListeners.delete(l)
    },
    readView,
    () => 'grid' as const,
  )
  return [
    value,
    (v) => {
      unstoredView = v
      try {
        localStorage.setItem(VIEW_KEY, v)
      } catch {}
      for (const l of viewListeners) l()
    },
  ]
}

export function MoviesLibrary() {
  const t = useT(messages)
  const locale = useLocale()
  const router = useRouter()
  const [view, setView] = useStoredView()
  const [tab, setTab] = useAddressParam<Tab>('status', 'all', TABS)
  const [sort, setSort] = useAddressParam<Sort>('sort', 'title', MOVIE_SORTS)
  const [text, setText] = useAddressParam<string>('title', '')
  const title = useDeferredValue(text.trim())
  const filters: LibraryFilters = {
    status: tab === 'all' ? undefined : (tab as MovieStatus),
    title: title || undefined,
    sort,
  }
  const filterKey = `${tab}:${sort}:${title}`
  const [more, setMore] = useState({ filterKey, count: PAGE })
  const count = more.filterKey === filterKey ? more.count : PAGE
  const movies = useQuery(`movies:${filterKey}:${count}`, (c) => loadMovies(c, filters, count), [
    'movies.updated',
  ])
  // Show more keeps what's on screen while the longer list loads
  const last = useRef<{ filterKey: string; data: MoviePage } | null>(null)
  if (movies.status === 'success') last.current = { filterKey, data: movies.data }
  const kept =
    movies.status === 'loading' && last.current?.filterKey === filterKey
      ? last.current.data
      : undefined
  const shownQuery = kept
    ? { status: 'success' as const, data: kept, error: undefined, refetch: movies.refetch }
    : movies

  const profiles = useQuery('quality-profiles', (c) => c.quality.profiles())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const bulkAction = useAction((c, body: BulkInput) => c.movies.bulk({ body }))

  // selection survives filtering; the bar counts every movie still selected
  const ids = [...selected]
  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  const bulk = async (done: (n: number) => string, body: BulkInput) => {
    try {
      const result = await bulkAction.run(body)
      toast.success(done(result.ids.length))
      setSelected(new Set())
    } catch (e) {
      toast.error(t('failed'), { description: (e as Error).message })
    }
  }

  const actions = (
    <>
      <SegmentedControl
        aria-label={t('view')}
        size="sm"
        value={view}
        onValueChange={(v) => setView(v as typeof view)}
        options={[
          { value: 'grid', label: t('view.grid'), icon: 'grid' },
          { value: 'table', label: t('view.table'), icon: 'list' },
        ]}
      />
      <Button variant="primary" icon="add" onClick={() => router.push('/discover')}>
        {t('add')}
      </Button>
    </>
  )

  return (
    <AdminPage title={t('title')} actions={actions}>
      <Loadable
        query={shownQuery}
        what={t('what')}
        skeleton={view === 'grid' ? <PosterSkeletons /> : undefined}
      >
        {(page) => {
          const shown = page.items
          const everyShown = shown.length > 0 && shown.every((m) => selected.has(m.id))
          return page.counts.all === 0 && !title ? (
            <EmptyState
              icon="movie"
              title={t('empty.title')}
              action={
                <Button variant="primary" icon="discover" onClick={() => router.push('/discover')}>
                  {t('empty.discover')}
                </Button>
              }
            >
              {t('empty.body')}
            </EmptyState>
          ) : (
            <>
              <TableFrame>
                <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
                  <TableToolbar>
                    <TabsList aria-label={t('tabs')} className="max-w-full overflow-x-auto">
                      {TABS.map((k) => (
                        <TabsTrigger key={k} value={k} count={page.counts[k]}>
                          {t(`tab.${k}`)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <div className="ms-auto flex min-w-0 flex-wrap items-center gap-2">
                      <Input
                        type="search"
                        icon="filter"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={t('filter')}
                        aria-label={t('filter')}
                        className="w-48"
                      />
                      <Select
                        value={sort}
                        onValueChange={(v) => setSort(v as Sort)}
                        aria-label={t('sortBy')}
                        options={MOVIE_SORTS.map((k) => ({ value: k, label: t(`sort.${k}`) }))}
                        className="w-36"
                      />
                    </div>
                  </TableToolbar>
                  {ids.length > 0 && (
                    <div
                      role="toolbar"
                      aria-label={t('bulk')}
                      className="flex flex-wrap items-center gap-2 border-line border-b bg-accent-soft px-3.5 py-2 text-ui"
                    >
                      <span className="me-auto font-medium text-text">
                        {t('selected', { count: ids.length })}
                      </span>
                      {/* decision 2: shown but inert until checkpoint 5 brings indexers. aria-disabled
                        rather than disabled keeps it focusable, so the tooltip saying why is
                        reachable (the prototype's kit/soon.tsx pattern; WAI-ARIA APG, "Focusability
                        of disabled controls") */}
                      <Tooltip content={t('search.noIndexers')}>
                        <Button
                          size="sm"
                          icon="search"
                          aria-disabled
                          className="cursor-not-allowed opacity-45"
                        >
                          {t('search')}
                        </Button>
                      </Tooltip>
                      <Menu>
                        <MenuTrigger asChild>
                          <Button size="sm" iconEnd="chevron-down" loading={bulkAction.pending}>
                            {t('edit')}
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            icon="bookmark"
                            onSelect={() =>
                              bulk((count) => t('done.monitor', { count }), {
                                action: 'monitor',
                                ids,
                              })
                            }
                          >
                            {t('monitor')}
                          </MenuItem>
                          <MenuItem
                            icon="close"
                            onSelect={() =>
                              bulk((count) => t('done.unmonitor', { count }), {
                                action: 'unmonitor',
                                ids,
                              })
                            }
                          >
                            {t('unmonitor')}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuLabel>{t('qualityProfile')}</MenuLabel>
                          {(profiles.data ?? []).map((p) => (
                            <MenuItem
                              key={p.id}
                              onSelect={() =>
                                bulk((count) => t('done.profile', { count, profile: p.name }), {
                                  action: 'setQualityProfile',
                                  ids,
                                  qualityProfileId: p.id,
                                })
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
                        {t('remove')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                        {t('clear')}
                      </Button>
                    </div>
                  )}
                  <TabsContent value={tab}>
                    {shown.length === 0 ? (
                      <p className="px-3.5 py-8 text-center text-caption text-text-3">
                        {t('noMatch')}
                      </p>
                    ) : view === 'grid' ? (
                      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5 p-3.5">
                        {shown.map((m) => (
                          <li key={m.id}>
                            <Poster
                              title={m.title}
                              src={m.art.poster ?? undefined}
                              href={moviePath(m.id)}
                              status={
                                m.status !== 'available' && (
                                  <Badge
                                    overlay
                                    tone={movieStatus[m.status].tone}
                                    className="max-w-full"
                                  >
                                    <span className="truncate">
                                      {t(movieStatus[m.status].label)}
                                    </span>
                                  </Badge>
                                )
                              }
                              showTitle
                              caption={m.year ?? undefined}
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
                                aria-label={t('col.selectAll')}
                                checked={everyShown}
                                onCheckedChange={(v) => {
                                  const next = new Set(selected)
                                  for (const m of shown)
                                    if (v === true) next.add(m.id)
                                    else next.delete(m.id)
                                  setSelected(next)
                                }}
                              />
                            </TableHead>
                            <TableHead>{t('col.title')}</TableHead>
                            <TableHead numeric>{t('col.year')}</TableHead>
                            <TableHead>{t('col.versions')}</TableHead>
                            <TableHead>{t('col.status')}</TableHead>
                            <TableHead>{t('col.monitored')}</TableHead>
                            <TableHead numeric>{t('col.added')}</TableHead>
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
                                  aria-label={t('col.select', { title: m.title })}
                                  checked={selected.has(m.id)}
                                  onCheckedChange={(v) => toggle(m.id, v === true)}
                                />
                              </TableCell>
                              <TitleCell
                                title={
                                  <a href={moviePath(m.id)} className="hover:underline">
                                    {m.title}
                                  </a>
                                }
                                detail={m.path}
                                art={m.art.poster ?? undefined}
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
                                  {t(movieStatus[m.status].label)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-text-2">
                                {m.monitored ? t('yes') : t('no')}
                              </TableCell>
                              <TableCell numeric>
                                {shortDate(m.addedAt, locale === 'en' ? undefined : locale)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                </Tabs>
              </TableFrame>
              {page.next && (
                <Button
                  className="justify-self-center"
                  loading={Boolean(kept)}
                  onClick={() => setMore({ filterKey, count: shown.length + PAGE })}
                >
                  {t('more')}
                </Button>
              )}
            </>
          )
        }}
      </Loadable>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('confirm.title', { count: ids.length })}
        description={t('confirm.body')}
        confirmLabel={t('remove')}
        destructive
        onConfirm={() => bulk((count) => t('done.remove', { count }), { action: 'delete', ids })}
      />
    </AdminPage>
  )
}
