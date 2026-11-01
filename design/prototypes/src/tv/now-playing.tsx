// SPDX-License-Identifier: AGPL-3.0-only
// The universal player on the TV. A bar along the screen's foot would sit under the rows the
// D-pad moves through, so the TV does as the Apple TV's Music app does: while music is queued,
// Now playing joins the head beside Alerts (the song's cover with the playing mark), and it opens
// a screen of its own: the cover blurred behind everything, the cover large at the left, the
// song, the artist and the album, the waveform to scrub with Left and Right, Previous, Play or
// Pause and Next between Shuffle and Repeat, the album, the artist and Stop, and Up next as a row
// under them (prototype-gaps.md › 3.4): OK plays a song there now, OK held offers Remove.
// Play/Pause on the remote plays and pauses the music from anywhere but the film player.
import { cn, Icon, type IconName } from '@highsea-tv/ui-web'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useLongPress } from '../client/continue-menu.ts'
import { clock } from '../client/data.ts'
import {
  musicPlayer,
  playingFromLabel,
  type QueueEntry,
  repeatButton,
  useMusicPlayer,
} from '../client/music-player.ts'
import { PlayingBars, Waveform } from '../client/waveform.tsx'
import { TvButton, TvHead, TvMessage, tvHref, useInitialFocus } from './kit.tsx'
import { TvMenu } from './song-menu.tsx'

/** Left and Right on the TV's scrubber, in seconds: further than a pointer's, as the film's is. */
const TV_SEEK_S = 10

/** Now playing in the head, while music is queued: the cover and the playing mark. */
export function NowPlayingTab({ current }: { current: boolean }) {
  const p = useMusicPlayer()
  const song = p.song
  if (!song) return null
  return (
    <a
      href={tvHref('/now-playing')}
      data-focusable=""
      aria-label={`Now playing: ${song.title}, ${song.album.artist.name}`}
      aria-current={current ? 'page' : undefined}
      className="flex h-[2.6cqw] items-center gap-[0.7cqw] rounded-full bg-text/12 ps-[0.3cqw] pe-[1cqw] text-(length:--tv-text-button) text-text outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg"
    >
      <img src={song.album.cover} alt="" className="size-[2cqw] rounded-full bg-s2 object-cover" />
      <PlayingBars playing={p.playing} />
    </a>
  )
}

/** Play/Pause on the remote plays and pauses the music, but not over a film. */
export function useMusicKeys() {
  const [location] = useLocation()
  useEffect(() => {
    if (location.startsWith('/play/')) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'MediaPlayPause' || musicPlayer.get().queue.length === 0) return
      e.preventDefault()
      musicPlayer.toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [location])
}

const round =
  'grid place-items-center rounded-full outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg disabled:opacity-40'

function Control({
  icon,
  label,
  big = false,
  initial = false,
  pressed,
  ...props
}: {
  icon: IconName
  label: string
  big?: boolean
  initial?: boolean
  /** Shuffle and Repeat: on, in the accent with a dot under it, so it isn't colour alone. */
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      {...(props.disabled
        ? {}
        : { 'data-focusable': '', ...(initial ? { 'data-initial': '' } : {}) })}
      className={cn(
        round,
        'relative',
        big ? 'size-[5cqw] bg-text/12' : 'size-[3.6cqw] text-text',
        pressed && 'text-accent-text',
      )}
      {...props}
    >
      <Icon
        name={icon}
        size={32}
        className={cn(
          pressed === undefined && 'fill-current',
          big ? 'size-[2cqw]' : 'size-[1.6cqw]',
        )}
      />
      {pressed && (
        <span
          aria-hidden
          className="absolute bottom-[0.3cqw] size-[0.3cqw] rounded-full bg-current"
        />
      )}
    </button>
  )
}

