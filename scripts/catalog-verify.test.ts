// SPDX-License-Identifier: AGPL-3.0-only
// The live check's own logic over the fake indexer: nothing leaves the process.
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeClock, type Fetch } from '@highsea-tv/core'
import { createFakeIndexer, FAKE_NOW } from '@highsea-tv/indexers/fake'
import type { Definition } from '@highsea-tv/schemas/indexers'
import {
  catalogDefinitions,
  challengeOf,
  mergeVerified,
  probeWord,
  readVerified,
  table,
  type Verification,
  verifyAll,
  verifyDefinition,
  writeVerified,
} from './catalog-verify.ts'

const catalog = catalogDefinitions()
const byId = (id: string) => catalog.find((d) => d.definition.id === id)?.definition as Definition
const archive = byId('internet-archive')

function options(fetch?: Fetch) {
  const fake = createFakeIndexer()
  const clock = createFakeClock(FAKE_NOW)
  const sleeps: number[] = []
  return {
    fake,
    sleeps,
    options: {
      fetch: fetch ?? fake.fetch,
      clock,
      sleep: async (ms: number) => {
        sleeps.push(ms)
        clock.advance(ms)
      },
      timeoutMs: 2000,
    },
  }
}

/** The fake, except for addresses `answer` takes over. */
function around(answer: (url: URL) => Response | null) {
  const fake = createFakeIndexer()
  const fetch: Fetch = async (input, init) =>
    answer(new URL(input instanceof Request ? input.url : String(input))) ?? fake.fetch(input, init)
  return fetch
}

describe('a working definition', () => {
  test('the Internet Archive: the latest, a title search, and its first torrent parsed', async () => {
    const { options: o, fake, sleeps } = options()
    const v = await verifyDefinition(archive, 'stable', o)
    expect(v.result).toBe('working')
    expect(v.reason).toBeNull()
    expect(v.probes.map((p) => [p.name, p.releases, p.error])).toEqual([
      ['test', 3, null],
      ['title', 1, null],
    ])
    expect(v.probes[1]?.asked).toBe('A title search for “Sintel”')
    expect(v.grab).toMatch(/^a torrent of 1 file, 1 pieces, [0-9a-f]{40}$/)
    const torrent = fake.requests.at(-1)?.url
    expect(torrent?.href).toBe(
      'https://archive.org/download/Sintel_2010/Sintel_2010_archive.torrent',
    )
    // the definition's minGapMs of 1000 holds between its requests
    expect(sleeps).toEqual([1000, 1000])
  })
})

describe('the TV and anime sites (HT-110)', () => {
  const sites = join(import.meta.dir, '../packages/indexers/test/fake/sites')
  const answer = (file: string) => () => new Response(readFileSync(join(sites, file), 'utf8'))

  test('EZTV, which takes only an id: its newest releases, no title search, its first magnet', async () => {
    const eztv = byId('eztv')
    expect(catalog.find((d) => d.definition.id === 'eztv')?.channel).toBe('beta')
    const fetch = around((url) => (url.hostname === 'eztvx.to' ? answer('eztv-show.json')() : null))
    const v = await verifyDefinition(eztv, 'beta', options(fetch).options)
    expect(v.result).toBe('working')
    expect(v.probes.map((p) => [p.name, p.releases])).toEqual([['test', 3]])
    expect(v.grab).toBe('a magnet for 3a5f0c1e9b7d2a4c6e8f0a1b3c5d7e9f1a2b3c4d')
  })

  test('showRSS, a feed of newest releases: read once, its first magnet parsed', async () => {
    const fetch = around((url) =>
      url.hostname === 'showrss.info' ? answer('showrss-all.xml')() : null,
    )
    const v = await verifyDefinition(byId('showrss'), 'beta', options(fetch).options)
    expect(v.result).toBe('working')
    expect(v.probes.map((p) => [p.name, p.releases])).toEqual([['test', 2]])
    expect(v.grab).toBe('a magnet for 4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f')
  })
})

