// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, web/desktop (docs/product/client-detail.md). The title over its backdrop, Play or
// Resume, and what it plays with: the version, audio and subtitles, remembered per title. Then
// the cast and More like this. The same media id as everywhere else (ADR 0014).
import {
  Button,
  cn,
  EmptyState,
  Field,
  Poster,
  QualityTag,
  Rating,
  Select,
  Skeleton,
  SkeletonText,
} from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { left, runtime, useItem } from '../client/data.ts'
import { useAction } from '../mock/hooks.tsx'
import type { ClientDetail, PlaybackPrefs } from '../mock/types.ts'
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
          <p className="flex h-(--size-control) items-center text-text-2 text-ui">
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

export function WebDetail() {
  const { id } = useParams<{ id: string }>()
  const detail = useItem(id)

  if (detail.status === 'loading')
    return (
      <div aria-busy className={cn('mx-auto grid max-w-[1680px] gap-6 pt-24', gutter)}>
        <Skeleton className="h-10 w-80" />
        <SkeletonText lines={3} />
        <Skeleton className="h-10 w-56" />
      </div>
    )
  if (detail.status === 'error')
    return (
      <main className={cn('mx-auto grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}>
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

  const { item: m, cast, directors, related } = detail.data
  const resuming = m.progress !== null
  return (
    <main className="pb-16">
      <section
        aria-labelledby="title"
        className="relative isolate flex min-h-[30rem] items-end overflow-hidden medium:-mt-16 medium:h-[min(68svh,56.25vw)]"
      >
        <img
          src={m.art.backdrop}
          alt=""
          className="-z-10 absolute inset-0 size-full object-cover"
        />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_6%,color-mix(in_srgb,var(--color-bg)_60%,transparent)_45%,transparent_75%)]" />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_50%)]" />
        <div className={cn('mx-auto grid w-full max-w-[1680px] gap-4 pt-28 pb-8', gutter)}>
          <div className="grid max-w-[40rem] gap-3">
            <h1 id="title" className="text-balance text-display">
              {m.title}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-text-2 text-ui">
              <span>{m.year}</span>
              <span aria-hidden>·</span>
              <span>{runtime(m.runtimeMinutes)}</span>
              <span aria-hidden>·</span>
              <span>{m.genres.join(', ')}</span>
              {m.rating > 0 && <Rating value={m.rating} size={12} />}
              {m.quality.map((q) => (
                <QualityTag key={q} overlay>
                  {q}
                </QualityTag>
              ))}
            </p>
            <p className="max-w-[65ch] text-body text-text-2">{m.synopsis}</p>
            {directors.length > 0 && (
              <p className="text-caption text-text-3">
                Directed by {directors.map((d) => d.name).join(' and ')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon="play" asChild>
              <a href={webHref(`/play/${m.id}`)}>{resuming ? 'Resume' : 'Play'}</a>
            </Button>
            {resuming && (
              <Button icon="replay" asChild>
                <a href={webHref(`/play/${m.id}/start`)}>Play from the start</a>
              </Button>
            )}
            {resuming && <span className="text-caption text-text-2">{left(m)}</span>}
          </div>
          {resuming && (
            <div
              role="progressbar"
              aria-label="Watched"
              aria-valuenow={Math.round((m.progress ?? 0) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1 w-full max-w-[24rem] overflow-hidden rounded-full bg-text/20"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(m.progress ?? 0) * 100}%` }}
              />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-[1680px] gap-10 pt-4">
        <section aria-labelledby="watch-with" className={cn('grid max-w-[56rem] gap-3', gutter)}>
          <h2 id="watch-with" className="text-title">
            Watch with
          </h2>
          <WatchWith detail={detail.data} />
          <p className="text-caption text-text-3">
            Remembered for this movie, on all your devices.
          </p>
        </section>
        {cast.length > 0 && (
          <section aria-labelledby="cast" className={cn('grid gap-3', gutter)}>
            <h2 id="cast" className="text-title">
              Cast
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-4 gap-y-5 expanded:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
              {cast.slice(0, 12).map((c) => (
                <li key={c.personId}>
                  <Poster title={c.name} src={c.photo} showTitle caption={c.character} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {related.length > 0 && <PosterRow title="More like this" items={related} />}
      </div>
    </main>
  )
}
