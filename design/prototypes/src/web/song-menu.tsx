// SPDX-License-Identifier: AGPL-3.0-only
// ⋯ on a song's row or an album's header, on the web and desktop (client/song-menu.ts): Play next,
// Add to queue, Add to playlist, which opens a dialog of the person's playlists with New playlist
// first, then Go to the album and Go to the artist where the page isn't already that. On a
// playlist's page, Remove from this playlist ends it, as Apple Music's does.
import {
  Button,
  Dialog,
  DialogContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@highsea-tv/ui'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { PlaylistPicker } from '../client/playlist-picker.tsx'
import { type SongMenuTarget, useSongMenu } from '../client/song-menu.ts'

export function WebSongMenu({
  target,
  on,
  round = false,
  onRemove,
}: {
  target: SongMenuTarget
  /** The page it's on, so it doesn't offer to go there. */
  on?: 'album' | 'artist'
  /** In a header beside Play and Shuffle: a button as theirs are, rather than a row's quiet icon. */
  round?: boolean
  /** On a playlist's page: takes the song out of it. */
  onRemove?: () => void
}) {
  const menu = useSongMenu(target)
  const [, navigate] = useLocation()
  const [picking, setPicking] = useState(false)
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant={round ? 'secondary' : 'ghost'}
            iconOnly
            icon="more"
            aria-label={`More for ${target.name}`}
          />
        </MenuTrigger>
        <MenuContent align="end" className="w-60">
          <MenuItem icon="next" onSelect={menu.playNext}>
            Play next
          </MenuItem>
          <MenuItem icon="queue" onSelect={menu.addToQueue}>
            Add to queue
          </MenuItem>
          <MenuItem icon="add" onSelect={() => setPicking(true)}>
            Add to playlist…
          </MenuItem>
          <MenuSeparator />
          {on !== 'album' && (
            <MenuItem icon="music" onSelect={() => navigate(menu.album)}>
              Go to the album
            </MenuItem>
          )}
          {on !== 'artist' && (
            <MenuItem icon="user" onSelect={() => navigate(menu.artist)}>
              Go to the artist
            </MenuItem>
          )}
          {onRemove && (
            <>
              <MenuSeparator />
              <MenuItem icon="remove" onSelect={onRemove}>
                Remove from this playlist
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent title="Add to playlist" description={target.name} size="sm">
          <PlaylistPicker
            size="web"
            onPick={(p) => {
              setPicking(false)
              menu.addToPlaylist(p)
            }}
            onNew={(name) => {
              setPicking(false)
              menu.newPlaylist(name)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
