// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's live check (ADR 0034, 2026-11-18): runs each public definition against its real
// site with the engine's own search and grab, and records the result with a date in
// catalog/indexers/verified.json. It's run by hand, never by the tests or a gate, because it
// needs the network and many public sites refuse datacentre addresses.
//
//   bun run catalog:verify [id…]   every public definition, or only these
//     --dry                        print the table, leave verified.json as it is
//
// Each definition gets up to three probes: its own `test` query, the latest releases (when the test
// asks for something else), and a title search for a word from the first result (a feed can't be
// searched, so RSS skips it). A probe works only when it finds releases a grab can use, and the
// first release's torrent is fetched (never downloaded: no peers are contacted) and parsed with the
// torrent engine's own parser, or its magnet is. A definition that needs an account or settings is
// skipped and listed. A challenge page is reported as one: Cloudflare marks its own with
// `cf-mitigated: challenge`
// (https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/),
// and a page that loads Turnstile, hCaptcha or reCAPTCHA is a captcha.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadDefinitionFiles } from '@highsea-tv/catalog'
import type { Clock, Fetch } from '@highsea-tv/core'
import {
  createRateLimiter,
  fetchRelease,
  IndexerError,
  type IndexerRelease,
  runSearch,
  type SearchQuery,
} from '@highsea-tv/indexers'
import type { Definition } from '@highsea-tv/schemas/indexers'
import { parseMagnet, parseTorrentFile } from '@highsea-tv/torrent'

const root = join(import.meta.dir, '..')
export const CATALOG_DIR = join(root, 'catalog/indexers')
export const VERIFIED_FILE = join(CATALOG_DIR, 'verified.json')

/** Each request's time to answer, as the server gives an indexer (owner's answer 7). */
const TIMEOUT_MS = 30_000
/** A definition without a rate limit still gets one request a second at most. */
const POLITE = { requests: 30, seconds: 60, minGapMs: 1000 }

export type Outcome = 'working' | 'failing' | 'challenge' | 'skipped'

export type Probe = {
  name: 'test' | 'latest' | 'title'
  /** What was asked, in words. */
  asked: string
  releases: number
  /** How many had a size; a site that shows none has none. */
  withSize: number
  ms: number
  error: string | null
}

export type Verification = {
  id: string
  name: string
  version: string
  channel: 'stable' | 'beta'
  result: Outcome
  /** Why it isn't working or was skipped, in words; null when it works. */
  reason: string | null
  probes: Probe[]
  /** The first release's torrent or magnet, as parsed; null when none was checked. */
  grab: string | null
}

export type VerifyOptions = {
  fetch: Fetch
  clock: Clock
  sleep: (ms: number) => Promise<void>
  timeoutMs?: number
}

/** Why a definition can't be checked without someone's account or settings, or null. */
export function skipReason(def: Definition): string | null {
  if (def.privacy !== 'public') return `It’s ${def.privacy}: it needs an account.`
  if (def.login.method !== 'none') return 'It needs a sign-in.'
  const required = def.settings.filter((s) => s.required && s.default === undefined)
  if (required.length)
    return `It needs settings: ${required.map((s) => s.label.toLowerCase()).join(', ')}.`
  if (def.baseUrl?.includes('.Config.')) return 'Its address comes from a setting.'
  return null
}

const TURNSTILE = /challenges\.cloudflare\.com\/turnstile/i
const HCAPTCHA = /(?:js\.)?hcaptcha\.com\/1\/api\.js|class="h-captcha"/i
const RECAPTCHA = /google\.com\/recaptcha\/|class="g-recaptcha"/i

