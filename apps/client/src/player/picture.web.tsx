// SPDX-License-Identifier: AGPL-3.0-only
// The film itself on the web and in the desktop app's webview (the web side of ./picture.tsx): the
// engine's `<video>` (`@highsea-tv/native/playback`'s web player, whose `attach` is its ref), which
// react-native-web lets a View hold as it holds an iframe
// (https://necolas.github.io/react-native-web/docs/multi-platform/). The chosen subtitle is the
// browser's own: a `<track>` of the session's WebVTT that the browser parses and draws
// (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/track), styled by `::cue`
// (https://developer.mozilla.org/en-US/docs/Web/CSS/::cue). The person's timing moves each cue's
// times, which a VTTCue lets a page set (https://developer.mozilla.org/en-US/docs/Web/API/TextTrackCue/startTime),
// and the line moves up while the controls show (`line`, with `snapToLines` off:
// https://developer.mozilla.org/en-US/docs/Web/API/VTTCue/line). Picture in picture is the
// Picture-in-Picture API where the browser has it (Firefox has only its own toggle on the video,
// so the button is left out there: https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API),
// full screen the Fullscreen API on the page, and the keyboard's and headphones' media keys the
// Media Session API (https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API).
import { SEEK_S } from '@highsea-tv/client/player'
import { useWebHost } from '@highsea-tv/native/web-host'
import { scrimOf, useTheme } from '@highsea-tv/ui'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useFrameState } from '../frame-channel.ts'
import { mock } from '../transport.ts'
import { Round } from './parts.tsx'
import type {
  airPlayButton as nativeAirPlay,
  DRAWS_CUES as nativeDraws,
  useExternal as nativeExternal,
  HAS_AIRPLAY as nativeHas,
  usePageInput as nativeInput,
  usePicture as nativePicture,
} from './picture.tsx'

export type { MediaControls, PictureOptions } from './picture.tsx'

/**
 * The engine's web player. `@highsea-tv/native/playback` is typed by its native side, whose
 * player is expo-video's, as platform files are (README.md › Platform files): the web's own is
 * this, which playback.web.ts returns.
 */
type WebPlayer = {
  attach: (v: HTMLVideoElement | null) => (() => void) | undefined
  video: RefObject<HTMLVideoElement | null>
}

/** The browser draws the subtitle from the `<track>`; the screen draws no lines of its own. */
export const DRAWS_CUES: typeof nativeDraws = false

/** Where the subtitle's last line ends, from the top: the prototype's 16% and 22% from the bottom. */
const LINE = { low: 84, raised: 78 }

/** The subtitle's look, the prototype's CueLine's: the theme's `text` on a 60% black, semibold. */
const cueStyle = (text: string) =>
  `video[data-player]::cue{background-color:${scrimOf(60)};color:${text};font-weight:600;font-size:clamp(1rem,2.2vw,1.6rem);line-height:1.3}`

