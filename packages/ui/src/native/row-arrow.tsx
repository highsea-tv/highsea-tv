// SPDX-License-Identifier: AGPL-3.0-only
// A row's paging arrow at its edge, for a pointer only (the prototype's web rows, ui-web's
// CarouselRow and the web's film row): over the row's gutter, faded from the page's background,
// fading in while the pointer is over the row (CarouselRow's transition-tint, durations.color),
// and hidden from assistive technology and the Tab order,
// as the keyboard has its own way along a row. Row's arrow is faded into the page from its edge,
// as CarouselRow's; FilmRow's row fades under a mask already, so its arrow is a disc (`disc`, the
// prototype's size-10 circle in the background at 70%). Internal: Row and FilmRow draw it.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { alpha } from './alpha.ts'
import { Icon } from './icon.tsx'
import { Press } from './press.tsx'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'

export function RowArrow({
  dir,
  width,
  shown,
  disc = false,
  onPress,
}: {
  dir: 1 | -1
  /** The gutter it sits over. */
  width: number
  /** The pointer's over the row and there's more that way. */
  shown: boolean
  /** On a disc of the background, rather than over a fade. */
  disc?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const bg = theme.colors.bg
  const opacity = useSharedValue(shown ? 1 : 0)
  useEffect(() => {
    const to = shown ? 1 : 0
    opacity.value = reduced ? to : withTiming(to, { duration: tokens.durations.color })
  }, [shown, reduced, opacity])
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }), [opacity])
  return (
    <Animated.View
      pointerEvents={shown ? 'auto' : 'none'}
      style={[
        {
          position: 'absolute',
          top: 0,
          bottom: 0,
          [dir < 0 ? 'left' : 'right']: 0,
          zIndex: 20,
          width: Math.max(width, tokens.space['10']),
        },
        fade,
      ]}
    >
      <Press
        onPress={onPress}
        ring={false}
        focusable={false}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          // React Native's backgroundImage (https://reactnative.dev/docs/view-style-props#backgroundimage),
          // which react-native-web writes as CSS's background-image
          backgroundImage: disc
            ? undefined
            : `linear-gradient(${dir < 0 ? 90 : 270}deg, ${bg}, ${alpha(bg, 0)})`,
        }}
      >
        <View
          pointerEvents="none"
          style={
            disc
              ? {
                  width: tokens.space['10'],
                  height: tokens.space['10'],
                  borderRadius: tokens.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: alpha(bg, 0.7),
                }
              : undefined
          }
        >
          <Icon name={dir < 0 ? 'chevron-left' : 'chevron-right'} size={tokens.icon.size.lg} />
        </View>
      </Press>
    </Animated.View>
  )
}
