// SPDX-License-Identifier: AGPL-3.0-only
// The folder picker's listing (HT-91): folders only, inside the allowed folders once `..` and
// symlinks are resolved, never the config folder, and each state the picker shows by its reason.
import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppError } from '@highsea-tv/core'
import { browseFolders, MAX_FOLDERS } from '../src/browse.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) {
    chmodSync(d, 0o755)
    rmSync(d, { recursive: true, force: true })
  }
})

/** A data folder with media inside, a config folder inside it too, and a folder beside it. */
function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-folders-'))
  dirs.push(dir)
  const data = join(dir, 'data')
  const config = join(data, 'config')
  const elsewhere = join(dir, 'elsewhere')
  for (const f of ['media/movies', 'media/tv', 'media/Music', 'downloads', 'config/keys', '.cache'])
    mkdirSync(join(data, f), { recursive: true })
  mkdirSync(join(elsewhere, 'secrets'), { recursive: true })
  writeFileSync(join(data, 'media', 'notes.txt'), 'a file')
  return { dir, data, config, elsewhere }
}

const reasonOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof AppError)
      return { code: e.code, reason: (e.details as { reason: string }).reason }
    throw e
  }
  throw new Error('expected a refusal')
}

describe('browseFolders', () => {
  test('lists folders only, sorted by name, hidden ones and the config folder left out', () => {
    const { data, config } = tree()
    const top = browseFolders([data], [config], undefined)
    expect(top).toMatchObject({ path: data, root: data, parent: null, more: 0, writable: true })
    expect(top.folders.map((f) => f.name)).toEqual(['downloads', 'media'])
    const media = browseFolders([data], [config], join(data, 'media'))
    // case aside, and no file
    expect(media.folders.map((f) => f.name)).toEqual(['movies', 'Music', 'tv'])
    expect(media.parent).toBe(data)
    expect(media.folders[0]?.path).toBe(join(data, 'media', 'movies'))
  })

  test('sorts numbers as numbers and cuts a very long folder, saying how many are left', () => {
    const { data, config } = tree()
    const many = join(data, 'many')
    for (const n of [10, 2, 1]) mkdirSync(join(many, `Film ${n}`), { recursive: true })
    expect(browseFolders([data], [config], many).folders.map((f) => f.name)).toEqual([
      'Film 1',
      'Film 2',
      'Film 10',
    ])
    for (let i = 0; i < MAX_FOLDERS + 2; i++) mkdirSync(join(many, `x${i}`))
    const cut = browseFolders([data], [config], many)
    expect(cut.folders).toHaveLength(MAX_FOLDERS)
    expect(cut.more).toBe(5)
  })

  test('refuses a path outside, `..` and all', () => {
    const { data, config, elsewhere } = tree()
    expect(reasonOf(() => browseFolders([data], [config], elsewhere))).toEqual({
      code: 'forbidden',
      reason: 'outside',
    })
    expect(reasonOf(() => browseFolders([data], [config], join(data, '..', 'elsewhere')))).toEqual({
      code: 'forbidden',
      reason: 'outside',
    })
    expect(reasonOf(() => browseFolders([data], [config], '/etc'))).toMatchObject({
      reason: 'outside',
    })
    expect(reasonOf(() => browseFolders([data], [config], 'media'))).toMatchObject({
      reason: 'outside',
    })
    // `..` inside is fine once resolved
    expect(browseFolders([data], [config], join(data, 'media', '..', 'downloads')).path).toBe(
      join(data, 'downloads'),
    )
  })

  test('never the config folder, even inside the data folder', () => {
    const { data, config } = tree()
    expect(reasonOf(() => browseFolders([data], [config], config))).toMatchObject({
      reason: 'outside',
    })
    expect(reasonOf(() => browseFolders([data], [config], join(config, 'keys')))).toMatchObject({
      reason: 'outside',
    })
    expect(browseFolders([data], [config], join(data, 'media')).parent).toBe(data)
  })

  test('a symlink out of the folders is refused; one that stays inside is listed and opens', () => {
    const { data, config, elsewhere } = tree()
    symlinkSync(elsewhere, join(data, 'media', 'out'))
    symlinkSync(join(data, 'media', 'movies'), join(data, 'films'))
    symlinkSync(config, join(data, 'settings'))
    const top = browseFolders([data], [config], undefined)
    // the link to the config folder isn't offered; the one outside is, but won't open
    expect(top.folders.map((f) => f.name)).toEqual(['downloads', 'films', 'media'])
    expect(reasonOf(() => browseFolders([data], [config], join(data, 'media', 'out')))).toEqual({
      code: 'forbidden',
      reason: 'outside',
    })
    expect(
      reasonOf(() => browseFolders([data], [config], join(data, 'media', 'out', 'secrets'))),
    ).toMatchObject({ reason: 'outside' })
    expect(reasonOf(() => browseFolders([data], [config], join(data, 'settings')))).toMatchObject({
      reason: 'outside',
    })
    expect(browseFolders([data], [config], join(data, 'films')).path).toBe(join(data, 'films'))
  })

  test('a folder that isn’t there, or is a file, is missing', () => {
    const { data, config } = tree()
    expect(reasonOf(() => browseFolders([data], [config], join(data, 'gone')))).toEqual({
      code: 'not-found',
      reason: 'missing',
    })
    expect(
      reasonOf(() => browseFolders([data], [config], join(data, 'media', 'notes.txt'))),
    ).toEqual({ code: 'not-found', reason: 'missing' })
  })

  // root reads anything, so the permission check means nothing as root
  test.skipIf(process.getuid?.() === 0)(
    'a folder highsea can’t read says so, and a read-only one',
    () => {
      const { data, config } = tree()
      const locked = join(data, 'locked')
      mkdirSync(locked)
      chmodSync(locked, 0o000)
      try {
        expect(reasonOf(() => browseFolders([data], [config], locked))).toEqual({
          code: 'forbidden',
          reason: 'unreadable',
        })
      } finally {
        chmodSync(locked, 0o755)
      }
      const shelf = join(data, 'shelf')
      mkdirSync(shelf)
      chmodSync(shelf, 0o555)
      try {
        expect(browseFolders([data], [config], shelf).writable).toBe(false)
      } finally {
        chmodSync(shelf, 0o755)
      }
    },
  )

  test('opens in the folder that holds it, among several', () => {
    const { data, config, elsewhere } = tree()
    const listing = browseFolders([data, elsewhere], [config], join(elsewhere, 'secrets'))
    expect(listing).toMatchObject({ root: elsewhere, parent: elsewhere })
    expect(browseFolders([data, elsewhere], [config], elsewhere).parent).toBeNull()
  })
})
