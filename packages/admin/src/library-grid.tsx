'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// What the admin's Movies and Shows share now that they show the whole library, as the clients'
// libraries do (the owner, 2026-11-18, HT-57):
// - the grid draws only the rows near the screen, through the library's VirtualGrid, the clients'
//   own (ADR 0061's 2026-11-06 section), in the shell's scroller: as many 136-wide columns as fit,
//   16 apart and 20 between rows, as PosterGrid lays Discover's out;
// - sorted by title, the clients' A–Z index (the library's LetterIndex, in its pointer form) stands
//   inside the surface that holds the grid or table, along its left edge within its padding (the
//   owner, 2026-11-18: a rail between the sidebar and the page set the list apart from its index),
//   and stays under the page's top as it scrolls (CSS `position: sticky`, which react-native-web
//   passes through: https://necolas.github.io/react-native-web/docs/styling/, and
//   https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky; the frame clips with
//   `overflow: clip` on the web so the index can stick inside it, see TableFrame). A compact width
//   has none, as the clients' web library has none (its `medium:block`). A letter scrolls its first
//   title's row to that line, drawn or not: every title is read, only the drawing is windowed.
import { LETTERS, letterFirsts } from '@highsea-tv/core/letters'
import {
  LetterIndex,
  POINTER_LETTER,
  tokens,
  useFormFactor,
  useScrollSourceOrNull,
  VirtualGrid,
  type VirtualGridHandle,
} from '@highsea-tv/ui/native'
import { type ReactNode, type Ref, useMemo, useState } from 'react'
import { useWindowDimensions, View, type ViewStyle } from 'react-native'
import { POSTER_GAP, POSTER_MIN } from './media-sections.tsx'

/** Where a jump puts a letter's first title, and where the index stays: under the page's top. */
export const STUCK = tokens.space['6']
/** The room a poster's title and caption take under it, for a row's estimate before it's measured. */
const CAPTION = tokens.space['10']
/** The width the grid is counted at before it's laid out: near enough for the first frame. */
const FIRST_WIDTH = 1000

/** A library's posters in rows, drawing only those near the screen. */
export function LibraryPosters<T>({
  items,
  keyOf,
  label,
  render,
  ref,
}: {
  items: readonly T[]
  keyOf: (item: T) => string
  label: string
  render: (item: T, index: number) => ReactNode
  ref?: Ref<VirtualGridHandle>
}) {
  const [width, setWidth] = useState<number | null>(null)
  const span = width ?? FIRST_WIDTH
  const columns = Math.max(
    1,
    Math.floor((span + POSTER_GAP.column) / (POSTER_MIN + POSTER_GAP.column)),
  )
  const cell = (span - (columns - 1) * POSTER_GAP.column) / columns
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <VirtualGrid
        ref={ref}
        items={items}
        keyOf={keyOf}
        render={render}
        label={label}
        columns={columns}
        gap={POSTER_GAP}
        estimate={Math.round(cell * 1.5 + CAPTION)}
      />
    </View>
  )
}

/** Each letter's first title in a list sorted by title, and the letters that have titles. */
export function useLetters<T>(items: readonly T[], sortedOf: (item: T) => string, on: boolean) {
  return useMemo(() => {
    const firsts: Map<string, number> = on ? letterFirsts(items, sortedOf) : new Map()
    return { firsts, present: new Set<string>(firsts.keys()) }
  }, [items, sortedOf, on])
}

/** `position: sticky`, which React Native's style types don't name. */
const sticky = (top: number) => ({ position: 'sticky', top }) as unknown as ViewStyle

/**
 * A surface's body (its grid or table) with the A–Z index along its left edge while `shown`, within
 * the surface's padding (`inset`), sticking under the page's top as the body scrolls past.
 */
export function WithLetters({
  shown,
  present,
  label,
  inset,
  onLetter,
  children,
}: {
  shown: boolean
  present: Set<string>
  label: string
  inset: number
  onLetter: (letter: string) => void
  children: ReactNode
}) {
  const compact = useFormFactor().widthClass === 'compact'
  const window = useWindowDimensions().height
  const viewport = useScrollSourceOrNull()?.viewport?.height
  if (!shown || compact) return <>{children}</>
  // the letters share the height the scroller shows under the line they stay on: what lies under
  // the scroller (the status bar) counts as above them
  const top = (viewport ? Math.max(0, window - viewport) : 0) + STUCK
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: POINTER_LETTER, marginLeft: inset, marginVertical: inset }}>
        <View style={sticky(STUCK)}>
          <LetterIndex
            letters={LETTERS}
            present={present}
            label={label}
            top={top}
            onLetter={onLetter}
          />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  )
}
