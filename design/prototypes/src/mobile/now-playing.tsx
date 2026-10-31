// SPDX-License-Identifier: AGPL-3.0-only
// The universal player on the phone, as Apple Music's and Spotify's iPhone apps have it: a mini
// player floating above the tab bar on every tab while music is queued (the cover, the song and
// the artist, Play or Pause and Next, with the song's progress along its foot), and tapping it
// opens Now playing over everything: the cover large, shrinking a little while paused as Apple
// Music's does, the song and the artist, the waveform to scrub, Previous, Play or Pause and Next,
// the volume, and what's up next.
import { cn, Icon } from '@highsea-tv/ui-web'
import { useLocation } from 'wouter'
import { clock } from '../client/data.ts'
import { useMusicPlayer } from '../client/music-player.ts'
import { Waveform } from '../client/waveform.tsx'
import { MobileScreen } from '../kit/mobile/device.tsx'
import { gutter, mobileHref } from './shell.tsx'

/** The mini player's height and the space under it, so a tab's content scrolls clear of it. */
export const MINI_PLAYER = 64

export function MiniPlayer({ bottom }: { bottom: number }) {
  const p = useMusicPlayer()
  const song = p.song
  if (!song) return null
  return (
    <section
      aria-label="Music player"
      style={{ bottom: bottom + 8, height: MINI_PLAYER - 8 }}
      className="glass-bar absolute inset-x-2 z-20 overflow-hidden rounded-[14px] border border-line shadow-3"
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 ps-2 pe-1">
        <a
          href={mobileHref('/now-playing')}
          aria-label={`Now playing: ${song.title}, ${song.album.artist.name}`}
          className="flex min-w-0 items-center gap-2.5 rounded-sm outline-none focus-visible:ring-focus"
        >
          <img src={song.album.cover} alt="" className="size-10 rounded-[6px] bg-s2 object-cover" />
          <span className="grid min-w-0">
            <span className="truncate font-semibold text-[15px] leading-tight">{song.title}</span>
            <span className="truncate text-[13px] text-text-2 leading-tight">
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

export function MobileNowPlaying() {
  const p = useMusicPlayer()
  const [, navigate] = useLocation()
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
          <button
            type="button"
            aria-label="Close Now playing"
            onClick={close}
            className={cn(control, 'size-11')}
          >
            <Icon name="chevron-down" size={26} />
          </button>
          <a
            href={mobileHref(`/music/albums/${song.album.id}`)}
            className="grid min-w-0 rounded-sm text-center outline-none focus-visible:ring-focus"
          >
            <span className="font-mono text-label text-text-3 uppercase">Playing from</span>
            <span className="truncate font-semibold text-[13px]">{song.album.title}</span>
          </a>
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
            <h1 className="truncate font-semibold text-[22px] leading-tight">{song.title}</h1>
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
          <div className="flex items-center justify-center gap-8">
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
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-text-3">
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
          <p className="truncate text-center text-[13px] text-text-3">
            {p.upNext ? `Up next: ${p.upNext.title}` : 'The last song in the queue'}
          </p>
        </div>
      </article>
    </MobileScreen>
  )
}
