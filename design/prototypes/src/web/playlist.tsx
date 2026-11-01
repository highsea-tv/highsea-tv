// SPDX-License-Identifier: AGPL-3.0-only
// A playlist on the web and desktop (prototype-gaps.md › 3.8), laid out as an album's page: the
// first cover blurred behind the header, the mosaic of its first four covers, the name, the count
// and length, Play, Shuffle and ⋯ (Rename and Delete). Then its songs in its order, dragged by
// their handles to reorder them, as Apple Music's and Spotify's playlists are, each with the
// song's ⋯ menu and Remove from this playlist in it. Deleting asks first; the songs stay in the
// library.
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  EmptyState,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Skeleton,
  SortableList,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useMusicPlayer, usePlayingFrom } from '../client/music-player.ts'
import { PlaylistMosaic, PlaylistNameForm } from '../client/playlist-picker.tsx'
import { playlistSummary, usePlaylist, usePlaylistEdits } from '../client/playlists.ts'
import { SongButton } from './music-lists.tsx'
import { gutter, webHref } from './shell.tsx'
import { WebSongMenu } from './song-menu.tsx'

export function WebPlaylist() {
  const { id } = useParams<{ id: string }>()
  const found = usePlaylist(id)
  const edits = usePlaylistEdits(id, found.data)
  const player = useMusicPlayer()
  const path = `/music/playlists/${id}`
  const whole = usePlayingFrom(path)
  const [, navigate] = useLocation()
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  if (found.status === 'loading') return <PlaylistSkeleton />
  if (found.status === 'error')
    return (
      <main className="grid min-h-[70vh] place-items-center px-4">
        <EmptyState
          icon="queue"
          tone="error"
          title="This playlist isn’t here"
          action={
            <Button variant="primary" asChild>
              <a href={webHref('/music/playlists')}>Playlists</a>
            </Button>
          }
        >
          It may have been deleted.
        </EmptyState>
      </main>
    )
  const { playlist: p } = found.data
  const songs = edits.songs
  const from = { kind: 'playlist' as const, name: p.name, to: path }
  const play = (start = 0, shuffle = false) =>
    player.play({ playlist: id }, { start, shuffle, from })
  const fromHere = player.from?.to === path
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-16">
      <header className="relative isolate overflow-hidden medium:-mt-20">
        {p.covers[0] && (
          <img
            src={p.covers[0]}
            alt=""
            className="-z-10 absolute inset-0 size-full scale-110 object-cover opacity-45 blur-[40px]"
          />
        )}
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_70%)]" />
        <div
          className={cn(
            'mx-auto grid w-full max-w-[1680px] items-end gap-x-10 gap-y-6 pt-28 pb-10 medium:grid-cols-[auto_minmax(0,1fr)]',
            gutter,
          )}
        >
          <PlaylistMosaic
            covers={p.covers}
            className="w-[min(16rem,70vw)] rounded-poster shadow-[0_8px_32px_rgb(0_0_0/0.35)] medium:w-64"
          />
          <div className="grid max-w-[44rem] justify-items-start gap-3">
            <p className="font-mono text-label text-text-3 uppercase">Playlist</p>
            <h1 className="text-balance text-display">{p.name}</h1>
            <p className="text-body text-text-2">{playlistSummary(p.songs, p.duration)}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="primary"
                icon={whole?.playing ? 'pause' : 'play'}
                className="min-w-32 justify-center"
                disabled={songs.length === 0}
                onClick={() => (whole ? player.toggle() : play())}
              >
                {whole?.playing ? 'Pause' : 'Play'}
              </Button>
              <Button
                icon="shuffle"
                className="min-w-32 justify-center"
                disabled={songs.length === 0}
                onClick={() => play(0, true)}
              >
                Shuffle
              </Button>
              <Menu>
                <MenuTrigger asChild>
                  <Button iconOnly icon="more" aria-label={`More for ${p.name}`} />
                </MenuTrigger>
                <MenuContent align="end" className="w-56">
                  <MenuItem icon="edit" onSelect={() => setRenaming(true)}>
                    Rename…
                  </MenuItem>
                  <MenuItem icon="delete" onSelect={() => setDeleting(true)}>
                    Delete playlist…
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </div>
        </div>
      </header>
      <section
        aria-label="Songs"
        className={cn('mx-auto grid w-full max-w-[1680px] gap-4', gutter)}
      >
        {songs.length === 0 ? (
          <EmptyState
            icon="music"
            title="Nothing here yet"
            action={
              <Button asChild>
                <a href={webHref('/music/songs')}>Songs</a>
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
            className="grid border-line border-t"
            itemClassName="border-line border-b"
          >
            {(s, handle) => {
              const i = songs.indexOf(s)
              const here = fromHere && player.index === i
              return (
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 pe-1">
                  {handle}
                  <SongButton
                    song={s}
                    here={here}
                    playing={player.playing}
                    onPlay={() => (here ? player.toggle() : play(i))}
                  />
                  <WebSongMenu
                    target={{ songs: [s.id], name: s.title, album: s.album }}
                    onRemove={() => edits.remove(s)}
                  />
                </div>
              )
            }}
          </SortableList>
        )}
      </section>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent title="Rename playlist" size="sm">
          <PlaylistNameForm
            initial={p.name}
            submit="Rename"
            onCancel={() => setRenaming(false)}
            onDone={(name) => {
              setRenaming(false)
              void edits.rename(name)
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent
          title={`Delete ${p.name}?`}
          description="Its songs stay in the library. This can’t be undone."
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await edits.delete()
                  setDeleting(false)
                  navigate('/music/playlists', { replace: true })
                }}
              >
                Delete playlist
              </Button>
            </>
          }
        />
      </Dialog>
    </main>
  )
}

function PlaylistSkeleton() {
  return (
    <main aria-busy className={cn('mx-auto grid w-full max-w-[1680px] gap-10 pt-10 pb-16', gutter)}>
      <div className="grid items-end gap-10 medium:grid-cols-[auto_minmax(0,1fr)]">
        <Skeleton className="aspect-square w-64 rounded-poster" />
        <div className="grid gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-1">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </main>
  )
}
