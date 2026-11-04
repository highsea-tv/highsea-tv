// SPDX-License-Identifier: AGPL-3.0-only
// Inline runs as text: a notice's or an announcement's body, as `@highsea-tv/client/format`'s
// `inlineParts` splits its inline markdown. Bold runs are drawn at 600 in `text`, italic ones
// slanted, and a link in `text`, underlined, pressed by touch or a pointer as a link
// (React Native's nested Text takes its own `onPress`, https://reactnative.dev/docs/text#nested-text,
// which react-native-web draws as a link's role on a span). On the TV a link is only its words,
// in `text`: a TV can't follow one, so it isn't a stop. The runs keep the surrounding text's size.
import type { ColorRole } from '@highsea-tv/tokens'
import { Text, type Variant } from './text.tsx'
import { useTheme } from './theme.tsx'

/** A run of inline text: `inlineParts`'s parts, where only a link has its `url`. */
export type InlineRun = { kind: 'text' | 'bold' | 'italic' | 'link'; text: string; url?: string }

export type InlineTextProps = {
  runs: readonly InlineRun[]
  /** A link was pressed (touch and a pointer): the app opens its page, in the system browser. */
  onLink?: (url: string) => void
  variant?: Variant
  /** The plain and italic runs' colour; bold runs and links are in `text`. */
  color?: ColorRole
  numberOfLines?: number
}

export function InlineText({
  runs,
  onLink,
  variant = 'body',
  color = 'text-2',
  numberOfLines,
}: InlineTextProps) {
  const tv = useTheme().formFactor.input === 'tv'
  return (
    <Text variant={variant} color={color} numberOfLines={numberOfLines}>
      {runs.map((r, i) => {
        const key = i
        if (r.kind === 'bold')
          return (
            <Text key={key} variant={variant} weight={600} color="text">
              {r.text}
            </Text>
          )
        if (r.kind === 'italic')
          return (
            <Text key={key} variant={variant} color={color} style={{ fontStyle: 'italic' }}>
              {r.text}
            </Text>
          )
        if (r.kind === 'link' && !tv && r.url && onLink) {
          const url = r.url
          return (
            <Text
              key={key}
              variant={variant}
              color="text"
              accessibilityRole="link"
              style={{ textDecorationLine: 'underline' }}
              onPress={() => onLink(url)}
            >
              {r.text}
            </Text>
          )
        }
        if (r.kind === 'link')
          return (
            <Text key={key} variant={variant} color="text">
              {r.text}
            </Text>
          )
        return r.text
      })}
    </Text>
  )
}
