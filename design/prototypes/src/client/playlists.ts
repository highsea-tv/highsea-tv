// SPDX-License-Identifier: AGPL-3.0-only
// Songs and a person's playlists on every client (prototype-gaps.md › 3.8). A playlist is
// renamed, reordered, has songs removed and is deleted on the web, desktop and phone, as Apple
// Music's and Spotify's are; the TV only plays them. A reorder shows at once, before the server
// answers, so a dragged row doesn't jump back while the list reloads.
import { toast } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useAction, useQuery } from '../mock/hooks.tsx'
import type { ClientPlaylistDetail } from '../mock/types.ts'
import { albumSummary } from './music.ts'

export const useSongs = () =>
  useQuery('client:songs', (c) => c.library.songs(), ['music.updated', 'playlists.updated'])

export const usePlaylist = (id: string) =>
  useQuery(`client:playlist:${id}`, (c) => c.library.playlist(id), [
    'playlists.updated',
    'music.updated',
  ])

export type PlaylistEntry = ClientPlaylistDetail['songs'][number]

/** "12 songs, 48 min", or "No songs yet". */
export const playlistSummary = (songs: number, seconds: number) =>
  songs === 0 ? 'No songs yet' : albumSummary(songs, seconds)

/** A playlist's songs as shown, its edits, and where Play starts it. */
export function usePlaylistEdits(id: string, data: ClientPlaylistDetail | undefined) {
  // the order as dragged, until the server answers with a newer playlist
  const [moved, setMoved] = useState<{ on: typeof data; songs: PlaylistEntry[] } | null>(null)
  const rename = useAction((c, name: string) => c.playlists.rename(id, name))
  const reorder = useAction((c, order: string[]) => c.playlists.reorder(id, order))
  const remove = useAction((c, entry: string) => c.playlists.remove(id, entry))
  const destroy = useAction((c) => c.playlists.delete(id))
  const songs = moved && moved.on === data ? moved.songs : (data?.songs ?? [])
  return {
    songs,
    rename: async (name: string) => {
      await rename.run(name)
      toast({ title: `Renamed ${name}` })
    },
    reorder: (next: PlaylistEntry[]) => {
      setMoved({ on: data, songs: next })
      void reorder.run(next.map((s) => s.entry))
    },
    remove: async (s: PlaylistEntry) => {
      await remove.run(s.entry)
      toast({ title: `${s.title} removed`, description: `From ${data?.playlist.name ?? ''}.` })
    },
    delete: async () => {
      await destroy.run()
      toast({ title: `${data?.playlist.name ?? 'The playlist'} deleted` })
    },
  }
}
