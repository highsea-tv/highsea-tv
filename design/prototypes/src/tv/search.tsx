// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search, TV (reference, docs/product/client-search.md#tv): an on-screen keyboard grid on the
// left and results on the right, updating as each letter lands. Right from the keyboard's last
// column enters the results; Left from their first column comes back. The keyboard is letters in
// alphabetical rows of seven, with numbers and symbols on a second layout behind &123, so every
// row starts in the same column and nothing moves between them. Typing never moves focus off the
// keys; picking a suggestion or a person does go into the results, since its button goes away.
// Results come in a section per kind, the best-matching first. Back from a result returns to the
// same query with the remote on that result.
import { useEffect, useRef, useState } from 'react'
import { searchKinds, searchSuggestions, useSearch, useSearchQuery } from '../client/data.ts'
import type { SearchSection } from '../mock/types.ts'
import {
  GlobalNav,
  ServerIdentity,
  TvButton,
  TvPoster,
  TvTile,
  tvHref,
  tvKey,
  useInitialFocus,
} from './kit.tsx'

const LAYOUTS = {
  letters: "abcdefghijklmnopqrstuvwxyz-'".split(''),
  // digits as a keypad on the left (1 2 3 / 4 5 6 / 7 8 9 / * 0 #), symbols beside them
  symbols: "123&.,:456!?'-789()/+*0#$%@=".split(''),
} as const

