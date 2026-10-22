// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { seedFormats } from '../src/presets.ts'
import {
  completeItems,
  holdUntil,
  isAllowed,
  item,
  meetsCutoff,
  preference,
  type QualityProfile,
  qualityProfileSchema,
  seedProfiles,
} from '../src/profiles.ts'
import { QUALITY_NAMES } from '../src/qualities.ts'
import {
  defaultQualitySizes,
  qualitySizeSchema,
  qualitySizesSchema,
  sizeLimits,
  UNKNOWN_RUNTIME_MINUTES,
} from '../src/sizes.ts'

const [uhd, hd, any] = seedProfiles()

describe('seeded profiles', () => {
  test('are the prototype’s, valid, with every quality once', () => {
    expect(seedProfiles().map((p) => [p.id, p.name, p.cutoff])).toEqual([
      ['qp-uhd', 'Ultra HD', 'WEB 2160p'],
      ['qp-hd', 'HD 1080p', 'Bluray-1080p'],
      ['qp-any', 'Any', 'WEB 1080p'],
    ])
    for (const p of seedProfiles()) {
      expect(qualityProfileSchema.parse(p)).toEqual(p)
      expect(p.items.flatMap((i) => i.qualities).sort()).toEqual([...QUALITY_NAMES].sort())
    }
  })

  test('allow what the prototype shows, highest first', () => {
    const allowed = (p: typeof hd) => p?.items.filter((i) => i.allowed).map((i) => i.name)
    expect(allowed(uhd)).toEqual(['Remux-2160p', 'Bluray-2160p', 'WEB 2160p'])
    expect(allowed(hd)).toEqual(['Bluray-1080p', 'WEB 1080p', 'HDTV-1080p'])
    expect(allowed(any)).toEqual(['WEB 1080p', 'WEB 720p', 'DVD'])
  })

  test('score only seeded formats', () => {
    const ids = new Set(seedFormats().map((f) => f.id))
    for (const p of seedProfiles())
      for (const f of p.formats) expect(ids.has(f.formatId)).toBe(true)
  })
})

describe('profile rules', () => {
  test('groups are equal and order is preference', () => {
    if (!hd) throw new Error('no seed')
    expect(preference(hd, 'WEBDL-1080p')).toBe(preference(hd, 'WEBRip-1080p'))
    expect(preference(hd, 'Bluray-1080p')).toBeGreaterThan(preference(hd, 'WEBDL-1080p'))
    expect(isAllowed(hd, 'WEBRip-1080p')).toBe(true)
    expect(isAllowed(hd, 'WEBDL-720p')).toBe(false)
    expect(meetsCutoff(hd, 'Bluray-1080p')).toBe(true)
    expect(meetsCutoff(hd, 'WEBDL-1080p')).toBe(false)
  })

  test('qualities a profile leaves out rank below those it lists', () => {
    const short = { items: [item('DVD', true)] }
    expect(preference(short, 'Remux-2160p')).toBeLessThan(preference(short, 'DVD'))
    expect(preference(short, 'Remux-2160p')).toBeGreaterThan(preference(short, 'CAM'))
  })

  test('completeItems keeps a split WEB group’s missing half', () => {
    const items = completeItems([
      { name: 'WEBDL-1080p', allowed: true, qualities: ['WEBDL-1080p'] },
    ])
    expect(items.flatMap((i) => i.qualities)).toHaveLength(QUALITY_NAMES.length)
    expect(items.find((i) => i.name === 'WEBRip-1080p')).toBeDefined()
    expect(items.find((i) => i.name === 'WEB 720p')?.qualities).toEqual([
      'WEBDL-720p',
      'WEBRip-720p',
    ])
  })

  test('the schema refuses a bad profile', () => {
    const base = { ...hd }
    const issues = (p: unknown) =>
      qualityProfileSchema.safeParse(p).error?.issues.map((i) => i.message) ?? []
    expect(issues({ ...base, cutoff: 'WEB 720p' })).toContain('The cutoff must be allowed')
    expect(issues({ ...base, cutoff: 'Nothing' })).toContain('The cutoff must be allowed')
    expect(
      issues({ ...base, items: [...(hd?.items ?? []), item('Bluray-1080p', false)] }),
    ).toContain('Bluray-1080p appears twice')
    expect(
      issues({ ...base, items: [{ name: 'Blu', allowed: true, qualities: ['Bluray-1080p'] }] }),
    ).toContain('A single quality is named after itself')
    expect(
      issues({ ...base, formats: [...(hd?.formats ?? []), { formatId: 'cf-lq', score: 1 }] }),
    ).toContain('A format is scored twice')
    expect(issues({ ...base, language: 'english' }).length).toBeGreaterThan(0)
    expect(issues({ ...base, language: 'fr' })).toEqual([])
    expect(issues({ ...base, minUpgradeFormatScore: 0 }).length).toBeGreaterThan(0)
  })
})

