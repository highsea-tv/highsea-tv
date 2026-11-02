// SPDX-License-Identifier: AGPL-3.0-only
// The queue (prototype-gaps.md › 3.4), on the web and desktop's panel from the music bar and the
// phone's sheet from Now playing, as Apple Music's and Spotify's are: what it's playing from, the
// song playing, then Up next, reordered by its handles and each with Remove, and Clear. A song in
// Up next plays from there.
import { Button, cn, SortableList } from '@highsea-tv/ui'
import { clock } from './data.ts'
import { playingFromLabel, type QueueEntry, useMusicPlayer } from './music-player.ts'

export function MusicQueue({
  href,
  size,
  onGo,
}: {
  /** The app's href for a path on its routes. */
  href: (path: string) => string
  size: 'web' | 'mobile'
  /** A link was followed, so the panel or the sheet closes. */
  onGo?: () => void
}) {
  const p = useMusicPlayer()
  const song = p.song
  if (!song) return null
  const big = size === 'mobile'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {p.from && (
        <p className={cn('text-text-2', big ? 'text-[15px]' : 'text-caption')}>
          {p.from.to ? (
            <a
              href={href(p.from.to)}
              onClick={onGo}
              className="rounded-sm outline-none hover:text-text hover:underline focus-visible:ring-focus"
            >
              {playingFromLabel(p.from)}
            </a>
          ) : (
            playingFromLabel(p.from)
          )}
        </p>
      )}
      <section aria-labelledby="queue-now" className="grid gap-2">
        <h3 id="queue-now" className="font-mono text-label text-text-3 uppercase">
          Now playing
        </h3>
        <SongLine song={song} big={big} current />
      </section>
      <section aria-labelledby="queue-next" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <div className="flex items-center justify-between gap-3">
          <h3 id="queue-next" className="font-mono text-label text-text-3 uppercase">
            Up next
          </h3>
          {p.upNext.length > 0 && (
            <Button size="sm" variant="ghost" onClick={p.clearUpNext} className="-me-2">
              Clear
            </Button>
          )}
        </div>
        {p.upNext.length === 0 ? (
          <p className={cn('text-text-3', big ? 'text-[15px]' : 'text-caption')}>
            Nothing after this song. Add to queue, in a song’s menu, lines one up.
          </p>
        ) : (
          <SortableList
            aria-label="Up next"
            items={p.upNext}
            id={(x) => x.key}
            label={(x) => x.title}
            onChange={(next) => p.reorder(next.map((x) => x.key))}
            className="grid gap-1"
            itemClassName="rounded-md"
          >
            {(x, handle) => (
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                {handle}
                <button
                  type="button"
                  onClick={() => p.jump(p.queue.findIndex((e) => e.key === x.key))}
                  aria-label={`Play ${x.title} now`}
                  className="min-w-0 cursor-pointer rounded-sm text-start outline-none focus-visible:ring-focus"
                >
                  <SongLine song={x} big={big} />
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconOnly
                  icon="close"
                  aria-label={`Remove ${x.title} from the queue`}
                  onClick={() => p.remove(x.key)}
                />
              </div>
            )}
          </SortableList>
        )}
      </section>
    </div>
  )
}

function SongLine({ song, big, current }: { song: QueueEntry; big: boolean; current?: boolean }) {
  return (
    <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
      <img
        src={song.album.cover}
        alt=""
        className={cn('rounded-[6px] bg-s2 object-cover', big ? 'size-12' : 'size-10')}
      />
      <span className="grid min-w-0">
        <span
          className={cn(
            'truncate font-semibold',
            big ? 'text-[16px]' : 'text-body',
            current && 'text-accent-text',
          )}
        >
          {song.title}
        </span>
        <span className={cn('truncate text-text-2', big ? 'text-[14px]' : 'text-caption')}>
          {song.album.artist.name} · {song.album.title}
        </span>
      </span>
      <span className="font-mono text-[12px] text-text-3">{clock(song.duration)}</span>
    </span>
  )
}