/** Inside Tauri's webview the server's scheme is another origin, which a track loads only with CORS. */
const inApp = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const usePicture: typeof nativePicture = (p, o) => {
  const player = p.player as unknown as WebPlayer
  const theme = useTheme()
  const host = useWebHost()
  const track = useRef<HTMLTrackElement>(null)
  const [pip, setPip] = useState(false)
  const [sound, setSound] = useState({ volume: 1, muted: false })
  const [rate, setRate] = useState(1)
  const [full, setFull] = useState(false)
  const pipAvailable = typeof document !== 'undefined' && document.pictureInPictureEnabled === true

  // muting, the speed and picture in picture follow the video, whichever control changed them
  useEffect(() => {
    const v = player.video.current
    if (!v) return
    const off = new AbortController()
    const on = (type: string, f: () => void) => v.addEventListener(type, f, { signal: off.signal })
    on('volumechange', () => setSound({ volume: v.volume, muted: v.muted }))
    on('ratechange', () => setRate(v.playbackRate))
    on('enterpictureinpicture', () => setPip(true))
    on('leavepictureinpicture', () => setPip(false))
    return () => off.abort()
  }, [player.video])
  useEffect(() => {
    if (typeof document === 'undefined') return
    const changed = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])

  // the person's timing and the line's height, laid on each cue from its own times, once the
  // track has loaded and again on each change; other tracks (Safari's) are turned off
  const url = p.subtitleUrl
  const { offsetMs } = p
  const { raised } = o
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new url is a new <track> (its key), laid out again
  useEffect(() => {
    const el = track.current
    const v = player.video.current
    if (!el || !v) return
    const own = new WeakMap<TextTrackCue, [number, number]>()
    const lay = () => {
      for (const t of Array.from(v.textTracks)) if (t !== el.track) t.mode = 'disabled'
      el.track.mode = 'showing'
      for (const cue of Array.from(el.track.cues ?? [])) {
        const times = own.get(cue) ?? [cue.startTime, cue.endTime]
        own.set(cue, times)
        cue.startTime = times[0] + offsetMs / 1000
        cue.endTime = times[1] + offsetMs / 1000
        if ('line' in cue) {
          const vtt = cue as VTTCue
          vtt.snapToLines = false
          vtt.lineAlign = 'end'
          vtt.line = raised ? LINE.raised : LINE.low
        }
      }
    }
    lay()
    el.addEventListener('load', lay)
    return () => el.removeEventListener('load', lay)
  }, [url, offsetMs, raised, player.video])

  // the media keys, and the system's own controls
  const d = p.detail.data
  const { seekBy, seekTo } = p
  useEffect(() => {
    if (!d || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.metadata = new MediaMetadata({
      title: d.item.title,
      artwork: d.item.art.poster ? [{ src: host.media(d.item.art.poster) }] : [],
    })
    const v = () => player.video.current
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      [
        'play',
        () =>
          void v()
            ?.play()
            .catch(() => {}),
      ],
      ['pause', () => v()?.pause()],
      ['seekbackward', (e) => seekBy(-(e.seekOffset ?? SEEK_S))],
      ['seekforward', (e) => seekBy(e.seekOffset ?? SEEK_S)],
      ['seekto', (e) => e.seekTime !== undefined && seekTo(e.seekTime)],
    ]
    for (const [action, h] of handlers)
      try {
        ms.setActionHandler(action, h)
      } catch {}
    return () => {
      ms.metadata = null
      for (const [action] of handlers)
        try {
          ms.setActionHandler(action, null)
        } catch {}
    }
  }, [d, host, player.video, seekBy, seekTo])

  const video = () => player.video.current
  const picture: ReactNode = (
    <>
      <style>{cueStyle(theme.colors.text)}</style>
      {/* biome-ignore lint/a11y/useMediaCaption: the chosen subtitle is its <track>, added when there's one */}
      <video
        ref={player.attach}
        data-player=""
        playsInline
        preload="auto"
        crossOrigin={inApp() ? 'anonymous' : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          opacity: o.dim ? 0.35 : 1,
        }}
      >
        {url && p.subtitle ? (
          <track
            ref={track}
            key={url}
            kind="subtitles"
            src={url}
            srcLang={p.subtitle.language || undefined}
            label={p.subtitle.label}
            default
          />
        ) : null}
      </video>
    </>
  )
  return {
    picture,
    controls: {
      pip: {
        available: pipAvailable,
        on: pip,
        toggle: () => {
          if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {})
          else
            video()
              ?.requestPictureInPicture()
              .catch(() => {})
        },
      },
      muted: sound.muted,
      volume: sound.volume,
      setVolume: (volume) => {
        const v = video()
        if (!v) return
        v.volume = volume
        v.muted = volume === 0
      },
      toggleMute: () => {
        const v = video()
        if (v) v.muted = !v.muted
      },
      rate,
      setRate: (r) => {
        const v = video()
        if (v) v.playbackRate = r
      },
      fullScreen: {
        on: full,
        toggle: () => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
          else document.documentElement.requestFullscreen?.().catch(() => {})
        },
      },
    },
  }
}

/**
 * The web has no AirPlay picker of its own to draw (Safari's is on its own controls). In mock mode
 * the prototypes' phone, which is this web export, draws the button as iOS's and the toolbar's
 * AirPlay plays the film on another screen.
 */
export const airPlayButton: typeof nativeAirPlay = ({ label, onOpen }) => (
  <Round icon="airplay" label={label} onPress={onOpen} />
)

export const HAS_AIRPLAY: typeof nativeHas = !!mock

export const useExternal: typeof nativeExternal = () => useFrameState().airplay === 'on'

export const usePageInput: typeof nativeInput = ({ onKey, onMove, hideCursor, enabled }) => {
  const latest = useRef({ onKey, onMove })
  latest.current = { onKey, onMove }
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    const key = (e: KeyboardEvent) => latest.current.onKey(e)
    const move = () => latest.current.onMove()
    document.addEventListener('keydown', key)
    document.addEventListener('pointermove', move)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointermove', move)
    }
  }, [enabled])
  useEffect(() => {
    if (!enabled || !hideCursor || typeof document === 'undefined') return
    const root = document.documentElement
    root.style.cursor = 'none'
    return () => {
      root.style.cursor = ''
    }
  }, [enabled, hideCursor])
}
