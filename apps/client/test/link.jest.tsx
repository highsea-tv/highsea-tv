// SPDX-License-Identifier: AGPL-3.0-only
// Connect a device (src/app/(in)/link/), through Expo Router's test renderer over the real app
// directory and the mock server (./mock.ts): no network. The code is typed, or found by the phone's
// camera (src/account/camera.tsx, stubbed here: expo-camera's view is native), then what it would
// sign in is asked once and approved. A code the server isn't waiting on, or one already used, says
// so with Try again; a refused approval says why.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Linking } from 'react-native'
import { flush, fresh, rewrite, sent, signedIn, type } from './mock.ts'

type Permission = { granted: boolean; refused: boolean; ask: () => void } | null
const camera = globalThis as {
  __formFactor?: string
  __camera?: Permission
  __scanned?: (data: string) => void
}

// the phone, unless a test asks for another form factor
jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'compact-touch',
}))
// the camera's permission as each test sets it (none: a phone without the camera module), and a
// scanner that hands the test what it would find
jest.mock('../src/account/camera', () => {
  const Scanner = ({ onScanned }: { onScanned: (data: string) => void }) => {
    ;(globalThis as { __scanned?: unknown }).__scanned = onScanned
    return require('react').createElement('Scanner')
  }
  return {
    useCameraPermission: () => {
      const permission = (globalThis as { __camera?: object | null }).__camera
      return permission ? { ...permission, Scanner } : null
    },
  }
})
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

beforeEach(fresh)
afterEach(async () => {
  await cleanup()
  delete camera.__formFactor
  delete camera.__camera
  delete camera.__scanned
})

const go = async (path: string) => {
  await act(async () => router.navigate(path as never))
  await flush()
}

/** Signs in, opens Connect a device, and types the code given. */
async function typed(code: string) {
  const r = await signedIn()
  await go('/link')
  await type({ Code: code })
  return r
}

