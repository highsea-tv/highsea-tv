// SPDX-License-Identifier: AGPL-3.0-only
// Tags (checkpoint 8c): labels, usage across every table that carries them, removal stripping
// them everywhere, and the library's tags and filter. Root folders' default language profile is
// here too, since both came with 8c.
import { afterEach, describe, expect, test } from 'bun:test'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import { tagsMatch } from '../../src/shared/index.ts'
import { BIG_BUCK_BUNNY, reason, SINTEL, setup } from '../movies/helpers.ts'

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

/** An indexer, a list and a connection carrying `tags`, written as their packages write them. */
function carriers(db: Awaited<ReturnType<typeof setup>>['db'], tags: string[]) {
  db.insert(schema.indexers)
    .values({
      id: 'ix1',
      definitionId: 'fake',
      definitionVersion: '1',
      name: 'Fake',
      enabled: true,
      priority: 25,
      settings: {},
      tags,
      addedAt: 0,
      updatedAt: 0,
    })
    .run()
  db.insert(schema.importLists)
    .values({
      id: 'il1',
      kind: 'generic',
      name: 'List',
      enabled: true,
      settings: {},
      rootFolder: '/movies',
      qualityProfileId: 'qp-hd',
      monitored: true,
      minimumAvailability: 'released',
      searchOnAdd: false,
      tags,
      createdAt: 0,
      updatedAt: 0,
    })
    .run()
  db.insert(schema.connections)
    .values({
      id: 'cn1',
      kind: 'webhook',
      name: 'Hook',
      enabled: true,
      events: [],
      settings: {},
      tags,
      createdAt: 0,
      updatedAt: 0,
    })
    .run()
}

describe('tags', () => {
  test('labels are tidied, unique ignoring case, and listed A to Z', async () => {
    const { media } = await start()
    const kids = media.tags.add('  kids  ')
    media.tags.add('Anime')
    expect(kids.label).toBe('kids')
    expect(await reason(() => media.tags.add('KIDS'))).toBe('conflict:exists')
    expect(await reason(() => media.tags.add('   '))).toBe('invalid:label')
    expect(media.tags.list().map((t) => t.label)).toEqual(['Anime', 'kids'])
    const renamed = media.tags.rename(kids.id, 'Kids')
    expect(renamed.label).toBe('Kids')
    expect(await reason(() => media.tags.rename(kids.id, 'anime'))).toBe('conflict:exists')
    expect(await reason(() => media.tags.rename('nope', 'x'))).toBe('not-found:undefined')
  })

  test('check refuses an unknown id and drops repeats', async () => {
    const { media } = await start()
    const a = media.tags.add('a')
    expect(media.tags.check([a.id, a.id])).toEqual([a.id])
    expect(await reason(() => media.tags.check([a.id, 'tag_gone']))).toBe('invalid:unknown-tag')
  })

  test('usage counts movies, indexers, lists and connections; removing strips it everywhere', async () => {
    const { media, movies, db, add } = await start()
    const a = media.tags.add('a')
    const b = media.tags.add('b')
    await add(SINTEL, { tags: [a.id, b.id] })
    carriers(db, [a.id, b.id])
    expect(media.tags.get(a.id).usage).toEqual({ movies: 1, indexers: 1, lists: 1, connections: 1 })

    media.tags.remove(a.id)
    expect(media.tags.list().map((t) => t.label)).toEqual(['b'])
    expect((await movies.get(SINTEL)).tags).toEqual([b.id])
    expect(db.select().from(schema.indexers).get()?.tags).toEqual([b.id])
    expect(db.select().from(schema.importLists).get()?.tags).toEqual([b.id])
    expect(db.select().from(schema.connections).get()?.tags).toEqual([b.id])
    media.tags.remove(b.id)
    // left with none: used for every movie again
    expect(db.select().from(schema.indexers).get()?.tags).toEqual([])
  })

  test('a movie is edited alone or in bulk: add, remove, replace', async () => {
    const { media, movies, add } = await start()
    const a = media.tags.add('a')
    const b = media.tags.add('b')
    await add(SINTEL)
    await add(BIG_BUCK_BUNNY)
    expect((await movies.update(SINTEL, { tags: [b.id, a.id] })).tags).toEqual([a.id, b.id])
    await movies.bulk({
      action: 'setTags',
      ids: [SINTEL, BIG_BUCK_BUNNY],
      tagIds: [b.id],
      mode: 'add',
    })
    expect((await movies.get(BIG_BUCK_BUNNY)).tags).toEqual([b.id])
    await movies.bulk({ action: 'setTags', ids: [SINTEL], tagIds: [a.id], mode: 'remove' })
    expect((await movies.get(SINTEL)).tags).toEqual([b.id])
    await movies.bulk({ action: 'setTags', ids: [SINTEL], tagIds: [a.id], mode: 'replace' })
    expect((await movies.get(SINTEL)).tags).toEqual([a.id])
    expect(await reason(() => movies.update(SINTEL, { tags: ['tag_gone'] }))).toBe(
      'invalid:unknown-tag',
    )
    expect(media.tags.ofMovie(SINTEL)).toEqual([a.id])
    expect(media.tags.ofMovie(999)).toEqual([])
  })

  test('the library filters by tag', async () => {
    const { media, movies, add } = await start()
    const kids = media.tags.add('kids')
    await add(SINTEL)
    await add(BIG_BUCK_BUNNY, { tags: [kids.id] })
    const page = movies.list({ tag: kids.id })
    expect(page.items.map((m) => m.id)).toEqual([BIG_BUCK_BUNNY])
    expect(movies.list({}).items).toHaveLength(2)
  })

  test('an empty scope matches every movie, a set one only movies sharing a tag', () => {
    expect(tagsMatch([], [])).toBe(true)
    expect(tagsMatch(['a'], [])).toBe(false)
    expect(tagsMatch(['a', 'b'], ['b'])).toBe(true)
  })
})

describe('root folder language defaults', () => {
  test('a movie added without a choice takes its folder’s default; null still means none', async () => {
    const { media, movies, folder, input, db } = await start()
    expect(folder.languageProfileId).toBeNull()
    expect(media.rootFolders.setLanguageProfile(folder.id, 'lp-en').languageProfileId).toBe('lp-en')
    expect(await reason(() => media.rootFolders.setLanguageProfile(folder.id, 'lp-gone'))).toBe(
      'not-found:unknown-language-profile',
    )

    const { languageProfileId: _, ...rest } = input(SINTEL)
    expect((await movies.add(rest)).movie.languageProfileId).toBe('lp-en')
    expect(
      (await movies.add(input(BIG_BUCK_BUNNY, { languageProfileId: null }))).movie
        .languageProfileId,
    ).toBeNull()

    media.rootFolders.setLanguageProfile(folder.id, null)
    expect(
      db.select().from(schema.rootFolders).where(eq(schema.rootFolders.id, folder.id)).get()
        ?.languageProfileId,
    ).toBeNull()
  })
})
