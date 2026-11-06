'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The widget registry's client half, ported from the prototype: one renderer per widget kind.
// Each fills the size it's given, fetches its own data and shows its own loading, empty and error
// states. A widget's data comes from a source public info lists (`sources`): the system feeds
// Storage and System health; `movies` (checkpoint 4) feeds Upcoming, Calendar and Recently added,
// and Storage's root folders; `indexers` (checkpoint 5) feeds Indexers; `downloads` (checkpoint 6)
// feeds Network and Queue; `subtitles` (checkpoint 7) feeds Subtitles. The rest show their empty
// states from dashboard.md, which are true on a server without those things yet, and call no route
// until their checkpoint adds it (Phase 3 plan › Widgets); so does each widget on a server without
// its source. Drawn with the library's native renderer since D2 (one-client-platform-d.md).

import {
  CURATION_TOPICS,
  DOWNLOAD_TOPICS,
  INDEXER_TOPICS,
  MEDIA_TOPICS,
  type Movie,
  type QueueItem,
  type RootFolder,
  SESSIONS_TOPICS,
  SUBTITLE_TOPICS,
} from '@highsea-tv/api-contract'
import {
  bytes,
  bytesParts,
  duration,
  percent,
  rate,
  rateParts,
  shortDate,
} from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import {
  type WidgetKind,
  type WidgetSource,
  widgetDefinition,
  widgetMessages,
} from '@highsea-tv/personalization/widgets'
import { type Query, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Poster,
  Press,
  ProgressBar,
  Skeleton,
  SkeletonText,
  Sparkline,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Text,
  TitleCell,
  TitleLink,
  Tooltip,
  tokens,
  useClip,
  useTheme,
  useWidth,
  type WidgetEditorFrameProps,
  WidgetFrame,
} from '@highsea-tv/ui/native'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { widgets as messages } from './dashboard-messages.ts'
import { behind, mbps, methodTone } from './delivery.ts'
import { type QueueFilter, queueFilters, torrentTone } from './downloads-status.ts'
import { foldersOnDisk, releasesByDay } from './library-figures.ts'
import { torrentState } from './movie-detail-messages.ts'
import { useRouter } from './navigation.tsx'
import { nowPlaying } from './now-playing-messages.ts'
import { useNow } from './time.ts'

export type WidgetProps = {
  frame: WidgetEditorFrameProps
  /** The placement's settings, filled from the widget's defaults by the server. */
  settings: Record<string, unknown>
  /** Header actions: Remove, in customize mode. */
  actions?: ReactNode
}

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure
/** Inside a widget, the frame's padding (its rows reach the frame's edges in Queue). */
const PAD = tokens.density.widgetPadding

/** Disks change slowly and have no event: the widget asks again now and then. */
const STORAGE_INTERVAL = 30_000

/** What changes the movie widgets: the library, or one title in it. */
const MOVIE_TOPICS = [MEDIA_TOPICS.movies, MEDIA_TOPICS.item]

/** A list's rows, as react-native-web draws a `listitem` View (an `<li>`), for the clip. */
const LIST_ROWS = ':scope > li, :scope > [role="listitem"]'

/**
 * Whether this server has a source yet: `undefined` until public info answers. Every widget asks
 * under one key; the SDK keeps each answer per widget, and it's a small public call.
 */
function useSource(source: WidgetSource): boolean | undefined {
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  return info.status === 'success' ? info.data.sources.includes(source) : undefined
}

const useMovieSource = () => useSource('movies')

/** The day a release is out, as the Upcoming badges show it ("Fri 24"), on the local calendar. */
const releaseDay = (day: string, locale: string) => shortDate(`${day}T12:00:00`, locale)

/** Read and not seen (the web's `sr-only`), inside a line of text. */
function Unseen({ children }: { children: string }) {
  return (
    <Text
      style={
        {
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        } as object
      }
    >
      {children}
    </Text>
  )
}

/** The admin's ui type, 13. */
function Ui(props: Omit<Parameters<typeof Text>[0], 'size' | 'leading'>) {
  return <Text size={ui.size} leading={ui.leading} {...props} />
}

/** A figure in mono 12 (the admin's `figure`). */
function Fig(props: Omit<Parameters<typeof Text>[0], 'size' | 'leading' | 'mono'>) {
  return <Text size={figure.size} leading={figure.leading} mono color="text-3" {...props} />
}

