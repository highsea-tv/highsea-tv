// SPDX-License-Identifier: AGPL-3.0-only
// The account with a pointer, through Expo Router's test renderer over the real app directory and
// the mock server (./mock.ts): no network. The top bar's avatar opens the account menu
// (src/account/menu.tsx), Account opens Profile (src/app/(in)/profile.tsx) with what the server
// knows of the person and links to their settings, devices and downloads, and a browser's
// Settings › About opens Get the apps (src/account/get-the-apps.tsx), this computer's app first.
// By touch, Profile is the phone's You: Settings' list, the person at its top.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { acknowledge, flush, fresh, signedIn as signIn, words } from './mock.ts'

const g = globalThis as {
  __formFactor?: string
  __device?: string
  navigator?: { platform?: string; userAgent?: string; clipboard?: unknown }
}

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'regular-pointer',
}))
// a browser away from its own server, when a test says so: Settings › About offers the apps there
jest.mock('../src/host', () => {
  const actual = jest.requireActual('../src/host')
  const web = () => (globalThis as { __device?: string }).__device === 'web'
  return {
    ...actual,
    // called every render, then overridden (the rules of hooks)
    useDevice: () => {
      const device = actual.useDevice()
      return web() ? 'web' : device
    },
    useKeepsServers: () => {
      const keeps = actual.useKeepsServers()
      return web() ? false : keeps
    },
  }
})
// the system browser the downloads open in
jest.mock('../src/browser', () => ({ openBrowser: jest.fn(async () => {}) }))
jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => require('./mock.ts').serverStore(),
)
jest.mock(
  require.resolve('expo-crypto', {
    paths: [require('node:path').resolve(__dirname, '../../../packages/native')],
  }),
  () => require('./mock.ts').cryptoModule(),
)
jest.mock('expo-crypto', () => require('./mock.ts').cryptoModule())
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

const navigator = g.navigator
beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete g.__formFactor
  delete g.__device
  g.navigator = navigator
})

/** Signs in and acknowledges the seed's announcement, which shows over every page until then. */
const signedIn = async (username?: string) => {
  const r = await signIn(username)
  await acknowledge()
  return r
}

const go = async (path: string) => {
  await act(async () => router.navigate(path as never))
  await flush()
}

const openMenu = async (name: string) => {
  await fireEvent.press(screen.getByRole('button', { name: `${name}: profile and settings` }))
  await flush()
  // the panel stays transparent until it's measured against the avatar, which Jest never lays
  // out, so its items count as hidden (the library's Anchored); the panel isn't an accessibility
  // element of its own, so it's found by its name
  return screen.getByLabelText(name, { exact: true, includeHiddenElements: true })
}
/** A menu's item: a button off the web, which VoiceOver reads (the library's menuItemRole). */
const item = (menu: ReturnType<typeof screen.getByLabelText>, name: string) =>
  within(menu).getByRole('button', { name, includeHiddenElements: true })

describe('the account menu', () => {
  test('opens from the avatar with Account, Downloads, Settings and Sign out', async () => {
    const r = await signedIn()
    const avatar = screen.getByRole('button', { name: 'Ruth: profile and settings' })
    expect(avatar.props.accessibilityState).toMatchObject({ expanded: false })
    const menu = await openMenu('Ruth')
    expect(
      screen.getByRole('button', { name: 'Ruth: profile and settings' }).props.accessibilityState,
    ).toMatchObject({ expanded: true })
    // in the prototype's order; no update waits outside the desktop app, so Restart to update
    // isn't there
    expect(
      within(menu)
        .getAllByRole('button', { includeHiddenElements: true })
        .map((i) => i.props.accessibilityLabel ?? i.props['aria-label'] ?? words(i)),
    ).toEqual(['Account', 'Downloads', 'Settings', 'Sign out of Harbor'])
    await fireEvent.press(item(menu, 'Account'))
    await flush()
    expect(r.getPathname()).toBe('/profile')
  })

  test('Settings opens Settings', async () => {
    const r = await signedIn()
    const menu = await openMenu('Ruth')
    await fireEvent.press(item(menu, 'Settings'))
    await flush()
    expect(r.getPathname()).toBe('/settings')
  })
})

