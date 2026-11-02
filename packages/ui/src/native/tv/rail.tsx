// SPDX-License-Identifier: AGPL-3.0-only
// The alphabet rail beside a library sorted by title (the prototype's tv/library.tsx): a column
// of its own at the safe area's left edge, from `top` to the safe area's foot, its square letters
// sharing that height. It stays put while the page under it scrolls. Only letters with titles take
// focus, Up and Down stay inside it (its guide traps them), and OK hands the letter to `onLetter`,
// which moves focus to that letter's first title. The focus engine would enter it at whichever
// letter lies level with the tile, so its guide sends focus to the focused title's letter instead
// (react-native-tvos's TVFocusGuideView `destinations`).
import { useRef } from 'react'
import { TVFocusGuideView, useWindowDimensions, View } from 'react-native'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { Focusable, type ViewHandle } from './focusable.tsx'

const tv = tokens.tv

/** The rail's column, in units: the room a grid leaves for it beside its first column. */
export const RAIL_WIDTH = 2

export function TvLetterRail({
  letters,
  present,
  at,
  top,
  label,
  onLetter,
}: {
  letters: readonly string[]
  /** The letters with titles. */
  present: Set<string>
  /** The focused title's letter, where focus enters. */
  at: string
  /** Where the rail starts, in points from the screen's top: level with the grid's first row. */
  top: number
  label: string
  onLetter: (letter: string) => void
}) {
  const theme = useTheme()
  const u = theme.u
  const { height } = useWindowDimensions()
  const stops = useRef(new Map<string, ViewHandle | null>())
  const to = stops.current.get(at)
  // square: a share of the height to the safe area's foot, or the column's width if that's less
  const size = Math.min((height - top - tv.safe.y * u) / letters.length, RAIL_WIDTH * u)
  return (
    <TVFocusGuideView
      destinations={to ? [to] : []}
      trapFocusUp
      trapFocusDown
      accessibilityLabel={label}
      style={{ position: 'absolute', top, left: tv.safe.x * u, width: RAIL_WIDTH * u, zIndex: 10 }}
    >
      {letters.map((l) => {
        const has = present.has(l)
        return (
          <Focusable
            key={l}
            ref={(node) => {
              stops.current.set(l, node)
            }}
            disabled={!has}
            ring={false}
            lift={1.25}
            radius={0.3 * u}
            label={l}
            onPress={() => onLetter(l)}
          >
            {(focused) => (
              <View
                style={{
                  height: size,
                  width: size,
                  alignSelf: 'center',
                  borderRadius: 0.3 * u,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? theme.colors.text : 'transparent',
                }}
              >
                <Text
                  variant="quality"
                  color={focused ? 'bg' : has ? 'text-2' : 'text-3'}
                  style={{ opacity: has ? 1 : 0.4 }}
                >
                  {l}
                </Text>
              </View>
            )}
          </Focusable>
        )
      })}
    </TVFocusGuideView>
  )
}
