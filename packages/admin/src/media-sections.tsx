'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The media page's shared anatomy (docs/product/media-pages.md#layout), ported from the
// prototype's media/sections.tsx: the summary card, the Overview's rows (cast, trailers,
// collection, More like this) and its About aside, and the Cast and crew tab. Used by every state
// of a movie's page, and by the collection page for its parts. What real TMDB data changes
// (checkpoint 4, Fields and how they map): trailers have no length and use the movie's backdrop
// as their still; crew is grouped by TMDB's 12 departments; IMDb and Wikidata links may be missing.

import type {
  Collection,
  Credit,
  DiscoverMovie,
  MovieMetadata,
  Video,
} from '@highsea-tv/api-contract'
import { DEPARTMENTS } from '@highsea-tv/api-contract'
import { duration } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { type Query, useQuery } from '@highsea-tv/sdk/react'
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Details,
  Dialog,
  Embed,
  EmptyState,
  Icon,
  type IconName,
  Image,
  Poster,
  Press,
  QualityTag,
  Rating,
  Row,
  Skeleton,
  SkeletonText,
  Text,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { Fragment, type ReactNode, useState } from 'react'
import { useWindowDimensions, View, type ViewStyle } from 'react-native'
import { Loadable } from './loadable.tsx'
import { collectionPath, moviePath, personPath } from './media-links.ts'
import { media as messages } from './media-sections-messages.ts'
import { keyRejected, tmdbBusy } from './metadata-locale.ts'
import { METADATA_SETTINGS } from './movie-data.ts'
import { useNow } from './time.ts'

/** What every title has, in or out of the library. */
export type TitleBase = Pick<
  DiscoverMovie,
  'title' | 'year' | 'runtimeMinutes' | 'genres' | 'rating' | 'synopsis' | 'art'
>

export type MetadataQuery = Query<MovieMetadata>

/**
 * A movie's metadata by TMDB id, in any state. Refetched when the library changes, so
 * `inLibrary` follows, and after a refresh.
 */
export const useMovieMetadata = (id: number) =>
  useQuery(`metadata:${id}`, (c) => c.metadata.movie({ params: { id } }), [
    'movies.updated',
    'metadata.updated',
  ])

// ---------------------------------------------------------------- formatting

/**
 * "1 June 1922". English reads day-month-year, as the prototype and @highsea-tv/core/format do;
 * TMDB's release dates are calendar days, so they're formatted in UTC and never shift a day.
 */
export function useLongDate() {
  const locale = useLocale()
  const format = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return (iso: string) => format.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso))
}

