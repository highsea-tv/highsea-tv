// SPDX-License-Identifier: AGPL-3.0-only
// The library's text fields (src/native/field.tsx) in a browser, drawn through react-native-web
// in happy-dom as parts.test.tsx draws its parts: the field look's own edge shows focus, so the
// <input> inside never draws the browser's :focus-visible outline as well (react-native-web's
// TextInput resets its border and appearance but not its outline), and a search field's clear
// button sits in the field with nothing drawn round it until it's hovered or focused.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, mock, test } from 'bun:test'
import { join } from 'node:path'
import type { ReactNode } from 'react'

const rnw = Bun.resolveSync(
  'react-native-web',
  join(import.meta.dir, '../../../../apps/client/package.json'),
)
for (const spec of ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']) {
  const ours = await import(spec)
  mock.module(Bun.resolveSync(spec, rnw), () => ours)
}
const web = await import(rnw)
mock.module('react-native', () => web)
const AnimatedView = web.View
mock.module('react-native-reanimated', () => ({
  default: { createAnimatedComponent: <T,>(component: T) => component, View: AnimatedView },
  useReducedMotion: () => false,
  useSharedValue: <T,>(value: T) => ({ value }),
  useAnimatedStyle: (style: () => object) => style(),
  withSpring: <T,>(value: T) => value,
  withTiming: <T,>(value: T) => value,
}))
const none = () => null
mock.module('react-native-svg', () => ({
  default: none,
  G: none,
  Path: none,
  Circle: none,
  Rect: none,
}))
mock.module('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: {} }))
mock.module(join(import.meta.dir, '../../src/native/icons.ts'), () => ({
  icons: new Proxy({}, { get: () => none }),
}))
const engineWeb = await import('../../src/native/tv/engine.web.tsx')
mock.module(join(import.meta.dir, '../../src/native/tv/engine.tsx'), () => engineWeb)

const testing = await import('@testing-library/react')
const { act, cleanup, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { Input, SearchField, Textarea } = await import('../../src/native/field.tsx')

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

afterEach(() => cleanup())

/** The box a field's input sits in: the nearest element up from it with a border drawn. */
const boxOf = (el: HTMLElement) => {
  for (let at: HTMLElement | null = el; at; at = at.parentElement)
    if (at.style.borderTopWidth || at.style.borderWidth) return at
  return null
}

describe('a field in a browser', () => {
  test('a search field’s input leaves the browser’s focus outline off, as the field draws focus', async () => {
    render(<SearchField label="Search" value="sintel" onChangeText={() => {}} clearLabel="Clear" />)
    const input = screen.getByLabelText('Search') as HTMLInputElement
    await act(async () => input.focus())
    expect(input.style.outlineStyle).toBe('none')
    // the edge that shows focus is the field's, around the icon, the input and the clear button
    const box = boxOf(input.parentElement as HTMLElement)
    expect(box?.contains(screen.getByLabelText('Clear'))).toBe(true)
  })

  test('an input and a text area leave it off too', () => {
    render(
      <>
        <Input accessibilityLabel="Name" />
        <Textarea accessibilityLabel="Notes" />
      </>,
    )
    expect((screen.getByLabelText('Name') as HTMLElement).style.outlineStyle).toBe('none')
    expect((screen.getByLabelText('Notes') as HTMLElement).style.outlineStyle).toBe('none')
  })

  test('a colour well is the browser’s colour input, named and passing on what’s picked', async () => {
    const { ColorWell } = await import('../../src/native/color-well.web.tsx')
    const picked: string[] = []
    render(<ColorWell aria-label="Accent" value="#8fbfb7" onChange={(v) => picked.push(v)} />)
    const input = screen.getByLabelText('Accent') as HTMLInputElement
    expect(input.type).toBe('color')
    expect(input.value).toBe('#8fbfb7')
    testing.fireEvent.input(input, { target: { value: '#112233' } })
    expect(picked).toEqual(['#112233'])
  })
})