export function TvNowPlaying() {
  const p = useMusicPlayer()
  const song = p.song
  const scrubber = useRef<HTMLDivElement>(null)
  const [, navigate] = useLocation()
  useInitialFocus(!!song)
  const stop = () => {
    musicPlayer.stop()
    history.length > 1 ? history.back() : navigate('/music')
  }

  // the scrubber keeps Left and Right for seeking, and OK for play/pause, as the film's does; on
  // the element, so it runs before the navigator on the TV's root
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scrubber is drawn once there's a song
  useEffect(() => {
    const el = scrubber.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        musicPlayer.seekBy(e.key === 'ArrowLeft' ? -TV_SEEK_S : TV_SEEK_S)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        musicPlayer.toggle()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [song?.id])

  if (!song)
    return (
      <>
        <TvHead down="message" exact className="absolute inset-x-0 top-0 z-10 px-(--tv-safe-x)" />
        <div data-group="message" data-go-up="nav" className="h-full">
          <TvMessage
            title="Nothing’s playing"
            actions={
              <TvButton primary initial icon="music" href={tvHref('/music')}>
                Music
              </TvButton>
            }
          >
            Choose an album or an artist in Music.
          </TvMessage>
        </div>
      </>
    )
  const fraction = p.position / Math.max(1, song.duration)
  return (
    <>
      <img
        src={song.album.cover}
        alt=""
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-[3cqw] brightness-[0.45]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_0%,transparent_70%)] opacity-70" />
      <main
        aria-label="Now playing"
        className="absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <TvHead down="controls" exact className="px-(--tv-safe-x)" />
        <div className="grid min-h-0 grid-cols-[24cqw_minmax(0,1fr)] items-center gap-[4cqw] px-(--tv-safe-x) pb-[1.6cqw]">
          <img
            src={song.album.cover}
            alt=""
            className={cn(
              'aspect-square w-full rounded-(--tv-radius-poster) bg-s1 object-cover shadow-[0_1.5cqw_4cqw_rgb(0_0_0/0.5)] transition-[scale] duration-(--duration-spring) ease-(--ease-spring)',
              !p.playing && 'scale-[0.9]',
            )}
          />
          <div className="grid min-w-0 gap-[1.6cqw]">
            <div className="grid min-w-0 gap-[0.4cqw]">
              <p className="truncate font-mono text-(length:--tv-text-pill) text-text-3 uppercase">
                {song.album.title}
              </p>
              <h1 className="truncate font-semibold text-[3cqw] leading-[1.05] tracking-display">
                {song.title}
              </h1>
              <p className="truncate text-(length:--tv-text-meta) text-text-2">
                {song.album.artist.name}
              </p>
            </div>
            <div className="grid gap-[0.6cqw]">
              <div
                ref={scrubber}
                role="slider"
                tabIndex={-1}
                data-focusable=""
                data-group="scrub"
                data-go-down="controls"
                data-go-up="nav"
                aria-label={`Position in ${song.title}`}
                aria-valuemin={0}
                aria-valuemax={Math.round(song.duration)}
                aria-valuenow={Math.round(p.position)}
                aria-valuetext={`${clock(p.position)} of ${clock(song.duration)}`}
                className="group/scrub relative rounded-[0.6cqw] p-[0.6cqw] outline-none transition-lift focus-visible:bg-text/12"
              >
                <Waveform
                  key={song.id}
                  loudness={song.loudness}
                  position={p.position}
                  duration={song.duration}
                  playing={p.playing}
                  bar={{ count: 96 }}
                  className="h-[5cqw] gap-[0.25cqw]"
                />
                {/* the playhead shows while the scrubber has focus, so Left and Right read as moving it */}
                <span
                  aria-hidden
                  className="absolute inset-y-[0.2cqw] w-[0.2cqw] -translate-x-1/2 rounded-full bg-text opacity-0 transition-opacity group-focus-visible/scrub:opacity-100"
                  style={{ left: `calc(0.6cqw + ${fraction} * (100% - 1.2cqw))` }}
                />
              </div>
              <div className="flex justify-between px-[0.6cqw] font-mono text-(length:--tv-text-meta) text-text-2">
                <span>{clock(p.position)}</span>
                <span>−{clock(song.duration - p.position)}</span>
              </div>
            </div>
            <div
              data-group="controls"
              data-go-up="scrub"
              {...(p.upNext.length > 0 ? { 'data-go-down': 'upnext' } : {})}
              className="flex items-center gap-[1.2cqw]"
            >
              <Control
                icon="shuffle"
                label="Shuffle"
                pressed={p.shuffle}
                onClick={p.toggleShuffle}
              />
              <Control
                icon="previous"
                label="Previous"
                disabled={!p.hasPrevious}
                onClick={p.previous}
              />
              <Control
                icon={p.playing ? 'pause' : 'play'}
                label={p.playing ? 'Pause' : 'Play'}
                big
                initial
                onClick={p.toggle}
              />
              <Control icon="next" label="Next" disabled={!p.hasNext} onClick={p.next} />
              <Control
                icon={repeatButton[p.repeat].icon}
                label={repeatButton[p.repeat].label}
                pressed={p.repeat !== 'off'}
                onClick={p.cycleRepeat}
              />
              <span className="ms-[1cqw] flex gap-[0.8cqw]">
                <TvButton icon="music" href={tvHref(`/music/albums/${song.album.id}`)}>
                  Album
                </TvButton>
                <TvButton icon="user" href={tvHref(`/music/artists/${song.album.artist.id}`)}>
                  Artist
                </TvButton>
                {/* Stop closes the player: Now playing leaves the head */}
                <TvButton icon="close" onClick={stop}>
                  Stop
                </TvButton>
              </span>
            </div>
          </div>
        </div>
        <UpNext />
      </main>
    </>
  )
}

