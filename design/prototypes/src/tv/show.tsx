// SPDX-License-Identifier: AGPL-3.0-only
// A show on the TV, laid out as a film's page is so the two read as one app: the show's art full
// bleed with the words low on the left (the logo, a meta line, three lines of synopsis, the leading
// cast and who created it), and what's next over Play, which names the episode ("Resume S2, E6"),
// as the Apple TV app's show pages do; From the start, Trailer, Audio and subtitles (the panel at
// the right, for every episode) and Mark the show as watched are round buttons beside it, as a
// film's page has them. Under the first screen, as the Apple TV app lays a show out: the seasons as
// choices, with Mark season as watched after a rule, then the season's episodes as a row of stills,
// each with its number, title, two lines of synopsis, and length and air date under it. Choosing a
// season keeps focus on the choice (the owner, 2026-10-31); Down from the seasons enters the
// episodes at the one Play plays. Then More like this, Cast and crew, and About and Information.
import { createLibraryText } from '@highsea-tv/client/library'
import { Chip, cn, Icon, Rating, Skeleton } from '@highsea-tv/ui'
import { useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useLongPress } from '../client/continue-menu.ts'
import { useMarkEpisodes, useShow } from '../client/data.ts'
import { showPeopleOf } from '../client/detail-facts.ts'
import { UnwatchedCount } from '../client/show-card.tsx'
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
import { useAction } from '../mock/hooks.tsx'
import type {
  ClientEpisode,
  ClientShowDetail,
  ClientTrack,
  ClientVersion,
  PlaybackPrefs,
  Video,
} from '../mock/types.ts'
import { informationOf } from '../web/show.tsx'
import { Facts, RoundAction, scrim, TvTrailer } from './detail.tsx'
import { TvFilmRowSkeleton } from './film-row.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvRow,
  TvTile,
  tvChip,
  tvHref,
  useInitialFocus,
  useRowNavigation,
} from './kit.tsx'
import { TvMenu } from './song-menu.tsx'
import { TvTracksPanel } from './tracks.tsx'

/** What the page says about the title, as the apps word it (@highsea-tv/client/library). */
const facts = createLibraryText('en')

