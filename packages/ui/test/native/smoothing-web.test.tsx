// SPDX-License-Identifier: AGPL-3.0-only
// The library's text in a browser, drawn through react-native-web in happy-dom as
// field-web.test.tsx draws its fields: every text smooths its glyphs as the web renderer's `html`
// did until D3 (`-webkit-font-smoothing: antialiased`), so a Mac's browser doesn't
// draw light text a weight heavier than the design, and a label on an accent fill keeps the
// browser's own (`[-webkit-font-smoothing:auto]`, as the web renderer's button.tsx had it).
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
// happy-dom's CSSStyleDeclaration drops properties it doesn't know, these among them, so the test
// reads the style each Text is handed, flattened as react-native-web flattens it
const { createElement, forwardRef } = await import('react')
const handed = new Map<string, Record<string, unknown>>()
const RecordedText = forwardRef((props: { style?: unknown; children?: unknown }, ref) => {
  if (typeof props.children === 'string')
    handed.set(props.children, web.StyleSheet.flatten(props.style) ?? {})
  return createElement(web.Text, { ...props, ref })
})
const RecordedInput = forwardRef((props: { style?: unknown; accessibilityLabel?: string }, ref) => {
  if (props.accessibilityLabel)
    handed.set(props.accessibilityLabel, web.StyleSheet.flatten(props.style) ?? {})
  return createElement(web.TextInput, { ...props, ref })
})
mock.module('react-native', () => ({ ...web, Text: RecordedText, TextInput: RecordedInput }))
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
// a Button's picture, which none of these has
mock.module('expo-image', () => ({ Image: () => null }))
mock.module('expo-haptics', () => ({ impactAsync: async () => {}, ImpactFeedbackStyle: {} }))
mock.module(join(import.meta.dir, '../../src/native/icons.ts'), () => ({
  icons: new Proxy({}, { get: () => none }),
}))
const engineWeb = await import('../../src/native/tv/engine.web.tsx')
mock.module(join(import.meta.dir, '../../src/native/tv/engine.tsx'), () => engineWeb)
const testing = await import('@testing-library/react')
const { cleanup, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { Text } = await import('../../src/native/text.tsx')
const { Chip } = await import('../../src/native/chip.tsx')
const { Button } = await import('../../src/native/button.tsx')
const { Input } = await import('../../src/native/field.tsx')

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

afterEach(() => cleanup())

const smoothing = (words: string) => handed.get(words)?.WebkitFontSmoothing

describe('text in a browser', () => {
  test('a text, a chip’s and a button’s label and a field smooth as the web renderer does', () => {
    render(
      <>
        <Text>Searches what’s here</Text>
        <Chip onPress={() => {}}>Comedy</Chip>
        <Button variant="ghost" onPress={() => {}}>
          Look again
        </Button>
        <Input accessibilityLabel="Name" />
      </>,
    )
    for (const words of ['Searches what’s here', 'Comedy', 'Look again']) {
      expect(screen.getByText(words)).toBeTruthy()
      expect(smoothing(words)).toBe('antialiased')
      expect(handed.get(words)?.MozOsxFontSmoothing).toBe('grayscale')
    }
    expect(smoothing('Name')).toBe('antialiased')
  })

  test('a label on an accent fill keeps the browser’s own', () => {
    render(
      <Button variant="primary" onPress={() => {}}>
        Play
      </Button>,
    )
    expect(screen.getByText('Play')).toBeTruthy()
    expect(smoothing('Play')).toBe('auto')
  })
})
