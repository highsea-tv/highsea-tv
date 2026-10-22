// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createFakeClock, createSealer, generateSecretKey, silentLogger } from '@highsea-tv/core'
import { migrate, openDatabase, schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { createAccounts, NO_APP_KEY } from '../../src/movies/accounts.ts'
import { ProviderError } from '../../src/shared/types.ts'
import { createFakeSubtitles, FAKE_ACCOUNTS, FAKE_OPENSUBTITLES_KEY } from '../fake/index.ts'
import { must } from '../must.ts'
import { reason } from './helpers.ts'

const HOUR = 60 * 60_000

function setup({ key = FAKE_OPENSUBTITLES_KEY as string | null } = {}) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock(Date.UTC(2026, 9, 21, 12))
  const fake = createFakeSubtitles({ clock })
  const accounts = createAccounts({
    db,
    clock,
    logger: silentLogger,
    sealer: createSealer(generateSecretKey()),
    fetch: fake.fetch,
    userAgent: 'highsea v0.0.0',
    openSubtitlesKey: key,
  })
  accounts.seed()
  const row = (id: 'opensubtitles' | 'subdl' | 'subsource') =>
    must(
      db.select().from(schema.subtitleProviders).where(eq(schema.subtitleProviders.id, id)).get(),
    )
  return { db, clock, fake, accounts, row }
}

const query = {
  tmdbId: 45745,
  imdbId: 'tt1727587',
  title: 'Sintel',
  year: 2010,
  moviehash: null,
  languages: ['en'],
}

