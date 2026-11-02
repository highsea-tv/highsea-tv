// SPDX-License-Identifier: AGPL-3.0-only
// What a session plays, as Now playing, its history and the dashboard's widget name it
// (docs/product/now-playing.md, stage 6 of the prototypes' gaps): a film by its title, an episode
// by its show, number and title, linked to the show, and a song by its title, artist and album.
import type { PosterAspect } from '@highsea-tv/ui-web'
import type { PlayingItem } from '../../mock/sessions.ts'
import { adminHref } from '../shell.tsx'

/** "Sintel", "Saltmarsh · S2, E4 · Strangers", "Wild Rooms · Aurora Fields · Low Tide Hours". */
export const playingName = (item: PlayingItem) =>
  item.kind === 'episode'
    ? `${item.show.title} · ${item.code} · ${item.title}`
    : item.kind === 'song'
      ? `${item.title} · ${item.artist} · ${item.album}`
      : item.title

/** Where its title and art go: the film's page, or the show's. Music has no admin page yet. */
export const playingHref = (item: PlayingItem) =>
  item.kind === 'movie'
    ? adminHref(`/movies/${item.id}`)
    : item.kind === 'episode'
      ? adminHref(`/shows/${item.show.id}`)
      : undefined

/** A song's art is its album's square cover; the rest are posters. */
export const playingAspect = (item: PlayingItem): PosterAspect =>
  item.kind === 'song' ? 'square' : 'poster'

/**
 * The title line: the film and its year; the show (linked), then the number and title; or the
 * song, then its artist and album.
 */
export function PlayingTitle({ item }: { item: PlayingItem }) {
  const href = playingHref(item)
  if (item.kind === 'episode')
    return (
      <>
        <a href={href} className="font-medium text-text hover:underline">
          {item.show.title}
        </a>
        <span className="text-text-2">
          {' '}
          · {item.code} · {item.title}
        </span>
      </>
    )
  if (item.kind === 'song')
    return (
      <>
        <span className="font-medium text-text">{item.title}</span>
        <span className="text-text-2">
          {' '}
          · {item.artist} · {item.album}
        </span>
      </>
    )
  return (
    <>
      <a href={href} className="font-medium text-text hover:underline">
        {item.title}
      </a>
      {item.year && <span className="ms-2 text-text-3">{item.year}</span>}
    </>
  )
}
