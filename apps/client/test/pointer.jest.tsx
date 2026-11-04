// SPDX-License-Identifier: AGPL-3.0-only
// The gate, the shell and Settings with a pointer, as a browser window draws them: the form factor
// asked for is the pointer's (src/form-factor.ts). Choose a server, its sign-in, the top bar, and
// Settings with its sections beside the one chosen, in a wide window.
import { cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { flush, fresh, signedIn } from './mock.ts'

// a wide window, unless a test asks for a narrow one, which is drawn as touch's list
// (src/app/(in)/settings.tsx)
jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'regular-pointer',
}))
jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
// Bonjour is a native module; mock mode hands the servers provider the mock's own discovery
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
// the servers it knows and their tokens, kept in memory for the file's run (the device's file and
// keychain are native)
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => require('./mock.ts').serverStore(),
)
// PKCE's expo-crypto, as @highsea-tv/native resolves it (Bun's store keeps a copy per peer set)
jest.mock(
  require.resolve('expo-crypto', {
    paths: [require('node:path').resolve(__dirname, '../../../packages/native')],
  }),
  () => require('./mock.ts').cryptoModule(),
)
jest.mock('expo-crypto', () => require('./mock.ts').cryptoModule())
// the swipe to forget a server needs Reanimated's native side: its rows are drawn without it
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __formFactor?: string }).__formFactor
})

/**
 * Opens Settings from the top bar's account menu (src/account/menu.tsx). Its panel stays
 * transparent until measured against the avatar, which Jest never lays out, so its items count as
 * hidden; off the web they're buttons (the library's menuItemRole).
 */
async function openSettings() {
  await fireEvent.press(screen.getByRole('button', { name: /: profile and settings$/ }))
  await flush()
  await fireEvent.press(
    screen.getByRole('button', { name: 'Settings', includeHiddenElements: true }),
  )
  await flush()
}

