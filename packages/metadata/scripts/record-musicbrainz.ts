// SPDX-License-Identifier: AGPL-3.0-only
// `bun run record:musicbrainz [--artist <mbid>] [--release-group <mbid>] [--release <mbid>] …`:
// asks MusicBrainz and the Cover Art Archive for each id as the metadata service asks for it, and
// writes one recording per request into test/fixtures/musicbrainz (ADR 0029, ADR 0065). A release
// group is recorded with its cover list; a release with its release group and that group's cover.
// With no ids, every recorded request is asked again. Through the client itself, so the requests
// keep MusicBrainz's pace (one a second) and send highsea's User-Agent. MusicBrainz needs no key,
// so nothing secret can land in a file. It's never run in CI: the tests only replay.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { silentLogger, systemClock } from '@highsea-tv/core'
import {
  coverArtUrl,
  createMusicBrainzClient,
  MBID,
  type MusicBrainzEntity,
  musicBrainzUrl,
} from '../src/musicbrainz/client.ts'
import { canonicalUrl, type Recording, recordingName } from '../src/recording.ts'
import { MUSICBRAINZ_RECORDINGS_DIR } from '../src/replay.ts'

if (process.env.CI) {
  console.error('record:musicbrainz asks MusicBrainz itself, so it doesn’t run in CI.')
  process.exit(1)
}
const version = JSON.parse(
  readFileSync(new URL('../../../apps/server/package.json', import.meta.url), 'utf8'),
).version as string

const wanted: URL[] = []
const args = process.argv.slice(2)
const ENTITIES: Record<string, MusicBrainzEntity> = {
  '--artist': 'artist',
  '--release-group': 'release-group',
  '--release': 'release',
}
for (let i = 0; i < args.length; i++) {
  const entity = ENTITIES[args[i] as string]
  const id = args[++i]
  if (!entity || !id || !MBID.test(id)) {
    console.error('Give --artist, --release-group or --release, each with a MusicBrainz id.')
    process.exit(1)
  }
  wanted.push(musicBrainzUrl(entity, id))
}
mkdirSync(MUSICBRAINZ_RECORDINGS_DIR, { recursive: true })
if (wanted.length === 0)
  for (const name of readdirSync(MUSICBRAINZ_RECORDINGS_DIR).filter((n) => n.endsWith('.json'))) {
    const r = JSON.parse(readFileSync(join(MUSICBRAINZ_RECORDINGS_DIR, name), 'utf8')) as Recording
    wanted.push(new URL(r.request.url))
  }

// a fetch that writes what it's answered, behind the client's pace and User-Agent
const recording = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : input.toString())
  const res = await fetch(url, init)
  const body = res.status === 404 ? { error: 'Not Found' } : await res.clone().json()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const r: Recording = {
    request: { method: 'GET', url: canonicalUrl(url), credential: 'valid' },
    response: { status: res.status, headers, body },
  }
  writeFileSync(
    join(MUSICBRAINZ_RECORDINGS_DIR, recordingName('GET', url.toString(), 'valid')),
    `${JSON.stringify(r, null, 2)}\n`,
  )
  console.log(res.status, canonicalUrl(url))
  return res.status === 404 ? new Response(null, { status: 404 }) : res
}
const client = createMusicBrainzClient({
  fetch: recording,
  clock: systemClock,
  logger: silentLogger,
  version,
})

const seen = new Set<string>()
for (const url of wanted) {
  const key = canonicalUrl(url)
  if (seen.has(key)) continue
  seen.add(key)
  const [, entity, id] = /\/(?:ws\/2\/)?([a-z-]+)\/([0-9a-f-]{36})/.exec(url.pathname) ?? []
  if (!entity || !id) continue
  if (url.hostname === 'coverartarchive.org') {
    await client.coverArt(id)
    continue
  }
  const body = await client.lookup<{ 'release-group'?: { id?: string } }>(
    entity as MusicBrainzEntity,
    id,
  )
  // a release group's cover, and a release's group with its cover, as the library asks for them
  const group = entity === 'release-group' ? id : (body?.['release-group']?.id ?? null)
  if (
    entity === 'release' &&
    group &&
    !seen.has(canonicalUrl(musicBrainzUrl('release-group', group)))
  ) {
    seen.add(canonicalUrl(musicBrainzUrl('release-group', group)))
    await client.lookup('release-group', group)
  }
  if (group && !seen.has(canonicalUrl(coverArtUrl(group)))) {
    seen.add(canonicalUrl(coverArtUrl(group)))
    await client.coverArt(group)
  }
}
