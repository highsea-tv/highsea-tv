// SPDX-License-Identifier: AGPL-3.0-only
// The replaying `fetch` (ADR 0029): serves TMDB's recorded answers and fails on any request it has
// no recording for, so a test never reaches the network. Images come back as tiny placeholders,
// which keeps the repo small. The dev and sweep servers boot on it too
// (`createReplayFetch()` as `BootOptions.fetch`), so the admin works without a TMDB key. fanart.tv
// (HT-74) is answered from hand-written files in its documented shape (test/fixtures/fanart), as
// highsea has no fanart.tv key to record with yet. MusicBrainz and the Cover Art Archive (ADR 0065)
// are replayed from their own recordings (test/fixtures/musicbrainz), made by
// `bun run record:musicbrainz`; their images come back as placeholders too.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Fetch } from '@highsea-tv/core'
import { type RecordedCredential, type Recording, recordingKey } from './recording.ts'

/** The recordings in this package: `test/fixtures/tmdb`. */
export const RECORDINGS_DIR = fileURLToPath(new URL('../test/fixtures/tmdb/', import.meta.url))

/** fanart.tv's answers, written by hand in its documented shape (that folder's README). */
export const FANART_FIXTURES_DIR = fileURLToPath(
  new URL('../test/fixtures/fanart/', import.meta.url),
)

/** MusicBrainz's and the Cover Art Archive's recordings: `test/fixtures/musicbrainz`. */
export const MUSICBRAINZ_RECORDINGS_DIR = fileURLToPath(
  new URL('../test/fixtures/musicbrainz/', import.meta.url),
)

/** The hosts MusicBrainz's recordings answer for; they need no credential. */
const MUSICBRAINZ_HOSTS = new Set(['musicbrainz.org', 'coverartarchive.org'])
/** Where the Cover Art Archive's images are served from: placeholders, as TMDB's are. */
const COVER_ART_IMAGE_HOSTS = /(^|\.)archive\.org$/

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
 * violet, mauve, moss, ember, slate): each image gets one by its file name, so cards side by side
 * differ, one image is the same at every size (the artwork picker's current one and its tile), and
 * a page compared with its prototype reads as artwork, not one grey.
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
  const file = path.slice(path.lastIndexOf('/'))
  let h = 0
  for (const c of file) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const set = png ? PLACEHOLDER.png : PLACEHOLDER.jpeg
  return Buffer.from(set[h % set.length] as string, 'base64')
}

/** The request had no recording: a test (or a page in the sweep) asked for something new. */
export class ReplayMissError extends Error {
  constructor(key: string, source: 'tmdb' | 'musicbrainz' = 'tmdb') {
    super(
      source === 'tmdb'
        ? `There's no TMDB recording for ${key}. Add it with \`bun run record:tmdb\` in packages/metadata.`
        : `There's no MusicBrainz recording for ${key}. Add it with \`bun run record:musicbrainz\` in packages/metadata.`,
    )
    this.name = 'ReplayMissError'
  }
}

export function loadRecordings(dir = RECORDINGS_DIR): Map<string, Recording> {
  const recordings = new Map<string, Recording>()
  if (!existsSync(dir)) return recordings
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
  /** fanart.tv's answers: `movie_{tmdb id}.json`. */
  fanartDir?: string
  /** MusicBrainz's and the Cover Art Archive's recordings. */
  musicBrainzDir?: string
  /** Seen before a request is answered: tests count calls or fail one on purpose. */
  onRequest?: (url: URL, init?: RequestInit) => Response | undefined
}

export type ReplayFetch = Fetch & { requests: string[] }

/** fanart.tv's answer for a path (`/v3.2/movies/10378`), as its docs give it, or a 404 or 401. */
function fanartAnswer(dir: string, url: URL, headers: Headers): Response {
  const keys = [headers.get('api-key'), headers.get('client-key')].filter(Boolean) as string[]
  // fanart.tv answers 401 for a missing or invalid key (its docs' error responses)
  if (!keys.length || keys.some((k) => k.startsWith(INVALID_CREDENTIAL_PREFIX)))
    return Response.json({ status: 'error', 'error message': 'Not authorized' }, { status: 401 })
  const m = /^\/v3\.2\/movies\/(\d+)$/.exec(url.pathname)
  const file = m ? join(dir, `movie_${m[1]}.json`) : null
  if (file && existsSync(file))
    return new Response(readFileSync(file, 'utf8'), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  return Response.json({ status: 'error', 'error message': 'Not found' }, { status: 404 })
}

export function createReplayFetch({
  dir,
  fanartDir = FANART_FIXTURES_DIR,
  musicBrainzDir = MUSICBRAINZ_RECORDINGS_DIR,
  onRequest,
}: ReplayOptions = {}): ReplayFetch {
  const recordings = loadRecordings(dir)
  const musicBrainz = loadRecordings(musicBrainzDir)
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

    if (url.hostname === 'webservice.fanart.tv')
      return fanartAnswer(fanartDir, url, new Headers(init?.headers ?? request?.headers))
    if (MUSICBRAINZ_HOSTS.has(url.hostname)) {
      const key = recordingKey(method, url.toString(), 'valid')
      const found = musicBrainz.get(key)
      if (!found) throw new ReplayMissError(key, 'musicbrainz')
      return new Response(JSON.stringify(found.response.body), {
        status: found.response.status,
        headers: found.response.headers,
      })
    }
    if (
      url.hostname === 'image.tmdb.org' ||
      url.hostname === 'assets.fanart.tv' ||
      COVER_ART_IMAGE_HOSTS.test(url.hostname)
    ) {
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
