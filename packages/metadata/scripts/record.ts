// SPDX-License-Identifier: AGPL-3.0-only
// `bun run record:tmdb [path?query …]`: asks TMDB again for every recorded request (and any given
// on the command line, like `/3/movie/603?append_to_response=credits&language=en-US`) with the
// developer's own credential, and rewrites the recordings (ADR 0029). With `--only`, it asks for the
// command line's requests alone and leaves the other recordings as they are. The credential comes from
// HIGHSEA_TMDB_READ_TOKEN (the name the release uses), TMDB_READ_TOKEN or TMDB_API_KEY, in the
// shell or the repository's .env.local (package.json passes it with Bun's --env-file; a missing
// file is skipped and the shell wins). It never lands in a file: the script refuses to write a
// recording that contains it, or anything shaped like a key. It's never run in CI.
//
// `--show <id>` (ADR 0064) records a show as the metadata service asks for it: the show's request,
// then each season it lists, then `find` for the show's and each season's TheTVDB id, since the
// seasons aren't known until the show answers. Several `--show`s may be given.
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
import { imageLanguages, SEASON_APPEND, SHOW_APPEND } from '../src/tmdb/api.ts'

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

const only = process.argv.includes('--only')
const wanted = new Map<string, { url: string; credential: RecordedCredential }>()
for (const name of only ? [] : readdirSync(RECORDINGS_DIR).filter((n) => n.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(join(RECORDINGS_DIR, name), 'utf8')) as Recording
  wanted.set(`${r.request.url} ${r.request.credential}`, r.request)
}
const args = process.argv.slice(2).filter((a) => a !== '--only')
const shows: number[] = []
for (let i = 0; i < args.length; i++) {
  const arg = args[i] as string
  if (arg === '--show') {
    const id = Number(args[++i])
    if (!Number.isSafeInteger(id) || id <= 0) {
      console.error('--show takes a TMDB show id.')
      process.exit(1)
    }
    shows.push(id)
    continue
  }
  const url = canonicalUrl(new URL(arg, TMDB_API))
  wanted.set(`${url} valid`, { url, credential: 'valid' })
}

const LANGUAGE = 'en-US'
const tmdbPath = (path: string, query: Record<string, string>) => {
  const url = new URL(path, TMDB_API)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return canonicalUrl(url)
}
const findPath = (tvdbId: number) =>
  tmdbPath(`/3/find/${tvdbId}`, { external_source: 'tvdb_id', language: LANGUAGE })

let written = 0
/** Asks TMDB, checks the answer holds no credential, writes it; returns the body. */
async function record(request: { url: string; credential: RecordedCredential }) {
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
  return body as Record<string, unknown>
}

for (const request of wanted.values()) await record(request)

type ShowBody = {
  seasons?: { season_number: number }[]
  external_ids?: { tvdb_id?: number | null }
}
for (const id of shows) {
  const show = (await record({
    url: tmdbPath(`/3/tv/${id}`, {
      append_to_response: SHOW_APPEND,
      include_image_language: imageLanguages(LANGUAGE),
      language: LANGUAGE,
    }),
    credential: 'valid',
  })) as ShowBody
  const tvdb = show.external_ids?.tvdb_id
  if (tvdb) await record({ url: findPath(tvdb), credential: 'valid' })
  for (const s of show.seasons ?? []) {
    const season = (await record({
      url: tmdbPath(`/3/tv/${id}/season/${s.season_number}`, {
        append_to_response: SEASON_APPEND,
        language: LANGUAGE,
      }),
      credential: 'valid',
    })) as ShowBody
    const seasonTvdb = season.external_ids?.tvdb_id
    if (seasonTvdb) await record({ url: findPath(seasonTvdb), credential: 'valid' })
  }
}
// in the repo's JSON style, so `bun run lint` passes on fresh recordings
Bun.spawnSync(['bunx', 'biome', 'format', '--write', RECORDINGS_DIR], { stdout: 'inherit' })
console.log(`${written} recordings written to ${RECORDINGS_DIR}`)
