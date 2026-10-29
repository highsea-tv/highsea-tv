// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail on the web (docs/product/client-detail.md), ported from
// design/prototypes/src/web/detail.tsx: the title over its backdrop, Play or Resume, More with
// Mark as watched (client-detail.md#mark-as-watched), and what it plays with: the version, audio
// and subtitles, remembered per title for this person (the playback picks, checkpoint 4.1). Then
// the cast and More like this.
import type { ClientDetail, ClientItem } from '@highsea-tv/api-contract'
import { useItem, useMarkWatched, usePicks } from '@highsea-tv/client/data'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import {
  Button,
  cn,
  EmptyState,
  Field,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Poster,
  QualityTag,
  Rating,
  Select,
  Skeleton,
  SkeletonText,
  toast,
} from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { PosterRow } from './home.tsx'
import { detail as messages } from './messages.ts'
import { gutter, href, useFormat } from './shell.tsx'

const OFF = 'off'

/** Version, audio and subtitles: saved as they change, for this title and this person. */
export function WatchWith({ detail }: { detail: ClientDetail }) {
  const t = useT(messages)
  const { picks, save } = usePicks(detail.item.id)
  const p = picks.data
  const playable = detail.versions.filter((v) => v.playable)
  const version = playable.find((v) => v.id === p?.versionId) ?? playable[0]
  if (!version) return <p className="text-caption text-text-3">{t('notPlayable')}</p>
  const run = (patch: Parameters<typeof save.run>[0]) =>
    save
      .run(patch)
      .then(() => picks.refetch())
      .catch((e: Error) =>
        toast({ title: t('saveFailed', { message: e.message }), tone: 'danger' }),
      )
  const audio =
    version.audio.find((a) => a.id === p?.audioId) ?? version.audio.find((a) => a.default)
  const subtitle = version.subtitles.find((s) => s.id === p?.subtitleId)
  return (
    <div className="grid gap-3 medium:grid-cols-3">
      <Field label={t('version')}>
        {playable.length > 1 ? (
          <Select
            value={version.id}
            // a new version has its own tracks: the picks for the old one don't carry over
            onValueChange={(versionId) => run({ versionId, audioId: null, subtitleId: null })}
            options={playable.map((v) => ({
              value: v.id,
              label: v.detail ? `${v.label} · ${v.detail.split(' · ').slice(-1)[0]}` : v.label,
            }))}
          />
        ) : (
          <p className="flex h-(--size-control) items-center text-text-2 text-ui">
            {version.detail ?? version.label}
          </p>
        )}
      </Field>
      <Field label={t('audio')}>
        <Select
          value={audio?.id ?? version.audio[0]?.id ?? OFF}
          onValueChange={(audioId) => run({ audioId })}
          options={
            version.audio.length
              ? version.audio.map((a) => ({ value: a.id, label: a.label }))
              : [{ value: OFF, label: t('noAudio') }]
          }
          disabled={version.audio.length < 2}
        />
      </Field>
      <Field label={t('subtitles')}>
        <Select
          value={subtitle?.id ?? OFF}
          onValueChange={(v) => run({ subtitleId: v === OFF ? null : v })}
          options={[
            { value: OFF, label: t('off') },
            ...version.subtitles.map((s) => ({ value: s.id, label: s.label })),
          ]}
        />
      </Field>
    </div>
  )
}

