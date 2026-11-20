// SPDX-License-Identifier: AGPL-3.0-only
// The music player's output on the iPhone and the Apple TV (HT-117; ADR 0065 › Gapless and
// loudness): expo-audio's playlist player, behind the engine's seam
// (`@highsea-tv/client/music-player`'s AudioOutput).
//
// Why the playlist (expo-audio 58, https://docs.expo.dev/versions/latest/sdk/audio/, "Playlists"):
// - It's the only expo-audio player whose lock-screen controls include Next and Previous:
//   `setActiveForLockScreen(…, { showNextTrack, showPreviousTrack })` shows them only for a
//   player that supports them, and its iOS MediaController enables `nextTrackCommand` and
//   `previousTrackCommand` only for the playlist (`supportsNextTrack` is the playlist's alone).
// - On iOS and tvOS it's an AVQueuePlayer (expo-audio's AudioPlaylist.swift), which Apple
//   documents as "a player used to play a number of items in sequence"
//   (https://developer.apple.com/documentation/avfoundation/avqueueplayer): the next item is
//   already queued, made and loading when the current ends, rather than asked for then. Neither
//   Apple nor Expo promises a sample-exact join, so this is the platform's join, not a guarantee:
//   a file's own encoder padding is trimmed only where the file says how much (an MP4's edit
//   list, an MP3's LAME header), which AVFoundation reads.
//
// How it's used here: the playlist holds at most the songs played since the last `load`, the one
// playing and the one prepared after it. The engine's `prepare` appends (or removes) the item after
// the current one, which the playlist adds without touching the current (its `add`, and `remove`
// of a later index). Moving on, by the end or the lock screen's Next, shows as the status's
// `currentIndex` going up, said as `advanced` before the new song's clock. The lock screen's
// Previous makes the playlist go back an item (its `previous`, which rebuilds from there); that
// item's play has ended on the server, so the playlist is put straight back on the current song
// from its start and the engine is told `previous`, which restarts the song or goes back as the
// store says. A first item, the same as the current, is there so the very first song has an item
// to go back to. Each `load` starts the list again; within a run of joined songs, the ones played
// stay in the list (removing an earlier item makes expo-audio rebuild and reload the current one,
// AudioPlaylist.swift's `remove(at:)`), and expo-audio keeps their player items until then: an
// album's worth, which a long unbroken run grows (the PR's "For the next task").
//
// Levelling: the playlist has one volume (AVPlayer's `volume`, 0 to 1), so each song's gain is set
// as it becomes the current one. In album mode an album's songs share one gain and the join needs
// no change; in track mode the new gain lands a moment after the join, as the status arrives.
import type { AudioOutput, AudioOutputEvent, AudioSource } from '@highsea-tv/client/music-player'
import { artworkFile } from '@highsea-tv/native/now-playing'
import { type AudioPlaylist, createAudioPlaylist, setAudioModeAsync } from 'expo-audio'
import type { MediaUrl } from './audio.ts'

/** How often the playlist says where it is, in ms: often enough for the waveform to fill. */
const STATUS_MS = 250
/** The player and the audio session outlast the music by this long, so Next keeps the lock screen. */
const LINGER_MS = 3000
/** A song that hasn't loaded after this long is a failure (the playlist's status has no error). */
const LOAD_MS = 20_000

