// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player chrome, mobile (docs/product/player.md#mobile). The player is landscape: the phone
// frame stays portrait, so the prototype turns the player a quarter turn inside it, as the phone
// would be held. A tap shows or hides the chrome; skip back and forward sit beside Play, in thumb
// reach; Audio and subtitles opens the same panel as the web, sized for touch.
import { Button, EmptyState, Icon } from '@highsea-tv/ui-web'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { clock } from '../client/data.ts'
import { HIDE_MS, SEEK_S, usePlayer } from '../client/player.ts'
import { PHONE } from '../kit/mobile/device.tsx'
import { CueLine, Scrubber, TracksPanel } from '../web/player.tsx'
import { mobileHref } from './shell.tsx'

const round =
  'grid cursor-pointer place-items-center rounded-full text-[#ededee] outline-none transition-press focus-visible:ring-focus active:scale-97'

export function MobilePlayer({ fromStart = false }: { fromStart?: boolean }) {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const player = usePlayer(id, fromStart)
  const [panel, setPanel] = useState(false)
  const [shown, setShown] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const wake = useCallback(() => {
    setShown(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShown(false), HIDE_MS)
  }, [])
  useEffect(() => {
    wake()
    return () => clearTimeout(timer.current)
  }, [wake])

  if (player.detail.status === 'error')
    return (
      <main className="grid h-screen place-items-center bg-bg p-4">
        <EmptyState
          icon="movie"
          tone="error"
          title={player.detail.error.message}
          action={
            <Button asChild>
              <a href={mobileHref('/')}>Go home</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </main>
    )

  const d = player.detail.data
  const chrome = shown || !player.playing || panel
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#000]">
      {/* landscape: the long side runs down the portrait frame */}
      <div
        className="absolute top-1/2 left-1/2 overflow-hidden"
        style={{
          width: PHONE.h,
          height: PHONE.w,
          transform: 'translate(-50%, -50%) rotate(90deg)',
        }}
      >
        <button
          type="button"
          aria-label={chrome ? 'Hide controls' : 'Show controls'}
          onClick={() => (chrome && player.playing ? setShown(false) : wake())}
          className="absolute inset-0 cursor-default"
        >
          {d && <img src={d.item.art.still} alt="" className="size-full object-cover" />}
        </button>
        <h1 className="sr-only">Playing {d?.item.title ?? ''}</h1>
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%]">
          <CueLine player={player} />
        </div>

        {chrome && (
          <div className="absolute inset-0 bg-[rgb(0_0_0/0.45)]">
            <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-12 pt-4">
              <button
                type="button"
                aria-label="Back to details"
                onClick={() => navigate(`/movies/${id}`)}
                className={`${round} size-11`}
              >
                <Icon name="chevron-down" size={24} />
              </button>
              <span className="truncate font-semibold text-[#ededee] text-[17px]">
                {d?.item.title}
              </span>
              <button
                type="button"
                aria-label="Audio and subtitles"
                aria-expanded={panel}
                onClick={() => setPanel(true)}
                className={`${round} ms-auto size-11`}
              >
                <Icon name="subtitles" size={22} />
              </button>
            </div>
            <div className="absolute top-1/2 left-1/2 flex -translate-1/2 items-center gap-12">
              <button
                type="button"
                aria-label={`Back ${SEEK_S} seconds`}
                onClick={() => {
                  player.seekBy(-SEEK_S)
                  wake()
                }}
                className={`${round} size-14`}
              >
                <Icon name="replay" size={28} />
              </button>
              <button
                type="button"
                aria-label={player.playing ? 'Pause' : 'Play'}
                onClick={() => {
                  player.toggle()
                  wake()
                }}
                className={`${round} size-18 bg-[rgb(255_255_255/0.14)]`}
              >
                <Icon name={player.playing ? 'pause' : 'play'} size={36} />
              </button>
              <button
                type="button"
                aria-label={`Forward ${SEEK_S} seconds`}
                onClick={() => {
                  player.seekBy(SEEK_S)
                  wake()
                }}
                className={`${round} size-14`}
              >
                <Icon name="replay" size={28} className="-scale-x-100" />
              </button>
            </div>
            <div className="absolute inset-x-0 bottom-0 grid gap-2 px-12 pb-5">
              <div className="flex justify-between font-mono text-[#ededee]/80 text-[12px]">
                <span>{clock(player.position)}</span>
                <span>−{clock(player.duration - player.position)}</span>
              </div>
              <Scrubber player={player} />
            </div>
          </div>
        )}
        {panel && <TracksPanel player={player} onClose={() => setPanel(false)} />}
      </div>
    </div>
  )
}
