// SPDX-License-Identifier: AGPL-3.0-only
// A ThemeProvider's fontScale (src/native/theme.tsx) reaching what it draws, as the prototypes'
// Text 200% does in the frames: text, a control's label and a field's text grow with it, each held
// to its own maxFontSizeMultiplier as the OS's text size is (fontScaleFor), so a tab label capped
// at 1.4 stops there. Drawn through react-native-web in happy-dom, as engine-web.test.tsx explains;
// what a Button needs beyond drawing is stood in for: expo-image (only for a picture this doesn't
// draw), expo-haptics, react-native-svg (the TV's head, which the focus engine's modules reach),
// and of Reanimated the press's spring, as plain values and components. The focus engine is the
// web's (engine.web.tsx), as Metro picks it for the client's web export.
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
mock.module('react-native-reanimated', () => ({
  default: { createAnimatedComponent: <T,>(component: T) => component, View: web.View },
  useReducedMotion: () => false,
  useSharedValue: <T,>(value: T) => ({ value }),
  useAnimatedStyle: (style: () => object) => style(),
  withSpring: <T,>(value: T) => value,
}))
mock.module('expo-image', () => ({ Image: () => null }))
const none = () => null
mock.module('react-native-svg', () => ({
  default: none,
  Circle: none,
  Defs: none,
  LinearGradient: none,
  Mask: none,
  Path: none,
  Rect: none,
  Stop: none,
}))
mock.module('expo-haptics', () => ({
  impactAsync: async () => {},
  notificationAsync: async () => {},
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}))

const engineWeb = await import('../../src/native/tv/engine.web.tsx')
mock.module(join(import.meta.dir, '../../src/native/tv/engine.tsx'), () => engineWeb)

const testing = await import('@testing-library/react')
const { cleanup } = testing
const { ThemeProvider, fontScaleFor } = await import('../../src/native/theme.tsx')
const { Text } = await import('../../src/native/text.tsx')
const { Button } = await import('../../src/native/button.tsx')
const { Input } = await import('../../src/native/field.tsx')

afterEach(cleanup)

/** The element's computed font size in pixels, drawn on touch at this fontScale. */
function sizeOf(ui: ReactNode, find: (root: HTMLElement) => Element | null, fontScale?: number) {
  const { container } = testing.render(
    <ThemeProvider formFactor="touch" fontScale={fontScale}>
      {ui}
    </ThemeProvider>,
  )
  const el = find(container)
  if (!el) throw new Error('nothing drawn')
  return Number.parseFloat(getComputedStyle(el).fontSize)
}

const byText = (text: string) => (root: HTMLElement) =>
  [...root.querySelectorAll('*')].find(
    (el) => el.textContent === text && el.children.length === 0,
  ) ?? null

describe('fontScaleFor', () => {
  test('holds the scale to the cap, 2 unless the element says otherwise', () => {
    expect(fontScaleFor({ fontScale: 3 })).toBe(2)
    expect(fontScaleFor({ fontScale: 1.5 })).toBe(1.5)
    expect(fontScaleFor({ fontScale: 2 }, 1.4)).toBe(1.4)
  })

  test('0 is no cap, and a cap under 1 never shrinks text', () => {
    expect(fontScaleFor({ fontScale: 3 }, 0)).toBe(3)
    expect(fontScaleFor({ fontScale: 2 }, 0.5)).toBe(1)
  })
})

describe('text at 200%', () => {
  test("a Button's label grows with the provider's fontScale", () => {
    const at = (scale?: number) => sizeOf(<Button>Play</Button>, byText('Play'), scale)
    const plain = at()
    expect(plain).toBeGreaterThan(0)
    expect(at(2)).toBeCloseTo(plain * 2, 5)
  })

  test("a field's text grows too", () => {
    const at = (scale?: number) =>
      sizeOf(<Input defaultValue="Sintel" />, (root) => root.querySelector('input'), scale)
    expect(at(2)).toBeCloseTo(at() * 2, 5)
  })

  test('text with its own cap stops there, as a tab label at 1.4 does', () => {
    const at = (scale?: number) =>
      sizeOf(
        <Text variant="tabLabel" maxFontSizeMultiplier={1.4}>
          Home
        </Text>,
        byText('Home'),
        scale,
      )
    const plain = at()
    expect(at(2)).toBeCloseTo(plain * 1.4, 5)
    expect(at(1.2)).toBeCloseTo(plain * 1.2, 5)
  })

  test('nothing grows past 200% without a cap of its own', () => {
    const plain = sizeOf(<Text>Body</Text>, byText('Body'))
    expect(sizeOf(<Text>Body</Text>, byText('Body'), 3)).toBeCloseTo(plain * 2, 5)
  })
})
