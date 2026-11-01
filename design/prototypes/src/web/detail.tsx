// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, web/desktop (docs/product/client-detail.md), laid out as the TV's from the
// streaming apps' common choices (the owner, 2026-10-30): the film's art full bleed with the
// words low on the left (the logo, a meta line, three lines of synopsis, the leading cast and the
// director, and the picks it plays with), Play or Resume as the one strong action with the
// progress bar above it, and the rest as round icon buttons: From the start, Trailer, Audio and
// subtitles (Watch with, in a popover), Mark as watched; Download in the desktop app. Then More
// like this, the Collections it's in, Trailers and extras, Cast and crew, and About, Information,
// and Languages and quality as cards. The same media id as everywhere else (ADR 0014).
import {
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Field,
  Icon,
  type IconName,
  Popover,
  PopoverContent,
  PopoverTrigger,
  QualityTag,
  Rating,
  Select,
  Skeleton,
  SkeletonText,
  Tooltip,
} from '@highsea-tv/ui-web'
import { type ReactElement, useState } from 'react'
import { useParams } from 'wouter'
import { collectionCaption, left, runtime, useDesktopApp, useItem } from '../client/data.ts'
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
import { MediaPosterSkeleton } from '../client/media-card.tsx'
import { TrailerDialog } from '../client/trailer.tsx'
import { CollectionTile } from '../kit/collection-art.tsx'
import { useAction } from '../mock/hooks.tsx'
import type { ClientDetail, PlaybackPrefs, Video } from '../mock/types.ts'
import { PosterRow } from './home.tsx'
import { gutter, webHref } from './shell.tsx'

const OFF = 'off'

/** Version, audio and subtitles: saved as they change, for this title and this person. */
export function WatchWith({
  detail,
  compact = false,
}: {
  detail: ClientDetail
  compact?: boolean
}) {
  const save = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(detail.item.id, patch))
  const d = detail.defaults
  const version = detail.versions.find((v) => v.id === d.versionId) ?? detail.versions[0]
  if (!version) return null
  return (
    <div className={cn('grid gap-3', compact ? 'grid-cols-1' : 'medium:grid-cols-3')}>
      <Field label="Version">
        {detail.versions.length > 1 ? (
          <Select
            value={version.id}
            onValueChange={(versionId) => save.run({ versionId })}
            options={detail.versions.map((v) => ({
              value: v.id,
              label: `${v.label} · ${v.detail.split(' · ').slice(-1)[0]}`,
            }))}
          />
        ) : (
          <p className="flex h-(--size-control) items-center text-text-2 text-body">
            {version.detail}
          </p>
        )}
      </Field>
      <Field label="Audio">
        <Select
          value={d.audioId ?? version.audio[0]?.id ?? ''}
          onValueChange={(audioId) => save.run({ audioId })}
          options={version.audio.map((a) => ({ value: a.id, label: a.label }))}
          disabled={version.audio.length < 2}
        />
      </Field>
      <Field label="Subtitles">
        <Select
          value={d.subtitleId ?? OFF}
          onValueChange={(v) => save.run({ subtitleId: v === OFF ? null : v })}
          options={[
            { value: OFF, label: 'Off' },
            ...version.subtitles.map((t) => ({ value: t.id, label: t.label })),
          ]}
        />
      </Field>
    </div>
  )
}

/** The hero's height: the first screen, less the next row's title peeking under it. */
export const heroHeight =
  'relative isolate flex min-h-[32rem] items-end overflow-hidden medium:-mt-20 medium:h-[min(82svh,56.25vw)]'

/** The fades over the art: the words' side and the foot, so the right half stays the picture's. */
export const scrim =
  '-z-10 absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_0%,color-mix(in_srgb,var(--color-bg)_80%,transparent)_25%,transparent_62%),linear-gradient(0deg,var(--color-bg)_2%,transparent_42%)]'