/** A widget's frame, with its data's loading and error states handled. */
function Widget<T>({
  kind,
  frame,
  actions,
  meta,
  query,
  skeleton,
  children,
}: Omit<WidgetProps, 'settings'> & {
  kind: WidgetKind
  meta?: (data: T) => ReactNode
  query: Query<T>
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  const t = useT(messages)
  const tw = useT(widgetMessages)
  const locale = useLocale()
  const title = tw(`${kind}.title`)
  return (
    <WidgetFrame
      {...frame}
      title={title}
      // while arranging, the header needs its room for the handle and Remove
      meta={query.status === 'success' && meta && !frame.editing ? meta(query.data) : undefined}
      actions={actions}
    >
      {query.status === 'loading' ? (
        <View aria-busy style={{ gap: s['2'] + s['0.5'] }}>
          {skeleton ?? (
            <>
              <Skeleton width={96} height={24} />
              <SkeletonText lines={2} />
            </>
          )}
        </View>
      ) : query.status === 'error' ? (
        <EmptyState
          size="sm"
          tone="error"
          icon="alert"
          level={4}
          title={t('error', { widget: title.toLocaleLowerCase(locale) })}
          action={
            <Button size="sm" onPress={query.refetch}>
              {t('retry')}
            </Button>
          }
        >
          {query.error.message}
        </EmptyState>
      ) : (
        children(query.data)
      )}
    </WidgetFrame>
  )
}

/** A widget whose source this server doesn't have yet: its frame and what's true without it. */
function Static({
  kind,
  frame,
  actions,
  meta,
  children,
}: Omit<WidgetProps, 'settings'> & { kind: WidgetKind; meta?: ReactNode; children: ReactNode }) {
  const tw = useT(widgetMessages)
  return (
    <WidgetFrame
      {...frame}
      title={tw(`${kind}.title`)}
      meta={frame.editing ? undefined : meta}
      actions={actions}
    >
      {children}
    </WidgetFrame>
  )
}

/** The line under a clipped list: "3 more in System". */
function More({ count, page, path }: { count: number; page: string; path: string }) {
  const t = useT(messages)
  if (!count) return null
  return (
    <Press
      role="link"
      {...({ href: path } as object)}
      style={{ alignSelf: 'flex-start', flexShrink: 0, borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <Text
          variant="caption"
          color={hovered ? 'text' : 'text-3'}
          style={hovered ? { textDecorationLine: 'underline' } : undefined}
        >
          {t('more', { count, page })}
        </Text>
      )}
    </Press>
  )
}

/** The box a list fills and is clipped by. */
const fill: ViewStyle = { minHeight: 0, flex: 1, overflow: 'hidden' }

/** A health or release dot. */
function Dot({ color, size = 6 }: { color: Parameters<typeof Icon>[0]['color']; size?: number }) {
  const theme = useTheme()
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: size / 2,
        backgroundColor: theme.colors[color ?? 'text-3'],
      }}
    />
  )
}

// ---------------------------------------------------------------- network

/**
 * The speeds come a sample a second and have no event of their own (the plan's `tick`): the widget
 * asks again this often.
 */
const NETWORK_INTERVAL = 2_000

const networkMinutes = (settings: Record<string, unknown>) =>
  Number(settings.minutes ?? widgetDefinition('network').settings.parse({}).minutes)

function Network(props: WidgetProps) {
  const source = useSource('downloads')
  if (source) return <NetworkLive {...props} />
  return <NetworkIdle {...props} />
}

/** The two rates side by side, wrapping when narrow; the upload's a little fainter. */
function Rates({ down, up }: { down: ReactNode; up: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        columnGap: s['6'],
        rowGap: s['2'],
      }}
    >
      {down}
      <View style={{ opacity: 0.85 }}>{up}</View>
    </View>
  )
}

/** The graph fills what the widget has left below the rates, 48 at least. */
function Graph({ up, down }: { up: number[]; down: number[] }) {
  return (
    <View style={{ flex: 1, minHeight: 48 }}>
      <Sparkline
        height={'100%' as unknown as number}
        series={[
          { values: up, color: 'text-3' },
          { values: down, color: 'accent', fill: true },
        ]}
      />
    </View>
  )
}

/** Without downloads: the speeds at zero (dashboard.md › Network, no downloads). */
function NetworkIdle(props: WidgetProps) {
  const t = useT(messages)
  const [zero, unit] = rateParts(0)
  return (
    <Static
      {...props}
      kind="network"
      meta={t('network.meta', { minutes: networkMinutes(props.settings) })}
    >
      <Rates
        down={<Stat value={zero} unit={t('network.down', { unit })} caption={t('network.none')} />}
        up={<Stat value={zero} unit={t('network.up', { unit })} caption={t('network.seeding')} />}
      />
      <Graph up={[0, 0]} down={[0, 0]} />
    </Static>
  )
}

/**
 * The prototype's Network: the torrents' rates now, and the sparkline of the last minutes. When
 * the VPN is down the kill switch has stopped every torrent, so the caption says why it's quiet.
 */
