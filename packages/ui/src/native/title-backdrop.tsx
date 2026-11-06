// SPDX-License-Identifier: AGPL-3.0-only
// A title page's art (a film's, a show's), one part with a form per form factor, each faded into
// the page's `bg` as its prototype fades it:
// - touch: the backdrop at 16:9 across the top of the page, in the page's flow, faded from its
//   foot (mobile/detail.tsx's `fade`); the page's words pull up over its foot;
// - a pointer: the backdrop filling its parent, the hero, behind the words, faded at the words'
//   side and at the foot, so the right half stays the picture's (web/detail.tsx);
// - the TV: the backdrop sharp and full bleed across the first screen (BACKDROP_HEIGHT), faded the
//   same way, behind the page's first screen, scrolling with it (tv/detail.tsx).
// React Native draws CSS gradients itself (https://reactnative.dev/docs/view-style-props#backgroundimage).

import { StyleSheet, View } from 'react-native'
import { alpha } from './alpha.ts'
import { Image } from './image.tsx'
import { useTheme } from './theme.tsx'
import type { TileSource } from './tv/tiles.tsx'

/** The TV's art's height: one 16:9 screen, in units. */
export const BACKDROP_HEIGHT = 56.25

export type TitleBackdropProps = { source: TileSource | undefined }

export function TitleBackdrop({ source }: TitleBackdropProps) {
  const theme = useTheme()
  const input = theme.formFactor.input
  const bg = theme.colors.bg
  const clear = alpha(bg, 0)
  const art = source ? (
    <Image
      source={source}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  ) : null
  if (input === 'touch')
    return (
      <View
        pointerEvents="none"
        style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: theme.colors.s1 }}
      >
        {art}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundImage: `linear-gradient(0deg, ${bg} 2%, ${clear} 55%)` },
          ]}
        />
      </View>
    )
  // the words' side, then the foot: the TV's a little shorter at each, for the screen's height
  const fade =
    input === 'tv'
      ? `linear-gradient(90deg, ${bg} 0%, ${alpha(bg, 0.85)} 22%, ${clear} 58%), linear-gradient(0deg, ${bg} 4%, ${clear} 40%)`
      : `linear-gradient(90deg, ${bg} 0%, ${alpha(bg, 0.8)} 25%, ${clear} 62%), linear-gradient(0deg, ${bg} 2%, ${clear} 42%)`
  return (
    <View
      pointerEvents="none"
      style={[
        input === 'tv'
          ? { position: 'absolute', top: 0, left: 0, right: 0, height: BACKDROP_HEIGHT * theme.u }
          : StyleSheet.absoluteFill,
        { backgroundColor: theme.colors.s1 },
      ]}
    >
      {art}
      <View style={[StyleSheet.absoluteFill, { backgroundImage: fade }]} />
    </View>
  )
}
