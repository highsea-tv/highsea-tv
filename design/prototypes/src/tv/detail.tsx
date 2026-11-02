// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, TV (docs/product/client-detail.md#tv), laid out from what the big streaming apps'
// film pages share (Netflix, HBO Max, Disney+, Prime Video, Apple TV; the owner, 2026-10-30):
// - the first screen is the film's own art, sharp and full bleed, with no poster, faded only where
//   the words stand (at the left and the foot), and the right half left to the picture;
// - the title's logo low on the left, then a short meta line with the rating and quality as badges,
//   the synopsis cut at three lines, the leading cast and the director, and the picks it plays with;
// - one strong action (Play, or Resume with its progress bar just above it) and the rest as round
//   icon buttons whose name shows under them on focus: From the start, Trailer, Audio and
//   subtitles, Mark as watched;
// - the next row's title peeking at the foot, so Down is plainly where more is: More like this,
//   the Collections it's in, Trailers and extras, Cast and crew (round portraits, each opening the person's page), then About,
//   Information and Languages as three cards, the long text kept off the first screen.
// Back closes the panel or the trailer, then leaves.
import {
  createLibraryText,
  type Fact,
  peopleOf,
  previewOf,
  videoLength,
} from '@highsea-tv/client/library'
import { Button, cn, Icon, type IconName, QualityTag, Rating, Skeleton } from '@highsea-tv/ui'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'wouter'
import { collectionCaption, left, runtime, useItem } from '../client/data.ts'
import { useMarkWatched } from '../client/item-more.tsx'
import { CollectionTile } from '../kit/collection-art.tsx'
import { useAction } from '../mock/hooks.tsx'
import type { ClientDetail, PlaybackPrefs, Video } from '../mock/types.ts'
import { quiet } from './album.tsx'
import { useBack } from './back.ts'
import { TvFilmRow, TvFilmRowSkeleton } from './film-row.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvRow,
  tvFocus,
  tvHref,
  useInitialFocus,
  useRowNavigation,
} from './kit.tsx'
import { TvTracksPanel } from './tracks.tsx'

/** What the page says about the title, as the apps word it (@highsea-tv/client/library). */
const facts = createLibraryText('en')

/** The fades over the art: the words' side and the foot, so the right half stays the picture's. */
export const scrim =
  'bg-[linear-gradient(90deg,var(--color-bg)_0%,rgb(from_var(--color-bg)_r_g_b/0.85)_22%,transparent_58%),linear-gradient(0deg,var(--color-bg)_4%,transparent_40%)]'

