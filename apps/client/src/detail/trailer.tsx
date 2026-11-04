// SPDX-License-Identifier: AGPL-3.0-only
// A film's trailer on the web, in the desktop app and on the phone (client-detail.md › Trailer;
// the owner's answers 2, 9 and 10 at B1's review), from the prototypes' client/trailer.tsx: a large
// dialog titled with the video's name, the player in a still-shaped frame, and the video's kind
// under it. The player loads only once the dialog opens. The TV has none until the server keeps
// trailer files (the owner's call of 2026-11-02). In mock mode, which the prototypes' frames and
// the captures run, the still and the prototype's note stand in, so nothing loads YouTube.
//
// The player is YouTube's privacy-enhanced mode: an embed from www.youtube-nocookie.com doesn't
// store information about the person until they play it (YouTube Help, "Embed videos and
// playlists" › Turn on privacy-enhanced mode, https://support.google.com/youtube/answer/171780),
// and `autoplay=1` starts it as the dialog opens
// (https://developers.google.com/youtube/player_parameters#autoplay). That host alone (answer 9):
// /web's CSP and the desktop webview's `frame-src` name it and nothing else (ADR 0003's and
// 0058's 2026-11-03 sections). StillFrame's `embed` draws it: an iframe on the web and in the
// desktop app, a WebView on the phone (react-native-webview, which this app depends on for
// autolinking, and which the Apple TV's build leaves unlinked: react-native.config.js).
import type { ClientDetail } from '@highsea-tv/api-contract'
import { previewOf } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { Dialog, StillFrame, Text } from '@highsea-tv/ui'
import { detailMessages } from './messages.ts'

export type Trailer = ClientDetail['videos'][number]

/**
 * The Trailer button's video: the first trailer, or a teaser before release (previewOf, as the
 * prototype's), from YouTube only, the one host the embed and `frame-src` allow (answer 9).
 */
export const trailerOf = (d: ClientDetail): Trailer | undefined =>
  previewOf({ videos: d.videos.filter((v) => v.site === 'YouTube') })

export const trailerUrl = (key: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?autoplay=1`

/** Mock mode, as transport.ts reads it: Expo inlines EXPO_PUBLIC_ variables as it bundles. */
const MOCK = process.env.EXPO_PUBLIC_HIGHSEA_MOCK === '1'

export function TrailerDialog({ video, onClose }: { video: Trailer | null; onClose: () => void }) {
  const t = useT(detailMessages)
  const media = useMedia()
  return (
    <Dialog
      open={video !== null}
      onClose={onClose}
      closable
      size="lg"
      title={video?.name ?? t('trailer')}
    >
      {video ? (
        <>
          {MOCK ? (
            <StillFrame still={media(video.still)} note={t('trailerMock')} />
          ) : (
            <StillFrame embed={{ src: trailerUrl(video.key), title: video.name }} />
          )}
          {/* the prototype's "kind · length": the contract has no length (TMDB gives none) */}
          <Text variant="caption" color="text-3">
            {t(`kind.${video.kind}`)}
          </Text>
        </>
      ) : null}
    </Dialog>
  )
}
