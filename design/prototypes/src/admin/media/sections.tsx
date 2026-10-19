// SPDX-License-Identifier: AGPL-3.0-only
// The media page's shared anatomy (docs/product/media-pages.md#layout), used by every state of a
// movie's page and, later, by the other media types: the summary card, the Overview's rows (cast,
// trailers, collection, More like this) and its About aside, and the Cast and crew tab.
import {
  Badge,
  Button,
  CarouselRow,
  Dialog,
  DialogContent,
  EmptyState,
  Icon,
  Poster,
  QualityTag,
  Rating,
  Skeleton,
  SkeletonText,
} from '@highsea/ui-web'
import { Fragment, type ReactNode, useState } from 'react'
import { useNow, useQuery } from '../../mock/hooks.tsx'
import type { Credit, Department, DiscoverMovie, MovieMetadata, Video } from '../../mock/types.ts'
import { duration } from '../format.ts'
import { Loadable } from '../loadable.tsx'
import { movieHref, personHref } from './links.ts'

/** What every title has, in or out of the library. */
export type TitleBase = Pick<
  DiscoverMovie,
  'title' | 'year' | 'runtimeMinutes' | 'genres' | 'rating' | 'synopsis' | 'art'
>

/** A title's metadata by media id; refetched when the library changes, so `inLibrary` follows. */
export const useMovieMetadata = (id: string) =>
  useQuery(`metadata:${id}`, (c) => c.metadata.movie(id), ['movies.updated'])

export const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

const textLink = 'text-text underline decoration-text-3 underline-offset-2 hover:decoration-text'