/** Up next, as a row of covers under the controls; OK plays a song now, OK held offers Remove. */
function UpNext() {
  const p = useMusicPlayer()
  const [menu, setMenu] = useState<QueueEntry | null>(null)
  if (p.upNext.length === 0)
    return (
      <p className="px-(--tv-safe-x) pb-(--tv-safe-y) text-(length:--tv-text-pill) text-text-3">
        {p.from ? `${playingFromLabel(p.from)} · ` : ''}The last song in the queue
      </p>
    )
  return (
    <section aria-label="Up next" className="grid gap-[0.8cqw] pb-(--tv-safe-y)">
      <p className="px-(--tv-safe-x) font-mono text-(length:--tv-text-pill) text-text-3 uppercase">
        Up next{p.from ? ` · ${playingFromLabel(p.from)}` : ''}
      </p>
      <ul
        data-group="upnext"
        data-go-up="controls"
        className="flex gap-[1.2cqw] overflow-hidden px-(--tv-safe-x) py-[0.4cqw]"
      >
        {p.upNext.slice(0, 10).map((x) => (
          <UpNextSong key={x.key} song={x} onMenu={setMenu} />
        ))}
      </ul>
      {menu && (
        <TvMenu
          name={menu.title}
          line={`${menu.album.artist.name} · ${menu.album.title}`}
          items={[
            {
              icon: 'play',
              label: 'Play now',
              run: () => musicPlayer.jump(p.queue.findIndex((e) => e.key === menu.key)),
            },
            {
              icon: 'remove',
              label: 'Remove from the queue',
              run: () => {
                // focus goes to the song after it, or before it, or to the controls
                const tile = document.querySelector(`[data-queue="${menu.key}"]`)
                const to = tile?.nextElementSibling ?? tile?.previousElementSibling
                musicPlayer.remove(menu.key)
                requestAnimationFrame(() =>
                  (
                    to?.querySelector<HTMLElement>('[data-focusable]') ??
                    document.querySelector<HTMLElement>('[data-group="controls"] [data-initial]')
                  )?.focus({ preventScroll: true }),
                )
              },
            },
          ]}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  )
}

function UpNextSong({ song, onMenu }: { song: QueueEntry; onMenu: (s: QueueEntry) => void }) {
  const press = useLongPress(() => onMenu(song))
  return (
    <li data-queue={song.key} className="w-[9cqw] shrink-0">
      <button
        type="button"
        data-focusable=""
        aria-label={`${song.title}, ${song.album.artist.name}. Hold OK for more.`}
        onClick={() =>
          musicPlayer.jump(musicPlayer.get().queue.findIndex((e) => e.key === song.key))
        }
        {...press}
        className="group/song grid w-full gap-[0.5cqw] text-start outline-none"
      >
        <img
          src={song.album.cover}
          alt=""
          className="aspect-square w-full rounded-(--tv-radius-poster) bg-s1 object-cover transition-lift group-focus-visible/song:scale-(--scale-poster) group-focus-visible/song:ring-focus"
        />
        <span className="truncate text-(length:--tv-text-pill) text-text-2 group-focus-visible/song:text-text">
          {song.title}
        </span>
      </button>
    </li>
  )
}
