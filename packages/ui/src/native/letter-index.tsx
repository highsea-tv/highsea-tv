// SPDX-License-Identifier: AGPL-3.0-only
// The A–Z index down the right edge of a phone's list sorted by name, as iOS's section index is
// (prototype-gaps.md › 4.2, the prototype's mobile/letter-index.tsx): every letter in the tint, those
// without titles dimmed. Touching a letter jumps to its first title, and dragging along the column
// keeps jumping as the finger passes each letter. A dimmed letter lands on the nearest one that has
// titles. VoiceOver reads it as an adjustable control: swiping up or down moves a letter
// (https://reactnative.dev/docs/accessibility#accessibility-actions).
import { useRef, useState } from 'react'
import { type GestureResponderEvent, View } from 'react-native'
import { Text } from './text.tsx'
import { useTheme } from './theme.tsx'

/** Each letter's height, in points: 27 fit beside a list on the smallest phone. */
const LETTER = 16
/** The column's width, in the page's right gutter. */
export const LETTER_INDEX_WIDTH = 20

/** The nearest letter with titles: this one, then the ones after it, then the ones before. */
export function nearestLetter(letters: readonly string[], l: string, present: Set<string>) {
  const i = letters.indexOf(l)
  const after = letters.slice(i).find((x) => present.has(x))
  return after ?? letters.slice(0, i).findLast((x) => present.has(x)) ?? null
}

export function LetterIndex({
  letters,
  present,
  label,
  onLetter,
}: {
  letters: readonly string[]
  present: Set<string>
  /** "Jump to a letter". */
  label: string
  /** A letter that has titles: scroll to its first. */
  onLetter: (letter: string) => void
}) {
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
      accessibilityValue={held ? { text: held } : undefined}
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
