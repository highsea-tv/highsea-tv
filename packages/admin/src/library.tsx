'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A5 Movies library (docs/product/movies.md#library-a5), ported from the prototype. Grid or table
// in one frame, status tabs with counts, a title filter and a sort. The table selects rows for
// bulk edit: monitor, quality profile, subtitle languages (checkpoint 7a), search and remove. A movie with two versions (1080p beside
// 4K HDR) is one row with a tag for each.
//
// What real data changes:
// - the library is paged on the server (cursor paging, phase-3-server.md › Paging and sorting):
//   the tab counts come with each page, and Show more under the frame loads the next 60;
// - the status tab, title filter and sort live in the address, so Back keeps them;
// - checkpoint 8c adds a tag filter (in the address too, shown once a tag exists) and Add a tag
//   and Remove a tag to bulk edit (Radarr's Movie Editor tags: wiki.servarr.com/radarr/movies);
// - the statuses are the server's (available, wanted, downloading, not released, not monitored);
// - the grid has no quality tags on the art until files exist (checkpoint 6);
// - Save as smart collection (checkpoint 8d) carries the tag filter into the rules too;
// - bulk Search is shown but disabled while no indexer is enabled (checkpoint 4 plan, decision 2);
//   with one, it queues a search for each movie (checkpoint 5).
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).
import {
  type BulkInput,
  LIST_TOPICS,
  MOVIE_SORTS,
  type MoviePage,
  type MovieStatus,
  type RuleCondition,
} from '@highsea-tv/api-contract'
import { shortDate } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Menu,
  type MenuOption,
  Poster,
  QualityTag,
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
  Tooltip,
  toast,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ComponentRef, useDeferredValue, useRef, useState, useSyncExternalStore } from 'react'
import { View } from 'react-native'
import { useAddressParam } from './address.ts'
import { handoff } from './collections-editor.tsx'
import { ruleId } from './collections-rules.tsx'
import { useSearchable } from './indexer-state.ts'
import { library as messages } from './library-messages.ts'
import { Loadable, PosterSkeletons } from './loadable.tsx'
import { moviePath, movieStatus } from './media-links.ts'
import { GridItem, PosterGrid } from './media-sections.tsx'
import { type LibraryFilters, loadMovies, PAGE } from './movie-data.ts'
import { useRouter } from './navigation.tsx'
import { AdminPage } from './shell.tsx'
import { useTags } from './tag-picker.tsx'

