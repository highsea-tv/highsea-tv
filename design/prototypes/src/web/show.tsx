// SPDX-License-Identifier: AGPL-3.0-only
// A show on the web and desktop, laid out as a film's page is (C4) so the two read as one app: the
// show's art full bleed with the words low on the left (the logo, a meta line, three lines of
// synopsis, the leading cast and who created it). Where a film has Play, a show has the episode
// Play plays, as the Apple TV app and Netflix name it: what's next and its place over the button
// ("Up next · S2, E6 · The Visitor", with the progress part way), "Resume S2, E6" on it, and round
// buttons beside it, as a film's page has them: From the start of that episode, Trailer, Audio and
// subtitles for every episode, Mark the show as watched (there with or without an episode to play)
// and, in the desktop app, Download for that episode. Then the
// episodes: the seasons as line tabs that scroll sideways when there are many, the season's year
// and count with Mark season as watched and Download season (in the desktop app), and the episodes as a list, as Netflix, Infuse and the
// Apple TV app's own pages list them: the still with its progress, the number and title, the
// length and air date, and two lines of synopsis, two to a row on a wide window, with the watched
// check at the end. The season opens on the episode Play plays. Then More like this, Cast and
// crew, and About with Information, as a film's page.
import { createLibraryText, type Fact } from '@highsea-tv/client/library'
import type {
  ClientEpisode,
  ClientSeason,
  ClientShow,
  ClientShowDetail,
  PlaybackPrefs,
  Video,
} from '@highsea-tv/mock/types'
import {
  Button,
  CarouselRow,
  cn,
  controlSizes,
  EmptyState,
  Field,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Rating,
  Select,
  Skeleton,
  SkeletonText,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from '@highsea-tv/ui'
import { useState } from 'react'
import { useParams } from 'wouter'
import { useDesktopApp, useMarkEpisodes, useShow } from '../client/data.ts'
import { showPeopleOf } from '../client/detail-facts.ts'
import { EpisodeDownload, GroupDownload } from '../client/download-button.tsx'
import { episodeSource, type OfflineSource, seasonGroup } from '../client/downloads.ts'
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
import { TrailerDialog } from '../client/trailer.tsx'
import { useAction } from '../mock/hooks.tsx'
import { Facts, heroHeight, Round, scrim } from './detail.tsx'
import { cardWidth } from './home.tsx'
import { gutter, webHref } from './shell.tsx'

/** What the page says about the title, as the apps word it (@highsea-tv/client/library). */
const facts = createLibraryText('en')

export function WebShow() {
  const { id } = useParams<{ id: string }>()
  const detail = useShow(id)
  if (detail.status === 'loading') return <ShowSkeleton />
  if (detail.status === 'error')
    return (
      <main
        className={cn('mx-auto w-full grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}
      >
        <EmptyState
          icon="series"
          tone="error"
          title={detail.error.message}
          action={
            <Button asChild>
              <a href={webHref('/shows')}>Shows</a>
            </Button>
          }
        >
          It may have been removed. Shows lists every show you can watch.
        </EmptyState>
      </main>
    )
  // keyed by the show, so the season picked resets to Play's when another show opens
  return <ShowPage key={id} detail={detail.data} />
}

function ShowPage({ detail: d }: { detail: ClientShowDetail }) {
  const s = d.show
  const next = s.next
  const people = showPeopleOf(d)
  const mark = useMarkEpisodes()
  const target = useEpisodeTarget(d, next?.episode.season ?? d.seasons[0]?.number ?? 1)
  const [season, setSeason] = useState(String(target.season))
  const [trailer, setTrailer] = useState<Video | null>(null)
  const desktop = useDesktopApp()
  const preview = d.videos[0]
  const nextSeason = next && d.seasons.find((x) => x.number === next.episode.season)
  const markLabel = s.watched ? 'Mark the show as unwatched' : 'Mark the show as watched'
  return (
    <main className="pb-16">
      <section aria-labelledby="title" className={heroHeight}>
        <img
          src={s.art.backdrop}
          alt=""
          className="-z-10 absolute inset-0 size-full object-cover"
        />
        <div className={scrim} />
        <div className={cn('mx-auto grid w-full max-w-[1680px] gap-4 pt-28 pb-10', gutter)}>
          <div className="grid max-w-[40rem] gap-3">
            <h1 id="title" className="text-balance text-display">
              <img
                src={s.art.logo}
                alt={s.title}
                className="max-h-32 max-w-[min(26rem,80%)] object-contain object-left drop-shadow-[0_2px_10px_rgb(0_0_0/0.5)]"
              />
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-text-2">
              <span>
                {showYears(s)} · {seasonsCount(s.seasons)}
              </span>
              <span className="rounded-sm border border-text-3 px-1 text-caption">
                {s.certification}
              </span>
              <span>{s.genres.slice(0, 2).join(' · ')}</span>
              {s.rating > 0 && <Rating value={s.rating} size={12} />}
              {s.watched && <span>Watched</span>}
            </p>
            <p className="line-clamp-3 max-w-[60ch] text-body text-text">{s.synopsis}</p>
            <div className="grid gap-0.5 text-caption text-text-2">
              {d.cast.length > 0 && (
                <p className="truncate">
                  <span className="text-text-3">Starring </span>
                  {facts.names(d.cast.slice(0, 3))}
                </p>
              )}
              {d.creators.length > 0 && (
                <p className="truncate">
                  <span className="text-text-3">Created by </span>
                  {facts.names(d.creators)}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-2.5">
            {next && (
              <div className="grid gap-1.5">
                <p className="truncate text-caption text-text-2">
                  <span className="text-text-3">{nextLine(next)} · </span>
                  {episodeCode(next.episode)} · {next.episode.title}
                </p>
                {next.episode.progress !== null && (
                  <div className="flex items-center gap-3 text-caption text-text-2">
                    <div
                      role="progressbar"
                      aria-label="Watched"
                      aria-valuenow={Math.round(next.episode.progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1 w-40 overflow-hidden rounded-full bg-text/20"
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
            )}
            <div className="flex flex-wrap items-center gap-2">
              {next && (
                <Button variant="primary" icon="play" asChild className="min-w-32 justify-center">
                  <a
                    href={webHref(`/play/${next.episode.id}`)}
                    aria-label={`${next.kind === 'resume' ? 'Resume' : 'Play'} ${episodePlace(next.episode)}, ${next.episode.title}`}
                  >
                    {playLabel(next)}
                  </a>
                </Button>
              )}
              {next?.kind === 'resume' && (
                <Round label="Play the episode from the start">
                  <Button variant="overlay" iconOnly icon="replay" asChild>
                    <a href={webHref(`/play/${next.episode.id}/start`)}>
                      <span className="sr-only">Play the episode from the start</span>
                    </a>
                  </Button>
                </Round>
              )}
              {preview && (
                <Round label="Trailer">
                  <Button
                    variant="overlay"
                    iconOnly
                    icon="trailer"
                    aria-label="Trailer"
                    onClick={() => setTrailer(preview)}
                  />
                </Round>
              )}
              <ShowTracks detail={d} />
              <Round label={markLabel}>
                <Button
                  variant="overlay"
                  iconOnly
                  icon="check"
                  aria-label={markLabel}
                  aria-pressed={s.watched}
                  onClick={() => void mark.season.run(s.id, null, !s.watched)}
                />
              </Round>
              {desktop && next && nextSeason && (
                <EpisodeDownload
                  app="desktop"
                  source={episodeSource(next.episode, seasonGroup(s, nextSeason))}
                  round
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-10 pt-2">
        <Episodes detail={d} season={season} onSeason={setSeason} desktop={desktop} />
        {d.related.length > 0 && (
          // 16:9 stills, as on a film's page (the owner's answer 10, prototype-gaps.md)
          <CarouselRow title="More like this" itemClassName={cardWidth}>
            {d.related.map((x) => (
              <ShowPoster
                key={x.id}
                show={x}
                wide
                titleSize="body"
                href={webHref(`/shows/${x.id}`)}
              />
            ))}
          </CarouselRow>
        )}
        {people.length > 0 && (
          <CarouselRow title="Cast and crew" itemClassName="w-[clamp(6.5rem,9vw,8rem)]">
            {people.map((c) => (
              <a
                key={`${c.personId}:${c.job ?? 'cast'}`}
                href={webHref(`/people/${c.personId}`)}
                aria-label={`${c.name}, ${facts.role(c)}`}
                className="group/person grid rounded-lg text-center outline-none focus-visible:ring-focus"
              >
                <img
                  src={c.photo}
                  alt=""
                  className="aspect-square w-full rounded-full bg-s1 object-cover transition-transform duration-300 group-hover/person:scale-105"
                />
                <p className="mt-2 truncate font-semibold text-caption text-text">{c.name}</p>
                <p className="truncate text-caption text-text-3">{facts.role(c)}</p>
              </a>
            ))}
          </CarouselRow>
        )}
        <section
          aria-label="About"
          className={cn(
            'grid items-stretch gap-4 medium:grid-cols-[repeat(2,minmax(0,1fr))]',
            gutter,
          )}
        >
          <article className="grid content-start gap-3 rounded-lg bg-s1 p-5">
            <h2 className="text-title">About</h2>
            <p className="text-body text-text-2">{s.synopsis}</p>
          </article>
          <Facts title="Information" rows={informationOf(d)} />
        </section>
      </div>
      <TrailerDialog video={trailer} onOpenChange={(o) => !o && setTrailer(null)} />
    </main>
  )
}

/**
 * Audio and subtitles for the show, as a film's page has them: picked once, they're the languages
 * every episode starts in, saved as they change.
 */
function ShowTracks({ detail: d }: { detail: ClientShowDetail }) {
  return (
    <Popover>
      <Round label="Audio and subtitles">
        <PopoverTrigger asChild>
          <Button variant="overlay" iconOnly icon="subtitles" aria-label="Audio and subtitles" />
        </PopoverTrigger>
      </Round>
      <PopoverContent className="grid w-80 gap-3 p-4">
        <ShowTracksFields detail={d} />
      </PopoverContent>
    </Popover>
  )
}

/** The show's Audio and Subtitles, saved as they change; the phone's sheet has them too. */
export function ShowTracksFields({ detail: d }: { detail: ClientShowDetail }) {
  const save = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(d.show.id, patch))
  const OFF = 'off'
  return (
    <>
      <Field label="Audio">
        <Select
          value={d.defaults.audioId ?? d.tracks.audio[0]?.id ?? ''}
          onValueChange={(audioId) => save.run({ audioId })}
          options={d.tracks.audio.map((a) => ({ value: a.id, label: a.label }))}
        />
      </Field>
      <Field label="Subtitles">
        <Select
          value={d.defaults.subtitleId ?? OFF}
          onValueChange={(v) => save.run({ subtitleId: v === OFF ? null : v })}
          options={[
            { value: OFF, label: 'Off' },
            ...d.tracks.subtitles.map((t) => ({ value: t.id, label: t.label })),
          ]}
        />
      </Field>
      <p className="text-caption text-text-3">
        For every episode of this show, on all your devices.
      </p>
    </>
  )
}

/** Information: who made it, when it ran, how much of it is here, and its rating. */
export function informationOf(d: ClientShowDetail): Fact[] {
  const s = d.show
  const first = d.seasons.find((x) => x.number === 1)?.episodes[0]
  return [
    ['Created by', facts.names(d.creators)],
    ['First aired', first ? airedDate(first.aired) : String(s.year)],
    ['Status', s.endYear === null ? 'Still airing' : `Ended in ${s.endYear}`],
    ['Here', `${seasonsCount(s.seasons)} · ${episodesCount(s.episodes)}`],
    ['Episodes', `About ${s.runtimeMinutes} min each`],
    ['Rated', s.certification],
    ['Genres', s.genres.join(', ')],
  ]
}

/** The seasons as line tabs, each season's episodes as its panel. */
function Episodes({
  detail: d,
  season,
  onSeason,
  desktop,
}: {
  detail: ClientShowDetail
  season: string
  onSeason: (s: string) => void
  desktop: boolean
}) {
  return (
    <section aria-labelledby="episodes" className={cn('grid gap-4', gutter)}>
      <h2 id="episodes" className="text-title">
        Episodes
      </h2>
      <Tabs variant="line" value={season} onValueChange={onSeason} className="grid gap-5">
        <TabsList aria-label="Season">
          {d.seasons.map((x) => (
            <TabsTrigger key={x.number} value={String(x.number)}>
              {x.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {d.seasons.map((x) => (
          <TabsContent key={x.number} value={String(x.number)} className="grid gap-4">
            <SeasonPanel show={d.show} season={x} desktop={desktop} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function SeasonPanel({
  show,
  season: x,
  desktop,
}: {
  show: ClientShow
  season: ClientSeason
  desktop: boolean
}) {
  const mark = useMarkEpisodes()
  const watched = x.episodes.length > 0 && x.episodes.every((e) => e.watched)
  const group = seasonGroup(show, x)
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-caption text-text-3">
          {[x.year, episodesCount(x.episodes.length)].filter(Boolean).join(' · ')}
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon="check"
          className="ms-auto"
          aria-pressed={watched}
          onClick={() => void mark.season.run(show.id, x.number, !watched)}
        >
          {watched ? 'Mark season as unwatched' : 'Mark season as watched'}
        </Button>
        {desktop && (
          <GroupDownload
            app="desktop"
            label="Download season"
            ghost
            name={`${x.title} of ${show.title}`}
            sources={x.episodes.map((e) => episodeSource(e, group))}
          />
        )}
      </div>
      <ol aria-label={x.title} className="grid gap-x-6 gap-y-2 wide:grid-cols-2">
        {x.episodes.map((e) => (
          <li key={e.id}>
            <EpisodeRow episode={e} download={desktop ? episodeSource(e, group) : null} />
          </li>
        ))}
      </ol>
    </>
  )
}

/**
 * An episode: the still (Play on hover and focus, its progress along the foot) and its words, the
 * whole row playing it; Mark as watched at the end, as its own button, its check in the accent once it's watched.
 */
function EpisodeRow({
  episode: e,
  download,
}: {
  episode: ClientEpisode
  /** In the desktop app, Download before Mark as watched. */
  download: OfflineSource | null
}) {
  const mark = useMarkEpisodes()
  const label = e.watched ? 'Mark as unwatched' : 'Mark as watched'
  return (
    <div
      data-episode={e.id}
      className="group/episode relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg p-2 transition-tint hover:bg-s1 has-[a:focus-visible]:bg-s1"
    >
      <a
        href={webHref(`/play/${e.id}`)}
        aria-label={`Play ${episodePlace(e)}, ${e.title}, ${episodeTime(e)}${e.watched ? ', watched' : ''}`}
        className="grid grid-cols-[minmax(7.5rem,14rem)_minmax(0,1fr)] items-center gap-4 rounded-md outline-none focus-visible:ring-focus max-medium:grid-cols-[7.5rem_minmax(0,1fr)]"
      >
        <span className="relative isolate block aspect-still overflow-hidden rounded-md bg-s2">
          <img
            src={e.still}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
          <span className="absolute inset-0 grid place-items-center bg-bg/40 opacity-0 transition-opacity group-hover/episode:opacity-100 group-has-[a:focus-visible]/episode:opacity-100">
            <span className="glass-badge grid size-10 place-items-center rounded-full text-text">
              <Icon name="play" size={18} className="fill-current" />
            </span>
          </span>
          {e.progress !== null && (
            <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-text/25">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${e.progress * 100}%` }}
              />
            </span>
          )}
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-caption text-text-3">{e.number}</span>
            <span className="truncate font-semibold text-body text-text">{e.title}</span>
          </span>
          <span className="text-caption text-text-3">
            {episodeTime(e)} · {airedDate(e.aired)}
          </span>
          <span className="line-clamp-2 max-w-[70ch] text-body text-text-2 max-medium:hidden">
            {e.synopsis}
          </span>
        </span>
      </a>
      {download ? <EpisodeDownload app="desktop" source={download} /> : <span />}
      <Tooltip content={label}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={`${label}: ${e.title}`}
          aria-pressed={e.watched}
          onClick={() => void mark.episode.run(e.id, !e.watched)}
        >
          <Icon
            name="check"
            className={cn(controlSizes.sm.icon, e.watched && 'text-accent-text')}
          />
        </Button>
      </Tooltip>
    </div>
  )
}

/** The page as it will be: the hero, the season tabs and a few episodes. */
function ShowSkeleton() {
  return (
    <main aria-busy className="pb-16">
      <div className={heroHeight}>
        <div className="-z-10 absolute inset-0 bg-s1" />
        <div className={scrim} />
        <div className={cn('mx-auto grid w-full max-w-[1680px] gap-4 pt-28 pb-10', gutter)}>
          <div className="grid max-w-[40rem] gap-3">
            <Skeleton className="my-1 h-12 w-[min(26rem,80%)]" />
            <Skeleton className="my-1 h-4 w-72 max-w-full" />
            <SkeletonText lines={3} className="max-w-[60ch] py-1" />
            <div className="grid gap-1.5">
              <Skeleton className="h-3 w-72 max-w-full" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <Skeleton className="h-3 w-60" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-(--control-h) w-40 rounded-md" />
            <Skeleton className="size-(--control-h) rounded-(--control-radius)" />
          </div>
        </div>
      </div>
      <div className={cn('mx-auto grid w-full max-w-[1680px] gap-4 pt-2', gutter)}>
        <Skeleton className="my-0.5 h-6 w-32" />
        <div className="flex gap-5">
          {Array.from({ length: 3 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <Skeleton key={i} className="h-5 w-20" />
          ))}
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            key={i}
            className="grid grid-cols-[minmax(7.5rem,14rem)_minmax(0,1fr)] items-center gap-4 p-2 max-medium:grid-cols-[7.5rem_minmax(0,1fr)]"
          >
            <Skeleton className="aspect-still rounded-md" />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-32" />
              <SkeletonText lines={2} className="max-w-[70ch]" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
