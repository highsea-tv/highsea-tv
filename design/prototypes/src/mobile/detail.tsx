// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, mobile (docs/product/client-detail.md#mobile), laid out as the TV's from the
// streaming apps' common choices (the owner, 2026-10-30): the film's art across the top with Back
// over it and the logo low on it, a meta line, Play or Resume across the width with the progress
// bar above it, Download, three lines of synopsis, the leading cast and the director, the picks it
// plays with, and a row of named icon buttons: From the start, Trailer, Audio and subtitles (Watch
// with, in a sheet), Mark as watched. Then More like this, the Collections it's in, Trailers and
// extras, Cast and crew, and About, Information, and Languages and quality as cards.
import {
  Button,
  cn,
  EmptyState,
  Icon,
  type IconName,
  QualityTag,
  Rating,
  Sheet,
  SheetContent,
  Skeleton,
  SkeletonText,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useParams } from 'wouter'
import { collectionCaption, left, runtime, useItem } from '../client/data.ts'
import {
  type Fact,
  informationOf,
  languagesOf,
  names,
  peopleOf,
  previewOf,
  role,
  videoLength,
} from '../client/detail-facts.ts'
import { DownloadButton } from '../client/download-button.tsx'
import { useMarkWatched } from '../client/item-more.tsx'
import { TrailerDialog } from '../client/trailer.tsx'
import { CollectionTile } from '../kit/collection-art.tsx'
import type { ClientDetail, Video } from '../mock/types.ts'
import { WatchWith } from '../web/detail.tsx'
import { MobileRow, PosterItems } from './home.tsx'
import { gutter, mobileHref } from './shell.tsx'

/** The fade from the art into the page, under the logo. */
export const fade = 'absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg)_2%,transparent_55%)]'

