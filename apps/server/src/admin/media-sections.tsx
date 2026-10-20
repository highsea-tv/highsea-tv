'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The media page's shared anatomy (docs/product/media-pages.md#layout), ported from the
// prototype's media/sections.tsx: the summary card, the Overview's rows (cast, trailers,
// collection, More like this) and its About aside, and the Cast and crew tab. Used by every state
// of a movie's page, and by the collection page for its parts. What real TMDB data changes
// (checkpoint 4, Fields and how they map): trailers have no length and use the movie's backdrop
// as their still; crew is grouped by TMDB's 12 departments; IMDb and Wikidata links may be missing.

import type { Collection, Credit, DiscoverMovie, MovieMetadata, Video } from '@highsea/api-contract'
import { DEPARTMENTS } from '@highsea/api-contract'
import { duration } from '@highsea/core/format'
import { useLocale, useT } from '@highsea/i18n/react'
import type { ApiError } from '@highsea/sdk'
import { type Query, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  CarouselRow,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  type IconName,
  Poster,
  QualityTag,
  Rating,
  Skeleton,
  SkeletonText,
} from '@highsea/ui-web'
import { useRouter } from 'next/navigation'
import { Fragment, type ReactNode, useState } from 'react'
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
 * "1 June 1922". English reads day-month-year, as the prototype and @highsea/core/format do;
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

export const textLink =
  'text-text underline decoration-text-3 underline-offset-2 hover:decoration-text'

/** "A", "A and B", "A, B and C", each a link to the person. */
function People({ people }: { people: Credit[] }) {
  const t = useT(messages)
  return (
    <>
      {people.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && (i === people.length - 1 ? t('and') : t('comma'))}
          <a href={personPath(p.personId)} className={textLink}>
            {p.name}
          </a>
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
  const router = useRouter()
  const e = error as ApiError
  const reason = (e.details as { reason?: string } | undefined)?.reason
  if (e.status === 404)
    return (
      <EmptyState
        tone="error"
        icon={icon}
        title={unknown?.title ?? t('unknown.title')}
        action={<Button onClick={() => router.push('/discover')}>{t('unknown.action')}</Button>}
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
        action={<Button onClick={() => router.push(METADATA_SETTINGS)}>{t('noKey.action')}</Button>}
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
    <section
      aria-label={t('summary')}
      className="relative isolate grid gap-5 overflow-hidden rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[9rem_minmax(0,1fr)] medium:p-5"
    >
      {m.art.backdrop && (
        // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
        <img
          src={m.art.backdrop}
          alt=""
          className="-z-10 absolute inset-0 size-full object-cover opacity-15"
        />
      )}
      <Poster title={m.title} src={m.art.poster ?? undefined} className="w-32 medium:w-full" />
      <div className="grid grid-cols-1 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2 text-caption text-text-2">
          {m.year !== null && (
            <>
              <span className="font-mono">{m.year}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>
            {m.runtimeMinutes ? duration(m.runtimeMinutes * 60, locale) : t('runtime.unknown')}
          </span>
          {meta?.certification && (
            <>
              <span aria-hidden>·</span>
              <QualityTag>{meta.certification}</QualityTag>
            </>
          )}
          {m.genres.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{m.genres.join(t('comma'))}</span>
            </>
          )}
          {m.rating > 0 && <Rating value={m.rating} size={12} showValue />}
        </div>
        {meta?.tagline && (
          <p className="text-body text-text-2">{t('tagline', { tagline: meta.tagline })}</p>
        )}
        {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
        {m.synopsis && <p className="max-w-[65ch] text-body text-text-2">{m.synopsis}</p>}
        {directors.length > 0 && (
          <p className="text-caption text-text-2">
            {t('directedBy')} <People people={directors} />
          </p>
        )}
        {children}
      </div>
    </section>
  )
}

export function SummarySkeleton() {
  return (
    <div aria-busy className="grid gap-5 medium:grid-cols-[10rem_minmax(0,1fr)]">
      <Skeleton className="aspect-poster rounded-poster" />
      <SkeletonText lines={4} />
    </div>
  )
}

/** "Released 1 June 1922" or "Releases 6 November 2026". */
export function ReleaseLine({ date }: { date: string | null }) {
  const t = useT(messages)
  const now = useNow()
  const long = useLongDate()
  return (
    <p className="text-caption text-text-3">
      {date === null
        ? t('release.unknown')
        : releasedBy(date, now)
          ? t('released', { date: long(date) })
          : t('releases', { date: long(date) })}
    </p>
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
  return (
    <div className="grid grid-cols-1 gap-8 expanded:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-8">
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
      </div>
      <div className="grid min-w-0 grid-cols-1 content-start gap-8">
        {aside}
        {meta.status === 'success' && <About meta={meta.data} />}
      </div>
    </div>
  )
}

export function RowSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="aspect-poster w-28 shrink-0 rounded-poster" />
      ))}
    </div>
  )
}

