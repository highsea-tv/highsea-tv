'use client'
import type { Series, SeriesUpdate } from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
// SPDX-License-Identifier: AGPL-3.0-only
// Shows (docs/product/shows.md#library), moved from the prototype with D3 of the one client
// platform (one-client-platform-d.md, answer 5) and laid out as Movies is: grid or table, a
// filter, a text filter and a sort, from Sonarr's series index. Each show has its monitored state,
// its episodes (how many of the monitored, aired ones have a file), the next to air, its network,
// size and whether it's still airing. The table selects rows for bulk edit, as Movies' does.
//
// Drawn only when the server serves shows (`Served`, serves.tsx): the routes are drafts the mock
// answers and the server answers 501. The drafts have no bulk route, so the bulk bar edits,
// searches and removes each show in turn, as the prototype did.
import { admin, line } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Menu,
  type MenuOption,
  Poster,
  ProgressBar,
  SearchField,
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
  Text,
  TitleCell,
  TitleLink,
  toast,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ComponentRef, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { View } from 'react-native'
import { Loadable, PosterSkeletons } from './loadable.tsx'
import { GridItem, PosterGrid } from './media-sections.tsx'
import { Served } from './serves.tsx'
import { AdminPage } from './shell.tsx'
import { airDate, episodesShare, episodesTone, missing, showPath, showState } from './show-data.ts'
import { shows as messages } from './shows-messages.ts'

export const SHOWS_TOPICS = ['shows.updated']

const FILTERS = ['all', 'missing', 'airing', 'ended', 'unmonitored'] as const
type Filter = (typeof FILTERS)[number]
const matches: Record<Filter, (s: Series) => boolean> = {
  all: () => true,
  missing: (s) => s.monitored && missing(s) > 0,
  airing: (s) => s.airing,
  ended: (s) => !s.airing,
  unmonitored: (s) => !s.monitored,
}

const SORTS = ['title', 'added', 'next', 'year', 'size'] as const
type Sort = (typeof SORTS)[number]
const compare: Record<Sort, (a: Series, b: Series) => number> = {
  title: (a, b) => a.sortTitle.localeCompare(b.sortTitle),
  added: (a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt),
  // the soonest first, then the shows with nothing to come, by title
  next: (a, b) =>
    (a.nextAiring?.aired ?? '9999').localeCompare(b.nextAiring?.aired ?? '9999') ||
    a.sortTitle.localeCompare(b.sortTitle),
  year: (a, b) => b.year - a.year,
  size: (a, b) => b.size - a.size,
}

/** Grid or table, remembered per browser, as Movies' view is (library.tsx). */
const VIEW_KEY = 'highsea:shows-view'
const viewListeners = new Set<() => void>()
let unstoredView: 'grid' | 'table' = 'grid'
function readView(): 'grid' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid'
  } catch {
    return unstoredView
  }
}
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

/** `/shows`. */
export function ShowsLibrary() {
  return (
    <Served source="shows">
      <Library />
    </Served>
  )
}

