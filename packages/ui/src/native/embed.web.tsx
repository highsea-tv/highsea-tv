// SPDX-License-Identifier: AGPL-3.0-only
// A page embedded in place on the web and in the desktop app: an <iframe>, which react-native-web
// lets a View hold, its components rendering DOM elements
// (https://necolas.github.io/react-native-web/docs/multi-platform/). StillFrame's player. It sends
// the page's origin, not its path, as the referrer (`strict-origin-when-cross-origin`, which the
// attribute asks for this one request whatever the document's policy:
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#referrerpolicy), as
// YouTube's embeds need to play (YouTube API Services' required minimum functionality,
// https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity).
import type { Embed as Native } from './embed.tsx'

export const Embed: typeof Native = ({ src, title }) => (
  <iframe
    src={src}
    title={title}
    referrerPolicy="strict-origin-when-cross-origin"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowFullScreen
    style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
  />
)
