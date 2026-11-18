// SPDX-License-Identifier: AGPL-3.0-only
// Profiles over the API (Phase 5's A2b, ADR 0068): the account's own profile from the start; a
// phone and a TV on one account watching as different profiles at once, each with its own Continue
// watching, Next up, Watched and Home; PINs checked, never returned, and rested after five wrong;
// the account's own profile kept; a deleted profile's watch state gone with it; Now playing and its
// history naming the profile; and the audit log.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeClock } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { ApiError } from '@highsea-tv/sdk'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, film, tokenFor, withOwner } from './helpers.ts'

const SINTEL = 45745
const TEARS = 133701
const item = (id: number) => ({ type: 'movie' as const, id })

const dirs: string[] = []
afterEach(async () => {
  await cleanup()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function serve() {
  const clock = createFakeClock(Date.now())
  const runtime = await bootRuntime({ clock })
  const { owner } = await withOwner(runtime)
  const dir = mkdtempSync(join(tmpdir(), 'highsea-profiles-'))
  dirs.push(dir)
  film(runtime, dir, SINTEL, 'Sintel', 2010)
  film(runtime, dir, TEARS, 'Tears of Steel', 2012)
  const app = createApi(runtime)
  // two apps signed in to the one account: each a device of its own
  return {
    runtime,
    clock,
    owner,
    phone: clientFor(app, { token: tokenFor(runtime, owner.id) }),
    tv: clientFor(app, { token: tokenFor(runtime, owner.id) }),
  }
}

async function failure(call: Promise<unknown>) {
  try {
    await call
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('expected the call to fail')
}

describe('profiles', () => {
  test('an account starts with its own profile, named as it is, watching on every device', async () => {
    const { phone, owner } = await serve()
    expect(await phone.profiles.list()).toEqual({
      profiles: [{ id: owner.id, name: 'Ines', tone: 'accent', hasPin: false, main: true }],
      current: owner.id,
      max: 6,
    })
  })

  test('a phone and a TV on one account watch as different profiles at once', async () => {
    const { phone, tv, owner } = await serve()
    const theo = await phone.profiles.create({ body: { name: 'Theo', tone: 'info' } })
    expect(theo).toMatchObject({ name: 'Theo', tone: 'info', hasPin: false, main: false })
    expect((await tv.profiles.choose({ params: { id: theo.id }, body: {} })).current).toBe(theo.id)
    // the phone is still the account's own
    expect((await phone.profiles.list()).current).toBe(owner.id)

    // Theo watches half of Sintel and all of Tears of Steel on the TV
    await tv.playback.itemProgress({ params: item(SINTEL), body: { position: 50 } })
    await tv.playback.played({ params: item(TEARS) })

    const progress = async (api: typeof phone, id: number) => {
      const { item: it } = await api.library.item({ params: item(id) })
      return { progress: it.progress, watched: it.watched }
    }
    expect(await progress(tv, SINTEL)).toEqual({ progress: 0.5, watched: false })
    expect(await progress(tv, TEARS)).toEqual({ progress: null, watched: true })
    expect(await progress(phone, SINTEL)).toEqual({ progress: null, watched: false })
    expect(await progress(phone, TEARS)).toEqual({ progress: null, watched: false })

    // Continue watching on Home: Theo's on the TV, nothing on the phone
    const continuing = async (api: typeof phone) =>
      (await api.home.sections({ query: { client: 'web' } }))
        .find((r) => r.id === 'continue')
        ?.items.flatMap((m) => ('id' in m ? [m.id] : [])) ?? []
    expect(await continuing(tv)).toEqual([SINTEL])
    expect(await continuing(phone)).toEqual([])

    // the library's Watched marks, which its Watched filter reads, are the profile's
    const watchedIds = async (api: typeof phone) =>
      (await api.library.list({ query: { type: 'movie' } })).items.flatMap((m) =>
        'watched' in m && m.watched ? [m.id] : [],
      )
    expect(await watchedIds(tv)).toEqual([TEARS])
    expect(await watchedIds(phone)).toEqual([])

    // the account's own profile watches Sintel to the end on the phone: the TV's place stays
    await phone.playback.played({ params: item(SINTEL) })
    expect(await progress(tv, SINTEL)).toEqual({ progress: 0.5, watched: false })
    expect(await progress(phone, SINTEL)).toEqual({ progress: null, watched: true })

    // the player's picks are the profile's too
    await tv.playback.setPrefs({ params: item(SINTEL), body: { subtitleOffsetMs: 300 } })
    expect((await phone.playback.prefs({ params: item(SINTEL) })).subtitleOffsetMs).toBe(0)
    expect((await tv.playback.prefs({ params: item(SINTEL) })).subtitleOffsetMs).toBe(300)
  })

  test('Next up skips what the profile has watched, not what the account has', async () => {
    const { runtime, phone, tv } = await serve()
    const dir = mkdtempSync(join(tmpdir(), 'highsea-profiles-'))
    dirs.push(dir)
    // a third film in the collection, after Tears of Steel
    film(runtime, dir, 457_000, 'Cosmos Laundromat', 2015)
    const theo = await phone.profiles.create({ body: { name: 'Theo', tone: 'info' } })
    await tv.profiles.choose({ params: { id: theo.id }, body: {} })
    await phone.playback.played({ params: item(TEARS) })
    expect((await phone.playback.next({ params: item(SINTEL) })).item?.id).toBe(457_000)
    expect((await tv.playback.next({ params: item(SINTEL) })).item?.id).toBe(TEARS)
  })

  test('each profile arranges its own Home', async () => {
    const { phone, tv } = await serve()
    const theo = await phone.profiles.create({ body: { name: 'Theo', tone: 'info' } })
    await tv.profiles.choose({ params: { id: theo.id }, body: {} })
    await tv.home.saveLayout({ body: { order: [], hidden: ['recent'] } })
    expect((await tv.home.layout()).hidden).toEqual(['recent'])
    expect((await phone.home.layout()).hidden).toEqual([])
  })

  test('a PIN is checked, never returned, and five wrong rest the profile for a minute', async () => {
    const { phone, tv, clock, runtime } = await serve()
    const kids = await phone.profiles.create({ body: { name: 'Ruth', tone: 'success' } })
    const saved = await phone.profiles.update({ params: { id: kids.id }, body: { pin: '4321' } })
    expect(saved).toEqual({ id: kids.id, name: 'Ruth', tone: 'success', hasPin: true, main: false })
    const listed = JSON.stringify(await phone.profiles.list())
    expect(listed).not.toContain('4321')
    expect(listed).not.toContain('pin"')
    // kept as an Argon2id hash, as passwords are (ADR 0023)
    const row = runtime.db
      .select()
      .from(schema.profiles)
      .all()
      .find((p) => p.id === kids.id)
    expect(row?.pinHash).toStartWith('$argon2id$')

    // a shape that isn't four digits never reaches the check
    expect(
      (await failure(tv.profiles.choose({ params: { id: kids.id }, body: { pin: '12' } }))).code,
    ).toBe('invalid')
    // no PIN, then wrong ones
    const none = await failure(tv.profiles.choose({ params: { id: kids.id }, body: {} }))
    expect(none.status).toBe(403)
    expect(none.details).toEqual({ field: 'pin', reason: 'wrong-pin' })
    for (let i = 0; i < 3; i++) {
      const wrong = await failure(
        tv.profiles.choose({ params: { id: kids.id }, body: { pin: '0000' } }),
      )
      expect(wrong.details).toMatchObject({ reason: 'wrong-pin' })
    }
    const fifth = await failure(
      tv.profiles.choose({ params: { id: kids.id }, body: { pin: '0000' } }),
    )
    expect(fifth.status).toBe(429)
    expect(fifth.details).toEqual({ reason: 'rate-limited', retryAfter: 60 })
    // resting: even the right PIN waits
    clock.advance(30_000)
    const resting = await failure(
      tv.profiles.choose({ params: { id: kids.id }, body: { pin: '4321' } }),
    )
    expect(resting.status).toBe(429)
    expect(resting.details).toEqual({ reason: 'rate-limited', retryAfter: 30 })
    // a minute on, the right PIN
    clock.advance(30_000)
    expect(
      (await tv.profiles.choose({ params: { id: kids.id }, body: { pin: '4321' } })).current,
    ).toBe(kids.id)
    // the profile watching now needs no PIN again
    expect((await tv.profiles.choose({ params: { id: kids.id }, body: {} })).current).toBe(kids.id)
    // and the phone, which hasn't chosen it, still does
    expect(
      (await failure(phone.profiles.choose({ params: { id: kids.id }, body: {} }))).status,
    ).toBe(403)
    // turned off
    await phone.profiles.update({ params: { id: kids.id }, body: { pin: null } })
    expect((await phone.profiles.choose({ params: { id: kids.id }, body: {} })).current).toBe(
      kids.id,
    )
  })

  test('at most six; the account’s own stays; a deleted one takes its watch state', async () => {
    const { phone, tv, owner, runtime } = await serve()
    const theo = await phone.profiles.create({ body: { name: 'Theo', tone: 'info' } })
    for (const name of ['Ruth', 'Kids', 'Ana', 'Bo'])
      await phone.profiles.create({ body: { name, tone: 'warning' } })
    const full = await failure(phone.profiles.create({ body: { name: 'Seven', tone: 'danger' } }))
    expect(full.status).toBe(409)
    expect(full.details).toMatchObject({ reason: 'full' })

    const main = await failure(phone.profiles.delete({ params: { id: owner.id } }))
    expect(main.status).toBe(409)
    expect(main.details).toMatchObject({ reason: 'main' })

    await tv.profiles.choose({ params: { id: theo.id }, body: {} })
    await tv.playback.itemProgress({ params: item(SINTEL), body: { position: 50 } })
    await tv.playback.played({ params: item(TEARS) })
    await tv.playback.setPrefs({ params: item(SINTEL), body: { subtitleOffsetMs: 300 } })
    await phone.playback.played({ params: item(SINTEL) })
    const theirs = (
      t: typeof schema.watchHistory | typeof schema.watchPositions | typeof schema.playbackPrefs,
    ) =>
      runtime.db
        .select()
        .from(t)
        .all()
        .filter((r) => r.profileId === theo.id).length
    expect(theirs(schema.watchHistory)).toBe(1)
    expect(theirs(schema.watchPositions)).toBe(1)
    expect(theirs(schema.playbackPrefs)).toBe(1)

    await phone.profiles.delete({ params: { id: theo.id } })
    expect(theirs(schema.watchHistory)).toBe(0)
    expect(theirs(schema.watchPositions)).toBe(0)
    expect(theirs(schema.playbackPrefs)).toBe(0)
    // the account's own keeps its own
    expect((await phone.library.item({ params: item(SINTEL) })).item.watched).toBe(true)
    // the TV goes back to the account's own
    expect((await tv.profiles.list()).current).toBe(owner.id)
    expect(
      (await failure(phone.profiles.update({ params: { id: theo.id }, body: { name: 'T' } })))
        .status,
    ).toBe(404)
  })

  test('another account’s profiles can’t be seen, changed or chosen', async () => {
    const { phone, runtime, owner } = await serve()
    const theo = await phone.profiles.create({ body: { name: 'Theo', tone: 'info' } })
    const sam = await addMember(runtime, owner.id, 'Sam')
    const other = clientFor(createApi(runtime), { token: sam.token })
    expect((await other.profiles.list()).profiles.map((p) => p.name)).toEqual(['Sam'])
    expect(
      (await failure(other.profiles.choose({ params: { id: theo.id }, body: {} }))).status,
    ).toBe(404)
    expect((await failure(other.profiles.delete({ params: { id: theo.id } }))).status).toBe(404)
  })

  test('the audit log records a profile added, its PIN changed, and deleted', async () => {
    const { phone } = await serve()
    const theo = await phone.profiles.create({ body: { name: 'Theo', tone: 'info' } })
    await phone.profiles.update({ params: { id: theo.id }, body: { pin: '1234' } })
    await phone.profiles.update({ params: { id: theo.id }, body: { name: 'Theodore' } })
    await phone.profiles.update({ params: { id: theo.id }, body: { pin: null } })
    await phone.profiles.delete({ params: { id: theo.id } })
    const { items } = await phone.audit.list({ query: {} })
    const ours = items.filter((e) => e.targetType === 'profile').map((e) => e.action)
    expect(ours.sort()).toEqual(
      ['profile.create', 'profile.delete', 'profile.pin-off', 'profile.pin-set'].sort(),
    )
    expect(JSON.stringify(items)).not.toContain('1234')
  })

  test('Now playing and its history name the profile beside the account', async () => {
    const { phone, tv, clock } = await serve()
    const theo = await phone.profiles.create({ body: { name: 'Theo', tone: 'info' } })
    await tv.profiles.choose({ params: { id: theo.id }, body: {} })
    const s = await tv.playback.play({ params: item(SINTEL), body: {} })
    expect((await phone.sessions.list()).sessions[0]?.user).toMatchObject({
      displayName: 'Ines',
      profile: 'Theo',
    })
    clock.advance(30_000)
    await tv.playback.progress({ params: { id: s.id }, body: { position: 30, paused: false } })
    await tv.playback.stop({ params: { id: s.id } })
    const [row] = await phone.sessions.history({ query: {} })
    expect(row?.user).toMatchObject({ displayName: 'Ines', profile: 'Theo' })
  })
})
