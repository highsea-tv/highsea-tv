'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// The widgets drafted for the next round (HT-47), drawn on the prototype's review page only
// (widgets-next.tsx): Recently added three ways, the network's whole activity, the server's date
// and time, and the weather. None is in the registry, so the server's dashboard can't place one.
// Recently added and the date and time read routes the API already has (`movies.recent`,
// `settings.general`); the network's streams and the weather have none, so the page hands those
// in as data (the prototype's host makes them in @highsea-tv/mock's widget-drafts.ts).

import { MEDIA_TOPICS, type Movie } from '@highsea-tv/api-contract'
import { rate, rateParts } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { type Query, useQuery } from '@highsea-tv/sdk/react'
import { admin, type ColorRole, line } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Poster,
  Press,
  SkeletonText,
  Sparkline,
  type SparkSeries,
  Stat,
  Text,
  tokens,
  useClip,
  useSize,
  useTheme,
  type WidgetEditorFrameProps,
  WidgetFrame,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useNow, useRelative } from './time.ts'
import { widgetsNext as messages } from './widgets-next-messages.ts'

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure
const LIST_ROWS = ':scope > li, :scope > [role="listitem"]'
const fill: ViewStyle = { minHeight: 0, flex: 1, overflow: 'hidden' }

export type DraftProps = { frame: WidgetEditorFrameProps; actions?: ReactNode }

/** The sizes a draft takes, as a registry entry would give them: columns and rows, least to most. */
export type DraftSize = { width: [number, number]; height: [number, number] }

function Ui(props: Omit<Parameters<typeof Text>[0], 'size' | 'leading'>) {
  return <Text size={ui.size} leading={ui.leading} {...props} />
}

function Fig(props: Omit<Parameters<typeof Text>[0], 'size' | 'leading' | 'mono'>) {
  return <Text size={figure.size} leading={figure.leading} mono color="text-3" {...props} />
}

/** A draft's frame around a query: its loading and error states, then its body. */
function Loaded<T>({
  frame,
  actions,
  title,
  meta,
  query,
  children,
}: DraftProps & {
  title: string
  meta?: (data: T) => ReactNode
  query: Query<T>
  children: (data: T) => ReactNode
}) {
  const t = useT(messages)
  return (
    <WidgetFrame
      {...frame}
      title={title}
      meta={query.status === 'success' && meta && !frame.editing ? meta(query.data) : undefined}
      actions={actions}
    >
      {query.status === 'loading' ? (
        <View key="loading" aria-busy>
          <SkeletonText lines={3} />
        </View>
      ) : query.status === 'error' ? (
        <View style={{ marginVertical: 'auto', flexShrink: 0 }}>
          <EmptyState
            size="sm"
            tone="error"
            icon="alert"
            level={4}
            title={t('error')}
            action={
              <Button size="sm" onPress={query.refetch}>
                {t('retry')}
              </Button>
            }
          />
        </View>
      ) : (
        children(query.data)
      )}
    </WidgetFrame>
  )
}

function More({ count }: { count: number }) {
  const t = useT(messages)
  if (!count) return null
  return (
    <Press
      role="link"
      {...({ href: '/movies' } as object)}
      style={{ alignSelf: 'flex-start', flexShrink: 0, borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <Text
          variant="caption"
          color={hovered ? 'text' : 'text-3'}
          style={hovered ? { textDecorationLine: 'underline' } : undefined}
        >
          {t('more', { count, page: t('page.movies') })}
        </Text>
      )}
    </Press>
  )
}

// ---------------------------------------------------------------- recently added

export const RECENT_SIZE: DraftSize = { width: [1, 4], height: [3, 6] }
export const RECENT_VARIANTS = ['posters', 'featured', 'list'] as const
export type RecentVariant = (typeof RECENT_VARIANTS)[number]

const RECENT_LIMIT = 24
const WEEK = 7 * 24 * 3_600_000

function useRecent() {
  return useQuery(
    'widget:recently-added',
    (c) => c.movies.recent({ query: { limit: RECENT_LIMIT } }),
    [MEDIA_TOPICS.movies, MEDIA_TOPICS.item],
  )
}

