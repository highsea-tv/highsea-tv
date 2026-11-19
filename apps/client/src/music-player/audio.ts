// SPDX-License-Identifier: AGPL-3.0-only
// The music player's sound in the app (HT-108; ADR 0065 › The clients' audio): one expo-audio
// player for the iPhone, the Apple TV, the web and the desktop app, behind the engine's seam
// (`@highsea-tv/client/music-player`'s createMusicAudio), which asks the server for each song.
//
// expo-audio (https://docs.expo.dev/versions/latest/sdk/audio/) lists iOS, tvOS and web. Here:
// - `createAudioPlayer`, not the hook: the player outlives every screen, as the store does, and
//   "you are responsible for … calling `remove()`" (the docs' createAudioPlayer).
// - `setAudioModeAsync({ playsInSilentMode, shouldPlayInBackground, interruptionMode: 'doNotMix' })`
//   while music plays: the docs' "Playing or recording audio in background" needs
//   `shouldPlayInBackground` and the config plugin's `audio` background mode (app.config.ts), and
//   `setActiveForLockScreen` needs `doNotMix`. The interface sounds' `mixWithOthers`
//   (@highsea-tv/native/sound) comes back when the music goes, so they never stop another app's.
// - `setActiveForLockScreen(true, metadata, options)` for the lock screen, Control Center and the
//   TV's Now Playing: the song, the artist, the album and the cover. On iOS a single player's
//   remote commands are play, pause and the scrubber; Next and Previous belong to expo-audio's
//   playlist (its MediaController.swift: `supportsNextTrack` is the playlist's alone), so the
//   lock screen has none yet (the PR's "For the next task").
// - On the web expo-audio drives the Media Session API from the same call (its
//   MediaSessionController.web.js); Next and Previous are added here with
//   `navigator.mediaSession.setActionHandler('nexttrack' | 'previoustrack')`, which the keyboard's
//   media keys reach (https://developer.mozilla.org/en-US/docs/Web/API/MediaSession/setActionHandler).
//
// The cover: iOS's lock screen fetches `artworkUrl` itself with no headers (expo-audio's
// MediaController.swift, `loadArtworkFromURL`), and the server's covers answer only a signed-in
// request, so the phone and the TV hand it the file expo-image cached with the device's token
// (@highsea-tv/native's `artworkFile`, as the film player's Now Playing does). The browser
// fetches it with the page's own cookie.
import {
  type AudioOutput,
  type AudioOutputEvent,
  type MusicServer,
  type NowPlayingInfo,
} from '@highsea-tv/client/music-player'
import { baseProfile } from '@highsea-tv/client/player'
import { playbackProfile } from '@highsea-tv/native/device'
import type { Source } from '@highsea-tv/native/media'
import { artworkFile } from '@highsea-tv/native/now-playing'
import type { WebHost } from '@highsea-tv/native/web-host'
import type { HighseaClient } from '@highsea-tv/sdk'
import { ApiError } from '@highsea-tv/sdk'
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { Platform } from 'react-native'

/** How often expo-audio says where it is, in ms: often enough for the waveform to fill. */
const STATUS_MS = 250
/**
 * The player and the audio session outlast a song by this long, so Next doesn't let go of the
 * lock screen and the background mode between one song's end and the next one's answer.
 */
const LINGER_MS = 3000

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
    play: (id) => client.music.play({ params: { id }, body: { profile: profile() } }),
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

/** The Media Session's one call used here (MDN), so the app's types needn't include the DOM's. */
type WebMediaSession = {
  setActionHandler(action: string, handler: (() => void) | null): void
}

