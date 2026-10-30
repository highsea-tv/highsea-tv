// SPDX-License-Identifier: AGPL-3.0-only
// Collections, TV (docs/product/collections.md#in-the-apps): a destination of its own in the
// global nav (the owner, 2026-10-30). A collection holds one family of media, video (movies and
// shows) or audio (music), in any mix within it, so the page has three choices beside its title:
// All, the default, with Video and Audio as two sections, then each family on its own. The
// collections are a poster grid, smart ones marked. Up from the grid reaches the choices, Up again
// the nav; focus starts on the first collection.
import { useState } from 'react'
import { collectionCaption, useCollections } from '../client/data.ts'
import { CollectionTile } from '../kit/collection-art.tsx'
import type { ClientCollection } from '../mock/types.ts'
import { TvButton, TvHead, TvMessage, TvTileSkeleton, tvHref, useInitialFocus } from './kit.tsx'

type Family = 'video' | 'audio'
type Show = 'all' | Family

const choices: { value: Show; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
]

const families: { value: Family; label: string; none: string }[] = [
  {
    value: 'video',
    label: 'Video',
    none: 'No video collections yet. When the server’s owner makes them, they show up here.',
  },
  {
    value: 'audio',
    label: 'Audio',
    none: 'Audio collections show up here once highsea plays music, in a later version.',
  },
]

/**
 * A collection's family. The server will send it with each collection; until shows and music
 * come, every collection holds movies, so every one is video.
 */
const familyOf = (_c: ClientCollection): Family => 'video'

const choice =
  'rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-pressed:bg-text/12 aria-pressed:text-text'

function Grid({ label, xs }: { label: string; xs: ClientCollection[] }) {
  return (
    <ul aria-label={label} className="grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]">
      {xs.map((c) => (
        <li key={c.id}>
          <CollectionTile
            tv
            href={tvHref(`/collections/${c.id}`)}
            name={c.name}
            caption={collectionCaption(c)}
            poster={c.art.poster}
            mosaic={c.smart?.mosaic}
            smart={!!c.smart?.words}
          />
        </li>
      ))}
    </ul>
  )
}

export function TvCollections() {
  const list = useCollections('tv')
  const [show, setShow] = useState<Show>('all')
  useInitialFocus(list.status === 'success', null, '[data-group="grid"] [data-focusable]')
  if (list.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the collections"
        actions={
          <TvButton primary initial onClick={list.refetch}>
            Try again
          </TvButton>
        }
      >
        {list.error.message}
      </TvMessage>
    )
  const xs = list.data ?? []
  const shown = families.filter((f) => show === 'all' || show === f.value)
  return (
    <>
      <main className="absolute inset-0 overflow-hidden">
        <div
          data-scroll="y"
          data-keep="0.35"
          className={`relative grid grid-cols-1 gap-[1.6cqw] px-(--tv-safe-x) pb-(--tv-safe-y) transition-lift`}
        >
          {/* in the track, so it scrolls away with the page */}
          <TvHead down="kind" />
          <div className="flex items-end gap-[2cqw]">
            <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">
              Collections
            </h1>
            <div
              data-group="kind"
              data-go-up="nav"
              data-go-down="grid"
              className="flex gap-[0.8cqw]"
            >
              {choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  data-focusable=""
                  aria-pressed={show === c.value}
                  onClick={() => setShow(c.value)}
                  className={choice}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {list.status === 'loading' ? (
            <div aria-busy className="grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]">
              {Array.from({ length: 7 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                <TvTileSkeleton key={i} />
              ))}
            </div>
          ) : (
            // one D-pad group across the sections, so Down from the last video row reaches the
            // first audio one
            <div data-group="grid" data-go-up="kind" className="grid gap-[2.4cqw]">
              {shown.map((f) => {
                const mine = xs.filter((c) => familyOf(c) === f.value)
                return (
                  <section key={f.value} aria-label={f.label} className="grid gap-[1cqw]">
                    {/* All names each section; a family on its own is already named by its choice */}
                    {show === 'all' && (
                      <h2 className="font-semibold text-(length:--tv-text-row-title)">{f.label}</h2>
                    )}
                    {mine.length === 0 ? (
                      <p className="text-(length:--tv-text-synopsis) text-text-2">{f.none}</p>
                    ) : (
                      <Grid label={`${f.label} collections`} xs={mine} />
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
