// SPDX-License-Identifier: AGPL-3.0-only
// A show on the phone, laid out as a film's page is so the two read as one app: the show's art
// across the top with Back over it and the logo low on it, a meta line, what's next with its
// progress, Play across the width naming the episode ("Resume S2, E6"), three lines of synopsis,
// the leading cast and who created it, and named icon buttons: From the start of that episode, and
// Mark the show as watched. Then the episodes, as the Apple TV app and Netflix lay them out on a
// phone: the seasons as pills that scroll sideways, the season's year and count with Mark season
// as watched, and the episodes one under another, each its still with the progress, the number,
// title and length, and two lines of synopsis under them, with the watched check at the end. The
// season opens on the episode Play plays. Then More like this, Cast and crew, and About and
// Information as cards.
import { Button, cn, EmptyState, Icon, Rating, Skeleton, SkeletonText } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useParams } from 'wouter'
import { useMarkEpisodes, useShow } from '../client/data.ts'
import { names, role, showPeopleOf } from '../client/detail-facts.ts'
import { ShowPoster } from '../client/show-card.tsx'
import {
  airedDate,
  episodeCode,
  episodePlace,
  episodesCount,
  episodeTime,
  nextLine,
  playLabel,
  seasonsCount,
  showYears,
  useEpisodeTarget,
} from '../client/shows.ts'
import type { ClientEpisode, ClientSeason, ClientShowDetail } from '../mock/types.ts'
import { informationOf } from '../web/show.tsx'
import { Facts, fade, Named } from './detail.tsx'
import { MobileRow } from './home.tsx'
import { gutter, mobileHref } from './shell.tsx'

const pill =
  'grid min-h-9 shrink-0 cursor-pointer place-items-center rounded-full border border-line px-3.5 text-[14px] text-text-2 outline-none focus-visible:ring-focus aria-pressed:border-transparent aria-pressed:bg-text aria-pressed:text-bg'

