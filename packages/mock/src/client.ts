// SPDX-License-Identifier: AGPL-3.0-only
// The SDK-shaped client screens call. Every method is async, like a network call, and honours the
// toolbar's data state: Loading never resolves, Error rejects as an unreachable server would,
// Empty talks to a freshly set-up server, Populated to Harbor.
import { createT, defineMessages } from '@highsea-tv/i18n'
import { type Mock, userFor } from './mock.ts'
import { type Api, ApiError, browserStorage, createApi } from './server.ts'
import type { DataState, Role } from './state.ts'
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

export const clientMessages = defineMessages({
  /** What the toolbar's Error says, here and in the SDK's transport (transport.ts). */
  'mock.notResponding': '{name} isn’t responding. It may be restarting.',
})
const t = createT(clientMessages)

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
  const call = async <R>(fn: () => R, { held = true } = {}): Promise<R> => {
    if (data === 'loading' && held) return pending<R>()
    await wait(latency)
    if (data === 'error')
      throw new ApiError(
        503,
        'unreachable',
        t('mock.notResponding', { name: servers.populated.state.server.name }),
      )
    // a copy, as a network response would be: screens can't mutate server state by accident
    return structuredClone(fn())
  }
  const client = wrap(api, call)
  // The apps' announcements come before a screen's data, so a screen loading already shows them
  // where they'll stay, with nothing popping in when it's ready (the owner, 2026-10-30)
  client.announcements.active = (...args) =>
    call(() => api.announcements.active(...args), { held: false })
  client.announcements.dismiss = (...args) =>
    call(() => api.announcements.dismiss(...args), { held: false })
  return Object.assign(client, {
    events: { subscribe: server.events.subscribe },
    now: () => server.clock.now(),
    dataState: data,
  })
}

export { createMock, type Mock, userFor } from './mock.ts'
export { ApiError, browserStorage }