describe('provider accounts', () => {
  test('three providers, off and without accounts; seeding again changes nothing', () => {
    const { accounts } = setup()
    accounts.seed()
    const list = accounts.list()
    expect(list.map((p) => [p.id, p.name, p.enabled, p.account])).toEqual([
      ['opensubtitles', 'OpenSubtitles.com', false, null],
      ['subdl', 'Subdl', false, null],
      ['subsource', 'SubSource', false, null],
    ])
    expect(list[0]?.attribution).toBe('Subtitles provided by OpenSubtitles.com')
    expect(list[1]).toMatchObject({ rateLimitMax: 2000, rateLimitRemaining: 2000 })
    expect(accounts.active()).toEqual([])
  })

  test('turning one on needs an account, and OpenSubtitles.com highsea’s key', async () => {
    const { accounts } = setup()
    expect(await reason(() => accounts.toggle('subdl', true))).toBe('conflict:no-account')
    accounts.save('subdl', { ...FAKE_ACCOUNTS.subdl })
    expect(accounts.toggle('subdl', true).enabled).toBe(true)
    expect(accounts.active()).toEqual(['subdl'])
    expect(accounts.toggle('subdl', false).enabled).toBe(false)

    const keyless = setup({ key: null })
    keyless.accounts.save('opensubtitles', { ...FAKE_ACCOUNTS.opensubtitles })
    expect(await reason(() => keyless.accounts.toggle('opensubtitles', true))).toBe(
      'conflict:no-app-key',
    )
    expect(keyless.accounts.get('opensubtitles').unavailable).toBe(NO_APP_KEY)
  })

  test('secrets are sealed, never listed, and a blank secret keeps the stored one', async () => {
    const { accounts, row } = setup()
    const view = accounts.save('opensubtitles', { ...FAKE_ACCOUNTS.opensubtitles })
    expect(view.account).toBe('highsea')
    expect(view.fields).toEqual([
      { key: 'username', secret: false, set: true, value: 'highsea' },
      { key: 'password', secret: true, set: true, value: null },
    ])
    expect(row('opensubtitles').credentials).not.toContain('fake-password')
    expect(JSON.stringify(accounts.list())).not.toContain('fake-password')

    accounts.save('opensubtitles', { username: 'someone', password: '' })
    expect(accounts.get('opensubtitles').account).toBe('someone')
    expect((await accounts.test('opensubtitles', { username: 'highsea', password: '' })).ok).toBe(
      true,
    )

    expect(await reason(() => accounts.save('subdl', { apiKey: ' ' }))).toBe('invalid:apiKey')
  })

  test('an API key shows masked', () => {
    const { accounts, row } = setup()
    expect(accounts.save('subsource', { ...FAKE_ACCOUNTS.subsource }).account).toBe('••••-key')
    expect(row('subsource').credentials).not.toContain('fake-subsource-key')
  })

  test('Test signs in without saving', async () => {
    const { accounts, row } = setup()
    const ok = await accounts.test('opensubtitles', { ...FAKE_ACCOUNTS.opensubtitles })
    expect(ok).toMatchObject({ ok: true, message: 'Signed in to OpenSubtitles.com.' })
    expect(ok.account?.account).toBe('highsea')
    expect(row('opensubtitles').credentials).toBeNull()

    const refused = await accounts.test('opensubtitles', { username: 'highsea', password: 'wrong' })
    expect(refused).toEqual({
      ok: false,
      message: 'OpenSubtitles.com refused the account. Check it and try again.',
      account: null,
    })
    expect((await accounts.test('subdl', { apiKey: 'wrong-key' })).ok).toBe(false)
    expect((await accounts.test('subdl')).message).toBe('Fill in every field.')
  })

  test('a 429 throttles the provider; it is skipped until the wait passes', async () => {
    const { accounts, fake, clock } = setup()
    accounts.save('subdl', { ...FAKE_ACCOUNTS.subdl })
    accounts.toggle('subdl', true)
    fake.misbehave('subdl', { kind: 'status', status: 429, retryAfter: '120' }, { times: 1 })
    const failed = await accounts.call('subdl', (p) => p.search(query)).catch((e) => e)
    expect(failed).toBeInstanceOf(ProviderError)
    expect((failed as ProviderError).kind).toBe('rate-limited')
    expect(accounts.get('subdl')).toMatchObject({
      throttleReason: 'rate-limited',
      rateLimitRemaining: 0,
    })
    expect(accounts.active()).toEqual([])

    const asked = fake.requests.length
    const skipped = await accounts.call('subdl', (p) => p.search(query)).catch((e) => e)
    expect((skipped as ProviderError).kind).toBe('rate-limited')
    expect(fake.requests.length).toBe(asked)

    clock.advance(121_000)
    expect(accounts.active()).toEqual(['subdl'])
    expect((await accounts.call('subdl', (p) => p.search(query))).length).toBeGreaterThan(0)
    expect(accounts.get('subdl').throttledUntil).toBeNull()
  })

  test('requests are counted for Subdl and SubSource, and start again the next day', async () => {
    const { accounts, clock } = setup()
    accounts.save('subdl', { ...FAKE_ACCOUNTS.subdl })
    accounts.toggle('subdl', true)
    await accounts.call('subdl', (p) => p.search(query))
    await accounts.call('subdl', (p) => p.search(query))
    expect(accounts.get('subdl')).toMatchObject({ rateLimitRemaining: 1998, rateLimitMax: 2000 })
    clock.advance(13 * HOUR)
    expect(accounts.get('subdl').rateLimitRemaining).toBe(2000)
    await accounts.call('subdl', (p) => p.search(query))
    expect(accounts.get('subdl').rateLimitRemaining).toBe(1999)
  })

  test('OpenSubtitles.com’s allowance comes from the sign-in, what’s left from each download', async () => {
    const { accounts } = setup()
    accounts.save('opensubtitles', { ...FAKE_ACCOUNTS.opensubtitles })
    accounts.toggle('opensubtitles', true)
    const results = await accounts.call('opensubtitles', (p) => p.search(query))
    expect(accounts.get('opensubtitles')).toMatchObject({ rateLimitMax: 20 })
    await accounts.call('opensubtitles', (p) => p.download(must(results[0])))
    expect(accounts.get('opensubtitles')).toMatchObject({
      rateLimitRemaining: 19,
      rateLimitMax: 20,
    })
  })

  test('System’s issues: a refused login and a provider out of downloads', async () => {
    const { accounts, fake, row, db } = setup()
    accounts.save('opensubtitles', { username: 'highsea', password: 'wrong' })
    accounts.toggle('opensubtitles', true)
    await accounts.call('opensubtitles', (p) => p.search(query)).catch(() => {})
    expect(row('opensubtitles').throttleReason).toBe('auth')
    expect(accounts.issues()).toEqual([
      expect.objectContaining({
        id: 'subtitles:opensubtitles:auth',
        level: 'warning',
        message: 'OpenSubtitles.com refused the password. Sign in again in Subtitles.',
      }),
    ])
    // saving the account again clears the wait
    accounts.save('opensubtitles', { ...FAKE_ACCOUNTS.opensubtitles })
    expect(accounts.issues()).toEqual([])

    fake.setRemaining(0)
    const results = await accounts.call('opensubtitles', (p) => p.search(query))
    const out = await accounts
      .call('opensubtitles', (p) => p.download(must(results[0])))
      .catch((e) => e)
    expect((out as ProviderError).kind).toBe('quota')
    const [issue] = accounts.issues()
    expect(issue).toMatchObject({ id: 'subtitles:opensubtitles:quota', level: 'notice' })
    expect(issue?.message).toMatch(
      /^OpenSubtitles\.com has no downloads left today\. They come back at \d\d:\d\d UTC\.$/,
    )
    // a provider that's off raises nothing
    db.update(schema.subtitleProviders).set({ enabled: false }).run()
    expect(accounts.issues()).toEqual([])
  })
})
