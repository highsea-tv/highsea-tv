// SPDX-License-Identifier: AGPL-3.0-only
// What every media type shares: names, root folders, profiles, formats and sizes. The movie
// library stands in for a media type where a test needs titles filed (../movies/helpers.ts).
import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { fold, matchScore, safeName, sortTitleOf } from '../../src/shared/index.ts'
import { reason, SINTEL, setup } from '../movies/helpers.ts'

let cleanups: (() => void)[] = []
async function start() {
  const s = await setup()
  cleanups.push(s.cleanup)
  return s
}
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

describe('names', () => {
  test('sort titles drop an English article and fold accents', () => {
    expect(sortTitleOf('The Matrix')).toBe('matrix')
    expect(sortTitleOf('A Trip to the Moon')).toBe('trip to the moon')
    expect(sortTitleOf('An American Werewolf in London')).toBe('american werewolf in london')
    expect(sortTitleOf('Amélie')).toBe('amelie')
    expect(sortTitleOf('The')).toBe('the')
    expect(fold('  Ça  Va ')).toBe('ca va')
  })

  test('folder names lose what common filesystems forbid', () => {
    expect(safeName('Mission: Impossible (1996)')).toBe('Mission Impossible (1996)')
    expect(safeName('What? / Why*')).toBe('What Why')
    expect(safeName('Trailing dots...')).toBe('Trailing dots')
    expect(safeName('???')).toBe('Untitled')
  })

  test('search ranks a match at a word above one inside a word', () => {
    expect(matchScore('The Big Lebowski', 'big')).toBe(2)
    expect(matchScore('Ambiguous', 'big')).toBe(1)
    expect(matchScore('Sintel', 'big')).toBe(0)
  })
})

describe('root folders', () => {
  test('adding checks the path; the list reads the disk', async () => {
    const { media, dir, folder } = await start()
    expect(await reason(() => media.rootFolders.add('relative/path'))).toBe('invalid:not-absolute')
    expect(await reason(() => media.rootFolders.add(join(dir, 'missing')))).toBe(
      'invalid:not-found',
    )
    writeFileSync(join(dir, 'file'), 'x')
    expect(await reason(() => media.rootFolders.add(join(dir, 'file')))).toBe('invalid:not-found')
    const locked = join(dir, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0o555)
    // root may write anywhere: the check only means something for other users
    if (process.getuid?.() !== 0)
      expect(await reason(() => media.rootFolders.add(locked))).toBe('invalid:not-writable')
    chmodSync(locked, 0o755)
    expect(await reason(() => media.rootFolders.add(folder.path))).toBe('conflict:exists')
    mkdirSync(join(folder.path, 'inner'))
    expect(await reason(() => media.rootFolders.add(join(folder.path, 'inner')))).toBe(
      'conflict:overlaps',
    )
    expect(await reason(() => media.rootFolders.add(dir))).toBe('conflict:overlaps')

    const [listed] = media.rootFolders.list()
    expect(listed).toMatchObject({ id: folder.id, path: folder.path, accessible: true, movies: 0 })
    expect(listed?.free).toBeGreaterThan(0)
    expect(listed?.total).toBeGreaterThanOrEqual(listed?.free ?? 0)
    expect(listed?.device).toEqual(expect.any(String))
  })

  test('a folder in use can’t be removed; an unused one can', async () => {
    const { media, add, folder, dir } = await start()
    await add(SINTEL)
    expect(media.rootFolders.list()[0]?.movies).toBe(1)
    expect(await reason(() => media.rootFolders.remove(folder.id))).toBe('conflict:in-use')
    try {
      media.rootFolders.remove(folder.id)
    } catch (e) {
      expect((e as Error).message).toBe('A movie is filed under that folder. Move it first.')
      expect((e as AppError).details).toEqual({ reason: 'in-use', counts: { movie: 1 } })
    }
    const other = join(dir, 'other')
    mkdirSync(other)
    const added = media.rootFolders.add(other)
    media.rootFolders.remove(added.id)
    expect(media.rootFolders.list().map((f) => f.path)).toEqual([folder.path])
    expect(await reason(() => media.rootFolders.remove('rf_nope'))).toBe('not-found:undefined')
  })

  test('a folder that went away reads as inaccessible', async () => {
    const { media, dir } = await start()
    const gone = join(dir, 'gone')
    mkdirSync(gone)
    media.rootFolders.add(gone)
    const { rmSync } = await import('node:fs')
    rmSync(gone, { recursive: true })
    expect(media.rootFolders.list().find((f) => f.path === gone)).toMatchObject({
      accessible: false,
      free: null,
      device: null,
    })
  })
})

