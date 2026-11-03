// SPDX-License-Identifier: AGPL-3.0-only
// The form factor in the native renderer (src/native/theme.tsx and input.ts; controls.md › The form
// factor): the device's input on the web, a phone and a TV, the width class as the window is
// resized across 768, a ThemeProvider's setting over the device, the controls' rule by the input,
// the old `platform` prop, and a page rendered on the server and hydrated. Bun doesn't run React
// Native, so it's stood in for by the two parts the rule reads: `Platform`, and `Dimensions`, whose
// window changes as React Native's does. The web's `matchMedia` is stood in for too, so a test can
// change the primary pointer.
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import type { ReactNode } from 'react'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const platform = { OS: 'web', isTV: false }
let size = { width: 1280, height: 800, scale: 1, fontScale: 1 }
const resized = new Set<() => void>()

mock.module('react-native', () => ({
  Platform: platform,
  Dimensions: {
    get: () => size,
    addEventListener: (_: 'change', change: () => void) => {
      resized.add(change)
      return { remove: () => resized.delete(change) }
    },
  },
}))
// the theme's reduced motion asks Reanimated, which needs more of React Native than this stands in
mock.module('react-native-reanimated', () => ({ useReducedMotion: () => false }))

let coarse = false
const repointed = new Set<() => void>()
Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    get matches() {
      return query === '(pointer: coarse)' && coarse
    },
    addEventListener: (_: 'change', listener: () => void) => repointed.add(listener),
    removeEventListener: (_: 'change', listener: () => void) => repointed.delete(listener),
  }),
})

const { act, cleanup, renderHook } = await import('@testing-library/react')
const { renderToString } = await import('react-dom/server')
const { hydrateRoot } = await import('react-dom/client')
const { FORM_FACTORS, formFactorName, formFactorSettingNamed } = await import('@highsea-tv/tokens')
const { nativeTokens, tvUnit } = await import('@highsea-tv/tokens/native')
const { controlPoints } = await import('../../src/native/metrics.ts')
const { ThemeProvider, useControl, useFormFactor, useTheme } = await import(
  '../../src/native/theme.tsx'
)

type Setting = Omit<Parameters<typeof ThemeProvider>[0], 'children'>

/** Everything inside drawn by a ThemeProvider with these props. */
const provider =
  (props: Setting = {}) =>
  ({ children }: { children: ReactNode }) => <ThemeProvider {...props}>{children}</ThemeProvider>

/** What a screen inside reads: the form factor, the theme's, and an md control. */
const read = () => ({ formFactor: useFormFactor(), theme: useTheme(), control: useControl() })

function resize(width: number) {
  size = { ...size, width }
  act(() => {
    for (const change of resized) change()
  })
}

function point(isCoarse: boolean) {
  coarse = isCoarse
  act(() => {
    for (const change of repointed) change()
  })
}

beforeEach(() => {
  platform.OS = 'web'
  platform.isTV = false
  size = { width: 1280, height: 800, scale: 1, fontScale: 1 }
  coarse = false
})

afterEach(() => cleanup())

describe('the device', () => {
  test('a web page has a pointer, compact below 768 and regular from it, as it’s resized', () => {
    size = { ...size, width: 767 }
    const { result } = renderHook(() => useFormFactor(), { wrapper: provider() })
    expect(result.current).toBe(FORM_FACTORS['compact-pointer'])
    resize(768)
    expect(result.current).toBe(FORM_FACTORS['regular-pointer'])
    resize(767)
    expect(result.current).toBe(FORM_FACTORS['compact-pointer'])
  })

  test('a web page is touch while the primary pointer is coarse, and follows it', () => {
    coarse = true
    const { result } = renderHook(() => useFormFactor(), { wrapper: provider() })
    expect(result.current).toBe(FORM_FACTORS['regular-touch'])
    point(false)
    expect(result.current).toBe(FORM_FACTORS['regular-pointer'])
    point(true)
    expect(result.current).toBe(FORM_FACTORS['regular-touch'])
  })

  test('iOS and Android are touch, compact on a phone and regular on a tablet', () => {
    for (const os of ['ios', 'android']) {
      platform.OS = os
      size = { ...size, width: 390 }
      const { result, unmount } = renderHook(() => useFormFactor(), { wrapper: provider() })
      expect(result.current).toBe(FORM_FACTORS['compact-touch'])
      resize(1024)
      expect(result.current).toBe(FORM_FACTORS['regular-touch'])
      unmount()
    }
  })

  test('a TV is the TV, whatever its width', () => {
    platform.OS = 'ios'
    platform.isTV = true
    size = { ...size, width: 1920 }
    const { result } = renderHook(() => useFormFactor(), { wrapper: provider() })
    expect(result.current).toBe(FORM_FACTORS.tv)
    resize(600)
    expect(result.current).toBe(FORM_FACTORS.tv)
  })
})

