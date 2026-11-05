// SPDX-License-Identifier: AGPL-3.0-only
// A heading that screen readers read and nothing draws: a page's title where the page shows none
// of its own (Search with a pointer gives its page a hidden "Search" h1). It's the web's
// visually-hidden pattern (a 1-point box that clips its text, out of the layout), which keeps the
// heading in the accessibility tree where `display: none` or no opacity would take it out.
// Every heading in the library is `accessibilityRole="header"` with its `aria-level`:
// react-native-web maps `header` to the `heading` role and draws it with `aria-level` as that
// level's element (<h1> to <h6>, its propsToAriaRole and propsToAccessibilityComponent);
// VoiceOver and TalkBack read it as a heading.
import { View } from 'react-native'
import { Text } from './text.tsx'

export type HiddenHeadingProps = {
  children: string
  /** Its level, 1 to 6, as `aria-level` (https://reactnative.dev/docs/accessibility#aria-level). */
  level?: 1 | 2 | 3 | 4 | 5 | 6
}

export function HiddenHeading({ children, level = 1 }: HiddenHeadingProps) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden' }}
    >
      <Text accessibilityRole="header" aria-level={level} numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}
