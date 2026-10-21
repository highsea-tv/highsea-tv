// SPDX-License-Identifier: AGPL-3.0-only
// What every media type shares: names, root folders, profiles, formats and sizes. The movie
// library stands in for a media type where a test needs titles filed (../movies/helpers.ts).
import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppError } from '@highsea/core'
import { schema } from '@highsea/db'
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
})
