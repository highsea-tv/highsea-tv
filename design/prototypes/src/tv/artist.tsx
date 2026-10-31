// SPDX-License-Identifier: AGPL-3.0-only
// An artist on the TV, laid out as a person's page is: their newest cover blurred and dimmed
// behind everything, the round photo beside the name, the genres and counts, Play, Shuffle and
// (for a composer credited on a film here) Their films, and the note cut at four lines with More.
// Then a row of square covers for each kind of album, newest first, and a row of artists who share
// a genre with them. Focus starts on Play; Up and Down go row by row.
import { Skeleton } from '@highsea-tv/ui-web'
import { useRef } from 'react'
import { useParams } from 'wouter'
import { useArtist } from '../client/data.ts'
import { albumMeta, albumsCount, discographyTitle, songsCount } from '../client/music.ts'
import { LONG_BIO } from '../web/person.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvRow,
  TvRowSkeleton,
  TvTile,
  tvHref,
  useInitialFocus,
  useRowNavigation,
} from './kit.tsx'
import { TvArtistTile } from './music.tsx'
import { Bio } from './person.tsx'

export function TvArtist() {
  const { id } = useParams<{ id: string }>()
  const found = useArtist(id)
  const rows = useRef<HTMLDivElement>(null)
  useInitialFocus(found.status === 'success', id)
  useRowNavigation(rows, found.status === 'success' && id)
  if (found.status === 'loading')
    return (
      <main aria-busy className="absolute inset-0 grid content-start gap-[1.6cqw] overflow-hidden">
        <TvHead className="px-(--tv-safe-x)" />
        <div className="flex items-center gap-[3cqw] px-(--tv-safe-x) pt-[1cqw] pb-[2cqw]">
          <Skeleton className="size-[13cqw] shrink-0 rounded-full" />
          <div className="grid w-[44cqw] gap-[1.1cqw]">
            <Skeleton className="my-[0.2cqw] h-[3.4cqw] w-[28cqw] rounded-[0.5cqw]" />
            <Skeleton className="my-[0.15cqw] h-[1.05cqw] w-[16cqw]" />
            <div className="flex gap-[0.8cqw]">
              <Skeleton className="h-[2.9cqw] w-[9cqw] rounded-(--tv-radius-button)" />
              <Skeleton className="h-[2.9cqw] w-[9cqw] rounded-(--tv-radius-button)" />
            </div>
          </div>
        </div>
        <TvRowSkeleton width="w-[12cqw]" count={6} />
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
        Their albums may have been removed.
      </TvMessage>
    )
  const { artist: a, bio, backdrop, songs, person, sections, similar } = found.data
  const long = (bio?.length ?? 0) >= LONG_BIO
  const groups = [
    ...sections.map((s) => `albums-${s.kind}`),
    ...(similar.length > 0 ? ['similar'] : []),
  ]
  return (
    <>
      <img
        src={backdrop}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-[2.6cqw] brightness-[0.45]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_10%,transparent_70%)]" />
      <main className="absolute inset-0 overflow-hidden">
        <div
          ref={rows}
          data-scroll="y"
          data-keep="0.4"
          className="relative grid grid-cols-1 gap-[1.6cqw] pb-(--tv-safe-y) transition-lift"
        >
          <TvHead down="actions" exact className="px-(--tv-safe-x)" />
          <section
            aria-labelledby="name"
            data-keep="1"
            className="flex items-center gap-[3cqw] px-(--tv-safe-x) pt-[1cqw] pb-[2cqw]"
          >
            <img
              src={a.photo}
              alt=""
              className="size-[13cqw] shrink-0 rounded-full bg-s1 object-cover shadow-(--tv-focus-shadow)"
            />
            <div className="grid max-w-[48cqw] justify-items-start gap-[1.1cqw]">
              <h1 id="name" className="font-semibold text-[3.6cqw] leading-[0.95] tracking-display">
                {a.name}
              </h1>
              <p className="text-(length:--tv-text-meta) text-text-2">
                {a.genres.join(' · ')} · {albumsCount(a.albums)}, {songsCount(songs)}
              </p>
              {/* the actions and the note are rows of their own, so Down reaches More */}
              <div
                data-row=""
                data-group="actions"
                data-go-up="nav"
                data-go-down={long ? 'bio' : groups[0]}
                className="flex gap-[0.8cqw]"
              >
                <TvButton primary initial icon="play">
                  Play
                </TvButton>
                <TvButton icon="shuffle">Shuffle</TvButton>
                {person && (
                  <TvButton icon="movie" href={tvHref(`/people/${person}`)}>
                    Their films
                  </TvButton>
                )}
              </div>
              {bio && (
                <div data-row="" className="grid">
                  <Bio text={bio} long={long} />
                </div>
              )}
            </div>
          </section>
          {sections.map(({ kind, albums }, i) => (
            <div
              key={kind}
              data-row=""
              // the first row sits low, so the name above stays on screen while it's focused
              {...(i === 0 ? { 'data-keep': '0.72' } : {})}
              className="relative grid grid-cols-1"
            >
              <TvRow
                group={`albums-${kind}`}
                title={discographyTitle[kind]}
                goUp={i === 0 ? (long ? 'bio' : 'actions') : groups[i - 1]}
              >
                {albums.map((x) => (
                  <li key={x.id} className="w-[12cqw] shrink-0">
                    <TvTile
                      square
                      title={x.title}
                      caption={kind === 'singles' ? albumMeta(x) : String(x.year)}
                      src={x.cover}
                      href={tvHref(`/music/albums/${x.id}`)}
                    />
                  </li>
                ))}
              </TvRow>
            </div>
          ))}
          {similar.length > 0 && (
            <div data-row="" className="relative grid grid-cols-1">
              <TvRow group="similar" title="Similar artists" goUp={groups.at(-2) ?? 'actions'}>
                {similar.map((x) => (
                  <li key={x.id} className="w-[10cqw] shrink-0">
                    <TvArtistTile artist={x} />
                  </li>
                ))}
              </TvRow>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
