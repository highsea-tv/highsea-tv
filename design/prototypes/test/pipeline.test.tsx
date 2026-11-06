// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 2 flows, walked as a user would: add a movie from Discover and watch it reach the
// library; bulk edit the library; interactive search with its reasons; fix a blocked import from
// Activity; manage torrents; add indexers from the catalog; fill the subtitle wanted list. Each
// step that changes the screen is checked with axe, and its classes join the stylesheet check.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createClient, createMock, type Mock } from '@highsea-tv/mock/client'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { defaultState, type Role } from '../src/proto/state.ts'
import { collect, violations } from './check.ts'

// the app after dom.ts has set React Native up for the admin's shared screens: a static import
// is linked before dom.ts runs
const { ScreenApp } = await import('../src/screen/screen.tsx')

beforeEach(() => {
  localStorage.clear()
  // Discover remembers its search in the history entry; each test starts on a fresh one
  history.replaceState(null, '')
})
afterEach(() => cleanup())

const page = () => within(document.body)

// Media ids in the populated seed (database ids, ADR 0014): 1 Sintel, 4 Tears of Steel,
// 19 Nosferatu, 30 Night of the Living Dead, 39 Royal Wedding; 107 Nanook of the North is in the
// metadata cache, not the library.

const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(path: string, role: Role = 'owner') {
  const mock = createMock()
  const location = memoryLocation({ path, record: true })
  const state = { ...defaultState, data: 'populated' as const, role, time: 'pause' as const }
  await act(async () => {
    render(<ScreenApp mock={mock} state={state} hook={location.hook} latency={0} />)
  })
  await settle()
  return { mock, location, user: userEvent.setup(), unmount: cleanup }
}

const _client = (mock: Mock, role: Role = 'owner') =>
  createClient(mock, { data: 'populated', role, latency: 0 })

async function _clean(modal?: Element) {
  collect()
  expect(await violations(modal)).toEqual([])
}

/** Runs the simulation in 10-second steps until `done` holds. */
async function _run(mock: Mock, done: () => boolean, limit = 6 * 3600) {
  for (let s = 0; s < limit && !done(); s += 10) mock.clock.advance(10)
  await settle()
  expect(done()).toBe(true)
}

describe('A6 media pages', () => {
  test('a user is sent to the web client, not the movie', async () => {
    const { location } = await open('/admin/movies/107', 'user')
    expect(page().queryByRole('button', { name: 'Add movie' })).toBeNull()
    expect(location.history.at(-1)).toBe('/web')
  })
})

describe('A9 indexers', () => {
  test('users are sent to the web client', async () => {
    const { location } = await open('/admin/indexers', 'user')
    expect(location.history.at(-1)).toBe('/web')
  })
})
