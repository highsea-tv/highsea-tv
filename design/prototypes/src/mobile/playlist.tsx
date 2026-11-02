// SPDX-License-Identifier: AGPL-3.0-only
// A playlist on the phone (prototype-gaps.md › 3.8), laid out as an album's page: Back over the
// first cover blurred, the mosaic of its first four covers centred, the name, the count and
// length, Play and Shuffle side by side, and ⋯ (Rename, Delete). Then its songs in its order,
// dragged by their handles to reorder them, as Apple Music's iPhone playlists are, each with the
// song's ⋯ and Remove from this playlist in it. Deleting asks first; the songs stay in the library.
import {
  Button,
  cn,
  EmptyState,
  Icon,
  Sheet,
  SheetContent,
  Skeleton,
  SortableList,
} from '@highsea-tv/ui'
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useMusicPlayer, usePlayingFrom } from '../client/music-player.ts'
import { PlaylistMosaic, PlaylistNameForm } from '../client/playlist-picker.tsx'
import { playlistSummary, usePlaylist, usePlaylistEdits } from '../client/playlists.ts'
import { MobileSongRow } from './music-lists.tsx'
import { sheetAction } from './now-playing.tsx'
import { BackBadge, gutter, mobileHref } from './shell.tsx'
import { MoreButton } from './song-menu.tsx'

export function MobilePlaylist() {
  const { id } = useParams<{ id: string }>()
  const found = usePlaylist(id)
  const edits = usePlaylistEdits(id, found.data)
  const player = useMusicPlayer()
  const path = `/music/playlists/${id}`
  const whole = usePlayingFrom(path)
  const [, navigate] = useLocation()
  // the playlist's menu, then the sheet it led to
  const [sheet, setSheet] = useState<'menu' | 'rename' | 'delete' | null>(null)
  const back = <BackBadge fallback="/library/music/playlists" />
  if (found.status === 'loading')
    return (
      <div aria-busy className="relative grid gap-7 pb-6">
        {back}
        <div className={cn('grid justify-items-center gap-2 pt-14 text-center', gutter)}>
          <Skeleton className="mb-3 aspect-square w-[62%] rounded-poster" />
          <Skeleton className="my-1 h-6 w-3/5" />
          <Skeleton className="my-0.5 h-3.5 w-1/3" />
        </div>
      </div>
    )
  if (found.status === 'error')
    return (
      <div className={cn('grid min-h-full place-items-center py-16', gutter)}>
        {back}
        <EmptyState
          icon="queue"
          tone="error"
          title="This playlist isn’t here"
          action={
            <Button asChild>
              <a href={mobileHref('/library/music/playlists')}>Playlists</a>
            </Button>
          }
        >
          It may have been deleted.
        </EmptyState>
      </div>
    )
  const { playlist: p } = found.data
  const songs = edits.songs
  const from = { kind: 'playlist' as const, name: p.name, to: path }
  const play = (start = 0, shuffle = false) =>
    player.play({ playlist: id }, { start, shuffle, from })
  const fromHere = player.from?.to === path
  const close = () => setSheet(null)
  return (
    <article aria-labelledby="title" className="relative grid gap-7 pb-6">
      {back}
      <header className="relative isolate overflow-hidden">
        {p.covers[0] && (
          <img
            src={p.covers[0]}
            alt=""
            className="-z-10 absolute inset-0 size-full scale-125 object-cover opacity-45 blur-[40px]"
          />
        )}
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_75%)]" />
        <div className={cn('grid justify-items-center gap-1.5 pt-14 pb-2 text-center', gutter)}>
          <PlaylistMosaic
            covers={p.covers}
            className="mb-3 w-[62%] rounded-poster shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
          />
          <p className="font-mono text-label text-text-3 uppercase">Playlist</p>
          <h1 id="title" className="font-semibold text-[24px] leading-[1.15] tracking-display">
            {p.name}
          </h1>
          <p className="text-[13px] text-text-3">{playlistSummary(p.songs, p.duration)}</p>
        </div>
        <div className={cn('grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 pt-3', gutter)}>
          <Button
            variant="primary"
            icon={whole?.playing ? 'pause' : 'play'}
            className="justify-center"
            disabled={songs.length === 0}
            onClick={() => (whole ? player.toggle() : play())}
          >
            {whole?.playing ? 'Pause' : 'Play'}
          </Button>
          <Button
            icon="shuffle"
            className="justify-center"
            disabled={songs.length === 0}
            onClick={() => play(0, true)}
          >
            Shuffle
          </Button>
          <MoreButton name={p.name} onClick={() => setSheet('menu')} />
        </div>
      </header>
      <section aria-label="Songs" className={cn('grid gap-3', gutter)}>
        {songs.length === 0 ? (
          <EmptyState
            icon="music"
            title="Nothing here yet"
            action={
              <Button asChild>
                <a href={mobileHref('/library/music/songs')}>Songs</a>
              </Button>
            }
          >
            Add songs with Add to playlist, in a song’s or an album’s menu.
          </EmptyState>
        ) : (
          <SortableList
            aria-label={`${p.name}’s songs`}
            items={songs}
            id={(s) => s.entry}
            label={(s) => s.title}
            onChange={edits.reorder}
            className="grid"
          >
            {(s, handle) => {
              const i = songs.indexOf(s)
              const here = fromHere && player.index === i
              return (
                <MobileSongRow
                  as="div"
                  song={s}
                  here={here}
                  playing={player.playing}
                  handle={handle}
                  onPlay={() => (here ? player.toggle() : play(i))}
                  onRemove={() => edits.remove(s)}
                />
              )
            }}
          </SortableList>
        )}
      </section>
      <Sheet open={sheet !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent
          title={
            sheet === 'rename'
              ? 'Rename playlist'
              : sheet === 'delete'
                ? `Delete ${p.name}?`
                : p.name
          }
          description={
            sheet === 'delete'
              ? 'Its songs stay in the library. This can’t be undone.'
              : sheet === 'menu'
                ? playlistSummary(p.songs, p.duration)
                : undefined
          }
          footer={
            sheet === 'delete' ? (
              <>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await edits.delete()
                    close()
                    navigate('/library/music/playlists', { replace: true })
                  }}
                >
                  Delete playlist
                </Button>
              </>
            ) : undefined
          }
        >
          {sheet === 'menu' && (
            <div className="-mx-3 grid">
              <button type="button" onClick={() => setSheet('rename')} className={sheetAction}>
                <Icon name="edit" size={20} />
                Rename
              </button>
              <button
                type="button"
                onClick={() => setSheet('delete')}
                className={cn(sheetAction, 'text-danger')}
              >
                <Icon name="delete" size={20} />
                Delete playlist
              </button>
            </div>
          )}
          {sheet === 'rename' && (
            <PlaylistNameForm
              initial={p.name}
              submit="Rename"
              onCancel={close}
              onDone={(name) => {
                close()
                void edits.rename(name)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </article>
  )
}
