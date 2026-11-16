// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's server list (src/desktop/tauri.tsx's DesktopServers) over a stand-in for the
// Rust side's commands: a server set up afresh where a known one was, found on the network, is
// listed once, the old entry gone and no longer in use (servers.rs's `seen`, the owner's decision
// of 2026-11-15). No network: `invoke` answers from the test's own list.
import { useNearby } from '@highsea-tv/native/nearby'
import { useServers } from '@highsea-tv/native/servers'
import { act, cleanup, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

const AT = 'http://192.168.1.20:3460'
const OLD = {
  id: 'srv_old',
  name: 'Harbor',
  addresses: [{ url: AT, kind: 'local' }],
  lastSeen: 1,
  signedIn: true,
  current: true,
}
const NEW_INFO = { id: 'srv_new', name: 'Harbor', localAddresses: [AT], publicUrl: null }

// the Rust side: its list, and what each command did
const rust = { list: [] as (typeof OLD)[], calls: [] as string[] }

jest.mock('@tauri-apps/api/core', () => {
  class Channel<T> {
    onmessage: (m: T) => void = () => {}
  }
  return {
    Channel,
    invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
      rust.calls.push(cmd)
      switch (cmd) {
        case 'servers_list':
          return rust.list
        case 'server_current':
          return null
        case 'server_info':
          return args.address === AT ? NEW_INFO : null
        case 'discover': {
          const on = args.onFound as Channel<unknown>
          on.onmessage({ kind: 'server', id: NEW_INFO.id, name: 'Harbor', address: AT })
          on.onmessage({ kind: 'done' })
          return null
        }
        case 'servers_seen': {
          // servers.rs's seen: the new server at the old one's only address leaves it none
          const found = args.found as { info: { id: string }; base: string }[]
          const taken = found.filter((f) => f.info.id !== 'srv_old').map((f) => f.base)
          const gone = rust.list
            .filter((s) => s.addresses.every((a) => taken.includes(a.url)))
            .map((s) => s.id)
          rust.list = rust.list.filter((s) => !gone.includes(s.id))
          return gone
        }
        default:
          return null
      }
    },
  }
})
// Bonjour is the phone's and the TV's; the desktop app finds servers through the Rust side
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
jest.mock('@tauri-apps/api/app', () => ({ getVersion: async () => '0.0.0' }))
jest.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }))
jest.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({}) }))
jest.mock('@tauri-apps/plugin-opener', () => ({ openUrl: async () => {} }))
jest.mock('@tauri-apps/plugin-process', () => ({ relaunch: async () => {} }))
jest.mock('@tauri-apps/plugin-updater', () => ({ check: async () => null }))
jest.mock('expo-router', () => ({ router: { navigate: () => {} } }))

const { DesktopServers } =
  require('../src/desktop/tauri.tsx') as typeof import('../src/desktop/tauri.tsx')

function Choose() {
  const { known, current } = useServers()
  const { found } = useNearby()
  return (
    <>
      <Text testID="known">{known.map((k) => k.id).join(',')}</Text>
      <Text testID="found">{found.map((n) => n.info.id).join(',')}</Text>
      <Text testID="current">{current?.server.id ?? 'none'}</Text>
    </>
  )
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0))
  })

beforeEach(() => {
  rust.list = [{ ...OLD }]
  rust.calls = []
})
afterEach(cleanup)

test('a new server found at a known one’s address replaces it in the list', async () => {
  await render(
    <DesktopServers>
      <Choose />
    </DesktopServers>,
  )
  await flush()
  expect(screen.getByTestId('found').props.children).toBe('srv_new')
  expect(rust.calls).toContain('servers_seen')
  // listed once: the old Harbor is gone, and with it the server in use
  expect(screen.getByTestId('known').props.children).toBe('')
  expect(screen.getByTestId('current').props.children).toBe('none')
})
