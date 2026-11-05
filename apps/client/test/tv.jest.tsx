// SPDX-License-Identifier: AGPL-3.0-only
// The gate, the shell and Settings at the TV's rule, as ./gate.jest.tsx runs them on the phone:
// the form factor asked for is the TV's (src/form-factor.ts), so the screens draw their TV forms.
// Each test from a mock server and a store of its own (./mock.ts). The TV lists the servers
// answering, takes the only one by itself (zero configuration), then shows its code for a phone to
// approve; the mock approves it after PAIRING_APPROVAL_MS. A code that runs out is replaced.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler, Platform, TVEventControl } from 'react-native'
import { flush, fresh, open, rewrite, sent, server, words } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'tv' }))
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
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

beforeEach(fresh)

/** Opens the app, chooses Harbor from the servers answering, and waits for the phone's approval. */
const approved = async () => {
  const r = await open()
  await fireEvent.press(screen.getByLabelText(/^Harbor,/))
  await flush(20_000)
  return r
}

/** Signed in, past the owner's announcement that must be acknowledged, which the shell shows first. */
const signedIn = async () => {
  const r = await approved()
  await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
  await flush()
  return r
}

describe('the gate on the TV', () => {
  test('lists the servers on this network, and a server chosen shows its code', async () => {
    const r = await open()
    // three servers answer in the mock, so the TV asks which
    expect(r.getPathname()).toBe('/connect')
    expect(screen.getByRole('header', { name: 'Servers on this network' })).toBeTruthy()
    await fireEvent.press(screen.getByLabelText(/^Harbor,/))
    await flush()
    expect(r.getPathname()).toBe('/sign-in')
    expect(screen.getByRole('header', { name: 'Sign in with your phone' })).toBeTruthy()
    expect(screen.getByText('Waiting for approval. The code works for 10 minutes.')).toBeTruthy()
    expect(screen.getByText('Use a password')).toBeTruthy()
  })

  test('with only one server answering, it takes it by itself', async () => {
    const state = server().mock.servers.populated.state
    state.discovered = state.discovered.filter((d) => d.name === 'Harbor')
    const r = await open()
    expect(r.getPathname()).toBe('/sign-in')
    expect(screen.getByRole('header', { name: 'Sign in with your phone' })).toBeTruthy()
  })

  test('Use a password opens the TV keyboard', async () => {
    await open()
    await fireEvent.press(screen.getByLabelText(/^Harbor,/))
    await flush()
    await fireEvent.press(screen.getByText('Use a password'))
    await flush()
    expect(screen.getByRole('header', { name: 'Sign in to Harbor' })).toBeTruthy()
    expect(screen.getByText('a')).toBeTruthy()
  })

  test('a code that runs out says so and shows a new one', async () => {
    // the server no longer knows the code the TV polls with: 404, pairing-expired
    let lost = true
    rewrite((url, init) => {
      if (!lost || !url.includes('/api/v1/auth/pairing/poll')) return
      lost = false
      return [url, { ...init, body: JSON.stringify({ pollToken: 'gone' }) }]
    })
    const r = await open()
    await fireEvent.press(screen.getByLabelText(/^Harbor,/))
    // the first poll comes after the server's interval, 5 seconds
    await flush(6000)
    expect(screen.getByText('That code ran out. Here’s a new one.')).toBeTruthy()
    expect(sent('/api/v1/auth/pairing').filter((q) => !q.url.includes('poll'))).toHaveLength(2)
    // the new code is approved, and the TV signs in
    await flush(20_000)
    expect(r.getPathname()).toBe('/')
  })

  test('approved from the phone, it signs in and opens the head', async () => {
    const r = await approved()
    expect(r.getPathname()).toBe('/')
    // the owner's announcement that must be acknowledged comes first, with the head hidden
    expect(screen.getByText('Harbor has a new remote address')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    const shown = words(screen.toJSON())
    for (const name of ['Home', 'Collections', 'Movies']) expect(shown).toContain(name)
    // the head's stops as the prototype's tv/kit.tsx: unchosen at `text-text/65`, the one shown
    // in `text`
    const { StyleSheet } = require('react-native')
    const opacityOf = (name: string) =>
      StyleSheet.flatten(screen.getByText(name, { exact: true }).props.style).opacity
    expect(opacityOf('Collections')).toBe(0.65)
    expect(opacityOf('Movies')).toBe(0.65)
  })
})

describe('Back on tvOS', () => {
  // the Menu key reaches highsea only while it's held; let go, Back leaves to the Apple TV's home
  let calls: string[]
  beforeEach(() => {
    calls = []
    jest
      .spyOn(Platform as typeof Platform & { isTVOS: boolean }, 'isTVOS', 'get')
      .mockReturnValue(true)
    jest.spyOn(TVEventControl, 'enableTVMenuKey').mockImplementation(() => void calls.push('hold'))
    jest.spyOn(TVEventControl, 'disableTVMenuKey').mockImplementation(() => void calls.push('go'))
  })
  afterEach(() => jest.restoreAllMocks())

  test('Choose a server with nothing to go back to lets the key go, after the root holds it', async () => {
    await open()
    expect(calls[0]).toBe('hold')
    expect(calls.at(-1)).toBe('go')
  })

  // Home's own Back, to the featured card and then out, is home-tv.jest.tsx's
  test('the announcement Home opens under lets the key go, and a screen opened after it holds it', async () => {
    await approved()
    // the shell's screen for an announcement that must be acknowledged, in Home's place
    expect(calls.at(-1)).toBe('go')
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }))
    await flush()
    await act(() => router.push('/settings'))
    await flush()
    expect(calls.at(-1)).toBe('hold')
  })

  test('Unreachable on a cold start lets the key go, as the Home it stands in for does', async () => {
    await signedIn()
    await cleanup()
    server().setState({ connection: 'offline' })
    calls = []
    await open()
    expect(screen.getByText('Can’t reach Harbor')).toBeTruthy()
    expect(calls.at(-1)).toBe('go')
  })

  test('the sign-in, with a server to go back to, holds it', async () => {
    await open()
    await fireEvent.press(screen.getByLabelText(/^Harbor,/))
    await flush()
    expect(calls.at(-1)).toBe('hold')
  })
})