export function MobileShow() {
  const { id } = useParams<{ id: string }>()
  const detail = useShow(id)
  const back = (
    <a
      href={mobileHref('/library/shows')}
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
          <Skeleton className="my-0.5 h-3 w-56" />
          <Skeleton className="h-12 rounded-md" />
          <SkeletonText lines={3} className="py-1" />
          <div className="flex gap-2 pt-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-[42%_minmax(0,1fr)] items-center gap-3">
              <Skeleton className="aspect-still rounded-md" />
              <div className="grid gap-1.5">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  if (detail.status === 'error')
    return (
      <div className={cn('grid min-h-full place-items-center py-16', gutter)}>
        {back}
        <EmptyState
          icon="series"
          tone="error"
          title={detail.error.message}
          action={
            <Button asChild>
              <a href={mobileHref('/library/shows')}>Shows</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </div>
    )
  return (
    <>
      {back}
      {/* keyed by the show, so the season picked resets to Play's when another show opens */}
      <ShowPage key={id} detail={detail.data} />
    </>
  )
}

function ShowPage({ detail: d }: { detail: ClientShowDetail }) {
  const s = d.show
  const next = s.next
  const people = showPeopleOf(d)
  const mark = useMarkEpisodes()
  const target = useEpisodeTarget(d, next?.episode.season ?? d.seasons[0]?.number ?? 1)
  const [season, setSeason] = useState(target.season)
  const shown = d.seasons.find((x) => x.number === season) ?? d.seasons[0]
  return (
    <article aria-labelledby="title" className="relative grid grid-cols-[minmax(0,1fr)] gap-5 pb-6">
      <div className="relative">
        <img src={s.art.backdrop} alt="" className="aspect-still w-full object-cover" />
        <div className={fade} />
      </div>
      <div className={cn('-mt-16 relative grid grid-cols-[minmax(0,1fr)] gap-3', gutter)}>
        <h1 id="title" className="font-semibold text-[28px] leading-[1.15] tracking-display">
          <img
            src={s.art.logo}
            alt={s.title}
            className="max-h-20 max-w-[75%] object-contain object-left drop-shadow-[0_2px_8px_rgb(0_0_0/0.5)]"
          />
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-text-2">
          <span>
            {showYears(s)} · {seasonsCount(s.seasons)}
          </span>
          <span className="rounded-sm border border-text-3 px-1 text-[12px]">
            {s.certification}
          </span>
          <span>{s.genres[0]}</span>
          {s.rating > 0 && <Rating value={s.rating} size={12} />}
          {s.watched && <span>Watched</span>}
        </p>
        {next && (
          <>
            <div className="grid gap-1.5">
              <p className="truncate text-[13px] text-text-2">
                <span className="text-text-3">{nextLine(next)} · </span>
                {episodeCode(next.episode)} · {next.episode.title}
              </p>
              {next.episode.progress !== null && (
                <div className="flex items-center gap-3 text-[13px] text-text-2">
                  <div
                    role="progressbar"
                    aria-label="Watched"
                    aria-valuenow={Math.round(next.episode.progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-text/20"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${next.episode.progress * 100}%` }}
                    />
                  </div>
                  {episodeTime(next.episode)}
                </div>
              )}
            </div>
            <Button
              variant="primary"
              icon="play"
              asChild
              className="h-auto min-h-12 w-full whitespace-normal py-2 text-[16px]"
            >
              <a
                href={mobileHref(`/play/${next.episode.id}`)}
                aria-label={`${next.kind === 'resume' ? 'Resume' : 'Play'} ${episodePlace(next.episode)}, ${next.episode.title}`}
              >
                {playLabel(next)}
              </a>
            </Button>
          </>
        )}
        <p className="line-clamp-3 text-[15px] leading-[1.55]">{s.synopsis}</p>
        {(d.cast.length > 0 || d.creators.length > 0) && (
          <div className="grid gap-0.5 text-[13px] text-text-2">
            {d.cast.length > 0 && (
              <p className="line-clamp-2">
                <span className="text-text-3">Starring </span>
                {names(d.cast.slice(0, 3))}
              </p>
            )}
            {d.creators.length > 0 && (
              <p className="truncate">
                <span className="text-text-3">Created by </span>
                {names(d.creators)}
              </p>
            )}
          </div>
        )}
        <div className="flex justify-around gap-1 pt-1">
          {next?.kind === 'resume' && (
            <Named
              icon="replay"
              label="From the start"
              href={mobileHref(`/play/${next.episode.id}/start`)}
            />
          )}
          <Named
            icon="check"
            label="Watched"
            pressed={s.watched}
            onClick={() => void mark.season.run(s.id, null, !s.watched)}
          />
        </div>
      </div>

      <section aria-labelledby="episodes" className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 id="episodes" className={cn('font-semibold text-[17px]', gutter)}>
          Episodes
        </h2>
        {d.seasons.length > 1 && (
          <fieldset
            className={cn(
              '-my-1 flex min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none]',
              gutter,
            )}
          >
            <legend className="sr-only">Season</legend>
            {d.seasons.map((x) => (
              <button
                key={x.number}
                type="button"
                aria-pressed={x.number === shown?.number}
                onClick={() => setSeason(x.number)}
                className={pill}
              >
                {x.title}
              </button>
            ))}
          </fieldset>
        )}
        {shown && <Season show={s.id} season={shown} />}
      </section>

      {d.related.length > 0 && (
        <MobileRow title="More like this">
          {d.related.map((x) => (
            <li key={x.id} className="w-[30%] shrink-0 snap-start">
              <ShowPoster show={x} href={mobileHref(`/shows/${x.id}`)} />
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
          <p className="text-[15px] text-text-2 leading-[1.55]">{s.synopsis}</p>
        </article>
        <Facts title="Information" rows={informationOf(d)} />
      </section>
    </article>
  )
}

function Season({ show, season: x }: { show: string; season: ClientSeason }) {
  const mark = useMarkEpisodes()
  const watched = x.episodes.length > 0 && x.episodes.every((e) => e.watched)
  return (
    <div className={cn('grid gap-3', gutter)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[13px] text-text-3">
          {[x.year, episodesCount(x.episodes.length)].filter(Boolean).join(' · ')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon="check"
          className="-me-2 ms-auto"
          aria-pressed={watched}
          onClick={() => void mark.season.run(show, x.number, !watched)}
        >
          {watched ? 'Mark season as unwatched' : 'Mark season as watched'}
        </Button>
      </div>
      <ol aria-label={x.title} className="grid gap-4">
        {x.episodes.map((e) => (
          <li key={e.id}>
            <Episode episode={e} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** An episode: its still and words play it; the check beside them marks it watched. */
function Episode({ episode: e }: { episode: ClientEpisode }) {
  const mark = useMarkEpisodes()
  const label = e.watched ? 'Mark as unwatched' : 'Mark as watched'
  return (
    <div data-episode={e.id} className="grid gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <a
          href={mobileHref(`/play/${e.id}`)}
          aria-label={`Play ${episodePlace(e)}, ${e.title}, ${episodeTime(e)}${e.watched ? ', watched' : ''}`}
          className="grid grid-cols-[42%_minmax(0,1fr)] items-center gap-3 rounded-md outline-none transition-press focus-visible:ring-focus active:scale-97"
        >
          <span className="relative isolate block aspect-still overflow-hidden rounded-md bg-s2">
            <img
              src={e.still}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center">
              <span className="glass-badge grid size-8 place-items-center rounded-full text-text">
                <Icon name="play" size={14} className="fill-current" />
              </span>
            </span>
            {e.progress !== null && (
              <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-text/25">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${e.progress * 100}%` }}
                />
              </span>
            )}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="line-clamp-2 font-semibold text-[15px] leading-[1.3]">
              {e.number}. {e.title}
            </span>
            <span className="text-[13px] text-text-3">{episodeTime(e)}</span>
            <span className="text-[12px] text-text-3">{airedDate(e.aired)}</span>
          </span>
        </a>
        <button
          type="button"
          aria-label={`${label}: ${e.title}`}
          aria-pressed={e.watched}
          onClick={() => void mark.episode.run(e.id, !e.watched)}
          className={cn(
            'grid size-10 cursor-pointer place-items-center rounded-full outline-none transition-tint focus-visible:ring-focus',
            e.watched ? 'bg-accent-soft text-accent-text' : 'text-text-3',
          )}
        >
          <Icon name="check" size={18} />
        </button>
      </div>
      <p className="line-clamp-2 text-[14px] text-text-2 leading-[1.5]">{e.synopsis}</p>
    </div>
  )
}
