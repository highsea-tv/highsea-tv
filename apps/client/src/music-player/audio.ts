// SPDX-License-Identifier: AGPL-3.0-only
// The music player's sound in the app (HT-108, HT-117; ADR 0065 › The clients' audio, › Gapless
// and loudness): the server's side of the engine (`@highsea-tv/client/music-player`'s
// createMusicAudio), which asks it for each song, and the output for this platform behind the
// engine's seam: expo-audio's playlist on the iPhone and the Apple TV (output-native.ts), two
// audio elements on the web and in the desktop app (output-web.ts).
//
// expo-audio (https://docs.expo.dev/versions/latest/sdk/audio/) on the phone and the TV:
// - `setAudioModeAsync({ playsInSilentMode, shouldPlayInBackground, interruptionMode: 'doNotMix' })`
//   while music plays: the docs' "Playing or recording audio in background" needs
//   `shouldPlayInBackground` and the config plugin's `audio` background mode (app.config.ts), and
//   `setActiveForLockScreen` needs `doNotMix`. The interface sounds' `mixWithOthers`
//   (@highsea-tv/native/sound) comes back when the music goes, so they never stop another app's.
// - `setActiveForLockScreen(true, metadata, options)` for the lock screen, Control Center and the
//   TV's Now Playing: the song, the artist, the album, the cover, and Next and Previous, which
//   belong to expo-audio's playlist (its MediaController.swift: `supportsNextTrack`).
//
// The cover: iOS's lock screen fetches `artworkUrl` itself with no headers (expo-audio's
// MediaController.swift, `loadArtworkFromURL`), and the server's covers answer only a signed-in
// request, so the phone and the TV hand it the file expo-image cached with the device's token
// (@highsea-tv/native's `artworkFile`, as the film player's Now Playing does). The browser
// fetches it with the page's own cookie.
import type { AudioOutput, MusicServer } from '@highsea-tv/client/music-player'
import { baseProfile } from '@highsea-tv/client/player'
import { playbackProfile } from '@highsea-tv/native/device'
import type { Source } from '@highsea-tv/native/media'
import type { WebHost } from '@highsea-tv/native/web-host'
import type { HighseaClient } from '@highsea-tv/sdk'
import { ApiError } from '@highsea-tv/sdk'
import { Platform } from 'react-native'
import { nativePlaylistOutput } from './output-native.ts'
import { webElementsOutput } from './output-web.ts'

/** How a server path becomes what the player loads, on this platform. */
export type MediaUrl = (path: string) => Source | undefined

/** The built-in profile this device starts from (ADR 0052), as the film player names it. */
export function musicProfile(host: WebHost | null): string {
  if (Platform.OS !== 'web') return playbackProfile
  return baseProfile(navigator.userAgent, host?.app)
}

/** The server's side of the engine, through the SDK. */
export function musicServer(
  client: HighseaClient,
  media: MediaUrl,
  profile: () => string,
): MusicServer {
  return {
    play: (id, o) =>
      client.music.play({
        params: { id },
        body: { profile: profile(), ...(o?.ahead ? { ahead: true } : {}) },
      }),
    progress: async (id, body) => {
      await client.music.progress({ params: { id }, body })
    },
    stop: async (id) => {
      await client.music.stop({ params: { id } })
    },
    // the first byte of a transcode, which the server sends once the AAC is made, or its reason
    // why not (the stream's 503 carries `details.reason`, apps/server/src/stream/index.ts)
    async ready(url) {
      const src = media(url)
      if (!src) throw new ApiError('unavailable', 'Can’t reach the server.')
      let res: Response
      try {
        res = await fetch(src.uri, {
          headers: { ...src.headers, range: 'bytes=0-0' },
          credentials: 'include',
        })
      } catch {
        throw new ApiError('unavailable', 'Can’t reach the server.')
      }
      if (res.ok) {
        await res.body?.cancel().catch(() => {})
        return
      }
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string; details?: unknown }
      } | null
      throw new ApiError(
        res.status === 404 ? 'not-found' : 'unavailable',
        body?.error?.message ?? `The server answered ${res.status}.`,
        res.status,
        body?.error?.details,
      )
    },
  }
}

/**
 * The output on this platform: expo-audio's playlist on the iPhone and the Apple TV, for the lock
 * screen's Next and Previous and the join it loads ahead (output-native.ts); two audio elements
 * in the browser and the desktop app (output-web.ts).
 */
export function musicOutput(media: MediaUrl): AudioOutput {
  return Platform.OS === 'web' ? webElementsOutput(media) : nativePlaylistOutput(media)
}
