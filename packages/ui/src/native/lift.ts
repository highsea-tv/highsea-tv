// SPDX-License-Identifier: AGPL-3.0-only
// A pointer's hover: artwork's lift and a fill's brightening. Posters and the film row's card grow
// to the web's poster scale while the pointer's over them or the keyboard's on them (`hover`'s
// posterScale, 1.02; the prototype's `hover:scale-[1.02]`), on spring.base as
// the web's `transition-lift` runs. Reduced motion keeps them still (motion.md). Internal: Poster,
// FilmRow and PersonTile (at `hover.photoScale`, 1.05) use it. The hover itself is Pressable's `hovered`, which
// react-native-web reports for a mouse or a pen, not for touch
// (https://necolas.github.io/react-native-web/docs/pressable/), passed on by Press with a pointer.
import { hover } from '@highsea-tv/tokens'
import { useEffect } from 'react'
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { tokens, useMotionReduced } from './theme.tsx'

/** The web's poster scale under a pointer (`hover.posterScale`; focus.tv.scalePoster is the TV's). */
export const POINTER_POSTER_SCALE = hover.posterScale

/**
 * The brightness a pointer's hover gives a fill with no hover role (`hover.brightness`): the web
 * renderer's `hover:brightness-108` (primary buttons) and `hover:brightness-110` (danger buttons,
 * the film row's posters).
 */
export const HOVER_BRIGHTNESS = hover.brightness

/** React Native's `filter` at a brightness (https://reactnative.dev/docs/view-style-props#filter). */
export const brighten = (by: number) => `brightness(${by})`

/** The animated style that lifts a view to `scale` while `on`. */
export function useLift(on: boolean, scale: number = POINTER_POSTER_SCALE) {
  const reduced = useMotionReduced()
  const value = useSharedValue(1)
  useEffect(() => {
    const to = on && !reduced ? scale : 1
    value.value = reduced ? to : withSpring(to, tokens.springs.base)
  }, [on, reduced, scale, value])
  return useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }), [value])
}
