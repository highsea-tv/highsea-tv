// SPDX-License-Identifier: AGPL-3.0-only
// The replaying `fetch` (ADR 0029): serves TMDB's recorded answers and fails on any request it has
// no recording for, so a test never reaches the network. Images come back as tiny placeholders,
// which keeps the repo small. The dev and sweep servers boot on it too
// (`createReplayFetch()` as `BootOptions.fetch`), so the admin works without a TMDB key.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Fetch } from '@highsea-tv/core'
import { type RecordedCredential, type Recording, recordingKey } from './recording.ts'

/** The recordings in this package: `test/fixtures/tmdb`. */
export const RECORDINGS_DIR = fileURLToPath(new URL('../test/fixtures/tmdb/', import.meta.url))

/** A credential the replay treats as one TMDB refuses: anything starting `invalid`. */
export const INVALID_CREDENTIAL_PREFIX = 'invalid'

/** TMDB's answer to a bad credential on any endpoint ([Errors](https://developer.themoviedb.org/docs/errors)). */
const INVALID_KEY = {
  status_code: 7,
  status_message: 'Invalid API key: You must be granted a valid key.',
  success: false,
}

/** 2×3 pixels of grey, for posters and everything else. */
const PLACEHOLDER = {
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAADklEQVR42mOwAgMGFAoAKucEFWZozN0AAAAASUVORK5CYII=',
  jpeg: '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAwAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAwACAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMABgYGBgYGCgYGCg4KCgoOEg4ODg4SFxISEhISFxwXFxcXFxccHBwcHBwcHCIiIiIiIicnJycnLCwsLCwsLCwsLP/bAEMBBwcHCwoLEwoKEy4fGh8uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLv/dAAQAAf/aAAwDAQACEQMRAD8A8iooooA//9k=',
}

/** The request had no recording: a test (or a page in the sweep) asked for something new. */
export class ReplayMissError extends Error {
  constructor(key: string) {
    super(
      `There's no TMDB recording for ${key}. Add it with \`bun run record:tmdb\` in packages/metadata.`,
    )
    this.name = 'ReplayMissError'
  }
}

export function loadRecordings(dir = RECORDINGS_DIR): Map<string, Recording> {
  const recordings = new Map<string, Recording>()
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const r = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Recording
    recordings.set(recordingKey(r.request.method, r.request.url, r.request.credential), r)
  }
  return recordings
}

export type ReplayOptions = {
  dir?: string
  /** Seen before a request is answered: tests count calls or fail one on purpose. */
  onRequest?: (url: URL, init?: RequestInit) => Response | undefined
}

export type ReplayFetch = Fetch & { requests: string[] }

export function createReplayFetch({ dir, onRequest }: ReplayOptions = {}): ReplayFetch {
  const recordings = loadRecordings(dir)
  const requests: string[] = []

  const replay = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : null
    const url = new URL(request ? request.url : input.toString())
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const shown = new URL(url)
    shown.searchParams.delete('api_key')
    requests.push(`${method} ${shown.pathname}${shown.search}`)
    const forced = onRequest?.(url, init)
    if (forced) return forced

    if (url.hostname === 'image.tmdb.org') {
      const png = url.pathname.endsWith('.png')
      const bytes = Buffer.from(png ? PLACEHOLDER.png : PLACEHOLDER.jpeg, 'base64')
      return new Response(bytes, {
        status: 200,
        headers: { 'content-type': png ? 'image/png' : 'image/jpeg' },
      })
    }
    if (url.hostname !== 'api.themoviedb.org') throw new ReplayMissError(`${method} ${url}`)

    const headers = new Headers(init?.headers ?? request?.headers)
    const bearer = headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const credential = url.searchParams.get('api_key') ?? bearer ?? null
    const kind: RecordedCredential =
      credential && !credential.startsWith(INVALID_CREDENTIAL_PREFIX) ? 'valid' : 'invalid'
    const key = recordingKey(method, url.toString(), kind)
    const found = recordings.get(key)
    if (!found && kind === 'invalid')
      return Response.json(INVALID_KEY, {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    if (!found) throw new ReplayMissError(key)
    return new Response(JSON.stringify(found.response.body), {
      status: found.response.status,
      headers: found.response.headers,
    })
  }) as ReplayFetch
  replay.requests = requests
  return replay
}
