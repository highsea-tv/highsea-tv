'use client'

// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard's Recently added (HT-60, drafted in HT-47 at `#/admin/widgets-next`): the library's
// newest movies three ways, the widget's own setting. Featured (the owner's pick of 2026-11-17)
// gives the newest arrival its artwork, facts and versions and lists the ones before it; Posters
// fits whole rows of posters; List puts the most titles in the least room. A layout saved before
// HT-60 has no variant and takes Featured, in the old widget's place.

import { MEDIA_TOPICS, type Movie } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { type RecentVariant, widgetDefinition } from '@highsea-tv/personalization/widgets'
import { useQuery } from '@highsea-tv/sdk/react'
import { admin, line } from '@highsea-tv/tokens'
import {
  Badge,
  Poster,
  Skeleton,
  Text,
  tokens,
  useClip,
  useSize,
  useTheme,
} from '@highsea-tv/ui/native'
import { View, type ViewStyle } from 'react-native'
import { widgets as messages } from './dashboard-messages.ts'
import { useRelative } from './time.ts'
import {
  Empty,
  Fig,
  fill,
  LIST_ROWS,
  More,
  Static,
  Ui,
  useSource,
  Widget,
  type WidgetProps,
} from './widget-parts.tsx'

const s = tokens.space
const MOVIE_TOPICS = [MEDIA_TOPICS.movies, MEDIA_TOPICS.item]
/** The most the widget shows: eight columns of posters, three rows. */
const RECENT_LIMIT = 24
const WEEK = 7 * 24 * 3_600_000

export const recentVariant = (settings: Record<string, unknown>): RecentVariant =>
  widgetDefinition('recently-added').settings.parse(settings).variant as RecentVariant

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

export function RecentlyAdded(props: WidgetProps) {
  const t = useT(messages)
  const movies = useSource('movies')
  if (movies) return <RecentMovies {...props} />
  return (
    <Static {...props} kind="recently-added">
      {movies === undefined ? (
        <PosterSkeletonRow />
      ) : (
        <Empty size="sm" icon="movie" level={4} title={t('recent.none')}>
          {t('recent.noneBody')}
        </Empty>
      )}
    </Static>
  )
}

function RecentMovies(props: WidgetProps) {
  const t = useT(messages)
  const variant = recentVariant(props.settings)
  const { now } = useRelative()
  const query = useQuery(
    'widget:recently-added',
    (c) => c.movies.recent({ query: { limit: RECENT_LIMIT } }),
    MOVIE_TOPICS,
  )
  const Body =
    variant === 'posters' ? RecentPosters : variant === 'list' ? RecentList : RecentFeatured
  return (
    <Widget
      {...props}
      kind="recently-added"
      query={query}
      skeleton={<PosterSkeletonRow />}
      meta={(xs: Movie[]) => {
        const week = xs.filter((m) => now - Date.parse(m.addedAt) < WEEK).length
        return week ? t('recent.meta', { count: week }) : null
      }}
    >
      {(xs: Movie[]) =>
        xs.length === 0 ? (
          <Empty size="sm" icon="movie" level={4} title={t('recent.none')}>
            {t('recent.addedBody')}
          </Empty>
        ) : (
          <Body movies={xs} />
        )
      }
    </Widget>
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

/** The line under a clipped list of movies: "3 more in Movies". */
function MoreMovies({ count }: { count: number }) {
  const t = useT(messages)
  return <More count={count} page={t('page.movies')} path="/movies" />
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
      <MoreMovies count={clip.hidden + (movies.length - shown.length)} />
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
          <MoreMovies count={clip.hidden + (rest.length - shown.length)} />
        </View>
      ) : null}
    </View>
  )
}
