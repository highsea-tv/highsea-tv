// SPDX-License-Identifier: AGPL-3.0-only
// A poster (poster.tsx in ui-web): 2:3 artwork (or a 16:9 still) with a fallback of the title on
// a gradient, quality pills top left, a status bottom left, the Continue watching bar 7% in from
// the edges, and the title and caption under it. The poster is its own touch target. Artwork is
// decoded at display size by expo-image (tv.md › Performance; https://docs.expo.dev/versions/latest/sdk/image/).
import { Image } from 'expo-image'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { QualityTag } from './badge.tsx'
import { Press } from './press.tsx'
import { Progress } from './progress.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export type PosterProps = {
  title: string
  /** A URL, or a source with headers (a server's artwork needs the device's token). */
  src?: string | { uri: string; headers?: Record<string, string> } | null
  aspect?: 'poster' | 'still'
  onPress?: () => void
  onLongPress?: () => void
  quality?: string[]
  status?: ReactNode
  /** 0–100. */
  progress?: number
  showTitle?: boolean
  caption?: string
  /** The width it's drawn at; the height follows the aspect. */
  width?: number
}

export function Poster({
  title,
  src,
  aspect = 'poster',
  onPress,
  onLongPress,
  quality,
  status,
  progress,
  showTitle,
  caption,
  width,
}: PosterProps) {
  const theme = useTheme()
  const ratio = aspect === 'poster' ? 2 / 3 : 16 / 9
  const art = (
    <View
      style={{
        width: '100%',
        aspectRatio: ratio,
        borderRadius: tokens.radius.poster * theme.u,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
      }}
    >
      {src ? (
        <Image
          source={src}
          style={{ position: 'absolute', inset: 0 }}
          contentFit="cover"
          transition={tokens.durations.color}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            justifyContent: 'flex-end',
            padding: '9%',
            experimental_backgroundImage: `linear-gradient(160deg, ${theme.colors.s3}, ${theme.colors.s1})`,
          }}
        >
          {!showTitle && (
            <Text variant="callout" weight={600} color="text-2" numberOfLines={3}>
              {title}
            </Text>
          )}
        </View>
      )}
      {quality && quality.length > 0 && (
        <View style={{ position: 'absolute', top: '7%', left: '7%', flexDirection: 'row', gap: 4 }}>
          {quality.map((q) => (
            <QualityTag key={q}>{q}</QualityTag>
          ))}
        </View>
      )}
      {status ? (
        <View
          style={{
            position: 'absolute',
            left: '7%',
            right: '7%',
            bottom: progress === undefined ? '7%' : '14%',
            flexDirection: 'row',
          }}
        >
          {status}
        </View>
      ) : null}
      {progress !== undefined && (
        <View style={{ position: 'absolute', left: '7%', right: '7%', bottom: '7%' }}>
          <Progress value={progress} />
        </View>
      )}
    </View>
  )
  const label = showTitle ? (
    <View style={{ marginTop: 8, gap: 2 }}>
      <Text variant="callout" numberOfLines={2}>
        {title}
      </Text>
      {caption ? (
        <Text variant="caption" color="text-3">
          {caption}
        </Text>
      ) : null}
    </View>
  ) : null
  if (!onPress)
    return (
      <View style={{ width }} accessible accessibilityLabel={title}>
        {art}
        {label}
      </View>
    )
  return (
    <Press
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="link"
      accessibilityLabel={[title, caption].filter(Boolean).join(', ')}
      style={{ width }}
    >
      {art}
      {label}
    </Press>
  )
}