/** What kind of challenge an answer is, or null. */
export function challengeOf(headers: Headers, body: string): string | null {
  if (headers.get('cf-mitigated')?.toLowerCase() === 'challenge')
    return 'Cloudflare showed a challenge page'
  if (!/html/i.test(headers.get('content-type') ?? '') && !/^\s*</.test(body)) return null
  const head = body.slice(0, 200_000)
  if (TURNSTILE.test(head)) return 'The site showed a Cloudflare Turnstile captcha'
  if (HCAPTCHA.test(head)) return 'The site showed an hCaptcha'
  if (RECAPTCHA.test(head)) return 'The site showed a reCAPTCHA'
  return null
}

/** A fetch that notices challenge pages without changing what the engine reads. */
function watching(fetch: Fetch) {
  const seen: { challenge: string | null } = { challenge: null }
  const wrapped: Fetch = async (input, init) => {
    const response = await fetch(input, init)
    const type = response.headers.get('content-type') ?? ''
    if (response.headers.get('cf-mitigated') || /html/i.test(type)) {
      const text = await response.clone().text()
      seen.challenge ??= challengeOf(response.headers, text)
    }
    return response
  }
  return { fetch: wrapped, seen }
}

/** A word from a title that a title search should find again: the longest of four letters or more. */
export function probeWord(title: string): string | null {
  const words = title
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4 && /\p{L}/u.test(w) && !/^\d+p$/i.test(w))
  return words.sort((a, b) => b.length - a.length)[0] ?? null
}

/** Why a release can't be grabbed, or null. */
function unusable(r: IndexerRelease): string | null {
  if (!r.title.trim()) return 'a release has no title'
  if (!r.download && !r.magnet && !r.infohash) return `“${r.title}” has no torrent or magnet`
  if (r.size !== null && !(r.size > 0)) return `“${r.title}” has a size of ${r.size}`
  return null
}

const message = (e: unknown) =>
  e instanceof IndexerError || e instanceof Error ? e.message : String(e)

export async function verifyDefinition(
  def: Definition,
  channel: 'stable' | 'beta',
  options: VerifyOptions,
): Promise<Verification> {
  const base = { id: def.id, name: def.name, version: def.version, channel }
  const skip = skipReason(def)
  if (skip) return { ...base, result: 'skipped', reason: skip, probes: [], grab: null }

  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  const limiter = createRateLimiter(options.clock, options.sleep)
  const rule = def.rateLimit ?? POLITE
  const beforeRequest = () => limiter.acquire(def.id, rule)
  const { fetch, seen } = watching(options.fetch)
  const ctx = {
    definition: def,
    settings: {},
    session: null,
    caps: null,
    fetch,
    timeoutMs,
    now: options.clock.now,
    beforeRequest,
  }

  const probes: Probe[] = []
  let first: IndexerRelease | null = null
  let reason: string | null = null
  const run = async (name: Probe['name'], query: SearchQuery, asked: string) => {
    const started = options.clock.now()
    const probe: Probe = { name, asked, releases: 0, withSize: 0, ms: 0, error: null }
    probes.push(probe)
    try {
      const result = await runSearch(ctx, query)
      probe.releases = result.releases.length
      probe.withSize = result.releases.filter((r) => r.size !== null).length
      const bad = result.releases.map(unusable).find((u) => u !== null)
      if (!result.releases.length) probe.error = 'It found nothing.'
      else if (bad) probe.error = `It found releases a grab can’t use: ${bad}.`
      first ??= result.releases[0] ?? null
    } catch (e) {
      probe.error = message(e)
    }
    probe.ms = options.clock.now() - started
    if (probe.error && !reason) reason = `${asked}: ${probe.error}`
  }

  const keywords = def.test.keywords
  await run('test', { keywords }, keywords ? `The test search for “${keywords}”` : 'The latest')
  if (keywords) await run('latest', { keywords: '' }, 'The latest')
  const word = first ? probeWord((first as IndexerRelease).title) : null
  // a title search needs a site that takes words: not an RSS feed (its words aren't a title), nor
  // one that takes only an id or nothing (EZTV, SubsPlease; engine 1.2). Torznab's caps decide.
  const takesWords =
    def.kind === 'torznab' || def.kind === 'newznab' || def.search.supports.includes('q')
  if (def.kind !== 'rss' && takesWords && word)
    await run('title', { title: word }, `A title search for “${word}”`)

  let grab: string | null = null
  if (first) {
    const release = first as IndexerRelease
    try {
      grab = await checkGrab(release, def, {
        fetch,
        timeoutMs,
        now: options.clock.now,
        beforeRequest,
      })
    } catch (e) {
      reason ??= `The first release’s torrent: ${message(e)}`
    }
  }

  if (seen.challenge)
    return { ...base, result: 'challenge', reason: `${seen.challenge}.`, probes, grab }
  return { ...base, result: reason ? 'failing' : 'working', reason, probes, grab }
}