/** Whether a release day has come, by the calendar day in UTC. */
const releasedBy = (day: string, now: number) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`) <= now

/** The admin's ui type (13). */
const ui = tokens.adminText.ui
/** Running text's measure, the web's `max-w-[65ch]` at the body size. */
const MEASURE = 600
/** CSS grid through a View's style, which react-native-web writes as given. */
const grid = (style: Record<string, unknown>) =>
  ({ display: 'grid', ...style }) as unknown as ViewStyle

/**
 * A link inside running text, in `text` and underlined (the web's `textLink`): a nested Text with
 * an address, which react-native-web draws as an `<a>` (https://necolas.github.io/react-native-web/docs/text/).
 */
function InlineLink({
  href,
  children,
  external,
  numberOfLines,
  size,
}: {
  href: string
  children: string
  external?: boolean
  numberOfLines?: number
  size?: number
}) {
  const [over, setOver] = useState(false)
  const { colors } = useTheme()
  return (
    <Text
      role="link"
      {...({
        href,
        ...(external ? { hrefAttrs: { target: '_blank', rel: 'noreferrer' } } : {}),
      } as object)}
      size={size}
      color="text"
      numberOfLines={numberOfLines}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{
        textDecorationLine: 'underline',
        textDecorationColor: over ? colors.text : colors['text-3'],
      }}
    >
      {children}
    </Text>
  )
}

/** "A", "A and B", "A, B and C", each a link to the person. */
function People({ people }: { people: Credit[] }) {
  const t = useT(messages)
  return (
    <>
      {people.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && (i === people.length - 1 ? t('and') : t('comma'))}
          <InlineLink href={personPath(p.personId)}>{p.name}</InlineLink>
        </Fragment>
      ))}
    </>
  )
}

// ---------------------------------------------------------------- page states

/**
 * A metadata route's failure as a page: an id TMDB doesn't know (404), no TMDB key (503
 * `no-tmdb-key`) or one it refused (400 `tmdb-key-rejected`), or TMDB not answering or limiting (503 `tmdb-unreachable`, 429
 * `tmdb-rate-limited`), which are both "try again in a moment".
 */
export function MetadataError({
  error,
  icon = 'movie',
  unknown,
}: {
  error: Error
  icon?: IconName
  /** The 404's title and sentence, for a person or a collection. */
  unknown?: { title: string; body: string }
}) {
  const t = useT(messages)
  const e = error as ApiError
  const reason = (e.details as { reason?: string } | undefined)?.reason
  if (e.status === 404)
    return (
      <EmptyState
        tone="error"
        icon={icon}
        title={unknown?.title ?? t('unknown.title')}
        action={<Button href="/discover">{t('unknown.action')}</Button>}
      >
        {unknown?.body ?? t('unknown.body')}
      </EmptyState>
    )
  // no key, or one TMDB stopped accepting: both are fixed in Settings › General
  if (reason === 'no-tmdb-key' || keyRejected(reason))
    return (
      <EmptyState
        icon="key"
        title={reason === 'no-tmdb-key' ? t('noKey.title') : t('keyRejected.title')}
        action={<Button href={METADATA_SETTINGS}>{t('noKey.action')}</Button>}
      >
        {reason === 'no-tmdb-key' ? t('noKey.body') : t('keyRejected.body')}
      </EmptyState>
    )
  return (
    <EmptyState tone="error" icon={icon} title={t('unavailable.title')}>
      {tmdbBusy(reason) ? t('unavailable.body') : e.message}
    </EmptyState>
  )
}

// ---------------------------------------------------------------- summary

/** The summary's poster column from medium (the web's 9rem), and its width below (w-32). */
const SUMMARY_POSTER = { column: 144, compact: 128 }

/**
 * The summary card's frame (a movie's, a person's): edged in `line` on `s1`, the poster beside
 * the rest from medium and above it below. Shared with person.tsx.
 */
export function SummaryCard({
  label,
  backdrop,
  poster,
  children,
}: {
  label?: string
  backdrop?: string | null
  poster: (width: number | undefined) => ReactNode
  children: ReactNode
}) {
  const { colors } = useTheme()
  const medium = useWindowAtLeast(breakpoints.medium)
  return (
    <View
      role={label ? 'region' : undefined}
      aria-label={label}
      style={{
        position: 'relative',
        overflow: 'hidden',
        flexDirection: medium ? 'row' : 'column',
        alignItems: 'flex-start',
        gap: tokens.space['5'],
        padding: medium ? tokens.space['5'] : tokens.space['4'],
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.s1,
      }}
    >
      {backdrop ? (
        <Image
          source={{ uri: backdrop }}
          aria-hidden
          contentFit="cover"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.15 }}
        />
      ) : null}
      <View style={{ width: medium ? SUMMARY_POSTER.column : SUMMARY_POSTER.compact }}>
        {poster(medium ? SUMMARY_POSTER.column : SUMMARY_POSTER.compact)}
      </View>
      <View style={{ flex: medium ? 1 : undefined, minWidth: 0, gap: tokens.space['3'] }}>
        {children}
      </View>
    </View>
  )
}

/** A middle dot between a meta line's parts, hidden from assistive tech. */
const Dot = () => (
  <Text variant="caption" color="text-2" aria-hidden>
    ·
  </Text>
)

export function MediaSummary({
  item: m,
  meta,
  badges,
  children,
}: {
  item: TitleBase
  meta?: MovieMetadata
  /** Library status and quality tags, or "Not in the library". */
  badges?: ReactNode
  /** The last line: the library's path and Monitored, or the release date. */
  children?: ReactNode
}) {
  const t = useT(messages)
  const locale = useLocale()
  const directors = meta?.crew.filter((c) => c.job === 'Director') ?? []
  return (
    <SummaryCard
      label={t('summary')}
      backdrop={m.art.backdrop}
      poster={(width) => <Poster title={m.title} src={m.art.poster ?? undefined} width={width} />}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: tokens.space['2'],
        }}
      >
        {m.year !== null && (
          <>
            <Text variant="caption" color="text-2" mono>
              {String(m.year)}
            </Text>
            <Dot />
          </>
        )}
        <Text variant="caption" color="text-2">
          {m.runtimeMinutes ? duration(m.runtimeMinutes * 60, locale) : t('runtime.unknown')}
        </Text>
        {meta?.certification && (
          <>
            <Dot />
            <QualityTag overlay={false}>{meta.certification}</QualityTag>
          </>
        )}
        {m.genres.length > 0 && (
          <>
            <Dot />
            <Text variant="caption" color="text-2">
              {m.genres.join(t('comma'))}
            </Text>
          </>
        )}
        {m.rating > 0 && <Rating value={m.rating} size={12} showValue />}
      </View>
      {meta?.tagline && (
        <Text variant="body" color="text-2">
          {t('tagline', { tagline: meta.tagline })}
        </Text>
      )}
      {badges && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: tokens.space['2'],
          }}
        >
          {badges}
        </View>
      )}
      {m.synopsis && (
        <Text variant="body" color="text-2" style={{ maxWidth: MEASURE }}>
          {m.synopsis}
        </Text>
      )}
      {directors.length > 0 && (
        <Text variant="caption" color="text-2">
          {t('directedBy')} <People people={directors} />
        </Text>
      )}
      {children}
    </SummaryCard>
  )
}

/** A poster's placeholder at a width, or the column's. */
function PosterBlock({ width }: { width?: number }) {
  return (
    <View style={{ width: width ?? '100%', aspectRatio: 2 / 3 }}>
      <Skeleton height="100%" radius={tokens.radius.poster} />
    </View>
  )
}

export function SummarySkeleton() {
  const medium = useWindowAtLeast(breakpoints.medium)
  return (
    <View aria-busy style={{ flexDirection: medium ? 'row' : 'column', gap: tokens.space['5'] }}>
      <View style={{ width: medium ? 160 : '100%' }}>
        <PosterBlock />
      </View>
      <View style={{ flex: medium ? 1 : undefined }}>
        <SkeletonText lines={4} />
      </View>
    </View>
  )
}

/** "Released 1 June 1922" or "Releases 6 November 2026". */
export function ReleaseLine({ date }: { date: string | null }) {
  const t = useT(messages)
  const now = useNow()
  const long = useLongDate()
  return (
    <Text variant="caption" color="text-3">
      {date === null
        ? t('release.unknown')
        : releasedBy(date, now)
          ? t('released', { date: long(date) })
          : t('releases', { date: long(date) })}
    </Text>
  )
}

// ---------------------------------------------------------------- grids

/** A grid of posters, as many 136-wide columns as fit (Discover's, a person's Known for). */
export function PosterGrid({ children, min = 136 }: { children: ReactNode; min?: number }) {
  return (
    <View
      role="list"
      style={grid({
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        columnGap: tokens.space['4'],
        rowGap: tokens.space['5'],
      })}
    >
      {children}
    </View>
  )
}

/** One of a PosterGrid's items: `full` spans every column, `busy` is a placeholder. */
export function GridItem({
  children,
  gap,
  full,
  busy,
}: {
  children: ReactNode
  gap?: number
  full?: boolean
  busy?: boolean
}) {
  return (
    <View
      role="listitem"
      aria-busy={busy || undefined}
      style={[
        { gap, alignItems: full ? 'flex-start' : undefined },
        full ? grid({ gridColumn: '1 / -1' }) : null,
      ]}
    >
      {children}
    </View>
  )
}

/** In library as a badge that links to the movie's page (Discover's results, a filmography). */
export function InLibraryLink({
  href,
  label,
  text,
}: {
  href: string
  label: string
  text: string
}) {
  return (
    <Press
      role="link"
      {...({ href } as object)}
      accessibilityLabel={label}
      style={{ alignSelf: 'flex-start', borderRadius: tokens.radius.pill }}
    >
      <Badge tone="success">{text}</Badge>
    </Press>
  )
}

// ---------------------------------------------------------------- overview

/**
 * Two columns from expanded: the rows, then a 20rem aside. `main` and `aside` lead their column
 * (the library's In the library).
 */
export function MediaOverview({
  meta,
  main,
  aside,
  onAllCast,
  onAdd,
}: {
  meta: MetadataQuery
  main?: ReactNode
  aside?: ReactNode
  onAllCast: () => void
  /** Add these movies (a collection's missing parts). */
  onAdd: (movies: DiscoverMovie[]) => void
}) {
  const t = useT(messages)
  const expanded = useWindowAtLeast(breakpoints.expanded)
  return (
    <View style={{ flexDirection: expanded ? 'row' : 'column', gap: tokens.space['8'] }}>
      <View style={{ flex: expanded ? 1 : undefined, minWidth: 0, gap: tokens.space['8'] }}>
        {main}
        <Loadable query={meta} what={t('details')} skeleton={<RowSkeleton />}>
          {(md) => (
            <>
              {md.cast.length > 0 && <CastRow cast={md.cast} onAll={onAllCast} />}
              {md.videos.length > 0 && <TrailersRow videos={md.videos} />}
              {md.collection && (
                <MovieCollectionRow id={md.collection.id} current={md.id} onAdd={onAdd} />
              )}
              <MoreLikeThis id={md.id} />
            </>
          )}
        </Loadable>
      </View>
      <View style={{ width: expanded ? 320 : undefined, minWidth: 0, gap: tokens.space['8'] }}>
        {aside}
        {meta.status === 'success' && <About meta={meta.data} />}
      </View>
    </View>
  )
}

export function RowSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: tokens.space['4'], overflow: 'hidden' }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <PosterBlock key={i} width={112} />
      ))}
    </View>
  )
}

/** A width that follows the window between two ends, as CSS's clamp() of a vw share. */
const useClamped = (min: number, share: number, max: number) =>
  Math.round(Math.min(Math.max(min, useWindowDimensions().width * share), max))

/** People in the admin's rows: the web's clamp(6rem, 9vw, 7.5rem). */
const usePersonWidth = () => useClamped(96, 0.09, 120)
/**
 * Titles in the admin's rows: smaller than the clients' default, since the column is narrower
 * (the web's clamp(7rem, 11vw, 8.5rem)).
 */
export const useTitleWidth = () => useClamped(112, 0.11, 136)
/** Trailers' stills: the web's clamp(12rem, 22vw, 16rem). */
const useStillWidth = () => useClamped(192, 0.22, 256)

function CastRow({ cast, onAll }: { cast: Credit[]; onAll: () => void }) {
  const t = useT(messages)
  const width = usePersonWidth()
  return (
    <Row
      inset={0}
      title={t('cast')}
      action={
        <Button size="sm" variant="ghost" onPress={onAll}>
          {t('allCast')}
        </Button>
      }
      items={cast.slice(0, 10)}
      keyOf={(c) => c.id}
      render={(c) => (
        <Poster
          title={c.name}
          src={c.photo ?? undefined}
          href={personPath(c.personId)}
          showTitle
          titleSize="ui"
          caption={c.character ?? undefined}
          width={width}
        />
      )}
    />
  )
}

function TrailersRow({ videos }: { videos: Video[] }) {
  const t = useT(messages)
  const width = useStillWidth()
  const [playing, setPlaying] = useState<Video | null>(null)
  return (
    <>
      <Row
        inset={0}
        title={t('trailers')}
        items={videos}
        keyOf={(v) => v.id}
        render={(v) => (
          <Poster
            title={v.name}
            src={v.still ?? undefined}
            aspect="still"
            onPress={() => setPlaying(v)}
            showTitle
            titleSize="ui"
            // TMDB gives no duration, so the kind alone (checkpoint 4, Fields and how they map)
            caption={t(`kind.${v.kind}`)}
            width={width}
            status={
              <View aria-hidden>
                <Badge overlay dot={false} icon="play">
                  {''}
                </Badge>
              </View>
            }
          />
        )}
      />
      <TrailerDialog video={playing} onClose={() => setPlaying(null)} />
    </>
  )
}

/**
 * The player's address, loaded only once someone clicks a trailer (media-pages.md § Interactions):
 * YouTube's privacy-enhanced mode, youtube-nocookie.com (YouTube Help, "Embed videos and
 * playlists"), and Vimeo's player with `dnt=1`, which stops it tracking the session (Vimeo Help,
 * "Using player parameters").
 */
export const playerUrl = (v: Pick<Video, 'site' | 'key'>) =>
  v.site === 'YouTube'
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.key)}?autoplay=1`
    : `https://player.vimeo.com/video/${encodeURIComponent(v.key)}?autoplay=1&dnt=1`

