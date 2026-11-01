// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search, TV (reference, docs/product/client-search.md#tv): an on-screen keyboard grid on the
// left and results on the right, updating as each letter lands. Right from the keyboard's last
// column enters the results; Left from their first column comes back. The keyboard is letters in
// alphabetical rows of seven, with numbers and symbols on a second layout behind &123, so every
// row starts in the same column and nothing moves between them. Typing never moves focus off the
// keys; picking a suggestion or a person does go into the results, since its button goes away.
// Results come in a section per kind (movies, shows, episodes, people, collections, artists,
// albums and songs), the best-matching first; an episode opens its show at it, a song plays. Back from a result returns to the
// same query with the remote on that result.

import { useEffect, useRef, useState } from 'react'
import {
  collectionCaption,
  searchedFor,
  searchKinds,
  searchPlaceholder,
  searchSuggestions,
  useSearch,
  useSearchQuery,
  useServerName,
} from '../client/data.ts'
import { useMusicPlayer } from '../client/music-player.ts'
import { UnwatchedCount } from '../client/show-card.tsx'
import { seasonsCount } from '../client/shows.ts'
import type { SearchSection, SearchSong } from '../mock/types.ts'
import { TvButton, TvHead, TvPoster, TvTile, tvHref, tvKey, useInitialFocus } from './kit.tsx'
import { TvArtistTile } from './music.tsx'

const LAYOUTS = {
  letters: "abcdefghijklmnopqrstuvwxyz-'".split(''),
  // digits as a keypad on the left (1 2 3 / 4 5 6 / 7 8 9 / * 0 #), symbols beside them
  symbols: "123&.,:456!?'-789()/+*0#$%@=".split(''),
} as const

export function TvSearch() {
  const { q, setQ, returnTo, leaving } = useSearchQuery()
  const [layout, setLayout] = useState<keyof typeof LAYOUTS>('letters')
  const { results, settled } = useSearch(q)
  const server = useServerName()
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
      <div
        className={`absolute inset-0 grid grid-cols-[30cqw_minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] gap-x-[3cqw] gap-y-[1.6cqw] px-(--tv-safe-x) pb-(--tv-safe-y)`}
      >
        <TvHead down="keys" className="col-span-full" />
        {/* the title across both columns, as the other screens head theirs (the owner,
        2026-10-30), so the field and the results start level under it */}
        <h1 className="col-span-full font-semibold text-[2.6cqw] leading-none tracking-display">
          Search
        </h1>
        <div className="grid content-start gap-[1.2cqw]">
          <p
            aria-live="polite"
            className="flex h-[3.4cqw] items-center rounded-[0.5cqw] border-[0.15cqw] border-text px-[1cqw] text-(length:--tv-text-button)"
          >
            {q || <span className="text-text-3">{searchPlaceholder}</span>}
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
              Nothing on {server} matches “{settled}”.
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
                  <TvResults section={section} />
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TvResults({ section }: { section: SearchSection }) {
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
    case 'shows':
      return (
        <ul className={grid}>
          {section.items.map((x) => (
            <li key={x.id}>
              <TvTile
                title={x.title}
                caption={seasonsCount(x.seasons)}
                src={x.art.poster}
                href={tvHref(`/shows/${x.id}`)}
                status={<UnwatchedCount show={x} />}
              />
            </li>
          ))}
        </ul>
      )
    case 'episodes':
      return (
        <ul className="grid grid-cols-3 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]">
          {section.items.map((e) => (
            <li key={e.id}>
              <TvTile
                wide
                title={e.title}
                caption={`${e.show.title} · ${e.code}`}
                src={e.still}
                href={tvHref(`/shows/${e.show.id}/episodes/${e.id}`)}
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
              <TvArtistTile artist={a} />
            </li>
          ))}
        </ul>
      )
    case 'albums':
      return (
        <ul className={grid}>
          {section.items.map((a) => (
            <li key={a.id}>
              <TvTile
                square
                title={a.title}
                caption={a.artist.name}
                src={a.cover}
                href={tvHref(`/music/albums/${a.id}`)}
              />
            </li>
          ))}
        </ul>
      )
    case 'songs':
      return <TvSongs songs={section.items} />
    case 'collections':
      return (
        <ul className={grid}>
          {section.items.map((c) => (
            <li key={c.id}>
              <TvTile
                title={c.name}
                caption={collectionCaption(c)}
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
              <TvButton href={tvHref(`/people/${p.id}`)} className="ps-[0.6cqw]">
                <img src={p.photo} alt="" className="size-[2.2cqw] rounded-full object-cover" />
                {p.name}
              </TvButton>
            </li>
          ))}
        </ul>
      )
  }
}

/** Songs as buttons: each plays its album from it, as a song's row on the album's page does. */
function TvSongs({ songs }: { songs: SearchSong[] }) {
  const music = useMusicPlayer()
  return (
    <ul className="flex flex-wrap gap-[0.8cqw]">
      {songs.map((x) => (
        <li key={x.id}>
          <TvButton
            aria-label={`Play ${x.title}, by ${x.album.artist.name}, from ${x.album.title}`}
            onClick={() =>
              music.play(
                { album: x.album.id },
                { start: x.number - 1, from: { kind: 'search', name: searchedFor(), to: null } },
              )
            }
            className="ps-[0.6cqw]"
          >
            <img
              src={x.album.cover}
              alt=""
              className="size-[2.2cqw] rounded-[0.3cqw] object-cover"
            />
            {x.title}
            <span className="font-normal text-text-3">{x.album.artist.name}</span>
          </TvButton>
        </li>
      ))}
    </ul>
  )
}