export function MobileDetail() {
  const { id } = useParams<{ id: string }>()
  const detail = useItem(id, 'mobile')
  const [trailer, setTrailer] = useState<Video | null>(null)
  const [tracks, setTracks] = useState(false)
  const back = (
    <a
      href={mobileHref('/')}
      onClick={(e) => {
        if (history.length > 1) {
          e.preventDefault()
          history.back()
        }
      }}
      aria-label="Back"
      className="glass-badge absolute top-2 left-3 z-10 grid size-10 place-items-center rounded-full outline-none focus-visible:ring-focus"
    >
      <Icon name="chevron-left" size={20} />
    </a>
  )
  if (detail.status === 'loading')
    return (
      <div aria-busy className="relative grid gap-5">
        {back}
        <div className="relative aspect-still w-full bg-s1">
          <div className={fade} />
        </div>
        <div className={cn('-mt-16 relative grid grid-cols-[minmax(0,1fr)] gap-3', gutter)}>
          <Skeleton className="my-1 h-12 w-3/5" />
          <Skeleton className="my-0.5 h-3.5 w-48" />
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-11 rounded-md" />
          <SkeletonText lines={3} className="py-1" />
          <Skeleton className="my-0.5 h-3 w-56" />
          <div className="grid grid-cols-4 gap-2 pt-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="grid justify-items-center gap-1.5">
                <Skeleton className="size-11 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  if (detail.status === 'error')
    return (
      <div className={cn('grid min-h-full place-items-center py-16', gutter)}>
        {back}
        <EmptyState
          icon="movie"
          tone="error"
          title={detail.error.message}
          action={
            <Button asChild>
              <a href={mobileHref('/')}>Go home</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </div>
    )
  const d = detail.data
  const m = d.item
  const v = d.versions.find((x) => x.id === d.defaults.versionId) ?? d.versions[0]
  const resuming = m.progress !== null
  const preview = previewOf(d)
  const people = peopleOf(d)
  return (
    <article aria-labelledby="title" className="relative grid grid-cols-[minmax(0,1fr)] gap-5 pb-6">
      {back}
      <div className="relative">
        <img src={m.art.backdrop} alt="" className="aspect-still w-full object-cover" />
        <div className={fade} />
      </div>
      <div className={cn('-mt-16 relative grid grid-cols-[minmax(0,1fr)] gap-3', gutter)}>
        <h1 id="title" className="font-semibold text-[28px] leading-[1.15] tracking-display">
          {m.art.logo ? (
            <img
              src={m.art.logo}
              alt={m.title}
              className="max-h-20 max-w-[75%] object-contain object-left drop-shadow-[0_2px_8px_rgb(0_0_0/0.5)]"
            />
          ) : (
            m.title
          )}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-text-2">
          <span>
            {m.year} · {runtime(m.runtimeMinutes)}
          </span>
          {d.certification && (
            <span className="rounded-sm border border-text-3 px-1 text-[12px]">
              {d.certification}
            </span>
          )}
          <span>{m.genres[0]}</span>
          {m.rating > 0 && <Rating value={m.rating} size={12} />}
          {m.quality.map((q) => (
            <QualityTag key={q} overlay>
              {q}
            </QualityTag>
          ))}
        </p>
        {resuming && (
          <div className="flex items-center gap-3 text-[13px] text-text-2">
            <div
              role="progressbar"
              aria-label="Watched"
              aria-valuenow={Math.round((m.progress ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1 flex-1 overflow-hidden rounded-full bg-text/20"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(m.progress ?? 0) * 100}%` }}
              />
            </div>
            {left(m)}
          </div>
        )}
        <Button
          variant="primary"
          icon="play"
          asChild
          className="h-auto min-h-12 w-full whitespace-normal py-2 text-[16px]"
        >
          <a href={mobileHref(`/play/${m.id}`)}>{resuming ? 'Resume' : 'Play'}</a>
        </Button>
        <DownloadButton item={m} app="mobile" wide />
        <p className="line-clamp-3 text-[15px] leading-[1.55]">{m.synopsis}</p>
        {(d.cast.length > 0 || d.directors.length > 0) && (
          <div className="grid gap-0.5 text-[13px] text-text-2">
            {d.cast.length > 0 && (
              <p className="line-clamp-2">
                <span className="text-text-3">Starring </span>
                {names(d.cast.slice(0, 3))}
              </p>
            )}
            {d.directors.length > 0 && (
              <p className="truncate">
                <span className="text-text-3">Directed by </span>
                {names(d.directors)}
              </p>
            )}
          </div>
        )}
        {v && (
          <p className="text-[12px] text-text-3">
            {v.label} · {v.audio.find((a) => a.id === d.defaults.audioId)?.label ?? 'Default audio'}{' '}
            · {v.subtitles.find((t) => t.id === d.defaults.subtitleId)?.label ?? 'Subtitles off'}
          </p>
        )}
        <div className="flex justify-around gap-1 pt-1">
          {resuming && (
            <Named icon="replay" label="From the start" href={mobileHref(`/play/${m.id}/start`)} />
          )}
          {preview && <Named icon="trailer" label="Trailer" onClick={() => setTrailer(preview)} />}
          <Named icon="subtitles" label="Audio and subtitles" onClick={() => setTracks(true)} />
          <Watched detail={d} />
        </div>
      </div>
      {d.related.length > 0 && (
        <MobileRow title="More like this">
          <PosterItems items={d.related} wide />
        </MobileRow>
      )}
      {d.collections.length > 0 && (
        <MobileRow title="Collections">
          {d.collections.map((c) => (
            <li key={c.id} className="w-[30%] shrink-0 snap-start">
              <CollectionTile
                href={mobileHref(`/collections/${c.id}`)}
                name={c.name}
                caption={collectionCaption(c)}
                poster={c.art.poster}
                mosaic={c.smart?.mosaic}
                smart={!!c.smart?.words}
              />
            </li>
          ))}
        </MobileRow>
      )}
      {d.videos.length > 0 && (
        <MobileRow title="Trailers and extras">
          {d.videos.map((x) => (
            <li key={x.id} className="w-[72%] shrink-0 snap-start">
              <button
                type="button"
                aria-label={`${x.name}, ${x.kind}, ${videoLength(x.lengthSeconds)}`}
                onClick={() => setTrailer(x)}
                className="relative isolate block aspect-still w-full overflow-hidden rounded-md text-start outline-none focus-visible:ring-focus"
              >
                <img
                  src={x.still}
                  alt=""
                  className="-z-10 absolute inset-0 size-full object-cover"
                />
                <span className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,color-mix(in_srgb,var(--color-bg)_85%,transparent)_0%,transparent_60%)]" />
                <span className="absolute inset-x-2.5 bottom-2 grid">
                  <span className="truncate font-semibold text-[14px]">{x.name}</span>
                  <span className="flex items-center gap-1 text-[12px] text-text-2">
                    <Icon name="play" size={10} />
                    {x.kind} · {videoLength(x.lengthSeconds)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </MobileRow>
      )}
      {people.length > 0 && (
        <MobileRow title="Cast and crew">
          {people.map((c) => (
            <li key={`${c.personId}:${c.job ?? 'cast'}`} className="w-[24%] shrink-0 snap-start">
              <a
                href={mobileHref(`/people/${c.personId}`)}
                className="grid rounded-lg text-center outline-none focus-visible:ring-focus"
              >
                <img
                  src={c.photo}
                  alt=""
                  className="aspect-square w-full rounded-full bg-s1 object-cover"
                />
                <p className="mt-1.5 truncate font-semibold text-[12px]">{c.name}</p>
                <p className="truncate text-[12px] text-text-3">{role(c)}</p>
              </a>
            </li>
          ))}
        </MobileRow>
      )}
      <section aria-label="About" className={cn('grid gap-3', gutter)}>
        <article className="grid gap-2 rounded-lg bg-s1 p-4">
          <h2 className="font-semibold text-[17px]">About</h2>
          {m.tagline && <p className="font-semibold text-[15px]">{m.tagline}</p>}
          <p className="text-[15px] text-text-2 leading-[1.55]">{m.synopsis}</p>
        </article>
        <Facts title="Information" rows={informationOf(d)} />
        <Facts title="Languages and quality" rows={languagesOf(d)} />
      </section>
      <TrailerDialog video={trailer} onOpenChange={(o) => !o && setTrailer(null)} />
      <Sheet open={tracks} onOpenChange={setTracks}>
        <SheetContent title="Audio and subtitles">
          <WatchWith detail={d} compact />
          <p className="text-[13px] text-text-3">Remembered for this movie, on all your devices.</p>
        </SheetContent>
      </Sheet>
    </article>
  )
}

/** An icon with its name under it, as the phone's streaming apps lay out their secondary actions. */
export function Named({
  icon,
  label,
  href,
  pressed,
  onClick,
}: {
  icon: IconName
  label: string
  href?: string
  pressed?: boolean
  onClick?: () => void
}) {
  const classes =
    'grid w-20 min-w-0 justify-items-center gap-1.5 rounded-md py-1 text-center text-[12px] text-text-2 outline-none focus-visible:ring-focus'
  const inner = (
    <>
      <span className="grid size-11 place-items-center rounded-full bg-text/10 text-text">
        <Icon name={icon} size={20} />
      </span>
      {label}
    </>
  )
  return href ? (
    <a href={href} className={classes}>
      {inner}
    </a>
  ) : (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={classes}>
      {inner}
    </button>
  )
}

/** Mark as watched, or unwatched once it is: a toggle, in place of the More menu. */
function Watched({ detail }: { detail: ClientDetail }) {
  const mark = useMarkWatched(detail.item)
  return (
    <Named
      icon="check"
      label="Watched"
      pressed={detail.item.watched}
      onClick={() => void mark.run()}
    />
  )
}

export function Facts({ title, rows }: { title: string; rows: Fact[] }) {
  return (
    <article className="grid gap-2 rounded-lg bg-s1 p-4">
      <h2 className="font-semibold text-[17px]">{title}</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[14px]">
        {rows.map(([k, val]) => (
          <div key={k} className="contents">
            <dt className="text-text-3">{k}</dt>
            <dd className="text-text-2">{val}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