function TrailerDialog({ video: v, onClose }: { video: Video | null; onClose: () => void }) {
  const t = useT(messages)
  const long = useLongDate()
  const { colors } = useTheme()
  return (
    <Dialog open={!!v} onClose={onClose} closable size="lg" title={v?.name ?? t('trailers')}>
      {v && (
        <View style={{ gap: tokens.space['3'] }}>
          <View
            style={{
              aspectRatio: 16 / 9,
              overflow: 'hidden',
              borderRadius: tokens.radius.md,
              backgroundColor: colors.s2,
            }}
          >
            {/* Embed sends only the origin as the referrer, as YouTube's embeds need */}
            <Embed src={playerUrl(v)} title={t('trailer.frame', { name: v.name, site: v.site })} />
          </View>
          <Text variant="caption" color="text-3">
            {v.publishedAt
              ? t('trailer.caption', { kind: t(`kind.${v.kind}`), date: long(v.publishedAt) })
              : t(`kind.${v.kind}`)}
          </Text>
        </View>
      )}
    </Dialog>
  )
}

/** A poster of another title, marked if it's in the library. */
export function TitlePoster({ t: m, width }: { t: DiscoverMovie; width?: number }) {
  const t = useT(messages)
  return (
    <Poster
      title={m.title}
      src={m.art.poster ?? undefined}
      href={moviePath(m.id)}
      showTitle
      titleSize="ui"
      caption={m.year === null ? undefined : String(m.year)}
      width={width}
      status={
        m.inLibrary ? (
          <Badge overlay tone="success">
            {t('inLibrary')}
          </Badge>
        ) : undefined
      }
    />
  )
}

