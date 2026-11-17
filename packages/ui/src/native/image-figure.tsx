// SPDX-License-Identifier: AGPL-3.0-only
// A picture in running text, such as a guide's screenshot (one-client-platform-e.md › The guides
// on the library): the library's Image at the picture's own width and height, no wider than its
// column, on the large corner, with space above and below as a paragraph has. React Native's
// Image lays out from a size, never the file's (https://reactnative.dev/docs/image#source), so the
// width and height are given, and they set the aspect ratio. The guides take them from
// fumadocs-mdx's Remark Image, which reads every local image's size at build
// (https://www.fumadocs.dev/docs/headless/mdx/remark-image). It isn't decorative: `label`, the
// guide's alt text, is what a screen reader reads (the Image's `alt` on the web).
// The picture is its own placeholder too (expo-image's `placeholder`,
// https://docs.expo.dev/versions/latest/sdk/image/#placeholder), at the same fit: on the web
// expo-image adds its source's `<img>` in an effect after mounting (its AnimationManager), and
// draws only the placeholder in its first render, so a page rendered on the server, such as a
// guide in the static export, shows the picture before any script runs, and with none.
import { View } from 'react-native'
import { Image, type ImageSource } from './image.tsx'
import { tokens } from './theme.tsx'

export type ImageFigureProps = {
  source: ImageSource | string
  /** The picture's own size, in pixels. */
  width: number
  height: number
  /** What it shows, in words. */
  label: string
}

export function ImageFigure({ source, width, height, label }: ImageFigureProps) {
  return (
    <View
      style={{
        width: '100%',
        maxWidth: width,
        aspectRatio: width / height,
        marginVertical: tokens.space['8'],
        borderRadius: tokens.radius.lg,
        overflow: 'hidden',
      }}
    >
      <Image
        source={source}
        accessibilityLabel={label}
        contentFit="contain"
        placeholder={source}
        placeholderContentFit="contain"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  )
}