describe('Profile', () => {
  test('says who you are on the server, with the account’s facts', async () => {
    await signedIn()
    await go('/profile')
    expect(screen.getByRole('header', { name: 'Ruth' })).toBeTruthy()
    expect(screen.getByText('@ruth · on Harbor')).toBeTruthy()
    const account = screen.getByLabelText('Account', { exact: true })
    for (const [name, value] of [
      ['Server', 'Harbor'],
      ['Two-step verification', 'Off'],
      ['Libraries', 'All'],
    ]) {
      expect(within(account).getByText(name)).toBeTruthy()
      expect(within(account).getByText(value)).toBeTruthy()
    }
    expect(within(account).getByText('Change password')).toBeTruthy()
    expect(within(account).getByText('Set up a passkey')).toBeTruthy()
  })

  test('names an admin as an admin', async () => {
    await signedIn('theo')
    await go('/profile')
    expect(screen.getByText('@theo · admin of Harbor')).toBeTruthy()
  })

  test('links to Settings, your devices and Downloads', async () => {
    const r = await signedIn()
    await go('/profile')
    const items: [string, string, string][] = [
      ['Settings', 'Theme, sounds, home screen', '/settings'],
      ['Your devices', 'Where you’re signed in', '/settings'],
      ['Downloads', 'Movies kept on this computer', '/downloads'],
    ]
    for (const [name, hint, path] of items) {
      const link = within(screen.getByLabelText('More')).getByRole('link', { name })
      expect(link.props.accessibilityHint).toBe(hint)
      await fireEvent.press(link)
      await flush()
      expect(r.getPathname()).toBe(path)
      await go('/profile')
    }
  })

  test('by touch, Profile is the phone’s You: Settings with the person at the top', async () => {
    g.__formFactor = 'compact-touch'
    const r = await signedIn()
    await go('/profile')
    expect(r.getPathname()).toBe('/settings')
    expect(screen.getByText('Ruth')).toBeTruthy()
    expect(screen.getByText('@ruth · on Harbor')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Downloads/ })).toBeTruthy()
  })
})

describe('Get the apps', () => {
  const open = async () => {
    await signedIn()
    g.__device = 'web'
    await go('/settings?section=about')
    await fireEvent.press(screen.getByRole('button', { name: 'Get the apps' }))
    await flush()
    return screen.getByLabelText('Desktop apps')
  }

  test('lists each computer’s app, this one first, with the server’s address to copy', async () => {
    const writeText = jest.fn(async () => {})
    g.navigator = { platform: 'Win32', userAgent: 'Windows NT 10.0', clipboard: { writeText } }
    const list = await open()
    // Windows first, named as this computer, with the unsigned installer's note
    expect(
      within(list)
        .getAllByText(/^(macOS|Windows|Linux)$/)
        .map((t) => t.props.children),
    ).toEqual(['Windows', 'macOS', 'Linux'])
    expect(words(list)).toMatch(
      /^\[Desktop apps\] \| Windows \| This computer \| .*Run anyway\. \| \[Download \.exe/,
    )
    for (const name of [
      'Download .exe for Windows',
      'Download .dmg for macOS',
      'Download .AppImage for Linux',
      'Download .deb for Linux',
      'Download .rpm for Linux',
    ])
      expect(screen.getByRole('button', { name })).toBeTruthy()
    const { openBrowser } = require('../src/browser') as { openBrowser: jest.Mock }
    await fireEvent.press(screen.getByRole('button', { name: 'Download .dmg for macOS' }))
    expect(openBrowser).toHaveBeenCalledWith(
      'https://github.com/highsea-tv/highsea-tv/releases/latest',
    )
    expect(screen.getByText(/The app finds Harbor on this network by itself\./)).toBeTruthy()
    expect(screen.getByText('https://harbor.example.net')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Copy the address' }))
    await flush()
    expect(writeText).toHaveBeenCalledWith('https://harbor.example.net')
    expect(screen.getByText('Address copied')).toBeTruthy()
  })

  test('without a clipboard there’s no Copy, and an unknown computer keeps the order', async () => {
    g.navigator = { platform: '', userAgent: '' }
    const list = await open()
    expect(screen.queryByRole('button', { name: 'Copy the address' })).toBeNull()
    expect(within(list).queryByText('This computer')).toBeNull()
    expect(
      within(list)
        .getAllByText(/^(macOS|Windows|Linux)$/)
        .map((t) => t.props.children),
    ).toEqual(['macOS', 'Windows', 'Linux'])
  })

  test('the apps don’t offer the apps', async () => {
    await signedIn()
    await go('/settings?section=about')
    expect(screen.queryByRole('button', { name: 'Get the apps' })).toBeNull()
  })
})
