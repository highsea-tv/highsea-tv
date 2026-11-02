// SPDX-License-Identifier: AGPL-3.0-only
// Announcement bodies' inline markdown and their call to action, as the web's kit.tsx draws them:
// **bold**, _italic_ and [links](https://…) from the shared `inlineParts`, the links opening in
// Safari's sheet, away from the app.
import { type InlinePart, inlineParts } from '@highsea-tv/client/format'
import { Button, Text } from '@highsea-tv/ui'
import * as WebBrowser from 'expo-web-browser'
import type { ReactNode } from 'react'

function Part({ part }: { part: InlinePart }): ReactNode {
  if (part.kind === 'bold')
    return (
      <Text weight={600} color="text">
        {part.text}
      </Text>
    )
  if (part.kind === 'italic') return <Text style={{ fontStyle: 'italic' }}>{part.text}</Text>
  if (part.kind === 'link')
    return (
      <Text
        color="text"
        accessibilityRole="link"
        style={{ textDecorationLine: 'underline' }}
        onPress={() => void WebBrowser.openBrowserAsync(part.url)}
      >
        {part.text}
      </Text>
    )
  return part.text
}

export function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineParts(text).map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the runs are stable for a given text
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