/** A collection's live parts; refetched as titles are added, so the badges follow. */
export const useCollection = (id: number) =>
  useQuery(`collection:${id}`, (c) => c.metadata.collection({ params: { id } }), [
    'movies.updated',
    'metadata.updated',
  ])

/**
 * A collection's parts in release order, how many are here, and Add {n} missing. The row on a
 * movie's page names the collection and links to its page (`href`); the collection's own page
 * titles it itself.
 */
export function CollectionRow({
  collection: c,
  title,
  href,
  current,
  onAdd,
}: {
  collection: Collection
  title: string
  /** The title links here: the collection's page. */
  href?: string
  /** The movie whose page this is: shown as "This one", not linked. */
  current?: number
  onAdd: (movies: DiscoverMovie[]) => void
}) {
  const t = useT(messages)
  const width = useTitleWidth()
  const missing = c.parts.filter((p) => !p.inLibrary)
  const here = c.parts.length - missing.length
  return (
    <Row
      inset={0}
      title={title}
      titleHref={href}
      suffix={t('collection.suffix', { here, total: c.parts.length })}
      action={
        missing.length > 0 ? (
          <Button size="sm" icon="add" onPress={() => onAdd(missing)}>
            {t('collection.addMissing', { count: missing.length })}
          </Button>
        ) : undefined
      }
      items={c.parts}
      keyOf={(p) => p.id}
      render={(p) =>
        p.id === current ? (
          <Poster
            title={p.title}
            src={p.art.poster ?? undefined}
            showTitle
            titleSize="ui"
            width={width}
            caption={
              p.year === null
                ? t('collection.thisOneNoYear')
                : t('collection.thisOne', { year: p.year })
            }
          />
        ) : (
          <TitlePoster t={p} width={width} />
        )
      }
    />
  )
}

