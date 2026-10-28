// SPDX-License-Identifier: AGPL-3.0-only
// `bun run record:tmdb [path?query …]`: asks TMDB again for every recorded request (and any given
// on the command line, like `/3/movie/603?append_to_response=credits&language=en-US`) with the
// developer's own credential, and rewrites the recordings (ADR 0029). The credential comes from
// HIGHSEA_TMDB_READ_TOKEN (the name the release uses), TMDB_READ_TOKEN or TMDB_API_KEY, in the
// shell or the repository's .env.local (package.json passes it with Bun's --env-file; a missing
// file is skipped and the shell wins). It never lands in a file: the script refuses to write a
// recording that contains it, or anything shaped like a key. It's never run in CI.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { credentialOf, TMDB_API } from '../src/index.ts'
import {
  canonicalUrl,
  leaksCredential,
  type RecordedCredential,
  type Recording,
  recordingName,
} from '../src/recording.ts'
import { RECORDINGS_DIR } from '../src/replay.ts'

if (process.env.CI) {
  console.error('record:tmdb uses a personal TMDB key, so it doesn’t run in CI.')
  process.exit(1)
}
const secret =
  process.env.HIGHSEA_TMDB_READ_TOKEN || process.env.TMDB_READ_TOKEN || process.env.TMDB_API_KEY
if (!secret) {
  console.error(
    'Set HIGHSEA_TMDB_READ_TOKEN (or TMDB_READ_TOKEN or TMDB_API_KEY) to a TMDB credential, in the shell or .env.local.',
  )
  process.exit(1)
}
const credential = credentialOf(secret)
/** What the bad-key recordings send: TMDB answers 401, status_code 7. */
const INVALID = 'invalid0000000000000000000000000'

const wanted = new Map<string, { url: string; credential: RecordedCredential }>()
for (const name of readdirSync(RECORDINGS_DIR).filter((n) => n.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(join(RECORDINGS_DIR, name), 'utf8')) as Recording
  wanted.set(`${r.request.url} ${r.request.credential}`, r.request)
}
for (const arg of process.argv.slice(2)) {
  const url = canonicalUrl(new URL(arg, TMDB_API))
  wanted.set(`${url} valid`, { url, credential: 'valid' })
}

let written = 0
for (const request of wanted.values()) {
  const url = new URL(request.url)
  const headers: Record<string, string> = { accept: 'application/json' }
  if (request.credential === 'invalid') url.searchParams.set('api_key', INVALID)
  else if (credential.kind === 'token') headers.authorization = `Bearer ${credential.value}`
  else url.searchParams.set('api_key', credential.value)
  const res = await fetch(url, { headers })
  const body = await res.json()
  const recording: Recording = {
    request: { method: 'GET', url: canonicalUrl(request.url), credential: request.credential },
    response: {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
      body,
    },
  }
  const text = `${JSON.stringify(recording, null, 2)}\n`
  if (leaksCredential(text, [credential.value, INVALID])) {
    console.error(`Refusing to write ${recording.request.url}: it contains a credential.`)
    process.exit(1)
  }
  writeFileSync(join(RECORDINGS_DIR, recordingName('GET', request.url, request.credential)), text)
  written++
  console.log(`${res.status} ${recording.request.url}`)
  // well under TMDB's ~40 a second (https://developer.themoviedb.org/docs/rate-limiting)
  await new Promise((r) => setTimeout(r, 100))
}
// in the repo's JSON style, so `bun run lint` passes on fresh recordings
Bun.spawnSync(['bunx', 'biome', 'format', '--write', RECORDINGS_DIR], { stdout: 'inherit' })
console.log(`${written} recordings written to ${RECORDINGS_DIR}`)