describe('the gate with a pointer', () => {
  test('signs in, then opens the top bar with its destinations as links', async () => {
    const r = await signedIn()
    expect(r.getPathname()).toBe('/')
    expect(screen.getByRole('button', { name: 'Harbor, Switch server' })).toBeTruthy()
    // the destinations are links in the navigation, the page shown marked as current
    expect(screen.getByLabelText('Main').props.role).toBe('navigation')
    for (const name of ['Search', 'Home', 'Collections', 'Movies'])
      expect(screen.getByRole('link', { name })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Home' }).props['aria-current']).toBe('page')
    expect(screen.getByRole('link', { name: 'Movies' }).props['aria-current']).toBeUndefined()
    await fireEvent.press(screen.getByRole('link', { name: 'Search' }))
    await flush()
    expect(r.getPathname()).toBe('/search')
    expect(screen.getByRole('link', { name: 'Search' }).props['aria-current']).toBe('page')
    expect(screen.getByRole('link', { name: 'Home' }).props['aria-current']).toBeUndefined()
  })

  test('in a wide window, the bar has the prototype’s inset, centring and unchosen tabs', async () => {
    // a 1440 window, the width the prototype's bar was compared at (web/shell.tsx's TopBar)
    const { Dimensions } = require('react-native')
    const was = { window: Dimensions.get('window'), screen: Dimensions.get('screen') }
    const wide = { width: 1440, height: 900, scale: 2, fontScale: 1 }
    Dimensions.set({ window: wide, screen: wide })
    try {
      await signedIn()
      const flat = (el: { props: { style?: unknown } }) =>
        require('react-native').StyleSheet.flatten(el.props.style) ?? {}
      // the row inside the page's gutter (wide:px-16), its one line centred in the 80 (CSS's
      // align-content: normal, where react-native-web's View packs lines at the start)
      const row = screen.getByLabelText('Main').parent as { props: { style?: unknown } }
      expect(flat(row)).toMatchObject({ paddingHorizontal: 64, alignContent: 'center' })
      // the server is the prototype's ghost button, padded as a button is
      const server = screen.getByRole('button', { name: 'Harbor, Switch server' })
      expect(flat(server).paddingHorizontal).toBe(16)
      // an unchosen destination at the prototype's text/65, the chosen one at full strength
      const shown = (name: string) =>
        flat(screen.getByRole('link', { name }).children[0] as { props: { style?: unknown } })
      expect(shown('Movies').opacity).toBe(0.65)
      expect(shown('Home').opacity).toBe(1)
    } finally {
      // unmounted first, so nothing drawn hears the window change back
      await cleanup()
      Dimensions.set(was)
    }
  })

  test('in a narrow window, the bar is the narrow one: Search at its end, the rest a line below', async () => {
    ;(globalThis as { __formFactor?: string }).__formFactor = 'compact-pointer'
    const r = await signedIn()
    expect(screen.getByRole('button', { name: 'Harbor, Switch server' })).toBeTruthy()
    // the destinations' own line scrolls sideways, rather than wrapping the bar onto three
    const nav = screen.getByLabelText('Main')
    expect(nav.props.role).toBe('navigation')
    expect(nav.props.horizontal).toBe(true)
    for (const name of ['Home', 'Collections', 'Movies'])
      expect(within(nav).getByRole('link', { name })).toBeTruthy()
    // Search is the bar's icon, beside Alerts, not in the line
    expect(within(nav).queryByRole('link', { name: 'Search' })).toBeNull()
    // the server is the prototype's ghost button there too, and the unchosen pills its text/65
    const { StyleSheet } = require('react-native')
    const server = screen.getByRole('button', { name: 'Harbor, Switch server' })
    expect(StyleSheet.flatten(server.props.style).paddingHorizontal).toBe(16)
    const pill = (name: string) =>
      StyleSheet.flatten(within(nav).getByText(name, { exact: true }).props.style).opacity
    expect(pill('Movies')).toBe(0.65)
    expect(pill('Home')).toBe(1)
    expect(screen.getByRole('link', { name: 'Home' }).props['aria-current']).toBe('page')
    await fireEvent.press(screen.getByRole('link', { name: 'Search' }))
    await flush()
    expect(r.getPathname()).toBe('/search')
  })

  test('opens Settings beside its sections, with About as this version has it', async () => {
    const r = await signedIn()
    await openSettings()
    expect(r.getPathname()).toBe('/settings')
    // the sections beside the first, Theme, with no hint under the title: tabs, which iOS draws as
    // buttons in a tab bar (src/kit.tsx's TAB_ROW)
    expect(screen.getByRole('button', { name: 'Theme', selected: true })).toBeTruthy()
    expect(screen.queryByText('How this device looks.')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'About' }))
    await flush()
    expect(screen.getByRole('button', { name: 'About', selected: true })).toBeTruthy()
    // what isn't in this version is drawn and says so, and there's no source link
    for (const name of ['Open-source licences', 'Send diagnostics']) {
      const b = screen.getByRole('button', { name })
      expect(b.props.accessibilityState?.disabled ?? b.props['aria-disabled']).toBe(true)
    }
    expect(screen.queryByText('Source code')).toBeNull()
    // an app that keeps servers draws no Get the apps: that's the browser's
    expect(screen.queryByText('Get the apps')).toBeNull()
  })

  test('in a narrow window, Settings is the list, then each section on its own', async () => {
    ;(globalThis as { __formFactor?: string }).__formFactor = 'compact-pointer'
    const r = await signedIn()
    await openSettings()
    expect(r.getPathname()).toBe('/settings')
    // the list with each section's hint, and no section chosen beside it
    expect(screen.getByText('How this device looks.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Theme', selected: true })).toBeNull()
    await fireEvent.press(screen.getByText('About'))
    await flush()
    expect(screen.getByRole('header', { name: 'About' })).toBeTruthy()
    expect(screen.queryByText('How this device looks.')).toBeNull()
    // and back to the list
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    await flush()
    expect(screen.getByText('How this device looks.')).toBeTruthy()
  })
})