/** expo-audio's player behind the engine's seam. */
export function expoAudioOutput(media: MediaUrl): AudioOutput {
  let player: AudioPlayer | null = null
  const listeners = new Set<(e: AudioOutputEvent) => void>()
  const emit = (e: AudioOutputEvent) => {
    for (const l of listeners) l(e)
  }
  /** Bumped by each load, so a late cover or status from the last song is let go. */
  let generation = 0
  let wasPlaying = false
  let ended = false
  let lastTime = -1
  let lastError: string | null = null
  let musicMode = false
  let linger: ReturnType<typeof setTimeout> | undefined

  function audioMode(music: boolean) {
    if (musicMode === music) return
    musicMode = music
    void setAudioModeAsync(
      music
        ? { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }
        : { interruptionMode: 'mixWithOthers', shouldPlayInBackground: false },
    ).catch(() => {})
  }

  function made(): AudioPlayer {
    if (player) return player
    const p = createAudioPlayer(null, { updateInterval: STATUS_MS })
    p.addListener('playbackStatusUpdate', (status) => {
      if (status.error && status.error !== lastError) {
        lastError = status.error
        return emit({ type: 'error', message: status.error })
      }
      if (!status.isLoaded) return
      if (status.currentTime !== lastTime) {
        lastTime = status.currentTime
        emit({ type: 'time', position: status.currentTime })
      }
      if (status.didJustFinish) {
        if (!ended) {
          ended = true
          wasPlaying = false
          emit({ type: 'ended' })
        }
        return
      }
      // the player's own flag: on the web the status's `playing` also counts the element's
      // readiness, which drops for a moment after a seek
      const playing = p.playing
      if (playing !== wasPlaying) {
        wasPlaying = playing
        emit({ type: 'playing', playing })
      }
    })
    player = p
    return p
  }

  /** Next and Previous from the browser's media keys and its media controls (MDN). */
  function webKeys(on: boolean) {
    const session = (globalThis as { navigator?: { mediaSession?: WebMediaSession } }).navigator
      ?.mediaSession
    if (Platform.OS !== 'web' || !session) return
    const set = (action: 'nexttrack' | 'previoustrack', fn: (() => void) | null) => {
      try {
        session.setActionHandler(action, fn)
      } catch {}
    }
    set('nexttrack', on ? () => emit({ type: 'next' }) : null)
    set('previoustrack', on ? () => emit({ type: 'previous' }) : null)
  }

  function lockScreen(p: AudioPlayer, info: NowPlayingInfo, artwork?: string) {
    const metadata = {
      title: info.title,
      artist: info.artist,
      albumTitle: info.album,
      ...(artwork ? { artworkUrl: artwork } : {}),
    }
    try {
      p.setActiveForLockScreen(true, metadata, {
        showSeekForward: false,
        showSeekBackward: false,
        showNextTrack: false,
        showPreviousTrack: false,
      })
    } catch {}
    webKeys(true)
  }

  return {
    load(url, info) {
      const gen = ++generation
      const src = media(url)
      if (!src) return emit({ type: 'error', message: 'Can’t reach the server.' })
      clearTimeout(linger)
      audioMode(true)
      const p = made()
      p.pause()
      ended = false
      wasPlaying = false
      lastTime = -1
      lastError = null
      p.replace(Platform.OS === 'web' ? src.uri : src)
      lockScreen(
        p,
        info,
        Platform.OS === 'web' && info.artwork ? media(info.artwork)?.uri : undefined,
      )
      if (Platform.OS !== 'web' && info.artwork) {
        const art = media(info.artwork)
        void artworkFile(art).then((file) => {
          if (file && gen === generation && player === p) lockScreen(p, info, file)
        })
      }
    },
    play() {
      ended = false
      player?.play()
    },
    pause() {
      player?.pause()
    },
    seekTo(seconds) {
      ended = false
      void player?.seekTo(seconds).catch(() => {})
    },
    setVolume(volume, muted) {
      if (!player) return
      player.volume = volume
      player.muted = muted
    },
    unload() {
      generation++
      wasPlaying = false
      player?.pause()
      clearTimeout(linger)
      linger = setTimeout(() => {
        const p = player
        player = null
        if (p) {
          try {
            p.clearLockScreenControls()
          } catch {}
          p.remove()
        }
        webKeys(false)
        audioMode(false)
      }, LINGER_MS)
    },
    subscribe(l) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}