const personItem = 'w-[clamp(6rem,9vw,7.5rem)]'
/** Titles in the admin's rows: smaller than the clients' default, since the column is narrower. */
export const titleItem = 'w-[clamp(7rem,11vw,8.5rem)]'

function CastRow({ cast, onAll }: { cast: Credit[]; onAll: () => void }) {
  const t = useT(messages)
  return (
    <CarouselRow
      flush
      title={t('cast')}
      itemClassName={personItem}
      action={
        <Button size="sm" variant="ghost" onClick={onAll}>
          {t('allCast')}
        </Button>
      }
    >
      {cast.slice(0, 10).map((c) => (
        <Poster
          key={c.id}
          title={c.name}
          src={c.photo ?? undefined}
          href={personPath(c.personId)}
          showTitle
          caption={c.character ?? undefined}
        />
      ))}
    </CarouselRow>
  )
}

function TrailersRow({ videos }: { videos: Video[] }) {
  const t = useT(messages)
  const [playing, setPlaying] = useState<Video | null>(null)
  return (
    <>
      <CarouselRow flush title={t('trailers')} itemClassName="w-[clamp(12rem,22vw,16rem)]">
        {videos.map((v) => (
          <Poster
            key={v.id}
            title={v.name}
            src={v.still ?? undefined}
            aspect="still"
            onClick={() => setPlaying(v)}
            showTitle
            // TMDB gives no duration, so the kind alone (checkpoint 4, Fields and how they map)
            caption={t(`kind.${v.kind}`)}
            status={
              <Badge overlay dot={false} aria-hidden className="px-1.5">
                <Icon name="play" size={12} />
              </Badge>
            }
          />
        ))}
      </CarouselRow>
      <TrailerDialog video={playing} onOpenChange={(o) => !o && setPlaying(null)} />
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

function TrailerDialog({
  video: v,
  onOpenChange,
}: {
  video: Video | null
  onOpenChange: (open: boolean) => void
}) {
  const t = useT(messages)
  const long = useLongDate()
  return (
    <Dialog open={!!v} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={v?.name ?? t('trailers')}>
        {v && (
          <div className="grid gap-3">
            <div className="relative isolate aspect-still overflow-hidden rounded-md bg-s2">
              <iframe
                src={playerUrl(v)}
                title={t('trailer.frame', { name: v.name, site: v.site })}
                // YouTube's embeds need the referrer to play (its required minimum functionality)
                referrerPolicy="strict-origin-when-cross-origin"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 size-full border-0"
              />
            </div>
            <p className="text-caption text-text-3">
              {v.publishedAt
                ? t('trailer.caption', { kind: t(`kind.${v.kind}`), date: long(v.publishedAt) })
                : t(`kind.${v.kind}`)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A poster of another title, marked if it's in the library. */
export function TitlePoster({ t: m }: { t: DiscoverMovie }) {
  const t = useT(messages)
  return (
    <Poster
      title={m.title}
      src={m.art.poster ?? undefined}
      href={moviePath(m.id)}
      showTitle
      caption={m.year ?? undefined}
      status={
        m.inLibrary && (
          <Badge overlay tone="success">
            {t('inLibrary')}
          </Badge>
        )
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
 * movie's page names the collection and links to its page; the collection's own page titles it
 * itself.
 */
export function CollectionRow({
  collection: c,
  title,
  current,
  onAdd,
}: {
  collection: Collection
  title: ReactNode
  /** The movie whose page this is: shown as "This one", not linked. */
  current?: number
  onAdd: (movies: DiscoverMovie[]) => void
}) {
  const t = useT(messages)
  const missing = c.parts.filter((p) => !p.inLibrary)
  const here = c.parts.length - missing.length
  return (
    <CarouselRow
      flush
      title={title}
      itemClassName={titleItem}
      suffix={t('collection.suffix', { here, total: c.parts.length })}
      action={
        missing.length > 0 && (
          <Button size="sm" icon="add" onClick={() => onAdd(missing)}>
            {t('collection.addMissing', { count: missing.length })}
          </Button>
        )
      }
    >
      {c.parts.map((p) =>
        p.id === current ? (
          <Poster
            key={p.id}
            title={p.title}
            src={p.art.poster ?? undefined}
            showTitle
            caption={
              p.year === null
                ? t('collection.thisOneNoYear')
                : t('collection.thisOne', { year: p.year })
            }
          />
        ) : (
          <TitlePoster key={p.id} t={p} />
        ),
      )}
    </CarouselRow>
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
      title={
        <a href={collectionPath(c.id)} className="hover:underline">
          {c.name}
        </a>
      }
      current={current}
      onAdd={onAdd}
    />
  )
}

function MoreLikeThis({ id }: { id: number }) {
  const t = useT(messages)
  const recs = useQuery(
    `recommendations:${id}`,
    (c) => c.metadata.recommendations({ params: { id } }),
    ['movies.updated'],
  )
  if (recs.status !== 'success' || recs.data.length === 0) return null
  return (
    <CarouselRow flush title={t('moreLikeThis')} itemClassName={titleItem}>
      {recs.data.map((m) => (
        <TitlePoster key={m.id} t={m} />
      ))}
    </CarouselRow>
  )
}

// ---------------------------------------------------------------- about

export function Definition({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-ui">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-3">{k}</dt>
          <dd className="min-w-0 text-text">{v}</dd>
        </div>
      ))}
    </dl>
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

function About({ meta: m }: { meta: MovieMetadata }) {
  const t = useT(messages)
  const locale = useLocale()
  const now = useNow()
  const long = useLongDate()
  const usd = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  const external = (href: string, label: string) => (
    <a
      key={label}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 ${textLink}`}
    >
      {label}
      <Icon name="external" size={12} />
      <span className="sr-only">{t('about.opensNewTab')}</span>
    </a>
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
  if (m.budget)
    items.push([
      t('about.budget'),
      <span key="budget" className="font-mono">
        {usd.format(m.budget)}
      </span>,
    ])
  if (m.revenue)
    items.push([
      t('about.revenue'),
      <span key="revenue" className="font-mono">
        {usd.format(m.revenue)}
      </span>,
    ])
  if (m.studios.length > 0)
    items.push([
      m.studios.length > 1 ? t('about.studios') : t('about.studio'),
      m.studios.join(t('comma')),
    ])
  items.push([
    t('about.links'),
    <span key="links" className="flex flex-wrap gap-x-3 gap-y-1">
      {external(`https://www.themoviedb.org/movie/${m.id}`, 'TMDB')}
      {m.imdbId && external(`https://www.imdb.com/title/${m.imdbId}/`, 'IMDb')}
      {m.wikidataId && external(`https://www.wikidata.org/wiki/${m.wikidataId}`, 'Wikidata')}
    </span>,
  ])
  return (
    <section aria-labelledby="about" className="grid grid-cols-1 content-start gap-3">
      <h2 id="about" className="text-title text-text">
        {t('about')}
      </h2>
      <Definition items={items} />
    </section>
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

export function CastAndCrew({ meta }: { meta: MetadataQuery }) {
  const t = useT(messages)
  return (
    <Loadable query={meta} what={t('cast.what')} skeleton={<RowSkeleton />}>
      {(m) => {
        const crew = crewByDepartment(m.crew)
        return (
          <div className="grid grid-cols-1 gap-8">
            <section aria-labelledby="cast" className="grid gap-4">
              <h2 id="cast" className="text-title text-text">
                {t('cast')}
              </h2>
              {m.cast.length === 0 ? (
                <EmptyState icon="users" title={t('cast.none')}>
                  {t('cast.noneBody')}
                </EmptyState>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-4 gap-y-5">
                  {m.cast.map((c) => (
                    <li key={c.id}>
                      <Poster
                        title={c.name}
                        src={c.photo ?? undefined}
                        href={personPath(c.personId)}
                        showTitle
                        caption={c.character ?? undefined}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {crew.length > 0 && (
              <section aria-labelledby="crew" className="grid gap-4">
                <h2 id="crew" className="text-title text-text">
                  {t('crew')}
                </h2>
                <div className="grid grid-cols-1 gap-6 medium:grid-cols-2 expanded:grid-cols-3">
                  {crew.map(([d, people]) => (
                    <section
                      key={d}
                      aria-label={t(`department.${d}`)}
                      className="grid content-start gap-2"
                    >
                      <h3 className="font-mono text-label text-text-3 uppercase">
                        {t(`department.${d}`)}
                      </h3>
                      <ul className="grid gap-2">
                        {people.map(({ credit: c, jobs }) => (
                          <li key={c.personId} className="flex items-center gap-3">
                            {c.photo ? (
                              // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
                              <img
                                src={c.photo}
                                alt=""
                                className="aspect-poster w-7 shrink-0 rounded-[4px] object-cover"
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="grid aspect-poster w-7 shrink-0 place-items-center rounded-[4px] bg-s2 text-text-3"
                              >
                                <Icon name="user" size={14} />
                              </span>
                            )}
                            <span className="grid min-w-0">
                              <a href={personPath(c.personId)} className={`truncate ${textLink}`}>
                                {c.name}
                              </a>
                              <span className="text-caption text-text-3">
                                {jobs.join(t('comma'))}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </section>
            )}
          </div>
        )
      }}
    </Loadable>
  )
}