/** "2019 · 1h 52m · Drama": what tells one title from another, in a line. */
function useFacts() {
  const t = useT(messages)
  return (m: Movie, genres = 1) =>
    [
      m.year ? String(m.year) : null,
      m.runtimeMinutes
        ? m.runtimeMinutes >= 60
          ? t('recent.minutes', {
              hours: Math.floor(m.runtimeMinutes / 60),
              minutes: m.runtimeMinutes % 60,
            })
          : t('recent.minutesOnly', { minutes: m.runtimeMinutes })
        : null,
      ...m.genres.slice(0, genres),
    ]
      .filter(Boolean)
      .join(' · ')
}

/** One Recently added, drawn the way the reviewer picked. */
export function RecentDraft({ variant, ...props }: DraftProps & { variant: RecentVariant }) {
  const t = useT(messages)
  const query = useRecent()
  const { now } = useRelative()
  const Body =
    variant === 'posters' ? RecentPosters : variant === 'featured' ? RecentFeatured : RecentList
  return (
    <Loaded
      {...props}
      title={t('recent.title')}
      query={query}
      meta={(xs: Movie[]) => {
        const week = xs.filter((m) => now - Date.parse(m.addedAt) < WEEK).length
        return week ? t('recent.meta', { count: week }) : null
      }}
    >
      {(xs: Movie[]) =>
        xs.length === 0 ? (
          <View style={{ marginVertical: 'auto', flexShrink: 0 }}>
            <EmptyState size="sm" icon="movie" level={4} title={t('recent.none')}>
              {t('recent.noneBody')}
            </EmptyState>
          </View>
        ) : (
          <Body movies={xs} />
        )
      }
    </Loaded>
  )
}

/** The room a poster’s title (two lines at most) and when it was added take under it; narrower than this it drops them. */
const POSTER_WORDS = 88
const POSTER_NAMED = 76

/**
 * Posters: whole rows only. As many columns as the width takes at about 110 each, and more, so
 * narrower, until one row fits the height; each with its title and when it was added.
 */
function RecentPosters({ movies }: { movies: Movie[] }) {
  const { seen } = useRelative()
  const { onLayout, width, height } = useSize()
  const clip = useClip(LIST_ROWS)
  const gap = s['3']
  const widest = (words: number) => (height ? (height - words) / 1.5 : Number.POSITIVE_INFINITY)
  const named = widest(POSTER_WORDS) >= POSTER_NAMED
  const most = Math.max(admin.widgets.poster, widest(named ? POSTER_WORDS : 0))
  const columns = Math.max(
    Math.max(2, Math.min(8, Math.floor((width + gap) / 122))),
    Math.ceil((width + gap) / (most + gap)),
  )
  const poster = Math.floor((width - gap * (columns - 1)) / columns)
  // every whole row the height holds, and no more than the widget would ever show
  const rows = height
    ? Math.max(1, Math.floor((height + gap) / (poster * 1.5 + (named ? POSTER_WORDS : 0) + gap)))
    : 3
  const shown = movies.slice(0, columns * rows)
  return (
    <View onLayout={onLayout} style={{ flex: 1, minHeight: 0, gap: s['2'] }}>
      <View
        ref={clip.ref}
        role="list"
        style={[{ flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap }, fill]}
      >
        {shown.map((m) => (
          <View key={m.id} role="listitem" style={{ width: poster }}>
            <Poster
              title={m.title}
              src={m.art.poster ?? undefined}
              href={`/movies/${m.id}`}
              width={poster}
              showTitle={named}
              titleSize="ui"
              caption={named ? seen(m.addedAt) : undefined}
            />
          </View>
        ))}
      </View>
    </View>
  )
}

/** The versions a movie has, as the library's badges: "4K HDR", "1080p". */
function Versions({ movie, most = 2 }: { movie: Movie; most?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexShrink: 0, gap: s['1'] }}>
      {movie.versions.slice(0, most).map((v) => (
        <Badge key={v.id}>{v.label}</Badge>
      ))}
    </View>
  )
}