export function TvSearch() {
  const { q, setQ, returnTo, leaving } = useSearchQuery()
  const [layout, setLayout] = useState<keyof typeof LAYOUTS>('letters')
  const { results, settled } = useSearch(q)
  const r = results.data
  const ready = !!r && settled === q
  useInitialFocus(!returnTo, null, '[data-group="keys"] [data-focusable]')
  // Focus moves for the person only twice, each once: Back from a result puts the remote back on
  // it, and a suggestion's or a person's button, gone with its results, hands focus to the new
  // ones (or to the keys when there are none). Typing never moves it.
  const follow = useRef<'return' | 'results' | null>(returnTo ? 'return' : null)
  useEffect(() => {
    if (!follow.current || !ready) return
    const target =
      follow.current === 'return' ? `[href="${CSS.escape(returnTo)}"]` : '[data-focusable]'
    follow.current = null
    const t = requestAnimationFrame(() => {
      const scope = '[data-platform="tv"]'
      ;(
        document.querySelector<HTMLElement>(`${scope} [data-group="results"] ${target}`) ??
        document.querySelector<HTMLElement>(`${scope} [data-group="keys"] [data-focusable]`)
      )?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(t)
  }, [ready, returnTo])
  const pick = (text: string) => {
    follow.current = 'results'
    setQ(text.toLowerCase())
  }
  return (
    <>
      <GlobalNav down="keys" />
      <div className="absolute inset-0 grid grid-cols-[30cqw_minmax(0,1fr)] gap-[3cqw] px-(--tv-safe-x) pt-[7cqw] pb-(--tv-safe-y)">
        <ServerIdentity />
        <div className="grid content-start gap-[1.2cqw]">
          <h1 className="sr-only">Search</h1>
          <p
            aria-live="polite"
            className="flex h-[3.4cqw] items-center rounded-[0.5cqw] border-[0.15cqw] border-text px-[1cqw] text-(length:--tv-text-button)"
          >
            {q || <span className="text-text-3">Titles, genres and people</span>}
            <span aria-hidden className="text-text-3">
              |
            </span>
          </p>
          <div
            data-group="keys"
            data-go-up="nav"
            data-go-right="results"
            className="grid grid-cols-7 gap-[0.5cqw]"
          >
            {LAYOUTS[layout].map((k) => (
              <button
                key={k}
                type="button"
                data-focusable=""
                onClick={() => setQ((v) => v + k)}
                className={tvKey}
              >
                {k}
              </button>
            ))}
          </div>
          <div
            data-group="key-actions"
            data-go-right="results"
            className="grid grid-cols-4 gap-[0.5cqw]"
          >
            <button
              type="button"
              data-focusable=""
              aria-label={layout === 'letters' ? 'Numbers and symbols' : 'Letters'}
              className={tvKey}
              onClick={() => setLayout((l) => (l === 'letters' ? 'symbols' : 'letters'))}
            >
              {layout === 'letters' ? '&123' : 'abc'}
            </button>
            <button
              type="button"
              data-focusable=""
              className={tvKey}
              onClick={() => setQ((v) => `${v} `)}
            >
              Space
            </button>
            <button
              type="button"
              data-focusable=""
              className={tvKey}
              onClick={() => setQ((v) => v.slice(0, -1))}
            >
              Delete
            </button>
            <button type="button" data-focusable="" className={tvKey} onClick={() => setQ('')}>
              Clear
            </button>
          </div>
        </div>
        {/* the clip reaches past the column by the focus lift, so a lifted poster isn't cut */}
        <div
          data-group="results"
          data-go-left="keys"
          className="-m-[2cqw] min-h-0 overflow-hidden p-[2cqw]"
        >
          {!settled.trim() ? (
            <div className="grid content-start gap-[1cqw]">
              <h2 className="font-semibold text-(length:--tv-text-row-title)">Try</h2>
              <div className="flex flex-wrap gap-[0.8cqw]">
                {searchSuggestions.map((s) => (
                  <TvButton key={s} onClick={() => pick(s)}>
                    {s}
                  </TvButton>
                ))}
              </div>
            </div>
          ) : !r ? (
            <p className="text-(length:--tv-text-meta) text-text-3">Searching…</p>
          ) : r.sections.length === 0 ? (
            <p className="text-(length:--tv-text-synopsis) text-text-2">
              Nothing on Harbor matches “{settled}”.
            </p>
          ) : (
            <div
              data-scroll="y"
              data-keep="0.4"
              // note which result is opening, so Back can return to it
              onClickCapture={(e) => {
                const href = (e.target as HTMLElement).closest('a')?.getAttribute('href')
                if (href) leaving(href)
              }}
              className="grid content-start gap-[2.4cqw] transition-lift"
            >
              {r.sections.map((section) => (
                <section
                  key={section.kind}
                  aria-label={searchKinds[section.kind].title}
                  className="grid gap-[0.8cqw]"
                >
                  <h2 className="font-semibold text-(length:--tv-text-row-title)">
                    {searchKinds[section.kind].title}
                  </h2>
                  <TvResults section={section} onPerson={pick} />
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TvResults({
  section,
  onPerson,
}: {
  section: SearchSection
  onPerson: (name: string) => void
}) {
  const grid = 'grid grid-cols-5 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]'
  switch (section.kind) {
    case 'movies':
      return (
        <ul className={grid}>
          {section.items.map((m) => (
            <li key={m.id}>
              <TvPoster item={m} href={tvHref(`/movies/${m.id}`)} />
            </li>
          ))}
        </ul>
      )
    case 'collections':
      return (
        <ul className={grid}>
          {section.items.map((c) => (
            <li key={c.id}>
              <TvTile
                title={c.name}
                caption={`${c.count} ${c.count === 1 ? 'movie' : 'movies'} · ${c.years}`}
                src={c.art.poster}
                href={tvHref(`/collections/${c.id}`)}
              />
            </li>
          ))}
        </ul>
      )
    case 'people':
      return (
        <ul className="flex flex-wrap gap-[0.8cqw]">
          {section.items.map((p) => (
            <li key={p.id}>
              <TvButton onClick={() => onPerson(p.name)} className="ps-[0.6cqw]">
                <img src={p.photo} alt="" className="size-[2.2cqw] rounded-full object-cover" />
                {p.name}
              </TvButton>
            </li>
          ))}
        </ul>
      )
  }
}
