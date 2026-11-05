// SPDX-License-Identifier: AGPL-3.0-only
// A pointer's hover: artwork's lift and a fill's brightening. Posters and the film row's card grow
// to the web's poster scale while the pointer's over them or the keyboard's on them (ui-web's
// `--scale-poster`, 1.02, in styles.css; the prototype's `hover:scale-[1.02]`), on spring.base as
// the web's `transition-lift` runs. Reduced motion keeps them still (motion.md). Internal: Poster,
// FilmRow and PersonTile (at its own 1.05) use it. The hover itself is Pressable's `hovered`, which
// react-native-web reports for a mouse or a pen, not for touch
// (https://necolas.github.io/react-native-web/docs/pressable/), passed on by Press with a pointer.
import { useEffect } from 'react'
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { tokens, useMotionReduced } from './theme.tsx'

/**
 * The web's poster scale under a pointer. No token holds it yet (focus.tv.scalePoster is the
 * TV's): the web renderer writes it in its CSS, so it's here until part E gives it one.
 */
export const POINTER_POSTER_SCALE = 1.02

/**
 * The brightness a pointer's hover gives a fill with no hover role: the web renderer's
 * `hover:brightness-108` (primary buttons) and `hover:brightness-110` (danger buttons, the film
 * row's posters). No token holds them yet (the control spec's looks have hover roles, not a
 * brightness), so they're here until part E gives them one.
 */
export const HOVER_BRIGHTNESS = { soft: 1.08, strong: 1.1 } as const

/** React Native's `filter` at a brightness (https://reactnative.dev/docs/view-style-props#filter). */
export const brighten = (by: number) => `brightness(${by})`

/** The animated style that lifts a view to `scale` while `on`. */
export function useLift(on: boolean, scale = POINTER_POSTER_SCALE) {
  const reduced = useMotionReduced()
  const value = useSharedValue(1)
  useEffect(() => {
    const to = on && !reduced ? scale : 1
    value.value = reduced ? to : withSpring(to, tokens.springs.base)
  }, [on, reduced, scale, value])
  return useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }))
}