/** "A", "A and B", "A, B and C", each a link to the person. */
function People({ people }: { people: Credit[] }) {
  return (
    <>
      {people.map((p, i) => (
        <Fragment key={p.personId}>
          {i > 0 && (i === people.length - 1 ? ' and ' : ', ')}
          <a href={personHref(p.personId)} className={textLink}>
            {p.name}
          </a>
        </Fragment>
      ))}
    </>
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
  const directors = meta?.crew.filter((c) => c.job === 'Director') ?? []
  return (
    <section
      aria-label="Summary"
      className="relative isolate grid gap-5 overflow-hidden rounded-lg border border-line bg-s1 p-4 medium:grid-cols-[9rem_minmax(0,1fr)] medium:p-5"
    >
      <img
        src={m.art.backdrop}
        alt=""
        className="-z-10 absolute inset-0 size-full object-cover opacity-15"
      />
      <Poster title={m.title} src={m.art.poster} className="w-32 medium:w-full" />
      <div className="grid grid-cols-1 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2 text-caption text-text-2">
          <span className="font-mono">{m.year}</span>
          <span aria-hidden>·</span>
          <span>{m.runtimeMinutes ? duration(m.runtimeMinutes * 60) : 'Runtime unknown'}</span>
          {meta?.certification && (
            <>
              <span aria-hidden>·</span>
              <QualityTag>{meta.certification}</QualityTag>
            </>
          )}
          {m.genres.length > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{m.genres.join(', ')}</span>
            </>
          )}
          {m.rating > 0 && <Rating value={m.rating} size={12} showValue />}
        </div>
        {meta?.tagline && <p className="text-body text-text-2">“{meta.tagline}”</p>}
        {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
        <p className="max-w-[65ch] text-body text-text-2">{m.synopsis}</p>
        {directors.length > 0 && (
          <p className="text-caption text-text-2">
            Directed by <People people={directors} />
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
export function ReleaseLine({ date }: { date: string }) {
  const now = useNow()
  return (
    <p className="text-caption text-text-3">
      {Date.parse(date) <= now ? 'Released' : 'Releases'} {longDate(date)}
    </p>
  )
}

// ---------------------------------------------------------------- overview

/**
 * Two columns from expanded: the rows, then a 20rem aside. `main` and `aside` lead their column
 * (the library's In the queue and In the library).
 */
export function MediaOverview({
  meta,
  main,
  aside,
  staff,
  onAllCast,
  onAdd,
}: {
  meta: ReturnType<typeof useMovieMetadata>
  main?: ReactNode
  aside?: ReactNode
  staff: boolean
  onAllCast: () => void
  /** Add these movies (a collection's missing parts). */
  onAdd: (movies: DiscoverMovie[]) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-8 expanded:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-8">
        {main}
        <Loadable query={meta} what="the details" skeleton={<RowSkeleton />}>
          {(md) => (
            <>
              {md.cast.length > 0 && <CastRow cast={md.cast} onAll={onAllCast} />}
              {md.videos.length > 0 && <TrailersRow videos={md.videos} />}
              {md.collection && (
                <CollectionRow id={md.collection.id} current={md.id} staff={staff} onAdd={onAdd} />
              )}
              <MoreLikeThis id={md.id} />
            </>
          )}
        </Loadable>
      </div>
      <div className="grid grid-cols-1 content-start gap-8">
        {aside}
        {meta.status === 'success' && <About meta={meta.data} />}
      </div>
    </div>
  )
}

function RowSkeleton() {
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
  return (
    <CarouselRow
      flush
      title="Cast"
      itemClassName={personItem}
      action={
        <Button size="sm" variant="ghost" onClick={onAll}>
          All cast and crew
        </Button>
      }
    >
      {cast.slice(0, 10).map((c) => (
        <Poster
          key={c.personId}
          title={c.name}
          src={c.photo}
          href={personHref(c.personId)}
          showTitle
          caption={c.character}
        />
      ))}
    </CarouselRow>
  )
}

const length = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function TrailersRow({ videos }: { videos: Video[] }) {
  const [playing, setPlaying] = useState<Video | null>(null)
  return (
    <>
      <CarouselRow flush title="Trailers" itemClassName="w-[clamp(12rem,22vw,16rem)]">
        {videos.map((v) => (
          <Poster
            key={v.id}
            title={v.name}
            src={v.still}
            aspect="still"
            onClick={() => setPlaying(v)}
            showTitle
            caption={`${v.kind} · ${length(v.lengthSeconds)}`}
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
 * The product embeds `https://www.youtube-nocookie.com/embed/{key}?autoplay=1` here, only after
 * the click. The prototype stays offline, so a still and a note stand in for the player.
 */
function TrailerDialog({
  video: v,
  onOpenChange,
}: {
  video: Video | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!v} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={v?.name ?? 'Trailer'}>
        {v && (
          <div className="grid gap-3">
            <div className="relative isolate grid aspect-still place-items-center overflow-hidden rounded-md bg-s2">
              <img src={v.still} alt="" className="-z-10 absolute inset-0 size-full object-cover" />
              <p className="glass-badge mx-4 max-w-sm rounded-md px-4 py-3 text-center text-caption text-text">
                In highsea this plays from youtube-nocookie.com, and only after you click. The
                prototype doesn’t load YouTube.
              </p>
            </div>
            <p className="text-caption text-text-3">
              {v.kind} · {length(v.lengthSeconds)} · {longDate(v.publishedAt)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Posters of other titles, marked if they're in the library. */
function TitlePoster({ t }: { t: DiscoverMovie }) {
  return (
    <Poster
      title={t.title}
      src={t.art.poster}
      href={movieHref(t)}
      showTitle
      caption={t.year}
      status={
        t.inLibrary && (
          <Badge overlay tone="success">
            In library
          </Badge>
        )
      }
    />
  )
}

function CollectionRow({
  id,
  current,
  staff,
  onAdd,
}: {
  id: string
  current: string
  staff: boolean
  onAdd: (movies: DiscoverMovie[]) => void
}) {
  const collection = useQuery(`collection:${id}`, (c) => c.metadata.collection(id), [
    'movies.updated',
  ])
  if (collection.status !== 'success') return null
  const c = collection.data
  const missing = c.parts.filter((p) => !p.inLibrary)
  const here = c.parts.length - missing.length
  return (
    <CarouselRow
      flush
      title={c.name}
      itemClassName={titleItem}
      suffix={`${here} of ${c.parts.length} in the library`}
      action={
        staff &&
        missing.length > 0 && (
          <Button size="sm" icon="add" onClick={() => onAdd(missing)}>
            Add {missing.length} missing
          </Button>
        )
      }
    >
      {c.parts.map((p) =>
        p.id === current ? (
          <Poster
            key={p.id}
            title={p.title}
            src={p.art.poster}
            showTitle
            caption={`${p.year} · This one`}
          />
        ) : (
          <TitlePoster key={p.id} t={p} />
        ),
      )}
    </CarouselRow>
  )
}

function MoreLikeThis({ id }: { id: string }) {
  const recs = useQuery(`recommendations:${id}`, (c) => c.metadata.recommendations(id), [
    'movies.updated',
  ])
  if (recs.status !== 'success' || recs.data.length === 0) return null
  return (
    <CarouselRow flush title="More like this" itemClassName={titleItem}>
      {recs.data.map((t) => (
        <TitlePoster key={t.id} t={t} />
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

const languages: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  ru: 'Russian',
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

function About({ meta: m }: { meta: MovieMetadata }) {
  const now = useNow()
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
    </a>
  )
  const items: [string, ReactNode][] = [
    [Date.parse(m.releaseDate) <= now ? 'Released' : 'Releases', longDate(m.releaseDate)],
  ]
  if (m.originalTitle !== m.title) items.push(['Original title', m.originalTitle])
  items.push(['Original language', languages[m.originalLanguage] ?? m.originalLanguage])
  items.push(['Certification', m.certification ?? 'Not rated'])
  items.push(['Runtime', m.runtimeMinutes ? duration(m.runtimeMinutes * 60) : 'Unknown'])
  if (m.budget)
    items.push([
      'Budget',
      <span key="budget" className="font-mono">
        {usd(m.budget)}
      </span>,
    ])
  if (m.revenue)
    items.push([
      'Box office',
      <span key="revenue" className="font-mono">
        {usd(m.revenue)}
      </span>,
    ])
  if (m.studios.length > 0)
    items.push([m.studios.length > 1 ? 'Studios' : 'Studio', m.studios.join(', ')])
  items.push([
    'Links',
    <span key="links" className="flex flex-wrap gap-x-3 gap-y-1">
      {external(`https://www.themoviedb.org/movie/${m.tmdbId}`, 'TMDB')}
      {external(`https://www.imdb.com/title/${m.imdbId}/`, 'IMDb')}
      {external(`https://www.wikidata.org/wiki/${m.wikidataId}`, 'Wikidata')}
    </span>,
  ])
  return (
    <section aria-labelledby="about" className="grid grid-cols-1 content-start gap-3">
      <h2 id="about" className="text-title text-text">
        About
      </h2>
      <Definition items={items} />
    </section>
  )
}

// ---------------------------------------------------------------- cast and crew

const departments: Department[] = ['Directing', 'Writing', 'Production', 'Camera', 'Sound']

export function CastAndCrew({ meta }: { meta: ReturnType<typeof useMovieMetadata> }) {
  return (
    <Loadable query={meta} what="the cast and crew" skeleton={<RowSkeleton />}>
      {(m) => {
        // one line per person per department, with every job they did in it
        const crew = departments
          .map((d) => {
            const people = new Map<string, { credit: Credit; jobs: string[] }>()
            for (const c of m.crew.filter((x) => x.department === d)) {
              const p = people.get(c.personId)
              if (p) p.jobs.push(c.job ?? '')
              else people.set(c.personId, { credit: c, jobs: [c.job ?? ''] })
            }
            return [d, [...people.values()]] as const
          })
          .filter(([, people]) => people.length > 0)
        return (
          <div className="grid grid-cols-1 gap-8">
            <section aria-labelledby="cast" className="grid gap-4">
              <h2 id="cast" className="text-title text-text">
                Cast
              </h2>
              {m.cast.length === 0 ? (
                <EmptyState icon="users" title="TMDB doesn’t list a cast for this title">
                  Some films, like Spring, tell their story without speaking roles.
                </EmptyState>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-x-4 gap-y-5">
                  {m.cast.map((c) => (
                    <li key={c.personId}>
                      <Poster
                        title={c.name}
                        src={c.photo}
                        href={personHref(c.personId)}
                        showTitle
                        caption={c.character}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {crew.length > 0 && (
              <section aria-labelledby="crew" className="grid gap-4">
                <h2 id="crew" className="text-title text-text">
                  Crew
                </h2>
                <div className="grid grid-cols-1 gap-6 medium:grid-cols-2 expanded:grid-cols-3">
                  {crew.map(([d, people]) => (
                    <section key={d} aria-label={d} className="grid content-start gap-2">
                      <h3 className="font-mono text-label text-text-3 uppercase">{d}</h3>
                      <ul className="grid gap-2">
                        {people.map(({ credit: c, jobs }) => (
                          <li key={c.personId} className="flex items-center gap-3">
                            <img
                              src={c.photo}
                              alt=""
                              className="aspect-poster w-7 shrink-0 rounded-[4px] object-cover"
                            />
                            <span className="grid min-w-0">
                              <a href={personHref(c.personId)} className={`truncate ${textLink}`}>
                                {c.name}
                              </a>
                              <span className="text-caption text-text-3">{jobs.join(', ')}</span>
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
