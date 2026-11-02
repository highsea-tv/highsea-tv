// SPDX-License-Identifier: AGPL-3.0-only
// The controls on design system 1.1's spec (docs/design-language/controls.md): every control names
// its kind in `data-control`, takes its size and corner from the `--control-*` variables, never from
// numbers of its own, and carries the touch hit area. Then the new controls' behaviour.
import './dom.ts'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Button,
  Checkbox,
  Chip,
  Disclosure,
  Field,
  Input,
  MultiSelect,
  PlatformScope,
  Radio,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  Switch,
  Table,
  TableBody,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  TitleCell,
  UIProvider,
  useControlPlatform,
} from '../../src/web/index.ts'
import { KitchenSink } from './fixtures.tsx'

afterEach(() => cleanup())

const classOf = (el: Element) => el.getAttribute('class') ?? ''

/**
 * Raw sizes a control mustn't set: Tailwind's fixed heights, side paddings, text sizes and corners
 * (a text area's minimum height is its rows, not a control's height).
 */
const RAW = [
  /(^|\s)(min-)?h-(\d|\[\d)/,
  /(^|\s)p[xse]?-([1-9]|\[\d)/,
  /(^|\s)text-(\[\d|ui\b|form\b)/,
  /(^|\s)rounded-(sm|md|lg|\[\d)/,
]
const raw = (kind: string, c: string) =>
  RAW.some((r) => r.test(kind === 'textarea' ? c.replace('min-h-24', '') : c))

/** The controls drawn at the control's height; the toggles have their own fixed box. */
const SIZED = [
  'button',
  'input',
  'textarea',
  'select',
  'search-field',
  'segmented-control',
  'tabs',
  'chip',
  'multi-select',
]
const KINDS = [...SIZED, 'checkbox', 'radio', 'switch', 'disclosure']

describe('the control spec', () => {
  test('every kind of control is in the kitchen sink and names itself', () => {
    render(<KitchenSink />)
    const found = new Set(
      [...document.querySelectorAll('[data-control]')].map((el) => el.getAttribute('data-control')),
    )
    expect([...found].sort()).toEqual([...KINDS].sort())
  })

  test('sized controls take their height, text and corner from the variables', () => {
    render(<KitchenSink />)
    const wrong: string[] = []
    for (const el of document.querySelectorAll('[data-control]')) {
      const kind = el.getAttribute('data-control') as string
      if (!SIZED.includes(kind)) continue
      // a field with an icon is its wrapper around the <input>: the input carries the size
      const box = el.tagName === 'DIV' && el.querySelector('input') ? el.querySelector('input') : el
      const c = classOf(box as Element)
      if (kind === 'textarea') {
        if (!c.includes('--control-text')) wrong.push(`${kind}: no text variable`)
      } else if (kind === 'tabs' && !c.includes('--control-h')) {
        // line tabs: each trigger is at the control's height
        for (const tab of el.querySelectorAll('[role="tab"]'))
          if (!classOf(tab).includes('--control-h')) wrong.push(`${kind}: a tab's height`)
      } else if (!c.includes('--control-h')) wrong.push(`${kind}: no height variable (${c})`)
      if (raw(kind, c)) wrong.push(`${kind}: a raw size in ${c}`)
      if (kind === 'chip') {
        if (!c.includes('rounded-full')) wrong.push('chip: not a pill')
      } else if (kind !== 'tabs' && !c.includes('rounded-(--control-radius)'))
        wrong.push(`${kind}: not the control's corner`)
      else if (c.includes('rounded-full')) wrong.push(`${kind}: a pill`)
    }
    expect(wrong).toEqual([])
  })

  test('every control carries the hit area, on itself or around its field', () => {
    render(<KitchenSink />)
    const without = [...document.querySelectorAll('[data-control]')]
      .filter((el) => el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')
      // a group's hit areas are on its items
      .filter(
        (el) =>
          !['segmented-control', 'tabs', 'disclosure'].includes(
            el.getAttribute('data-control') ?? '',
          ),
      )
      .filter((el) => !classOf(el).includes('var(--control-hit)'))
      .map((el) => el.getAttribute('data-control'))
    expect(without).toEqual([])
    for (const item of document.querySelectorAll(
      '[data-control] [role="radio"], [data-control] [role="tab"]',
    ))
      expect(classOf(item)).toContain('var(--control-hit)')
  })

  test('sm takes the small variables', () => {
    render(
      <>
        <Button size="sm">Small</Button>
        <Field label="Small" size="sm">
          <Input />
        </Field>
      </>,
    )
    expect(classOf(document.querySelector('button') as Element)).toContain('min-h-(--control-h-sm)')
    expect(classOf(document.querySelector('input') as Element)).toContain('h-(--control-h-sm)')
  })

  test('the overlay look is for controls over artwork', () => {
    const { getByRole } = render(<Button variant="overlay">Trailer</Button>)
    expect(classOf(getByRole('button'))).toContain('bg-control-overlay')
  })

  test('a field’s edge is control-edge', () => {
    render(<Textarea aria-label="Notes" />)
    expect(classOf(document.querySelector('textarea') as Element)).toContain('border-control-edge')
  })
})

describe('PlatformScope', () => {
  function Reads() {
    return <span>{useControlPlatform()}</span>
  }

  test('sets data-platform for the variables, and tells components the platform', () => {
    const { container, getByText } = render(
      <PlatformScope platform="tv" className="contents">
        <Reads />
      </PlatformScope>,
    )
    expect(container.querySelector('[data-platform="tv"]')).toBeTruthy()
    expect(getByText('tv')).toBeTruthy()
  })

  test('without a scope a fine pointer is a pointer', () => {
    const { getByText } = render(<Reads />)
    expect(getByText('pointer')).toBeTruthy()
  })

  test('the provider can set it for a whole app', () => {
    const { container } = render(
      <UIProvider toaster={false} platform="touch">
        <Button>Play</Button>
      </UIProvider>,
    )
    expect(container.querySelector('[data-platform="touch"] button')).toBeTruthy()
  })
})

describe('SearchField', () => {
  test('is a named searchbox; clearing empties it and keeps focus in it', async () => {
    const user = userEvent.setup()
    const onValueChange = mock()
    const { getByRole, queryByRole } = render(
      <SearchField label="Search the library" onValueChange={onValueChange} />,
    )
    const box = getByRole('searchbox', { name: 'Search the library' })
    expect(queryByRole('button', { name: 'Clear search' })).toBeNull()
    await user.type(box, 'sin')
    expect(onValueChange).toHaveBeenLastCalledWith('sin')
    await user.click(getByRole('button', { name: 'Clear search' }))
    expect((box as HTMLInputElement).value).toBe('')
    expect(onValueChange).toHaveBeenLastCalledWith('')
    expect(document.activeElement).toBe(box)
  })

  test('with its label shown it’s a field', () => {
    const { getByText, getByRole } = render(<SearchField label="Filter" hideLabel={false} />)
    expect(getByText('Filter').tagName).toBe('LABEL')
    expect(getByRole('searchbox', { name: 'Filter' })).toBeTruthy()
  })
})

describe('Chip', () => {
  test('a choosable chip is a toggle button', async () => {
    const { getByRole } = render(
      <>
        <Chip selected>All</Chip>
        <Chip selected={false}>Movies</Chip>
        <Chip removable>Drama</Chip>
      </>,
    )
    expect(getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true')
    expect(getByRole('button', { name: 'Movies' }).getAttribute('aria-pressed')).toBe('false')
    const remove = getByRole('button', { name: 'Drama Remove' })
    expect(remove.hasAttribute('aria-pressed')).toBe(false)
  })
})

describe('toggles', () => {
  test('a label beside a checkbox or switch names it and toggles it', async () => {
    const user = userEvent.setup()
    const onCheckedChange = mock()
    const { getByRole, getByText } = render(
      <>
        <Checkbox label="Search on add" onCheckedChange={onCheckedChange} />
        <Switch label="Seed after import" />
      </>,
    )
    await user.click(getByText('Search on add'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(getByRole('switch', { name: 'Seed after import' })).toBeTruthy()
  })

  test('radios are one choice, by arrow key too', async () => {
    const user = userEvent.setup()
    const onValueChange = mock()
    const { getByRole } = render(
      <RadioGroup aria-label="When to upgrade" defaultValue="always" onValueChange={onValueChange}>
        <Radio value="always" label="Always" />
        <Radio value="cutoff" label="Until the cutoff" />
      </RadioGroup>,
    )
    expect(getByRole('radiogroup', { name: 'When to upgrade' })).toBeTruthy()
    await user.click(getByRole('radio', { name: 'Until the cutoff' }))
    expect(onValueChange).toHaveBeenCalledWith('cutoff')
    expect(getByRole('radio', { name: 'Until the cutoff' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })
})

describe('Disclosure', () => {
  test('shows and hides what’s under it', async () => {
    const user = userEvent.setup()
    const { getByRole, queryByText } = render(
      <Disclosure title="Advanced" detail="3 settings">
        Hidden by default.
      </Disclosure>,
    )
    const row = getByRole('button', { name: /Advanced/ })
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(queryByText('Hidden by default.')).toBeNull()
    await user.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    expect(queryByText('Hidden by default.')).toBeTruthy()
  })
})

describe('MultiSelect', () => {
  test('keeps its list open while several are chosen, in the options’ order', async () => {
    const user = userEvent.setup()
    const onValueChange = mock()
    const { getByRole } = render(
      <MultiSelect
        aria-label="Genres"
        placeholder="Any genre"
        onValueChange={onValueChange}
        options={[
          { value: 'drama', label: 'Drama' },
          { value: 'comedy', label: 'Comedy' },
          { value: 'horror', label: 'Horror' },
        ]}
      />,
    )
    const trigger = getByRole('button', { name: 'Genres' })
    expect(trigger.textContent).toBe('Any genre')
    await user.click(trigger)
    await user.click(getByRole('menuitemcheckbox', { name: 'Horror' }))
    await user.click(getByRole('menuitemcheckbox', { name: 'Drama' }))
    expect(onValueChange).toHaveBeenLastCalledWith(['drama', 'horror'])
    expect(getByRole('menuitemcheckbox', { name: 'Drama' }).getAttribute('aria-checked')).toBe(
      'true',
    )
    expect(trigger.textContent).toBe('Drama, Horror')
  })
})

describe('Select', () => {
  test('takes the field’s size', () => {
    const { getByRole } = render(
      <Field label="Quality" size="sm">
        <Select options={[{ value: 'hd', label: 'HD' }]} defaultValue="hd" />
      </Field>,
    )
    expect(classOf(getByRole('combobox'))).toContain('h-(--control-h-sm)')
  })
})

describe('SegmentedControl and Tabs', () => {
  test('share one look: the track and the chosen segment', () => {
    render(
      <>
        <SegmentedControl
          aria-label="View"
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
        />
        <Tabs defaultValue="a">
          <TabsList aria-label="Status">
            <TabsTrigger value="a">All</TabsTrigger>
          </TabsList>
        </Tabs>
      </>,
    )
    const [segmented, tabs] = [...document.querySelectorAll('[data-control]')].map(classOf)
    for (const c of [segmented, tabs]) {
      expect(c).toContain('bg-s2')
      expect(c).toContain('p-(--control-inset)')
      expect(c).toContain('h-(--control-h)')
    }
  })
})

describe('TitleCell', () => {
  test('a song or an album has square art; a film a poster', () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow>
            <TitleCell title="Low Tide Hours" art="/a.jpg" aspect="square" />
            <TitleCell title="Sintel" art="/s.jpg" />
          </TableRow>
        </TableBody>
      </Table>,
    )
    const shapes = [...container.querySelectorAll('[data-aspect]')].map((el) => [
      el.getAttribute('data-aspect'),
      classOf(el).includes(
        el.getAttribute('data-aspect') === 'square' ? 'aspect-square' : 'aspect-poster',
      ),
    ])
    expect(shapes).toEqual([
      ['square', true],
      ['poster', true],
    ])
  })
})