describe('a ThemeProvider’s setting', () => {
  test('wins over the device and the window, and an inner provider keeps it', () => {
    // a phone frame on a wide web page with a mouse, given as a literal rather than the constant
    const { result } = renderHook(read, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ThemeProvider formFactor={{ input: 'touch', widthClass: 'compact' }}>
          <ThemeProvider theme={nativeTokens.themes.default}>{children}</ThemeProvider>
        </ThemeProvider>
      ),
    })
    expect(result.current.formFactor).toBe(FORM_FACTORS['compact-touch'])
    expect(result.current.theme.formFactor).toBe(FORM_FACTORS['compact-touch'])
    expect(result.current.control).toEqual(controlPoints('touch', 1))
    resize(1920)
    expect(result.current.formFactor).toBe(FORM_FACTORS['compact-touch'])
  })

  test('can be the input alone, with the width class from the window', () => {
    const { result } = renderHook(read, { wrapper: provider({ formFactor: 'touch' }) })
    expect(result.current.formFactor).toBe(FORM_FACTORS['regular-touch'])
    resize(700)
    expect(result.current.formFactor).toBe(FORM_FACTORS['compact-touch'])
    expect(result.current.theme.formFactor).toBe(FORM_FACTORS['compact-touch'])
  })

  test('of the TV scales by the TV’s unit', () => {
    const { result } = renderHook(read, { wrapper: provider({ formFactor: FORM_FACTORS.tv }) })
    expect(result.current.theme.u).toBe(tvUnit(1280))
    expect(result.current.control).toEqual(controlPoints('tv', tvUnit(1280)))
  })
})

describe('a resize', () => {
  test('within a width class renders nothing inside the provider', () => {
    let renders = 0
    const { result } = renderHook(
      () => {
        renders++
        return useFormFactor()
      },
      { wrapper: provider() },
    )
    const before = renders
    resize(1000)
    resize(1440)
    expect(renders).toBe(before)
    expect(result.current).toBe(FORM_FACTORS['regular-pointer'])
    resize(500)
    expect(renders).toBe(before + 1)
    expect(result.current).toBe(FORM_FACTORS['compact-pointer'])
  })
})

describe('an address’s setting', () => {
  test('can carry an input or a whole form factor', () => {
    expect(formFactorSettingNamed('touch')).toBe('touch')
    expect(formFactorSettingNamed('tv')).toBe('tv')
    expect(formFactorSettingNamed('pointer')).toBe('pointer')
    expect(formFactorSettingNamed('compact-touch')).toBe(FORM_FACTORS['compact-touch'])
    expect(formFactorSettingNamed('phone')).toBeUndefined()
  })
})

type Container = Parameters<typeof hydrateRoot>[0] & {
  innerHTML: string
  readonly textContent: string | null
  remove(): void
}
type Page = { createElement(tag: 'div'): Container; body: { append(node: Container): void } }

describe('a page rendered on the server', () => {
  const Probe = () => {
    const formFactor = useFormFactor()
    return <p>{`${formFactorName(formFactor)} ${useControl().hit}`}</p>
  }

  test('draws a regular window with a pointer, and hydrates, then takes the window it’s in', async () => {
    // react-native-web's window without a DOM
    size = { ...size, width: 0, height: 0 }
    const html = renderToString(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(html).toContain('regular-pointer 0')

    // the browser: a phone's, narrow and coarse
    size = { ...size, width: 390, height: 844 }
    coarse = true
    // happy-dom's, which the native renderer's types (no DOM library) leave out
    const { document } = globalThis as unknown as { document: Page }
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const errors: unknown[] = []
    const root = await act(async () =>
      hydrateRoot(
        container,
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
        { onRecoverableError: (error) => errors.push(error) },
      ),
    )
    expect(errors).toEqual([])
    expect(container.textContent).toBe('compact-touch 44')
    act(() => root.unmount())
    container.remove()
  })
})

describe('the controls’ rule', () => {
  test('with a pointer is the pointer’s: 36, 14 text and no hit area', () => {
    const { result } = renderHook(read, { wrapper: provider() })
    expect(result.current.theme.formFactor.input).toBe('pointer')
    expect(result.current.control).toEqual(controlPoints('pointer', 1))
    expect(result.current.control.height).toBe(36)
    expect(result.current.control.text).toBe(14)
    expect(result.current.control.hit).toBe(0)
    expect(result.current.theme.u).toBe(1)
  })

  test('follows the primary pointer on the web, to touch’s 44 hit area and back', () => {
    const { result } = renderHook(read, { wrapper: provider() })
    point(true)
    expect(result.current.control).toEqual(controlPoints('touch', 1))
    expect(result.current.control.hit).toBe(44)
    point(false)
    expect(result.current.control.hit).toBe(0)
  })
})

describe('the old `platform` prop', () => {
  test('`mobile` is touch, even on a web page with a mouse', () => {
    const { result } = renderHook(read, { wrapper: provider({ platform: 'mobile' }) })
    expect(result.current.formFactor.input).toBe('touch')
    expect(result.current.theme.formFactor.input).toBe('touch')
    expect(result.current.control).toEqual(controlPoints('touch', 1))
    expect(result.current.theme.u).toBe(1)
  })

  test('`tv` is the TV, scaled by its unit', () => {
    const { result } = renderHook(read, { wrapper: provider({ platform: 'tv' }) })
    expect(result.current.formFactor).toBe(FORM_FACTORS.tv)
    expect(result.current.theme.u).toBe(tvUnit(1280))
    expect(result.current.control).toEqual(controlPoints('tv', tvUnit(1280)))
  })

  test('left out on a phone is touch, as its old default `mobile` was', () => {
    platform.OS = 'ios'
    size = { ...size, width: 390 }
    const { result } = renderHook(read, { wrapper: provider() })
    expect(result.current.theme.formFactor).toBe(FORM_FACTORS['compact-touch'])
    expect(result.current.control).toEqual(controlPoints('touch', 1))
  })
})