describe('a failing definition', () => {
  test('one that finds nothing says so in words', async () => {
    const { options: o, fake } = options()
    fake.misbehave({ kind: 'empty' })
    const v = await verifyDefinition(archive, 'stable', o)
    expect(v.result).toBe('failing')
    expect(v.reason).toBe('The latest: It found nothing.')
    expect(v.grab).toBeNull()
  })

  test('a server error is the engine’s own words', async () => {
    const { options: o, fake } = options()
    fake.misbehave({ kind: 'status', status: 503 })
    const v = await verifyDefinition(archive, 'stable', o)
    expect(v.result).toBe('failing')
    expect(v.reason).toBe('The latest: The indexer answered with an error (HTTP 503).')
  })

  test('a torrent link that answers with a web page fails the grab', async () => {
    const fetch = around((url) =>
      url.pathname.endsWith('.torrent')
        ? new Response('<!doctype html><p>Item not available</p>', {
            headers: { 'content-type': 'text/html' },
          })
        : null,
    )
    const v = await verifyDefinition(archive, 'stable', options(fetch).options)
    expect(v.result).toBe('failing')
    expect(v.reason).toBe(
      'The first release’s torrent: The indexer sent a web page instead of the torrent. Check its sign-in.',
    )
  })

  test('one that throws doesn’t stop the rest', async () => {
    const { options: o } = options()
    const broken = { ...archive, id: 'broken', links: ['not an address'] } as Definition
    const seen: string[] = []
    const out = await verifyAll(
      [
        { definition: broken, channel: 'stable' },
        { definition: archive, channel: 'stable' },
      ],
      o,
      (v) => seen.push(v.id),
    )
    expect(out.map((v) => v.result)).toEqual(['failing', 'working'])
    expect(out[0]?.reason).toBe('The latest: The indexer’s address isn’t a valid URL.')
    expect(seen).toEqual(['broken', 'internet-archive'])
  })
})

describe('a challenge page', () => {
  test('Cloudflare’s is reported as that, not as nothing found', async () => {
    const fetch = around(
      () =>
        new Response('<!doctype html><title>Just a moment...</title>', {
          status: 403,
          headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
        }),
    )
    const v = await verifyDefinition(archive, 'stable', options(fetch).options)
    expect(v.result).toBe('challenge')
    expect(v.reason).toBe('Cloudflare showed a challenge page.')
  })

  test('a captcha on a page that otherwise answers 200', async () => {
    const fetch = around(
      () =>
        new Response(
          '<!doctype html><script src="https://js.hcaptcha.com/1/api.js"></script><div class="h-captcha"></div>',
          { headers: { 'content-type': 'text/html' } },
        ),
    )
    const v = await verifyDefinition(archive, 'stable', options(fetch).options)
    expect(v.result).toBe('challenge')
    expect(v.reason).toBe('The site showed an hCaptcha.')
  })

  test('what counts as one', () => {
    const html = new Headers({ 'content-type': 'text/html' })
    expect(
      challengeOf(html, '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js">'),
    ).toBe('The site showed a Cloudflare Turnstile captcha')
    expect(challengeOf(html, '<script src="https://www.google.com/recaptcha/api.js">')).toBe(
      'The site showed a reCAPTCHA',
    )
    expect(challengeOf(html, '<table class="torrents"></table>')).toBeNull()
    // a JSON answer that mentions a captcha isn't a page
    expect(
      challengeOf(
        new Headers({ 'content-type': 'application/json' }),
        '{"t":"hcaptcha.com/1/api.js"}',
      ),
    ).toBeNull()
  })
})

