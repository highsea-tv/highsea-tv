// SPDX-License-Identifier: AGPL-3.0-only
// The universal player on the phone, as Apple Music's and Spotify's iPhone apps have it: a mini
// player floating above the tab bar on every tab while music is queued (the cover, the song and
// the artist, Play or Pause and Next, with the song's progress along its foot), and tapping it
// opens Now playing over everything: the cover large, shrinking a little while paused as Apple
// Music's does, the song and the artist, the waveform to scrub, Shuffle, Previous, Play or Pause,
// Next and Repeat, the volume, then AirPlay and the queue (prototype-gaps.md › 3.4). ⋯ goes to the
// album or the artist, or stops the music; so does swiping the mini player down, as Spotify's.
import { Button, cn, Icon, Sheet, SheetContent, toast } from '@highsea-tv/ui'
import { useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { clock, useAirPlay } from '../client/data.ts'
import { playingFromLabel, repeatButton, useMusicPlayer } from '../client/music-player.ts'
import { MusicQueue } from '../client/music-queue.tsx'
import { Waveform } from '../client/waveform.tsx'
import { MobileScreen } from '../kit/mobile/device.tsx'
import { AirPlayPicker } from './player.tsx'
import { gutter, mobileHref } from './shell.tsx'

/** How far the mini player is swiped down before letting go stops the music, in px. */
const SWIPE_STOP = 40

/** The mini player's height and the space under it, so a tab's content scrolls clear of it. */
export const MINI_PLAYER = 64

export function MiniPlayer({ bottom }: { bottom: number }) {
  const p = useMusicPlayer()
  // swiped down past SWIPE_STOP and let go, the music stops; short of it, the player springs back
  const start = useRef<number | null>(null)
  const [drag, setDrag] = useState(0)
  const song = p.song
  if (!song) return null
  const end = () => {
    if (drag > SWIPE_STOP) {
      p.stop()
      toast({ title: 'Music stopped' })
    }
    start.current = null
    setDrag(0)
  }
  return (
    <section
      aria-label="Music player"
      style={{
        bottom: bottom + 8,
        height: MINI_PLAYER - 8,
        translate: `0 ${drag}px`,
        opacity: 1 - Math.min(drag, 80) / 120,
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') start.current = e.clientY
      }}
      onPointerMove={(e) => {
        if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current))
      }}
      onPointerUp={end}
      onPointerCancel={end}
      className={cn(
        'glass-bar absolute inset-x-2 z-20 touch-pan-x overflow-hidden rounded-[14px] border border-line shadow-3',
        drag === 0 &&
          'transition-[translate,opacity] duration-(--duration-spring) ease-(--ease-spring)',
      )}
    >
      <div
        data-player-controls=""
        className="grid h-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 ps-2 pe-1"
      >
        <a
          href={mobileHref('/now-playing')}
          aria-label={`Now playing: ${song.title}, ${song.album.artist.name}`}
          className="flex min-w-0 items-center gap-2.5 rounded-sm outline-none focus-visible:ring-focus"
        >
          <img src={song.album.cover} alt="" className="size-10 rounded-[6px] bg-s2 object-cover" />
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-[15px] leading-[1.2]">{song.title}</span>
            <span className="truncate text-[13px] text-text-2 leading-[1.2]">
              {song.album.artist.name}
            </span>
          </span>
        </a>
        <button
          type="button"
          aria-label={p.playing ? 'Pause' : 'Play'}
          onClick={p.toggle}
          className="grid size-11 cursor-pointer place-items-center rounded-full outline-none transition-press focus-visible:ring-focus active:scale-90"
        >
          <Icon name={p.playing ? 'pause' : 'play'} size={22} className="fill-current" />
        </button>
        <button
          type="button"
          aria-label="Next"
          disabled={!p.hasNext}
          onClick={p.next}
          className="grid size-11 cursor-pointer place-items-center rounded-full outline-none transition-press focus-visible:ring-focus active:scale-90 disabled:opacity-40"
        >
          <Icon name="next" size={22} className="fill-current" />
        </button>
      </div>
      {/* the song's progress along the foot; the waveform to scrub is in Now playing */}
      <span aria-hidden className="absolute start-3 end-3 bottom-0 h-0.5 rounded-full bg-text/15">
        <span
          className="block h-full rounded-full bg-accent"
          style={{ width: `${(p.position / Math.max(1, song.duration)) * 100}%` }}
        />
      </span>
    </section>
  )
}

