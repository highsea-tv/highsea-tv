// SPDX-License-Identifier: AGPL-3.0-only
// The command palette (src/native/command-palette.tsx) in a browser, drawn through react-native-web
// in happy-dom as field-web.test.tsx draws its fields: command-score's ranking as cmdk had it, and
// WAI-ARIA's combobox over a listbox, its keys and its shortcut.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { act, cleanup, fireEvent, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { CommandPalette, rankCommands, useCommandPaletteShortcut } = await import(
  '../../src/native/command-palette.tsx'
)
const { commandScore } = await import('../../src/native/command-score.ts')
type Group = import('../../src/native/command-palette.tsx').CommandGroup

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

afterEach(() => cleanup())

const ran: string[] = []
const item = (id: string, label: string, keywords?: string[]) => ({
  id,
  label,
  keywords,
  onSelect: () => ran.push(id),
})
const GROUPS: Group[] = [
  {
    heading: 'Go to',
    items: [
      item('go-dashboard', 'Dashboard'),
      item('go-downloads', 'Downloads', ['torrents', 'queue']),
      item('go-system', 'System'),
    ],
  },
  { heading: 'Actions', items: [item('add-movie', 'Add a movie')] },
]

describe('command-score', () => {
  test('a letter after the last scores best, then a word’s start, and a word’s middle least', () => {
    expect(commandScore('Dashboard', 'Dashboard')).toBe(1)
    expect(commandScore('Dashboard', 'dash')).toBeGreaterThan(commandScore('Add a movie', 'am'))
    expect(commandScore('Add a movie', 'am')).toBeGreaterThan(commandScore('Dashboard', 'db'))
    expect(commandScore('Dashboard', 'xyz')).toBe(0)
  })

  test('keywords match, and two letters the wrong way round still do, poorly', () => {
    expect(commandScore('Downloads', 'torrents', ['torrents'])).toBeGreaterThan(0)
    expect(commandScore('System', 'sytsem')).toBeGreaterThan(0)
    expect(commandScore('System', 'sytsem')).toBeLessThan(commandScore('System', 'syst'))
  })
})

describe('rankCommands', () => {
  test('nothing typed keeps every group as given', () => {
    expect(rankCommands(GROUPS, '  ').map((g) => g.heading)).toEqual(['Go to', 'Actions'])
  })

  test('what doesn’t match is hidden, and groups go by their best command', () => {
    const ranked = rankCommands(GROUPS, 'movie')
    expect(ranked.map((g) => g.heading)).toEqual(['Actions'])
    expect(rankCommands(GROUPS, 'sys').flatMap((g) => g.items.map((i) => i.id))).toEqual([
      'go-system',
    ])
    // Downloads starts with what's typed, Add a movie only has it in a word's middle
    expect(rankCommands(GROUPS, 'do')[0]?.items[0]?.id).toBe('go-downloads')
  })
})

describe('the palette in a browser', () => {
  test('a combobox over a listbox whose first option is chosen, the arrows going round', async () => {
    ran.length = 0
    let open = true
    render(
      <CommandPalette
        open
        onOpenChange={(o) => {
          open = o
        }}
        groups={GROUPS}
        placeholder="Search or jump to…"
      />,
    )
    const box = screen.getByRole('combobox')
    expect(box.getAttribute('aria-expanded')).toBe('true')
    const list = screen.getByRole('listbox')
    expect(box.getAttribute('aria-controls')).toBe(list.id)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Dashboard',
      'Downloads',
      'System',
      'Add a movie',
    ])
    const chosen = () =>
      screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')
    expect(chosen()?.textContent).toBe('Dashboard')
    expect(box.getAttribute('aria-activedescendant')).toBe(chosen()?.id ?? null)
    await act(async () => fireEvent.keyDown(box, { key: 'ArrowUp' }))
    expect(chosen()?.textContent).toBe('Add a movie')
    await act(async () => fireEvent.keyDown(box, { key: 'ArrowDown' }))
    expect(chosen()?.textContent).toBe('Dashboard')
    await act(async () => fireEvent.keyDown(box, { key: 'End' }))
    expect(chosen()?.textContent).toBe('Add a movie')
    await act(async () => fireEvent.keyDown(box, { key: 'Home' }))
    expect(chosen()?.textContent).toBe('Dashboard')
    expect(screen.getByRole('group', { name: 'Go to' })).toBeTruthy()
    await act(async () => fireEvent.keyDown(box, { key: 'Enter' }))
    expect(ran).toEqual(['go-dashboard'])
    expect(open).toBe(false)
  })

  test('typing filters by label and keywords, choosing the best again, and says when nothing matches', async () => {
    ran.length = 0
    const typed: string[] = []
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        groups={GROUPS}
        onSearchChange={(s) => typed.push(s)}
      />,
    )
    const box = screen.getByRole('combobox')
    await act(async () => fireEvent.change(box, { target: { value: 'torrents' } }))
    expect(typed).toEqual(['torrents'])
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Downloads'])
    expect(screen.getByRole('option').getAttribute('aria-selected')).toBe('true')
    await act(async () => fireEvent.click(screen.getByRole('option')))
    expect(ran).toEqual(['go-downloads'])
    await act(async () => fireEvent.change(box, { target: { value: 'qqq' } }))
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('Nothing matches that.')).toBeTruthy()
  })

  test('⌘K and Ctrl K toggle it, and other keys don’t', () => {
    let toggles = 0
    function Listen() {
      useCommandPaletteShortcut(() => toggles++)
      return null
    }
    render(<Listen />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'k' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true, shiftKey: true })
    expect(toggles).toBe(2)
  })
})