describe('profiles, formats, sizes and language profiles', () => {
  test('seeds are idempotent and never overwrite the owner’s', async () => {
    const { media, db } = await start()
    expect(media.profiles.list().map((p) => p.id)).toEqual(['qp-uhd', 'qp-hd', 'qp-any'])
    expect(
      media
        .customFormats()
        .map((f) => f.id)
        .sort(),
    ).toEqual(['cf-dv', 'cf-hdr10', 'cf-lq', 'cf-x265'])
    media.seed()
    expect(media.profiles.list()).toHaveLength(3)
    // the owner renames one and removes another: seeding again leaves both alone
    db.update(schema.qualityProfiles)
      .set({ data: { ...media.profiles.get('qp-hd'), name: 'Mine' } })
      .where(eq(schema.qualityProfiles.id, 'qp-hd'))
      .run()
    db.delete(schema.qualityProfiles).where(eq(schema.qualityProfiles.id, 'qp-any')).run()
    media.seed()
    expect(media.profiles.list().map((p) => [p.id, p.name])).toEqual([
      ['qp-uhd', expect.any(String)],
      ['qp-hd', 'Mine'],
    ])
    expect(await reason(() => media.profiles.get('qp-any'))).toBe(
      'not-found:unknown-quality-profile',
    )
  })

  test('quality sizes come from the settings row, defaults filling gaps', async () => {
    const { media, db } = await start()
    const sizes = media.qualitySizes()
    expect(sizes[0]?.quality).toBe('Unknown')
    expect(sizes.find((s) => s.quality === 'Bluray-1080p')?.min).toBe(50.8)
    db.update(schema.settings)
      .set({ value: [{ quality: 'Bluray-1080p', min: 10, preferred: 20, max: 30 }] })
      .where(eq(schema.settings.key, 'qualitySizes'))
      .run()
    media.seed()
    const after = media.qualitySizes()
    expect(after).toHaveLength(sizes.length)
    expect(after.find((s) => s.quality === 'Bluray-1080p')).toEqual({
      quality: 'Bluray-1080p',
      min: 10,
      preferred: 20,
      max: 30,
    })
    expect(after.find((s) => s.quality === 'Remux-2160p')?.min).toBe(187.4)
  })

  test('seeded profiles are built in; the owner’s aren’t', async () => {
    const { media } = await start()
    expect(media.profiles.list().map((p) => p.builtIn)).toEqual([true, true, true])
    const hd = media.profiles.get('qp-hd')
    const { id: _, builtIn: __, ...input } = hd
    const mine = media.profiles.add({ ...input, name: 'Mine', waitMinutes: 60 })
    expect(mine.builtIn).toBe(false)
    expect(mine.waitMinutes).toBe(60)
    expect(media.profiles.list().map((p) => p.id)).toEqual(['qp-uhd', 'qp-hd', 'qp-any', mine.id])
  })

  test('saving a profile checks it, names it once, and drops scores for formats that are gone', async () => {
    const { media } = await start()
    const { id: _, builtIn: __, ...hd } = media.profiles.get('qp-hd')
    expect(await reason(() => media.profiles.save('qp-hd', { ...hd, cutoff: 'Remux-2160p' }))).toBe(
      'invalid:invalid',
    )
    expect(await reason(() => media.profiles.save('qp-hd', { ...hd, name: ' ultra hd ' }))).toBe(
      'conflict:name-taken',
    )
    expect(await reason(() => media.profiles.save('qp-nope', hd))).toBe(
      'not-found:unknown-quality-profile',
    )
    const saved = media.profiles.save('qp-hd', {
      ...hd,
      // a short list comes back with every other quality, not allowed
      items: [{ name: 'Bluray-1080p', allowed: true, qualities: ['Bluray-1080p'] }],
      formats: [
        { formatId: 'cf-x265', score: 50 },
        { formatId: 'cf-gone', score: 10 },
        { formatId: 'cf-lq', score: 0 },
      ],
    })
    expect(saved.builtIn).toBe(true)
    expect(saved.items[0]).toEqual({
      name: 'Bluray-1080p',
      allowed: true,
      qualities: ['Bluray-1080p'],
    })
    expect(saved.items.flatMap((i) => i.qualities)).toHaveLength(30)
    expect(saved.formats).toEqual([{ formatId: 'cf-x265', score: 50 }])
  })

  test('a profile a movie uses, or the last one, can’t be deleted', async () => {
    const { media, movies, input } = await start()
    await movies.add(input(SINTEL))
    expect(await reason(() => media.profiles.remove('qp-hd'))).toBe('conflict:in-use')
    media.profiles.remove('qp-any')
    media.profiles.remove('qp-uhd')
    expect(media.profiles.list().map((p) => p.id)).toEqual(['qp-hd'])
  })

  test('the last profile left can’t be deleted', async () => {
    const { media } = await start()
    media.profiles.remove('qp-any')
    media.profiles.remove('qp-uhd')
    expect(await reason(() => media.profiles.remove('qp-hd'))).toBe('conflict:last-profile')
  })

  test('the order is saved whole', async () => {
    const { media } = await start()
    expect(await reason(() => media.profiles.order(['qp-hd']))).toBe('invalid:invalid')
    expect(media.profiles.order(['qp-any', 'qp-hd', 'qp-uhd']).map((p) => p.id)).toEqual([
      'qp-any',
      'qp-hd',
      'qp-uhd',
    ])
  })

  test('saving a preset makes it the owner’s, and the presets’ updates leave it alone', async () => {
    const { media, db } = await start()
    // a release that brings a newer preset: the seeded rows that aren't edited follow it
    for (const id of ['cf-dv', 'cf-hdr10'])
      db.update(schema.customFormats)
        .set({ conditions: [] })
        .where(eq(schema.customFormats.id, id))
        .run()
    const dv = media.customFormats.get('cf-dv')
    media.customFormats.save('cf-hdr10', {
      name: 'HDR, mine',
      conditions: [
        { kind: 'title', name: 'HDR', value: '\\bHDR\\b', negate: false, required: false },
      ],
    })
    media.seed()
    expect(media.customFormats.get('cf-dv').conditions.length).toBeGreaterThan(0)
    expect(media.customFormats.get('cf-dv').edited).toBe(false)
    expect(dv.source).toBe('preset')
    const mine = media.customFormats.get('cf-hdr10')
    expect(mine).toMatchObject({ name: 'HDR, mine', source: 'preset', edited: true })
    expect(mine.conditions).toHaveLength(1)
  })

  test('a format is checked, named once, and its scores go with it', async () => {
    const { media } = await start()
    const title = (value: string) =>
      ({ kind: 'title', name: 'x', value, negate: false, required: false }) as const
    expect(
      await reason(() => media.customFormats.add({ name: 'Broken', conditions: [title('(')] })),
    ).toBe('invalid:invalid')
    expect(
      await reason(() => media.customFormats.add({ name: 'x265', conditions: [title('x')] })),
    ).toBe('conflict:name-taken')
    const added = media.customFormats.add({ name: 'IMAX', conditions: [title('\\bIMAX\\b')] })
    expect(added).toMatchObject({ source: 'custom', trashId: null, edited: false })
    media.customFormats.remove('cf-x265')
    expect(media.profiles.list().some((p) => p.formats.some((f) => f.formatId === 'cf-x265'))).toBe(
      false,
    )
    expect(await reason(() => media.customFormats.remove('cf-x265'))).toBe(
      'not-found:unknown-custom-format',
    )
  })

  test('sizes are saved whole and checked', async () => {
    const { media } = await start()
    const sizes = media.qualitySizes()
    expect(await reason(() => media.qualitySizes.save(sizes.slice(1)))).toBe('invalid:invalid')
    const bad = sizes.map((s) => (s.quality === 'Bluray-1080p' ? { ...s, min: 10, max: 5 } : s))
    expect(await reason(() => media.qualitySizes.save(bad))).toBe('invalid:invalid')
    const good = sizes.map((s) =>
      s.quality === 'Bluray-1080p' ? { ...s, min: 10, preferred: null, max: null } : s,
    )
    media.qualitySizes.save(good)
    expect(media.qualitySizes().find((s) => s.quality === 'Bluray-1080p')).toEqual({
      quality: 'Bluray-1080p',
      min: 10,
      preferred: null,
      max: null,
    })
  })
})