describe('skipped definitions', () => {
  test('one that needs an account or settings is listed, never run', async () => {
    const { options: o, fake } = options()
    const out = await verifyAll(
      ['generic-rss', 'generic-torznab'].map((id) => ({
        definition: byId(id),
        channel: 'stable' as const,
      })),
      o,
    )
    expect(out.map((v) => [v.id, v.result, v.reason])).toEqual([
      ['generic-rss', 'skipped', 'It’s private: it needs an account.'],
      ['generic-torznab', 'skipped', 'It’s private: it needs an account.'],
    ])
    expect(fake.requests).toEqual([])
  })

  test('a public one with a required setting', async () => {
    const def = {
      ...archive,
      settings: [
        { key: 'region', label: 'Region', type: 'text', required: true, secret: false, help: null },
      ],
    } as Definition
    const v = await verifyDefinition(def, 'stable', options().options)
    expect(v.result).toBe('skipped')
    expect(v.reason).toBe('It needs settings: region.')
  })
})

describe('verified.json', () => {
  const result = (over: Partial<Verification>): Verification => ({
    id: 'internet-archive',
    name: 'Internet Archive',
    version: '1.0.0',
    channel: 'stable',
    result: 'working',
    reason: null,
    probes: [
      { name: 'test', asked: 'The latest', releases: 100, withSize: 98, ms: 400, error: null },
      { name: 'title', asked: 'A title search', releases: 4, withSize: 4, ms: 300, error: null },
    ],
    grab: 'a torrent',
    ...over,
  })

  test('is written with the date, the version, the result and the counts', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'verify-')), 'verified.json')
    writeVerified(file, mergeVerified(readVerified(file), [result({})], '2026-11-18'))
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(written.definitions).toEqual({
      'internet-archive': {
        name: 'Internet Archive',
        version: '1.0.0',
        channel: 'stable',
        result: 'working',
        reason: null,
        checked: '2026-11-18',
        verified: '2026-11-18',
        counts: { probes: 2, working: 2, releases: 104, withSize: 102 },
      },
    })
    expect(readFileSync(file, 'utf8').endsWith('}\n')).toBe(true)
  })

  test('a later failure keeps the last working date, a new version drops it', () => {
    const first = mergeVerified({ about: '', definitions: {} }, [result({})], '2026-11-18')
    const failed = mergeVerified(
      first,
      [result({ result: 'failing', reason: 'The latest: It found nothing.' })],
      '2026-11-25',
    )
    expect(failed.definitions['internet-archive']).toMatchObject({
      result: 'failing',
      checked: '2026-11-25',
      verified: '2026-11-18',
    })
    const changed = mergeVerified(
      failed,
      [result({ version: '1.1.0', result: 'failing', reason: 'x' })],
      '2026-11-26',
    )
    expect(changed.definitions['internet-archive']?.verified).toBeNull()
  })

  test('a run for one id keeps every other entry, sorted; beta has its own key', () => {
    const a = mergeVerified({ about: '', definitions: {} }, [result({ id: 'zeta' })], '2026-11-18')
    const b = mergeVerified(a, [result({ channel: 'beta' })], '2026-11-19')
    expect(Object.keys(b.definitions)).toEqual(['beta/internet-archive', 'zeta'])
  })

  test('the table lists every result with its reason', () => {
    const out = table([
      result({}),
      result({
        id: 'generic-rss',
        result: 'skipped',
        reason: 'It’s private: it needs an account.',
        probes: [],
      }),
    ])
    expect(out).toContain('internet-archive  1.0.0    Working  test 100, title 4; a torrent')
    expect(out).toContain('generic-rss       1.0.0    Skipped  It’s private: it needs an account.')
    expect(out).toContain('1 working, 0 failing, 0 challenge, 1 skipped')
  })
})

test('a title search uses a word worth finding', () => {
  expect(probeWord('Sintel 2010')).toBe('Sintel')
  expect(probeWord('Night of the Living Dead 1968')).toBe('Living')
  expect(probeWord('Movie.2160p.WEB-DL')).toBe('Movie')
  expect(probeWord('M 1931')).toBeNull()
})
