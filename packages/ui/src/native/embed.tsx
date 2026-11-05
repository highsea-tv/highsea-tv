// SPDX-License-Identifier: AGPL-3.0-only
// A page embedded in place on the phone: a WebView (react-native-webview), StillFrame's player.
// Its guide: playing inline rather than in iOS's full-screen player takes
// `allowsInlineMediaPlayback`, and a video that starts by itself needs
// `mediaPlaybackRequiresUserAction` off
// (https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#allowsinlinemediaplayback,
// #mediaplaybackrequiresuseraction). The page is framed in an iframe, as the web's is
// (embed.web.tsx), in a document loaded under highsea's own address (`baseUrl`): an embed loaded
// on its own sends no referrer, and YouTube's embeds play only for a client they can identify by it
// (YouTube API Services' required minimum functionality,
// https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity).
//
// The library is required as the player draws, not as this file loads: its module asks
// TurboModuleRegistry.getEnforcing('RNCWebViewModule') at once (react-native-webview's
// NativeRNCWebViewModule.ts), which throws where it isn't linked, as on the Apple TV
// (apps/client/react-native.config.js), which never draws one. An app that draws StillFrame's
// `embed` on the phone depends on react-native-webview itself, for autolinking.
import type { ComponentType } from 'react'
import type { WebViewProps } from 'react-native-webview'

/** The address the framing document is loaded under: its origin is the referrer the embed sends. */
const ORIGIN = 'https://highsea.tv'

const attribute = (s: string) => s.replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`)

/** The page in an iframe that fills the WebView, as the web's attributes have it. */
const framing = (src: string, title: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:transparent}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="${attribute(src)}" title="${attribute(title)}" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`

export function Embed({ src, title }: { src: string; title: string }) {
  const { WebView } = require('react-native-webview') as { WebView: ComponentType<WebViewProps> }
  return (
    <WebView
      source={{ html: framing(src, title), baseUrl: ORIGIN }}
      originWhitelist={[ORIGIN, new URL(src).origin]}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      accessibilityLabel={title}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    />
  )
}
