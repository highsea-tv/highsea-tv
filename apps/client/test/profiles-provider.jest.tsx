// SPDX-License-Identifier: AGPL-3.0-only
// The profiles' provider around the signed-in shell (src/profiles/state.tsx): when public info
// answers that the server serves profiles, the shell beneath keeps its place and its state rather
// than mounting again, and a screen that mounts later starts from public info's last answer
// (@highsea-tv/client/data's usePublicInfo). A client of the test's own: no network.
import { useServes } from '@highsea-tv/client/data'
import type { HighseaClient } from '@highsea-tv/sdk'
import { ClientProvider } from '@highsea-tv/sdk/react'
import { act, render, screen } from '@testing-library/react-native'
import { useEffect } from 'react'
import { Text } from 'react-native'
import { ProfilesProvider, useProfilesState } from '../src/profiles/state.tsx'

const PROFILES = [
  { id: 'p1', name: 'Ines', tone: 'blue', main: true, hasPin: false },
  { id: 'p2', name: 'Ruth', tone: 'green', main: false, hasPin: false },
]

function client(answer: Promise<unknown>) {
  return {
    system: { publicInfo: () => answer },
    profiles: { list: async () => ({ profiles: PROFILES, current: 'p1', max: 5 }) },
    events: { subscribe: () => () => {} },
  } as unknown as HighseaClient
}

let mounts = 0
function Shell() {
  const p = useProfilesState()
  useEffect(() => {
    mounts++
  }, [])
  return <Text>{p ? `${p.profiles.length} profiles` : 'no profiles'}</Text>
}

function Later() {
  const music = useServes('music')
  return <Text>{music ? 'music at once' : 'no music yet'}</Text>
}

test('the shell keeps its place when public info says profiles are served', async () => {
  let answer: (info: unknown) => void = () => {}
  const c = client(new Promise((r) => (answer = r)))
  mounts = 0
  const { rerender } = await render(
    <ClientProvider client={c}>
      <ProfilesProvider>
        <Shell />
      </ProfilesProvider>
    </ClientProvider>,
  )
  expect(screen.getByText('no profiles')).toBeTruthy()
  await act(async () => answer({ sources: ['profiles', 'music'] }))
  expect(await screen.findByText('2 profiles')).toBeTruthy()
  expect(mounts).toBe(1)
  // a screen that mounts later knows at once what the server serves
  await rerender(
    <ClientProvider client={c}>
      <ProfilesProvider>
        <Shell />
        <Later />
      </ProfilesProvider>
    </ClientProvider>,
  )
  expect(screen.getByText('music at once')).toBeTruthy()
})
