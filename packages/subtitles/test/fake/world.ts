// SPDX-License-Identifier: AGPL-3.0-only
// What the three fake providers share: the clock, the subtitles added and made up (with their
// ids, so a download finds what a search returned), the OpenSubtitles.com account's state, and
// files a test serves in place of the fake's own.
import type { Clock } from '@highsea-tv/core'
import type { ProviderId } from '../../src/shared/types.ts'
import { entryFor, type FakeEntry, type FakeSubtitle, generated, hash } from './fixtures.ts'

export type FakeMovie = { tmdbId: number; imdbId: string | null; year: number | null }

export type FakeWorld = {
  clock: Clock
  generate: boolean
  vip: boolean
  remaining: number
  logins: number
  downloads: number
  /** OpenSubtitles.com's signed-in tokens. */
  tokens: Set<string>
  added: FakeSubtitle[]
  /** Bodies a test serves at an exact URL, in place of the fake's own. */
  files: Map<string, Uint8Array>
  /** A provider's subtitles for a movie in these profile languages. */
  find(
    provider: ProviderId,
    movie: FakeMovie,
    languages: string[],
    moviehash?: string | null,
  ): FakeEntry[]
  byId(provider: ProviderId, id: number): FakeEntry | undefined
}

export function createWorld(options: {
  clock: Clock
  generate: boolean
  vip: boolean
  remaining: number
}): FakeWorld {
  const ids = new Map<string, FakeEntry>()
  const register = (entry: FakeEntry) => {
    ids.set(`${entry.provider}:${entry.id}`, entry)
    return entry
  }
  const world: FakeWorld = {
    ...options,
    logins: 0,
    downloads: 0,
    tokens: new Set(),
    added: [],
    files: new Map(),
    find(provider, movie, languages, moviehash = null) {
      const out: FakeEntry[] = []
      world.added.forEach((sub, i) => {
        if (sub.provider !== provider || !languages.includes(sub.language)) return
        const same =
          sub.tmdbId === movie.tmdbId || (movie.imdbId !== null && sub.imdbId === movie.imdbId)
        if (same) out.push(register(entryFor(sub, 1000 + i)))
      })
      if (world.generate)
        for (const language of languages)
          generated(provider, movie, language, moviehash).forEach((sub, i) => {
            const id =
              10_000_000 + (hash(`${provider}|${movie.tmdbId}|${language}|${i}`) % 900_000_000)
            out.push(register(entryFor(sub, id)))
          })
      return out
    },
    byId(provider, id) {
      const known = ids.get(`${provider}:${id}`)
      if (known) return known
      const index = id - 1000
      const sub = world.added[index]
      return sub && sub.provider === provider ? register(entryFor(sub, id)) : undefined
    },
  }
  return world
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