export function TvDetail({ panel, onPanel }: { panel: boolean; onPanel: (open: boolean) => void }) {
  const { id } = useParams<{ id: string }>()
  const detail = useItem(id, 'tv')
  const save = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(id, patch))
  const [focusKey, setFocusKey] = useState(0)
  const [trailer, setTrailer] = useState<Video | null>(null)
  // another film's page is the same screen, so its trailer closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes when the film changes
  useEffect(() => setTrailer(null), [id])
  // the tracks panel hands focus back to its button itself
  useInitialFocus(detail.status === 'success' && !trailer, `${id}:${focusKey}`)
  // Up and Down go row by row: the actions, More like this, the collections, the extras, the people, then About
  const rows = useRef<HTMLDivElement>(null)
  useRowNavigation(rows, detail.status === 'success' && id)

  if (detail.status === 'loading') return <DetailSkeleton />
  if (detail.status === 'error')
    return (
      <TvMessage
        title={detail.error.message}
        actions={
          <TvButton primary initial href={tvHref('/movies')}>
            Movies
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )

  const d = detail.data
  const m = d.item
  const v = d.versions.find((x) => x.id === d.defaults.versionId) ?? d.versions[0]
  const audio = v?.audio.find((a) => a.id === d.defaults.audioId) ?? null
  const subtitle = v?.subtitles.find((t) => t.id === d.defaults.subtitleId) ?? null
  const resuming = m.progress !== null
  const preview = previewOf(d)
  const people = peopleOf(d)
  const refocus = () => setFocusKey((k) => k + 1)
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
            src={m.art.backdrop}
            alt=""
            className="absolute inset-x-0 top-0 h-[56.25cqw] w-full object-cover"
          />
          <div className={cn('absolute inset-x-0 top-0 h-[56.25cqw]', scrim)} />
          <TvHead down="actions" className="px-(--tv-safe-x)" />
          {/* the first screen less the next row's title, which peeks under it; it stays put while
          focus is in it (its keep is past its foot) */}
          <section
            aria-labelledby="title"
            data-keep="1"
            className="relative flex h-[40.5cqw] max-w-[50cqw] flex-col justify-end gap-[1.1cqw] px-(--tv-safe-x)"
          >
            <h1
              id="title"
              className="font-semibold text-(length:--tv-text-hero-title) leading-[0.95] tracking-display"
            >
              {m.art.logo ? (
                <img
                  src={m.art.logo}
                  alt={m.title}
                  className="max-h-[8.5cqw] max-w-[30cqw] object-contain object-left drop-shadow-[0_0.2cqw_0.8cqw_rgb(0_0_0/0.5)]"
                />
              ) : (
                m.title
              )}
            </h1>
            <p className="flex flex-wrap items-center gap-x-[0.8cqw] gap-y-[0.4cqw] text-(length:--tv-text-meta) text-text-2">
              <span>
                {m.year} · {runtime(m.runtimeMinutes)}
              </span>
              {d.certification && (
                <span className="rounded-(--tv-radius-pill) border border-text-3 px-[0.4cqw] text-(length:--tv-text-quality)">
                  {d.certification}
                </span>
              )}
              <span>{m.genres.slice(0, 2).join(' · ')}</span>
              {m.rating > 0 && <Rating value={m.rating} size={20} />}
              {m.quality.map((q) => (
                <QualityTag key={q} overlay className="text-(length:--tv-text-quality)">
                  {q}
                </QualityTag>
              ))}
              {m.watched && <span>Watched</span>}
            </p>
            <p className="line-clamp-3 max-w-[42cqw] text-(length:--tv-text-synopsis) leading-[1.45]">
              {m.synopsis}
            </p>
            {(d.cast.length > 0 || d.directors.length > 0) && (
              <div className="grid max-w-[42cqw] gap-[0.2cqw] text-(length:--tv-text-meta) text-text-2">
                {d.cast.length > 0 && (
                  <p className="truncate">
                    <span className="text-text-3">Starring </span>
                    {facts.names(d.cast.slice(0, 3))}
                  </p>
                )}
                {d.directors.length > 0 && (
                  <p className="truncate">
                    <span className="text-text-3">Directed by </span>
                    {facts.names(d.directors)}
                  </p>
                )}
              </div>
            )}
            {v && (
              <p className="text-(length:--tv-text-pill) text-text-3">
                {v.label} · {audio?.label ?? 'Default audio'} · {subtitle?.label ?? 'Subtitles off'}
              </p>
            )}
            {/* the actions keep room under them for the name a round button shows on focus */}
            <div className="grid gap-[0.7cqw] pb-[1.8cqw]">
              {resuming && (
                <div className="flex items-center gap-[0.8cqw] text-(length:--tv-text-pill) text-text-2">
                  <span className="h-[0.3cqw] w-[11cqw] overflow-hidden rounded-full bg-text/20">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${(m.progress ?? 0) * 100}%` }}
                    />
                  </span>
                  {left(m)}
                </div>
              )}
              <div
                data-row=""
                data-group="actions"
                data-go-up="nav"
                className="flex items-center gap-[1cqw]"
              >
                <TvButton
                  primary
                  initial
                  icon="play"
                  href={tvHref(`/play/${m.id}`)}
                  className="min-w-[11cqw] justify-center"
                >
                  {resuming ? 'Resume' : 'Play'}
                </TvButton>
                {resuming && (
                  <RoundAction
                    icon="replay"
                    label="From the start"
                    href={tvHref(`/play/${m.id}/start`)}
                  />
                )}
                {preview && (
                  <RoundAction icon="trailer" label="Trailer" onClick={() => setTrailer(preview)} />
                )}
                <RoundAction
                  icon="subtitles"
                  label="Audio and subtitles"
                  onClick={() => onPanel(true)}
                />
                <WatchedAction detail={d} />
              </div>
            </div>
          </section>
          {d.related.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvFilmRow
                group="related"
                title="More like this"
                goUp="actions"
                items={d.related}
                hrefOf={(r) => tvHref(`/movies/${r.id}`)}
              />
            </div>
          )}
          {d.collections.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow group="collections" title="Collections" goUp="actions">
                {d.collections.map((c) => (
                  <li key={c.id} className="w-[12cqw] shrink-0">
                    <CollectionTile
                      tv
                      href={tvHref(`/collections/${c.id}`)}
                      name={c.name}
                      caption={collectionCaption(c)}
                      poster={c.art.poster}
                      mosaic={c.smart?.mosaic}
                      smart={!!c.smart?.words}
                    />
                  </li>
                ))}
              </TvRow>
            </div>
          )}
          {d.videos.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow group="extras" title="Trailers and extras" goUp="actions">
                {d.videos.map((x) => (
                  <li key={x.id} className="w-[22cqw] shrink-0">
                    <button
                      type="button"
                      data-focusable=""
                      aria-label={`${x.name}, ${x.kind}, ${videoLength(x.lengthSeconds)}`}
                      onClick={() => setTrailer(x)}
                      className="relative isolate block aspect-still w-full overflow-hidden rounded-(--tv-radius-poster) text-start outline-none transition-lift focus-visible:scale-(--tv-scale-poster) focus-visible:shadow-(--tv-focus-shadow)"
                    >
                      <img
                        src={x.still}
                        alt=""
                        className="-z-10 absolute inset-0 size-full object-cover"
                      />
                      <span className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,rgb(from_var(--color-bg)_r_g_b/0.85)_0%,transparent_60%)]" />
                      <span className="absolute inset-x-[1cqw] bottom-[0.9cqw] grid gap-[0.2cqw] text-text">
                        <span className="truncate font-semibold text-(length:--tv-text-button)">
                          {x.name}
                        </span>
                        <span className="flex items-center gap-[0.4cqw] text-(length:--tv-text-pill) text-text-2">
                          <Icon name="play" size={16} className="size-[0.8cqw]" />
                          {x.kind} · {videoLength(x.lengthSeconds)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </TvRow>
            </div>
          )}
          {people.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow group="people" title="Cast and crew" goUp="actions">
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
      {trailer && (
        <TvTrailer
          video={trailer}
          onClose={() => {
            setTrailer(null)
            refocus()
          }}
        />
      )}
      {v && (
        <TvTracksPanel
          open={panel}
          versions={d.versions}
          version={v}
          audio={audio}
          subtitle={subtitle}
          onVersion={(versionId) => save.run({ versionId })}
          onAudio={(audioId) => save.run({ audioId })}
          onSubtitle={(subtitleId) => {
            save.run({ subtitleId })
            onPanel(false)
          }}
        />
      )}
    </>
  )
}

/**
 * A secondary action as an icon button beside Play, the same size and shape (controls.md › Rules:
 * controls in one row share one size), its name under it while it has focus (and always to a
 * screen reader). A link when it goes somewhere, a button otherwise.
 */
export function RoundAction({
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
  return (
    <div className="group/action relative grid justify-items-center">
      {href ? (
        <Button
          asChild
          variant="overlay"
          icon={icon}
          iconOnly
          data-focusable=""
          className={tvFocus}
        >
          <a href={href}>
            <span className="sr-only">{label}</span>
          </a>
        </Button>
      ) : (
        <Button
          variant="overlay"
          icon={icon}
          iconOnly
          aria-label={label}
          aria-pressed={pressed}
          data-focusable=""
          onClick={onClick}
          className={tvFocus}
        />
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute top-full mt-[0.7cqw] whitespace-nowrap font-semibold text-(length:--tv-text-pill) opacity-0 transition-opacity group-has-focus-visible/action:opacity-100"
      >
        {label}
      </span>
    </div>
  )
}

/** Mark as watched, or unwatched once it is: a toggle in place of the long press of OK. */
function WatchedAction({ detail }: { detail: ClientDetail }) {
  const mark = useMarkWatched(detail.item)
  return (
    <RoundAction
      icon="check"
      label={mark.label}
      pressed={detail.item.watched}
      onClick={() => void mark.run()}
    />
  )
}

/** About, Information, and Languages and quality: three cards, each a focus stop. */
function About({ detail: d }: { detail: ClientDetail }) {
  const m = d.item
  const info = facts.informationOf(d)
  const languages = facts.languagesOf(d)
  const card =
    'grid content-start gap-[0.9cqw] rounded-(--tv-radius-poster) bg-s1/80 p-[1.6cqw] outline-none transition-lift focus-visible:scale-[1.015] focus-visible:bg-s2 focus-visible:shadow-(--tv-focus-shadow)'
  const heading = 'font-semibold text-(length:--tv-text-row-title)'
  return (
    <section
      data-group="about"
      data-go-up="actions"
      aria-label="About"
      className="grid grid-cols-[1.2fr_1fr_1fr] items-stretch gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw]"
    >
      <article tabIndex={-1} data-focusable="" aria-label="About" className={card}>
        <h2 className={heading}>About</h2>
        {m.tagline && (
          <p className="font-semibold text-(length:--tv-text-synopsis) leading-[1.45]">
            {m.tagline}
          </p>
        )}
        <p className="line-clamp-[8] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
          {m.synopsis}
        </p>
      </article>
      <Facts title="Information" rows={info} className={card} heading={heading} />
      <Facts title="Languages and quality" rows={languages} className={card} heading={heading} />
    </section>
  )
}

export function Facts({
  title,
  rows,
  className,
  heading,
}: {
  title: string
  rows: Fact[]
  className: string
  heading: string
}) {
  return (
    <article tabIndex={-1} data-focusable="" aria-label={title} className={className}>
      <h2 className={heading}>{title}</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[1.2cqw] gap-y-[0.5cqw] text-(length:--tv-text-meta) leading-[1.35]">
        {rows.map(([k, v, to]) => (
          <div key={k} className="contents">
            <dt className="text-text-3">{k}</dt>
            <dd className="min-w-0 text-text-2">
              {/* a stop of its own inside the card, as the album page's film line is */}
              {to ? (
                <a
                  href={tvHref(to)}
                  data-focusable=""
                  className={cn(quiet, 'inline-block text-text')}
                >
                  {v}
                </a>
              ) : (
                v
              )}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

/**
 * A trailer over the page. The product plays it from youtube-nocookie.com only once it's chosen,
 * as the admin does; the prototype stays offline, so the still and a note stand in. Back closes it.
 */
export function TvTrailer({ video: x, onClose }: { video: Video; onClose: () => void }) {
  useBack(onClose)
  useInitialFocus(true, x.id, '[data-trailer] [data-initial]')
  return (
    <div
      data-isolate=""
      data-trailer=""
      role="dialog"
      aria-label={x.name}
      className="absolute inset-0 isolate grid place-items-center bg-bg"
    >
      <img
        src={x.still}
        alt=""
        className="-z-10 absolute inset-0 size-full object-cover opacity-40"
      />
      <div className="grid max-w-[40cqw] justify-items-center gap-[1.2cqw] text-center">
        <p className="font-semibold text-(length:--tv-text-row-title)">
          {x.name} · {videoLength(x.lengthSeconds)}
        </p>
        <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
          In highsea this plays from youtube-nocookie.com, and only once you choose it. The
          prototype doesn’t load YouTube.
        </p>
        <TvButton primary initial icon="close" onClick={onClose}>
          Close
        </TvButton>
      </div>
    </div>
  )
}

/** The page as it will be: the art's place and fades, the hero's lines and buttons, a row. */
function DetailSkeleton() {
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
            <Skeleton className="size-[2.9cqw] rounded-full" />
          </div>
        </div>
        <TvFilmRowSkeleton />
      </div>
    </main>
  )
}