function Library() {
  const t = useT(messages)
  const locale = useLocale()
  const { colors } = useTheme()
  const shows = useQuery('admin-shows', (c) => c.series.list(), SHOWS_TOPICS)
  const profiles = useQuery('quality-profiles', (c) => c.quality.profiles())
  const [view, setView] = useStoredView()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('title')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const editAnchor = useRef<ComponentRef<typeof View>>(null)
  const [editing, setEditing] = useState(false)

  // no bulk route in the drafts: each one, in turn
  const bulkEdit = useAction(async (c, ids: string[], body: SeriesUpdate) => {
    for (const id of ids) await c.series.update({ params: { id }, body })
  })
  const bulkSearch = useAction(async (c, ids: string[]) => {
    for (const id of ids) await c.series.search({ params: { id }, body: {} })
  })
  const bulkRemove = useAction(async (c, ids: string[]) => {
    for (const id of ids) await c.series.remove({ params: { id }, query: {} })
  })

  const all = shows.data ?? []
  const counts = Object.fromEntries(
    FILTERS.map((k) => [k, all.filter(matches[k]).length]),
  ) as Record<Filter, number>
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return all
      .filter(matches[filter])
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.network.toLowerCase().includes(q) ||
          String(s.year).includes(q),
      )
      .sort(compare[sort])
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
      toast.error(t('failed'), { description: (e as Error).message })
    }
  }
  const count = ids.length

  const editItems: MenuOption[] = [
    {
      label: t('monitor'),
      icon: 'bookmark',
      onSelect: () =>
        bulk(t('done.monitor', { count }), () => bulkEdit.run(ids, { monitored: true })),
    },
    {
      label: t('unmonitor'),
      icon: 'close',
      onSelect: () =>
        bulk(t('done.unmonitor', { count }), () => bulkEdit.run(ids, { monitored: false })),
    },
    ...(profiles.data ?? []).map((p) => ({
      label: p.name,
      group: t('qualityProfile'),
      onSelect: () =>
        bulk(t('done.profile', { count, profile: p.name }), () =>
          bulkEdit.run(ids, { qualityProfileId: p.id }),
        ),
    })),
  ]

  const actions = (
    <>
      <SegmentedControl
        aria-label={t('view')}
        value={view}
        onValueChange={(v) => setView(v as typeof view)}
        options={[
          { value: 'grid', label: t('view.grid'), icon: 'grid' },
          { value: 'table', label: t('view.table'), icon: 'list' },
        ]}
      />
      <Button variant="primary" icon="add" href="/discover/shows">
        {t('add')}
      </Button>
    </>
  )

  return (
    <AdminPage title={t('title')} actions={actions}>
      <Loadable
        query={shows}
        what={t('what')}
        skeleton={view === 'grid' ? <PosterSkeletons /> : undefined}
      >
        {() =>
          all.length === 0 ? (
            <EmptyState
              icon="tv"
              title={t('empty.title')}
              action={
                <Button variant="primary" icon="discover" href="/discover/shows">
                  {t('empty.discover')}
                </Button>
              }
            >
              {t('empty.body')}
            </EmptyState>
          ) : (
            <TableFrame>
              <TableToolbar>
                <Tabs
                  aria-label={t('filters')}
                  value={filter}
                  onValueChange={(v) => setFilter(v as Filter)}
                  options={FILTERS.map((k) => ({
                    value: k,
                    label: t(`filter.${k}`),
                    count: counts[k],
                  }))}
                />
                <View
                  style={{
                    marginStart: 'auto',
                    minWidth: 0,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: tokens.space['2'],
                  }}
                >
                  <View style={{ width: FILTER_WIDTH }}>
                    <SearchField
                      label={t('filter.label')}
                      icon="filter"
                      value={text}
                      onChangeText={setText}
                      placeholder={t('filter')}
                    />
                  </View>
                  <View style={{ width: SELECT_WIDTH }}>
                    <Select
                      value={sort}
                      onValueChange={(v) => setSort(v as Sort)}
                      aria-label={t('sortBy')}
                      options={SORTS.map((k) => ({ value: k, label: t(`sort.${k}`) }))}
                    />
                  </View>
                </View>
              </TableToolbar>
              {count > 0 && (
                <View
                  role="toolbar"
                  aria-label={t('bulk')}
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: tokens.space['2'],
                    borderBottomWidth: line.thin,
                    borderBottomColor: colors.line,
                    backgroundColor: colors['accent-soft'],
                    paddingHorizontal: CELL_X,
                    paddingVertical: tokens.space['2'],
                  }}
                >
                  <Text size={tokens.adminText.ui.size} weight={500} style={{ marginEnd: 'auto' }}>
                    {t('selected', { count })}
                  </Text>
                  <Button
                    size="sm"
                    icon="search"
                    loading={bulkSearch.pending}
                    onPress={() => bulk(t('done.search', { count }), () => bulkSearch.run(ids))}
                  >
                    {t('search')}
                  </Button>
                  <Button
                    ref={editAnchor}
                    size="sm"
                    iconEnd="chevron-down"
                    loading={bulkEdit.pending}
                    hasPopup="menu"
                    accessibilityState={{ expanded: editing }}
                    onPress={() => setEditing(true)}
                  >
                    {t('edit')}
                  </Button>
                  <Menu
                    title={t('edit')}
                    open={editing}
                    onClose={() => setEditing(false)}
                    anchor={editAnchor}
                    items={editItems}
                  />
                  <Button size="sm" variant="danger" icon="delete" onPress={() => setConfirm(true)}>
                    {t('remove')}
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => setSelected(new Set())}>
                    {t('clear')}
                  </Button>
                </View>
              )}
              {shown.length === 0 ? (
                <View style={{ paddingHorizontal: CELL_X, paddingVertical: tokens.space['8'] }}>
                  <Text variant="caption" color="text-3" align="center">
                    {t('noMatch')}
                  </Text>
                </View>
              ) : view === 'grid' ? (
                <View style={{ padding: CELL_X }}>
                  <PosterGrid>
                    {shown.map((s) => (
                      <GridTile key={s.id} show={s} />
                    ))}
                  </PosterGrid>
                </View>
              ) : (
                <Table label={t('title')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead width={admin.table.checkColumn}>
                        <Checkbox
                          label={t('col.selectAll')}
                          hideLabel
                          checked={everyShown}
                          onCheckedChange={(on) =>
                            setSelected(on ? new Set(shown.map((s) => s.id)) : new Set())
                          }
                        />
                      </TableHead>
                      <TableHead>{t('col.title')}</TableHead>
                      <TableHead>{t('col.network')}</TableHead>
                      <TableHead>{t('col.status')}</TableHead>
                      <TableHead numeric>{t('col.seasons')}</TableHead>
                      <TableHead width={EPISODES_WIDTH}>{t('col.episodes')}</TableHead>
                      <TableHead>{t('col.next')}</TableHead>
                      <TableHead numeric>{t('col.size')}</TableHead>
                      <TableHead>{t('col.monitored')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((s) => {
                      const state = showState(s)
                      const line = t('episodesLine', s.episodes)
                      return (
                        <TableRow key={s.id} selected={selected.has(s.id)}>
                          <TableCell tall>
                            <Checkbox
                              label={t('col.select', { title: s.title })}
                              hideLabel
                              checked={selected.has(s.id)}
                              onCheckedChange={(on) => toggle(s.id, on)}
                            />
                          </TableCell>
                          <TableCell tall truncate>
                            <TitleCell
                              title={<TitleLink href={showPath(s.id)}>{s.title}</TitleLink>}
                              detail={s.path}
                              art={s.art.poster}
                            />
                          </TableCell>
                          <TableCell tall>
                            <Text size={tokens.adminText.ui.size} color="text-2">
                              {s.network || t('none')}
                            </Text>
                          </TableCell>
                          <TableCell tall>
                            <Badge tone={state.tone}>{t(state.label)}</Badge>
                          </TableCell>
                          <TableCell tall numeric>
                            {String(s.seasons)}
                          </TableCell>
                          <TableCell tall>
                            <View style={{ gap: tokens.space['1'] }}>
                              <Text
                                size={tokens.adminText.figure.size}
                                leading={tokens.adminText.figure.leading}
                                mono
                                color="text-2"
                              >
                                {line}
                              </Text>
                              <ProgressBar
                                value={episodesShare(s)}
                                tone={episodesTone(s)}
                                look="panel"
                                label={t('episodes.label', { title: s.title, ...s.episodes })}
                              />
                            </View>
                          </TableCell>
                          <TableCell tall>
                            {s.nextAiring ? (
                              <View>
                                <Text size={tokens.adminText.ui.size}>
                                  {airDate(s.nextAiring.aired, locale)}
                                </Text>
                                <Text
                                  size={tokens.adminText.release.size}
                                  leading={tokens.adminText.release.leading}
                                  mono
                                  color="text-3"
                                >
                                  {s.nextAiring.code}
                                </Text>
                              </View>
                            ) : (
                              <Text size={tokens.adminText.ui.size} color="text-3">
                                {t('none')}
                              </Text>
                            )}
                          </TableCell>
                          <TableCell tall numeric>
                            {bytes(s.size)}
                          </TableCell>
                          <TableCell tall>
                            <Text size={tokens.adminText.ui.size} color="text-2">
                              {s.monitored ? t('yes') : t('no')}
                            </Text>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </TableFrame>
          )
        }
      </Loadable>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('confirm.title', { count })}
        description={t('confirm.body')}
        confirmLabel={t('remove')}
        destructive
        onConfirm={() => bulk(t('done.remove', { count }), () => bulkRemove.run(ids))}
      />
    </AdminPage>
  )
}

/** A show in the grid: its poster with a badge when it needs a look, its year and episodes, and the bar. */
function GridTile({ show: s }: { show: Series }) {
  const t = useT(messages)
  const n = missing(s)
  const art = !s.monitored
    ? { label: t('art.unmonitored'), tone: 'neutral' as const }
    : n > 0
      ? { label: t('art.missing', { count: n }), tone: 'warning' as const }
      : null
  const line = t('episodesLine', s.episodes)
  return (
    <GridItem gap={tokens.space['2']}>
      <View>
        <Poster
          title={s.title}
          src={s.art.poster}
          href={showPath(s.id)}
          status={
            art ? (
              <Badge overlay tone={art.tone}>
                {art.label}
              </Badge>
            ) : undefined
          }
          showTitle
          titleSize="ui"
        />
        {/* the caption: the year and the episodes in mono, which a Poster's string caption can't hold */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: tokens.space['1'],
            marginTop: tokens.space['0.5'],
            minWidth: 0,
          }}
        >
          <Text variant="caption" color="text-3">
            {String(s.year)}
          </Text>
          <Text variant="caption" color="text-3" aria-hidden>
            ·
          </Text>
          <Text variant="caption" color="text-3" mono numberOfLines={1}>
            {line}
          </Text>
        </View>
      </View>
      <ProgressBar
        value={episodesShare(s)}
        tone={episodesTone(s)}
        look="panel"
        label={t('episodes.label', { title: s.title, ...s.episodes })}
      />
    </GridItem>
  )
}

/** A table cell's side padding (the web's px-3.5), which the toolbars and the grid share. */
const CELL_X = admin.table.cellX
/** The title filter's width (the web's w-48), the sort's (w-36) and the episodes column's (w-36). */
const FILTER_WIDTH = admin.filterWidth
const SELECT_WIDTH = admin.selectWidth
const EPISODES_WIDTH = admin.showsLibrary.episodesWidth