/** Fetches the release's torrent and parses it, or parses its magnet. Says what it found. */
async function checkGrab(
  release: IndexerRelease,
  def: Definition,
  ctx: { fetch: Fetch; timeoutMs: number; now: () => number; beforeRequest: () => Promise<void> },
): Promise<string> {
  const magnet =
    release.magnet ?? (release.infohash ? `magnet:?xt=urn:btih:${release.infohash}` : null)
  if (!release.download) {
    const m = parseMagnet(magnet as string)
    return `a magnet for ${m.infoHash}`
  }
  const origin = new URL(def.links[0] ?? release.download).origin
  const fetched = await fetchRelease({ ...ctx, origin, cookie: null }, release.download)
  if ('magnet' in fetched) return `a magnet for ${parseMagnet(fetched.magnet).infoHash}`
  const info = parseTorrentFile(fetched.torrent)
  return `a torrent of ${info.files.length} file${info.files.length === 1 ? '' : 's'}, ${info.pieceCount} pieces, ${info.infoHash}`
}

/** Runs each definition in turn: one failing never stops the rest. */
export async function verifyAll(
  defs: { definition: Definition; channel: 'stable' | 'beta' }[],
  options: VerifyOptions,
  onEach?: (v: Verification) => void,
): Promise<Verification[]> {
  const out: Verification[] = []
  for (const { definition, channel } of defs) {
    let v: Verification
    try {
      v = await verifyDefinition(definition, channel, options)
    } catch (e) {
      v = {
        id: definition.id,
        name: definition.name,
        version: definition.version,
        channel,
        result: 'failing',
        reason: message(e),
        probes: [],
        grab: null,
      }
    }
    out.push(v)
    onEach?.(v)
  }
  return out
}

// ------------------------------------------------------------------ verified.json

export type VerifiedEntry = {
  name: string
  version: string
  channel: 'stable' | 'beta'
  result: Outcome
  reason: string | null
  /** When it was last checked, `YYYY-MM-DD`. */
  checked: string
  /** The last time this version worked, or null when it hasn't since it changed. */
  verified: string | null
  counts: { probes: number; working: number; releases: number; withSize: number }
}

export type VerifiedFile = {
  /** What the file is, for whoever opens it. */
  about: string
  definitions: Record<string, VerifiedEntry>
}

const ABOUT =
  'Written by bun run catalog:verify: each definition checked against its real site, with the date. Don’t edit by hand.'

/** The file's key for a definition: its id, or `beta/<id>` for the beta channel's. */
export const keyOf = (v: Pick<Verification, 'id' | 'channel'>) =>
  v.channel === 'beta' ? `beta/${v.id}` : v.id

export function readVerified(file: string): VerifiedFile {
  if (!existsSync(file)) return { about: ABOUT, definitions: {} }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as VerifiedFile
  return { about: ABOUT, definitions: parsed.definitions ?? {} }
}

