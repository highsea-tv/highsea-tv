// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 6b's categories and watch folder on a real engine: a manual torrent saves to its
// category's folder, movies and unknown names are refused, a category in use or the watch folder's
// can't be removed, and a `.torrent` dropped in the watch folder is added and renamed `.added` on a
// tick, while a file that isn't one waits a minute and is then renamed `.invalid`.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeClock, silentLogger } from '@highsea/core'
import { createWatchFolder, WATCH_SETTLE_MS } from '../src/index.ts'
import { makeTorrent, setup, tempDir } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>
const open: T[] = []
afterEach(async () => {
  for (const t of open.splice(0)) await t.close()
})
async function start() {
  const t = await setup()
  open.push(t)
  return t
}

const magnet = (hex: string, name: string) =>
  `magnet:?xt=urn:btih:${hex.repeat(40 / hex.length)}&dn=${name}`

describe('categories', () => {
  test('movies and manual come first and stay; the owner’s are listed by name', async () => {
    const t = await start()
    t.downloads.saveCategory({ name: 'linux' })
    t.downloads.saveCategory({ name: 'books', folder: join(t.downloadsDir, 'reading') })
    expect(t.downloads.categories()).toEqual([
      { name: 'movies', folder: join(t.downloadsDir, 'movies'), fixed: true, torrents: 0 },
      { name: 'manual', folder: join(t.downloadsDir, 'manual'), fixed: true, torrents: 0 },
      { name: 'books', folder: join(t.downloadsDir, 'reading'), fixed: false, torrents: 0 },
      { name: 'linux', folder: join(t.downloadsDir, 'linux'), fixed: false, torrents: 0 },
    ])
    expect(t.seen.some((e) => e.topic === 'torrents.updated')).toBe(true)
    // a name saved again changes its folder; the default folder follows the downloads folder
    const again = t.downloads.saveCategory({ name: 'Books', folder: join(t.downloadsDir, 'books') })
    expect(again).toMatchObject({ name: 'books', folder: join(t.downloadsDir, 'books') })
    expect(t.downloads.categoryFolders()).toEqual([
      join(t.downloadsDir, 'linux'),
      join(t.downloadsDir, 'books'),
    ])
  })

  test('a name or folder that won’t do is refused, on its field', async () => {
    const t = await start()
    expect(() => t.downloads.saveCategory({ name: 'movies' })).toThrow(
      'movies is built in. Choose another name.',
    )
    expect(() => t.downloads.saveCategory({ name: 'Shows' })).toThrow(
      'Shows is kept for the library.',
    )
    expect(() => t.downloads.saveCategory({ name: '../up' })).toThrow('Use up to 40 letters')
    try {
      t.downloads.saveCategory({ name: 'odd', folder: 'relative/path' })
      throw new Error('saved')
    } catch (e) {
      expect((e as { details?: unknown }).details).toEqual({ field: 'folder' })
    }
  })

  test('a manual torrent saves to its category’s folder; movies and unknown names are refused', async () => {
    const t = await start()
    t.downloads.saveCategory({ name: 'books', folder: join(t.downloadsDir, 'reading') })
    const view = await t.downloads.add({
      source: { magnet: magnet('ab', 'Notes') },
      paused: true,
      category: 'books',
    })
    expect(view).toMatchObject({
      category: 'books',
      manual: true,
      movieId: null,
      savePath: join(t.downloadsDir, 'reading'),
    })
    const plain = await t.downloads.add({ source: { magnet: magnet('cd', 'Other') }, paused: true })
    expect(plain).toMatchObject({ category: 'manual', savePath: join(t.downloadsDir, 'manual') })
    await expect(
      t.downloads.add({ source: { magnet: magnet('ef', 'X') }, category: 'movies' }),
    ).rejects.toThrow('movies is for the library’s grabs. Choose another category.')
    await expect(
      t.downloads.add({ source: { magnet: magnet('12', 'X') }, category: 'nope' }),
    ).rejects.toThrow()
    expect(t.downloads.queue()).toEqual([])
  })

  test('removing: refused while in use or the watch folder’s; built in ones stay', async () => {
    const t = await start()
    t.downloads.saveCategory({ name: 'books' })
    t.downloads.saveCategory({ name: 'linux' })
    const view = await t.downloads.add({
      source: { magnet: magnet('ab', 'Notes') },
      paused: true,
      category: 'books',
    })
    expect(t.downloads.categories().find((c) => c.name === 'books')?.torrents).toBe(1)
    expect(() => t.downloads.removeCategory('books')).toThrow(
      'A torrent still uses books. Remove it from Downloads first.',
    )
    expect(() => t.downloads.removeCategory('movies')).toThrow('movies is built in and stays.')
    expect(() => t.downloads.removeCategory('nope')).toThrow('There’s no category named nope.')

    const watch = tempDir('watch')
    await t.downloads.saveSettings({
      ...t.downloads.settings(),
      watchFolder: watch,
      watchCategory: 'linux',
    })
    expect(() => t.downloads.removeCategory('linux')).toThrow(
      'The watch folder adds torrents to linux.',
    )

    await t.downloads.deleteTorrent(view.id, false)
    t.downloads.removeCategory('books')
    expect(t.downloads.categories().map((c) => c.name)).toEqual(['movies', 'manual', 'linux'])
  })

  test('the watch folder’s settings: an allowed folder and one of the categories', async () => {
    const t = await start()
    const base = t.downloads.settings()
    expect(base).toMatchObject({ watchFolder: null, watchCategory: 'manual' })
    await expect(
      t.downloads.saveSettings({ ...base, watchFolder: 'relative', watchCategory: 'manual' }),
    ).rejects.toThrow()
    await expect(
      t.downloads.saveSettings({ ...base, watchFolder: tempDir('w'), watchCategory: 'movies' }),
    ).rejects.toThrow('Choose one of your categories, or manual.')
  })
})

