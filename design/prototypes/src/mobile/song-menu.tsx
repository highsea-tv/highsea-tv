// SPDX-License-Identifier: AGPL-3.0-only
// A song's menu or an album's on the phone (client/song-menu.ts), from ⋯ or a long press on the
// row, as Apple Music's iPhone app opens one: a sheet of Play next, Add to queue, Add to playlist
// (the person's playlists, New playlist first, in the same sheet), Go to the album and Go to the
// artist where the page isn't already that; on a playlist's page, Remove from this playlist.
import { Icon, Sheet, SheetContent } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { PlaylistPicker } from '../client/playlist-picker.tsx'
import { type SongMenuTarget, useSongMenu } from '../client/song-menu.ts'
import { sheetAction } from './now-playing.tsx'

export function MobileSongMenu({
  target,
  on,
  open,
  onOpenChange,
  onRemove,
}: {
  target: SongMenuTarget
  /** The page it's on, so it doesn't offer to go there. */
  on?: 'album' | 'artist' | 'playlist'
  open: boolean
  onOpenChange: (open: boolean) => void
  /** On a playlist's page: takes the song out of it. */
  onRemove?: () => void
}) {
  const menu = useSongMenu(target)
  const [, navigate] = useLocation()
  const [picking, setPicking] = useState(false)
  const act = (run: () => unknown) => () => {
    onOpenChange(false)
    run()
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setPicking(false)
      }}
    >
      <SheetContent
        title={picking ? 'Add to playlist' : target.name}
        description={picking ? target.name : target.album.artist.name}
      >
        {picking ? (
          <PlaylistPicker
            size="mobile"
            onPick={(p) => act(() => menu.addToPlaylist(p))()}
            onNew={(name) => act(() => menu.newPlaylist(name))()}
          />
        ) : (
          <div className="-mx-3 grid">
            <button type="button" onClick={act(menu.playNext)} className={sheetAction}>
              <Icon name="next" size={20} />
              Play next
            </button>
            <button type="button" onClick={act(menu.addToQueue)} className={sheetAction}>
              <Icon name="queue" size={20} />
              Add to queue
            </button>
            <button type="button" onClick={() => setPicking(true)} className={sheetAction}>
              <Icon name="add" size={20} />
              Add to playlist
            </button>
            {on !== 'album' && (
              <button
                type="button"
                onClick={act(() => navigate(menu.album))}
                className={sheetAction}
              >
                <Icon name="music" size={20} />
                Go to the album
              </button>
            )}
            {on !== 'artist' && (
              <button
                type="button"
                onClick={act(() => navigate(menu.artist))}
                className={sheetAction}
              >
                <Icon name="user" size={20} />
                Go to the artist
              </button>
            )}
            {onRemove && (
              <button type="button" onClick={act(onRemove)} className={sheetAction}>
                <Icon name="remove" size={20} />
                Remove from this playlist
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** ⋯ at a row's end, for the menu. */
export function MoreButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`More for ${name}`}
      aria-haspopup="dialog"
      onClick={onClick}
      className="grid size-11 cursor-pointer place-items-center rounded-full text-text-3 outline-none transition-press focus-visible:ring-focus active:scale-90"
    >
      <Icon name="more" size={20} />
    </button>
  )
}