function MovieCollectionRow({
  id,
  current,
  onAdd,
}: {
  id: number
  current: number
  onAdd: (movies: DiscoverMovie[]) => void
}) {
  const collection = useCollection(id)
  // a row that fails to load is left out, as an empty one is (media-pages.md § States)
  if (collection.status !== 'success') return null
  const c = collection.data
  return (
    <CollectionRow
      collection={c}
      title={c.name}
      href={collectionPath(c.id)}
      current={current}
      onAdd={onAdd}
    />
  )
}

function MoreLikeThis({ id }: { id: number }) {
  const t = useT(messages)
  const width = useTitleWidth()
  const recs = useQuery(
    `recommendations:${id}`,
    (c) => c.metadata.recommendations({ params: { id } }),
    ['movies.updated'],
  )
  if (recs.status !== 'success' || recs.data.length === 0) return null
  return (
    <Row
      inset={0}
      title={t('moreLikeThis')}
      items={recs.data}
      keyOf={(m) => m.id}
      render={(m) => <TitlePoster t={m} width={width} />}
    />
  )
}

// ---------------------------------------------------------------- about

/** Terms and their values in the admin's ui type, the terms in text-3 (the web's `dl`). */
export function Definition({ items }: { items: [string, ReactNode][] }) {
  return (
    <Details
      terms="ui"
      gap={tokens.space['2']}
      rows={items.map(([term, value]) => ({ term, value }))}
    />
  )
}