/** The tabs movies.md lists. Not monitored movies show under All. */
const TABS = ['all', 'available', 'wanted', 'downloading', 'not-released'] as const satisfies (
  | 'all'
  | MovieStatus
)[]
type Tab = (typeof TABS)[number]
type Sort = (typeof MOVIE_SORTS)[number]
/** The tag filter's "any" choice: Select needs a value that isn't empty. */
const ANY_TAG = 'any'

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
  const [tag, setTag] = useAddressParam<string>('tag', '')
  const tags = useTags()
  const title = useDeferredValue(text.trim())
  const filters: LibraryFilters = {
    status: tab === 'all' ? undefined : (tab as MovieStatus),
    title: title || undefined,
    tag: tag || undefined,
    sort,
  }
  const filterKey = `${tab}:${sort}:${title}:${tag}`
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
    ? {
        status: 'success' as const,
        data: kept,
        error: undefined,
        refetch: movies.refetch,
        refresh: movies.refresh,
      }
    : movies

  const profiles = useQuery('quality-profiles', (c) => c.quality.profiles())
  const languageProfiles = useQuery('language-profiles', (c) => c.subtitles.languageProfiles(), [
    'subtitles.updated',
  ])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [exclude, setExclude] = useState(false)
  // "Don't add them again" only means something once a list exists (checkpoint 8a)
  const lists = useQuery('import-lists', (c) => c.importLists.list(), [LIST_TOPICS.lists])
  const hasLists = (lists.data?.length ?? 0) > 0
  const bulkAction = useAction((c, body: BulkInput) => c.movies.bulk({ body }))
  const searchable = useSearchable()
  const { colors } = useTheme()
  const editAnchor = useRef<ComponentRef<typeof View>>(null)
  const [editing, setEditing] = useState(false)

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

  /** A new smart collection that starts from this tab, text, tag and sort (checkpoint 8d). */
  const saveAsCollection = () => {
    const when = (
      field: RuleCondition['field'],
      op: RuleCondition['op'],
      value: RuleCondition['value'],
    ): RuleCondition => ({ kind: 'condition', id: ruleId('c'), field, op, value })
    const q = text.trim()
    handoff.draft = {
      rules: {
        kind: 'group',
        id: ruleId('g'),
        match: 'all',
        rules: [
          ...(tab === 'all' ? [] : [when('status', 'is', tab)]),
          ...(!q
            ? []
            : /^\d{4}$/.test(q)
              ? [when('year', 'is', Number(q))]
              : [when('title', 'contains', q)]),
          ...(tag ? [when('tag', 'anyOf', [tag])] : []),
        ],
      },
      sort,
      descending: sort !== 'title',
    }
    router.push('/collections/new')
  }

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
      <Button variant="primary" icon="add" href="/discover">
        {t('add')}
      </Button>
    </>
  )

  const hasTags = (tags.data?.length ?? 0) > 0
  // the bulk Edit menu: Monitor and Unmonitor, then a heading over each set of choices
  const editItems: MenuOption[] = [
    {
      label: t('monitor'),
      icon: 'bookmark',
      onSelect: () => bulk((count) => t('done.monitor', { count }), { action: 'monitor', ids }),
    },
    {
      label: t('unmonitor'),
      icon: 'close',
      onSelect: () => bulk((count) => t('done.unmonitor', { count }), { action: 'unmonitor', ids }),
    },
    ...(profiles.data ?? []).map((p) => ({
      label: p.name,
      group: t('qualityProfile'),
      onSelect: () =>
        bulk((count) => t('done.profile', { count, profile: p.name }), {
          action: 'setQualityProfile',
          ids,
          qualityProfileId: p.id,
        }),
    })),
    ...(languageProfiles.data ?? []).map((p) => ({
      label: p.name,
      group: t('subtitleLanguages'),
      onSelect: () =>
        bulk((count) => t('done.languages', { count, profile: p.name }), {
          action: 'setLanguageProfile',
          ids,
          languageProfileId: p.id,
        }),
    })),
    ...(hasTags
      ? (['add', 'remove'] as const).flatMap((mode) =>
          (tags.data ?? []).map((g) => ({
            label: g.label,
            group: t(mode === 'add' ? 'addTag' : 'removeTag'),
            onSelect: () =>
              bulk(
                (count) =>
                  t(mode === 'add' ? 'done.tagAdded' : 'done.tagRemoved', {
                    count,
                    tag: g.label,
                  }),
                { action: 'setTags', ids, tagIds: [g.id], mode },
              ),
          })),
        )
      : []),
  ]

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
                <Button variant="primary" icon="discover" href="/discover">
                  {t('empty.discover')}
                </Button>
              }
            >
              {t('empty.body')}
            </EmptyState>
          ) : (
            <>
              <TableFrame>
                <TableToolbar>
                  <Tabs
                    aria-label={t('tabs')}
                    value={tab}
                    onValueChange={(v) => setTab(v as Tab)}
                    options={TABS.map((k) => ({
                      value: k,
                      label: t(`tab.${k}`),
                      count: page.counts[k],
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
                        label={t('filter')}
                        icon="filter"
                        value={text}
                        onChangeText={setText}
                        placeholder={t('filter')}
                      />
                    </View>
                    {hasTags && (
                      <View style={{ width: SELECT_WIDTH }}>
                        <Select
                          value={tag || ANY_TAG}
                          onValueChange={(v) => setTag(v === ANY_TAG ? '' : v)}
                          aria-label={t('tag')}
                          options={[
                            { value: ANY_TAG, label: t('tag.all') },
                            ...(tags.data ?? []).map((g) => ({ value: g.id, label: g.label })),
                          ]}
                        />
                      </View>
                    )}
                    <View style={{ width: SELECT_WIDTH }}>
                      <Select
                        value={sort}
                        onValueChange={(v) => setSort(v as Sort)}
                        aria-label={t('sortBy')}
                        options={MOVIE_SORTS.map((k) => ({ value: k, label: t(`sort.${k}`) }))}
                      />
                    </View>
                    <Button icon="library" onPress={saveAsCollection}>
                      {t('saveAsCollection')}
                    </Button>
                  </View>
                </TableToolbar>
                {ids.length > 0 && (
                  <View
                    role="toolbar"
                    aria-label={t('bulk')}
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: tokens.space['2'],
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                      backgroundColor: colors['accent-soft'],
                      paddingHorizontal: CELL_X,
                      paddingVertical: tokens.space['2'],
                    }}
                  >
                    <Text
                      size={tokens.adminText.ui.size}
                      weight={500}
                      style={{ marginEnd: 'auto' }}
                    >
                      {t('selected', { count: ids.length })}
                    </Text>
                    {searchable.canSearch ? (
                      <Button
                        size="sm"
                        icon="search"
                        loading={bulkAction.pending}
                        onPress={() =>
                          bulk((count) => t('done.search', { count }), { action: 'search', ids })
                        }
                      >
                        {t('search')}
                      </Button>
                    ) : (
                      // decision 2: shown but inert while no indexer is enabled; the tooltip's
                      // wrapper takes focus, so the reason is reachable by keyboard (WAI-ARIA APG,
                      // "Focusability of disabled controls")
                      <Tooltip content={t('search.noIndexers')} focusable>
                        <Button size="sm" icon="search" disabled>
                          {t('search')}
                        </Button>
                      </Tooltip>
                    )}
                    <Button
                      ref={editAnchor}
                      size="sm"
                      iconEnd="chevron-down"
                      loading={bulkAction.pending}
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
                    <Button
                      size="sm"
                      variant="danger"
                      icon="delete"
                      onPress={() => setConfirm(true)}
                    >
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
                      {shown.map((m) => (
                        <GridItem key={m.id}>
                          <Poster
                            title={m.title}
                            src={m.art.poster ?? undefined}
                            href={moviePath(m.id)}
                            status={
                              m.status !== 'available' ? (
                                <Badge overlay tone={movieStatus[m.status].tone}>
                                  {t(movieStatus[m.status].label)}
                                </Badge>
                              ) : undefined
                            }
                            showTitle
                            titleSize="ui"
                            caption={m.year === null ? undefined : String(m.year)}
                          />
                        </GridItem>
                      ))}
                    </PosterGrid>
                  </View>
                ) : (
                  <Table label={t('title')}>
                    <TableHeader>
                      <TableRow>
                        <TableHead width={40}>
                          <Checkbox
                            label={t('col.selectAll')}
                            hideLabel
                            checked={everyShown}
                            onCheckedChange={(on) => {
                              const next = new Set(selected)
                              for (const m of shown)
                                if (on) next.add(m.id)
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
                        <TableRow key={m.id} selected={selected.has(m.id)}>
                          <TableCell tall>
                            <Checkbox
                              label={t('col.select', { title: m.title })}
                              hideLabel
                              checked={selected.has(m.id)}
                              onCheckedChange={(on) => toggle(m.id, on)}
                            />
                          </TableCell>
                          <TableCell tall>
                            <TitleCell
                              title={<TitleLink href={moviePath(m.id)}>{m.title}</TitleLink>}
                              detail={m.path}
                              art={m.art.poster ?? undefined}
                            />
                          </TableCell>
                          <TableCell tall numeric>
                            {m.year === null ? '' : String(m.year)}
                          </TableCell>
                          <TableCell tall>
                            <View style={{ flexDirection: 'row', gap: tokens.space['1'] }}>
                              {m.versions.map((v) => (
                                <QualityTag key={v.id} overlay={false}>
                                  {v.label}
                                </QualityTag>
                              ))}
                            </View>
                          </TableCell>
                          <TableCell tall>
                            <Badge tone={movieStatus[m.status].tone}>
                              {t(movieStatus[m.status].label)}
                            </Badge>
                          </TableCell>
                          <TableCell tall>
                            <Text size={tokens.adminText.ui.size} color="text-2">
                              {m.monitored ? t('yes') : t('no')}
                            </Text>
                          </TableCell>
                          <TableCell tall numeric>
                            {shortDate(m.addedAt, locale === 'en' ? undefined : locale)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TableFrame>
              {page.next && (
                <View style={{ alignItems: 'center' }}>
                  <Button
                    loading={Boolean(kept)}
                    onPress={() => setMore({ filterKey, count: shown.length + PAGE })}
                  >
                    {t('more')}
                  </Button>
                </View>
              )}
            </>
          )
        }}
      </Loadable>
      <ConfirmDialog
        open={confirm}
        onClose={() => {
          setConfirm(false)
          setExclude(false)
        }}
        title={t('confirm.title', { count: ids.length })}
        description={
          hasLists ? (
            <View style={{ gap: tokens.space['3'] }}>
              <Text
                size={tokens.adminText.form.size}
                leading={tokens.adminText.form.leading}
                color="text-2"
              >
                {t('confirm.body')}
              </Text>
              <Checkbox
                label={t('confirm.exclude')}
                checked={exclude}
                onCheckedChange={setExclude}
              />
            </View>
          ) : (
            t('confirm.body')
          )
        }
        confirmLabel={t('remove')}
        destructive
        onConfirm={() =>
          bulk((count) => t('done.remove', { count }), {
            action: 'delete',
            ids,
            ...(hasLists && exclude ? { exclude: true } : {}),
          })
        }
      />
    </AdminPage>
  )
}

/** A table cell's side padding (the web's px-3.5), which the toolbars and the grid share. */
const CELL_X = 14
/** The title filter's width (the web's w-48), and the tag and sort selects' (w-36). */
const FILTER_WIDTH = 192
const SELECT_WIDTH = 144
