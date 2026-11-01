// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search on the web and desktop (reference, docs/product/client-search.md): instant results
// as you type, in a section per kind (movies, shows, episodes, people, collections, artists,
// albums and songs), the best-matching kind first. An episode opens its show at it; a song plays.

import { cn, Icon, Input, Poster } from '@highsea-tv/ui-web'
import {
  personCredits,
  searchedFor,
  searchKinds,
  searchPlaceholder,
  searchSuggestions,
  useSearch,
  useSearchQuery,
  useServerName,
} from '../client/data.ts'
import { MediaPoster } from '../client/media-card.tsx'
import { songTime } from '../client/music.ts'
import { useMusicPlayer } from '../client/music-player.ts'
import { ShowPoster } from '../client/show-card.tsx'
import type { SearchSection, SearchSong } from '../mock/types.ts'
import { ArtistCard } from './music.tsx'
import { gutter, webHref } from './shell.tsx'

export function WebSearch() {
  const { q, setQ } = useSearchQuery()
  const { results, settled } = useSearch(q)
  const server = useServerName()
  const r = results.data
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] content-start gap-8 py-8', gutter)}>
      <h1 className="sr-only">Search</h1>
      <Input
        type="search"
        icon="search"
        aria-label={`Search: ${searchPlaceholder.toLowerCase()}`}
        placeholder={searchPlaceholder}
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        className="h-12 text-body"
      />
      {!settled.trim() ? (
        <section aria-label="Try" className="grid gap-3">
          <h2 className="font-mono text-label text-text-3 uppercase">Try</h2>
          <div className="flex flex-wrap gap-2">
            {searchSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQ(s)}
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-text-2 text-body outline-none hover:bg-s2 hover:text-text focus-visible:ring-focus"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : results.status === 'error' ? (
        <p className="text-badge-danger text-body">Search didn’t work. {results.error.message}</p>
      ) : !r ? (
        <p aria-busy className="text-caption text-text-3">
          Searching…
        </p>
      ) : r.sections.length === 0 ? (
        <p className="text-text-2 text-body">
          Nothing on {server} matches “{settled}”. Try part of a title, a genre or a name.
        </p>
      ) : (
        <div aria-live="polite" className="grid gap-8">
          {r.sections.map((section) => (
            <section
              key={section.kind}
              aria-label={searchKinds[section.kind].title}
              className="grid gap-3"
            >
              <h2 className="text-title">
                {searchKinds[section.kind].title}{' '}
                <span className="font-normal text-text-3">{section.items.length}</span>
              </h2>
              <Results section={section} />
            </section>
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-caption text-text-3">
        <Icon name="info" size={14} />
        Searches what’s on {server}. Asking for something new comes with requests, later.
      </p>
    </main>
  )
}

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

function Results({ section }: { section: SearchSection }) {
  switch (section.kind) {
    case 'movies':
      return (
        <ul className={grid}>
          {section.items.map((m) => (
            <li key={m.id}>
              <MediaPoster item={m} titleSize="body" href={webHref(`/movies/${m.id}`)} />
            </li>
          ))}
        </ul>
      )
    case 'shows':
      return (
        <ul className={grid}>
          {section.items.map((x) => (
            <li key={x.id}>
              <ShowPoster show={x} titleSize="body" href={webHref(`/shows/${x.id}`)} />
            </li>
          ))}
        </ul>
      )
    case 'episodes':
      return (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 gap-y-6">
          {section.items.map((e) => (
            <li key={e.id}>
              <Poster
                aspect="still"
                title={e.title}
                src={e.still}
                href={webHref(`/shows/${e.show.id}/episodes/${e.id}`)}
                showTitle
                titleSize="body"
                caption={`${e.show.title} · ${e.code}`}
              />
            </li>
          ))}
        </ul>
      )
    case 'artists':
      return (
        <ul className={grid}>
          {section.items.map((a) => (
            <li key={a.id}>
              <ArtistCard artist={a} />
            </li>
          ))}
        </ul>
      )
    case 'albums':
      return (
        <ul className={grid}>
          {section.items.map((a) => (
            <li key={a.id}>
              <Poster
                aspect="square"
                title={a.title}
                src={a.cover}
                href={webHref(`/music/albums/${a.id}`)}
                showTitle
                titleSize="body"
                caption={a.artist.name}
              />
            </li>
          ))}
        </ul>
      )
    case 'songs':
      return <Songs songs={section.items} />
    case 'collections':
      return (
        <ul className={grid}>
          {section.items.map((c) => (
            <li key={c.id}>
              <Poster
                title={c.name}
                src={c.art.poster}
                href={webHref(`/collections/${c.id}`)}
                showTitle
                caption={`${c.count} ${c.count === 1 ? 'movie' : 'movies'} · ${c.years}`}
              />
            </li>
          ))}
        </ul>
      )
    case 'people':
      return (
        <ul className="flex flex-wrap gap-2">
          {section.items.map((p) => (
            <li key={p.id}>
              <a
                href={webHref(`/people/${p.id}`)}
                aria-label={`${p.name}, ${personCredits(p)} on this server`}
                className="flex items-center gap-2.5 rounded-full border border-line bg-s1 py-1 ps-1 pe-3.5 text-start outline-none hover:bg-s2 focus-visible:ring-focus"
              >
                <img src={p.photo} alt="" className="size-8 rounded-full object-cover" />
                <span className="grid">
                  <span className="text-text text-body">{p.name}</span>
                  <span className="text-caption text-text-3">{`${personCredits(p)} here`}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )
  }
}

/** Songs: each plays its album from it, as a song's row on the album's page does. */
function Songs({ songs }: { songs: SearchSong[] }) {
  const music = useMusicPlayer()
  return (
    <ul className="grid max-w-[48rem] gap-1">
      {songs.map((x) => (
        <li key={x.id}>
          <button
            type="button"
            onClick={() =>
              music.play(
                { album: x.album.id },
                { start: x.number - 1, from: { kind: 'search', name: searchedFor(), to: null } },
              )
            }
            aria-label={`Play ${x.title}, by ${x.album.artist.name}, from ${x.album.title}`}
            className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-1.5 text-start outline-none hover:bg-s1 focus-visible:ring-focus"
          >
            <img src={x.album.cover} alt="" className="size-11 rounded-sm bg-s2 object-cover" />
            <span className="grid min-w-0">
              <span
                className={cn(
                  'truncate text-body',
                  music.song?.id === x.id ? 'text-accent-text' : 'text-text',
                )}
              >
                {x.title}
              </span>
              <span className="truncate text-caption text-text-3">
                {x.album.artist.name} · {x.album.title}
              </span>
            </span>
            <span className="font-mono text-caption text-text-3">{songTime(x.duration)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