function NetworkLive(props: WidgetProps) {
  const t = useT(messages)
  const minutes = networkMinutes(props.settings)
  const query = useQuery(
    'widget:network',
    async (c) => {
      const [speeds, torrents] = await Promise.all([c.system.speeds(), c.downloads.list()])
      return {
        speeds,
        down: torrents.reduce((s, x) => s + x.downRate, 0),
        up: torrents.reduce((s, x) => s + x.upRate, 0),
        active: torrents.filter((x) => x.state === 'downloading').length,
      }
    },
    [DOWNLOAD_TOPICS.queue],
    { interval: NETWORK_INTERVAL },
  )
  const vpn = useQuery('widget:network-vpn', (c) => c.vpn.status(), [DOWNLOAD_TOPICS.vpn])
  const vpnDown = vpn.data?.state === 'down' || vpn.data?.state === 'failed'
  return (
    <Widget {...props} kind="network" query={query} meta={() => t('network.meta', { minutes })}>
      {(d) => {
        const [down, downUnit] = rateParts(d.down)
        const [up, upUnit] = rateParts(d.up)
        const shown = d.speeds.slice(-minutes * 60)
        return (
          <>
            <Rates
              down={
                <Stat
                  value={down}
                  unit={t('network.down', { unit: downUnit })}
                  caption={
                    vpnDown
                      ? t('network.vpnDown')
                      : d.active
                        ? t('network.downloads', { count: d.active })
                        : t('network.idle')
                  }
                />
              }
              up={
                <Stat
                  value={up}
                  unit={t('network.up', { unit: upUnit })}
                  caption={t('network.seeding')}
                />
              }
            />
            <Graph
              up={shown.length ? shown.map((x) => x.up) : [0, 0]}
              down={shown.length ? shown.map((x) => x.down) : [0, 0]}
            />
          </>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- storage

function Storage(props: WidgetProps) {
  const movies = useMovieSource()
  return movies ? <StorageWithFolders {...props} /> : <StorageOf {...props} folders={[]} />
}

/** With the library: the root folders on the disk, as what uses it. */
function StorageWithFolders(props: WidgetProps) {
  const folders = useQuery('widget:storage-folders', (c) => c.rootFolders.list(), [
    'settings.updated',
    MEDIA_TOPICS.movies,
  ])
  return <StorageOf {...props} folders={folders.data ?? []} />
}

function StorageOf({ folders, ...props }: WidgetProps & { folders: RootFolder[] }) {
  const t = useT(messages)
  const theme = useTheme()
  const query = useQuery('widget:storage', (c) => c.system.status(), [], {
    interval: STORAGE_INTERVAL,
  })
  // three rows and up: the legend becomes a list with a figure per line
  const tall = (props.frame.rows ?? 2) >= 3
  return (
    <Widget
      {...props}
      kind="storage"
      query={query}
      // a long data path truncates rather than pushing the title out (the prototype's is /data)
      meta={(st) =>
        st.disks[0] && (
          <Tooltip content={st.disks[0].path}>
            <Text
              size={12}
              leading={1.4}
              color="text-3"
              numberOfLines={1}
              style={{ maxWidth: 160 }}
            >
              {st.disks[0].path}
            </Text>
          </Tooltip>
        )
      }
    >
      {(st) => {
        const disk = st.disks[0]
        if (!disk) return <EmptyState size="sm" icon="inbox" level={4} title={t('storage.none')} />
        const [free, unit] = bytesParts(disk.free)
        // the space files take arrives with importing (checkpoint 6): until then one bar for all
        // of it, and the root folders on the disk with how many movies each holds
        const used = Math.max(0, disk.total - disk.free)
        const here = foldersOnDisk(folders, disk)
        const item: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 6 }
        return (
          <>
            <Stat value={free} unit={t('storage.free', { unit, total: bytes(disk.total) })} />
            <View
              role="img"
              aria-label={t('storage.bar', { percent: percent(used / Math.max(1, disk.total)) })}
              style={{
                flexDirection: 'row',
                height: 8,
                overflow: 'hidden',
                borderRadius: tokens.radius.pill,
                backgroundColor: theme.colors.s3,
              }}
            >
              <View
                style={{
                  width: `${(used / Math.max(1, disk.total)) * 100}%`,
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>
            <View
              role="list"
              style={
                tall
                  ? { gap: 6 }
                  : { flexDirection: 'row', flexWrap: 'wrap', columnGap: s['3'], rowGap: s['1'] }
              }
            >
              <View role="listitem" style={item}>
                <View
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: theme.colors.accent,
                  }}
                />
                <Text variant="caption" color="text-2" style={tall ? { flex: 1 } : undefined}>
                  {t('storage.used')}
                </Text>
                <Text variant="caption" mono color="text-3">
                  {bytes(used)}
                </Text>
              </View>
              {here.map((f) => (
                <View key={f.id} role="listitem" style={[item, { minWidth: 0 }]}>
                  <Icon name="folder" size={12} color="text-3" />
                  <Text
                    variant="caption"
                    mono
                    color="text-2"
                    numberOfLines={1}
                    style={{ minWidth: 0, flexShrink: 1, flexGrow: tall ? 1 : 0 }}
                  >
                    {f.path}
                  </Text>
                  <Text variant="caption" color="text-3" style={{ flexShrink: 0 }}>
                    {t('storage.movies', { count: f.movies })}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- indexers

function NoIndexers() {
  const t = useT(messages)
  const router = useRouter()
  return (
    <EmptyState
      size="sm"
      icon="indexer"
      level={4}
      title={t('indexers.none')}
      action={
        <Button size="sm" variant="primary" onPress={() => router.push('/indexers')}>
          {t('indexers.add')}
        </Button>
      }
    >
      {t('indexers.noneBody')}
    </EmptyState>
  )
}

function Indexers(props: WidgetProps) {
  const source = useSource('indexers')
  if (source) return <IndexerList {...props} />
  return (
    <Static {...props} kind="indexers">
      {source === undefined ? <SkeletonText lines={3} /> : <NoIndexers />}
    </Static>
  )
}

const healthDot = {
  healthy: 'success',
  backoff: 'warning',
  failing: 'danger',
  disabled: 'text-3',
} as const

/** Installed indexers with their health; a health change or a search updates it (ADR 0035). */
function IndexerList(props: WidgetProps) {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const query = useQuery('widget:indexers', (c) => c.indexers.list(), [
    INDEXER_TOPICS.indexers,
    INDEXER_TOPICS.health,
  ])
  const wide = props.frame.span !== 1
  const clip = useClip(LIST_ROWS)
  return (
    <Widget
      {...props}
      kind="indexers"
      query={query}
      meta={(xs) =>
        xs.length
          ? t('indexers.meta', {
              healthy: xs.filter((x) => x.health === 'healthy').length,
              count: xs.length,
            })
          : null
      }
    >
      {(xs) =>
        xs.length === 0 ? (
          <NoIndexers />
        ) : (
          <>
            <View ref={clip.ref} role="list" style={[{ gap: 6 }, fill]}>
              {xs.map((x) => {
                const left = x.backoffUntil ? (Date.parse(x.backoffUntil) - now) / 1000 : 0
                return (
                  <View
                    key={x.id}
                    role="listitem"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'], minWidth: 0 }}
                  >
                    <Dot color={healthDot[x.health]} />
                    <Ui numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                      {x.name}
                      <Unseen>{`: ${t(`indexers.${x.health}`)}`}</Unseen>
                    </Ui>
                    {wide ? <Fig>{t('indexers.grabs', { count: x.stats.grabs24h })}</Fig> : null}
                    <Fig
                      color={x.health === 'backoff' ? 'warning' : 'text-3'}
                      style={{ flexShrink: 0 }}
                    >
                      {x.health === 'backoff'
                        ? t('indexers.retry', { in: duration(left, locale) })
                        : x.stats.avgResponseMs === null
                          ? t('indexers.noQueries')
                          : t('indexers.ms', { ms: Math.round(x.stats.avgResponseMs) })}
                    </Fig>
                  </View>
                )
              })}
            </View>
            <More count={clip.hidden} page={t('page.indexers')} path="/indexers" />
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- subtitles

function Subtitles(props: WidgetProps) {
  const t = useT(messages)
  const source = useSource('subtitles')
  if (source) return <SubtitleStats {...props} />
  return (
    <Static {...props} kind="subtitles" meta={t('subtitles.meta')}>
      {source === undefined ? (
        <SkeletonText lines={3} />
      ) : (
        <EmptyState size="sm" icon="subtitles" level={4} title={t('subtitles.none')}>
          {t('subtitles.noneBody')}
        </EmptyState>
      )}
    </Static>
  )
}

/** Today's syncs and the tracks waiting for one (checkpoint 7); a download or a sync updates it. */
function SubtitleStats(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery('widget:subtitles', (c) => c.subtitles.stats(), [
    SUBTITLE_TOPICS.subtitles,
  ])
  return (
    <Widget {...props} kind="subtitles" query={query} meta={() => t('subtitles.meta')}>
      {(st) =>
        st.syncedToday === 0 && st.waiting === 0 ? (
          <EmptyState size="sm" icon="subtitles" level={4} title={t('subtitles.none')}>
            {t('subtitles.noneBody')}
          </EmptyState>
        ) : (
          <>
            <Stat
              value={String(st.syncedToday)}
              unit={t('subtitles.synced')}
              caption={t('subtitles.waiting', { count: st.waiting })}
            />
            <ProgressBar
              look="panel"
              value={(st.syncedToday / Math.max(1, st.syncedToday + st.waiting)) * 100}
              tone="success"
              label={t('subtitles.progress')}
            />
            <Text variant="caption" color="text-3">
              {t('subtitles.average', {
                offset: (st.avgOffsetMs / 1000).toFixed(2),
                confidence: st.avgConfidence.toFixed(2),
              })}
            </Text>
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- upcoming

const upcomingDays = (settings: Record<string, unknown>) =>
  Number(settings.days ?? widgetDefinition('upcoming').settings.parse({}).days)

function Upcoming(props: WidgetProps) {
  const t = useT(messages)
  const movies = useMovieSource()
  const days = upcomingDays(props.settings)
  if (movies) return <UpcomingMovies {...props} />
  return (
    <Static {...props} kind="upcoming" meta={t('upcoming.meta', { days })}>
      {movies === undefined ? (
        <SkeletonText lines={3} />
      ) : (
        <EmptyState size="sm" icon="calendar" level={4} title={t('upcoming.none', { days })}>
          {t('upcoming.noneBody')}
        </EmptyState>
      )}
    </Static>
  )
}

function UpcomingMovies(props: WidgetProps) {
  const t = useT(messages)
  const locale = useLocale()
  const days = upcomingDays(props.settings)
  const query = useQuery(
    `widget:upcoming:${days}`,
    (c) => c.movies.upcoming({ query: { days } }),
    MOVIE_TOPICS,
  )
  const clip = useClip(LIST_ROWS)
  return (
    <Widget {...props} kind="upcoming" query={query} meta={() => t('upcoming.meta', { days })}>
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="calendar" level={4} title={t('upcoming.none', { days })}>
            {t('upcoming.noneBody')}
          </EmptyState>
        ) : (
          <>
            <View ref={clip.ref} role="list" style={[{ gap: s['2'] }, fill]}>
              {xs.map((m, i) => (
                <View
                  key={m.id}
                  role="listitem"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: s['2'] + s['0.5'],
                    minWidth: 0,
                  }}
                >
                  <View style={{ width: 64, alignItems: 'center' }}>
                    <Badge dot={false} tone={i === 0 ? 'accent' : 'neutral'}>
                      {m.releaseDate ? releaseDay(m.releaseDate, locale) : '–'}
                    </Badge>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}>
                    <TitleLink href={`/movies/${m.id}`}>{m.title}</TitleLink>
                  </View>
                  <Text variant="caption" color="text-3" style={{ flexShrink: 0 }}>
                    {m.versions.map((v) => v.label).join(' + ')}
                  </Text>
                </View>
              ))}
            </View>
            {/* the rest of what's coming is the calendar's, not the library's (prototype-gaps.md, stage 5) */}
            <More count={clip.hidden} page={t('page.calendar')} path="/wanted/calendar" />
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- announcement

// two rows hold the title and details; taller widgets show the message too
const bodyLines: Record<number, number | undefined> = { 3: 3, 4: 7 }

/** The first live announcement, as the prototype shows it (checkpoint 8c): what it says and where. */
function Announcement(props: WidgetProps) {
  const source = useSource('curation')
  if (source) return <LiveAnnouncement {...props} />
  return (
    <Static {...props} kind="announcement">
      {source === undefined ? <SkeletonText lines={2} /> : <NoAnnouncement />}
    </Static>
  )
}

function NoAnnouncement() {
  const t = useT(messages)
  const router = useRouter()
  return (
    <EmptyState
      size="sm"
      icon="announcement"
      level={4}
      title={t('announcement.none')}
      action={
        <Button size="sm" onPress={() => router.push('/curation')}>
          {t('announcement.write')}
        </Button>
      }
    />
  )
}

function LiveAnnouncement(props: WidgetProps) {
  const t = useT(messages)
  const locale = useLocale()
  const body = bodyLines[props.frame.rows ?? 2]
  const query = useQuery(
    'widget:announcement',
    async (c) => (await c.curation.announcements()).filter((a) => a.status === 'live'),
    [CURATION_TOPICS.curation],
  )
  const until = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <Widget
      {...props}
      kind="announcement"
      query={query}
      meta={(xs) => (xs.length ? <Badge tone="success">{t('announcement.live')}</Badge> : null)}
    >
      {(xs) => {
        const a = xs[0]
        if (!a) return <NoAnnouncement />
        const audience =
          a.audience.kind === 'everyone' ? t('announcement.everyone') : t('announcement.some')
        return (
          <View style={{ gap: s['1'] }}>
            <Ui weight={600}>{a.title}</Ui>
            <Text variant="caption" color="text-3">
              {`${audience} · ${a.placements.join(' + ')}`}
              {a.schedule.end
                ? ` · ${t('announcement.until', { when: until.format(new Date(a.schedule.end)) })}`
                : ''}
            </Text>
            {body ? (
              <Text
                variant="caption"
                color="text-2"
                numberOfLines={body}
                style={{ marginTop: s['1'] }}
              >
                {a.body.replaceAll('**', '')}
              </Text>
            ) : null}
          </View>
        )
      }}
    </Widget>
  )
}

// ---------------------------------------------------------------- queue

/** What changes the Queue: a grab, an import or a removal, and each torrent's progress. */
const QUEUE_TOPICS = [DOWNLOAD_TOPICS.queue, DOWNLOAD_TOPICS.torrents]

/** The Queue's rows, in either layout, for the clip: a table's body rows, or a list's items. */
const QUEUE_ROWS = '[data-testid="queue-row"], li, [role="listitem"]'

function Queue(props: WidgetProps) {
  const t = useT(messages)
  const source = useSource('downloads')
  if (source) return <QueueLive {...props} />
  return (
    <Static {...props} kind="activity">
      {source === undefined ? (
        <SkeletonText lines={3} />
      ) : (
        <EmptyState size="sm" icon="downloads" level={4} title={t('activity.none')}>
          {t('activity.noneBody')}
        </EmptyState>
      )}
    </Static>
  )
}

const queueFilter = (settings: Record<string, unknown>): QueueFilter =>
  widgetDefinition('activity').settings.parse(settings).filter as QueueFilter

const FILTERS = ['all', 'downloading', 'seeding', 'issues'] as const

/** The prototype's Queue: the filter tabs with counts, then rows laid out for the width. */
function QueueLive(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery('widget:activity', (c) => c.queue.list(), QUEUE_TOPICS)
  const [filter, setFilter] = useState<QueueFilter>(() => queueFilter(props.settings))
  const { onLayout, width } = useWidth()
  const layout = width >= 760 ? 'table' : width >= 520 ? 'mid' : 'stacked'
  const clip = useClip(QUEUE_ROWS)
  return (
    <Widget
      {...props}
      kind="activity"
      query={query}
      meta={(xs) =>
        xs.length
          ? t('activity.meta', {
              count: xs.length,
              rate: rate(xs.reduce((sum, q) => sum + q.downRate, 0)),
            })
          : null
      }
      skeleton={
        <View style={{ gap: s['3'] }}>
          <Skeleton width={256} height={28} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={40} />
          ))}
        </View>
      }
    >
      {(xs) => {
        if (xs.length === 0)
          return (
            <EmptyState size="sm" icon="downloads" level={4} title={t('activity.none')}>
              {t('activity.noneBody')}
            </EmptyState>
          )
        const count = (f: QueueFilter) => xs.filter((q) => queueFilters[f](q.state)).length
        const shown = xs.filter((q) => queueFilters[filter](q.state))
        return (
          <View onLayout={onLayout} style={{ flex: 1, minHeight: 0, minWidth: 0, gap: s['2'] }}>
            <View style={{ maxWidth: '100%', alignSelf: 'flex-start', overflow: 'hidden' }}>
              <Tabs
                aria-label={t('activity.filter')}
                size="sm"
                value={filter}
                onValueChange={(v) => setFilter(v as QueueFilter)}
                options={FILTERS.map((f) => ({
                  value: f,
                  label: t(`activity.${f}`),
                  count: count(f),
                }))}
              />
            </View>
            <View ref={clip.ref} role="tabpanel" style={[{ minWidth: 0 }, fill]}>
              {shown.length ? (
                <QueueRows items={shown} layout={layout} />
              ) : (
                <Text
                  variant="caption"
                  color="text-3"
                  align="center"
                  style={{ paddingVertical: s['4'] }}
                >
                  {t('activity.nothing')}
                </Text>
              )}
            </View>
            <More count={clip.hidden} page={t('page.activity')} path="/activity" />
          </View>
        )
      }}
    </Widget>
  )
}

function QueueRows({ items, layout }: { items: QueueItem[]; layout: 'table' | 'mid' | 'stacked' }) {
  const t = useT(messages)
  const ts = useT(torrentState)
  const theme = useTheme()
  const locale = useLocale()
  const dash = t('activity.unknown')
  if (layout === 'stacked')
    return (
      <View role="list" style={{ marginHorizontal: -PAD }}>
        {items.map((q) => {
          const st = torrentTone[q.state]
          return (
            <View
              key={q.id}
              role="listitem"
              style={{
                gap: 6,
                borderTopWidth: 1,
                borderTopColor: theme.colors.line,
                paddingHorizontal: PAD,
                paddingVertical: s['2'] + s['0.5'],
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'], minWidth: 0 }}
              >
                <Ui numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                  {q.title}
                </Ui>
                <Badge tone={st.tone}>{ts(q.state)}</Badge>
              </View>
              <ProgressBar
                look="panel"
                value={q.progress * 100}
                tone={st.bar}
                showValue
                label={t('activity.progressOf', { title: q.title })}
              />
              <Fig numberOfLines={1}>
                {q.state === 'downloading'
                  ? `${rate(q.downRate)} · ${q.eta ? t('activity.left', { duration: duration(q.eta, locale) }) : dash}`
                  : (q.stateReason ?? bytes(q.size))}
              </Fig>
            </View>
          )
        })}
      </View>
    )
  const full = layout === 'table'
  return (
    <View style={{ marginHorizontal: -PAD }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('activity.title')}</TableHead>
            {full ? <TableHead numeric>{t('activity.size')}</TableHead> : null}
            <TableHead>{t('activity.progress')}</TableHead>
            <TableHead numeric>{t('activity.down')}</TableHead>
            {full ? <TableHead numeric>{t('activity.up')}</TableHead> : null}
            <TableHead numeric>{t('activity.eta')}</TableHead>
            <TableHead>{t('activity.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((q) => {
            const st = torrentTone[q.state]
            return (
              <TableRow key={q.id} testID="queue-row">
                <TableCell tall>
                  {/* the reason a torrent is held is its tooltip, as the web's row title */}
                  <Tooltip content={q.stateReason ?? ''} disabled={!q.stateReason}>
                    <TitleCell
                      title={
                        q.movieId ? (
                          <TitleLink href={`/movies/${q.movieId}`}>{q.title}</TitleLink>
                        ) : (
                          q.title
                        )
                      }
                      detail={q.release}
                    />
                  </Tooltip>
                </TableCell>
                {full ? <TableCell numeric>{bytes(q.size)}</TableCell> : null}
                <TableCell>
                  <View style={{ width: 160 }}>
                    <ProgressBar
                      look="panel"
                      value={q.progress * 100}
                      tone={st.bar}
                      showValue
                      label={t('activity.progressOf', { title: q.title })}
                    />
                  </View>
                </TableCell>
                <TableCell numeric>{q.downRate ? rate(q.downRate) : dash}</TableCell>
                {full ? <TableCell numeric>{q.upRate ? rate(q.upRate) : dash}</TableCell> : null}
                <TableCell numeric>
                  {q.state === 'downloading' && q.eta
                    ? duration(q.eta, locale)
                    : q.state === 'queued'
                      ? t('activity.queued')
                      : dash}
                </TableCell>
                <TableCell>
                  <Badge tone={st.tone}>{ts(q.state)}</Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </View>
  )
}

// ---------------------------------------------------------------- recently added

function PosterSkeletonRow() {
  return (
    <View style={{ flexDirection: 'row', gap: s['3'] }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flex: 1, aspectRatio: 2 / 3 }}>
          <Skeleton height="100%" radius={tokens.radius.poster} />
        </View>
      ))}
    </View>
  )
}

function RecentlyAdded(props: WidgetProps) {
  const t = useT(messages)
  const movies = useMovieSource()
  if (movies) return <RecentMovies {...props} />
  return (
    <Static {...props} kind="recently-added">
      {movies === undefined ? (
        <PosterSkeletonRow />
      ) : (
        <EmptyState size="sm" icon="movie" level={4} title={t('recent.none')}>
          {t('recent.noneBody')}
        </EmptyState>
      )}
    </Static>
  )
}

/** The most the widget shows: eight columns of posters, three rows. */
const RECENT_LIMIT = 24

function RecentMovies(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery(
    'widget:recently-added',
    (c) => c.movies.recent({ query: { limit: RECENT_LIMIT } }),
    MOVIE_TOPICS,
  )
  const { onLayout, width } = useWidth()
  const columns = Math.max(2, Math.min(8, Math.floor((width + 12) / 112)))
  // as many rows of posters as fit the height; a cut-off row is hidden
  const clip = useClip(LIST_ROWS)
  return (
    <Widget {...props} kind="recently-added" query={query} skeleton={<PosterSkeletonRow />}>
      {(xs: Movie[]) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="movie" level={4} title={t('recent.none')}>
            {t('recent.addedBody')}
          </EmptyState>
        ) : (
          <View onLayout={onLayout} style={{ flex: 1, minHeight: 0 }}>
            <View
              ref={clip.ref}
              role="list"
              style={[
                {
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  alignContent: 'start',
                  gap: s['3'],
                } as unknown as ViewStyle,
                fill,
              ]}
            >
              {xs.slice(0, columns * 4).map((m) => (
                <View key={m.id} role="listitem">
                  <Poster
                    title={m.title}
                    src={m.art.poster ?? undefined}
                    href={`/movies/${m.id}`}
                    showTitle
                    titleSize="ui"
                    caption={m.year ? String(m.year) : undefined}
                  />
                </View>
              ))}
            </View>
          </View>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- calendar

const WEEKDAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const

/** Far enough ahead to cover the rest of any month. */
const CALENDAR_DAYS = 45

function Calendar(props: WidgetProps) {
  const movies = useMovieSource()
  return movies ? <CalendarMovies {...props} /> : <CalendarOf {...props} />
}

function CalendarMovies(props: WidgetProps) {
  const query = useQuery(
    'widget:calendar',
    (c) => c.movies.upcoming({ query: { days: CALENDAR_DAYS } }),
    MOVIE_TOPICS,
  )
  return <CalendarOf {...props} releases={query.data} />
}

/** The month, with each day that has a release marked; without `releases`, a month with none. */
function CalendarOf({ releases, ...props }: WidgetProps & { releases?: Movie[] }) {
  const t = useT(messages)
  const theme = useTheme()
  const locale = useLocale()
  const now = useNow()
  const today = new Date(now)
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(first)
  // the date each row starts on (zero or less is last month's tail)
  const weeks = Array.from({ length: Math.ceil((lead + days) / 7) }, (_, i) => i * 7 - lead + 1)
  const byDay = releasesByDay(releases ?? [], today.getFullYear(), today.getMonth())
  // the table's cells, 2 apart (the web's border-spacing-0.5)
  const row: ViewStyle = { flexDirection: 'row', gap: 2 }
  return (
    <Static {...props} kind="calendar" meta={month}>
      <View style={{ flex: 1, minHeight: 0, gap: s['2'] }}>
        <View
          role="table"
          aria-label={t('calendar.caption', { month })}
          style={{ flex: 1, minHeight: 0, gap: 2 }}
        >
          <View role="row" style={row}>
            {WEEKDAYS.map((d) => (
              <View
                key={d}
                role="columnheader"
                style={{ flex: 1, flexBasis: 0, paddingVertical: s['1'] }}
              >
                <Text variant="label" color="text-3" align="center">
                  {t(`calendar.${d}`)}
                </Text>
              </View>
            ))}
          </View>
          {weeks.map((start) => (
            <View key={start} role="row" style={[row, { flex: 1, minHeight: 28 }]}>
              {WEEKDAYS.map((d, i) => {
                const day = start + i
                const valid = day >= 1 && day <= days
                const titles = valid ? byDay.get(day) : undefined
                const isToday = valid && day === today.getDate()
                return (
                  <View
                    key={d}
                    role="cell"
                    aria-current={isToday ? 'date' : undefined}
                    style={{
                      flex: 1,
                      flexBasis: 0,
                      minHeight: 28,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 6,
                      opacity: valid ? 1 : 0,
                      backgroundColor: isToday ? theme.colors.s3 : 'transparent',
                    }}
                  >
                    <Fig
                      weight={titles ? 600 : 400}
                      color={titles ? 'accent-text' : isToday ? 'text' : 'text-2'}
                      align="center"
                    >
                      {valid ? String(day) : ''}
                      {titles ? <Unseen>{`: ${titles.join(', ')}`}</Unseen> : null}
                    </Fig>
                    {titles ? (
                      <View style={{ position: 'absolute', bottom: 2 }}>
                        <Dot color="accent" size={4} />
                      </View>
                    ) : null}
                  </View>
                )
              })}
            </View>
          ))}
        </View>
        {byDay.size === 0 ? (
          <Text variant="caption" color="text-3" style={{ flexShrink: 0 }}>
            {t('calendar.none')}
          </Text>
        ) : null}
      </View>
    </Static>
  )
}

// ---------------------------------------------------------------- system health

const levels = {
  ok: 'success',
  notice: 'info',
  warning: 'warning',
  error: 'danger',
} as const

function SystemHealth(props: WidgetProps) {
  const t = useT(messages)
  const query = useQuery('widget:system-health', (c) => c.system.healthChecks(), [
    'server.updated',
    'settings.updated',
    DOWNLOAD_TOPICS.queue,
    DOWNLOAD_TOPICS.vpn,
  ])
  const clip = useClip(LIST_ROWS)
  return (
    <Widget
      {...props}
      kind="system-health"
      query={query}
      meta={(xs) => (xs.length ? t('health.meta', { count: xs.length }) : null)}
    >
      {(xs) =>
        xs.length === 0 ? (
          <EmptyState size="sm" icon="success" level={4} title={t('health.none')} />
        ) : (
          <>
            <View ref={clip.ref} role="list" style={[{ gap: s['2'] + s['0.5'] }, fill]}>
              {xs.map((h) => (
                <View key={h.id} role="listitem" style={{ gap: s['1'] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
                    <Badge tone={levels[h.level]}>{t(`health.${h.level}`)}</Badge>
                    <Text variant="caption" color="text-3">
                      {h.source}
                    </Text>
                  </View>
                  <Text variant="caption" color="text-2">
                    {h.message}
                  </Text>
                </View>
              ))}
            </View>
            <More count={clip.hidden} page={t('page.health')} path="/system/health" />
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- now playing

function NowPlaying(props: WidgetProps) {
  const t = useT(messages)
  const tn = useT(nowPlaying)
  // the sidebar's count and the page share this answer
  const query = useQuery('sessions', (c) => c.sessions.list(), [SESSIONS_TOPICS.updated])
  const clip = useClip(LIST_ROWS)
  return (
    <Widget
      {...props}
      kind="now-playing"
      query={query}
      meta={(np) => (np.sessions.length ? mbps(np.totalMbps) : null)}
    >
      {(np) =>
        np.sessions.length === 0 ? (
          <EmptyState size="sm" icon="play" level={4} title={t('playing.none')} />
        ) : (
          <>
            <View ref={clip.ref} role="list" style={[{ gap: s['3'] }, fill]}>
              {np.sessions.map((x) => (
                <View
                  key={x.id}
                  role="listitem"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: s['3'] }}
                >
                  <View style={{ width: 32 }}>
                    <Poster title={x.item.title} src={x.item.poster ?? undefined} width={32} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: s['1'] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: s['2'],
                        minWidth: 0,
                      }}
                    >
                      <Ui numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
                        {x.item.title}
                      </Ui>
                      {behind(x) ? (
                        <Badge tone="danger">{tn('state.behind')}</Badge>
                      ) : (
                        <Badge tone={methodTone[x.method]} dot={false}>
                          {tn(`method.${x.method}`)}
                        </Badge>
                      )}
                    </View>
                    <Text variant="caption" color="text-3" numberOfLines={1}>
                      {`${x.user.displayName} · ${x.deviceName}${x.state === 'paused' && !x.stopped ? t('playing.paused') : ''}`}
                    </Text>
                    <ProgressBar
                      look="panel"
                      value={x.runtime ? (x.position / x.runtime) * 100 : 0}
                      tone={behind(x) ? 'danger' : 'accent'}
                      label={t('playing.so-far', { title: x.item.title })}
                    />
                  </View>
                </View>
              ))}
            </View>
            <More count={clip.hidden} page={t('page.now-playing')} path="/now-playing" />
          </>
        )
      }
    </Widget>
  )
}

// ---------------------------------------------------------------- registry

export const widgetRenderers: Record<WidgetKind, (props: WidgetProps) => ReactNode> = {
  network: Network,
  storage: Storage,
  indexers: Indexers,
  subtitles: Subtitles,
  upcoming: Upcoming,
  announcement: Announcement,
  activity: Queue,
  'recently-added': RecentlyAdded,
  calendar: Calendar,
  'system-health': SystemHealth,
  'now-playing': NowPlaying,
}
