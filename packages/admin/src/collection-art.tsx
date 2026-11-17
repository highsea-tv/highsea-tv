'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A collection's poster (collections.md#artwork), ported from the prototype's kit/collection-art.tsx:
// the one chosen, or a mosaic of its first four posters, as Plex draws a smart collection's. Drawn
// with React Native's View and Image (https://reactnative.dev/docs/image), which react-native-web
// writes as a `div` with the picture as its background and an `<img>` for the browser's own
// loading (https://necolas.github.io/react-native-web/docs/image/).
import { art, line } from '@highsea-tv/tokens'
import { alpha, Image, tokens, useTheme } from '@highsea-tv/ui/native'
import { View } from 'react-native'

/**
 * The web's inset hairline over the art: the art's edge (`art.edge`, `text` at 0.04), a thin line
 * wide.
 */
const hairline = (colors: Record<'text', string>) =>
  `inset 0 0 0 ${line.thin}px ${alpha(colors[art.edge.role], art.edge.alpha)}`
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const

export function CollectionArt({
  poster,
  mosaic,
  width,
  radius = tokens.radius.poster,
}: {
  /** The chosen poster. */
  poster?: string | null
  /** Up to four posters; used when there's no chosen one. */
  mosaic: string[]
  /** Its width; the height follows the poster's 2:3. */
  width: number
  /** Its corners (the poster's by default). */
  radius?: number
}) {
  const theme = useTheme()
  const [w, h] = tokens.aspect.poster
  const frame = {
    width,
    aspectRatio: w / h,
    overflow: 'hidden',
    borderRadius: radius,
    backgroundColor: theme.colors.s2,
  } as const
  const one = poster || mosaic.length < 2
  const src = poster ?? mosaic[0]
  return (
    <View aria-hidden style={frame}>
      {one ? (
        src ? (
          <Image source={{ uri: src }} alt="" contentFit="cover" style={FILL} />
        ) : null
      ) : (
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: line.thin }}>
          {[0, 1, 2, 3].map((i) => (
            <Image
              key={i}
              source={{ uri: mosaic[i % mosaic.length] }}
              alt=""
              contentFit="cover"
              style={{
                width: (width - line.thin) / 2,
                height: ((width * h) / w - line.thin) / 2,
              }}
            />
          ))}
        </View>
      )}
      {/* the hairline over the art, as the web's inset shadow */}
      <View
        pointerEvents="none"
        style={[FILL, { borderRadius: radius, boxShadow: hairline(theme.colors) }]}
      />
    </View>
  )
}
