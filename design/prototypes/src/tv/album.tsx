// SPDX-License-Identifier: AGPL-3.0-only
// An album on the TV, as the Apple TV's Music app and Plex's TV app lay one out: the cover blurred
// and dimmed behind everything, the cover and what's known about the album in a column at the
// left (the kind, the title, the artist, the genre, year and length, and the note), with Play and
// Shuffle under it and buttons to the artist and the film it scores; the songs fill the right,
// scrolling under focus while the column stays. Focus starts on Play; Right reaches the songs and
// Left comes back.
import { Skeleton, useSound } from '@highsea-tv/ui-web'
import { type RefObject, useEffect, useRef } from 'react'
import { useParams } from 'wouter'
import { useAlbum } from '../client/data.ts'
import { albumKind, albumSummary, songTime } from '../client/music.ts'
import { focusFrom, TvButton, TvHead, TvMessage, tvHref, useInitialFocus } from './kit.tsx'

const song =
  'grid w-full grid-cols-[2.6cqw_minmax(0,1fr)_auto] items-center gap-[1cqw] rounded-[0.5cqw] px-[1cqw] py-[0.8cqw] text-start text-(length:--tv-text-button) text-text-2 outline-none transition-lift focus-visible:scale-[1.02] focus-visible:bg-text focus-visible:text-bg'

export function TvAlbum() {
  const { id } = useParams<{ id: string }>()
  const found = useAlbum(id)
  const actions = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  useInitialFocus(found.status === 'success', id)
  useSongsEntry(actions, list, found.status === 'success' && id)
  if (found.status === 'loading')
    return (
      <main aria-busy className="absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)]">
        <TvHead className="px-(--tv-safe-x)" />
        <div className="grid grid-cols-[24cqw_minmax(0,1fr)] gap-[4cqw] px-(--tv-safe-x) pt-[1cqw]">
          <div className="grid content-start gap-[1cqw]">
            <Skeleton className="aspect-square w-[18cqw] rounded-(--tv-radius-poster)" />
            <Skeleton className="h-[2.4cqw] w-[20cqw]" />
            <Skeleton className="h-[1.2cqw] w-[12cqw]" />
          </div>
          <div className="grid content-start gap-[1.2cqw] pt-[1cqw]">
            {Array.from({ length: 8 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
              <Skeleton key={i} className="h-[1.3cqw] w-full" />
            ))}
          </div>
        </div>
      </main>
    )
  if (found.status === 'error')
    return (
      <TvMessage
        title={found.error.message}
        actions={
          <TvButton primary initial href={tvHref('/music')}>
            Music
          </TvButton>
        }
      >
        It may have been removed.
      </TvMessage>
    )
  const { album: a, songs, duration, about, film } = found.data
  return (
    <>
      <img
        src={a.cover}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-[2.6cqw] brightness-[0.4]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_5%,transparent_80%)]" />
      <main className="absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)]">
        <TvHead down="actions" exact className="px-(--tv-safe-x)" />
        <div className="grid min-h-0 grid-cols-[24cqw_minmax(0,1fr)] gap-[4cqw] ps-(--tv-safe-x) pt-[2cqw]">
          <section
            aria-labelledby="title"
            className="grid content-start justify-items-start gap-[0.9cqw]"
          >
            <img
              src={a.cover}
              alt=""
              className="mb-[0.6cqw] aspect-square w-[18cqw] rounded-(--tv-radius-poster) bg-s1 object-cover shadow-[0_1cqw_3cqw_rgb(0_0_0/0.4)]"
            />
            <p className="font-mono text-(length:--tv-text-pill) text-text-3 uppercase">
              {albumKind[a.kind]}
            </p>
            <h1 id="title" className="font-semibold text-[2.4cqw] leading-[1.05] tracking-display">
              {a.title}
            </h1>
            <p className="text-(length:--tv-text-meta) text-text">{a.artist.name}</p>
            <p className="text-(length:--tv-text-pill) text-text-2">
              {[a.genres[0], a.year, albumSummary(songs.length, duration)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {about && (
              <p className="line-clamp-3 text-(length:--tv-text-pill) text-text-2 leading-[1.45]">
                {about}
              </p>
            )}
            <div
              ref={actions}
              data-group="actions"
              data-go-up="nav"
              data-go-right="songs"
              className="flex flex-wrap gap-[0.8cqw] pt-[0.6cqw]"
            >
              <TvButton primary initial icon="play">
                Play
              </TvButton>
              <TvButton icon="shuffle">Shuffle</TvButton>
              <TvButton icon="user" href={tvHref(`/music/artists/${a.artist.id}`)}>
                Artist
              </TvButton>
              {film && (
                <TvButton icon="movie" href={tvHref(`/movies/${film.id}`)}>
                  Film
                </TvButton>
              )}
            </div>
          </section>
          {/* the songs' own frame, so they scroll under focus and the column at the left stays; they fade out at its top rather than meeting the head with a cut */}
          <div className="relative min-h-0 overflow-hidden pe-(--tv-safe-x) [mask-image:linear-gradient(transparent,black_2cqw)]">
            <ol
              ref={list}
              aria-label="Songs"
              data-group="songs"
              data-go-left="actions"
              data-go-up="nav"
              data-scroll="y"
              data-keep="0.4"
              className="grid gap-[0.2cqw] py-[1cqw] pb-(--tv-safe-y) transition-lift"
            >
              {songs.map((s) => (
                <li key={s.id}>
                  {/* nothing plays yet: the music player comes with its own prototype */}
                  <button
                    type="button"
                    data-focusable=""
                    aria-label={`Play ${s.title}, ${songTime(s.duration)}`}
                    className={song}
                  >
                    <span className="tabular-nums opacity-70">{s.number}</span>
                    <span className="truncate">{s.title}</span>
                    <span className="text-(length:--tv-text-pill) tabular-nums opacity-70">
                      {songTime(s.duration)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
    </>
  )
}

/**
 * Right from the actions' last stop on a line enters the songs at the one left, or the first:
 * the navigator's nearest would land level with the button, mid-list or on the last song.
 */
function useSongsEntry(
  actions: RefObject<HTMLElement | null>,
  list: RefObject<HTMLElement | null>,
  ready: unknown,
) {
  const play = useSound()
  useEffect(() => {
    const from = actions.current
    const to = list.current
    if (!from || !to || !ready) return
    let left: HTMLElement | null = null
    const onFocus = (e: FocusEvent) => {
      left = (e.target as HTMLElement).closest<HTMLElement>('[data-focusable]')
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' || e.defaultPrevented) return
      const at = (e.target as HTMLElement).getBoundingClientRect()
      // another action to the right on the same line takes it, as the navigator would
      const beside = [...from.querySelectorAll<HTMLElement>('[data-focusable]')].some((b) => {
        const r = b.getBoundingClientRect()
        return r.left > at.left && r.top < at.bottom && r.bottom > at.top
      })
      if (beside) return
      const song = left?.isConnected ? left : to.querySelector<HTMLElement>('[data-focusable]')
      if (!song) return
      e.preventDefault()
      focusFrom(e.target as Element, song, play)
    }
    to.addEventListener('focusin', onFocus)
    from.addEventListener('keydown', onKey)
    return () => {
      to.removeEventListener('focusin', onFocus)
      from.removeEventListener('keydown', onKey)
    }
  }, [actions, list, ready, play])
}