const control =
  'grid cursor-pointer place-items-center rounded-full outline-none transition-press focus-visible:ring-focus active:scale-90 disabled:opacity-40'
/** Shuffle and Repeat; on, in the accent with a dot under them, so it isn't colour alone. */
const toggle = cn(control, 'relative size-11 text-text-2')
const on =
  'text-accent-text after:absolute after:bottom-0.5 after:size-1 after:rounded-full after:bg-current'
export const sheetAction =
  'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-start text-[16px] outline-none transition-press focus-visible:ring-focus active:bg-text/8'

export function MobileNowPlaying() {
  const p = useMusicPlayer()
  const [, navigate] = useLocation()
  const [more, setMore] = useState(false)
  const [queue, setQueue] = useState(false)
  const toolbarScreen = useAirPlay()
  const [speaker, setSpeaker] = useState<string | null | undefined>(undefined)
  const [picker, setPicker] = useState(false)
  const playingOn = speaker === undefined ? toolbarScreen : speaker
  const song = p.song
  const close = () => (history.length > 1 ? history.back() : navigate('/'))
  if (!song)
    return (
      <MobileScreen>
        <div className={cn('grid min-h-full place-content-center gap-4 text-center', gutter)}>
          <Icon name="music" size={40} className="mx-auto text-text-3" />
          <p className="font-semibold text-[20px]">Nothing’s playing</p>
          <p className="text-[15px] text-text-2">Choose an album or an artist in Music.</p>
          <a
            href={mobileHref('/library/music')}
            className="mx-auto rounded-sm text-[15px] text-accent-text outline-none focus-visible:ring-focus"
          >
            Music
          </a>
        </div>
      </MobileScreen>
    )
  const volume = p.muted ? 0 : p.volume
  return (
    <MobileScreen>
      <article
        aria-label="Now playing"
        className="relative isolate grid min-h-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
      >
        <img
          src={song.album.cover}
          alt=""
          className="-z-10 absolute inset-0 size-full scale-150 object-cover opacity-50 blur-[60px]"
        />
        <div className="-z-10 absolute inset-0 bg-bg/40" />
        <header
          className={cn('grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center', gutter)}
        >
          <Button
            variant="ghost"
            icon="chevron-down"
            iconOnly
            aria-label="Close Now playing"
            onClick={close}
          />
          {p.from?.to ? (
            <a
              href={mobileHref(p.from.to)}
              aria-label={playingFromLabel(p.from)}
              className="grid min-w-0 rounded-sm text-center outline-none focus-visible:ring-focus"
            >
              <span className="font-mono text-label text-text-3 uppercase">Playing from</span>
              <span className="truncate font-semibold text-[13px]">{p.from.name}</span>
            </a>
          ) : (
            <span className="grid min-w-0 text-center">
              <span className="font-mono text-label text-text-3 uppercase">Playing from</span>
              <span className="truncate font-semibold text-[13px]">
                {p.from?.kind === 'search' ? `Search: “${p.from.name}”` : song.album.title}
              </span>
            </span>
          )}
          <Button
            variant="ghost"
            icon="more"
            iconOnly
            aria-label="More"
            aria-haspopup="dialog"
            onClick={() => setMore(true)}
          />
        </header>
        <div className={cn('grid place-items-center py-4', gutter)}>
          <img
            src={song.album.cover}
            alt=""
            className={cn(
              'aspect-square w-[88%] rounded-[12px] bg-s2 object-cover shadow-[0_16px_40px_rgb(0_0_0/0.45)] transition-[scale] duration-(--duration-spring) ease-(--ease-spring)',
              !p.playing && 'scale-[0.86]',
            )}
          />
        </div>
        <div className={cn('grid gap-4 pb-4', gutter)}>
          <div className="grid min-w-0">
            <h1 className="truncate font-semibold text-[22px] leading-[1.2]">{song.title}</h1>
            <a
              href={mobileHref(`/music/artists/${song.album.artist.id}`)}
              className="justify-self-start truncate rounded-sm text-[18px] text-text-2 outline-none focus-visible:ring-focus"
            >
              {song.album.artist.name}
            </a>
          </div>
          <div className="grid gap-1.5">
            <Waveform
              key={song.id}
              loudness={song.loudness}
              position={p.position}
              duration={song.duration}
              playing={p.playing}
              onSeek={p.seekTo}
              label={`Position in ${song.title}`}
              bar={{ width: 3, gap: 2 }}
              className="h-12"
            />
            <div className="flex justify-between font-mono text-[12px] text-text-3">
              <span>{clock(p.position)}</span>
              <span>−{clock(song.duration - p.position)}</span>
            </div>
          </div>
          {/* the player's own transport (controls.md › Rules): round, over the cover's colour */}
          <div data-player-controls="" className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Shuffle"
              aria-pressed={p.shuffle}
              onClick={p.toggleShuffle}
              className={cn(toggle, p.shuffle && on)}
            >
              <Icon name="shuffle" size={22} />
            </button>
            <button
              type="button"
              aria-label="Previous"
              disabled={!p.hasPrevious}
              onClick={p.previous}
              className={cn(control, 'size-14')}
            >
              <Icon name="previous" size={34} className="fill-current" />
            </button>
            <button
              type="button"
              aria-label={p.playing ? 'Pause' : 'Play'}
              onClick={p.toggle}
              className={cn(control, 'size-[4.5rem] bg-text text-bg')}
            >
              <Icon name={p.playing ? 'pause' : 'play'} size={34} className="fill-current" />
            </button>
            <button
              type="button"
              aria-label="Next"
              disabled={!p.hasNext}
              onClick={p.next}
              className={cn(control, 'size-14')}
            >
              <Icon name="next" size={34} className="fill-current" />
            </button>
            <button
              type="button"
              aria-label={repeatButton[p.repeat].label}
              aria-pressed={p.repeat !== 'off'}
              onClick={p.cycleRepeat}
              className={cn(toggle, p.repeat !== 'off' && on)}
            >
              <Icon name={repeatButton[p.repeat].icon} size={22} />
            </button>
          </div>
          <div
            data-player-controls=""
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-text-3"
          >
            <Icon name="mute" size={16} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => p.setVolume(Number(e.target.value))}
              aria-label="Volume"
              aria-valuetext={`${Math.round(volume * 100)}%`}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none accent-[var(--color-text)] focus-visible:ring-focus"
              style={{
                background: `linear-gradient(90deg, var(--color-text) ${volume * 100}%, color-mix(in oklab, var(--color-text) 25%, transparent) 0)`,
              }}
            />
            <Icon name="sound" size={16} />
          </div>
          <div className="flex items-center justify-between">
            {/* where it plays shows in the accent beside it: the library's Button has no active look */}
            <Button
              variant="ghost"
              icon="airplay"
              iconOnly
              aria-label={playingOn ? `AirPlay: playing on ${playingOn}` : 'AirPlay'}
              aria-haspopup="dialog"
              onClick={() => setPicker(true)}
            />
            {playingOn && (
              <span className="truncate text-[13px] text-accent-text">{playingOn}</span>
            )}
            <Button
              variant="ghost"
              icon="queue"
              iconOnly
              aria-label={
                p.upNext[0] ? `Queue, up next: ${p.upNext[0].title}` : 'Queue, nothing up next'
              }
              aria-haspopup="dialog"
              onClick={() => setQueue(true)}
            />
          </div>
        </div>
        {picker && (
          <AirPlayPicker
            music
            current={playingOn}
            onPick={(next) => {
              setSpeaker(next)
              setPicker(false)
            }}
            onClose={() => setPicker(false)}
          />
        )}
      </article>
      <Sheet open={queue} onOpenChange={setQueue}>
        <SheetContent title="Queue">
          <MusicQueue href={mobileHref} size="mobile" onGo={() => setQueue(false)} />
        </SheetContent>
      </Sheet>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title={song.title} description={song.album.artist.name}>
          <div className="-mx-3 grid">
            <a
              href={mobileHref(`/music/albums/${song.album.id}`)}
              onClick={() => setMore(false)}
              className={sheetAction}
            >
              <Icon name="music" size={20} />
              Go to the album
            </a>
            <a
              href={mobileHref(`/music/artists/${song.album.artist.id}`)}
              onClick={() => setMore(false)}
              className={sheetAction}
            >
              <Icon name="user" size={20} />
              Go to the artist
            </a>
            <button
              type="button"
              onClick={() => {
                setMore(false)
                p.stop()
                close()
              }}
              className={sheetAction}
            >
              <Icon name="close" size={20} />
              Stop
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </MobileScreen>
  )
}
