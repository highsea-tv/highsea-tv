'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A6 Movie detail (docs/product/movies.md#movie-detail-a6, media-pages.md), ported from the
// prototype's movies/detail.tsx. One page at one address, `/movies/{tmdbId}`, whether the movie is
// in the library or not (ADR 0014, amended 2026-10-20). Not added: the summary, Overview and Cast
// and crew, with Add movie. Added, it gains the library layer in place: Search, Interactive search
// and More in the header; the status, a tag per version, the path and Monitored; In the queue and
// In the library; the Files, History and Search tabs. Drawn with the library's native renderer
// since D2 (one-client-platform-d.md).
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
} from '@highsea-tv/api-contract'
import { bytes, duration, percent, rate } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { admin, line } from '@highsea-tv/tokens'
import {
  Badge,
  type BadgeTone,
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Icon,
  type IconName,
  Input,
  Menu,
  Press,
  ProgressBar,
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
  Text,
  TitleCell,
  Tooltip,
  toast,
  tokens,
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { type ComponentRef, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
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
import { useRouter } from './navigation.tsx'
import { AdminNotFound } from './not-found.tsx'
import { AdminPage } from './shell.tsx'
import { useTabAddress } from './tabs.ts'
import { TagBadges, TagPicker, useTags } from './tag-picker.tsx'
import { tagsMessages } from './tags-messages.ts'
import { useRelative } from './time.ts'

export type MovieTab = 'overview' | 'cast' | 'files' | 'history' | 'search' | 'subtitles'
type Tab = MovieTab

const s = tokens.space
const UI = tokens.adminText.ui
const FIGURE = tokens.adminText.figure
const RELEASE = tokens.adminText.release
/** A tab's content under the tabs (the web's pt-5). */
const PANEL_TOP = s['5']

/** Where Discover finds a title by name: its search is kept in the address (movies.md). */
const discoverSearch = (title: string) => `/discover?q=${encodeURIComponent(title)}`

/** The route's id: TMDB ids are positive integers; anything else is an id TMDB doesn't know. */
export const parseTmdbId = (raw: string) => (/^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : null)

/** A section's heading in the title style. */
function Heading({ children }: { children: string }) {
  return (
    <Text variant="title" weight={600} role="heading" aria-level={2}>
      {children}
    </Text>
  )
}

/** A line in the caption style, `text-3` unless told. */
function Caption({
  children,
  color = 'text-3',
}: {
  children: ReactNode
  color?: 'text-3' | 'badge-danger'
}) {
  return (
    <Text variant="caption" color={color}>
      {children}
    </Text>
  )
}

/** A dialog's or form's error, read out as it appears. */
function FormError({ children }: { children: string }) {
  return (
    <Text variant="caption" color="badge-danger" role="alert">
      {children}
    </Text>
  )
}

/** The web's TitleCell is a cell of its own: here the library's TitleCell inside a tall cell. */
function TitleTd({ title, detail }: { title: string; detail?: string | null }) {
  return (
    <TableCell tall truncate>
      <TitleCell title={title} detail={detail ?? undefined} />
    </TableCell>
  )
}

/** A page's tabs as a line under its title, and the chosen tab's content under them. */
function PageTabs({
  label,
  tab,
  onTab,
  options,
  children,
}: {
  label: string
  tab: Tab
  onTab: (tab: Tab) => void
  options: { value: Tab; label: string }[]
  children: ReactNode
}) {
  return (
    <View>
      <Tabs<Tab>
        variant="line"
        aria-label={label}
        options={options}
        value={tab}
        onValueChange={onTab}
      />
      <View
        role="tabpanel"
        aria-label={options.find((o) => o.value === tab)?.label}
        style={{ paddingTop: PANEL_TOP, minWidth: 0 }}
      >
        {children}
      </View>
    </View>
  )
}

/**
 * `/movies/{tmdbId}`: the metadata in every state, and the library layer once the movie is added.
 * Adding or removing from the page swaps the layer at once; the next `movies.updated` confirms it.
 */
export function MovieDetail({ id: raw, tab = 'overview' }: { id: string; tab?: MovieTab }) {
  const t = useT(messages)
  const id = parseTmdbId(raw)
  if (id === null)
    return (
      <AdminPage title={t('movie')}>
        <MetadataError error={Object.assign(new Error(''), { status: 404 })} />
      </AdminPage>
    )
  return <MovieById id={id} tab={tab} />
}

function MovieById({ id, tab }: { id: number; tab: Tab }) {
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
    <LibraryMovie id={id} tab={tab} meta={meta} onRemoved={removed} />
  ) : (
    <MetadataMovie id={id} tab={tab} meta={meta} onAdded={() => setOverride(true)} />
  )
}

// ---------------------------------------------------------------- not in the library

function MetadataMovie({
  id,
  tab,
  meta,
  onAdded,
}: {
  id: number
  tab: Tab
  meta: MetadataQuery
  onAdded: () => void
}) {
  const t = useT(messages)
  const tm = useT(media)
  const setTab = useTabAddress<Tab>(`/movies/${id}`, 'overview')
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const m = meta.data
  if (!m) return null
  // a film that isn't in the library has only Overview and Cast and crew
  if (tab !== 'overview' && tab !== 'cast') return <AdminNotFound />

  return (
    <AdminPage
      title={m.title}
      actions={
        <Button variant="primary" icon="add" hasPopup="dialog" onPress={() => setAdding([m])}>
          {t('addMovie')}
        </Button>
      }
    >
      <View style={{ gap: s['6'] }}>
        <MediaSummary item={m} meta={m} badges={<Badge tone="neutral">{tm('notInLibrary')}</Badge>}>
          <ReleaseLine date={m.releaseDate} />
        </MediaSummary>
        <PageTabs
          label={tm('sections')}
          tab={tab}
          onTab={setTab}
          options={[
            { value: 'overview', label: tm('tab.overview') },
            { value: 'cast', label: tm('tab.cast') },
          ]}
        >
          {tab === 'overview' ? (
            <MediaOverview meta={meta} onAllCast={() => setTab('cast')} onAdd={setAdding} />
          ) : (
            <CastAndCrew meta={meta} />
          )}
        </PageTabs>
      </View>
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
  tab,
  meta,
  onRemoved,
}: {
  id: number
  tab: Tab
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

  const setTab = useTabAddress<Tab>(`/movies/${id}`, 'overview')
  const [removing, setRemoving] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [exclude, setExclude] = useState(false)
  // "Don't add it again" only means something once a list exists (checkpoint 8a)
  const lists = useQuery('import-lists', (c) => c.importLists.list(), [LIST_TOPICS.lists])
  const hasLists = (lists.data?.length ?? 0) > 0
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const [monitoring, setMonitoring] = useState<boolean | null>(null)
  const [menu, setMenu] = useState(false)
  const more = useRef<ComponentRef<typeof View>>(null)

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

  const closeRemove = () => {
    setRemoving(false)
    setDeleteFiles(false)
    setExclude(false)
  }

  const title = m?.title ?? meta.data?.title ?? t('movie')
  const actions = m ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
      {searchable.canSearch ? (
        <Button
          icon="search"
          loading={search.pending}
          onPress={() =>
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
        // a disabled button takes no focus, so its wrapper carries the reason
        <Tooltip content={t('noIndexers')} focusable>
          <Button icon="search" disabled>
            {t('search')}
          </Button>
        </Tooltip>
      )}
      <Button variant="primary" icon="list" onPress={() => setTab('search')}>
        {t('interactiveSearch')}
      </Button>
      <Button
        ref={more}
        variant="ghost"
        iconOnly
        icon="more"
        accessibilityLabel={t('more')}
        hasPopup="menu"
        accessibilityState={{ expanded: menu }}
        onPress={() => setMenu(true)}
      />
      <Menu
        title={t('more')}
        open={menu}
        onClose={() => setMenu(false)}
        anchor={more}
        items={[
          { label: t('edit'), icon: 'edit', onSelect: () => setEditing(true) },
          {
            label: t('refresh'),
            icon: 'refresh',
            onSelect: () =>
              refresh.run().then(
                () =>
                  toast({
                    title: t('refresh.toast', { title: m.title }),
                    description: t('refresh.toastBody'),
                  }),
                (e: Error) => toast.error(t('refresh.failed'), { description: e.message }),
              ),
          },
          { label: t('remove'), icon: 'delete', onSelect: () => setRemoving(true) },
        ]}
      />
    </View>
  ) : undefined

  return (
    <AdminPage title={title} actions={actions}>
      {movie.status === 'error' && !missing ? (
        <EmptyState
          tone="error"
          icon="movie"
          title={ts('load.error', { what: t('library.what') })}
          action={<Button onPress={movie.refetch}>{ts('retry')}</Button>}
        >
          {movie.error.message}
        </EmptyState>
      ) : !m ? (
        <SummarySkeleton />
      ) : (
        <View style={{ gap: s['6'] }}>
          {(m.gone || meta.data?.gone) && (
            <Banner
              tone="warning"
              title={t('gone.title')}
              action={
                <Button size="sm" onPress={() => router.push(discoverSearch(m.title))}>
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
        </View>
      )}
      <ConfirmDialog
        open={removing}
        onClose={closeRemove}
        title={t('remove.title', { title })}
        description={
          <View style={{ gap: s['3'] }}>
            <Text
              size={tokens.adminText.form.size}
              leading={tokens.adminText.form.leading}
              color="text-2"
            >
              {t('remove.body')}
            </Text>
            <Checkbox
              label={t('remove.files')}
              checked={deleteFiles}
              onCheckedChange={setDeleteFiles}
            />
            {hasLists && (
              <Checkbox
                label={t('remove.exclude')}
                checked={exclude}
                onCheckedChange={setExclude}
              />
            )}
          </View>
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
          onClose={() => setEditing(false)}
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
  const st = movieStatus[m.status]
  return (
    <>
      <MediaSummary
        item={m}
        meta={meta.data}
        badges={
          <>
            <Badge tone={st.tone}>{tl(st.label)}</Badge>
            {m.versions.map((v) => (
              <QualityTag key={v.id} overlay={false}>
                {v.label}
              </QualityTag>
            ))}
          </>
        }
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: s['6'],
            rowGap: s['2'],
          }}
        >
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text
              variant="caption"
              color="text-3"
              mono
              style={{ wordBreak: 'break-all' } as object}
            >
              {m.path}
            </Text>
          </View>
          <View>
            <Switch label={t('monitored')} checked={monitored} onCheckedChange={onMonitor} />
          </View>
        </View>
      </MediaSummary>
      <PageTabs
        label={tm('sections')}
        tab={tab}
        onTab={onTab}
        options={[
          { value: 'overview', label: tm('tab.overview') },
          { value: 'cast', label: tm('tab.cast') },
          { value: 'files', label: t('tab.files') },
          { value: 'history', label: t('tab.history') },
          { value: 'search', label: t('tab.search') },
          { value: 'subtitles', label: t('tab.subtitles') },
        ]}
      >
        {tab === 'overview' ? (
          <MediaOverview
            meta={meta}
            onAllCast={() => onTab('cast')}
            onAdd={onAdd}
            main={<InTheQueue movie={m} />}
            aside={<InTheLibrary movie={m} options={options} onChange={onChange} />}
          />
        ) : tab === 'cast' ? (
          <CastAndCrew meta={meta} />
        ) : tab === 'files' ? (
          <Files movie={m} />
        ) : tab === 'history' ? (
          <History id={m.id} />
        ) : tab === 'search' ? (
          <SearchTab id={m.id} />
        ) : (
          <Subtitles movie={m} />
        )}
      </PageTabs>
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
  const theme = useTheme()
  const locale = useLocale()
  const queue = useQuery('queue', (c) => c.queue.list(), QUEUE_TOPICS)
  const live = queue.data?.filter((q) => q.movieId === m.id) ?? []
  if (!live.length) return null
  return (
    <View role="region" aria-label={t('inTheQueue')} style={{ gap: s['3'] }}>
      <Heading>{t('inTheQueue')}</Heading>
      {live.map((q) => (
        <View
          key={q.id}
          style={{
            gap: s['2'],
            padding: s['3'] + s['0.5'],
            borderRadius: tokens.radius.md,
            borderWidth: line.thin,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.s1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                size={RELEASE.size}
                leading={RELEASE.leading}
                mono
                color="text-2"
                numberOfLines={1}
              >
                {q.release}
              </Text>
            </View>
            <Badge tone={torrentTone[q.state].tone}>{ts(q.state)}</Badge>
          </View>
          <ProgressBar
            look="panel"
            value={q.progress * 100}
            tone={torrentTone[q.state].bar}
            label={t('queue.progress', { title: m.title })}
          />
          <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-3">
            {percent(q.progress)}
            {q.downRate ? ` · ${rate(q.downRate)}` : ''}
            {q.eta ? ` · ${t('queue.left', { duration: duration(q.eta, locale) })}` : ''}
            {q.stateReason ? ` · ${q.stateReason}` : ''}
          </Text>
        </View>
      ))}
    </View>
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
  const tags = useTags()
  return (
    <View role="region" aria-label={t('inTheLibrary')} style={{ gap: s['3'] }}>
      <Heading>{t('inTheLibrary')}</Heading>
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
          [t('tags'), <TagBadges key="tags" tags={tags.data} ids={m.tags} />],
          [t('availability'), t(`availability.${m.minimumAvailability}`)],
          [
            t('rootFolder'),
            <Text
              key="root"
              size={UI.size}
              leading={UI.leading}
              mono
              style={{ wordBreak: 'break-all' } as object}
            >
              {m.rootFolder}
            </Text>,
          ],
        ]}
      />
    </View>
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
    <View style={{ alignItems: 'flex-start' }}>
      <View role="list" style={{ gap: s['1'], alignSelf: 'stretch' }}>
        {m.versions.map((v) => (
          <View
            key={v.id}
            role="listitem"
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: s['1'],
              minWidth: 0,
            }}
          >
            <View
              style={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: admin.movieDetail.factBasis,
                minWidth: 0,
              }}
            >
              <Text
                size={UI.size}
                leading={UI.leading}
                style={{ overflowWrap: 'anywhere' } as object}
              >
                {t('version', { label: v.label, profile: profile(v.qualityProfileId) })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexShrink: 0 }}>
              <Tooltip content={t('editVersion', { label: v.label })}>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="edit"
                  accessibilityLabel={t('editVersion', { label: v.label })}
                  hasPopup="dialog"
                  onPress={() => setDialog({ version: v })}
                />
              </Tooltip>
              <Tooltip
                content={last ? t('lastVersion') : t('removeVersion', { label: v.label })}
                focusable={last}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="delete"
                  accessibilityLabel={t('removeVersion', { label: v.label })}
                  disabled={last}
                  onPress={() => setRemoving(v)}
                />
              </Tooltip>
            </View>
          </View>
        ))}
      </View>
      <View style={{ marginStart: -s['2'], marginTop: s['1'] }}>
        <Button
          size="sm"
          variant="ghost"
          icon="add"
          hasPopup="dialog"
          onPress={() => setDialog({ version: null })}
        >
          {t('addVersion')}
        </Button>
      </View>
      {dialog && (
        <VersionDialog
          movie={m}
          version={dialog.version}
          quality={quality}
          onClose={() => setDialog(null)}
          onSaved={onChange}
        />
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
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
    </View>
  )
}

function VersionDialog({
  movie: m,
  version: v,
  quality,
  onClose,
  onSaved,
}: {
  movie: Movie
  /** Null adds one. */
  version: MovieVersion | null
  quality: QualityProfile[]
  onClose: () => void
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
      onClose()
      toast.success(
        v ? t('versionSaved', { label: label.trim() }) : t('versionAdded', { label: label.trim() }),
      )
    } catch {
      // shown in the dialog
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={v ? t('versionDialog.edit', { label: v.label }) : t('versionDialog.add')}
      description={v ? t('versionDialog.editBody') : t('versionDialog.addBody')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            icon={v ? undefined : 'add'}
            loading={save.pending}
            disabled={!profileId}
            onPress={submit}
          >
            {v ? t('save') : t('add')}
          </Button>
        </>
      }
    >
      <View style={{ gap: s['4'] }}>
        <Field
          label={t('versionDialog.label')}
          hint={t('versionDialog.labelHint')}
          error={error ?? undefined}
        >
          <Input value={label} maxLength={40} onChangeText={setLabel} onSubmitEditing={submit} />
        </Field>
        <Field label={t('qualityProfile')}>
          <Select
            value={profileId}
            onValueChange={setProfileId}
            options={quality.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
        {save.error && <FormError>{save.error.message}</FormError>}
      </View>
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
  onClose,
  movie: m,
  options,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  movie: Movie
  options: ReturnType<typeof useLibraryOptions>
  onSaved: (movie: Movie) => void
}) {
  const t = useT(messages)
  const tt = useT(tagsMessages)
  // two columns in a regular window, as the add dialog has them
  const two = useRegularWindow()
  const initial = () => ({
    rootFolder: m.rootFolder,
    languageProfileId: m.languageProfileId,
    minimumAvailability: m.minimumAvailability,
    monitored: m.monitored,
    tags: m.tags,
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
      onClose()
      toast.success(t('saved', { title: m.title }))
    } catch {
      // shown in the dialog
    }
  }
  const half = two ? ({ flex: 1, flexBasis: 0, minWidth: 0 } as const) : undefined
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={t('editDialog.title', { title: m.title })}
      description={t('editDialog.body')}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            loading={save.pending}
            disabled={options.status !== 'success'}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <View style={{ gap: s['4'] }}>
        <Loadable query={options} what={t('editDialog.what')}>
          {(o) => (
            <View style={{ gap: s['4'] }}>
              <Field label={t('rootFolder')} hint={t('rootFolder.hint')}>
                <Select
                  value={form.rootFolder}
                  onValueChange={(rootFolder) => setForm({ ...form, rootFolder })}
                  options={withCurrent(
                    o.folders.map((f) => f.path),
                    m.rootFolder,
                  ).map((p) => ({ value: p, label: p }))}
                />
              </Field>
              <View style={{ flexDirection: two ? 'row' : 'column', gap: s['4'] }}>
                <View style={half}>
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
                </View>
                <View style={half}>
                  <Field label={t('availability')} hint={t('availability.hint')}>
                    <Select
                      value={form.minimumAvailability}
                      onValueChange={(v) =>
                        setForm({ ...form, minimumAvailability: v as MinimumAvailability })
                      }
                      options={AVAILABILITY.map((a) => ({
                        value: a,
                        label: t(`availability.${a}`),
                      }))}
                    />
                  </Field>
                </View>
              </View>
              <Field label={t('tags')} hint={tt('hint.movie')}>
                <TagPicker
                  value={form.tags}
                  name={t('tags')}
                  onChange={(tags) => setForm({ ...form, tags })}
                />
              </Field>
              <Switch
                label={t('monitored')}
                hint={t('monitored.longHint')}
                checked={form.monitored}
                onCheckedChange={(monitored) => setForm({ ...form, monitored })}
              />
              {save.error && <FormError>{save.error.message}</FormError>}
            </View>
          )}
        </Loadable>
      </View>
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
  const theme = useTheme()
  const files = useQuery(`files:${m.id}`, (c) => c.movies.files({ params: { id: m.id } }), [
    MEDIA_TOPICS.item,
  ])
  return (
    <Loadable query={files} what={t('files.what')}>
      {(fs) => (
        <View style={{ gap: s['4'] }}>
          {m.versions.map((v) => {
            const f = fs.find((x) => x.versionId === v.id)
            return (
              <View
                key={v.id}
                role="region"
                aria-label={t('files.version', { label: v.label })}
                style={{
                  gap: s['3'],
                  padding: s['4'],
                  minWidth: 0,
                  borderRadius: tokens.radius.lg,
                  borderWidth: line.thin,
                  borderColor: theme.colors.line,
                  backgroundColor: theme.colors.s1,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: s['2'],
                  }}
                >
                  <QualityTag overlay={false}>{v.label}</QualityTag>
                  {f ? (
                    <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-2">
                      {bytes(f.size)}
                    </Text>
                  ) : (
                    <Badge tone={m.status === 'downloading' ? 'accent' : 'danger'}>
                      {m.status === 'downloading' ? t('files.downloading') : t('files.none')}
                    </Badge>
                  )}
                </View>
                {f && <FileStreams file={f} />}
              </View>
            )
          })}
        </View>
      )}
    </Loadable>
  )
}

function FileStreams({ file: f }: { file: MediaFile }) {
  const t = useT(messages)
  const line = (st: Stream) =>
    st.type === 'video'
      ? `${st.codec.toUpperCase()} · ${st.width}×${st.height}${st.hdr !== 'none' ? ` · ${st.hdr.toUpperCase()}` : ''} · ${rate(st.bitrate / 8)}`
      : st.type === 'audio'
        ? `${st.codec.toUpperCase()} ${st.channels} · ${st.language}${st.title ? ` · ${st.title}` : ''}${st.default ? ` · ${t('stream.default')}` : ''}`
        : `${st.codec} · ${st.language}${st.forced ? ` · ${t('stream.forced')}` : ''}${st.hi ? ` · ${t('stream.sdh')}` : ''}`
  return (
    <>
      <Text
        size={RELEASE.size}
        leading={RELEASE.leading}
        mono
        color="text-3"
        numberOfLines={1}
        {...({ title: f.path } as object)}
      >
        {f.path}
      </Text>
      <View role="list" style={{ gap: s['1'], minWidth: 0 }}>
        {f.streams.map((st) => (
          <View key={st.index} role="listitem" style={{ flexDirection: 'row', gap: s['3'] }}>
            <View style={{ width: admin.movieDetail.labelWidth, flexShrink: 0 }}>
              <Text size={UI.size} leading={UI.leading} color="text-3">
                {t(`stream.${st.type}`)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                size={FIGURE.size}
                leading={UI.leading}
                mono
                color="text-2"
                style={{ overflowWrap: 'anywhere' } as object}
              >
                {line(st)}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {f.sceneName && (
        <Text variant="caption" color="text-3">
          {t('files.release')}{' '}
          <Text
            variant="caption"
            color="text-3"
            mono
            style={{ overflowWrap: 'anywhere' } as object}
          >
            {f.sceneName}
          </Text>
        </Text>
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
          <EmptyState icon="clock" title={t('history.none')}>
            {t('history.noneBody')}
          </EmptyState>
        ) : (
          <View style={{ gap: s['3'], alignItems: 'flex-start' }}>
            <View style={{ alignSelf: 'stretch' }}>
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
                      <TableRow key={e.id}>
                        <TableCell>
                          <Icon
                            name={historyIcon[e.type]}
                            size={tokens.icon.size.xs}
                            color="text-3"
                          />
                          <Text size={UI.size} leading={UI.leading}>
                            {t(`history.${e.type}`)}
                          </Text>
                        </TableCell>
                        <TitleTd
                          title={e.message ?? e.sourceTitle ?? t('search.unknown')}
                          detail={e.message ? e.sourceTitle : undefined}
                        />
                        <TableCell>
                          <Text size={UI.size} leading={UI.leading} color="text-2">
                            {e.indexer ?? t('search.unknown')}
                          </Text>
                        </TableCell>
                        <TableCell numeric>{relative(e.date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </View>
            {next && (
              <Button size="sm" onPress={() => setPages(pages + 1)}>
                {t('history.more')}
              </Button>
            )}
          </View>
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
      <View aria-busy style={{ gap: s['3'] }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={admin.skeleton.row} />
        ))}
      </View>
    )
  if (!searchable.canSearch)
    return (
      <EmptyState
        icon="indexers"
        title={t('noIndexers')}
        action={<Button onPress={() => router.push('/indexers')}>{t('goToIndexers')}</Button>}
      />
    )
  return <InteractiveSearch id={id} indexers={searchable.enabled} />
}

type Found = { releases: Release[]; failed: { indexer: string; message: string }[] }

/** A row's text in the admin's ui type, in `text` or `text-3`. */
function Words({ children, color }: { children: string; color?: 'text-2' | 'text-3' }) {
  return (
    <Text size={UI.size} leading={UI.leading} color={color}>
      {children}
    </Text>
  )
}

/** A table's empty line (the web's px-3.5 py-8, centred caption). */
function TableNone({ children }: { children: string }) {
  return (
    <View style={{ paddingHorizontal: s['3'] + s['0.5'], paddingVertical: s['8'] }}>
      <Text variant="caption" color="text-3" align="center">
        {children}
      </Text>
    </View>
  )
}

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
          <Caption>{t('search.searching', { count: indexers })}</Caption>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={admin.skeleton.row} />
          ))}
        </>
      }
    >
      {({ releases: rs, failed }) => {
        const shown = showRejected ? rs : rs.filter((r) => r.approved)
        return (
          <View style={{ gap: s['3'] }}>
            <TableFrame>
              <TableToolbar>
                <Words>{t('search.count', { count: rs.length })}</Words>
                <Words color="text-3">
                  {t('search.accepted', { count: rs.filter((r) => r.approved).length })}
                </Words>
                <View style={{ marginStart: 'auto' }}>
                  <Switch
                    label={t('search.showRejected')}
                    checked={showRejected}
                    onCheckedChange={setShowRejected}
                  />
                </View>
                <Button size="sm" icon="refresh" onPress={() => setRun(run + 1)}>
                  {t('search.again')}
                </Button>
              </TableToolbar>
              {rs.length === 0 ? (
                <TableNone>{t('search.none')}</TableNone>
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
                      <TableHead hidden>{t('search.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.flatMap((r) => {
                      const expanded = open === r.guid
                      const rejected = r.reasons.filter((x) => x.kind === 'rejected').length
                      const decision = r.approved
                        ? t('search.approved')
                        : t('search.rejected', { count: rejected })
                      const row = (
                        <TableRow key={r.guid}>
                          <TitleTd title={r.indexer} detail={r.title} />
                          <TableCell>
                            <QualityTag overlay={false}>{r.quality}</QualityTag>
                            {r.customFormats.slice(0, 2).map((f) => (
                              <QualityTag key={f} overlay={false}>
                                {f}
                              </QualityTag>
                            ))}
                          </TableCell>
                          <TableCell numeric>{String(r.formatScore)}</TableCell>
                          <TableCell numeric>{r.size === null ? dash : bytes(r.size)}</TableCell>
                          <TableCell
                            numeric
                          >{`${r.seeders ?? dash}/${r.leechers ?? dash}`}</TableCell>
                          <TableCell numeric>
                            {r.ageHours === null ? dash : duration(r.ageHours * 3600, locale)}
                          </TableCell>
                          <TableCell>
                            <Press
                              aria-expanded={expanded}
                              accessibilityLabel={`${decision} ${t('search.reasons')}`}
                              onPress={() => setOpen(expanded ? null : r.guid)}
                              style={{ borderRadius: tokens.radius.sm }}
                            >
                              <Badge tone={r.approved ? 'success' : 'danger'}>{decision}</Badge>
                            </Press>
                          </TableCell>
                          <TableCell align="end">
                            {grabbed === r.guid ? (
                              <Badge tone="accent">{t('search.grabbed')}</Badge>
                            ) : (
                              <Tooltip
                                content={t(r.approved ? 'search.grabTip' : 'search.grabAnywayTip')}
                              >
                                <Button
                                  size="sm"
                                  variant={r.approved ? 'primary' : 'ghost'}
                                  iconOnly
                                  icon="download"
                                  accessibilityLabel={t(
                                    r.approved ? 'search.grab' : 'search.grabAnyway',
                                    { title: r.title },
                                  )}
                                  onPress={() => doGrab(r)}
                                  disabled={grab.pending}
                                />
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                      return expanded
                        ? [
                            row,
                            <TableRow key={`${r.guid}-reasons`} selected>
                              <TableCell span={8} maxWidth={10000}>
                                <Reasons release={r} />
                              </TableCell>
                            </TableRow>,
                          ]
                        : [row]
                    })}
                  </TableBody>
                </Table>
              )}
            </TableFrame>
            {failed.length > 0 && (
              <View role="list" style={{ gap: s['1'] }}>
                {failed.map((f) => (
                  <View key={f.indexer} role="listitem">
                    <Caption>
                      {t('search.failedIndexer', { indexer: f.indexer, message: f.message })}
                    </Caption>
                  </View>
                ))}
              </View>
            )}
          </View>
        )
      }}
    </Loadable>
  )
}

/** Why a release was accepted or rejected, as the decision engine said it. */
function Reasons({ release: r }: { release: Release }) {
  return (
    <View role="list" style={{ gap: s['1'] }}>
      {r.reasons.map((reason) => (
        <View
          key={reason.message}
          role="listitem"
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s['1'] + s['0.5'] }}
        >
          <View style={{ marginTop: tokens.icon.drop, flexShrink: 0 }}>
            <Icon
              name={
                reason.kind === 'accepted'
                  ? 'check'
                  : reason.kind === 'warning'
                    ? 'warning'
                    : 'close'
              }
              size={tokens.icon.size.xs}
              color={
                reason.kind === 'accepted'
                  ? 'success'
                  : reason.kind === 'warning'
                    ? 'warning'
                    : 'danger'
              }
            />
          </View>
          <Text variant="caption" color="text-2">
            {reason.message}
          </Text>
        </View>
      ))}
    </View>
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
          f.streams.flatMap((st) => (st.type === 'subtitle' ? [{ file: f, stream: st }] : [])),
        )
        if (!files.length && !tracks.length)
          return (
            <EmptyState icon="subtitles" title={t('subs.noFile')}>
              {t('subs.noFileBody')}
            </EmptyState>
          )
        return (
          <View style={{ gap: s['6'], minWidth: 0 }}>
            <TableFrame>
              <TableToolbar>
                <Words>{t('subs.tracks')}</Words>
                <Words color="text-3">
                  {t('subs.counts', { external: tracks.length, embedded: embedded.length })}
                </Words>
              </TableToolbar>
              {tracks.length + embedded.length === 0 ? (
                <TableNone>{t('subs.none')}</TableNone>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('subs.language')}</TableHead>
                      <TableHead>{t('subs.source')}</TableHead>
                      <TableHead numeric>{t('subs.score')}</TableHead>
                      <TableHead>{t('subs.sync')}</TableHead>
                      <TableHead numeric>{t('subs.offset')}</TableHead>
                      <TableHead hidden>{t('subs.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      ...tracks.map((track) => (
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
                      )),
                      ...embedded.map(({ file, stream }) => (
                        <TableRow key={`${file.id}-${stream.index}`}>
                          <TitleTd
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
                          <TableCell>
                            <Words color="text-2">{t('subs.embedded')}</Words>
                          </TableCell>
                          <TableCell numeric>—</TableCell>
                          <TableCell>
                            <Badge tone="neutral">{t('subs.matchesVideo')}</Badge>
                          </TableCell>
                          <TableCell numeric>—</TableCell>
                          <TableCell />
                        </TableRow>
                      )),
                    ]}
                  </TableBody>
                </Table>
              )}
            </TableFrame>
            {files.length > 0 && <SubtitleSearch id={m.id} languages={languages} />}
          </View>
        )
      }}
    </Loadable>
  )
}

