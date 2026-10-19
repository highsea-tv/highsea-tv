// SPDX-License-Identifier: AGPL-3.0-only
// A4 Discover → add movie (docs/product/movies.md#discover). Trending from the metadata source
// until you type, then instant results. A poster opens the movie's page, the same page whether
// it's in the library or not (ADR 0014). Add opens the add dialog.
import { Badge, Button, EmptyState, Input, Poster, Rating } from '@highsea/ui-web'
import { useDeferredValue, useState } from 'react'
import { useQuery } from '../../mock/hooks.tsx'
import type { DiscoverMovie } from '../../mock/types.ts'
import { Loadable, PosterSkeletons } from '../loadable.tsx'
import { movieHref } from '../media/links.ts'
import { AddMovieDialog } from '../movies/add-dialog.tsx'
import { isStaff } from '../nav.ts'
import { AdminPage, useShell } from '../shell.tsx'

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

export function Discover() {
  const { role } = useShell()
  const [query, setQuery] = useRememberedQuery()
  const deferred = useDeferredValue(query.trim())
  const results = useQuery(`discover:${deferred}`, (c) => c.movies.discover(deferred), [
    'movies.updated',
  ])
  const [adding, setAdding] = useState<DiscoverMovie[]>([])

  return (
    <AdminPage
      title="Discover"
      description="Find a movie and add it. highsea searches your indexers and takes it from there."
    >
      <div className="grid max-w-xl gap-1.5">
        <Input
          type="search"
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title, year or genre"
          aria-label="Search for a movie"
          spellCheck={false}
        />
      </div>
      <h2 className="text-title text-text">
        {deferred ? `Results for “${deferred}”` : 'Trending this week'}
      </h2>
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
                      disabled={!isStaff(role)}
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
      {!isStaff(role) && results.status === 'success' && (
        <p className="text-caption text-text-3">
          Only owners and admins can add movies. Ask the server’s owner for one you want.
        </p>
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}
