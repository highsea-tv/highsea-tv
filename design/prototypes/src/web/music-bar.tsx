// SPDX-License-Identifier: AGPL-3.0-only
// The universal player on the web and desktop: a bar along the window's foot while music is
// queued, on every page, as Plex's, Emby's, Jellyfin's and Spotify's web players have one. At the
// left the cover, the song and the artist, each a link; in the middle Previous, Play or Pause and
// Next over the song's waveform, its scrubber, with the time gone and the time left either side;
// at the right the queue, the volume, then Close after a rule. Shuffle and Repeat sit either side
// of the controls, as Spotify's do, and the queue opens as a panel from the window's side (the
// shared client/music-queue.tsx). Narrow, Shuffle, Repeat and the volume go and the waveform runs
// the bar's width under the song. The bar is glass, as the top bar is when the page scrolls under
// it.
import { Button, cn, Icon, Sheet, SheetContent } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { clock } from '../client/data.ts'
import { repeatButton, useMusicPlayer } from '../client/music-player.ts'
import { MusicQueue } from '../client/music-queue.tsx'
import { Waveform } from '../client/waveform.tsx'
import { gutter, webHref } from './shell.tsx'

/** The bar's height on a wide window, so pages can keep their foot clear of it. */
export const MUSIC_BAR = 'pb-28 medium:pb-24'

export function MusicBar() {
  const p = useMusicPlayer()
  const [queue, setQueue] = useState(false)
  const song = p.song
  if (!song) return null
  const volume = p.muted ? 0 : p.volume
  return (
    <section
      aria-label="Music player"
      className="glass-bar fixed inset-x-0 bottom-0 z-30 border-line border-t"
    >
      <div
        className={cn(
          'mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 medium:h-24 medium:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] medium:py-0',
          gutter,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <a
            href={webHref(`/music/albums/${song.album.id}`)}
            aria-label={`${song.album.title}, the album`}
            className="shrink-0 rounded-sm outline-none focus-visible:ring-focus"
          >
            <img
              src={song.album.cover}
              alt=""
              className="size-12 rounded-sm bg-s2 object-cover shadow-2 medium:size-14"
            />
          </a>
          <div className="grid min-w-0">
            <a
              href={webHref(`/music/albums/${song.album.id}`)}
              className="truncate rounded-sm font-semibold text-body text-text outline-none hover:underline focus-visible:ring-focus"
            >
              {song.title}
            </a>
            <a
              href={webHref(`/music/artists/${song.album.artist.id}`)}
              className="truncate rounded-sm text-caption text-text-2 outline-none hover:text-text hover:underline focus-visible:ring-focus"
            >
              {song.album.artist.name}
            </a>
          </div>
        </div>

        <div className="col-span-2 row-start-2 grid gap-1 medium:col-span-1 medium:row-start-auto">
          <Controls wide className="hidden justify-center medium:flex" />
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <span className="w-10 text-end font-mono text-[12px] text-text-3">
              {clock(p.position)}
            </span>
            <Waveform
              key={song.id}
              loudness={song.loudness}
              position={p.position}
              duration={song.duration}
              playing={p.playing}
              onSeek={p.seekTo}
              label={`Position in ${song.title}`}
              className="h-8"
            />
            <span className="w-10 font-mono text-[12px] text-text-3">
              −{clock(song.duration - p.position)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1">
          <Controls className="flex medium:hidden" />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="queue"
            aria-label="Queue"
            aria-expanded={queue}
            onClick={() => setQueue(true)}
            className={cn(queue && 'text-accent-text')}
          />
          <div className="hidden items-center gap-1 medium:flex">
            <Button
              variant="ghost"
              size="sm"
              icon={volume === 0 ? 'mute' : 'sound'}
              aria-label={p.muted ? 'Unmute' : 'Mute'}
              onClick={p.toggleMute}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => p.setVolume(Number(e.target.value))}
              aria-label="Volume"
              aria-valuetext={`${Math.round(volume * 100)}%`}
              className="h-1 w-24 cursor-pointer appearance-none rounded-full outline-none accent-[var(--color-accent)] focus-visible:ring-focus"
              style={{
                background: `linear-gradient(90deg, var(--color-text) ${volume * 100}%, color-mix(in oklab, var(--color-text) 25%, transparent) 0)`,
              }}
            />
          </div>
          {/* Close stands apart from the volume, after a rule, so it reads as closing the bar */}
          <span aria-hidden className="ms-2 me-1 h-6 w-px bg-line" />
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            aria-label="Close the player"
            onClick={p.stop}
          />
        </div>
      </div>
      <Sheet open={queue} onOpenChange={setQueue}>
        <SheetContent side="right" title="Queue">
          <MusicQueue href={webHref} size="web" onGo={() => setQueue(false)} />
        </SheetContent>
      </Sheet>
    </section>
  )
}

const toggle =
  'relative grid size-9 cursor-pointer place-items-center rounded-full text-text-2 outline-none transition-tint hover:text-text focus-visible:ring-focus aria-pressed:text-accent-text'
/** On, a dot under the icon as well as the accent, so it doesn't rest on colour alone. */
const dot = (on: boolean) =>
  on && <span aria-hidden className="absolute bottom-0.5 size-1 rounded-full bg-accent" />

/** Shuffle, on or off. */
function ShuffleButton() {
  const p = useMusicPlayer()
  return (
    <button
      type="button"
      aria-label="Shuffle"
      aria-pressed={p.shuffle}
      onClick={p.toggleShuffle}
      className={toggle}
    >
      <Icon name="shuffle" size={17} />
      {dot(p.shuffle)}
    </button>
  )
}

/** Repeat: off, the queue, then the song. */
function RepeatButton() {
  const p = useMusicPlayer()
  const r = repeatButton[p.repeat]
  return (
    <button
      type="button"
      aria-label={r.label}
      aria-pressed={p.repeat !== 'off'}
      onClick={p.cycleRepeat}
      className={toggle}
    >
      <Icon name={r.icon} size={17} />
      {dot(p.repeat !== 'off')}
    </button>
  )
}

/** Previous, Play or Pause, and Next: Pause is the bar's one filled button, as it is in Spotify's. */
function Controls({ className, wide = false }: { className?: string; wide?: boolean }) {
  const p = useMusicPlayer()
  return (
    <div className={cn('items-center gap-2', className)}>
      {wide && <ShuffleButton />}
      <button
        type="button"
        aria-label="Previous"
        disabled={!p.hasPrevious}
        onClick={p.previous}
        className="grid size-9 cursor-pointer place-items-center rounded-full text-text-2 outline-none transition-tint hover:text-text focus-visible:ring-focus disabled:cursor-default disabled:opacity-40"
      >
        <Icon name="previous" size={18} className="fill-current" />
      </button>
      <button
        type="button"
        aria-label={p.playing ? 'Pause' : 'Play'}
        onClick={p.toggle}
        className="grid size-10 cursor-pointer place-items-center rounded-full bg-text text-bg outline-none transition-press focus-visible:ring-focus active:scale-95"
      >
        <Icon name={p.playing ? 'pause' : 'play'} size={18} className="fill-current" />
      </button>
      <button
        type="button"
        aria-label="Next"
        disabled={!p.hasNext}
        onClick={p.next}
        className="grid size-9 cursor-pointer place-items-center rounded-full text-text-2 outline-none transition-tint hover:text-text focus-visible:ring-focus disabled:cursor-default disabled:opacity-40"
      >
        <Icon name="next" size={18} className="fill-current" />
      </button>
      {wide && <RepeatButton />}
    </div>
  )
}
