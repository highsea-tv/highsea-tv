// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createFakeClock } from '@highsea/core'
import { migrate, openDatabase, schema } from '@highsea/db'
import {
  createProfiles,
  cutoffMet,
  fills,
  missing,
  newRule,
  SEEDED_PROFILE_ID,
  wantsOf,
} from '../../src/shared/profiles.ts'
import type { LanguageProfile, LanguageRule } from '../../src/shared/types.ts'
import { reason } from '../movies/helpers.ts'
import { must } from '../must.ts'

const rule = (
  code: string,
  forced: LanguageRule['forced'] = 'no',
  hi: LanguageRule['hi'] = 'no',
): LanguageRule => ({
  code,
  forced,
  hi,
})
const track = (language: string, forced = false, hi = false) => ({ language, forced, hi })
const label = (w: { language: string; forced: boolean; hi: boolean }) =>
  `${w.language}${w.forced ? '.forced' : ''}${w.hi ? '.sdh' : ''}`

describe('what a rule wants', () => {
  test('Regular only, Regular and forced, Forced only', () => {
    expect(wantsOf(rule('en', 'no')).map(label)).toEqual(['en'])
    expect(wantsOf(rule('en', 'also')).map(label)).toEqual(['en', 'en.forced'])
    expect(wantsOf(rule('en', 'only')).map(label)).toEqual(['en.forced'])
    expect(wantsOf(rule('en', 'no', 'only')).map(label)).toEqual(['en.sdh'])
  })

  test('the SDH setting decides what fills a want', () => {
    const no = must(wantsOf(rule('en', 'no', 'no'))[0])
    const also = must(wantsOf(rule('en', 'no', 'also'))[0])
    const only = must(wantsOf(rule('en', 'no', 'only'))[0])
    expect([fills(track('en'), no), fills(track('en', false, true), no)]).toEqual([true, false])
    expect([fills(track('en'), also), fills(track('en', false, true), also)]).toEqual([true, true])
    expect([fills(track('en'), only), fills(track('en', false, true), only)]).toEqual([false, true])
    expect(fills(track('en', true), no)).toBe(false)
    expect(fills(track('fr'), no)).toBe(false)
  })

  test('a base language track fills a regional want', () => {
    const w = must(wantsOf(rule('pt-BR'))[0])
    expect(fills(track('pt'), w)).toBe(true)
  })
})

describe('the cutoff', () => {
  const profile: LanguageProfile = {
    id: 'p',
    name: 'p',
    languages: [rule('en', 'also'), rule('de'), rule('fr')],
    cutoff: 'en',
    minScore: 80,
  }

  test('nothing present: every language', () => {
    expect(cutoffMet(profile, [])).toBe(false)
    expect(missing(profile, []).map(label)).toEqual(['en', 'en.forced', 'de', 'fr'])
  })

  test('once the cutoff language is present, only its own wants remain', () => {
    expect(cutoffMet(profile, [track('en')])).toBe(true)
    expect(missing(profile, [track('en')]).map(label)).toEqual(['en.forced'])
    expect(missing(profile, [track('en'), track('en', true)])).toEqual([])
  })

  test('another language present does not stop the search', () => {
    expect(missing(profile, [track('de')]).map(label)).toEqual(['en', 'en.forced', 'fr'])
  })

  test('no cutoff: every language until each is present', () => {
    const p = { ...profile, cutoff: null }
    expect(cutoffMet(p, [track('en')])).toBe(false)
    expect(missing(p, [track('en')]).map(label)).toEqual(['en.forced', 'de', 'fr'])
  })
})

describe('the profiles table', () => {
  const setup = () => {
    const { db, raw } = openDatabase(':memory:')
    migrate(raw)
    const clock = createFakeClock()
    const profiles = createProfiles({ db, clock })
    profiles.seed()
    return { db, clock, profiles }
  }
  const input = (patch = {}) => ({
    name: 'German',
    languages: [rule('de')],
    cutoff: 'de',
    minScore: 70,
    ...patch,
  })

  test('seeding is idempotent and keeps the owner’s edits', () => {
    const { profiles } = setup()
    expect(profiles.list()).toEqual([
      {
        id: SEEDED_PROFILE_ID,
        name: 'English',
        languages: [rule('en', 'also')],
        cutoff: 'en',
        minScore: 80,
      },
    ])
    profiles.save(input({ name: 'Mine' }), SEEDED_PROFILE_ID)
    profiles.seed()
    expect(profiles.list()).toHaveLength(1)
    expect(profiles.get(SEEDED_PROFILE_ID).name).toBe('Mine')
  })

  test('create, read and update', () => {
    const { profiles } = setup()
    const p = profiles.save(input())
    expect(p).toMatchObject(input())
    expect(profiles.save(input({ minScore: 50 }), p.id).minScore).toBe(50)
    expect(profiles.list().map((x) => x.name)).toEqual(['English', 'German'])
  })

  test('invalid profiles are refused', async () => {
    const { profiles } = setup()
    expect(await reason(() => profiles.save(input({ languages: [rule('de'), rule('de')] })))).toBe(
      'invalid:languages',
    )
    expect(await reason(() => profiles.save(input({ cutoff: 'fr' })))).toBe('invalid:cutoff')
    expect(await reason(() => profiles.save(input({ languages: [rule('xx')] })))).toBe(
      'invalid:languages',
    )
    expect(await reason(() => profiles.save(input({ languages: [] })))).toBe('invalid:languages')
    expect(await reason(() => profiles.save(input({ name: ' ' })))).toBe('invalid:name')
    expect(await reason(() => profiles.save(input({ name: 'English' })))).toBe(
      'conflict:duplicate-name',
    )
    expect(await reason(() => profiles.save(input(), 'lp-nope'))).toBe(
      'not-found:unknown-language-profile',
    )
  })

  test('a profile in use, or the last one, can’t be deleted', async () => {
    const { db, profiles } = setup()
    const p = profiles.save(input())
    db.insert(schema.mediaItems)
      .values({
        id: 'itm1',
        type: 'movie',
        tmdbId: 1,
        title: 'A',
        sortTitle: 'a',
        status: 'available',
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'qp-hd',
        languageProfileId: p.id,
        rootFolder: '/m',
        path: '/m/a',
        addedAt: 0,
        updatedAt: 0,
      })
      .run()
    expect(profiles.uses(p.id)).toBe(1)
    expect(await reason(() => profiles.remove(p.id))).toBe('conflict:in-use')
    profiles.remove(SEEDED_PROFILE_ID)
    db.delete(schema.mediaItems).run()
    expect(await reason(() => profiles.remove(p.id))).toBe('conflict:last-profile')
  })

  test('a profile removed stops being a root folder’s default (checkpoint 8c)', () => {
    const { db, profiles } = setup()
    const p = profiles.save(input())
    db.insert(schema.rootFolders)
      .values({ id: 'rf1', path: '/m', languageProfileId: p.id, createdAt: 0 })
      .run()
    profiles.remove(p.id)
    expect(db.select().from(schema.rootFolders).get()?.languageProfileId).toBeNull()
  })

  test('setup’s languages go into lp-en, named after them', () => {
    const { profiles } = setup()
    const p = profiles.fromSetup(['en', 'pt'])
    expect(p).toEqual({
      id: SEEDED_PROFILE_ID,
      name: 'English and Portuguese',
      languages: [newRule('en'), newRule('pt')],
      cutoff: 'en',
      minScore: 80,
    })
    expect(newRule('de')).toEqual({ code: 'de', forced: 'also', hi: 'no' })
  })
})