/** A line of the list: a small poster, the title over its facts, then its versions and when. */
function RecentRow({ movie, versions }: { movie: Movie; versions: boolean }) {
  const theme = useTheme()
  const facts = useFacts()
  const { seen } = useRelative()
  return (
    <View
      role="listitem"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['2'] + s['0.5'],
        paddingVertical: s['1.5'],
        borderTopWidth: line.thin,
        borderTopColor: theme.colors.line,
      }}
    >
      <View style={{ width: admin.widgets.poster, flexShrink: 0 }}>
        <Poster
          title={movie.title}
          src={movie.art.poster ?? undefined}
          href={`/movies/${movie.id}`}
          width={admin.widgets.poster}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Ui numberOfLines={1}>{movie.title}</Ui>
        <Text variant="caption" color="text-3" numberOfLines={1}>
          {facts(movie)}
        </Text>
      </View>
      {versions ? <Versions movie={movie} /> : null}
      <Fig>{seen(movie.addedAt)}</Fig>
    </View>
  )
}

/** List: the most titles in the least room, one line each. Versions show from 360 wide. */
function RecentList({ movies }: { movies: Movie[] }) {
  const { onLayout, width } = useSize()
  const clip = useClip(LIST_ROWS)
  // two columns of lines once each has room for a title
  const columns = width >= 720 ? 2 : 1
  const shown = movies.slice(0, 12 * columns)
  return (
    <View onLayout={onLayout} style={{ flex: 1, minHeight: 0, gap: s['2'] }}>
      <View
        ref={clip.ref}
        role="list"
        style={[
          {
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            alignContent: 'start',
            // a row is as tall as its line: an `auto` track in a grid shorter than its rows
            // shrinks to their minimum, which react-native-web's `min-height: 0` makes nothing
            // (https://www.w3.org/TR/css-grid-1/#algo-grow-tracks)
            gridAutoRows: 'max-content',
            columnGap: s['5'],
            // the first line has no rule above it: the frame's title is there
            marginTop: -line.thin,
          } as unknown as ViewStyle,
          fill,
        ]}
      >
        {shown.map((m) => (
          <RecentRow key={m.id} movie={m} versions={width / columns >= 360} />
        ))}
      </View>
      <More count={clip.hidden + (movies.length - shown.length)} />
    </View>
  )
}

/** The featured artwork's least and most width: from the widgets' own columns, no new sizes. */
const FEATURED_ART = [
  admin.widgets.progressColumn - admin.widgets.speedColumn,
  admin.widgets.progressColumn * 2 + s['16'] + s['8'],
] as const

/** The room the featured title's words take under its artwork. */
const FEATURED_WORDS = 80

/**
 * Featured: the newest arrival with its artwork, facts and versions, then the ones before it as
 * lines. Side by side from 520 wide, stacked under that; the artwork is never taller than leaves
 * its words in view.
 */
