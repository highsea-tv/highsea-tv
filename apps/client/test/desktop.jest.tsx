// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's host compositions (src/desktop/, one-client-platform-b.md › B2), through Expo
// Router's test renderer over the real app directory and the mock server (./mock.ts): no network.
// The toolbar's `app=desktop` (with `os` and `update`) stands in for the desktop app, as the
// prototypes' frames pass it; a host given with DesktopHostProvider stands in for part C's Tauri.
// The window's chrome on each OS, Back and Forward, Kept in, the update waiting and its Restart,
// and none of it outside the desktop app. Moved from the prototype's web/window.tsx, shell.tsx and
// kept-in.tsx, whose drawing the old desktop-1440 captures hold.
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { renderRouter } from 'expo-router/testing-library'
import { Text } from 'react-native'
import {
  type DesktopHost,
  DesktopHostProvider,
  MOCK_FOLDERS,
  mockDesktopHost,
  nextVersion,
  resetMockFolders,
} from '../src/desktop/host.ts'
import { KeptIn } from '../src/desktop/kept-in.tsx'
import { UpdateDot, useUpdateMenuOption } from '../src/desktop/update.tsx'
import { historyKey, resetTrail, trafficLightInset, WindowChrome } from '../src/desktop/window.tsx'
import { acknowledge, appWith, flush, fresh, type } from './mock.ts'

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () =>
    (globalThis as { __formFactor?: string }).__formFactor ?? 'regular-pointer',
}))
jest.mock('../src/transport.ts', () => require('./mock.ts').transportModule())
// the toolbar's states, as the prototypes' chrome would set them
jest.mock('../src/frame-channel.ts', () => ({
  ...jest.requireActual('../src/frame-channel.ts'),
  useFrameState: () => (globalThis as { __toolbar?: object }).__toolbar ?? {},
}))
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

jest.setTimeout(40_000)

beforeEach(() => {
  fresh()
  resetTrail()
  resetMockFolders()
})
afterEach(async () => {
  await cleanup()
  delete (globalThis as { __toolbar?: object }).__toolbar
})

const toolbar = (t: object) => {
  ;(globalThis as { __toolbar?: object }).__toolbar = t
}

/** A host part C would give, its window's buttons and Restart recorded. */
function spyHost(os: DesktopHost['os']): DesktopHost & { calls: string[] } {
  const calls: string[] = []
  const base = mockDesktopHost(os, true)
  return {
    ...base,
    calls,
    drawsSystemButtons: false,
    window: {
      minimize: () => calls.push('minimize'),
      toggleMaximize: () => calls.push('toggleMaximize'),
      close: () => calls.push('close'),
    },
    updates: {
      ...base.updates,
      restart: async () => {
        calls.push('restart')
      },
    },
  }
}

let given: DesktopHost | null = null

/** The window's chrome alone, with the host given (part C's). */
function GivenChrome() {
  return given ? (
    <DesktopHostProvider value={given}>
      <WindowChrome />
      <MenuBits />
    </DesktopHostProvider>
  ) : (
    <WindowChrome />
  )
}

/** Kept in with two films kept, as the Downloads page passes it. */
function KeptHere() {
  return <KeptIn kept={{ count: 2, bytes: 3_200_000_000 }} />
}

/** What the profile menu takes from the update: its last option, and the avatar's dot. */
function MenuBits() {
  const option = useUpdateMenuOption()
  return (
    <>
      <Text>{option ? `${option.label} | ${option.detail}` : 'no option'}</Text>
      <UpdateDot />
      {option ? (
        <Text accessibilityRole="button" onPress={option.onSelect}>
          Choose it
        </Text>
      ) : null}
    </>
  )
}

const OVERRIDES = {
  '(in)/given-chrome': GivenChrome,
  '(in)/kept-here': KeptHere,
  '(in)/menu-bits': MenuBits,
}

/** Signs in with a pointer, acknowledges the owner's announcement, and opens `path`. */
async function at(path: string) {
  await renderRouter(appWith(OVERRIDES), { initialUrl: '/' })
  await flush(5000)
  await fireEvent.press(screen.getByRole('button', { name: /^Harbor/ }))
  await flush()
  await type({ Username: 'ruth', Password: 'x' })
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await flush()
  await acknowledge()
  if (path !== '/') {
    await act(() => router.navigate(path as never))
    await flush(500)
  }
}

