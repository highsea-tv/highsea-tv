// SPDX-License-Identifier: AGPL-3.0-only
// The A–Z index beside a library sorted by name, one part with a form per form factor:
// - touch, down the right edge of a phone's list as iOS's section index is (prototype-gaps.md ›
//   4.2, the prototype's mobile/letter-index.tsx): every letter in the tint, those without titles
//   dimmed. Touching a letter jumps to its first title, and dragging along the column keeps
//   jumping as the finger passes each letter. A dimmed letter lands on the nearest one that has
//   titles. VoiceOver reads it as an adjustable control: swiping up or down moves a letter
//   (https://reactnative.dev/docs/accessibility#accessibility-actions);
// - a pointer, a column of square letter buttons beside the grid (the web prototype's
//   library.tsx): those without titles dimmed and disabled, a letter brightening under the
//   pointer; a press hands it to `onLetter`, which scrolls to its first title and focuses it;
// - the TV, the rail at the safe area's left edge (the prototype's tv/library.tsx), from `top` to
//   the safe area's foot, its square letters sharing that height. It stays put while the page
//   under it scrolls. Only letters with titles take focus, Up and Down stay inside it (its guide
//   traps them), and OK hands the letter to `onLetter`, which moves focus to that letter's first
//   title. The focus engine would enter it at whichever letter lies level with the tile, so its
//   guide sends focus to the focused title's letter, `at`, instead (react-native-tvos's
//   TVFocusGuideView `destinations`).
import { useEffect, useRef, useState } from 'react'
import { type GestureResponderEvent, useWindowDimensions, View } from 'react-native'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'
import { FocusGuide } from './tv/engine'
import { Focusable, type ViewHandle } from './tv/focusable.tsx'

// sizes on the space scale: the tokens have no size scale (scales.ts), and icon.size's 16 and 20
// are icons' sizes, not a letter's
/** Each letter's height, in points: 27 fit beside a list on the smallest phone. */
const LETTER = tokens.space['4']
/** The column's width, in the page's right gutter. */
export const LETTER_INDEX_WIDTH = tokens.space['5']

/** The nearest letter with titles: this one, then the ones after it, then the ones before. */
export function nearestLetter(letters: readonly string[], l: string, present: Set<string>) {
  const i = letters.indexOf(l)
  const after = letters.slice(i).find((x) => present.has(x))
  return after ?? letters.slice(0, i).findLast((x) => present.has(x)) ?? null
}

/** The TV's rail's column, in units: the room a grid leaves for it beside its first column. */
export const RAIL_WIDTH = 2
/**
 * A pointer's letters' size, the prototype's 1.5rem, and the page's gap under the column: the
 * column's width, which a grid beside it leaves room for.
 */
export const POINTER_LETTER = tokens.space['6']

export type LetterIndexProps = {
  letters: readonly string[]
  /** The letters with titles. */
  present: Set<string>
  /** "Jump to a letter". */
  label: string
  /** A letter that has titles: scroll to its first (and, with a pointer or on the TV, focus it). */
  onLetter: (letter: string) => void
  /** The TV: the focused title's letter, where focus enters. */
  at?: string
  /**
   * A pointer and the TV: where the column starts, in points from the window's top, so its letters
   * share the height under it.
   */
  top?: number
}

export function LetterIndex(props: LetterIndexProps) {
  const input = useTheme().formFactor.input
  if (input === 'tv') return <TvForm {...props} />
  if (input === 'pointer') return <PointerForm {...props} />
  return <TouchForm {...props} />
}