describe('the watch folder', () => {
  test('a dropped .torrent is added in its category and renamed .added on a tick', async () => {
    const t = await start()
    t.downloads.saveCategory({ name: 'linux' })
    const watch = tempDir('watch')
    await t.downloads.saveSettings({
      ...t.downloads.settings(),
      watchFolder: watch,
      watchCategory: 'linux',
    })
    const folder = createWatchFolder({
      clock: t.clock,
      logger: silentLogger,
      settings: t.downloads.settings,
      checkFolder: (p) => p,
      add: (input) => t.downloads.add({ ...input, paused: true }),
    })
    const made = makeTorrent({
      name: 'debian.iso',
      files: [{ path: 'debian.iso', data: new Uint8Array(40_000) }],
      announce: ['http://127.0.0.1:1/announce'],
    })
    writeFileSync(join(watch, 'debian.torrent'), made.torrent)
    writeFileSync(join(watch, 'notes.txt'), 'not a torrent')
    mkdirSync(join(watch, 'sub.torrent'))

    expect(await folder.tick()).toEqual([{ file: join(watch, 'debian.torrent'), result: 'added' }])
    expect(existsSync(join(watch, 'debian.torrent.added'))).toBe(true)
    expect(existsSync(join(watch, 'debian.torrent'))).toBe(false)
    expect(existsSync(join(watch, 'notes.txt'))).toBe(true)
    expect(t.downloads.torrents()).toMatchObject([
      {
        name: 'debian.iso',
        category: 'linux',
        manual: true,
        savePath: join(t.downloadsDir, 'linux'),
      },
    ])
    // the next tick has nothing to do; the same file dropped again is already in Downloads
    expect(await folder.tick()).toEqual([])
    writeFileSync(join(watch, 'again.torrent'), made.torrent)
    expect(await folder.tick()).toEqual([
      { file: join(watch, 'again.torrent'), result: 'duplicate' },
    ])
    expect(existsSync(join(watch, 'again.torrent.added'))).toBe(true)
    expect(t.downloads.torrents()).toHaveLength(1)
  })

  test('a file that isn’t a torrent waits a minute, then is renamed .invalid', async () => {
    const watch = tempDir('watch')
    const clock = createFakeClock(Date.now())
    const added: unknown[] = []
    const folder = createWatchFolder({
      clock,
      logger: silentLogger,
      settings: () => ({ watchFolder: watch, watchCategory: 'manual' }),
      checkFolder: (p) => p,
      add: async (input) => added.push(input),
    })
    const bad = join(watch, 'half.torrent')
    writeFileSync(bad, 'd8:announce')
    const seconds = clock.now() / 1000
    utimesSync(bad, seconds, seconds)

    expect(await folder.tick()).toEqual([{ file: bad, result: 'waiting' }])
    expect(existsSync(bad)).toBe(true)
    clock.advance(WATCH_SETTLE_MS)
    const [out] = await folder.tick()
    expect(out).toMatchObject({ file: bad, result: 'invalid' })
    expect(existsSync(bad)).toBe(false)
    expect(existsSync(`${bad}.invalid`)).toBe(true)
    expect(added).toEqual([])
  })

  test('off, or a folder outside what highsea may use, does nothing', async () => {
    const watch = tempDir('watch')
    writeFileSync(join(watch, 'x.torrent'), 'd8:announce')
    const make = (watchFolder: string | null) =>
      createWatchFolder({
        clock: createFakeClock(Date.now() + 10 * WATCH_SETTLE_MS),
        logger: silentLogger,
        settings: () => ({ watchFolder, watchCategory: 'manual' }),
        checkFolder: () => {
          throw new Error('outside')
        },
        add: async () => {},
      })
    expect(await make(null).tick()).toEqual([])
    expect(await make(watch).tick()).toEqual([])
    expect(existsSync(join(watch, 'x.torrent'))).toBe(true)
  })
})
