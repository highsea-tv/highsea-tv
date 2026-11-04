// SPDX-License-Identifier: AGPL-3.0-only
// The web's host (src/host.web.ts) in a real build, not mock mode: a plain browser is its server's
// alone and keeps no list of servers, while the desktop app's webview (Tauri's global set) keeps
// them as the phone does (connectivity.md), and names its system for About.
import { ThemeProvider } from '@highsea-tv/ui'
import { renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

jest.mock('../src/transport.ts', () => ({ mock: undefined, transport: undefined }))
// the app's version comes from @highsea-tv/native/device, whose expo-crypto is native
jest.mock(
  require.resolve('expo-crypto', {
    paths: [require('node:path').resolve(__dirname, '../../../packages/native')],
  }),
  () => require('./mock.ts').cryptoModule(),
)

const g = globalThis as { __TAURI_INTERNALS__?: unknown }

afterEach(() => {
  delete g.__TAURI_INTERNALS__
})

/** The form factor comes from the theme, as in the app. */
const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

const host = () => require('../src/host.web.ts') as typeof import('../src/host.web.ts')

test('a plain browser keeps no servers', async () => {
  const { result } = await renderHook(() => host().useKeepsServers(), { wrapper })
  expect(result.current).toBe(false)
  expect(
    (await renderHook(() => host().useDesktopOs(), { wrapper })).result.current,
  ).toBeUndefined()
})

test('the desktop app’s webview keeps its servers', async () => {
  g.__TAURI_INTERNALS__ = {}
  const { result } = await renderHook(() => host().useKeepsServers(), { wrapper })
  expect(result.current).toBe(true)
  expect((await renderHook(() => host().useDesktopOs(), { wrapper })).result.current).toEqual(
    expect.stringMatching(/^(Mac|Windows|Linux)$/),
  )
})
