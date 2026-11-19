// SPDX-License-Identifier: AGPL-3.0-only
// An artist's picture from fanart.tv (ADR 0070's section of 2026-11-19), for an artist whose folder
// has none: fanart.tv keys music by the artist's MusicBrainz id (`/v3/music/{mbid}`, its API's
// "Music" section, https://fanarttv.docs.apiary.io/#reference/music), and its `artistthumb` images
// are the square pictures Kodi and Lidarr show for an artist. The answer is kept in
// `fanart_images` as a film's is, asked again after a month (a week when it had nothing), and the
// most liked thumb is the one shown. Nothing waits on fanart.tv but the music metadata job.
import type { Fanart } from '../fanart/source.ts'
import { MBID } from './client.ts'

export function createArtistArt(deps: { fanart: Fanart }) {
  const { fanart } = deps

  return {
    /**
     * The address of the artist's best picture on fanart.tv, asking it first when its answer is
     * missing or old; null when fanart.tv is off, has none, or can't be asked (the old answer, if
     * any, still counts then).
     */
    async artistThumb(mbid: string, { force = false } = {}): Promise<string | null> {
      const id = mbid.toLowerCase()
      if (!MBID.test(id) || !fanart.enabled()) return null
      if (force || fanart.due('artist', id)) await fanart.refresh('artist', id).catch(() => null)
      const best = fanart.options('artist', id, 'poster')[0]
      return best ? fanart.urlOf('artist', id, best.file, Number.POSITIVE_INFINITY) : null
    },
    /** A picture's bytes from fanart.tv's asset server, at an address `artistThumb` gave. */
    artistImage: (url: string) => fanart.image(url),
  }
}
