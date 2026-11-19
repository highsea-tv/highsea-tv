// SPDX-License-Identifier: AGPL-3.0-only
// The title hero: a page's art full bleed at its top, faded into the page, with its words over or
// under it, one part per form factor that a film's page, a show's, a collection's and Home's
// featured section (when it's Home's first section) all draw, so they can't drift apart (the
// owner's call of 2026-11-18). The art and its fades are the library's TitleBackdrop:
// - touch (mobile/detail.tsx): the art at 16:9 across the top, under the status bar, the words
//   pulled up over its foot (TouchHero);
// - a pointer (web/detail.tsx): the art filling the hero, which from a regular window runs under
//   the top bar, clear until the page scrolls under it and glass after (kit's useChromeOverlay),
//   and fills the first screen less a peek of what's next; the words low on the left, inside the
//   page's measure (PointerHero, usePointerHero);
// - the TV (tv/detail.tsx): the art sharp across the first screen behind the head, which lies over
//   the page and scrolls away with it; the words low on the left, the next row's title peeking at
//   the foot (TvHero, inside the page's Kept).
import { REGULAR_WIDTH } from '@highsea-tv/tokens'
import {
  TitleBackdrop,
  type TitleBackdropProps,
  tokens,
  usePageGutter,
  usePageMeasure,
  useTheme,
} from '@highsea-tv/ui'
import type { ReactNode } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useChromeOverlay } from '../kit.tsx'
import { FILM_TV } from './layout.ts'

const { space } = tokens
const tv = tokens.tv

type TileSource = TitleBackdropProps['source']

/** A pointer's hero, never shorter than 32rem; and from 768 the share of the window's height
 * it fills, at most a 16:9 frame of its width (web/detail.tsx's heroHeight). */
const HERO = {
  min: space['16'] * 8,
  share: 0.82,
  frame: tokens.aspect.still[1] / tokens.aspect.still[0],
}

/** The pointer hero's words' column (web/detail.tsx's max-w-[40rem]). */
export const HERO_WORDS = space['16'] * 10

/**
 * A hero with a pointer, loaded or loading (web/detail.tsx's heroHeight): from 768 it runs under
 * the top bar (`overlay`, for useChromeOverlay) and fills the first screen less the next row's
 * title peeking under it, min(82svh, 56.25vw); below it the page starts under the bar. Never
 * under 32rem.
 */
export function useHero() {
  const window = useWindowDimensions()
  const overlay = window.width >= REGULAR_WIDTH
  const fill = Math.min(window.height * HERO.share, window.width * HERO.frame)
  return { overlay, minHeight: overlay ? Math.max(HERO.min, fill) : HERO.min }
}

/**
 * The hero's measures and the top bar laid over it: hand `chrome` to the page's scroller and
 * `hero` to PointerHero. `on` false leaves the bar as the page had it (Home without a hero first).
 */
export function usePointerHero(on = true) {
  const hero = useHero()
  const chrome = useChromeOverlay(hero.overlay && on)
  return { hero: { minHeight: hero.minHeight, pad: chrome.pad }, chrome }
}

export type PointerHeroProps = {
  source: TileSource
  hero: { minHeight: number; pad: number }
  /** The words and actions, low on the left, inside the page's measure. */
  children: ReactNode
  /** Laid over the hero's foot at its end side, inside the measure (Home's pager). */
  end?: ReactNode
}

/** A pointer's hero: the art filling it, the words at its foot (web/detail.tsx). */
export function PointerHero({ source, hero, children, end }: PointerHeroProps) {
  const measure = usePageMeasure()
  const gutter = usePageGutter()
  return (
    <View style={{ minHeight: hero.minHeight, justifyContent: 'flex-end', overflow: 'hidden' }}>
      <TitleBackdrop source={source} />
      <View
        style={{
          width: '100%',
          maxWidth: measure,
          alignSelf: 'center',
          gap: space['4'],
          // clear of the top bar, then the prototype's pt-28 less the bar's height
          paddingTop: hero.pad + space['8'],
          paddingBottom: space['10'],
          paddingHorizontal: gutter,
        }}
      >
        {children}
        {end ? (
          <View style={{ position: 'absolute', right: gutter, bottom: space['10'], zIndex: 1 }}>
            {end}
          </View>
        ) : null}
      </View>
    </View>
  )
}

/** Touch's hero: the art across the top, under the status bar, the words over its foot. */
export function TouchHero({
  source,
  children,
  gap = space['3'],
}: {
  source: TileSource
  children: ReactNode
  gap?: number
}) {
  const gutter = usePageGutter()
  return (
    <View>
      <TitleBackdrop source={source} />
      <View style={{ marginTop: -space['16'], paddingHorizontal: gutter, gap }}>{children}</View>
    </View>
  )
}

/**
 * The TV's hero: the art across the first screen and the words' block under the head, the first
 * screen less the next row's title (FILM_TV). Put it in the page's `<Kept rest>`.
 */
export function TvHero({ source, children }: { source: TileSource; children: ReactNode }) {
  const u = useTheme().u
  return (
    <>
      <TitleBackdrop source={source} />
      <View
        style={{
          // under the head, which lies over the page (the prototype's TvHead in the grid's flow):
          // React Native's boxes are border-box, so the height holds the padding
          // (https://reactnative.dev/docs/layout-props#boxsizing)
          height: (FILM_TV.top + FILM_TV.words) * u,
          paddingTop: FILM_TV.top * u,
          maxWidth: '50%',
          justifyContent: 'flex-end',
          gap: tv.poster.gap * u,
          paddingHorizontal: tv.safe.x * u,
        }}
      >
        {children}
      </View>
    </>
  )
}