/** A language's name in the reader's language, from its ISO 639-1 code (ECMA-402 DisplayNames). */
function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/** A heading in the web's text-title (19), at a level. */
function Heading({ children, level = 2 }: { children: string; level?: 2 | 3 }) {
  return (
    <Text variant="title" role="heading" aria-level={level}>
      {children}
    </Text>
  )
}

function About({ meta: m }: { meta: MovieMetadata }) {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const long = useLongDate()
  const { colors } = useTheme()
  const usd = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  // a link out, opening in a new tab, which it says to assistive tech (the web's sr-only words)
  const external = (href: string, label: string) => (
    <Press
      key={label}
      role="link"
      {...({ href, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as object)}
      accessibilityLabel={`${label} ${t('about.opensNewTab')}`}
      style={{ borderRadius: tokens.radius.sm }}
    >
      {({ hovered }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: tokens.space['1'] }}>
          <Text
            size={ui.size}
            color="text"
            style={{
              textDecorationLine: 'underline',
              textDecorationColor: hovered ? colors.text : colors['text-3'],
            }}
          >
            {label}
          </Text>
          <Icon name="external" size={12} />
        </View>
      )}
    </Press>
  )
  const figure = (n: number) => (
    <Text size={ui.size} color="text" mono>
      {usd.format(n)}
    </Text>
  )
  const items: [string, ReactNode][] = []
  if (m.releaseDate)
    items.push([
      releasedBy(m.releaseDate, now) ? t('released.label') : t('releases.label'),
      long(m.releaseDate),
    ])
  if (m.originalTitle !== m.title) items.push([t('about.originalTitle'), m.originalTitle])
  items.push([t('about.originalLanguage'), languageName(m.originalLanguage, locale)])
  items.push([t('about.certification'), m.certification ?? t('about.notRated')])
  items.push([
    t('about.runtime'),
    m.runtimeMinutes ? duration(m.runtimeMinutes * 60, locale) : t('about.runtimeUnknown'),
  ])
  if (m.budget) items.push([t('about.budget'), figure(m.budget)])
  if (m.revenue) items.push([t('about.revenue'), figure(m.revenue)])
  if (m.studios.length > 0)
    items.push([
      m.studios.length > 1 ? t('about.studios') : t('about.studio'),
      m.studios.join(t('comma')),
    ])
  items.push([
    t('about.links'),
    <View
      key="links"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: tokens.space['3'],
        rowGap: tokens.space['1'],
      }}
    >
      {external(`https://www.themoviedb.org/movie/${m.id}`, 'TMDB')}
      {m.imdbId && external(`https://www.imdb.com/title/${m.imdbId}/`, 'IMDb')}
      {m.wikidataId && external(`https://www.wikidata.org/wiki/${m.wikidataId}`, 'Wikidata')}
    </View>,
  ])
  return (
    <View role="region" aria-label={t('about')} style={{ gap: tokens.space['3'] }}>
      <Heading>{t('about')}</Heading>
      <Definition items={items} />
    </View>
  )
}

