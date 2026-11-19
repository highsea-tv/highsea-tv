// SPDX-License-Identifier: AGPL-3.0-only
// A title's logo where its name is the headline over its art, as the streaming apps set it: a
// film's, a show's or a collection's hero, Home's featured title, and a film row's open card (the
// owner's call of 2026-11-18). One part, so every place sizes it the same, at the signed-off
// prototypes' sizes (design/prototypes before B1: web/detail.tsx's max-h-32 and
// max-w-[min(26rem,80%)], mobile/detail.tsx's max-h-20 and max-w-[75%], tv/detail.tsx's 8.5u by
// 30u; web/home.tsx's card at clamp(4rem,9vw,8rem) by min(26rem,70%), tv/home.tsx's 7u by 26u;
// a film row's card, by its frame: web/film-row.tsx's 70% of its width by 26% of its height,
// tv/film-row.tsx's 14u by 4u), held to the left and lifted off the art by a soft shadow.
// The name stands in when there's no logo, and if the logo fails to load. The logo keeps the name
// as its accessible label, and the heading's role and level the name would have had. Its box is
// the most it may take until the image says its shape (expo-image's onLoad), then fits it.
import { art } from '@highsea-tv/tokens'
import { type ReactNode, useState } from 'react'
import { Platform, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { alpha } from './alpha.ts'
import { Image } from './image.tsx'
import { Text, type TextProps } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'
import type { TileSource } from './tv/tiles.tsx'

const { space } = tokens

/** The logo's largest box: a title page's hero, or a card's (Home's featured card, a row's card). */
export type TitleLogoScale = 'hero' | 'card'

/** The shadow under the logo (the prototypes' drop-shadow: 2px down, 8px or 10px soft, black at 0.5). */
const SHADOW = { y: space['0.5'], blur: { touch: space['2'], other: space['2.5'] }, alpha: 0.5 }

/** The logo's largest box at this form factor and window. */
function useLogoBox(scale: TitleLogoScale): { width: number; height: number } {
  const theme = useTheme()
  const window = useWindowDimensions()
  const input = theme.formFactor.input
  const u = theme.u
  if (input === 'tv')
    return scale === 'hero' ? { width: 30 * u, height: 8.5 * u } : { width: 26 * u, height: 7 * u }
  if (input === 'touch')
    return {
      width: (window.width - tokens.mobile.gutter * 2) * 0.75,
      height: space['16'] + space['4'],
    }
  const most = space['16'] * 6.5
  if (scale === 'card')
    return {
      width: Math.min(most, window.width * 0.7),
      height: Math.min(space['16'] * 2, Math.max(space['16'], window.width * 0.09)),
    }
  return { width: Math.min(most, window.width * 0.8), height: space['16'] * 2 }
}

export type TitleLogoProps = {
  title: string
  /** The title's logo, or nothing: then its name. */
  logo: TileSource | undefined
  scale?: TitleLogoScale
  /** The name's look when it stands in. */
  variant?: TextProps['variant']
  size?: number
  numberOfLines?: number
  /** A heading's level for the name or the logo; the name is a heading either way. */
  'aria-level'?: number
  /** Drawn instead of the name when there's no logo (a card's own type for it, say). */
  fallback?: ReactNode
  /** The logo's largest box, when the place sizes it by its own frame (a film row's card). */
  box?: { width: number; height: number }
}

export function TitleLogo({
  title,
  logo,
  scale = 'hero',
  variant = 'display',
  size,
  numberOfLines,
  'aria-level': level,
  fallback,
  box: given,
}: TitleLogoProps) {
  const theme = useTheme()
  const scaled = useLogoBox(scale)
  const box = given ?? scaled
  const [failed, setFailed] = useState<string | null>(null)
  const [ratio, setRatio] = useState<{ of: string; r: number } | null>(null)
  const key = typeof logo === 'string' ? logo : (logo?.uri ?? null)
  if (!logo || !key || failed === key)
    return (
      fallback ?? (
        <Text
          variant={variant}
          size={size}
          numberOfLines={numberOfLines}
          accessibilityRole="header"
          aria-level={level}
        >
          {title}
        </Text>
      )
    )
  const r = ratio?.of === key ? ratio.r : null
  const height = r ? Math.min(box.height, box.width / r) : box.height
  const width = r ? height * r : box.width
  const input = theme.formFactor.input
  const blur = (input === 'touch' ? SHADOW.blur.touch : SHADOW.blur.other) * theme.u
  // the web draws CSS's drop-shadow, which follows the logo's own shape; iOS shadows a view
  // without a background by its content's alpha (https://reactnative.dev/docs/shadow-props)
  const shadow: ViewStyle =
    Platform.OS === 'web'
      ? ({
          filter: `drop-shadow(0 ${SHADOW.y * theme.u}px ${blur}px ${alpha(art.black, SHADOW.alpha)})`,
        } as ViewStyle)
      : {
          shadowColor: art.black,
          shadowOpacity: SHADOW.alpha,
          shadowRadius: blur / 2,
          shadowOffset: { width: 0, height: SHADOW.y * theme.u },
        }
  return (
    <View
      accessible
      accessibilityRole="header"
      aria-level={level}
      accessibilityLabel={title}
      style={[{ width, height, alignSelf: 'flex-start' }, shadow]}
    >
      <Image
        source={logo}
        style={{ width, height }}
        contentFit="contain"
        contentPosition="left"
        accessibilityIgnoresInvertColors
        onLoad={(e) => {
          const { width: w, height: h } = e.source
          if (w > 0 && h > 0) setRatio({ of: key, r: w / h })
        }}
        onError={() => setFailed(key)}
      />
    </View>
  )
}
