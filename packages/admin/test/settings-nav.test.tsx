// SPDX-License-Identifier: AGPL-3.0-only
// An area's page and the areas (the owner's decision of 2026-11-10): beside the content once the
// window has room for both (the sidebar, the padding, the areas' column and
// `admin.settings.contentMin`), and below that folded into a menu above the content, with All
// settings, whose choice opens that area. The shell and Next's router are stood in for.
import './dom.ts'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ReactNode } from 'react'

const pushed: string[] = []
mock.module('../src/navigation.tsx', () => ({
  useRouter: () => ({ push: (href: string) => pushed.push(href) }),
  usePathname: () => '/settings/appearance',
  useSearchParams: () => new URLSearchParams(),
}))
mock.module('../src/shell.tsx', () => ({
  useShell: () => ({ role: 'owner' }),
  AdminPage: ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const { act, cleanup, render, screen } = await import('@testing-library/react')
const { default: userEvent } = await import('@testing-library/user-event')
const { ThemeProvider } = await import('@highsea-tv/ui/native')
const { admin, density, space } = await import('@highsea-tv/tokens')
const { AreaPage } = await import('../src/settings.tsx')

/** The window the areas need beside the content, as settings.tsx sums it. */
const BESIDE =
  density.sidebar +
  2 * density.mainPadding +
  admin.sideColumn +
  space['6'] +
  admin.settings.contentMin

/**
 * Sizes the window as react-native-web's Dimensions reads it: happy-dom has no visualViewport, so
 * it falls back to the root's clientWidth and listens for `resize` (as stepper-web.test.tsx does).
 */
const at = (width: number) => {
  act(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: width,
    })
    window.dispatchEvent(new Event('resize'))
  })
  return render(
    <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
      <AreaPage id="appearance">
        <p>Server identity</p>
      </AreaPage>
    </ThemeProvider>,
  )
}

afterEach(() => {
  cleanup()
  pushed.length = 0
})

describe('an area’s page', () => {
  test('the areas sit beside the content once there’s room', () => {
    expect(BESIDE).toBe(1136)
    at(BESIDE)
    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Settings area: Appearance' })).toBeNull()
  })

  test('below it, they fold into a menu above the content, and a choice opens that area', async () => {
    at(BESIDE - 1)
    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull()
    expect(screen.getByRole('link', { name: 'All settings' })).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Settings area: Appearance' })
    await userEvent.click(button)
    const current = screen.getByRole('menuitemradio', { name: 'Appearance' })
    expect(current.getAttribute('aria-checked')).toBe('true')
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Security' }))
    expect(pushed).toEqual(['/settings/security'])
  })
})