export function TvShow({ panel, onPanel }: { panel: boolean; onPanel: (open: boolean) => void }) {
  const { id, episode } = useParams<{ id: string; episode?: string }>()
  const detail = useShow(id)
  // opened at an episode, focus starts on it; otherwise on Play
  useInitialFocus(
    detail.status === 'success',
    `${id}/${episode}`,
    episode ? `[data-episode="${episode}"]` : '[data-initial]',
  )
  if (detail.status === 'loading') return <ShowSkeleton />
  if (detail.status === 'error')
    return (
      <TvMessage
        title={detail.error.message}
        actions={
          <TvButton primary initial href={tvHref('/shows')}>
            Shows
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )
  // keyed by the show, so the season picked resets to Play's when another show opens
  return <ShowPage key={id} detail={detail.data} panel={panel} onPanel={onPanel} />
}

/** The show's languages as the tracks panel lists them: one choice for every episode. */
function versionOf(d: ClientShowDetail): ClientVersion {
  const track = (kind: ClientTrack['kind']) => (t: { id: string; label: string }) => ({
    ...t,
    kind,
    language: t.id,
    detail: null,
    default: false,
    picture: false,
  })
  return {
    id: d.show.id,
    label: d.show.title,
    detail: '',
    audio: d.tracks.audio.map(track('audio')),
    subtitles: d.tracks.subtitles.map(track('subtitle')),
  }
}

function ShowPage({
  detail: d,
  panel,
  onPanel,
}: {
  detail: ClientShowDetail
  panel: boolean
  onPanel: (open: boolean) => void
}) {
  const s = d.show
  const next = s.next
  const mark = useMarkEpisodes()
  const target = useEpisodeTarget(d, next?.episode.season ?? d.seasons[0]?.number ?? 1)
  const [season, setSeason] = useState(target.season)
  const shown = d.seasons.find((x) => x.number === season) ?? d.seasons[0]
  const [trailer, setTrailer] = useState<Video | null>(null)
  const preview = d.videos[0]
  const version = versionOf(d)
  const save = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(s.id, patch))
  const trailerButton = useRef<HTMLElement | null>(null)
  const seasonWatched = !!shown && shown.episodes.every((e) => e.watched)
  const people = showPeopleOf(d)
  // the episode OK was held on, whose menu is open
  const [held, setHeld] = useState<ClientEpisode | null>(null)
  const [, navigate] = useLocation()
  // Up and Down go row by row: the actions, the seasons, the episodes, More like this, the people, About
  const rows = useRef<HTMLDivElement>(null)
  useRowNavigation(rows, s.id)
  return (
    <>
      <div
        {...(panel || trailer ? { 'data-isolate': '' } : {})}
        className="absolute inset-0 overflow-hidden"
      >
        <div
          ref={rows}
          data-scroll="y"
          data-keep="0.4"
          className="relative grid grid-cols-1 gap-[1.6cqw] pb-(--tv-safe-y) transition-lift"
        >
          <img
            src={s.art.backdrop}
            alt=""
            className="absolute inset-x-0 top-0 h-[56.25cqw] w-full object-cover"
          />
          <div className={cn('absolute inset-x-0 top-0 h-[56.25cqw]', scrim)} />
          <TvHead down="actions" className="px-(--tv-safe-x)" />
          <section
            aria-labelledby="title"
            data-keep="1"
            className="relative flex h-[40.5cqw] max-w-[50cqw] flex-col justify-end gap-[1.1cqw] px-(--tv-safe-x)"
          >
            <h1
              id="title"
              className="font-semibold text-(length:--tv-text-hero-title) leading-[0.95] tracking-display"
            >
              <img
                src={s.art.logo}
                alt={s.title}
                className="max-h-[8.5cqw] max-w-[30cqw] object-contain object-left drop-shadow-[0_0.2cqw_0.8cqw_rgb(0_0_0/0.5)]"
              />
            </h1>
            <p className="flex flex-wrap items-center gap-x-[0.8cqw] gap-y-[0.4cqw] text-(length:--tv-text-meta) text-text-2">
              <span>
                {showYears(s)} · {seasonsCount(s.seasons)}
              </span>
              <span className="rounded-(--tv-radius-pill) border border-text-3 px-[0.4cqw] text-(length:--tv-text-quality)">
                {s.certification}
              </span>
              <span>{s.genres.slice(0, 2).join(' · ')}</span>
              {s.rating > 0 && <Rating value={s.rating} size={20} />}
              {s.watched && <span>Watched</span>}
            </p>
            <p className="line-clamp-3 max-w-[42cqw] text-(length:--tv-text-synopsis) leading-[1.45]">
              {s.synopsis}
            </p>
            <div className="grid max-w-[42cqw] gap-[0.2cqw] text-(length:--tv-text-meta) text-text-2">
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
            {/* the actions keep room under them for the name a round button shows on focus */}
            <div className="grid gap-[0.7cqw] pb-[1.8cqw]">
              {next && (
                <div className="flex items-center gap-[0.8cqw] text-(length:--tv-text-pill) text-text-2">
                  {next.episode.progress !== null && (
                    <span className="h-[0.3cqw] w-[11cqw] overflow-hidden rounded-full bg-text/20">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${next.episode.progress * 100}%` }}
                      />
                    </span>
                  )}
                  <span className="truncate">
                    <span className="text-text-3">{nextLine(next)} · </span>
                    {episodeCode(next.episode)} · {next.episode.title}
                    {next.episode.progress !== null && ` · ${episodeTime(next.episode)}`}
                  </span>
                </div>
              )}
              <div
                data-row=""
                data-group="actions"
                data-go-up="nav"
                className="flex items-center gap-[1cqw]"
              >
                {next && (
                  <TvButton
                    primary
                    initial
                    icon="play"
                    href={tvHref(`/play/${next.episode.id}`)}
                    aria-label={`${next.kind === 'resume' ? 'Resume' : 'Play'} ${episodePlace(next.episode)}, ${next.episode.title}`}
                    className="min-w-[11cqw] justify-center"
                  >
                    {playLabel(next)}
                  </TvButton>
                )}
                {next?.kind === 'resume' && (
                  <RoundAction
                    icon="replay"
                    label="From the start"
                    href={tvHref(`/play/${next.episode.id}/start`)}
                  />
                )}
                {preview && (
                  <RoundAction
                    icon="trailer"
                    label="Trailer"
                    onClick={() => {
                      trailerButton.current =
                        document.activeElement instanceof HTMLElement
                          ? document.activeElement
                          : null
                      setTrailer(preview)
                    }}
                  />
                )}
                <RoundAction
                  icon="subtitles"
                  label="Audio and subtitles"
                  onClick={() => onPanel(true)}
                />
                <RoundAction
                  icon="check"
                  label={s.watched ? 'Mark as unwatched' : 'Mark as watched'}
                  pressed={s.watched}
                  onClick={() => void mark.season.run(s.id, null, !s.watched)}
                />
              </div>
            </div>
          </section>

          <div data-row="" className="relative grid grid-cols-1">
            <div
              data-group="seasons"
              data-go-up="actions"
              className="-ms-[1.2cqw] flex items-center gap-[0.8cqw] px-(--tv-safe-x)"
            >
              {d.seasons.map((x) => (
                <Chip
                  key={x.number}
                  data-focusable=""
                  selected={x.number === shown?.number}
                  onClick={() => setSeason(x.number)}
                  className={tvChip}
                >
                  {x.title}
                </Chip>
              ))}
              <span aria-hidden className="mx-[0.4cqw] h-[1.8cqw] w-px bg-text/20" />
              {shown && (
                <Chip
                  data-focusable=""
                  icon="check"
                  selected={seasonWatched}
                  onClick={() => void mark.season.run(s.id, shown.number, !seasonWatched)}
                  className={tvChip}
                >
                  {seasonWatched ? 'Mark season as unwatched' : 'Mark season as watched'}
                </Chip>
              )}
            </div>
          </div>
          {shown && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow
                key={shown.number}
                group="episodes"
                title={shown.title}
                suffix={[shown.year, episodesCount(shown.episodes.length)]
                  .filter(Boolean)
                  .join(' · ')}
                goUp="seasons"
              >
                {shown.episodes.map((e) => (
                  <li key={e.id} className="w-[24cqw] shrink-0">
                    <Episode
                      episode={e}
                      entry={e.id === next?.episode.id}
                      onMenu={() => setHeld(e)}
                    />
                  </li>
                ))}
              </TvRow>
            </div>
          )}
          {d.related.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow group="related" title="More like this" goUp="episodes">
                {d.related.map((x) => (
                  <li key={x.id} className="w-[12cqw] shrink-0">
                    <TvTile
                      title={x.title}
                      caption={seasonsCount(x.seasons)}
                      src={x.art.poster}
                      href={tvHref(`/shows/${x.id}`)}
                      status={<UnwatchedCount show={x} />}
                    />
                  </li>
                ))}
              </TvRow>
            </div>
          )}
          {people.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow
                group="people"
                title="Cast and crew"
                goUp={d.related.length > 0 ? 'related' : 'episodes'}
              >
                {people.map((c) => (
                  <li key={`${c.personId}:${c.job ?? 'cast'}`} className="w-[8cqw] shrink-0">
                    <a
                      href={tvHref(`/people/${c.personId}`)}
                      data-focusable=""
                      className="group/link grid justify-items-center text-center outline-none"
                    >
                      <img
                        src={c.photo}
                        alt=""
                        className="aspect-square w-full rounded-full object-cover transition-lift group-focus-visible/link:scale-(--tv-scale-poster) group-focus-visible/link:shadow-(--tv-focus-shadow)"
                      />
                      <p className="mt-[0.9cqw] w-full truncate font-semibold text-(length:--tv-text-pill) text-text-2 leading-[1.3] group-focus-visible/link:text-text">
                        {c.name}
                      </p>
                      <p className="w-full truncate text-(length:--tv-text-pill) text-text-3 leading-[1.3]">
                        {facts.role(c)}
                      </p>
                    </a>
                  </li>
                ))}
              </TvRow>
            </div>
          )}
          <div data-row="" className="relative grid grid-cols-1">
            <About detail={d} />
          </div>
        </div>
      </div>
      {held && (
        // OK held on an episode: mark it watched, or unwatched once it is, as a film's page has it
        // (client-detail.md › Mark as watched); From the start when it's partway
        <TvMenu
          name={`${episodeCode(held)} · ${held.title}`}
          line={s.title}
          items={[
            {
              icon: 'check',
              label: held.watched ? 'Mark as unwatched' : 'Mark as watched',
              run: () => void mark.episode.run(held.id, !held.watched),
            },
            ...(held.progress !== null
              ? [
                  {
                    icon: 'replay' as const,
                    label: 'From the start',
                    run: () => navigate(`/play/${held.id}/start`),
                  },
                ]
              : []),
          ]}
          onClose={() => setHeld(null)}
        />
      )}
      {trailer && (
        <TvTrailer
          video={trailer}
          onClose={() => {
            setTrailer(null)
            trailerButton.current?.focus({ preventScroll: true })
          }}
        />
      )}
      <TvTracksPanel
        open={panel}
        versions={[version]}
        version={version}
        audio={version.audio.find((a) => a.id === (d.defaults.audioId ?? 'en')) ?? null}
        subtitle={version.subtitles.find((t) => t.id === d.defaults.subtitleId) ?? null}
        onVersion={() => {}}
        onAudio={(audioId) => save.run({ audioId })}
        onSubtitle={(subtitleId) => {
          save.run({ subtitleId })
          onPanel(false)
        }}
        show
      />
    </>
  )
}

/**
 * An episode: its still lifts on focus, with the progress along its foot and a check once it's
 * watched, and its words under it, as the Apple TV app lists a season's episodes.
 */
function Episode({
  episode: e,
  entry,
  onMenu,
}: {
  episode: ClientEpisode
  entry: boolean
  /** OK held: the episode's menu, to mark it watched. */
  onMenu: () => void
}) {
  const press = useLongPress(onMenu)
  return (
    <a
      href={tvHref(`/play/${e.id}`)}
      data-focusable=""
      data-episode={e.id}
      {...(entry ? { 'data-entry': '' } : {})}
      {...press}
      aria-label={`Play ${episodePlace(e)}, ${e.title}, ${episodeTime(e)}${e.watched ? ', watched' : ''}. Hold OK for more.`}
      className="group/link grid gap-[0.3cqw] outline-none"
    >
      <span className="relative isolate mb-[0.7cqw] block aspect-still overflow-hidden rounded-(--tv-radius-poster) bg-s1 transition-lift group-focus-visible/link:scale-(--tv-scale-poster) group-focus-visible/link:shadow-(--tv-focus-shadow)">
        <img src={e.still} alt="" className="absolute inset-0 size-full object-cover" />
        {e.watched && (
          <span className="glass-badge absolute top-[0.7cqw] right-[0.7cqw] grid size-[1.8cqw] place-items-center rounded-full text-text">
            <Icon name="check" size={20} className="size-[1cqw]" />
          </span>
        )}
        {e.progress !== null && (
          <span className="absolute inset-x-[0.8cqw] bottom-[0.8cqw] h-[0.3cqw] overflow-hidden rounded-full bg-text/25">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${e.progress * 100}%` }}
            />
          </span>
        )}
      </span>
      <span className="font-mono text-(length:--tv-text-quality) text-text-3 uppercase">
        {e.season === 0 ? `Special ${e.number}` : `Episode ${e.number}`}
      </span>
      <span className="truncate font-semibold text-(length:--tv-text-meta) text-text-2 leading-[1.3] group-focus-visible/link:text-text">
        {e.title}
      </span>
      <span className="line-clamp-2 text-(length:--tv-text-pill) text-text-2 leading-[1.4]">
        {e.synopsis}
      </span>
      <span className="text-(length:--tv-text-pill) text-text-3">
        {episodeTime(e)} · {airedDate(e.aired)}
      </span>
    </a>
  )
}

