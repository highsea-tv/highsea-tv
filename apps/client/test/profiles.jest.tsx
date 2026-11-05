// SPDX-License-Identifier: AGPL-3.0-only
// Profiles (B3), through Expo Router's test renderer over the real app directory and the mock
// server (./mock.ts), which serves them here (`serveProfiles`): no network. With a pointer, the
// account menu's Switch profile opens `/who`, where a profile with a PIN asks for it; by touch,
// You's Switch profile opens the sheet; on the TV, highsea opens on Who's watching, a profile's
// PIN is typed on the number pad, Add a profile types a name on the keyboard, and Settings has the
// PIN and Profiles. A server that doesn't serve profiles (every other test's, as a real server)
// draws none of it: its client looks as it did at B2.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { forgetLaunch } from '../src/profiles/launch.tsx'
import { forgetAskOnLaunch } from '../src/profiles/state.tsx'
import {
  acknowledge,
  flush,
  fresh,
  serveProfiles,
  signedIn as signIn,
  tvSignedIn,
  words,
} from './mock.ts'

const g = globalThis as { __formFactor?: string; __ask?: boolean }

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'regular-pointer',
}))
// the TV's own setting, kept on the device: in memory here
jest.mock('../src/profiles/launch-setting', () => ({
  readAskOnLaunch: async () => (globalThis as { __ask?: boolean }).__ask ?? true,
  writeAskOnLaunch: (next: boolean) => {
    ;(globalThis as { __ask?: boolean }).__ask = next
  },
}))
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

beforeEach(() => {
  fresh()
  forgetLaunch()
  forgetAskOnLaunch()
})
afterEach(async () => {
  await cleanup()
  delete g.__formFactor
  delete g.__ask
})

const signedIn = async () => {
  const r = await signIn()
  await acknowledge()
  return r
}

const go = async (path: string) => {
  await act(async () => router.navigate(path as never))
  await flush()
}

/** The account menu's items, opened from the avatar named for `name` (./profile.jest.tsx's way). */
const menuItems = async (name: string) => {
  await fireEvent.press(screen.getByRole('button', { name: `${name}: profile and settings` }))
  await flush()
  const menu = screen.getByLabelText(name, { exact: true, includeHiddenElements: true })
  return within(menu)
    .getAllByRole('button', { includeHiddenElements: true })
    .map((i) => i.props.accessibilityLabel ?? i.props['aria-label'] ?? words(i))
}

