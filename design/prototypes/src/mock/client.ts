// SPDX-License-Identifier: AGPL-3.0-only
// The SDK-shaped client screens call. Every method is async, like a network call, and honours the
// toolbar's data state: Loading never resolves, Error rejects as an unreachable server would,
// Empty talks to a freshly set-up server, Populated to Harbor.
import type { DataState, Role } from '../proto/state.ts'
import { type Clock, createClock, runClock } from './clock.ts'
import {
  type Api,
  ApiError,
  browserStorage,
  createApi,
  createServer,
  type MockServer,
  memoryStorage,
  type Storage,
} from './server.ts'
import type { ServerEvent } from './types.ts'

type AsyncApi<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : AsyncApi<T[K]>
}

export type HighseaClient = AsyncApi<Api> & {
  /** Server-sent events: live updates for queues, jobs and health. */
  events: { subscribe(listener: (event: ServerEvent) => void): () => void }
  /** The simulated time, in ms since the epoch. */
  now(): number
  dataState: DataState
}

export type ClientOptions = {
  data: DataState
  role: Role
  /** Simulated network latency in ms. Tests use 0. */
  latency?: number
}

/** The signed-in user per toolbar role: Ines owns Harbor, Theo is an admin, Ruth a user. */
export const userFor = (role: Role) =>
  role === 'owner' ? 'u-ines' : role === 'admin' ? 'u-theo' : 'u-ruth'

const pending = <T>() => new Promise<T>(() => {})
const wait = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve())

function wrap<T extends object>(api: T, call: <R>(fn: () => R) => Promise<R>): AsyncApi<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(api))
    out[key] =
      typeof value === 'function'
        ? (...args: unknown[]) => call(() => (value as (...a: unknown[]) => unknown)(...args))
        : wrap(value as object, call)
  return out as AsyncApi<T>
}

export function createClient(
  { servers, storage }: Mock,
  { data, role, latency = 180 }: ClientOptions,
): HighseaClient {
  const server = data === 'empty' ? servers.empty : servers.populated
  const api = createApi(server, { userId: userFor(role), storage })
  const call = async <R>(fn: () => R): Promise<R> => {
    if (data === 'loading') return pending<R>()
    await wait(latency)
    if (data === 'error')
      throw new ApiError(
        503,
        'unreachable',
        `${servers.populated.state.server.name} isn’t responding. It may be restarting.`,
      )
    // a copy, as a network response would be: screens can't mutate server state by accident
    return structuredClone(fn())
  }
  return Object.assign(wrap(api, call), {
    events: { subscribe: server.events.subscribe },
    now: () => server.clock.now(),
    dataState: data,
  })
}

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

export { ApiError, browserStorage }
