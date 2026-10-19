// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search on the web and desktop (reference, docs/product/client-search.md): instant results
// as you type, people first when a name matches, then titles as posters.
import { cn, Icon, Input, Poster } from '@highsea/ui-web'
import { useState } from 'react'
import { searchSuggestions, useSearch } from '../client/data.ts'
import { gutter, webHref } from './shell.tsx'

export function WebSearch() {
  const [q, setQ] = useState('')
  const { results, settled } = useSearch(q)
  const r = results.data
  return (
    <main className={cn('mx-auto grid max-w-[1680px] content-start gap-8 py-8', gutter)}>
      <h1 className="sr-only">Search</h1>
      <Input
        type="search"
        icon="search"
        aria-label="Search titles, genres and people"
        placeholder="Titles, genres and people"
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
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-text-2 text-ui outline-none hover:bg-s2 hover:text-text focus-visible:ring-focus"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : results.status === 'error' ? (
        <p className="text-badge-danger text-ui">Search didn’t work. {results.error.message}</p>
      ) : !r ? (
        <p aria-busy className="text-caption text-text-3">
          Searching…
        </p>
      ) : r.titles.length === 0 && r.people.length === 0 ? (
        <p className="text-text-2 text-ui">
          Nothing on Harbor matches “{settled}”. Try part of a title, a genre or a name.
        </p>
      ) : (
        <div aria-live="polite" className="grid gap-8">
          {r.people.length > 0 && (
            <section aria-label="People" className="grid gap-3">
              <h2 className="text-title">People</h2>
              <ul className="flex flex-wrap gap-2">
                {r.people.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setQ(p.name)}
                      className="flex items-center gap-2.5 rounded-full border border-line bg-s1 py-1 ps-1 pe-3.5 text-start outline-none hover:bg-s2 focus-visible:ring-focus"
                    >
                      <img src={p.photo} alt="" className="size-8 rounded-full object-cover" />
                      <span className="grid">
                        <span className="text-text text-ui">{p.name}</span>
                        <span className="text-caption text-text-3">
                          {p.titles} {p.titles === 1 ? 'movie' : 'movies'} here
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {r.titles.length > 0 && (
            <section aria-label="Movies" className="grid gap-3">
              <h2 className="text-title">
                Movies <span className="font-normal text-text-3">{r.titles.length}</span>
              </h2>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6">
                {r.titles.map((m) => (
                  <li key={m.id}>
                    <Poster
                      title={m.title}
                      src={m.art.poster}
                      href={webHref(`/movies/${m.id}`)}
                      showTitle
                      caption={String(m.year)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-caption text-text-3">
        <Icon name="info" size={14} />
        Searches what’s on Harbor. Asking for something new comes with requests, later.
      </p>
    </main>
  )
}
