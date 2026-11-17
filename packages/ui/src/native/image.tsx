// SPDX-License-Identifier: AGPL-3.0-only
// The library's one image: expo-image's, decorative unless it's given a label. Artwork beside a
// title (a poster, a backdrop, a still) says nothing the title doesn't, so on the web it's an
// `<img alt="">`, which assistive technology skips (WAI's decorative images,
// https://www.w3.org/WAI/tutorials/images/decorative/); without `alt` at all a screen reader reads
// the address instead, and axe's image-alt fails it. expo-image's web writes `alt` from
// `accessibilityLabel` alone (its ImageWrapper), so that's what carries the empty one. On the phone
// and the TV an image isn't an accessibility element unless asked, so the empty label changes
// nothing there.
import { Image as ExpoImage, type ImageProps } from 'expo-image'

export type { ImageSource } from 'expo-image'

export function Image({ accessibilityLabel, ...props }: ImageProps) {
  return <ExpoImage {...props} accessibilityLabel={accessibilityLabel ?? ''} />
}