/** About and Information, as cards that take focus, as on a film's page. */
function About({ detail: d }: { detail: ClientShowDetail }) {
  const card =
    'grid content-start gap-[0.9cqw] rounded-(--tv-radius-poster) bg-s1/80 p-[1.6cqw] outline-none transition-lift focus-visible:scale-[1.015] focus-visible:bg-s2 focus-visible:shadow-(--tv-focus-shadow)'
  const heading = 'font-semibold text-(length:--tv-text-row-title)'
  return (
    <section
      data-group="about"
      data-go-up="actions"
      aria-label="About"
      className="grid grid-cols-[1.2fr_1fr] items-stretch gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw]"
    >
      <article tabIndex={-1} data-focusable="" aria-label="About" className={card}>
        <h2 className={heading}>About</h2>
        <p className="line-clamp-[8] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
          {d.show.synopsis}
        </p>
      </article>
      <Facts title="Information" rows={informationOf(d)} className={card} heading={heading} />
    </section>
  )
}

/** The page as it will be: the art's place and fades, the hero's lines and buttons, a row. */
function ShowSkeleton() {
  return (
    <main aria-busy className="absolute inset-0 overflow-hidden">
      <div className="relative grid grid-cols-1 gap-[1.6cqw]">
        <div className="absolute inset-x-0 top-0 h-[56.25cqw] bg-s1" />
        <div className={cn('absolute inset-x-0 top-0 h-[56.25cqw]', scrim)} />
        <TvHead className="px-(--tv-safe-x)" />
        <div className="relative flex h-[40.5cqw] max-w-[50cqw] flex-col justify-end gap-[1.1cqw] px-(--tv-safe-x)">
          <Skeleton className="h-[7cqw] w-[26cqw] rounded-[0.6cqw]" />
          <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[22cqw]" />
          <div className="grid max-w-[42cqw] gap-[0.6cqw] py-[0.2cqw]">
            <Skeleton className="h-[1.1cqw] w-full" />
            <Skeleton className="h-[1.1cqw] w-full" />
            <Skeleton className="h-[1.1cqw] w-3/5" />
          </div>
          <div className="grid gap-[0.5cqw]">
            <Skeleton className="h-[1.05cqw] w-[24cqw]" />
            <Skeleton className="h-[1.05cqw] w-[16cqw]" />
          </div>
          <Skeleton className="my-[0.1cqw] h-[0.95cqw] w-[18cqw]" />
          <div className="flex items-center gap-[1cqw] pb-[1.8cqw]">
            <Skeleton className="h-[2.9cqw] w-[11cqw] rounded-(--tv-radius-button)" />
            <Skeleton className="size-[2.9cqw] rounded-full" />
            <Skeleton className="size-[2.9cqw] rounded-full" />
          </div>
        </div>
        <TvFilmRowSkeleton />
      </div>
    </main>
  )
}
