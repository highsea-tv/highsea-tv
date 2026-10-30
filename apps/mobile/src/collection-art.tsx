// SPDX-License-Identifier: AGPL-3.0-only
// A collection's poster, or a mosaic of its first four (collections.md#artwork), and its tile in a
// grid, as the web's kit.tsx draws them: a smart collection carries its badge over the art.
import { Badge, Press, Text, tokens, useTheme } from '@highsea-tv/ui-native'
import { Image } from 'expo-image'
import { View } from 'react-native'
import { useMedia } from './lib/media.ts'

export function CollectionArt({ poster, mosaic }: { poster?: string | null; mosaic: string[] }) {
  const theme = useTheme()
  const media = useMedia()
  const frame = {
    width: '100%' as const,
    aspectRatio: tokens.aspect.poster[0] / tokens.aspect.poster[1],
    borderRadius: tokens.radius.poster,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.s2,
  }
  if (poster || mosaic.length < 2)
    return (
      <View style={frame}>
        <Image
          source={media(poster ?? mosaic[0])}
          style={{ flex: 1 }}
          contentFit="cover"
          transition={150}
        />
      </View>
    )
  return (
    <View style={[frame, { flexDirection: 'row', flexWrap: 'wrap' }]}>
      {mosaic.slice(0, 4).map((src) => (
        <Image
          key={src}
          source={media(src)}
          style={{ width: '50%', height: '50%' }}
          contentFit="cover"
        />
      ))}
    </View>
  )
}

export function CollectionTile({
  name,
  caption,
  label,
  poster,
  mosaic,
  smart,
  onPress,
}: {
  name: string
  caption: string
  label: string
  poster: string | null
  mosaic?: string[]
  smart: string | null
  onPress: () => void
}) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View>
        <CollectionArt poster={mosaic?.length ? null : poster} mosaic={mosaic ?? []} />
        {smart && (
          <View style={{ position: 'absolute', bottom: '7%', left: '7%' }}>
            <Badge overlay icon="filter">
              {smart}
            </Badge>
          </View>
        )}
      </View>
      <View style={{ marginTop: 8, gap: 2 }}>
        <Text variant="callout" numberOfLines={2}>
          {name}
        </Text>
        <Text variant="caption" color="text-3">
          {caption}
        </Text>
      </View>
    </Press>
  )
}
