// SPDX-License-Identifier: AGPL-3.0-only
// The frame on the web: an <iframe>, which react-native-web lets a View hold, its components
// rendering DOM elements (https://necolas.github.io/react-native-web/docs/multi-platform/). It's
// `inert`, so it's a picture of the page and not a second app to tab into or click
// (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert), and taken
// out of the tab order besides. Scaled with a transform from its top left, so its page keeps its
// own width (https://developer.mozilla.org/en-US/docs/Web/CSS/transform-origin).
import type { PageFrame as Native } from './page-frame.tsx'

export const PageFrame: typeof Native = ({ src, title, width, height, scale = 1, ref }) => (
  <iframe
    ref={ref as never}
    src={src}
    title={title}
    inert
    tabIndex={-1}
    style={{
      display: 'block',
      width,
      height,
      border: 0,
      transform: scale === 1 ? undefined : `scale(${scale})`,
      transformOrigin: 'top left',
    }}
  />
)
