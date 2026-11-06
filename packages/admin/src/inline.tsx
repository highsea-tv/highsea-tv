'use client'
// SPDX-License-Identifier: AGPL-3.0-only
import type { ColorRole } from '@highsea-tv/tokens'
// Announcement bodies are markdown; the admin renders the inline part the composer offers, as the
// prototypes do (kit/inline.tsx): **bold**, _italic_ and [links](https://…), drawn by the
// library's InlineText. Links open in a new tab, away from the app (react-native-web's
// Linking.openURL opens a new window, https://necolas.github.io/react-native-web/docs/linking/).
// The split is `@highsea-tv/client/format`'s inlineParts, which the admin doesn't depend on.
import { Button, type InlineRun, InlineText, type Variant } from '@highsea-tv/ui/native'
import { Linking } from 'react-native'

const TOKENS = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/

/** The body's inline runs. */
export function inlineRuns(text: string): InlineRun[] {
  return text
    .split(TOKENS)
    .filter((part) => part !== '')
    .map((part): InlineRun => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
        return { kind: 'bold', text: part.slice(2, -2) }
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
        return { kind: 'italic', text: part.slice(1, -1) }
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
      if (link) return { kind: 'link', text: link[1] as string, url: link[2] as string }
      return { kind: 'text', text: part }
    })
}

const open = (url: string) => void Linking.openURL(url)

export function Inline({
  text,
  variant,
  size,
  color,
  numberOfLines,
}: {
  text: string
  variant?: Variant
  /** Over the variant's size: the admin's ui type inside a banner. */
  size?: number
  color?: ColorRole
  numberOfLines?: number
}) {
  return (
    <InlineText
      runs={inlineRuns(text)}
      onLink={open}
      variant={variant}
      size={size}
      color={color}
      numberOfLines={numberOfLines}
    />
  )
}

/** An announcement's call to action, as a secondary button that opens the link. */
export function Cta({ cta }: { cta: { label: string; url: string } | null }) {
  if (!cta) return null
  return (
    <Button size="sm" icon="external" onPress={() => open(cta.url)}>
      {cta.label}
    </Button>
  )
}
