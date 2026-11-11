// SPDX-License-Identifier: AGPL-3.0-only
// A heading that screen readers read and nothing draws: a page's title where the page shows none
// of its own (Search with a pointer gives its page a hidden "Search" h1). It's the web's
// visually-hidden pattern (a 1-point box that clips its text, out of the layout), which keeps the
// heading in the accessibility tree where `display: none` or no opacity would take it out.
// Every heading in the library is `accessibilityRole="header"` with its `aria-level`:
// react-native-web maps `header` to the `heading` role and draws it with `aria-level` as that
// level's element (<h1> to <h6>, its propsToAriaRole and propsToAccessibilityComponent);
// VoiceOver and TalkBack read it as a heading.
// `visuallyHidden` is that pattern as one style, which every part that reads words without drawing
// them takes (a sheet's title, a table's caption, the command palette's, the admin's): its 1 × 1
// box and −1 margin are the technique's own measures, listed in one-place-exceptions.json for good.
import { Platform, View, type ViewStyle } from 'react-native'
import { Text } from './text.tsx'

/**
 * Read, never seen: the web's visually-hidden pattern (WCAG's technique C7,
 * https://www.w3.org/WAI/WCAG22/Techniques/css/C7), a 1-point box out of the layout that clips its
 * contents. On the web it also clips with `clip` and keeps a line from wrapping, as the pattern
 * does; React Native's own platforms have neither property, and clip by `overflow`.
 */
export const visuallyHidden: ViewStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  overflow: 'hidden',
  ...(Platform.OS === 'web' ? ({ clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as object) : {}),
}

export type HiddenHeadingProps = {
  children: string
  /** Its level, 1 to 6, as `aria-level` (https://reactnative.dev/docs/accessibility#aria-level). */
  level?: 1 | 2 | 3 | 4 | 5 | 6
}

export function HiddenHeading({ children, level = 1 }: HiddenHeadingProps) {
  return (
    <View pointerEvents="none" style={visuallyHidden}>
      <Text accessibilityRole="header" aria-level={level} numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}
