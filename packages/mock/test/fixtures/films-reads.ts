// SPDX-License-Identifier: AGPL-3.0-only
// The films apps' reads through the SDK's own client, for films.test.ts and the run under another
// clock and time zone (films-answers.ts).
import { routes } from '@highsea-tv/api-contract'
import { SEED } from '@highsea-tv/mock/films'
import { createMockFetch, memoryStorage, type TransportOptions } from '@highsea-tv/mock/transport'
import { createClient, type HighseaClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ruth’s Apple TV', client: 'tvos' as const, appVersion: '0.3.0' }

export const signedIn = async (options: TransportOptions = {}, as = 'ruth') => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage(), ...options })
  const r = await createClient({ baseUrl: LAN, fetch }).auth.signIn({
    body: { username: as, password: 'x', device },
  })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  return createClient({ baseUrl: LAN, fetch, token: r.token })
}

type Schema = { parse(value: unknown): unknown }
/** The route's 200 schema, parsing what the mock answered. */
export const parse = (route: { responses: Record<number, unknown> }, value: unknown) => {
  const schema = (
    route.responses as Record<number, { content?: { 'application/json'?: { schema: Schema } } }>
  )[200]?.content?.['application/json']?.schema
  if (!schema) throw new Error('a route without a 200 schema')
  return schema.parse(value)
}

/** Every read a B1 screen makes, from the seeded ids, each with the route it answers. */
export async function everything(a: HighseaClient) {
  const r = routes
  const movie = { type: 'movie' as const, id: SEED.film.id }
  return {
    home: [r.home.sections, await a.home.sections({ query: { client: 'tvos' } })],
    list: [r.library.list, await a.library.list({ query: { limit: 200 } })],
    search: [r.library.search, await a.library.search({ query: { query: 'tears' } })],
    people: [r.library.search, await a.library.search({ query: { query: 'keaton' } })],
    collections: [
      r.library.collections,
      await a.library.collections({ query: { client: 'tvos' } }),
    ],
    collection: [
      r.library.collection,
      await a.library.collection({ params: { id: SEED.collection.id }, query: {} }),
    ],
    item: [r.library.item, await a.library.item({ params: movie })],
    person: [r.metadata.person, await a.metadata.person({ params: { id: SEED.person.id } })],
    prefs: [r.playback.prefs, await a.playback.prefs({ params: movie })],
  } as const
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/**
 * The answers with every instant as its local wall time: the seed lays its dates out in the local
 * zone from a local EPOCH (clock.ts), so the same seed in another zone has other instants but the
 * same days and hours.
 */
export function localized(value: unknown): unknown {
  if (typeof value === 'string' && INSTANT.test(value)) {
    const d = new Date(value)
    const p = (n: number, w = 2) => String(n).padStart(w, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  }
  if (Array.isArray(value)) return value.map(localized)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, localized(v)]))
  return value
}
