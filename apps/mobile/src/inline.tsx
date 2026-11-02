// SPDX-License-Identifier: AGPL-3.0-only
// Announcement bodies' inline markdown and their call to action, as the web's kit.tsx draws them:
// **bold**, _italic_ and [links](https://…), which open in Safari's sheet, away from the app.
import { Button, Text } from '@highsea-tv/ui'
import * as WebBrowser from 'expo-web-browser'
import type { ReactNode } from 'react'

const TOKENS = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/

function Part({ part }: { part: string }): ReactNode {
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
    return (
      <Text weight={600} color="text">
        {part.slice(2, -2)}
      </Text>
    )
  if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    return <Text style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>
  const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
  if (link)
    return (
      <Text
        color="text"
        accessibilityRole="link"
        style={{ textDecorationLine: 'underline' }}
        onPress={() => void WebBrowser.openBrowserAsync(link[2] as string)}
      >
        {link[1]}
      </Text>
    )
  return part
}

export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKENS).map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the split is stable for a given text
        <Part key={i} part={part} />
      ))}
    </>
  )
}

export function Cta({ cta }: { cta: { label: string; url: string } | null }) {
  if (!cta) return null
  return (
    <Button icon="globe" onPress={() => void WebBrowser.openBrowserAsync(cta.url)}>
      {cta.label}
    </Button>
  )
}