type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null }

/** Every rendered host view that passes `test`, from the tree as JSON. */
function find(test: (n: Json) => boolean): Json[] {
  const found: Json[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    const j = n as Json
    if (test(j)) found.push(j)
    j.children?.forEach(walk)
  }
  walk(screen.toJSON())
  return found
}

/** The title bars drawn (Windows' and Linux's): plain Views, which getByRole leaves out. */
const titleBars = () => find((n) => n.props.accessibilityRole === 'toolbar')

/** The page's stand-ins for macOS's three buttons. */
const trafficLights = () =>
  find(
    (n) => (n.props as { dataSet?: { windowButtons?: string } }).dataSet?.windowButtons === 'mac',
  )

/** Everything marked as the window's drag region. */
const dragRegions = () =>
  find(
    (n) => (n.props as { dataSet?: { tauriDragRegion?: string } }).dataSet?.tauriDragRegion === '',
  )

describe('outside the desktop app', () => {
  it('draws no window chrome, no Back and Forward, no Kept in and no update', async () => {
    await at('/')
    expect(titleBars()).toHaveLength(0)
    expect(screen.queryByLabelText('Minimise')).toBeNull()
    expect(screen.queryByLabelText('Forward')).toBeNull()
    expect(trafficLights()).toHaveLength(0)
    expect(dragRegions()).toHaveLength(0)
    await act(() => router.navigate('/kept-here' as never))
    await flush(500)
    expect(screen.queryByLabelText(/^Kept in /)).toBeNull()
    await act(() => router.navigate('/menu-bits' as never))
    await flush(500)
    expect(screen.getByText('no option')).toBeTruthy()
    await act(() => router.navigate('/settings?section=about' as never))
    await flush(500)
    expect(screen.queryByText(/highsea checks for a new version/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restart to update' })).toBeNull()
  })

  it('draws nothing when the toolbar says the browser', async () => {
    toolbar({ app: 'browser', os: 'windows', update: 'ready' })
    await at('/')
    expect(titleBars()).toHaveLength(0)
    expect(screen.queryByLabelText('Back')).toBeNull()
  })
})

describe("the window's chrome", () => {
  it("on a Mac leaves the system's buttons their room and moves the window from the top bar", async () => {
    toolbar({ app: 'desktop', os: 'mac' })
    await at('/')
    // the frames have no system, so the page draws macOS's three buttons itself
    expect(trafficLights()).toHaveLength(1)
    expect(titleBars()).toHaveLength(0)
    expect(screen.queryByLabelText('Minimise')).toBeNull()
    expect(dragRegions().length).toBeGreaterThan(0)
    // 84 from the window's edge, or the gutter when the margin already clears them
    expect(trafficLightInset(24, 1024, 1440)).toBe(84)
    expect(trafficLightInset(48, 1920, 1440)).toBe(48)
    expect(trafficLightInset(24, 1600, 1440)).toBe(24)
  })

  it.each(['windows', 'linux'] as const)(
    'on %s draws the title bar and its buttons',
    async (os) => {
      toolbar({ app: 'desktop', os })
      await at('/')
      expect(titleBars()).toHaveLength(1)
      expect(screen.getByText('highsea')).toBeTruthy()
      for (const name of ['Minimise', 'Maximise', 'Close'])
        expect(screen.getByLabelText(name)).toBeTruthy()
      expect(trafficLights()).toHaveLength(0)
    },
  )

  it.each(['windows', 'linux'] as const)("on %s calls the host's window", async (os) => {
    given = spyHost(os)
    await at('/given-chrome')
    expect(titleBars()).toHaveLength(1)
    for (const name of ['Minimise', 'Maximise', 'Close'])
      await fireEvent.press(screen.getAllByLabelText(name).at(-1) as never)
    expect((given as ReturnType<typeof spyHost>).calls).toEqual([
      'minimize',
      'toggleMaximize',
      'close',
    ])
    given = null
  })
})

describe('Back and Forward', () => {
  it('are each off until there is somewhere to go, and go there', async () => {
    toolbar({ app: 'desktop', os: 'mac' })
    await at('/')
    const back = () => screen.getByRole('button', { name: 'Back' })
    const forward = () => screen.getByRole('button', { name: 'Forward' })
    expect(back()).toBeDisabled()
    expect(forward()).toBeDisabled()
    await act(() => router.push('/settings' as never))
    await flush(500)
    expect(back()).toBeEnabled()
    expect(forward()).toBeDisabled()
    await fireEvent.press(back())
    await flush(500)
    expect(back()).toBeDisabled()
    expect(forward()).toBeEnabled()
  })

  it("take each OS's keys", () => {
    expect(historyKey({ key: '[', metaKey: true, altKey: false }, 'mac')).toBe('back')
    expect(historyKey({ key: ']', metaKey: true, altKey: false }, 'mac')).toBe('forward')
    expect(historyKey({ key: 'ArrowLeft', metaKey: false, altKey: true }, 'mac')).toBeNull()
    expect(historyKey({ key: 'ArrowLeft', metaKey: false, altKey: true }, 'windows')).toBe('back')
    expect(historyKey({ key: 'ArrowRight', metaKey: false, altKey: true }, 'linux')).toBe('forward')
    expect(historyKey({ key: '[', metaKey: true, altKey: false }, 'windows')).toBeNull()
  })
})

describe('Kept in', () => {
  it('names the folder, asks before moving what is kept, and says when it has moved', async () => {
    toolbar({ app: 'desktop', os: 'mac' })
    await at('/kept-here')
    // the field's words are the control's label, as a reader hears them
    const kept = (folder: string) => screen.getByLabelText(`Kept in ${folder}`)
    expect(kept(MOCK_FOLDERS.mac.first)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Change' }))
    await flush()
    expect(screen.getByText('Move your downloads?')).toBeTruthy()
    expect(
      screen.getByText(/Your 2 downloaded movies \(.+\) move to \/Volumes\/Films\/highsea/),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    await flush()
    expect(kept(MOCK_FOLDERS.mac.first)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Change' }))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Move downloads' }))
    await flush(1000)
    expect(screen.getByText(/^Moving 2 movies to \/Volumes\/Films\/highsea/)).toBeTruthy()
    await flush(6000)
    expect(kept(MOCK_FOLDERS.mac.picked)).toBeTruthy()
    expect(screen.getAllByText('Downloads moved').length).toBeGreaterThan(0)
  })

  it("takes each OS's folders", async () => {
    toolbar({ app: 'desktop', os: 'windows' })
    await at('/kept-here')
    expect(screen.getByLabelText(`Kept in ${MOCK_FOLDERS.windows.first}`)).toBeTruthy()
  })
})

describe('an update waiting', () => {
  it('puts the dot on the avatar and Restart to update at the end of its menu', async () => {
    toolbar({ app: 'desktop', os: 'mac', update: 'ready' })
    await at('/menu-bits')
    const { appVersion } = require('@highsea-tv/native/device') as { appVersion: string }
    const next = nextVersion(appVersion)
    expect(
      screen.getByText(`Restart to update | highsea ${next} is ready. You have ${appVersion}.`),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Choose it' }))
    await flush()
    expect(screen.getAllByText(`Restarting into highsea ${next}`).length).toBeGreaterThan(0)
  })

  it('says so in Settings › About, with Restart to update beside it', async () => {
    toolbar({ app: 'desktop', os: 'mac', update: 'ready' })
    await at('/settings?section=about')
    expect(screen.getByText(/is ready\. It’s used the next time the app starts\./)).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Restart to update' }))
    await flush()
    expect(screen.getAllByText(/^Restarting into highsea /).length).toBeGreaterThan(0)
  })

  it("restarts through the host's updater", async () => {
    given = spyHost('windows')
    toolbar({})
    await at('/given-chrome')
    const host = given as ReturnType<typeof spyHost>
    await fireEvent.press(screen.getByRole('button', { name: 'Choose it' }))
    await flush()
    expect(host.calls).toEqual(['restart'])
    given = null
  })

  it('says it is up to date when none waits', async () => {
    toolbar({ app: 'desktop', os: 'linux', update: 'none' })
    await at('/settings?section=about')
    expect(
      screen.getByText(/^Up to date\. highsea checks for a new version by itself, last /),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restart to update' })).toBeNull()
    await act(() => router.navigate('/menu-bits' as never))
    await flush(500)
    expect(screen.getByText('no option')).toBeTruthy()
  })
})