// ---------------------------------------------------------------- cast and crew

/** Crew departments in TMDB's order; Acting is the cast, shown above them. */
const crewDepartments = DEPARTMENTS.filter((d) => d !== 'Acting')

/** One line per person per department, with every job they did in it. */
export function crewByDepartment(crew: Credit[]) {
  return crewDepartments
    .map((d) => {
      const people = new Map<number, { credit: Credit; jobs: string[] }>()
      for (const c of crew.filter((x) => x.department === d)) {
        const p = people.get(c.personId)
        if (p) {
          if (c.job && !p.jobs.includes(c.job)) p.jobs.push(c.job)
        } else people.set(c.personId, { credit: c, jobs: c.job ? [c.job] : [] })
      }
      return [d, [...people.values()]] as const
    })
    .filter(([, people]) => people.length > 0)
}

/** A crew member's photo beside their name: 28 wide, the poster's shape, 4 round. */
const CREW_PHOTO = { width: 28, radius: 4 }

function CrewPhoto({ src }: { src: string | null }) {
  const { colors } = useTheme()
  const frame = {
    width: CREW_PHOTO.width,
    aspectRatio: 2 / 3,
    borderRadius: CREW_PHOTO.radius,
    flexShrink: 0,
  } as const
  return src ? (
    <Image source={{ uri: src }} aria-hidden contentFit="cover" style={frame} />
  ) : (
    <View
      aria-hidden
      style={[
        frame,
        { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.s2 },
      ]}
    >
      <Icon name="user" size={14} color="text-3" />
    </View>
  )
}

export function CastAndCrew({ meta }: { meta: MetadataQuery }) {
  const t = useT(messages)
  const medium = useWindowAtLeast(breakpoints.medium)
  const expanded = useWindowAtLeast(breakpoints.expanded)
  return (
    <Loadable query={meta} what={t('cast.what')} skeleton={<RowSkeleton />}>
      {(m) => {
        const crew = crewByDepartment(m.crew)
        return (
          <View style={{ gap: tokens.space['8'] }}>
            <View role="region" aria-label={t('cast')} style={{ gap: tokens.space['4'] }}>
              <Heading>{t('cast')}</Heading>
              {m.cast.length === 0 ? (
                <EmptyState icon="users" title={t('cast.none')}>
                  {t('cast.noneBody')}
                </EmptyState>
              ) : (
                <View
                  role="list"
                  style={grid({
                    gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
                    columnGap: tokens.space['4'],
                    rowGap: tokens.space['5'],
                  })}
                >
                  {m.cast.map((c) => (
                    <View key={c.id} role="listitem">
                      <Poster
                        title={c.name}
                        src={c.photo ?? undefined}
                        href={personPath(c.personId)}
                        showTitle
                        titleSize="ui"
                        caption={c.character ?? undefined}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>
            {crew.length > 0 && (
              <View role="region" aria-label={t('crew')} style={{ gap: tokens.space['4'] }}>
                <Heading>{t('crew')}</Heading>
                <View
                  style={grid({
                    gridTemplateColumns: `repeat(${expanded ? 3 : medium ? 2 : 1}, minmax(0, 1fr))`,
                    gap: tokens.space['6'],
                  })}
                >
                  {crew.map(([d, people]) => (
                    <View
                      key={d}
                      role="region"
                      aria-label={t(`department.${d}`)}
                      style={{ gap: tokens.space['2'] }}
                    >
                      <Text variant="label" color="text-3" role="heading" aria-level={3}>
                        {t(`department.${d}`)}
                      </Text>
                      <View role="list" style={{ gap: tokens.space['2'] }}>
                        {people.map(({ credit: c, jobs }) => (
                          <View
                            key={c.personId}
                            role="listitem"
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: tokens.space['3'],
                            }}
                          >
                            <CrewPhoto src={c.photo} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text size={ui.size} numberOfLines={1}>
                                <InlineLink href={personPath(c.personId)}>{c.name}</InlineLink>
                              </Text>
                              <Text variant="caption" color="text-3">
                                {jobs.join(t('comma'))}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )
      }}
    </Loadable>
  )
}