function TouchForm({ letters, present, label, onLetter }: LetterIndexProps) {
  const theme = useTheme()
  const [held, setHeld] = useState<string | null>(null)
  const last = useRef<string | null>(null)
  const jump = (l: string | null) => {
    const to = l && nearestLetter(letters, l, present)
    if (!to || to === last.current) return
    last.current = to
    setHeld(to)
    onLetter(to)
  }
  const at = (e: GestureResponderEvent) =>
    letters[Math.min(letters.length - 1, Math.max(0, Math.floor(e.nativeEvent.locationY / LETTER)))]
  const end = () => {
    last.current = null
    setHeld(null)
  }
  const step = (by: number) => {
    const shown = letters.filter((x) => present.has(x))
    const i = shown.indexOf(held ?? shown[0] ?? '')
    const to = shown[Math.min(shown.length - 1, Math.max(0, i + by))]
    if (to) {
      setHeld(to)
      onLetter(to)
    }
  }
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      // a slider's value (https://www.w3.org/TR/wai-aria-1.2/#slider): the letter it's on
      aria-valuemin={0}
      aria-valuemax={letters.length - 1}
      aria-valuenow={Math.max(
        0,
        letters.indexOf(held ?? letters.find((x) => present.has(x)) ?? ''),
      )}
      aria-valuetext={held ?? letters.find((x) => present.has(x))}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? -1 : 1)}
      // the column takes the finger itself, so the page's scroll and pull to refresh leave it alone
      // (https://reactnative.dev/docs/gesture-responder-system)
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => jump(at(e) ?? null)}
      onResponderMove={(e) => jump(at(e) ?? null)}
      onResponderRelease={end}
      onResponderTerminate={end}
      style={{ width: LETTER_INDEX_WIDTH }}
    >
      {letters.map((l) => (
        <View
          key={l}
          pointerEvents="none"
          style={{
            height: LETTER,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            backgroundColor: held === l ? theme.colors.s2 : undefined,
          }}
        >
          <Text
            variant="caption"
            size={11}
            weight={600}
            color={present.has(l) ? 'accent-text' : 'text-3'}
            style={{ opacity: present.has(l) ? 1 : 0.4, lineHeight: 12 }}
          >
            {l}
          </Text>
        </View>
      ))}
    </View>
  )
}

function PointerForm({ letters, present, label, onLetter, top = 0 }: LetterIndexProps) {
  const { height } = useWindowDimensions()
  // square: 1.5rem, or a share of the height left under `top` (which holds the gap above the
  // column) and the page's gap at its foot, if that's less: the prototype's
  // min(1.5rem, (100svh - bar - 3rem) / 27), with `top` the bar and 1.5rem; never below touch's
  // letter (LETTER), so a short window's letters stay a target and legible, though the column
  // is then taller than what's left of the window
  const size = Math.max(
    LETTER,
    Math.min(POINTER_LETTER, (height - top - POINTER_LETTER) / letters.length),
  )
  return (
    <View accessibilityRole="navigation" accessibilityLabel={label} style={{ width: size }}>
      {letters.map((l) => {
        const has = present.has(l)
        return (
          <Press
            key={l}
            disabled={!has}
            accessibilityLabel={l}
            onPress={() => onLetter(l)}
            // the ring inside the letter, as the prototype's focus-ring-inset: the page's column clips
            ringInset
            style={{
              width: size,
              height: size,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: tokens.radius.sm,
            }}
          >
            {(s) => (
              <Text
                variant="caption"
                weight={600}
                color={!has ? 'text-3' : s.hovered ? 'text' : 'text-2'}
                style={{ opacity: has ? 1 : 0.4 }}
              >
                {l}
              </Text>
            )}
          </Press>
        )
      })}
    </View>
  )
}

function TvForm({ letters, present, at, top = 0, label, onLetter }: LetterIndexProps) {
  const theme = useTheme()
  const u = theme.u
  const tv = tokens.tv
  const { height } = useWindowDimensions()
  const stops = useRef(new Map<string, ViewHandle | null>())
  // the stops' refs are set only once they're drawn, so the guide reads its destination again then
  const [drawn, setDrawn] = useState(false)
  useEffect(() => setDrawn(true), [])
  const to = drawn && at !== undefined ? stops.current.get(at) : undefined
  // square: a share of the height to the safe area's foot, or the column's width if that's less
  const size = Math.min((height - top - tv.safe.y * u) / letters.length, RAIL_WIDTH * u)
  return (
    <FocusGuide
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
            lift="letter"
            radius={tv.radius.pill * u}
            label={l}
            onPress={() => onLetter(l)}
          >
            {(focused) => (
              <View
                style={{
                  height: size,
                  width: size,
                  alignSelf: 'center',
                  borderRadius: tv.radius.pill * u,
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
    </FocusGuide>
  )
}
