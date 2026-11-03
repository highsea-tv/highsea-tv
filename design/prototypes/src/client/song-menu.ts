// SPDX-License-Identifier: AGPL-3.0-only
// A song's ⋯ menu and an album's (prototype-gaps.md › 3.4, 3.8), the same on every app: ⋯ on the
// row on the web and desktop, ⋯ or a long press on the phone, OK held on the TV. Play next and Add
// to queue line the songs up after the one playing or at the end (and play them when nothing is);
// Go to the album and Go to the artist; Add to playlist lists the person's own, with New playlist
// first. The TV leaves playlists to the other apps.

import type { ClientAlbum } from '@highsea-tv/mock/types'
import { toast } from '@highsea-tv/ui'
import { useAction, useClient, useQuery } from '../mock/hooks.tsx'
import { musicPlayer } from './music-player.ts'

export type SongMenuTarget = {
  /** The songs, by id: one, or an album's. */
  songs: string[]
  /** "Gymnopédie No. 1", or the album's title. */
  name: string
  album: ClientAlbum
}

export const usePlaylists = () =>
  useQuery('client:playlists', (c) => c.library.playlists(), ['playlists.updated'])

export function useSongMenu({ songs, name, album }: SongMenuTarget) {
  const client = useClient()
  const create = useAction((c, title: string) => c.playlists.create(title, songs))
  const addTo = useAction((c, id: string) => c.playlists.add(id, songs))
  const from = { kind: 'songs' as const, name: album.title, to: `/music/albums/${album.id}` }
  const tracks = () => client.library.tracks(songs)
  return {
    playNext: async () => {
      musicPlayer.playNext(await tracks(), from)
      toast({ title: `${name} plays next` })
    },
    addToQueue: async () => {
      musicPlayer.add(await tracks(), from)
      toast({ title: `${name} added to the queue` })
    },
    album: `/music/albums/${album.id}`,
    artist: `/music/artists/${album.artist.id}`,
    addToPlaylist: async (playlist: { id: string; name: string }) => {
      await addTo.run(playlist.id)
      toast({ title: `Added to ${playlist.name}`, description: name })
    },
    /** A new playlist with these songs in it. */
    newPlaylist: async (title: string) => {
      const p = await create.run(title)
      toast({ title: `${p.name} made`, description: `With ${name} in it.` })
      return p
    },
  }
}
