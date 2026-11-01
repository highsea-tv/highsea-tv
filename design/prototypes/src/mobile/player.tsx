// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player chrome, mobile (docs/product/player.md#mobile). The player is landscape: the phone
// frame stays portrait, so the prototype turns the player a quarter turn inside it, as the phone
// would be held. A tap shows or hides the chrome; skip back and forward sit beside Play, in thumb
// reach; Audio and subtitles opens the same panel as the web, sized for touch. AirPlay (4.5a)
// sends the film to another screen: iOS lists the screens, and while it plays there the phone
// shows where, over the artwork, with the controls kept up.
import { Button, cn, EmptyState, Icon } from '@highsea-tv/ui-web'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { clock, useAirPlay } from '../client/data.ts'
import { HIDE_MS, leavePlayer, playNext, SEEK_S, usePlayer } from '../client/player.ts'
import { NextUp, StreamMessage, StreamWaiting } from '../client/stream-states.tsx'
import { PHONE } from '../kit/mobile/device.tsx'
import { CueLine, Scrubber, TracksPanel, webStreamAction } from '../web/player.tsx'
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
  // the screen it plays on: the toolbar sets where it starts, the button changes it
  const toolbarScreen = useAirPlay()
  const [screen, setScreen] = useState(toolbarScreen)
  const [picker, setPicker] = useState(false)
  useEffect(() => setScreen(toolbarScreen), [toolbarScreen])

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
  const waiting = player.stream === 'preparing' || player.stream === 'buffering'
  // a message over the frame has the screen to itself
  const message = player.stream === 'failed' || player.stream === 'stopped'
  const chrome = (shown || !player.playing || panel || waiting || screen !== null) && !message
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
          {d && (
            <img
              src={d.item.art.still}
              alt=""
              className={cn('size-full object-cover', screen && 'opacity-35 blur-[2px]')}
            />
          )}
        </button>
        <h1 className="sr-only">Playing {d?.item.title ?? ''}</h1>
        {screen ? (
          <p className="pointer-events-none absolute inset-x-0 top-[19%] grid justify-items-center gap-1 text-center text-[#ededee]">
            <span className="flex items-center gap-2 font-semibold text-[17px]">
              <Icon name="airplay" size={20} />
              Playing on {screen}
            </span>
            <span className="text-[#ededee]/70 text-[13px]">
              The controls here still work. Subtitles show on {screen}.
            </span>
          </p>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-[14%]">
            <CueLine player={player} />
          </div>
        )}

        {chrome && (
          <div className="absolute inset-0 bg-[rgb(0_0_0/0.45)]">
            <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-12 pt-4">
              <button
                type="button"
                aria-label="Back to details"
                onClick={() => leavePlayer(navigate, `/movies/${id}`)}
                className={`${round} size-11`}
              >
                <Icon name="chevron-down" size={24} />
              </button>
              <span className="truncate font-semibold text-[#ededee] text-[17px]">
                {d?.item.title}
              </span>
              <button
                type="button"
                aria-label={screen ? `AirPlay: playing on ${screen}` : 'AirPlay'}
                aria-haspopup="dialog"
                onClick={() => setPicker(true)}
                className={cn(round, 'ms-auto size-11', screen && 'text-accent-text')}
              >
                <Icon name="airplay" size={22} />
              </button>
              <button
                type="button"
                aria-label="Audio and subtitles"
                aria-expanded={panel}
                onClick={() => setPanel(true)}
                className={`${round} size-11`}
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
        {picker && (
          <AirPlayPicker
            current={screen}
            onPick={(next) => {
              setScreen(next)
              setPicker(false)
              wake()
            }}
            onClose={() => setPicker(false)}
          />
        )}
        <StreamWaiting player={player} size="mobile" />
        <StreamMessage
          player={player}
          size="mobile"
          action={webStreamAction}
          onBack={() => leavePlayer(navigate, `/movies/${id}`)}
        />
        <NextUp
          player={player}
          next={d?.related[0]}
          size="mobile"
          action={webStreamAction}
          onPlay={(next) => playNext(navigate, next)}
        />
      </div>
    </div>
  )
}

/**
 * Stands in for iOS's own AirPlay list (AVRoutePickerView), which the app doesn't draw: the
 * phone, then the screens on the network.
 */
function AirPlayPicker({
  current,
  onPick,
  onClose,
}: {
  current: string | null
  onPick: (screen: string | null) => void
  onClose: () => void
}) {
  const screens: { name: string | null; label: string; icon: 'phone' | 'tv' }[] = [
    { name: null, label: 'iPhone', icon: 'phone' },
    { name: 'Living room TV', label: 'Living room TV', icon: 'tv' },
  ]
  return (
    <div className="absolute inset-0 grid place-items-center bg-[rgb(0_0_0/0.5)]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-label="AirPlay"
        className="relative grid w-72 gap-1 rounded-[14px] bg-[rgb(40_40_44/0.92)] p-2 text-[#ededee] backdrop-blur-xl"
      >
        <p className="px-3 pt-2 pb-1 text-center font-semibold text-[13px] text-[#ededee]/70">
          AirPlay
        </p>
        {screens.map((x) => (
          <button
            key={x.label}
            type="button"
            onClick={() => onPick(x.name)}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-start text-[15px] outline-none hover:bg-[rgb(255_255_255/0.08)] focus-visible:ring-focus"
          >
            <Icon name={x.icon} size={20} />
            <span className="flex-1">{x.label}</span>
            {current === x.name && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>
    </div>
  )
}
