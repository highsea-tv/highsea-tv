// SPDX-License-Identifier: AGPL-3.0-only
// The film itself, on the phone and the TV (the native side of a platform pair; ./picture.web.tsx
// is the web's, README.md › Platform files): expo-video's VideoView for the engine's player
// (`@highsea-tv/native/playback`), with what the picture owns beside it: picture in picture,
// AirPlay's picker, the volume and the speed. The engine hands the subtitle's cues over (`cues`),
// so the screen draws them (DRAWS_CUES). Picture in picture is AVKit's, from the button or by
// leaving the app while playing, and AirPlay is iOS's own picker
// (https://docs.expo.dev/versions/latest/sdk/video/#videoviewprops); the docs list neither for
// tvOS, where the view only shows the film.
import type { Playback } from '@highsea-tv/native/playback'
import { player as playerSizes } from '@highsea-tv/tokens'
import { tokens } from '@highsea-tv/ui'
import { useEventListener } from 'expo'
import { VideoAirPlayButton, VideoView } from 'expo-video'
import { type ReactNode, useRef, useState } from 'react'
import { Platform, View } from 'react-native'

/** What the picture's controls change: the same on every platform, whatever draws them. */
export type MediaControls = {
  pip: { available: boolean; on: boolean; toggle: () => void }
  muted: boolean
  /** 0 to 1. */
  volume: number
  setVolume: (volume: number) => void
  toggleMute: () => void
  /** The playback speed, 1 at normal. */
  rate: number
  setRate: (rate: number) => void
  /** The page's full screen, where there is one to ask for (the web). */
  fullScreen: { on: boolean; toggle: () => void } | null
}

export type PictureOptions = {
  /** Dimmed under a message: playing on another screen. */
  dim: boolean
  /** The subtitle sits higher while the controls show (the browser's own drawing of it). */
  raised: boolean
}

/** Whether the screen draws the subtitle's lines itself (the engine hands over its cues). */
export const DRAWS_CUES: boolean = true

/** The picture, and its controls. */
export function usePicture(
  p: Playback,
  o: PictureOptions,
): { picture: ReactNode; controls: MediaControls } {
  const view = useRef<VideoView>(null)
  const player = p.player
  const [pip, setPip] = useState(false)
  const [sound, setSound] = useState(() => ({ volume: player.volume, muted: player.muted }))
  const [rate, setRate] = useState(() => player.playbackRate)
  useEventListener(player, 'volumeChange', ({ volume }) => setSound((s) => ({ ...s, volume })))
  useEventListener(player, 'mutedChange', ({ muted }) => setSound((s) => ({ ...s, muted })))
  useEventListener(player, 'playbackRateChange', ({ playbackRate }) => setRate(playbackRate))
  const tv = Platform.isTV
  const picture = tv ? (
    // AVPlayerViewController's view takes focus on tvOS even without its controls, and would
    // catch Left and Right from the scrubber and OK after them. The focus engine skips views that
    // don't take user interaction (Apple's "Supporting focus within your app"), which pointerEvents
    // none sets; collapsable keeps the wrapper from being flattened away
    <View pointerEvents="none" collapsable={false} style={{ position: 'absolute', inset: 0 }}>
      <VideoView player={player} nativeControls={false} contentFit="contain" style={{ flex: 1 }} />
    </View>
  ) : (
    <VideoView
      ref={view}
      player={player}
      nativeControls={false}
      contentFit="contain"
      // Live Text's button sits over the video, under the player's own controls; none is drawn
      // (https://developer.apple.com/documentation/avkit/avplayerviewcontroller/allowsvideoframeanalysis)
      allowsVideoFrameAnalysis={false}
      allowsPictureInPicture
      startsPictureInPictureAutomatically
      onPictureInPictureStart={() => setPip(true)}
      onPictureInPictureStop={() => setPip(false)}
      style={{ position: 'absolute', inset: 0, opacity: o.dim ? 0.35 : 1 }}
    />
  )
  return {
    picture,
    controls: {
      pip: {
        available: !tv,
        on: pip,
        toggle: () =>
          void (pip ? view.current?.stopPictureInPicture() : view.current?.startPictureInPicture()),
      },
      muted: sound.muted,
      volume: sound.volume,
      setVolume: (volume) => {
        player.volume = volume
        player.muted = volume === 0
      },
      toggleMute: () => {
        player.muted = !player.muted
      },
      rate,
      setRate: (r) => {
        player.playbackRate = r
      },
      fullScreen: null,
    },
  }
}

/**
 * iOS's AirPlay picker, which shows the devices nearby; nothing where there's no AirPlay. A plain
 * function rather than a component, since each platform file has its own and a component is one
 * module's (scripts/one-place.ts › parts): the screen calls it.
 */
export function airPlayButton({
  label,
  tint,
  activeTint,
  onOpen,
}: {
  label: string
  tint: string
  activeTint: string
  onOpen: () => void
}): ReactNode {
  return (
    <View
      accessibilityLabel={label}
      style={{
        width: tokens.targets.touch,
        height: tokens.targets.touch,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <VideoAirPlayButton
        tint={tint}
        activeTint={activeTint}
        prioritizeVideoDevices
        onBeginPresentingRoutes={onOpen}
        style={{ width: playerSizes.icon.lg, height: playerSizes.icon.lg }}
      />
    </View>
  )
}

/** Whether this platform has AirPlay's picker to draw (iOS's). */
export const HAS_AIRPLAY: boolean = true

/** Whether the film plays on another screen: AirPlay's, as the engine hears it. */
export function useExternal(p: Playback): boolean {
  return p.external
}

/**
 * The page's keys and the pointer's moves, for a pointer's shortcuts (Space, ←/→, M, F, Esc). The
 * phone and the TV have no page: the TV's remote is @highsea-tv/ui/tv's useRemote.
 */
export function usePageInput(_o: {
  onKey: (e: { key: string; target: unknown; preventDefault: () => void }) => void
  onMove: () => void
  /** The pointer's cursor hides with the controls. */
  hideCursor: boolean
  enabled: boolean
}) {}
