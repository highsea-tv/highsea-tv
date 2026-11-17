// SPDX-License-Identifier: AGPL-3.0-only
// The scrim behind a modal (src/native/scrim.ts) in a browser, drawn through react-native-web in
// happy-dom: the command palette's, a dialog's and a side sheet's are the `bg` tint at 60% over a
// 6px backdrop blur, and the tint at 96% without the blur when transparency is reduced
// (elevation.md › Blur).
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { cleanup } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { CommandPalette } = await import('../../src/native/command-palette.tsx')
const { Dialog, Sheet } = await import('../../src/native/sheet.tsx')

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

const realMatchMedia = window.matchMedia
afterEach(() => {
  cleanup()
  window.matchMedia = realMatchMedia
})

/** Has the browser report `prefers-reduced-transparency: reduce`. */
function reduceTransparency() {
  window.matchMedia = ((query: string) => {
    if (!query.includes('prefers-reduced-transparency')) return realMatchMedia.call(window, query)
    return { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
  }) as typeof window.matchMedia
}

/** The elements whose own style blurs what's behind them. */
const blurred = () =>
  [...document.querySelectorAll<HTMLElement>('*')].filter((el) =>
    /blur\(6px\)/.test(getComputedStyle(el).backdropFilter || el.style.backdropFilter || ''),
  )

const MODALS: [string, () => ReactNode][] = [
  [
    'the command palette',
    () => <CommandPalette open onOpenChange={() => {}} groups={[]} empty="Nothing" />,
  ],
  ['a dialog', () => <Dialog open onClose={() => {}} title="Remove it" />],
  [
    'a side sheet',
    () => (
      <Sheet open onClose={() => {}} title="Details" side="right">
        {null}
      </Sheet>
    ),
  ],
]

describe('the scrim', () => {
  for (const [name, ui] of MODALS) {
    test(`${name}: the bg tint at 60% over a 6px blur`, () => {
      render(ui())
      const [scrim] = blurred()
      expect(scrim).toBeDefined()
      expect(getComputedStyle(scrim as HTMLElement).backgroundColor.replace(/\s/g, '')).toMatch(
        /^rgba\(11,11,12,0\.60?\)$/,
      )
    })

    test(`${name}: no blur and the tint at 96% when transparency is reduced`, () => {
      reduceTransparency()
      render(ui())
      expect(blurred()).toHaveLength(0)
      const solid = [...document.querySelectorAll<HTMLElement>('*')].filter((el) =>
        /^rgba\(11,11,12,0\.96\)$/.test(getComputedStyle(el).backgroundColor.replace(/\s/g, '')),
      )
      expect(solid.length).toBeGreaterThan(0)
    })
  }
})