describe('sizes', () => {
  test('defaults: one row per quality, TRaSH’s minimums, no upper limit', () => {
    const sizes = defaultQualitySizes()
    expect(qualitySizesSchema.parse(sizes)).toEqual(sizes)
    expect(sizes.map((s) => s.quality)).toEqual([...QUALITY_NAMES])
    expect(sizes.find((s) => s.quality === 'Bluray-1080p')).toEqual({
      quality: 'Bluray-1080p',
      min: 50.8,
      preferred: null,
      max: null,
    })
    expect(sizes.find((s) => s.quality === 'DVD')?.min).toBe(0)
  })

  test('limits are MiB per minute times the runtime, or 110 minutes', () => {
    const rows = [{ quality: 'Bluray-1080p' as const, min: 10, preferred: 50, max: 100 }]
    expect(sizeLimits(rows, 'Bluray-1080p', 120)).toEqual({
      min: 10 * 1024 * 1024 * 120,
      preferred: 50 * 1024 * 1024 * 120,
      max: 100 * 1024 * 1024 * 120,
      minutes: 120,
      assumed: false,
    })
    expect(sizeLimits(rows, 'Bluray-1080p', null)).toMatchObject({
      minutes: UNKNOWN_RUNTIME_MINUTES,
      assumed: true,
    })
    expect(sizeLimits(rows, 'Bluray-1080p', 0).assumed).toBe(true)
    expect(sizeLimits(rows, 'DVD', 120)).toMatchObject({ min: 0, preferred: null, max: null })
  })

  test('the schema refuses rows out of order or twice', () => {
    expect(
      qualitySizeSchema.safeParse({ quality: 'DVD', min: 5, preferred: null, max: 4 }).success,
    ).toBe(false)
    expect(
      qualitySizeSchema.safeParse({ quality: 'DVD', min: 5, preferred: 3, max: null }).success,
    ).toBe(false)
    const row = { quality: 'DVD', min: 1, preferred: null, max: null }
    expect(qualitySizesSchema.safeParse([row, row]).success).toBe(false)
  })
})

describe('wait before grabbing (Radarr’s delay profiles)', () => {
  const now = Date.UTC(2026, 9, 21, 12)
  const hour = 3_600_000
  const base = seedProfiles()[1] as QualityProfile
  const waiting = { ...base, waitMinutes: 120 }
  const at = (ms: number) => new Date(ms).toISOString()

  test('defaults to no wait', () => {
    const { waitMinutes: _, ...rest } = base
    expect(qualityProfileSchema.parse(rest).waitMinutes).toBe(0)
    expect(holdUntil(base, { quality: 'WEBDL-1080p', publishedAt: at(now) }, now)).toBeNull()
  })

  test('holds a release until its upload time plus the wait', () => {
    expect(holdUntil(waiting, { quality: 'WEBDL-1080p', publishedAt: at(now - hour) }, now)).toBe(
      now + hour,
    )
  })

  test('the clock runs from the upload, so an older release goes at once', () => {
    expect(
      holdUntil(waiting, { quality: 'WEBDL-1080p', publishedAt: at(now - 3 * hour) }, now),
    ).toBeNull()
  })

  test('the most preferred allowed quality bypasses the wait', () => {
    expect(holdUntil(waiting, { quality: 'Bluray-1080p', publishedAt: now }, now)).toBeNull()
  })

  test('a release with no upload time isn’t held', () => {
    expect(holdUntil(waiting, { quality: 'WEBDL-1080p', publishedAt: null }, now)).toBeNull()
  })

  test('is at most a week', () => {
    expect(qualityProfileSchema.safeParse({ ...base, waitMinutes: 7 * 24 * 60 + 1 }).success).toBe(
      false,
    )
  })
})
