// SPDX-License-Identifier: AGPL-3.0-only
// A4 Discover → add movie (docs/product/movies.md#discover). Trending from the metadata source
// until you type, then instant results. A poster opens the movie's page, the same page whether
// it's in the library or not (ADR 0014). Add opens the add dialog. Since stage 6 a Movies and
// Shows choice beside the search finds shows too, at `/discover/shows`, with Add a show
// (shows.md#discover).
import { Badge, Button, EmptyState, Input, Poster, Rating, SegmentedControl } from '@highsea-tv/ui'
import { useDeferredValue, useState } from 'react'
import { useQuery } from '../../mock/hooks.tsx'
import type { DiscoverMovie, DiscoverShow } from '../../mock/types.ts'
import { Loadable, PosterSkeletons } from '../loadable.tsx'
import { movieHref, showHref } from '../media/links.ts'
import { AddMovieDialog } from '../movies/add-dialog.tsx'
import { AdminPage } from '../shell.tsx'
import { AddShowDialog } from '../shows/add-dialog.tsx'
import { useTabAddress } from '../tabs.ts'

/** The search lives in the history entry, so Back from a movie returns to the same results. */
function useRememberedQuery() {
  const [query, setQuery] = useState<string>(() => {
    const q = (history.state as { discoverQuery?: unknown } | null)?.discoverQuery
    return typeof q === 'string' ? q : ''
  })
  const set = (q: string) => {
    setQuery(q)
    history.replaceState({ ...(history.state as object | null), discoverQuery: q }, '')
  }
  return [query, set] as const
}

/** What Discover finds: movies at `/discover`, shows at `/discover/shows`. */
export const discoverKinds = ['movies', 'shows'] as const
type Kind = (typeof discoverKinds)[number]

export function Discover({ kind = 'movies' }: { kind?: Kind }) {
  const go = useTabAddress<Kind>('/discover', 'movies')
  const [query, setQuery] = useRememberedQuery()
  const deferred = useDeferredValue(query.trim())

  return (
    <AdminPage
      title="Discover"
      description={
        kind === 'shows'
          ? 'Find a show and add it. highsea searches your indexers for each episode.'
          : 'Find a movie and add it. highsea searches your indexers and takes it from there.'
      }
    >
      <div className="flex max-w-2xl flex-wrap items-center gap-3">
        <SegmentedControl
          aria-label="Find"
          value={kind}
          onValueChange={(v) => go(v as Kind)}
          options={[
            { value: 'movies', label: 'Movies', icon: 'movie' },
            { value: 'shows', label: 'Shows', icon: 'tv' },
          ]}
        />
        <Input
          type="search"
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'shows' ? 'Title, network or genre' : 'Title, year or genre'}
          aria-label={kind === 'shows' ? 'Search for a show' : 'Search for a movie'}
          spellCheck={false}
          className="min-w-0 flex-1 basis-64"
        />
      </div>
      <h2 className="text-title text-text">
        {deferred ? `Results for “${deferred}”` : 'Trending this week'}
      </h2>
      {kind === 'shows' ? <ShowResults query={deferred} /> : <MovieResults query={deferred} />}
    </AdminPage>
  )
}

function MovieResults({ query: deferred }: { query: string }) {
  const results = useQuery(`discover:${deferred}`, (c) => c.movies.discover(deferred), [
    'movies.updated',
  ])
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  return (
    <>
      <Loadable query={results} what="results" skeleton={<PosterSkeletons />}>
        {(movies) =>
          movies.length === 0 ? (
            deferred ? (
              <EmptyState icon="search" title={`Nothing matches “${deferred}”`}>
                Try the original title, or just the year.
              </EmptyState>
            ) : (
              <EmptyState icon="discover" title="Nothing trending right now">
                The metadata source didn’t return anything. Search for a title instead.
              </EmptyState>
            )
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5">
              {movies.map((m) => (
                <li key={m.id} className="grid content-start gap-2">
                  <Poster
                    title={m.title}
                    src={m.art.poster}
                    href={movieHref(m)}
                    showTitle
                    caption={
                      <span className="flex items-center gap-2">
                        {m.year}
                        {m.rating > 0 && <Rating value={m.rating} size={11} />}
                      </span>
                    }
                  />
                  {m.inLibrary ? (
                    <a
                      href={movieHref(m)}
                      className="justify-self-start"
                      aria-label={`In library: ${m.title}`}
                    >
                      <Badge tone="success">In library</Badge>
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      icon="add"
                      onClick={() => setAdding([m])}
                      aria-label={`Add ${m.title}`}
                      className="justify-self-start"
                    >
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </Loadable>
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </>
  )
}

/** Shows from TMDB: one in the library opens its page; Add a show for the rest. */
function ShowResults({ query: deferred }: { query: string }) {
  const results = useQuery(`discover-shows:${deferred}`, (c) => c.shows.discover(deferred), [
    'shows.updated',
  ])
  const [adding, setAdding] = useState<DiscoverShow | null>(null)
  return (
    <>
      <Loadable query={results} what="results" skeleton={<PosterSkeletons />}>
        {(shows) =>
          shows.length === 0 ? (
            deferred ? (
              <EmptyState icon="search" title={`Nothing matches “${deferred}”`}>
                Try the original title, or a genre.
              </EmptyState>
            ) : (
              <EmptyState icon="discover" title="Nothing trending right now">
                The metadata source didn’t return anything. Search for a title instead.
              </EmptyState>
            )
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5">
              {shows.map((s) => (
                <li key={s.id} className="grid content-start gap-2">
                  <Poster
                    title={s.title}
                    src={s.art.poster}
                    // a show not here yet has no page in the admin yet: Add is its one action
                    href={s.inLibrary ? showHref(s) : undefined}
                    showTitle
                    caption={
                      <span className="flex items-center gap-2">
                        {s.year}
                        {s.rating > 0 && <Rating value={s.rating} size={11} />}
                      </span>
                    }
                  />
                  {s.inLibrary ? (
                    <a
                      href={showHref(s)}
                      className="justify-self-start"
                      aria-label={`In library: ${s.title}`}
                    >
                      <Badge tone="success">In library</Badge>
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      icon="add"
                      onClick={() => setAdding(s)}
                      aria-label={`Add ${s.title}`}
                      className="justify-self-start"
                    >
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </Loadable>
      <AddShowDialog show={adding} onOpenChange={(o) => !o && setAdding(null)} />
    </>
  )
}
