// SPDX-License-Identifier: AGPL-3.0-only
// The mock itself, without the DOM: both servers on one clock, and who the toolbar's role signs in
// as. The prototype's client (client.ts) and the SDK's transport (transport.ts) both start here, so
// it runs under Vite, Bun and Metro alike.

import { type Clock, createClock, runClock } from './clock.ts'
import { createServer, type MockServer, memoryStorage, type Storage } from './server.ts'
import type { Role } from './state.ts'

/** The signed-in user per toolbar role: Ines owns Harbor, Theo is an admin, Ruth a user. */
export const userFor = (role: Role) =>
  role === 'owner' ? 'u-ines' : role === 'admin' ? 'u-theo' : 'u-ruth'

export type Mock = {
  clock: Clock
  servers: Record<'populated' | 'empty', MockServer>
  storage: Storage
  /** Starts real-time ticking at the given speed (simulated seconds per real second). */
  run(speed: () => number): () => void
}

/**
 * Both servers on one clock. The app makes one with browser storage (layouts and setup are
 * remembered); each test makes its own in memory.
 */
export function createMock(storage: Storage = memoryStorage()): Mock {
  const clock = createClock()
  const servers = {
    populated: createServer('populated', clock, storage),
    empty: createServer('empty', clock, storage),
  }
  return { clock, servers, storage, run: (speed) => runClock(clock, speed) }
}
