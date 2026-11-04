// SPDX-License-Identifier: AGPL-3.0-only
// The client's one music player (one-client-platform-b.md › B3), the prototype's
// client/music-player.ts on @highsea-tv/client/music-player: a store made once, above the routes,
// so music goes on playing as the app moves from page to page, as Plex's, Emby's, Apple Music's
// and Spotify's players do. The shell mounts it (./mount.tsx) only on a server that serves music;
// Music's pages play through `useMusicPlayer().play`. There's no audio, as in the prototype: the
// position runs on the store's timer and the server's loudness stands in for what's heard.
import type { MusicSource, QueuedSong } from '@highsea-tv/api-contract'
import { useMusicQueue } from '@highsea-tv/client/data'
import {
  albumPlaying,
  createMusicPlayer,
  createMusicPlayerText,
  type MusicPlayerState,
  nowPlaying,
  type PlayingFrom,
  playingFrom,
  type QueueEntry,
  useMusicPlayerState,
} from '@highsea-tv/client/music-player'
import { useLocale } from '@highsea-tv/i18n/react'
import { useCallback, useMemo } from 'react'

export type Entry = QueueEntry<QueuedSong>
export type State = MusicPlayerState<QueuedSong>

/** The one player, for every form factor and every page. */
export const musicPlayer = createMusicPlayer<QueuedSong>()

/** The player's words in the app's language: "Playing from", Repeat's states. */
export function useMusicPlayerText() {
  const locale = useLocale()
  return useMemo(() => createMusicPlayerText(locale), [locale])
}

/**
 * The player, for the bar, Now playing, the queue and the pages' Play buttons: its state, the song
 * and Up next, its actions, and `play`, which asks the server for a source's queue and plays it.
 */
export function useMusicPlayer() {
  const s = useMusicPlayerState(musicPlayer)
  const { queue } = useMusicQueue()
  const text = useMusicPlayerText()
  /**
   * Plays an album, an artist, a playlist or songs from a song (the first by default), or
   * shuffled. `from` names it where the source doesn't: a playlist's name, or a search.
   */
  const play = useCallback(
    async (
      source: MusicSource,
      opts: { start?: number; shuffle?: boolean; from?: PlayingFrom } = {},
    ) => {
      const songs = await queue(source, opts.shuffle ?? false)
      musicPlayer.load(
        songs,
        opts.start ?? 0,
        0,
        opts.shuffle ?? false,
        opts.from ?? text.fromOf(source, songs),
      )
    },
    [queue, text],
  )
  return { ...s, ...nowPlaying(s), ...musicPlayer, play }
}

/** Is a song from this album playing? Its row has the playing mark while it is. */
export const useAlbumPlaying = (album: string) =>
  albumPlaying(useMusicPlayerState(musicPlayer), album)

/**
 * Is this album, artist or playlist what's playing, in its order, by the page `to` names? Its Play
 * button shows Pause while it is, as Apple Music's does.
 */
export const usePlayingFrom = (to: string) => playingFrom(useMusicPlayerState(musicPlayer), to)

/**
 * A film starting pauses the music, as one player on a device does (the prototype's
 * client/player.ts); it waits in its bar or mini player for after.
 */
export function pauseMusic() {
  if (musicPlayer.get().playing) musicPlayer.toggle()
}
