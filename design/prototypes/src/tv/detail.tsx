// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, TV (docs/product/client-detail.md#tv): the ambient backdrop (the artwork,
// blurred 2.6u and dimmed: elevation.md#blur), the title and its actions, then the cast and More
// like this as rows. Audio and subtitles opens the shared panel; Back closes it, then leaves.
import { Icon, Poster, QualityTag, Rating } from '@highsea/ui-web'
import { useState } from 'react'
import { useParams } from 'wouter'
import { left, runtime, useItem } from '../client/data.ts'
import { useAction } from '../mock/hooks.tsx'
import type { PlaybackPrefs } from '../mock/types.ts'
import { ServerIdentity, TvButton, TvMessage, tvHref, useInitialFocus } from './kit.tsx'
import { TvTracksPanel } from './tracks.tsx'

export function TvDetail({ panel, onPanel }: { panel: boolean; onPanel: (open: boolean) => void }) {
  const { id } = useParams<{ id: string }>()
  const detail = useItem(id)
  const save = useAction((c, patch: PlaybackPrefs) => c.playback.setPrefs(id, patch))
  const [focusKey, setFocusKey] = useState(0)
  useInitialFocus(detail.status === 'success' && !panel, `${id}:${focusKey}`)

  if (detail.status === 'loading')
    return (
      <main aria-busy className="grid h-full place-items-center">
        <Icon name="loading" size={48} className="size-[3cqw] animate-spin text-text-3" />
      </main>
    )
  if (detail.status === 'error')
    return (
      <TvMessage
        title={detail.error.message}
        actions={
          <TvButton primary initial href={tvHref('/')}>
            Go home
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )

  const d = detail.data
  const m = d.item
  const v = d.versions.find((x) => x.id === d.defaults.versionId) ?? d.versions[0]
  const resuming = m.progress !== null
  const close = () => {
    onPanel(false)
    setFocusKey((k) => k + 1)
  }
  return (
    <>
      <img
        src={m.art.backdrop}
        alt=""
        className="absolute inset-0 size-full scale-110 object-cover blur-[2.6cqw] brightness-[0.45]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_10%,transparent_70%)]" />
      <ServerIdentity />
      <div {...(panel ? { 'data-isolate': '' } : {})} className="absolute inset-0 overflow-hidden">
        <div
          data-scroll="y"
          data-keep="0.4"
          className="grid gap-[2.4cqw] pt-[8cqw] transition-lift"
        >
          <section
            aria-labelledby="title"
            className="grid max-w-[60cqw] grid-cols-[13cqw_1fr] gap-[2.4cqw] px-(--tv-safe-x)"
          >
            <img
              src={m.art.poster}
              alt=""
              className="aspect-poster w-full rounded-(--tv-radius-poster) object-cover shadow-4"
            />
            <div className="grid content-start gap-[1cqw]">
              <h1
                id="title"
                className="font-semibold text-[3.6cqw] leading-[0.95] tracking-display"
              >
                {m.title}
              </h1>
              <p className="flex items-center gap-[1cqw] text-(length:--tv-text-meta) text-text-2">
                {m.year} · {runtime(m.runtimeMinutes)} · {m.genres[0]}
                {m.rating > 0 && <Rating value={m.rating} size={20} />}
                {m.quality.map((q) => (
                  <QualityTag key={q} overlay className="text-(length:--tv-text-quality)">
                    {q}
                  </QualityTag>
                ))}
              </p>
              <p className="line-clamp-4 max-w-[44cqw] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
                {m.synopsis}
              </p>
              {d.directors.length > 0 && (
                <p className="text-(length:--tv-text-meta) text-text-3">
                  Directed by {d.directors.map((x) => x.name).join(' and ')}
                </p>
              )}
              <div data-group="actions" className="mt-[0.6cqw] flex gap-[1cqw]">
                <TvButton primary initial icon="play" href={tvHref(`/play/${m.id}`)}>
                  {resuming ? `Resume · ${left(m)}` : 'Play'}
                </TvButton>
                {resuming && (
                  <TvButton icon="replay" href={tvHref(`/play/${m.id}/start`)}>
                    From the start
                  </TvButton>
                )}
                <TvButton icon="subtitles" onClick={() => onPanel(true)}>
                  Audio and subtitles
                </TvButton>
              </div>
              {v && (
                <p className="text-(length:--tv-text-pill) text-text-3">
                  {v.label} ·{' '}
                  {v.audio.find((a) => a.id === d.defaults.audioId)?.label ?? 'Default audio'} ·{' '}
                  {v.subtitles.find((t) => t.id === d.defaults.subtitleId)?.label ??
                    'Subtitles off'}
                </p>
              )}
            </div>
          </section>
          {d.cast.length > 0 && (
            <section
              data-group="cast"
              data-go-up="actions"
              aria-label="Cast"
              className="grid gap-[0.8cqw]"
            >
              <h2 className="pl-(--tv-safe-x) font-semibold text-(length:--tv-text-row-title)">
                Cast
              </h2>
              <div className="overflow-visible">
                <ul
                  data-scroll="x"
                  data-keep="0.3"
                  className="flex gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw] transition-lift"
                >
                  {d.cast.map((c) => (
                    <li key={c.personId} className="w-[8cqw] shrink-0">
                      {/* cast cards are focus stops, so the row can be read by D-pad */}
                      <div
                        data-focusable=""
                        tabIndex={-1}
                        className="rounded-(--tv-radius-poster) outline-none transition-lift focus-visible:scale-(--scale-poster) focus-visible:shadow-(--tv-focus-shadow)"
                      >
                        <Poster title={c.name} src={c.photo} />
                      </div>
                      <p className="mt-[0.5cqw] truncate text-(length:--tv-text-pill)">{c.name}</p>
                      <p className="truncate text-(length:--tv-text-pill) text-text-3">
                        {c.character}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          {d.related.length > 0 && (
            <section
              data-group="related"
              data-go-up="actions"
              aria-label="More like this"
              className="grid gap-[0.8cqw] pb-[4cqw]"
            >
              <h2 className="pl-(--tv-safe-x) font-semibold text-(length:--tv-text-row-title)">
                More like this
              </h2>
              <div className="overflow-visible">
                <ul
                  data-scroll="x"
                  data-keep="0.3"
                  className="flex gap-(--tv-poster-gap) px-(--tv-safe-x) py-[1cqw] transition-lift"
                >
                  {d.related.map((r) => (
                    <li key={r.id} className="w-(--tv-poster-width) shrink-0">
                      <Poster
                        title={r.title}
                        src={r.art.poster}
                        href={tvHref(`/movies/${r.id}`)}
                        focusable
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      </div>
      {panel && v && (
        <TvTracksPanel
          versions={d.versions}
          version={v}
          audio={v.audio.find((a) => a.id === d.defaults.audioId) ?? null}
          subtitle={v.subtitles.find((t) => t.id === d.defaults.subtitleId) ?? null}
          onVersion={(versionId) => save.run({ versionId })}
          onAudio={(audioId) => save.run({ audioId })}
          onSubtitle={(subtitleId) => {
            save.run({ subtitleId })
            close()
          }}
        />
      )}
    </>
  )
}