function TrackRow({
  track: st,
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
  const flags = [st.forced && t('stream.forced'), st.hi && t('stream.sdh'), st.format.toUpperCase()]
  const shown = flags.filter(Boolean)
  const movable = !IMAGE_FORMATS.has(st.format)
  const waiting = st.sync.status === 'queued' || st.sync.status === 'syncing'
  return (
    <TableRow>
      <TitleTd title={[language, ...shown].join(' · ')} detail={st.path} />
      <TableCell>
        <Words color="text-2">
          {st.kind === 'bundled' ? t('subs.bundled') : (st.provider ?? t('subs.byHand'))}
        </Words>
      </TableCell>
      <TableCell numeric>{st.score === null ? '—' : String(st.score)}</TableCell>
      <TableCell>
        <Badge tone={syncTone[st.sync.status]}>{t(`sync.${st.sync.status}`)}</Badge>
        {st.sync.confidence !== null && (
          <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-3">
            {percent(st.sync.confidence)}
          </Text>
        )}
      </TableCell>
      <TableCell numeric>
        {movable ? (
          <View style={{ alignItems: 'flex-end', gap: s['0.5'] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['1'] }}>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="remove"
                accessibilityLabel={t('subs.earlier', { language })}
                onPress={() => onOffset(st.sync.offsetMs - 50)}
                disabled={busy || waiting}
              />
              <View
                role="status"
                aria-label={t('subs.offsetLabel', { language })}
                style={{ width: admin.movieDetail.labelWidth }}
              >
                <Text
                  size={FIGURE.size}
                  leading={FIGURE.leading}
                  mono
                  color="text-2"
                  align="center"
                >
                  {t('subs.ms', { value: offsetLabel(st.sync.offsetMs) })}
                </Text>
              </View>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon="add"
                accessibilityLabel={t('subs.later', { language })}
                onPress={() => onOffset(st.sync.offsetMs + 50)}
                disabled={busy || waiting}
              />
            </View>
            {st.sync.detail && <Caption>{st.sync.detail}</Caption>}
          </View>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell align="end">
        {movable && (
          <Tooltip content={t('subs.resync')}>
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon="subtitle-sync"
              accessibilityLabel={t('subs.resyncLabel', { language })}
              onPress={onSync}
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
            accessibilityLabel={t('subs.deleteLabel', { language })}
            onPress={onRemove}
          />
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

/** Why a search found nothing to show: no provider on, or none answered (the server's reasons). */
const searchRefusal = (error: unknown) => {
  const reason = ((error as ApiError).details as { reason?: string } | undefined)?.reason
  return reason === 'no-providers' || reason === 'providers-failed' ? reason : null
}

/** The language field's width (the web's w-56). */
const LANGUAGE_WIDTH = admin.movieDetail.languageWidth

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
    <View role="region" aria-label={t('subs.search')} style={{ gap: s['3'], minWidth: 0 }}>
      <Heading>{t('subs.search')}</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: s['3'] }}>
        <View style={{ width: LANGUAGE_WIDTH }}>
          <Field label={t('subs.language')}>
            <Select
              value={language}
              onValueChange={setLanguage}
              options={languages.map((l) => ({ value: l.code, label: l.name }))}
            />
          </Field>
        </View>
        <Button icon="search" onPress={() => setSearch({ language, run: (search?.run ?? 0) + 1 })}>
          {t('subs.searchProviders')}
        </Button>
      </View>
      {search &&
        (refusal ? (
          <Caption>{t(`subs.${refusal}`)}</Caption>
        ) : (
          <Loadable query={results} what={t('subs.resultsWhat')}>
            {(rs) =>
              rs.length === 0 ? (
                <Caption>{t('subs.noResults')}</Caption>
              ) : (
                <View style={{ gap: s['2'] }}>
                  <TableFrame>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('subs.release')}</TableHead>
                          <TableHead>{t('subs.provider')}</TableHead>
                          <TableHead numeric>{t('subs.score')}</TableHead>
                          <TableHead hidden>{t('subs.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rs.map((r) => (
                          <TableRow key={r.id}>
                            <TitleTd
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
                            <TableCell>
                              <Words color="text-2">{r.provider}</Words>
                            </TableCell>
                            <TableCell numeric>{String(r.score)}</TableCell>
                            <TableCell align="end">
                              <Button
                                size="sm"
                                icon="download"
                                disabled={download.pending}
                                onPress={() =>
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
                                accessibilityLabel={t('subs.useLabel', {
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
                      <Caption key={line}>{line}</Caption>
                    ),
                  )}
                </View>
              )
            }
          </Loadable>
        ))}
    </View>
  )
}