export function nativePlaylistOutput(media: MediaUrl): AudioOutput {
  let list: AudioPlaylist | null = null
  const listeners = new Set<(e: AudioOutputEvent) => void>()
  const emit = (e: AudioOutputEvent) => {
    for (const l of listeners) l(e)
  }
  /** The engine's sources by the playlist's index. */
  let items: AudioSource[] = []
  /** The index the output means to be on; a change it didn't make is the platform's. */
  let at = 0
  /** The prepared source's index, or -1. */
  let preparedAt = -1
  let volume = 1
  let muted = false
  let wasPlaying = false
  let lastTime = -1
  let ended = false
  /**
   * The playlist has said it's at `at` since the output last moved it. Its statuses reach JS
   * after the fact, so one from before a move (a lower index) isn't the lock screen's Previous.
   */
  let settled = false
  let generation = 0
  let musicMode = false
  let linger: ReturnType<typeof setTimeout> | undefined
  let loading: ReturnType<typeof setTimeout> | undefined

  function audioMode(music: boolean) {
    if (musicMode === music) return
    musicMode = music
    void setAudioModeAsync(
      music
        ? { playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }
        : { interruptionMode: 'mixWithOthers', shouldPlayInBackground: false },
    ).catch(() => {})
  }

  const nativeSource = (s: AudioSource) => media(s.url) ?? null

  function applyVolume() {
    if (!list) return
    const gain = items[at]?.gain ?? 1
    list.volume = Math.max(0, Math.min(1, volume * gain))
    list.muted = muted
  }

  function lockScreen(l: AudioPlaylist, s: AudioSource, artwork?: string) {
    const metadata = {
      title: s.info.title,
      artist: s.info.artist,
      albumTitle: s.info.album,
      ...(artwork ? { artworkUrl: artwork } : {}),
    }
    try {
      l.setActiveForLockScreen(true, metadata, {
        showSeekForward: false,
        showSeekBackward: false,
        showNextTrack: true,
        showPreviousTrack: true,
      })
    } catch {}
    // the cover: iOS fetches `artworkUrl` with no headers, so the file expo-image cached with the
    // device's token stands in (HT-108)
    if (!artwork && s.info.artwork) {
      const gen = generation
      void artworkFile(media(s.info.artwork)).then((file) => {
        if (file && gen === generation && list === l) lockScreen(l, s, file)
      })
    }
  }

  function watchLoad() {
    clearTimeout(loading)
    const gen = generation
    loading = setTimeout(() => {
      if (gen === generation && list && !list.isLoaded)
        emit({ type: 'error', message: 'The song didn’t load.' })
    }, LOAD_MS)
  }

  function made(): AudioPlaylist {
    if (list) return list
    const l = createAudioPlaylist({ updateInterval: STATUS_MS })
    l.addListener('playlistStatusUpdate', (status) => {
      if (list !== l) return
      if (status.currentIndex > at && status.currentIndex === preparedAt) {
        // moved on by itself: the end, or the lock screen's Next
        at = status.currentIndex
        preparedAt = -1
        lastTime = -1
        applyVolume()
        const s = items[at]
        if (s) lockScreen(l, s)
        watchLoad()
        emit({ type: 'advanced' })
      } else if (settled && status.currentIndex < at && status.trackCount === items.length) {
        // the lock screen's Previous: back on this song from its start, and the store decides
        settled = false
        l.skipTo(at)
        emit({ type: 'previous' })
        return
      }
      if (status.currentIndex !== at) return
      settled = true
      if (status.isLoaded) clearTimeout(loading)
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
      if (status.playing !== wasPlaying) {
        wasPlaying = status.playing
        emit({ type: 'playing', playing: status.playing })
      }
    })
    list = l
    return l
  }

  return {
    load(source) {
      generation++
      const src = nativeSource(source)
      if (!src) return emit({ type: 'error', message: 'Can’t reach the server.' })
      clearTimeout(linger)
      audioMode(true)
      const l = made()
      l.pause()
      l.clear()
      // the first item is the same song: something for the lock screen's Previous to go back to
      items = [source, source]
      l.add(src)
      l.add(src)
      at = 1
      settled = false
      preparedAt = -1
      ended = false
      wasPlaying = false
      lastTime = -1
      l.skipTo(1)
      applyVolume()
      lockScreen(l, source)
      watchLoad()
    },
    prepare(source) {
      const l = list
      if (!l) return
      if (preparedAt > at) {
        l.remove(preparedAt)
        items = items.slice(0, preparedAt)
        preparedAt = -1
      }
      const src = source && nativeSource(source)
      if (!source || !src) return
      items = [...items.slice(0, at + 1), source]
      l.add(src)
      preparedAt = at + 1
    },
    advance() {
      const l = list
      if (!l || preparedAt <= at) return
      at = preparedAt
      settled = false
      preparedAt = -1
      lastTime = -1
      ended = false
      l.next()
      applyVolume()
      const s = items[at]
      if (s) lockScreen(l, s)
      watchLoad()
    },
    play() {
      ended = false
      list?.play()
    },
    pause() {
      list?.pause()
    },
    seekTo(seconds) {
      ended = false
      void list?.seekTo(seconds).catch(() => {})
    },
    setVolume(v, m) {
      volume = v
      muted = m
      applyVolume()
    },
    unload() {
      generation++
      clearTimeout(loading)
      wasPlaying = false
      list?.pause()
      clearTimeout(linger)
      linger = setTimeout(() => {
        const l = list
        list = null
        items = []
        preparedAt = -1
        if (l) {
          try {
            l.clearLockScreenControls()
          } catch {}
          l.destroy()
        }
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