describe('Settings on the TV', () => {
  const settings = async (section?: string) => {
    await signedIn()
    await act(() => router.push(section ? `/settings?section=${section}` : '/settings'))
    await flush()
  }

  /** The props of the focus stop with this label, as the TV's engine reads them. */
  const stop = (label: string) =>
    screen.getAllByLabelText(label).find((n) => 'hasTVPreferredFocus' in n.props)?.props ?? {}

  test('opens on the section asked for, with its hint, and focus on its name', async () => {
    await settings('playback')
    expect(stop('Playback').hasTVPreferredFocus).toBe(true)
    expect(stop('Theme').hasTVPreferredFocus).toBe(false)
    // Playback's choices as rows of chips, each a radio group, the one chosen selected
    for (const row of ['Audio', 'Subtitles', 'At home', 'Away']) {
      const group = screen.getByLabelText(row)
      expect(group.props.accessibilityRole).toBe('radiogroup')
      // its chips are its radios: off the web buttons with the selected trait, since React
      // Native gives `radio` no trait on tvOS (the library's RADIO), the one chosen selected
      const radios = within(group).getAllByRole('button')
      expect(radios.length).toBeGreaterThan(1)
      const on = radios.filter((r) => r.props.accessibilityState?.selected === true)
      expect(on).toHaveLength(1)
      for (const r of radios) expect(r.props.accessibilityState?.checked).toBeUndefined()
      for (const r of radios.filter((x) => x !== on[0]))
        expect(r.props.accessibilityState).toMatchObject({ selected: false })
    }
  })

  test('focus moving down the list shows each section, and keeps the first preferred no more', async () => {
    await settings()
    expect(stop('Theme').hasTVPreferredFocus).toBe(true)
    await fireEvent(screen.getAllByLabelText('Home screen')[0], 'focus')
    await flush()
    expect(stop('Theme').hasTVPreferredFocus).toBe(false)
    // Home's rows move by Up and Down, not a drag handle
    expect(screen.getByRole('button', { name: 'Move Continue watching down' })).toBeTruthy()
    expect(screen.getAllByText('Up').length).toBeGreaterThan(0)
  })

  test('the sections are tabs, and Theme is the prototype’s rows and its button', async () => {
    await settings()
    expect(screen.getByLabelText('Settings sections').props.accessibilityRole).toBe('tabbar')
    expect(stop('Theme').accessibilityRole).toBe('button')
    expect(stop('Theme').accessibilityState).toMatchObject({ selected: true })
    // a theme a row, the chosen one selected, in a group named for the section
    const list = screen
      .getAllByLabelText('Theme')
      .find((n) => n.props.accessibilityRole === 'radiogroup')
    expect(list).toBeTruthy()
    // a row's host view, which takes no preferred focus
    const row = (label: RegExp) =>
      screen.getAllByLabelText(label).find((n) => n.props.accessibilityRole)?.props ?? {}
    const chosen = row(/^Harbor’s default/)
    expect(chosen.accessibilityRole).toBe('button')
    expect(chosen.accessibilityState).toMatchObject({ selected: true })
    expect(row(/^OLED black/).accessibilityState).toMatchObject({ selected: false })
    expect(screen.getByText('Use on all my devices: Off')).toBeTruthy()
    expect(screen.getByText('Only this TV changes.')).toBeTruthy()
    await fireEvent.press(screen.getByText('Use on all my devices: Off'))
    await flush()
    expect(screen.getByText('Use on all my devices: On')).toBeTruthy()
    expect(screen.getByText('Your phone and computers use this theme too.')).toBeTruthy()
  })

  test('Servers offers Another server, and signing a device out asks first', async () => {
    await settings('servers')
    expect(screen.getByRole('button', { name: 'Another server' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a server' })).toBeNull()
    // focus on a section's name shows it
    await fireEvent(screen.getAllByLabelText('Your devices')[0], 'focus')
    await flush()
    const out = screen.getAllByRole('button', { name: /^Sign out (?!of )/ })[0]
    const name = String(out?.props.accessibilityLabel).replace(/^Sign out /, '')
    await fireEvent.press(out)
    await flush()
    expect(screen.getByText(`Sign out ${name}?`)).toBeTruthy()
    expect(screen.getByText('It needs a code or password to come back.')).toBeTruthy()
    expect(screen.queryByText(`${name} is signed out`)).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }))
    await flush()
    expect(screen.getByText(`${name} is signed out`)).toBeTruthy()
  })

  test('the remote’s Back closes a question as Cancel does', async () => {
    jest.spyOn(BackHandler, 'addEventListener')
    await settings('servers')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out of Harbor' }))
    await flush()
    expect(screen.getByText('Sign out of Harbor?')).toBeTruthy()
    // the remote's Back, as react-native-tvos hands it to BackHandler's listeners
    const back = jest.mocked(BackHandler.addEventListener).mock.calls.at(-1)?.[1] as
      | (() => boolean | null | undefined)
      | undefined
    await act(() => void back?.())
    await flush()
    expect(screen.queryByText('Sign out of Harbor?')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out of Harbor' })).toBeTruthy()
  })
})

describe('the TV’s sign-in by password', () => {
  /** Types on the on-screen keys. */
  const keys = async (text: string) => {
    for (const k of text) {
      await fireEvent.press(screen.getAllByText(k).at(-1) as never)
      await flush(1)
    }
  }

  test('a two-step code whose challenge ran out goes back to the password', async () => {
    await open()
    await fireEvent.press(screen.getByLabelText(/^Harbor,/))
    await flush()
    await fireEvent.press(screen.getByText('Use a password'))
    await flush()
    await keys('ines')
    await fireEvent.press(screen.getByText('Next'))
    await keys('x')
    await fireEvent.press(screen.getByText('Sign in'))
    await flush()
    expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeTruthy()
    // the server no longer knows the challenge
    rewrite((url, init) => {
      if (!url.includes('/api/v1/auth/two-factor') || typeof init.body !== 'string') return
      return [
        url,
        { ...init, body: JSON.stringify({ ...JSON.parse(init.body), challenge: 'gone' }) },
      ]
    })
    await keys('123456')
    await fireEvent.press(screen.getByText('Verify'))
    await flush()
    expect(screen.queryByText('Enter the 6-digit code from your authenticator app.')).toBeNull()
    expect(screen.getByText('Password')).toBeTruthy()
    expect(screen.getByText('ines')).toBeTruthy()
  })
})

describe('known servers on the TV', () => {
  test('one that isn’t set up any more isn’t opened, and the words say where', async () => {
    const r = await signedIn()
    await act(() => router.push('/connect'))
    await flush()
    server().mock.servers.populated.state.server.setupComplete = false
    await fireEvent.press(screen.getAllByLabelText(/^Harbor,/)[0] as never)
    await flush()
    expect(r.getPathname()).toBe('/connect')
    expect(screen.getByText(/^Harbor isn’t set up yet\./)).toBeTruthy()
  })
})
