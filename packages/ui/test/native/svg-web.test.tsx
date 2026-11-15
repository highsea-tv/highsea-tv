// SPDX-License-Identifier: AGPL-3.0-only
// The library's SVGs on the web (E1, C1's note): react-native-svg hands the props it doesn't know
// to the `<svg>`, so the Icon, the Mark and the QR code name themselves in ARIA's terms there
// (svgName), and React Native's `accessible`, `accessibilityElementsHidden` and
// `importantForAccessibility` never reach the DOM, where React warns about them in development.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { join } from 'node:path'
import { createElement, type ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
// react-native-svg as its web build draws it: an element of the same name, handed every prop it
// gets (the harness draws nothing). The icons draw the `<svg>` with the props Icon gives them.
const element =
  (tag: string) =>
  ({ children, ...props }: Record<string, unknown>) =>
    createElement(tag, props, children as ReactNode)
mock.module('react-native-svg', () => ({
  default: element('svg'),
  Circle: element('circle'),
  Defs: element('defs'),
  G: element('g'),
  LinearGradient: element('linearGradient'),
  Mask: element('mask'),
  Path: element('path'),
  Rect: element('rect'),
  Stop: element('stop'),
}))
mock.module(join(import.meta.dir, '../../src/native/icons.ts'), () => ({
  icons: new Proxy({}, { get: () => element('svg') }),
}))
const testing = await import('@testing-library/react')
const { cleanup } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { Icon } = await import('../../src/native/icon.tsx')
const { Mark } = await import('../../src/native/brand.tsx')
const { QrCode } = await import('../../src/native/qr-code.tsx')

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

const RN_PROPS = ['accessible', 'accessibilityelementshidden', 'importantforaccessibility']

afterEach(cleanup)

describe('SVGs on the web', () => {
  test('decorative ones are hidden, named ones are images, and React warns about none', () => {
    const errors = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { container } = render(
        <>
          <Icon name="search" />
          <Icon name="forward" label="Forward 10 seconds" />
          <Mark />
          <Mark label="highsea" />
          <QrCode
            value="https://highsea.example/link"
            label="QR code for the sign-in link"
            size={96}
          />
        </>,
      )
      const svgs = [
        ...(
          container as unknown as {
            querySelectorAll: (s: string) => Iterable<{
              getAttribute: (n: string) => string | null
              hasAttribute: (n: string) => boolean
            }>
          }
        ).querySelectorAll('svg'),
      ]
      expect(svgs).toHaveLength(5)
      const [icon, named, mark, namedMark, qr] = svgs
      expect(icon?.getAttribute('aria-hidden')).toBe('true')
      expect(mark?.getAttribute('aria-hidden')).toBe('true')
      expect(named?.getAttribute('role')).toBe('img')
      expect(named?.getAttribute('aria-label')).toBe('Forward 10 seconds')
      expect(namedMark?.getAttribute('aria-label')).toBe('highsea')
      expect(qr?.getAttribute('role')).toBe('img')
      expect(qr?.getAttribute('aria-label')).toBe('QR code for the sign-in link')
      for (const svg of svgs)
        for (const name of RN_PROPS) expect(svg.hasAttribute(name)).toBe(false)
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })
})
