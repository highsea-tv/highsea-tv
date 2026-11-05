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

/**
 * 2×3 pixels, a colour fading to its dark at the foot, after the prototype's art (dusk teal,
 * violet, mauve, moss, ember, slate): each image gets one by its path, so cards side by side differ
 * and a page compared with its prototype reads as artwork, not one grey.
 */
const PLACEHOLDER = {
  png: [
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAFUlEQVR4nGO0yitjYGBgeXX9BoICAEHJBloZTHiHAAAAAElFTkSuQmCC',
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAFUlEQVR4nGOMCelhYGBguffgAoICAENMBmJrZL8pAAAAAElFTkSuQmCC',
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAFUlEQVR4nGNsCMhhYGBgufTwFoICAENTBmBaR/OVAAAAAElFTkSuQmCC',
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAFUlEQVR4nGMMybFhYGBgeXjzNYICAEArBlCil9l4AAAAAElFTkSuQmCC',
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAFUlEQVR4nGOcluHEwMDAcvLGcwQFAENeBlq5aAr3AAAAAElFTkSuQmCC',
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAFUlEQVR4nGN0S+hhYGBgeXr7HIICAEKKBlgiQAIfAAAAAElFTkSuQmCC',
  ],
  jpeg: [
    '/9j//gAPTGF2YzYzLjEuMTAxAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAFoAAQEAAAAAAAAAAAAAAAAAAAQHAQEBAQAAAAAAAAAAAAAAAAAEAQMQAAEFAQEAAAAAAAAAAAAAAAABBQMW0ZFUEQEAAgMBAAAAAAAAAAAAAAAAAgMSUxRR/8AAEQgAAwACAwESAAISAAMSAP/aAAwDAQACEQMRAD8Aktie/dP1MBCM5eoHzUa4tH//2Q==',
    '/9j//gAPTGF2YzYzLjEuMTAxAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAFkAAQEAAAAAAAAAAAAAAAAAAAQHAQEBAQAAAAAAAAAAAAAAAAAAAgQQAAEFAQEAAAAAAAAAAAAAAAABBQMW0ZFUEQEAAwEBAAAAAAAAAAAAAAAAAwERUhP/wAARCAADAAIDARIAAhIAAxIA/9oADAMBAAIRAxEAPwCSWJ790/UwEbvebu0GD//Z',
    '/9j//gAPTGF2YzYzLjEuMTAxAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAFkAAQEAAAAAAAAAAAAAAAAAAAQHAQEBAQAAAAAAAAAAAAAAAAACAAQQAAEFAQEAAAAAAAAAAAAAAAABBQMW0ZFUEQEBAAMBAAAAAAAAAAAAAAAAAQMRUhP/wAARCAADAAIDARIAAhIAAxIA/9oADAMBAAIRAxEAPwCTWR998/UwCPdTV75e6D//2Q==',
    '/9j//gAPTGF2YzYzLjEuMTAxAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAFwAAQEAAAAAAAAAAAAAAAAAAAQHAQADAQAAAAAAAAAAAAAAAAABAgMEEAABBQEBAAAAAAAAAAAAAAAAAQUDFtGRVBEBAAEFAQAAAAAAAAAAAAAAAAEDAhJSURP/wAARCAADAAIDARIAAhIAAxIA/9oADAMBAAIRAxEAPwCTWJ790/UwEZ/CjpB0sbeC/9k=',
    '/9j//gAPTGF2YzYzLjEuMTAxAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAFkAAQEAAAAAAAAAAAAAAAAAAAUHAQEBAQAAAAAAAAAAAAAAAAAEAgMQAAEFAQEAAAAAAAAAAAAAAAACBgQW0pFVEQEAAwEBAAAAAAAAAAAAAAAAFAJTBAP/wAARCAADAAIDARIAAhIAAxIA/9oADAMBAAIRAxEAPwCV2pw+jI6nIeEi8+dWhcn30sh//9k=',
    '/9j//gAPTGF2YzYzLjEuMTAxAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAFkAAQEAAAAAAAAAAAAAAAAAAAQHAQEBAQAAAAAAAAAAAAAAAAACAwQQAAEFAQEAAAAAAAAAAAAAAAABBQMW0ZFUEQEAAwEBAAAAAAAAAAAAAAAAAQNSExT/wAARCAADAAIDARIAAhIAAxIA/9oADAMBAAIRAxEAPwCRWN898/UwEbfRduQQ41Zgn//Z',
  ],
}

/** The same placeholder for the same path, every run. */
function placeholderFor(path: string, png: boolean) {
  let h = 0
  for (const c of path) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const set = png ? PLACEHOLDER.png : PLACEHOLDER.jpeg
  return Buffer.from(set[h % set.length] as string, 'base64')
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
      const bytes = placeholderFor(url.pathname, png)
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