describe('profiles with a pointer', () => {
  test('the avatar is the profile watching now, and Switch profile leads the menu', async () => {
    serveProfiles()
    await signedIn()
    expect(await menuItems('Ines')).toEqual([
      'Switch profile',
      'Account',
      'Downloads',
      'Settings',
      'Sign out of Harbor',
    ])
  })

  test('Who’s watching switches to a profile without a PIN, and Cancel goes back', async () => {
    serveProfiles()
    const r = await signedIn()
    await go('/who')
    expect(screen.getByRole('header', { name: 'Who’s watching?' })).toBeTruthy()
    // the page stands alone, without the top bar
    expect(screen.queryByRole('button', { name: /profile and settings$/ })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Ruth' }))
    await flush()
    expect(r.getPathname()).toBe('/')
    expect(screen.getByRole('button', { name: 'Ruth: profile and settings' })).toBeTruthy()
  })

  test('a profile with a PIN asks for it, says when it’s wrong, and switches when it’s right', async () => {
    serveProfiles()
    const r = await signedIn()
    await go('/who')
    await fireEvent.press(screen.getByRole('button', { name: 'Theo, has a PIN' }))
    await flush()
    expect(screen.getByRole('header', { name: 'Enter Theo’s PIN' })).toBeTruthy()
    const field = screen.getByLabelText('Theo’s PIN, four digits')
    await fireEvent.changeText(field, '1111')
    await flush()
    expect(screen.getByText('That isn’t Theo’s PIN. Try again.')).toBeTruthy()
    expect(r.getPathname()).toBe('/who')
    await fireEvent.changeText(screen.getByLabelText('Theo’s PIN, four digits'), '2580')
    await flush()
    expect(r.getPathname()).toBe('/')
    expect(screen.getByRole('button', { name: 'Theo: profile and settings' })).toBeTruthy()
  })

  test('the fifth wrong PIN in a row rests the profile', async () => {
    serveProfiles()
    await signedIn()
    await go('/who/p-theo')
    for (let i = 0; i < 5; i++) {
      await fireEvent.changeText(screen.getByLabelText('Theo’s PIN, four digits'), '1111')
      await flush()
    }
    expect(screen.getByText('Too many tries. Try again in a minute.')).toBeTruthy()
  })

  test('Profile shows the profile watching now, and whose account it’s on', async () => {
    serveProfiles()
    await signedIn()
    await go('/who')
    await fireEvent.press(screen.getByRole('button', { name: 'Kids' }))
    await flush()
    await go('/profile')
    expect(screen.getByRole('header', { name: 'Kids' })).toBeTruthy()
    expect(screen.getByText('A profile on @ruth’s account')).toBeTruthy()
  })
})

describe('profiles by touch', () => {
  test('You has Switch profile, whose sheet switches profile', async () => {
    g.__formFactor = 'touch'
    serveProfiles()
    const r = await signedIn()
    await go('/settings')
    await fireEvent.press(screen.getByText('Switch profile'))
    await flush()
    const hidden = { includeHiddenElements: true }
    const sheet = screen.getByLabelText('Profiles', hidden)
    expect(within(sheet).getByLabelText('Ines, watching now', hidden)).toBeTruthy()
    await fireEvent.press(within(sheet).getByLabelText('Ruth', hidden))
    await flush()
    expect(r.getPathname()).toBe('/')
    expect(screen.getByLabelText('Ruth, settings')).toBeTruthy()
  })

  test('/who opens You with the sheet, which asks for a PIN in the sheet', async () => {
    g.__formFactor = 'touch'
    serveProfiles()
    const r = await signedIn()
    await go('/who')
    expect(r.getPathname()).toBe('/settings')
    await fireEvent.press(screen.getByRole('button', { name: 'Theo, has a PIN' }))
    await flush()
    await fireEvent.changeText(screen.getByLabelText('Theo’s PIN, four digits'), '2580')
    await flush()
    expect(r.getPathname()).toBe('/')
  })
  test('a link opened over the sheet goes where it points, without the sheet over it', async () => {
    g.__formFactor = 'touch'
    serveProfiles()
    const r = await signedIn()
    await go('/who')
    const hidden = { includeHiddenElements: true }
    expect(screen.getByLabelText('Profiles', hidden)).toBeTruthy()
    await act(async () => router.push('/link' as never))
    await flush()
    expect(r.getPathname()).toBe('/link')
    expect(screen.queryByLabelText('Profiles', hidden)).toBeNull()
  })
})

describe('profiles on the TV', () => {
  const press = async (name: string | RegExp) => {
    const found = screen.getAllByLabelText(name)
    await fireEvent.press(found[found.length - 1] as never)
    await flush()
  }
  /** Settings' section, shown as focus reaches its name. */
  const section = async (name: string) => {
    await go('/settings')
    await fireEvent(screen.getAllByLabelText(name)[0] as never, 'focus')
    await flush()
  }
  const signedInTv = async () => {
    const r = await tvSignedIn()
    await acknowledge()
    return r
  }

  test('highsea opens on Who’s watching, the profile last here marked', async () => {
    g.__formFactor = 'tv'
    serveProfiles()
    const r = await signedInTv()
    expect(r.getPathname()).toBe('/who')
    expect(screen.getByRole('header', { name: 'Who’s watching?' })).toBeTruthy()
    expect(screen.getByText('Last here')).toBeTruthy()
    // an announcement to acknowledge waits for the opening, as the prototype's came before Home
    expect(screen.queryAllByRole('button', { name: 'Got it' })).toHaveLength(0)
    await press('Ruth')
    expect(r.getPathname()).toBe('/')
    expect(screen.getAllByRole('button', { name: 'Got it' }).length).toBeGreaterThan(0)
  })

  test('with asking turned off on this TV, it opens as the profile last used', async () => {
    g.__formFactor = 'tv'
    g.__ask = false
    serveProfiles()
    const r = await signedInTv()
    expect(r.getPathname()).toBe('/')
  })

  test('a profile’s PIN is typed on the number pad', async () => {
    g.__formFactor = 'tv'
    g.__ask = false
    serveProfiles()
    const r = await signedInTv()
    await go('/who/p-theo')
    expect(screen.getByRole('header', { name: 'Enter Theo’s PIN' })).toBeTruthy()
    for (const d of ['2', '5', '8', '1']) await press(d)
    expect(screen.getByText('That isn’t Theo’s PIN. Try again.')).toBeTruthy()
    await flush(500)
    for (const d of ['2', '5', '8', '0']) await press(d)
    expect(r.getPathname()).toBe('/')
  })

  test('Add a profile types its name, refuses one the account has, and watches as it', async () => {
    g.__formFactor = 'tv'
    g.__ask = false
    serveProfiles()
    const r = await signedInTv()
    await go('/who/new')
    expect(screen.getByRole('header', { name: 'Add a profile' })).toBeTruthy()
    // Shift is on at the start of the name
    for (const k of ['R', 'u', 't', 'h']) await press(k)
    expect(screen.getByText('The account already has a profile called Ruth.')).toBeTruthy()
    await press('Delete')
    await press('Delete')
    await press('Delete')
    for (const k of ['o', 's', 'a']) await press(k)
    await press('Add profile')
    expect(r.getPathname()).toBe('/')
    await section('Profiles')
    expect(screen.getAllByText(/^Rosa/).length).toBeGreaterThan(0)
  })

  test('Settings › Profiles deletes a profile after asking, but never the account’s own', async () => {
    g.__formFactor = 'tv'
    g.__ask = false
    serveProfiles()
    await signedInTv()
    await section('Profiles')
    expect(screen.queryByLabelText('Delete Ines’s profile')).toBeNull()
    await press('Delete Kids’s profile')
    expect(screen.getByText('Delete Kids’s profile?')).toBeTruthy()
    await press('Delete profile')
    expect(screen.queryByLabelText('Delete Kids’s profile')).toBeNull()
  })

  test('Settings › Profiles turns asking off, on this TV', async () => {
    g.__formFactor = 'tv'
    serveProfiles()
    await signedInTv()
    await press(/^Ines/)
    await acknowledge()
    await section('Profiles')
    await press('Ask who’s watching when highsea opens: On')
    expect(g.__ask).toBe(false)
    expect(screen.getByText(/^Only this TV. It opens as whoever watched last/)).toBeTruthy()
  })

  test('Settings › PIN sets a PIN, chosen twice', async () => {
    g.__formFactor = 'tv'
    g.__ask = false
    serveProfiles()
    const r = await signedInTv()
    await section('PIN')
    expect(screen.getByText('Off. Anyone using this account can watch as Ines.')).toBeTruthy()
    await press('Set a PIN')
    expect(r.getPathname()).toBe('/who/pin')
    for (const d of ['1', '2', '3', '4']) await press(d)
    expect(screen.getByRole('header', { name: 'Enter it again' })).toBeTruthy()
    for (const d of ['1', '2', '3', '4']) await press(d)
    expect(r.getPathname()).toBe('/settings')
    expect(screen.getByText('On. Every device asks for it before watching as Ines.')).toBeTruthy()
  })
})

describe('a server without profiles', () => {
  test('with a pointer, the account menu and Profile are as at B2, and /who goes Home', async () => {
    const r = await signedIn()
    expect(await menuItems('Ruth')).toEqual([
      'Account',
      'Downloads',
      'Settings',
      'Sign out of Harbor',
    ])
    await go('/who')
    expect(r.getPathname()).toBe('/')
    await go('/profile')
    expect(screen.getByRole('header', { name: 'Ruth' })).toBeTruthy()
    expect(screen.queryByText(/A profile on/)).toBeNull()
  })

  test('by touch, You has no Switch profile', async () => {
    g.__formFactor = 'touch'
    await signedIn()
    await go('/settings')
    expect(screen.getByText('Ruth')).toBeTruthy()
    expect(screen.queryByText('Switch profile')).toBeNull()
  })

  test('on the TV, it opens Home, and Settings has no PIN or Profiles', async () => {
    g.__formFactor = 'tv'
    const r = await tvSignedIn()
    await acknowledge()
    expect(r.getPathname()).toBe('/')
    await go('/settings')
    expect(screen.queryByLabelText('PIN')).toBeNull()
    expect(screen.queryByLabelText('Profiles')).toBeNull()
    expect(screen.queryByText('Who’s watching')).toBeNull()
  })
})
