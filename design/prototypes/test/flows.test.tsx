// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 1 flows in the prototype's own frame. Sign-in and first-run setup are the admin's
// shared screens since D3, tested in packages/admin (setup-screen.test.tsx) and over the mock in
// packages/mock (admin-flows.test.ts); what's left here is the frame sending a user to /web.
import './dom.ts'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createMock } from '@highsea-tv/mock/client'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { memoryLocation } from 'wouter/memory-location'
import { defaultState, type Role } from '../src/proto/state.ts'

// the app after dom.ts has set React Native up for the admin's shared screens: a static import
// is linked before dom.ts runs
const { ScreenApp } = await import('../src/screen/screen.tsx')

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

// testing-library's `screen` binds to `document` when it loads, before ./dom.ts registers one
const page = () => within(document.body)

const settle = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0))
  })

async function open(path: string, role: Role = 'owner', data: 'populated' | 'empty' = 'populated') {
  const mock = createMock()
  const location = memoryLocation({ path, record: true })
  const state = { ...defaultState, data, role, time: 'pause' as const }
  await act(async () => {
    render(<ScreenApp mock={mock} state={state} hook={location.hook} latency={0} />)
  })
  await settle()
  return { mock, location, user: userEvent.setup() }
}

describe('A3 dashboard', () => {
  test('a user is sent to the web client instead of the dashboard', async () => {
    const { location } = await open('/admin', 'user')
    expect(location.history.at(-1)).toBe('/web')
    expect(page().queryByRole('button', { name: 'Customize' })).toBeNull()
  })
})
