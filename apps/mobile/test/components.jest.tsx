// SPDX-License-Identifier: AGPL-3.0-only
// The design system's native controls as the screens use them: what VoiceOver hears, what a tap
// does, and the control spec's touch rule (controls.md): 36 drawn, 44 to the finger.
import {
  Button,
  Checkbox,
  Chip,
  Disclosure,
  EmptyState,
  Field,
  Input,
  MultiSelect,
  SearchField,
  SegmentedControl,
  Select,
  Switch,
  Text,
  ThemeProvider,
  tokens,
} from '@highsea-tv/ui'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { useState } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// a sheet reads the safe area, which Jest has no window for: the provider's initial metrics stand
// in (https://appandflow.github.io/react-native-safe-area-context/testing)
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}
const themed = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  )
const tv = (ui: React.ReactElement) => render(<ThemeProvider platform="tv">{ui}</ThemeProvider>)

const style = (el: { props: { style?: unknown } }) =>
  StyleSheet.flatten(el.props.style as never) as Record<string, unknown>
const theme = tokens.themes.default.colors

describe('Button', () => {
  test('is named by its words, and a tap runs it', async () => {
    const onPress = jest.fn()
    await themed(<Button onPress={onPress}>Play</Button>)
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  test('an icon-only button is named by its accessibility label', async () => {
    await themed(<Button icon="more" iconOnly accessibilityLabel="More" onPress={() => {}} />)
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

  test('is drawn at 36 on the phone, and its hit area reaches 44', async () => {
    await themed(<Button>Play</Button>)
    const button = screen.getByRole('button', { name: 'Play' })
    expect(style(button).minHeight).toBe(36)
    expect(style(button).borderRadius).toBe(8)
    expect(button.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 0, right: 0 })
  })

  test('the small size is 30, its hit area still 44', async () => {
    await themed(<Button size="sm">Cancel</Button>)
    const button = screen.getByRole('button', { name: 'Cancel' })
    expect(style(button).minHeight).toBe(30)
    expect(button.props.hitSlop).toEqual({ top: 7, bottom: 7, left: 0, right: 0 })
  })

  test('an icon button is a 36 square whose hit area is 44 each way', async () => {
    await themed(<Button icon="more" iconOnly accessibilityLabel="More" />)
    const button = screen.getByRole('button', { name: 'More' })
    expect(style(button).minWidth).toBe(36)
    expect(button.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 })
  })

  test('the overlay look is `text` at a low alpha, for artwork behind it', async () => {
    await themed(<Button variant="overlay">Trailer</Button>)
    const button = screen.getByRole('button', { name: 'Trailer' })
    expect(style(button).backgroundColor).toBe(theme['control-overlay'])
    expect(theme['control-overlay']).toMatch(/^#[0-9a-f]{8}$/)
  })

  test('on the TV it takes the TV’s rule and has no hit area', async () => {
    const u = Dimensions.get('window').width / 100
    await tv(<Button variant="primary">Play</Button>)
    const button = screen.getByRole('button', { name: 'Play' })
    expect(style(button).minHeight).toBeCloseTo(tokens.controls.tv.md.height * u, 1)
    expect(button.props.hitSlop).toBeUndefined()
    expect(style(button).backgroundColor).toBe(theme['accent-fill'])
  })
})

describe('Input', () => {
  test('is 36 with 16 text, named by its Field', async () => {
    await themed(
      <Field label="Address">
        <Input value="" />
      </Field>,
    )
    const input = screen.getByLabelText('Address')
    expect(style(input).minHeight).toBe(36)
    expect(style(input).fontSize).toBe(16)
    expect(style(input).borderColor).toBe(theme['control-edge'])
  })

  test('an error in its Field gives it the danger edge', async () => {
    await themed(
      <Field label="Address" error="That isn’t an address.">
        <Input value="x" />
      </Field>,
    )
    expect(style(screen.getByLabelText('Address')).borderColor).toBe(theme.danger)
    expect(screen.getByText('That isn’t an address.')).toBeTruthy()
  })
})

describe('SearchField', () => {
  test('clears what was typed', async () => {
    function Search() {
      const [q, setQ] = useState('dune')
      return <SearchField label="Search" value={q} onChangeText={setQ} />
    }
    await themed(<Search />)
    expect(screen.getByLabelText('Search').props.value).toBe('dune')
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('Search').props.value).toBe('')
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })
})

describe('SegmentedControl', () => {
  test('chooses one, and says which', async () => {
    const onValueChange = jest.fn()
    await themed(
      <SegmentedControl
        aria-label="View"
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ]}
        defaultValue="grid"
        onValueChange={onValueChange}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Grid' })).toBeSelected()
    await fireEvent.press(screen.getByRole('radio', { name: 'List' }))
    expect(onValueChange).toHaveBeenCalledWith('list')
    expect(screen.getByRole('radio', { name: 'List' })).toBeSelected()
    expect(style(screen.getByRole('radio', { name: 'List' })).backgroundColor).toBe(
      theme['control-selected'],
    )
  })
})

describe('Chip', () => {
  test('is a pill at the control’s height, chosen or not', async () => {
    await themed(
      <>
        <Chip>Drama</Chip>
        <Chip selected>Comedy</Chip>
      </>,
    )
    const chip = screen.getByRole('button', { name: 'Drama' })
    expect(style(chip).minHeight).toBe(36)
    expect(style(chip).borderRadius).toBe(tokens.radius.pill)
    expect(screen.getByRole('button', { name: 'Comedy' })).toBeSelected()
  })
})

describe('Checkbox and Switch', () => {
  test('a checkbox turns on and off', async () => {
    const onCheckedChange = jest.fn()
    await themed(<Checkbox label="Subtitles" onCheckedChange={onCheckedChange} />)
    const box = screen.getByRole('checkbox', { name: 'Subtitles' })
    expect(box).not.toBeChecked()
    await fireEvent.press(box)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(box).toBeChecked()
  })

  test('a switch’s row turns it on', async () => {
    const onCheckedChange = jest.fn()
    await themed(<Switch label="Sounds" checked={false} onCheckedChange={onCheckedChange} />)
    await fireEvent.press(screen.getByRole('switch', { name: 'Sounds' }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})

describe('Disclosure', () => {
  test('shows and hides what’s under it, and says which', async () => {
    await themed(
      <Disclosure title="Details">
        <Text>Directed by Denis Villeneuve.</Text>
      </Disclosure>,
    )
    const row = screen.getByRole('button', { name: 'Details' })
    expect(row).toBeCollapsed()
    expect(screen.queryByText('Directed by Denis Villeneuve.')).toBeNull()
    await fireEvent.press(row)
    expect(row).toBeExpanded()
    expect(screen.getByText('Directed by Denis Villeneuve.')).toBeTruthy()
    await fireEvent.press(row)
    expect(screen.queryByText('Directed by Denis Villeneuve.')).toBeNull()
  })
})

const genres = [
  { value: 'drama', label: 'Drama' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'horror', label: 'Horror' },
]

describe('Select', () => {
  test('opens a sheet of choices, and closes on one', async () => {
    const onValueChange = jest.fn()
    await themed(
      <Field label="Genre">
        <Select options={genres} placeholder="Any genre" onValueChange={onValueChange} />
      </Field>,
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Genre' }))
    await fireEvent.press(screen.getByRole('radio', { name: 'Comedy' }))
    expect(onValueChange).toHaveBeenCalledWith('comedy')
    expect(screen.getByText('Comedy')).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Drama' })).toBeNull()
  })
})

describe('MultiSelect', () => {
  test('chooses several, in the options’ order', async () => {
    const onValueChange = jest.fn()
    function Genres() {
      const [value, setValue] = useState<string[]>([])
      return (
        <MultiSelect
          aria-label="Genres"
          options={genres}
          value={value}
          placeholder="Any genre"
          onValueChange={(v) => {
            setValue(v)
            onValueChange(v)
          }}
        />
      )
    }
    await themed(<Genres />)
    expect(screen.getByText('Any genre')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Genres' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Horror' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Drama' }))
    expect(onValueChange).toHaveBeenLastCalledWith(['drama', 'horror'])
    expect(screen.getByRole('checkbox', { name: 'Drama' })).toBeChecked()
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText('Drama, Horror')).toBeTruthy()
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