function RecentFeatured({ movies }: { movies: Movie[] }) {
  const t = useT(messages)
  const facts = useFacts()
  const { seen } = useRelative()
  const { onLayout, width, height } = useSize()
  const clip = useClip(LIST_ROWS)
  const [first, ...rest] = movies
  if (!first) return null
  const wide = width >= 520
  const gap = s['4']
  const byHeight = height ? ((height - FEATURED_WORDS) * 16) / 9 : Number.POSITIVE_INFINITY
  const art = Math.floor(
    Math.max(
      FEATURED_ART[0],
      Math.min(wide ? (width - gap) * 0.5 : width, byHeight, FEATURED_ART[1]),
    ),
  )
  const shown = rest.slice(0, 10)
  // stacked, the lines under it show only where one fits with the "more" line; the smallest
  // widget is the newest arrival alone
  const lines = wide || !height || height - ((art * 9) / 16 + FEATURED_WORDS) >= 96
  return (
    <View
      onLayout={onLayout}
      style={{
        flex: 1,
        minHeight: 0,
        flexDirection: wide ? 'row' : 'column',
        gap: wide ? gap : s['3'],
      }}
    >
      <View style={{ width: wide ? art : undefined, flexShrink: 0, gap: s['2'] }}>
        <View style={{ width: art }}>
          <Poster
            title={first.title}
            src={first.art.backdrop ?? first.art.poster ?? undefined}
            aspect="still"
            href={`/movies/${first.id}`}
            width={art}
          />
        </View>
        <View style={{ gap: s['0.5'] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
            <Ui weight={600} numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
              {first.title}
            </Ui>
            <Versions movie={first} />
          </View>
          <Text variant="caption" color="text-2" numberOfLines={1}>
            {facts(first, 2)}
          </Text>
          <Text variant="caption" color="text-3" numberOfLines={1}>
            {t('recent.added', { when: seen(first.addedAt) })}
          </Text>
        </View>
      </View>
      {lines ? (
        <View style={{ flex: 1, minWidth: 0, minHeight: 0, gap: s['2'] }}>
          <View ref={clip.ref} role="list" style={[{ marginTop: wide ? -s['1.5'] : 0 }, fill]}>
            {shown.map((m) => (
              <RecentRow key={m.id} movie={m} versions={false} />
            ))}
          </View>
          <More count={clip.hidden + (rest.length - shown.length)} />
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------- network activity

export const NETWORK_SIZE: DraftSize = { width: [1, 4], height: [2, 4] }

/** One sample: bytes a second coming in, going out and played to clients at home and away. */
export type ActivitySample = { at: number; down: number; up: number; local: number; remote: number }
export type NetworkActivity = {
  samples: ActivitySample[]
  downloads: number
  seeding: number
  streams: { local: number; remote: number }
}

const SERIES = ['down', 'up', 'streams'] as const
type SeriesKey = (typeof SERIES)[number]
type Filter = 'all' | SeriesKey

/**
 * Each series' colour, in the data visualisation order (color.md › Data visualisation: `accent`,
 * `accent-2`, `info`), and its own line, so none is told from another by colour alone.
 */
const LOOK: Record<SeriesKey, { color: ColorRole; dash?: SparkSeries['dash'] }> = {
  down: { color: 'accent' },
  up: { color: 'accent-2', dash: 'dashed' },
  streams: { color: 'info', dash: 'dotted' },
}

/** A series' line as the legend shows it: solid, dashed or dotted, as the chart draws it. */
function Swatch({ series }: { series?: SeriesKey }) {
  const theme = useTheme()
  // as thick as the chart's line would be drawn, rounded up to whole pixels
  const h = s['0.5']
  const bar = (key: string, width: number, color: ColorRole) => (
    <View
      key={key}
      style={{ width, height: h, borderRadius: h / 2, backgroundColor: theme.colors[color] }}
    />
  )
  const look = series ? LOOK[series] : null
  return (
    <View
      aria-hidden
      style={{
        width: s['4'],
        flexShrink: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['0.5'],
      }}
    >
      {look === null
        ? // all: a little of each
          SERIES.map((k) => bar(k, 4, LOOK[k].color))
        : look.dash === 'dashed'
          ? [bar('a', 7, look.color), bar('b', 7, look.color)]
          : look.dash === 'dotted'
            ? [0, 1, 2, 3].map((i) => bar(String(i), 2.5, look.color))
            : bar('a', 16, look.color)}
    </View>
  )
}

/** The legend's column beside the chart, and the weather's beside its days: a name and a figure. */
const LEGEND = admin.widgets.metaMax + s['12']

/** The whole network: downloads, uploads and streams over time, the legend choosing which to draw. */
export function NetworkDraft({
  activity,
  minutes = 10,
  ...props
}: DraftProps & { activity: NetworkActivity; minutes?: number }) {
  const t = useT(messages)
  const [filter, setFilter] = useState<Filter>('all')
  const { onLayout, width, height } = useSize()
  const latest = activity.samples[activity.samples.length - 1]
  const now = {
    down: latest?.down ?? 0,
    up: latest?.up ?? 0,
    streams: (latest?.local ?? 0) + (latest?.remote ?? 0),
  }
  const values: Record<SeriesKey, number[]> = {
    down: activity.samples.map((x) => x.down),
    up: activity.samples.map((x) => x.up),
    streams: activity.samples.map((x) => x.local + x.remote),
  }
  const drawn = SERIES.filter((k) => filter === 'all' || filter === k)
  const peak = Math.max(0, ...drawn.flatMap((k) => values[k]))
  const playing = activity.streams.local + activity.streams.remote
  const captions: Record<Filter, string> = {
    all: t('network.allCaption'),
    down: t('network.downCaption', { count: activity.downloads }),
    up: t('network.upCaption', { count: activity.seeding }),
    streams: playing ? t('network.streamsCaption', activity.streams) : t('network.noStreams'),
  }
  const rates: Record<Filter, number> = { all: now.down + now.up + now.streams, ...now }
  // beside the chart where there's room for both, above it in a narrow widget
  const beside = width >= 440
  // a caption under each label where the height has room for four of them
  const roomy = beside && height >= 4 * 44
  // the smallest widget: the four lines close up and the chart gives its axis line away
  const dense = !beside && height > 0 && height < 170
  const item = (f: Filter) => {
    const on = filter === f
    const [value, unit] = rateParts(rates[f])
    return (
      <Press
        key={f}
        role="radio"
        aria-checked={on}
        onPress={() => setFilter(f)}
        style={{ borderRadius: tokens.radius.sm, minWidth: 0 }}
      >
        {({ hovered }) => (
          <SeriesRow
            on={on}
            hovered={hovered}
            dense={dense}
            swatch={<Swatch series={f === 'all' ? undefined : f} />}
            label={t(`network.${f}`)}
            caption={roomy ? captions[f] : undefined}
            value={value}
            unit={unit}
          />
        )}
      </Press>
    )
  }
  return (
    <WidgetFrame
      {...props.frame}
      title={t('network.title')}
      meta={props.frame.editing ? undefined : t('network.meta', { minutes })}
      actions={props.actions}
    >
      <View
        onLayout={onLayout}
        style={{
          flex: 1,
          minHeight: 0,
          flexDirection: beside ? 'row' : 'column',
          gap: beside ? s['4'] : s['2'],
        }}
      >
        <View
          role="radiogroup"
          aria-label={t('network.filter')}
          style={{ width: beside ? LEGEND : undefined, flexShrink: 0, gap: dense ? 0 : s['0.5'] }}
        >
          {(['all', ...SERIES] as const).map(item)}
        </View>
        <View
          role="img"
          aria-label={t('network.chart', {
            minutes,
            down: rate(now.down),
            up: rate(now.up),
            streams: rate(now.streams),
          })}
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: admin.widgets.graphMin,
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <View style={{ flex: 1, minHeight: 0 }}>
            <Sparkline
              height={'100%' as unknown as number}
              series={drawn.map((k) => ({
                values: values[k],
                color: LOOK[k].color,
                dash: LOOK[k].dash,
                fill: k === 'down' || drawn.length === 1,
              }))}
            />
          </View>
          {dense ? null : (
            <Axis
              start={t('network.ago', { minutes })}
              middle={t('network.peak', { rate: rate(peak) })}
              end={t('network.now')}
            />
          )}
        </View>
      </View>
    </WidgetFrame>
  )
}

/** Under the chart: when it starts, its tallest point, and now. Mono caption in `text-3`. */
function Axis({ start, middle, end }: { start: string; middle: string; end: string }) {
  const theme = useTheme()
  return (
    <View
      aria-hidden
      style={{
        flexShrink: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: s['2'],
        paddingTop: s['0.5'],
        borderTopWidth: line.thin,
        borderTopColor: theme.colors.line,
      }}
    >
      <Fig numberOfLines={1}>{start}</Fig>
      <Fig numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>
        {middle}
      </Fig>
      <Fig numberOfLines={1}>{end}</Fig>
    </View>
  )
}

/** A legend entry: its line, its name and what it's doing now. Chosen, it's tinted and bolder. */
function SeriesRow({
  on,
  dense,
  hovered,
  swatch,
  label,
  caption,
  value,
  unit,
}: {
  on: boolean
  dense: boolean
  hovered: boolean
  swatch: ReactNode
  label: string
  caption?: string
  value: string
  unit: string
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s['2'],
        paddingHorizontal: s['1.5'],
        paddingVertical: dense ? 0 : s['0.5'] + line.thin,
        borderRadius: tokens.radius.sm,
        backgroundColor: on ? theme.colors.s3 : hovered ? theme.colors.s2 : 'transparent',
      }}
    >
      {swatch}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Ui weight={on ? 600 : 400} color={on ? 'text' : 'text-2'} numberOfLines={1}>
          {label}
        </Ui>
        {caption ? (
          <Text variant="caption" color="text-3" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
      <Text size={figure.size} leading={figure.leading} mono color={on ? 'text' : 'text-2'}>
        {value}
        <Text size={figure.size} leading={figure.leading} mono color="text-3">
          {` ${unit}`}
        </Text>
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------- date and time

export const CLOCK_SIZE: DraftSize = { width: [1, 2], height: [2, 3] }

/** "UTC+1", from the zone's own offset at that moment. */
function offsetOf(at: number, timeZone: string) {
  const part = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value
  return (part ?? 'UTC').replace('GMT', 'UTC')
}

/** The ISO week's number of a date, read on the zone's own calendar. */
function weekOf(at: number, timeZone: string) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone }).format(at).split('-').map(Number)
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  // the Thursday of this week decides its year (ISO 8601)
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const first = Date.UTC(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - first) / 86_400_000 + 1) / 7)
}

/**
 * The server's date and time, in its language and time zone (Settings › General). One widget, not
 * two: the smallest cell holds both, they come from the same two settings, and the month already
 * has the Calendar widget. The viewer's own time shows only when their zone differs.
 */
export function ClockDraft(props: DraftProps) {
  const t = useT(messages)
  const query = useQuery('settings:general', (c) => c.settings.general())
  // a second's tick, so the minute turns when it does
  const now = useNow(1000)
  return (
    <Loaded
      {...props}
      title={t('clock.title')}
      query={query}
      meta={(g) => offsetOf(now, g.timeZone)}
    >
      {(g) => {
        const fmt = (o: Intl.DateTimeFormatOptions) =>
          new Intl.DateTimeFormat(g.language, { timeZone: g.timeZone, ...o }).format(now)
        const time = fmt({ hour: 'numeric', minute: '2-digit' })
        const date = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        const here = Intl.DateTimeFormat().resolvedOptions().timeZone
        const yours =
          offsetOf(now, here) === offsetOf(now, g.timeZone)
            ? null
            : new Intl.DateTimeFormat(g.language, { hour: 'numeric', minute: '2-digit' }).format(
                now,
              )
        const tall = (props.frame.rows ?? 2) >= 3
        return (
          <View
            aria-label={t('clock.label', { time, date })}
            style={{ flex: 1, minHeight: 0, gap: s['1.5'] }}
          >
            <Stat value={time} caption={date} />
            <Text variant="caption" color="text-3" numberOfLines={1}>
              {t('clock.zone', {
                zone: g.timeZone.replaceAll('_', ' '),
                week: weekOf(now, g.timeZone),
              })}
            </Text>
            {yours && tall ? (
              <Text variant="caption" color="text-3" numberOfLines={1}>
                {t('clock.yours', { time: yours })}
              </Text>
            ) : null}
          </View>
        )
      }}
    </Loaded>
  )
}

// ---------------------------------------------------------------- weather

export const WEATHER_SIZE: DraftSize = { width: [1, 2], height: [2, 4] }

export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'showers'
  | 'thunderstorm'
  | 'snow'

export type Weather = {
  place: string
  updatedAt: number
  /** Degrees Celsius, km/h and percent. */
  current: {
    temperature: number
    feelsLike: number
    condition: WeatherCondition
    wind: number
    humidity: number
  }
  days: { at: number; high: number; low: number; condition: WeatherCondition; rain: number }[]
}

export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const
export const WIND_UNITS = ['kmh', 'mph', 'ms'] as const
export type WeatherUnits = {
  temperature: (typeof TEMPERATURE_UNITS)[number]
  wind: (typeof WIND_UNITS)[number]
}

/** Each wind unit as Intl names it, and how many of it a kilometre an hour is. */
const WIND = {
  kmh: { unit: 'kilometer-per-hour', per: 1 },
  mph: { unit: 'mile-per-hour', per: 0.621371 },
  ms: { unit: 'meter-per-second', per: 1 / 3.6 },
} as const

/**
 * The weather where the server is: now, then the next days as lines. An icon and words name each
 * condition, never the icon alone. The figures arrive metric and are written in the units the
 * server's settings will name (the owner's answer of 2026-11-17); the page's controls stand in.
 */
export function WeatherDraft({
  weather,
  units = { temperature: 'celsius', wind: 'kmh' },
  ...props
}: DraftProps & { weather: Weather; units?: WeatherUnits }) {
  const t = useT(messages)
  const locale = useLocale()
  const theme = useTheme()
  const { seen } = useRelative()
  const clip = useClip(LIST_ROWS)
  const { onLayout, width } = useSize()
  const degrees = (n: number) =>
    `${Math.round(units.temperature === 'fahrenheit' ? (n * 9) / 5 + 32 : n)}°`
  const wind = WIND[units.wind]
  const day = (at: number, i: number) =>
    i === 0 ? t('weather.today') : new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(at)
  const now = weather.current
  const today = weather.days[0]
  const wide = width >= 440
  const details = [
    t('weather.feels', { temperature: degrees(now.feelsLike) }),
    today ? t('weather.range', { high: degrees(today.high), low: degrees(today.low) }) : null,
  ].filter(Boolean)
  const more = [
    t('weather.wind', {
      speed: new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: wind.unit,
        maximumFractionDigits: 0,
      }).format(now.wind * wind.per),
    }),
    t('weather.humidity', { percent: `${now.humidity}%` }),
  ]
  return (
    <WidgetFrame
      {...props.frame}
      title={t('weather.title')}
      meta={props.frame.editing ? undefined : weather.place}
      actions={props.actions}
    >
      <View
        onLayout={onLayout}
        style={{
          flex: 1,
          minHeight: 0,
          flexDirection: wide ? 'row' : 'column',
          gap: wide ? s['5'] : s['2'],
        }}
      >
        <View style={{ flexShrink: 0, gap: s['1'], width: wide ? LEGEND : undefined }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: s['2.5'] }}>
            <View style={{ paddingTop: s['1'] }}>
              <Icon name={`weather-${now.condition}`} size={tokens.icon.size.lg} color="text-2" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Stat
                value={degrees(now.temperature)}
                unit={t(`weather.condition.${now.condition}`)}
                caption={details.join(' · ')}
              />
            </View>
          </View>
          {wide ? (
            <>
              <Text variant="caption" color="text-3">
                {more.join(' · ')}
              </Text>
              <Text variant="caption" color="text-3">
                {t('weather.updated', { when: seen(new Date(weather.updatedAt).toISOString()) })}
              </Text>
            </>
          ) : null}
        </View>
        <View
          ref={clip.ref}
          role="list"
          aria-label={t('weather.days')}
          style={[{ minWidth: 0 }, fill]}
        >
          {weather.days.slice(wide ? 0 : 1).map((d, i) => (
            <View
              key={d.at}
              role="listitem"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s['2'],
                paddingVertical: s['1'],
                borderTopWidth: line.thin,
                borderTopColor: theme.colors.line,
              }}
            >
              <Ui
                color="text-2"
                style={{ width: wide ? s['12'] + s['1'] : s['8'] + s['1'] }}
                numberOfLines={1}
              >
                {day(d.at, wide ? i : i + 1)}
              </Ui>
              <Icon name={`weather-${d.condition}`} size={tokens.icon.size.sm} color="text-2" />
              <Ui numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {t(`weather.condition.${d.condition}`)}
              </Ui>
              {d.rain >= 30 ? <Fig>{t('weather.rain', { percent: `${d.rain}%` })}</Fig> : null}
              <Fig color="text-2">{`${degrees(d.high)} / ${degrees(d.low)}`}</Fig>
            </View>
          ))}
        </View>
      </View>
    </WidgetFrame>
  )
}
