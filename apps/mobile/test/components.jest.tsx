// SPDX-License-Identifier: AGPL-3.0-only
// ui-native's pieces as the screens use them: what VoiceOver hears, and what a tap does.
import { Button, EmptyState, ThemeProvider } from '@highsea-tv/ui-native'
import { fireEvent, render, screen } from '@testing-library/react-native'

const themed = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>)

describe('Button', () => {
  test('is named by its words, and a tap runs it', async () => {
    const onPress = jest.fn()
    await themed(<Button onPress={onPress}>Play</Button>)
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  test('an icon-only button is named by its label', async () => {
    await themed(<Button icon="more" label="More" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()
  })

  test('a disabled button says so and does nothing', async () => {
    const onPress = jest.fn()
    await themed(
      <Button disabled onPress={onPress}>
        Continue
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Continue' })
    expect(button).toBeDisabled()
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('EmptyState', () => {
  test('shows its title, its words and its action', async () => {
    await themed(
      <EmptyState icon="download" title="Nothing downloaded" action={<Button>Go home</Button>}>
        Downloads come later.
      </EmptyState>,
    )
    expect(screen.getByText('Nothing downloaded')).toBeTruthy()
    expect(screen.getByText('Downloads come later.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go home' })).toBeTruthy()
  })
})
