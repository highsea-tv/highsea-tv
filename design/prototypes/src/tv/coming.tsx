// SPDX-License-Identifier: AGPL-3.0-only
// Shows and Music, TV: destinations in the global nav ahead of the media they'll hold (the owner,
// 2026-10-30, to be prototyped soon). Each has its title where the other screens head theirs and
// a calm note below, with Movies to go to instead, so the remote has somewhere to land.
import { TvButton, TvHead, tvHref, useInitialFocus } from './kit.tsx'

const pages = {
  shows: {
    title: 'Shows',
    note: 'Shows come to highsea in a later version. Until then, the server’s movies are in Movies.',
  },
  music: {
    title: 'Music',
    note: 'Music comes to highsea in a later version. Until then, the server’s movies are in Movies.',
  },
} as const

export function TvComing({ kind }: { kind: keyof typeof pages }) {
  const page = pages[kind]
  useInitialFocus(true, kind)
  return (
    <>
      <main
        className={`absolute inset-0 grid grid-rows-[auto_auto_minmax(0,1fr)] gap-y-[1.6cqw] px-(--tv-safe-x) pb-(--tv-safe-y)`}
      >
        <TvHead down="coming" />
        <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">{page.title}</h1>
        <div className="grid place-items-center">
          <div
            data-group="coming"
            data-go-up="nav"
            className="grid max-w-[46cqw] justify-items-center gap-[1.4cqw] text-center"
          >
            <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
              {page.note}
            </p>
            <TvButton initial icon="movie" href={tvHref('/movies')}>
              Movies
            </TvButton>
          </div>
        </div>
      </main>
    </>
  )
}
