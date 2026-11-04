// SPDX-License-Identifier: AGPL-3.0-only
// A link opened while a sheet is up (src/app/+native-intent.ts): the sheet closes, and the link is
// followed only once iOS has dismissed it, since react-native-screens never shows a screen it
// presents while React Native's Modal is still going away (@highsea-tv/ui's yieldToLink).
import { Sheet, ThemeProvider, yieldToLink } from '@highsea-tv/ui'
import { act, render, screen } from '@testing-library/react-native'
import { Platform, Text } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { redirectSystemPath } from '../src/app/+native-intent.ts'

const sheet = () => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 402, height: 874 },
      insets: { top: 62, left: 0, right: 0, bottom: 34 },
    }}
  >
    <ThemeProvider>
      <Sheet open onClose={() => {}} title="Switch profile">
        <Text>Ines</Text>
      </Sheet>
    </ThemeProvider>
  </SafeAreaProvider>
)

/** The Modal's host element (the preset's mock draws one only while visible), from its title. */
const modal = () => {
  let el = screen.queryByText('Switch profile')
  while (el && (el.type as unknown) !== 'Modal') el = el.parent
  return el
}

test('iOS: the link waits for the sheet to be dismissed, and the sheet stays shut meanwhile', async () => {
  expect(Platform.OS).toBe('ios')
  jest.useFakeTimers()
  await render(sheet())
  const shown = modal()
  expect(shown?.props.visible).toBe(true)
  const onDismiss = shown?.props.onDismiss as () => void
  let followed: string | null = null
  await act(async () => {
    void redirectSystemPath({ path: '/play/1', initial: false }).then((p) => {
      followed = p
    })
  })
  expect(modal()).toBeNull()
  expect(followed).toBeNull()
  // iOS says it's gone
  await act(async () => onDismiss())
  expect(followed).toBe('/play/1')
  // it stays shut while the screen the link leaves loses its focus, then answers its `open` again
  expect(modal()).toBeNull()
  await act(async () => jest.advanceTimersByTime(1000))
  expect(modal()?.props.visible).toBe(true)
  jest.useRealTimers()
})

test('with nothing up, a link is followed at once', async () => {
  await expect(yieldToLink()).resolves.toBeUndefined()
  await expect(redirectSystemPath({ path: '/settings', initial: true })).resolves.toBe('/settings')
})
