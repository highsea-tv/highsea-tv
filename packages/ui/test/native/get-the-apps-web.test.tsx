// SPDX-License-Identifier: AGPL-3.0-only
// Get the apps (src/native/get-the-apps.tsx) in a browser, drawn through react-native-web in
// happy-dom: this computer's app first, each installer opened by the app's `onOpen` or followed as
// a link to the releases, and the address copied with what happened said.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { act, cleanup, fireEvent, screen, within } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { GetTheApps } = await import('../../src/native/get-the-apps.tsx')

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

const RELEASES = 'https://github.com/highsea-tv/highsea-tv/releases/latest'
const nav = globalThis.navigator as unknown as Record<string, unknown>
const set = (key: string, value: unknown) =>
  Object.defineProperty(nav, key, { value, configurable: true })

afterEach(() => {
  cleanup()
  set('clipboard', undefined)
})

describe('GetTheApps', () => {
  test('this computer’s app comes first, and each installer opens through the app', () => {
    set('platform', 'MacIntel')
    const opened: string[] = []
    render(
      <GetTheApps
        server="Harbor"
        address="http://192.168.1.20:3000"
        onOpen={(u) => opened.push(u)}
      />,
    )
    const list = screen.getByRole('list', { name: 'Desktop apps' })
    const apps = within(list).getAllByRole('listitem')
    expect(apps.map((a) => a.textContent?.split(/(?=Apple|Windows 10|Ubuntu)/)[0])).toEqual([
      'macOSThis computer',
      'Windows',
      'Linux',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Download .deb for Linux' }))
    expect(opened).toEqual([RELEASES])
    expect(screen.getByText(/finds Harbor on this network by itself/)).toBeTruthy()
  })

  test('without onOpen, each installer is a link to the releases, opened elsewhere', () => {
    render(<GetTheApps server="Harbor" address="http://192.168.1.20:3000" />)
    const link = screen.getByRole('link', { name: 'Download .exe for Windows' })
    expect(link.getAttribute('href')).toBe(RELEASES)
    expect(link.getAttribute('target')).toBe('_blank')
  })

  test('the address is copied, and what happened is said', async () => {
    const copied: string[] = []
    set('clipboard', { writeText: async (s: string) => void copied.push(s) })
    const said: [string, boolean][] = []
    render(
      <GetTheApps
        server="Harbor"
        address="http://192.168.1.20:3000"
        onSay={(title, ok) => said.push([title, ok])}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy the address' }))
    })
    expect(copied).toEqual(['http://192.168.1.20:3000'])
    expect(said).toEqual([['Address copied', true]])
  })

  test('with no clipboard there’s no Copy button', () => {
    render(<GetTheApps server="Harbor" address="http://192.168.1.20:3000" />)
    expect(screen.queryByRole('button', { name: 'Copy the address' })).toBeNull()
  })
})
