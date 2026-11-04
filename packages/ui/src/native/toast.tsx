// SPDX-License-Identifier: AGPL-3.0-only
// A short note of what just happened ("Signed out"), its title and a line under it, announced
// politely as it appears or changes (./announce, a platform pair: the platform's announcement,
// and on the web one status region kept in the page). The native apps have no toast stack
// (parity.ts › Toaster): the screen shows the note where it stands, and the app takes it away
// after a moment. By touch and with a pointer it's
// a card on `s2`; on the TV, where it's drawn over rows of art, a card on `s1` nearly opaque, as
// the TV's dialogs are, so the words stay readable over whatever is under them, in the TV's units.
// Its body is a line of text or an announcement's inline runs (InlineText), which keep their bold,
// italics and links, and are announced as their words.
import { useEffect } from 'react'
import { View } from 'react-native'
import { alpha } from './alpha.ts'
import { announce } from './announce'
import { type InlineRun, InlineText } from './inline-text.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

/** The TV's card's insets and the gap under its title, in units. */
const TV_NOTE = { padX: 1.2, padY: 0.8, gap: 0.2 }

export type ToastProps = {
  title: string
  /** The line under it: words, or an announcement's inline runs (`inlineParts`'s). */
  body?: string | readonly InlineRun[] | null
  /** A link in the runs was pressed (touch and a pointer), as InlineText's. */
  onLink?: (url: string) => void
}

export function Toast({ title, body, onLink }: ToastProps) {
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const u = theme.u
  const words = typeof body === 'string' ? body : body?.map((r) => r.text).join('')
  useEffect(() => {
    announce(words ? `${title}. ${words}` : title)
  }, [title, words])
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        gap: tv ? TV_NOTE.gap * u : 0,
        borderRadius: tv ? tokens.tv.radius.button * u : tokens.radius.sm,
        backgroundColor: tv ? alpha(theme.colors.s1, 0.95) : theme.colors.s2,
        paddingHorizontal: tv ? TV_NOTE.padX * u : tokens.space['3'],
        paddingVertical: tv ? TV_NOTE.padY * u : tokens.space['2'],
      }}
    >
      <Text variant={tv ? 'pill' : 'callout'} weight={600}>
        {title}
      </Text>
      {typeof body === 'string' && body ? (
        <Text variant={tv ? 'pill' : 'callout'} color="text-2">
          {body}
        </Text>
      ) : typeof body === 'object' && body?.length ? (
        <InlineText runs={body} onLink={onLink} variant={tv ? 'pill' : 'callout'} />
      ) : null}
    </View>
  )
}