export function WebDetail() {
  const { id } = useParams<{ id: string }>()
  const detail = useItem(id, 'web')
  const desktop = useDesktopApp()
  const [trailer, setTrailer] = useState<Video | null>(null)

  if (detail.status === 'loading') return <DetailSkeleton />
  if (detail.status === 'error')
    return (
      <main
        className={cn('mx-auto w-full grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}
      >
        <EmptyState
          icon="movie"
          tone="error"
          title={detail.error.message}
          action={
            <Button asChild>
              <a href={webHref('/')}>Go home</a>
            </Button>
          }
        >
          It may have been removed. Library lists everything you can watch.
        </EmptyState>
      </main>
    )

  const d = detail.data
  const m = d.item
  const v = d.versions.find((x) => x.id === d.defaults.versionId) ?? d.versions[0]
  const resuming = m.progress !== null
  const preview = previewOf(d)
  const people = peopleOf(d)
  return (
    <main className="pb-16">
      <section aria-labelledby="title" className={heroHeight}>
        <img
          src={m.art.backdrop}
          alt=""
          className="-z-10 absolute inset-0 size-full object-cover"
        />
        <div className={scrim} />
        <div className={cn('mx-auto grid w-full max-w-[1680px] gap-4 pt-28 pb-10', gutter)}>
          <div className="grid max-w-[40rem] gap-3">
            <h1 id="title" className="text-balance text-display">
              {m.art.logo ? (
                <img
                  src={m.art.logo}
                  alt={m.title}
                  className="max-h-32 max-w-[min(26rem,80%)] object-contain object-left drop-shadow-[0_2px_10px_rgb(0_0_0/0.5)]"
                />
              ) : (
                m.title
              )}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-text-2">
              <span>
                {m.year} · {runtime(m.runtimeMinutes)}
              </span>
              {d.certification && (
                <span className="rounded-sm border border-text-3 px-1 text-caption">
                  {d.certification}
                </span>
              )}
              <span>{m.genres.slice(0, 2).join(' · ')}</span>
              {m.rating > 0 && <Rating value={m.rating} size={12} />}
              {m.quality.map((q) => (
                <QualityTag key={q} overlay>
                  {q}
                </QualityTag>
              ))}
              {m.watched && <span>Watched</span>}
            </p>
            <p className="line-clamp-3 max-w-[60ch] text-body text-text">{m.synopsis}</p>
            {(d.cast.length > 0 || d.directors.length > 0) && (
              <div className="grid gap-0.5 text-caption text-text-2">
                {d.cast.length > 0 && (
                  <p className="truncate">
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
              <p className="text-caption text-text-3">
                {v.label} ·{' '}
                {v.audio.find((a) => a.id === d.defaults.audioId)?.label ?? 'Default audio'} ·{' '}
                {v.subtitles.find((t) => t.id === d.defaults.subtitleId)?.label ?? 'Subtitles off'}
              </p>
            )}
          </div>
          <div className="grid gap-2.5">
            {resuming && (
              <div className="flex items-center gap-3 text-caption text-text-2">
                <div
                  role="progressbar"
                  aria-label="Watched"
                  aria-valuenow={Math.round((m.progress ?? 0) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-1 w-40 overflow-hidden rounded-full bg-text/20"
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(m.progress ?? 0) * 100}%` }}
                  />
                </div>
                {left(m)}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon="play" asChild className="min-w-32 justify-center">
                <a href={webHref(`/play/${m.id}`)}>{resuming ? 'Resume' : 'Play'}</a>
              </Button>
              {resuming && (
                <Round label="Play from the start">
                  <Button iconOnly icon="replay" asChild className="rounded-full">
                    <a href={webHref(`/play/${m.id}/start`)}>
                      <span className="sr-only">Play from the start</span>
                    </a>
                  </Button>
                </Round>
              )}
              {preview && (
                <Round label="Trailer">
                  <RoundButton icon="trailer" label="Trailer" onClick={() => setTrailer(preview)} />
                </Round>
              )}
              <TracksPopover detail={d} />
              <WatchedButton detail={d} />
              {desktop && <DownloadButton item={m} app="desktop" className="ms-2" />}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-10 pt-2">
        {d.related.length > 0 && <PosterRow title="More like this" items={d.related} wide />}
        {d.collections.length > 0 && (
          <CarouselRow title="Collections">
            {d.collections.map((c) => (
              <CollectionTile
                key={c.id}
                href={webHref(`/collections/${c.id}`)}
                name={c.name}
                caption={collectionCaption(c)}
                poster={c.art.poster}
                mosaic={c.smart?.mosaic}
                smart={!!c.smart?.words}
                titleSize="body"
              />
            ))}
          </CarouselRow>
        )}
        {d.videos.length > 0 && (
          <CarouselRow title="Trailers and extras" itemClassName="w-[clamp(15rem,24vw,21rem)]">
            {d.videos.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-label={`${x.name}, ${x.kind}, ${videoLength(x.lengthSeconds)}`}
                onClick={() => setTrailer(x)}
                className="group/still relative isolate block aspect-still w-full overflow-hidden rounded-lg text-start outline-none focus-visible:ring-focus"
              >
                <img
                  src={x.still}
                  alt=""
                  className="-z-10 absolute inset-0 size-full object-cover transition-transform duration-300 group-hover/still:scale-105"
                />
                <span className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,color-mix(in_srgb,var(--color-bg)_85%,transparent)_0%,transparent_60%)]" />
                <span className="absolute inset-x-3 bottom-2.5 grid gap-0.5">
                  <span className="truncate font-semibold text-body text-text">{x.name}</span>
                  <span className="flex items-center gap-1.5 text-caption text-text-2">
                    <Icon name="play" size={12} />
                    {x.kind} · {videoLength(x.lengthSeconds)}
                  </span>
                </span>
              </button>
            ))}
          </CarouselRow>
        )}
        {people.length > 0 && (
          <CarouselRow title="Cast and crew" itemClassName="w-[clamp(6.5rem,9vw,8rem)]">
            {people.map((c) => (
              <a
                key={`${c.personId}:${c.job ?? 'cast'}`}
                href={webHref(`/people/${c.personId}`)}
                aria-label={`${c.name}, ${role(c)}`}
                className="group/person grid rounded-lg text-center outline-none focus-visible:ring-focus"
              >
                <img
                  src={c.photo}
                  alt=""
                  className="aspect-square w-full rounded-full bg-s1 object-cover transition-transform duration-300 group-hover/person:scale-105"
                />
                <p className="mt-2 truncate font-semibold text-caption text-text">{c.name}</p>
                <p className="truncate text-caption text-text-3">{role(c)}</p>
              </a>
            ))}
          </CarouselRow>
        )}
        <About detail={d} />
      </div>
      <TrailerDialog video={trailer} onOpenChange={(o) => !o && setTrailer(null)} />
    </main>
  )
}

/** A round icon button's name, on hover and focus. */
export function Round({ label, children }: { label: string; children: ReactElement }) {
  return <Tooltip content={label}>{children}</Tooltip>
}

export function RoundButton({
  icon,
  label,
  pressed,
  onClick,
}: {
  icon: IconName
  label: string
  pressed?: boolean
  onClick?: () => void
}) {
  return (
    <Button
      iconOnly
      icon={icon}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="rounded-full"
    />
  )
}

/** Audio and subtitles: Watch with in a popover, saved as it changes. */
function TracksPopover({ detail }: { detail: ClientDetail }) {
  return (
    <Popover>
      <Round label="Audio and subtitles">
        <PopoverTrigger asChild>
          <Button
            iconOnly
            icon="subtitles"
            aria-label="Audio and subtitles"
            className="rounded-full"
          />
        </PopoverTrigger>
      </Round>
      <PopoverContent className="grid w-80 gap-3 p-4">
        <WatchWith detail={detail} compact />
        <p className="text-caption text-text-3">Remembered for this movie, on all your devices.</p>
      </PopoverContent>
    </Popover>
  )
}

/** Mark as watched, or unwatched once it is: a toggle, in place of the More menu. */
function WatchedButton({ detail }: { detail: ClientDetail }) {
  const mark = useMarkWatched(detail.item)
  return (
    <Round label={mark.label}>
      <RoundButton
        icon="check"
        label={mark.label}
        pressed={detail.item.watched}
        onClick={() => void mark.run()}
      />
    </Round>
  )
}

/** About, Information, and Languages and quality, as cards: side by side from medium. */
function About({ detail: d }: { detail: ClientDetail }) {
  const m = d.item
  return (
    <section
      aria-label="About"
      className={cn(
        'grid items-stretch gap-4 medium:grid-cols-[repeat(2,minmax(0,1fr))] wide:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]',
        gutter,
      )}
    >
      <article className="grid content-start gap-3 rounded-lg bg-s1 p-5 medium:col-span-2 wide:col-span-1">
        <h2 className="text-title">About</h2>
        {m.tagline && <p className="font-semibold text-body">{m.tagline}</p>}
        <p className="text-body text-text-2">{m.synopsis}</p>
      </article>
      <Facts title="Information" rows={informationOf(d)} />
      <Facts title="Languages and quality" rows={languagesOf(d)} />
    </section>
  )
}

export function Facts({ title, rows }: { title: string; rows: Fact[] }) {
  return (
    <article className="grid content-start gap-3 rounded-lg bg-s1 p-5">
      <h2 className="text-title">{title}</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-body">
        {rows.map(([k, v, to]) => (
          <div key={k} className="contents">
            <dt className="text-text-3">{k}</dt>
            <dd className="text-text-2 [overflow-wrap:anywhere]">
              {to ? (
                <a
                  href={webHref(to)}
                  className="rounded-[4px] text-text underline decoration-text-3 underline-offset-4 outline-none hover:decoration-text focus-visible:ring-focus"
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

/** The page as it will be: the art's place and fades, the hero's lines and buttons, a row. */
function DetailSkeleton() {
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
            <Skeleton className="my-0.5 h-3 w-52" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-(--size-control) w-32 rounded-md" />
            <Skeleton className="size-(--size-control) rounded-full" />
            <Skeleton className="size-(--size-control) rounded-full" />
            <Skeleton className="size-(--size-control) rounded-full" />
          </div>
        </div>
      </div>
      <div className={cn('mx-auto grid w-full max-w-[1680px] gap-3 pt-2', gutter)}>
        <Skeleton className="my-0.5 h-6 w-40" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <MediaPosterSkeleton key={i} wide className="w-[clamp(15rem,24vw,21rem)] shrink-0" />
          ))}
        </div>
      </div>
    </main>
  )
}