describe('Connect a device', () => {
  test('a typed code asks what it signs in, then signs the TV in and goes back to Servers', async () => {
    const r = await typed('kq74pm')
    expect(screen.getByText('Type the code your TV or app shows.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    await flush()
    expect(r.getPathname()).toBe('/link/KQ74PM')
    expect(screen.getByRole('header', { name: 'Sign in Living room TV?' })).toBeTruthy()
    // the phone's words point at its own tab, the address and the code in mono
    expect(
      screen.getByText(
        /highsea for Apple TV at 192\.168\.1\.42 signs in as you\..*You › Devices\./,
      ),
    ).toBeTruthy()
    expect(screen.getByText(/Code KQ7-4PM · it expires in \d+ minutes?\./)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Sign it in' }))
    await flush()
    expect(sent('/auth/pairing/KQ74PM/approve')).toHaveLength(1)
    expect(screen.getByText('Living room TV is signed in')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    await flush()
    expect(r.getPathname()).toBe('/settings')
  })

  test('a code too short or too long can’t go on', async () => {
    await typed('KQ7')
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState).toMatchObject(
      { disabled: true },
    )
    await type({ Code: 'KQ7-4PM-ABC' })
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState).toMatchObject(
      { disabled: true },
    )
  })

  test('a code the server isn’t waiting on says so, and Try again starts over', async () => {
    const r = await typed('ZZZ-999')
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    await flush()
    expect(screen.getByText('That code isn’t waiting')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign it in' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush()
    expect(r.getPathname()).toBe('/link')
  })

  test('a code already used has expired', async () => {
    await signedIn()
    await go('/link/KQ7-4PM')
    await fireEvent.press(screen.getByRole('button', { name: 'Sign it in' }))
    await flush()
    await go('/link')
    await go('/link/KQ7-4PM')
    expect(screen.getByText('That code isn’t waiting')).toBeTruthy()
  })

  test('an approval the server refuses says why, and stays on the question', async () => {
    await signedIn()
    await go('/link/KQ7-4PM')
    // the code expires between the question and the answer
    rewrite((url, init) =>
      url.includes('/approve') ? [url.replace('KQ74PM', 'ZZZ999'), init] : undefined,
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Sign it in' }))
    await flush()
    expect(screen.getByRole('alert').props.children).toMatch(/^Couldn’t sign it in\. /)
    expect(screen.getByRole('header', { name: 'Sign in Living room TV?' })).toBeTruthy()
  })

  test('a link with the code in it goes straight to the question', async () => {
    const r = await signedIn()
    await go('/link?code=KQ7-4PM')
    expect(r.getPathname()).toBe('/link/KQ74PM')
    expect(screen.getByRole('header', { name: 'Sign in Living room TV?' })).toBeTruthy()
  })

  test('Cancel and the back button go back to Servers', async () => {
    const r = await signedIn()
    await go('/link')
    expect(screen.queryByRole('tab', { name: 'Home' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Servers' }))
    await flush()
    expect(r.getPathname()).toBe('/settings')
    await go('/link/KQ7-4PM')
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    await flush()
    expect(r.getPathname()).toBe('/settings')
    expect(sent('/approve')).toHaveLength(0)
  })
})

describe('the phone’s camera', () => {
  test('finds the TV’s QR code and asks about it', async () => {
    camera.__camera = { granted: true, refused: false, ask: jest.fn() }
    const r = await signedIn()
    await go('/link')
    expect(screen.getByText('Point your camera at the code on the TV.')).toBeTruthy()
    expect(screen.getByLabelText('The camera, looking for the TV’s code')).toBeTruthy()
    expect(screen.getByText('Looking for a code…')).toBeTruthy()
    expect(screen.queryByLabelText('Code')).toBeNull()
    // the QR is the server's /link address with the code in it; a second sighting is ignored
    await act(async () => {
      camera.__scanned?.('https://harbor.local/link?code=KQ7-4PM')
      camera.__scanned?.('https://harbor.local/link?code=KQ7-4PM')
    })
    await flush()
    expect(r.getPathname()).toBe('/link/KQ74PM')
    expect(screen.getByRole('header', { name: 'Sign in Living room TV?' })).toBeTruthy()
  })

  test('takes the code typed instead, and goes back to scanning', async () => {
    camera.__camera = { granted: true, refused: false, ask: jest.fn() }
    await signedIn()
    await go('/link')
    await fireEvent.press(screen.getByRole('button', { name: 'Enter the code instead' }))
    await flush()
    expect(screen.getByLabelText('Code')).toBeTruthy()
    expect(screen.getByText('Type the code your TV or app shows.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Scan the code instead' }))
    await flush()
    expect(screen.getByText('Looking for a code…')).toBeTruthy()
  })

  test('asks for the camera the first time, and says where to allow it once refused', async () => {
    const ask = jest.fn()
    camera.__camera = { granted: false, refused: false, ask }
    await signedIn()
    await go('/link')
    expect(screen.queryByText('Looking for a code…')).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Allow the camera' }))
    expect(ask).toHaveBeenCalledTimes(1)
    await cleanup()

    fresh()
    camera.__camera = { granted: false, refused: true, ask }
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    await signedIn()
    await go('/link')
    expect(screen.getByText(/highsea can’t use the camera\./)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Allow the camera' }))
    expect(settings).toHaveBeenCalledTimes(1)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  test('with a pointer, there’s no camera to point: the code is typed', async () => {
    camera.__formFactor = 'regular-pointer'
    camera.__camera = { granted: true, refused: false, ask: jest.fn() }
    await signedIn()
    await go('/link')
    expect(
      screen.getByText('Type the code your TV or app shows. It works for 10 minutes.'),
    ).toBeTruthy()
    expect(screen.getByLabelText('Code')).toBeTruthy()
    expect(screen.queryByText('Looking for a code…')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Scan the code instead' })).toBeNull()
  })
})