/** More: Mark as watched, or Mark as unwatched once it is. */
function ItemMore({ item, onChange }: { item: ClientItem; onChange: () => void }) {
  const t = useT(messages)
  const mark = useMarkWatched(item.id)
  const toggle = () => {
    const watched = !item.watched
    mark.run(watched).then(
      () => {
        onChange()
        toast({
          title: t(watched ? 'markedWatched' : 'markedUnwatched', { title: item.title }),
          description: watched ? undefined : t('startsAgain'),
        })
      },
      (e: Error) => toast({ title: t('markFailed', { message: e.message }), tone: 'danger' }),
    )
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button iconOnly icon="more" aria-label={t('more')} />
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem icon={item.watched ? 'replay' : 'check'} onSelect={toggle}>
          {item.watched ? t('markUnwatched') : t('markWatched')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export function WebDetail() {
  const t = useT(messages)
  const f = useFormat()
  const locale = useLocale()
  const { id } = useParams<{ id: string }>()
  const detail = useItem(Number(id))

  if (detail.status === 'loading')
    return (
      <div aria-busy className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-24', gutter)}>
        <Skeleton className="h-10 w-80" />
        <SkeletonText lines={3} />
        <Skeleton className="h-10 w-56" />
      </div>
    )
  if (detail.status === 'error') {
    const missing = detail.error instanceof ApiError && detail.error.status === 404
    return (
      <main
        className={cn('mx-auto w-full grid min-h-[60vh] max-w-[1680px] place-items-center', gutter)}
      >
        <EmptyState
          icon="movie"
          tone="error"
          title={missing ? t('missingTitle') : t('failed')}
          action={
            <Button asChild>
              <a href={href('/')}>{t('goHome')}</a>
            </Button>
          }
        >
          {missing ? t('missingBody') : detail.error.message}
        </EmptyState>
      </main>
    )
  }

  const { item: m, cast, directors, related, versions } = detail.data
  const resuming = m.progress !== null
  const labels = [...new Set(versions.filter((v) => v.playable).map((v) => v.label))]
  const names = new Intl.ListFormat(locale, { type: 'conjunction' })
  return (
    <main className="pb-16">
      <section
        aria-labelledby="title"
        className="relative isolate flex min-h-[30rem] items-end overflow-hidden medium:-mt-16 medium:h-[min(68svh,56.25vw)]"
      >
        {m.art.backdrop && (
          <img
            src={m.art.backdrop}
            alt=""
            className="-z-10 absolute inset-0 size-full object-cover"
          />
        )}
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_6%,color-mix(in_srgb,var(--color-bg)_60%,transparent)_45%,transparent_75%)]" />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_50%)]" />
        <div className={cn('mx-auto w-full grid w-full max-w-[1680px] gap-4 pt-28 pb-8', gutter)}>
          <div className="grid max-w-[40rem] gap-3">
            <h1 id="title" className="text-balance text-display">
              {m.title}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-text-2 text-ui">
              {[m.year ? String(m.year) : '', f.runtime(m.runtimeMinutes), m.genres.join(', ')]
                .filter(Boolean)
                .map((part, i) => (
                  <span key={part} className="contents">
                    {i > 0 && <span aria-hidden>·</span>}
                    <span>{part}</span>
                  </span>
                ))}
              {m.rating > 0 && <Rating value={m.rating} size={12} />}
              {labels.map((q) => (
                <QualityTag key={q} overlay>
                  {q}
                </QualityTag>
              ))}
            </p>
            <p className="max-w-[65ch] text-body text-text-2">{m.synopsis}</p>
            {directors.length > 0 && (
              <p className="text-caption text-text-3">
                {t('directedBy', { names: names.format(directors.map((d) => d.name)) })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {m.playable && (
              <Button variant="primary" icon="play" asChild>
                <a href={href(`/play/${m.id}`)}>{resuming ? t('resume') : t('play')}</a>
              </Button>
            )}
            {m.playable && resuming && (
              <Button icon="replay" asChild>
                <a href={href(`/play/${m.id}/start`)}>{t('fromStart')}</a>
              </Button>
            )}
            <ItemMore item={m} onChange={detail.refetch} />
            {resuming && <span className="text-caption text-text-2">{f.left(m)}</span>}
          </div>
          {resuming && (
            <div
              role="progressbar"
              aria-label={t('watched')}
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

      <div className="mx-auto w-full grid max-w-[1680px] gap-10 pt-4">
        <section aria-labelledby="watch-with" className={cn('grid max-w-[56rem] gap-3', gutter)}>
          <h2 id="watch-with" className="text-title">
            {t('watchWith')}
          </h2>
          <WatchWith detail={detail.data} />
          <p className="text-caption text-text-3">{t('remembered')}</p>
        </section>
        {cast.length > 0 && (
          <section aria-labelledby="cast" className={cn('grid gap-3', gutter)}>
            <h2 id="cast" className="text-title">
              {t('cast')}
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-4 gap-y-5 expanded:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">
              {cast.slice(0, 12).map((c) => (
                <li key={c.id}>
                  <Poster
                    title={c.name}
                    src={c.photo ?? undefined}
                    showTitle
                    caption={c.character ?? undefined}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {related.length > 0 && <PosterRow title={t('moreLike')} items={related} />}
      </div>
    </main>
  )
}