/** Folds this run's results into the file's, keeping every other definition's as it was. */
export function mergeVerified(
  file: VerifiedFile,
  results: readonly Verification[],
  date: string,
): VerifiedFile {
  const definitions = { ...file.definitions }
  for (const v of results) {
    const key = keyOf(v)
    const earlier = definitions[key]
    const working = v.result === 'working'
    definitions[key] = {
      name: v.name,
      version: v.version,
      channel: v.channel,
      result: v.result,
      reason: v.reason,
      checked: date,
      verified: working
        ? date
        : earlier && earlier.version === v.version && v.result !== 'skipped'
          ? earlier.verified
          : null,
      counts: {
        probes: v.probes.length,
        working: v.probes.filter((p) => !p.error).length,
        releases: v.probes.reduce((n, p) => n + p.releases, 0),
        withSize: v.probes.reduce((n, p) => n + p.withSize, 0),
      },
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(definitions).sort(([a], [b]) => a.localeCompare(b)),
  )
  return { about: ABOUT, definitions: sorted }
}

export function writeVerified(file: string, data: VerifiedFile): void {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
}

// ------------------------------------------------------------------ the table

const LABEL: Record<Outcome, string> = {
  working: 'Working',
  failing: 'Failing',
  challenge: 'Challenge',
  skipped: 'Skipped',
}

export function table(results: readonly Verification[]): string {
  const rows = results.map((v) => [
    keyOf(v),
    v.version,
    LABEL[v.result],
    v.result === 'working'
      ? `${v.probes.map((p) => `${p.name} ${p.releases}`).join(', ')}; ${v.grab ?? 'no grab'}`
      : (v.reason ?? ''),
  ])
  const head = ['Definition', 'Version', 'Result', 'Details']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] as string).length)))
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] as number)))
      .join('  ')
      .trimEnd()
  const counts = (Object.keys(LABEL) as Outcome[])
    .map((o) => `${results.filter((v) => v.result === o).length} ${LABEL[o].toLowerCase()}`)
    .join(', ')
  return [line(head), ...rows.map(line), '', counts].join('\n')
}

/** Every definition the catalog ships, the beta channel's included. */
export function catalogDefinitions(dir = CATALOG_DIR) {
  const out: { definition: Definition; channel: 'stable' | 'beta' }[] = []
  for (const channel of ['stable', 'beta'] as const) {
    const { loaded, broken } = loadDefinitionFiles(
      join(dir, channel === 'stable' ? 'definitions' : 'beta'),
    )
    if (broken.length)
      throw new Error(
        `Some definitions don’t validate; run bun run catalog:build.\n${broken.map((b) => `${b.file}: ${b.message}`).join('\n')}`,
      )
    for (const f of loaded) out.push({ definition: f.definition, channel })
  }
  return out
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const ids = args.filter((a) => !a.startsWith('--'))
  const all = catalogDefinitions()
  const unknown = ids.filter((id) => !all.some((d) => d.definition.id === id))
  if (unknown.length) {
    console.error(`No definition with the id ${unknown.join(', ')}.`)
    process.exit(1)
  }
  const chosen = ids.length ? all.filter((d) => ids.includes(d.definition.id)) : all
  const results = await verifyAll(
    chosen,
    {
      fetch: globalThis.fetch,
      clock: { now: Date.now },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    (v) => {
      console.log(`${keyOf(v)}: ${LABEL[v.result].toLowerCase()}${v.reason ? `, ${v.reason}` : ''}`)
      for (const p of v.probes)
        console.log(
          `  ${p.asked}: ${p.releases} releases, ${p.withSize} with a size, ${(p.ms / 1000).toFixed(1)} s${p.error ? `, ${p.error}` : ''}`,
        )
      if (v.grab) console.log(`  The first release: ${v.grab}`)
    },
  )
  console.log(`\n${table(results)}`)
  const date = new Date().toISOString().slice(0, 10)
  if (!dry) {
    writeVerified(VERIFIED_FILE, mergeVerified(readVerified(VERIFIED_FILE), results, date))
    console.log(`\nWrote ${VERIFIED_FILE.slice(root.length + 1)}.`)
  }
  process.exit(results.some((v) => v.result === 'failing' || v.result === 'challenge') ? 1 : 0)
}
