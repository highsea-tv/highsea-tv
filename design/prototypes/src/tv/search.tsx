// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search, TV (reference, docs/product/client-search.md#tv): an on-screen keyboard grid on the
// left and results on the right, updating as each letter lands. Right from the keyboard's last
// column enters the results; Left from their first column comes back. The keyboard is letters in
// alphabetical rows of seven, with numbers and symbols on a second layout behind &123, so every
// row starts in the same column and nothing moves between them.
import { useState } from 'react'
import { searchSuggestions, useSearch } from '../client/data.ts'
import {
  GlobalNav,
  ServerIdentity,
  TvButton,
  TvPoster,
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
  const [q, setQ] = useState('')
  const [layout, setLayout] = useState<keyof typeof LAYOUTS>('letters')
  const { results, settled } = useSearch(q)
  useInitialFocus(true, null, '[data-group="keys"] [data-focusable]')
  const r = results.data
  // a suggestion's button goes away with its results: focus follows into them (or back to the
  // keys when there are none), so the remote never loses its place
  const [picked, setPicked] = useState(0)
  useInitialFocus(
    picked > 0 && !!r && settled === q,
    `${picked}:${r?.titles.length}`,
    r?.titles.length
      ? '[data-group="results"] [data-focusable]'
      : '[data-group="keys"] [data-focusable]',
  )
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
                  <TvButton
                    key={s}
                    onClick={() => {
                      setQ(s.toLowerCase())
                      setPicked((n) => n + 1)
                    }}
                  >
                    {s}
                  </TvButton>
                ))}
              </div>
            </div>
          ) : !r ? (
            <p className="text-(length:--tv-text-meta) text-text-3">Searching…</p>
          ) : r.titles.length === 0 ? (
            <p className="text-(length:--tv-text-synopsis) text-text-2">
              Nothing on Harbor matches “{settled}”.
            </p>
          ) : (
            <div
              data-scroll="y"
              data-keep="0.4"
              className="grid content-start gap-[1.4cqw] transition-lift"
            >
              {r.people.length > 0 && (
                <p className="text-(length:--tv-text-meta) text-text-2">
                  With{' '}
                  {r.people
                    .slice(0, 3)
                    .map((p) => p.name)
                    .join(', ')}
                </p>
              )}
              <ul
                aria-label="Movies"
                className="grid grid-cols-5 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]"
              >
                {r.titles.map((m) => (
                  <li key={m.id}>
                    <TvPoster item={m} href={tvHref(`/movies/${m.id}`)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
