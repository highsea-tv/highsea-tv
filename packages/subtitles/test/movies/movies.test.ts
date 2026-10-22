// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { JOBS, trackFromName } from '../../src/movies/index.ts'
import { must } from '../must.ts'
import { DAY, reason, SINTEL, setup } from './helpers.ts'

let t: ReturnType<typeof setup>
afterEach(() => t?.cleanup())

const wants = () =>
  t
    .wantedRows()
    .map((r) => `${r.language}${r.forced ? '.forced' : ''}${r.hi ? '.sdh' : ''}`)
    .sort()

describe('the wanted list', () => {
  test('an available movie wants what its profile asks for and nothing fills', () => {
    t = setup()
    const m = t.movie()
    t.subtitles.refreshWanted(m.itemId)
    // English: Regular and forced, Without SDH
    expect(wants()).toEqual(['en', 'en.forced'])
    const page = t.subtitles.wanted()
    expect(page.items).toEqual([
      {
        movie: { id: SINTEL.tmdbId, title: 'Sintel', year: 2010, path: m.folder },
        missingLanguages: ['en'],
      },
    ])
    expect(page.total).toBe(1)
  })

  test('embedded streams count, image ones included; one without a language does not', () => {
    t = setup()
    const m = t.movie({
      embedded: [
        { codec: 'hdmv_pgs_subtitle', language: 'eng' },
        { language: null, forced: true },
      ],
    })
    t.subtitles.refreshWanted(m.itemId)
    expect(wants()).toEqual(['en.forced'])
  })

  test('an SDH stream does not fill Without SDH', () => {
    t = setup()
    const m = t.movie({ embedded: [{ language: 'eng', hi: true }] })
    t.subtitles.refreshWanted(m.itemId)
    expect(wants()).toEqual(['en', 'en.forced'])
  })

  test('once the cutoff language is present, the other languages are not wanted', () => {
    t = setup()
    const p = t.subtitles.profiles.save({
      name: 'English and German',
      languages: [
        { code: 'en', forced: 'no', hi: 'no' },
        { code: 'de', forced: 'no', hi: 'no' },
      ],
      cutoff: 'en',
      minScore: 80,
    })
    const without = t.movie({ profile: p.id })
    t.subtitles.refreshWanted(without.itemId)
    expect(wants()).toEqual(['de', 'en'])
    const withEnglish = t.movie({
      profile: p.id,
      tmdbId: 10378,
      title: 'Big Buck Bunny',
      year: 2008,
      embedded: [{ language: 'eng' }],
    })
    t.subtitles.refreshWanted(withEnglish.itemId)
    expect(t.wantedRows().filter((r) => r.itemId === withEnglish.itemId)).toEqual([])
  })

  test('a movie that is not available, or has no profile, wants nothing', () => {
    t = setup()
    t.subtitles.refreshWanted(t.movie({ status: 'wanted' }).itemId)
    t.subtitles.refreshWanted(
      t.movie({ profile: null, tmdbId: 10378, title: 'Big Buck Bunny', year: 2008 }).itemId,
    )
    expect(t.wantedRows()).toEqual([])
  })

  test('a refresh keeps a row’s search history', async () => {
    t = setup({ generate: false })
    const m = t.movie()
    t.subtitles.refreshWanted(m.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
    await t.drain()
    const after = t.wantedRows()
    expect(after.every((r) => r.searches === 1 && r.nextSearchAt === t.clock.now() + DAY)).toBe(
      true,
    )
    t.subtitles.refreshWanted(m.itemId)
    expect(t.wantedRows()).toEqual(after)
  })

  test('nothing found waits 1 day, then 3, then 7, then weekly', async () => {
    t = setup({ generate: false })
    const m = t.movie()
    t.subtitles.refreshWanted(m.itemId)
    const waits: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = t.clock.now()
      t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
      await t.drain()
      const row = must(t.wantedRows()[0])
      waits.push((row.nextSearchAt - start) / DAY)
      t.clock.advance(row.nextSearchAt - start)
    }
    expect(waits).toEqual([1, 3, 7, 7, 7])
  })

  test('the wanted job searches only files that are due', async () => {
    t = setup({ generate: false })
    const a = t.movie()
    const b = t.movie({ tmdbId: 10378, title: 'Big Buck Bunny', year: 2008 })
    t.subtitles.refreshWanted(a.itemId)
    t.subtitles.refreshWanted(b.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: a.fileId })
    await t.drain()
    const before = t.fake.requests.length
    t.jobs.enqueue(JOBS.wanted, {})
    await t.drain()
    const asked = t.fake.requests.slice(before).map((r) => r.url.href)
    expect(asked.some((u) => u.includes('10378'))).toBe(true)
    expect(asked.some((u) => u.includes('45745'))).toBe(false)
  })
})

describe('the automatic search', () => {
  test('finds, scores, keeps and writes the sidecar; running every job twice changes nothing', async () => {
    t = setup()
    const m = t.movie()
    t.fake.add({
      provider: 'opensubtitles',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
      forced: true,
    })
    t.subtitles.refreshWanted(m.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
    await t.drain()
    const rows = t.rows()
    expect(rows.map((r) => `${r.language}${r.forced ? '.forced' : ''}`).sort()).toEqual([
      'en',
      'en.forced',
    ])
    for (const r of rows) {
      expect(r.kind).toBe('external')
      expect(r.syncStatus).toBe('synced')
      expect(r.score).toBeGreaterThanOrEqual(80)
      expect(existsSync(r.path)).toBe(true)
      expect(gunzipSync(must(r.original)).toString('utf8').length).toBeGreaterThan(0)
    }
    expect(rows.find((r) => !r.forced)?.path).toBe(
      join(m.folder, 'Sintel (2010) Bluray-1080p.en.srt'),
    )
    expect(rows.find((r) => r.forced)?.path).toBe(
      join(m.folder, 'Sintel (2010) Bluray-1080p.en.forced.srt'),
    )
    expect(t.wantedRows()).toEqual([])
    expect(
      t
        .history()
        .map((h) => h.type)
        .sort(),
    ).toEqual(['subtitle-downloaded', 'subtitle-downloaded', 'subtitle-synced', 'subtitle-synced'])
    expect(
      t.seen.some((e) => e.topic === 'subtitles.updated' && e.ids?.includes('movie:45745')),
    ).toBe(true)

    // the same jobs again: the rows are found, nothing is downloaded or written twice
    const downloads = t.fake.downloads
    for (const job of t.jobs.list({ status: ['succeeded'] })) t.jobs.enqueue(job.type, job.payload)
    await t.drain()
    expect(t.rows()).toEqual(rows)
    expect(t.history()).toHaveLength(4)
    expect(t.fake.downloads).toBe(downloads)
  })

  test('nothing below the minimum score is kept', async () => {
    t = setup({ generate: false })
    const m = t.movie()
    t.fake.add({
      provider: 'subdl',
      tmdbId: 1,
      language: 'en',
      releaseName: 'Another.Movie.1999.DVDRip',
    })
    t.subtitles.settings.save({ minScore: 100 })
    t.subtitles.refreshWanted(m.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
    await t.drain()
    expect(t.rows()).toEqual([])
  })

  test('a translated subtitle is never downloaded', async () => {
    t = setup({ generate: false, providers: ['opensubtitles'] })
    const m = t.movie()
    t.fake.add({
      provider: 'opensubtitles',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
      translated: true,
    })
    t.subtitles.refreshWanted(m.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
    await t.drain()
    expect(t.rows()).toEqual([])
  })

  test('Without SDH takes an SDH track only when nothing else exists, and cleans it', async () => {
    t = setup({ generate: false, providers: ['subdl'] })
    t.subtitles.profiles.save(
      {
        name: 'English',
        languages: [{ code: 'en', forced: 'no', hi: 'no' }],
        cutoff: 'en',
        minScore: 0,
      },
      'lp-en',
    )
    const m = t.movie()
    t.fake.add({
      provider: 'subdl',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
      hi: true,
      content:
        '1\n00:00:01,000 --> 00:00:03,000\n[DOOR CREAKS]\n\n2\n00:00:04,000 --> 00:00:06,000\nSINTEL: Where are you?\n',
    })
    t.subtitles.refreshWanted(m.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
    await t.drain()
    const [row] = t.rows()
    expect(row?.hi).toBe(false)
    const text = readFileSync(must(row).path, 'utf8')
    expect(text).not.toContain('DOOR')
    expect(text).toContain('Where are you?')
    expect(t.wantedRows()).toEqual([])
  })

  test('with no provider on, a search is refused', async () => {
    t = setup({ providers: [] })
    t.movie()
    expect(await reason(() => t.subtitles.search(SINTEL.tmdbId, 'en'))).toBe(
      'conflict:no-providers',
    )
  })
})

describe('Search and Use', () => {
  test('results carry an id and the attribution; Use keeps the chosen one', async () => {
    t = setup()
    const m = t.movie()
    const results = await t.subtitles.search(SINTEL.tmdbId, 'en')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.language === 'en' && r.id.startsWith('sr'))).toBe(true)
    expect(results.find((r) => r.provider === 'OpenSubtitles.com')?.attribution).toBe(
      'Subtitles provided by OpenSubtitles.com',
    )
    const sorted = [...results].sort((a, b) => b.score - a.score)
    expect(results.map((r) => r.score)).toEqual(sorted.map((r) => r.score))

    const track = await t.subtitles.download(SINTEL.tmdbId, must(results[0]).id)
    expect(track).toMatchObject({
      itemId: SINTEL.tmdbId,
      fileId: m.fileId,
      language: 'en',
      chosen: true,
      kind: 'external',
    })
    expect(track.sync.status).toBe('queued')
    expect(t.subtitles.forItem(SINTEL.tmdbId).map((x) => x.id)).toEqual([track.id])
  })

  test('a second provider’s track is kept beside the first, named after its provider', async () => {
    t = setup()
    const m = t.movie()
    const results = await t.subtitles.search(SINTEL.tmdbId, 'en')
    const regular = results.filter((r) => !r.forced && !r.hi)
    const a = must(regular.find((r) => r.provider === 'OpenSubtitles.com'))
    const b = must(regular.find((r) => r.provider === 'Subdl'))
    const first = await t.subtitles.download(SINTEL.tmdbId, a.id)
    const second = await t.subtitles.download(SINTEL.tmdbId, b.id)
    expect(first.path).toBe(join(m.folder, 'Sintel (2010) Bluray-1080p.en.srt'))
    expect(second.path).toBe(join(m.folder, 'Sintel (2010) Bluray-1080p.en.Subdl.srt'))
  })

  test('an expired or unknown result is refused', async () => {
    t = setup()
    t.movie()
    const [r] = await t.subtitles.search(SINTEL.tmdbId, 'en')
    t.clock.advance(31 * 60_000)
    expect(await reason(() => t.subtitles.download(SINTEL.tmdbId, must(r).id))).toBe(
      'not-found:result-expired',
    )
    expect(await reason(() => t.subtitles.download(SINTEL.tmdbId, 'sr_nope'))).toBe(
      'not-found:result-expired',
    )
  })

  test('Delete removes the sidecar and the row, and the language is wanted again', async () => {
    t = setup()
    const m = t.movie()
    const [r] = (await t.subtitles.search(SINTEL.tmdbId, 'en')).filter((x) => !x.forced && !x.hi)
    const track = await t.subtitles.download(SINTEL.tmdbId, must(r).id)
    t.subtitles.refreshWanted(m.itemId)
    expect(wants()).toEqual(['en.forced'])
    await t.subtitles.delete(track.id)
    expect(existsSync(track.path)).toBe(false)
    expect(t.rows()).toEqual([])
    expect(wants()).toEqual(['en', 'en.forced'])
    expect(t.history().map((h) => h.type)).toContain('subtitle-deleted')
  })
})

describe('upgrades', () => {
  test('a better result replaces a track inside the window; a chosen one is never upgraded', async () => {
    t = setup({ generate: false, providers: ['subdl'] })
    t.subtitles.profiles.save(
      {
        name: 'English',
        languages: [{ code: 'en', forced: 'no', hi: 'no' }],
        cutoff: 'en',
        minScore: 0,
      },
      'lp-en',
    )
    t.subtitles.settings.save({ minScore: 0 })
    const m = t.movie()
    t.fake.add({
      provider: 'subdl',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.720p.WEB-DL',
    })
    t.subtitles.refreshWanted(m.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
    await t.drain()
    const [before] = t.rows()
    expect(before).toBeDefined()

    t.fake.add({
      provider: 'subdl',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    t.jobs.enqueue(JOBS.upgrade, {})
    await t.drain()
    const [after] = t.rows()
    expect(after?.id).toBe(before?.id)
    expect(after?.score).toBeGreaterThan(must(before).score)
    expect(after?.releaseName).toBe('Sintel.2010.1080p.BluRay.x264-GRP')
    expect(t.history().map((h) => h.type)).toEqual([
      'subtitle-downloaded',
      'subtitle-synced',
      'subtitle-upgraded',
      'subtitle-synced',
    ])

    // outside the window nothing is asked
    t.clock.advance(15 * DAY)
    const asked = t.fake.requests.length
    t.jobs.enqueue(JOBS.upgrade, {})
    await t.drain()
    expect(t.fake.requests.length).toBe(asked)
  })

  test('a track chosen with Use is left alone', async () => {
    t = setup({ generate: false, providers: ['subdl'] })
    t.subtitles.settings.save({ minScore: 0 })
    t.movie()
    t.fake.add({
      provider: 'subdl',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.720p.WEB-DL',
    })
    const [r] = await t.subtitles.search(SINTEL.tmdbId, 'en')
    await t.subtitles.download(SINTEL.tmdbId, must(r).id)
    t.fake.add({
      provider: 'subdl',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    const asked = t.fake.requests.length
    t.jobs.enqueue(JOBS.upgrade, {})
    await t.drain()
    expect(t.fake.requests.length).toBe(asked)
  })
})

describe('the import’s hooks', () => {
  test('bundled subtitles are kept with their language from the name; one that can’t be told is skipped', async () => {
    t = setup({ generate: false })
    const m = t.movie()
    const release = join(t.dir, 'Sintel.2010.1080p.BluRay.x264-GRP')
    mkdirSync(join(release, 'Subs'), { recursive: true })
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello\n'
    writeFileSync(join(release, 'Sintel.2010.1080p.BluRay.x264-GRP.en.srt'), srt)
    writeFileSync(join(release, 'Subs', '3_French.srt'), srt)
    writeFileSync(join(release, 'Subs', 'German.forced.srt'), srt)
    writeFileSync(join(release, 'Subs', 'Sintel.srt'), srt)
    writeFileSync(join(release, 'Subs', 'notes.txt'), 'not a subtitle')
    await t.subtitles.hooks.afterImport?.({
      fileId: m.fileId,
      itemId: m.itemId,
      path: m.path,
      sourceFolder: release,
      inPlace: false,
    })
    const rows = t.rows()
    expect(rows.map((r) => `${r.language}${r.forced ? '.forced' : ''}`).sort()).toEqual([
      'de.forced',
      'en',
      'fr',
    ])
    expect(
      rows.every((r) => r.kind === 'bundled' && r.score === 100 && r.syncStatus === 'not-needed'),
    ).toBe(true)
    expect(rows.map((r) => r.path).sort()).toEqual(
      [
        'Sintel (2010) Bluray-1080p.de.forced.srt',
        'Sintel (2010) Bluray-1080p.en.srt',
        'Sintel (2010) Bluray-1080p.fr.srt',
      ].map((n) => join(m.folder, n)),
    )
    // English regular is filled; its forced track is still wanted, and a search is queued
    expect(wants()).toEqual(['en.forced'])
    expect(t.jobs.list({ status: ['queued'] }).map((j) => j.type)).toContain(JOBS.search)
    // the hash is stored beside the probe
    const info = t.db
      .select()
      .from(schema.mediaFiles)
      .where(eq(schema.mediaFiles.id, m.fileId))
      .get()?.mediaInfo as { moviehash: string; probe: unknown }
    expect(info.moviehash).toMatch(/^[0-9a-f]{16}$/)
    expect(info.probe).toBeDefined()
  })

  // the import calls its hook before it marks the movie Available, so the hook can't wait for it
  test('the import’s hook searches before the movie is marked Available', async () => {
    t = setup({ generate: false })
    const m = t.movie({ status: 'wanted' })
    await t.subtitles.hooks.afterImport?.({
      fileId: m.fileId,
      itemId: m.itemId,
      path: m.path,
      sourceFolder: null,
      inPlace: false,
    })
    expect(wants()).toEqual(['en', 'en.forced'])
    expect(t.jobs.list({ status: ['queued'] }).map((j) => j.type)).toContain(JOBS.search)
  })

  test('a file adopted in place keeps the sidecars already beside it', async () => {
    t = setup({ generate: false })
    const m = t.movie()
    writeFileSync(
      join(m.folder, 'Sintel (2010) Bluray-1080p.en.srt'),
      '1\n00:00:01,000 --> 00:00:02,000\nHi\n',
    )
    writeFileSync(join(m.folder, 'other.en.srt'), '1\n00:00:01,000 --> 00:00:02,000\nHi\n')
    await t.subtitles.hooks.afterImport?.({
      fileId: m.fileId,
      itemId: m.itemId,
      path: m.path,
      sourceFolder: m.folder,
      inPlace: true,
    })
    expect(t.rows().map((r) => r.path)).toEqual([
      join(m.folder, 'Sintel (2010) Bluray-1080p.en.srt'),
    ])
  })

  test('a replaced file’s tracks move to the new file and follow its name', async () => {
    t = setup()
    const m = t.movie()
    const [r] = (await t.subtitles.search(SINTEL.tmdbId, 'en')).filter((x) => !x.forced && !x.hi)
    const track = await t.subtitles.download(SINTEL.tmdbId, must(r).id)
    // the import writes the new file's row, then replaces the old one in one transaction
    const newPath = join(m.folder, 'Sintel (2010) Remux-2160p.mkv')
    writeFileSync(newPath, Buffer.alloc(200_000, 9))
    t.db
      .insert(schema.mediaFiles)
      .values({
        id: 'filNew',
        itemId: m.itemId,
        path: newPath,
        size: 200_000,
        addedAt: t.clock.now(),
      })
      .run()
    t.db.transaction((tx) => {
      t.subtitles.hooks.replacing?.(tx, m.fileId, 'filNew')
      tx.delete(schema.mediaFiles).where(eq(schema.mediaFiles.id, m.fileId)).run()
    })
    await t.subtitles.hooks.afterImport?.({
      fileId: 'filNew',
      itemId: m.itemId,
      path: newPath,
      sourceFolder: null,
      inPlace: false,
    })
    const [moved] = t.rows()
    expect(moved?.id).toBe(track.id)
    expect(moved?.mediaFileId).toBe('filNew')
    expect(moved?.path).toBe(join(m.folder, 'Sintel (2010) Remux-2160p.en.srt'))
    expect(existsSync(must(moved).path)).toBe(true)
    expect(existsSync(track.path)).toBe(false)
  })
})

describe('names', () => {
  test.each([
    ['Movie.2010.1080p.BluRay.x264-GRP.en.srt', 'en', false, false],
    ['Movie.English.forced.srt', 'en', true, false],
    ['2_English.srt', 'en', false, false],
    ['eng.sdh.srt', 'en', false, true],
    ['Movie.pt-BR.srt', 'pt-BR', false, false],
    ['hi.srt', 'hi', false, false],
    ['French.cc.srt', 'fr', false, true],
  ])('%s', (name, language, forced, hi) => {
    expect(trackFromName(name)).toEqual({ language, forced, hi })
  })

  test.each(['Movie.2010.srt', 'Sintel.srt', 'forced.srt'])('%s can’t be told', (name) => {
    expect(trackFromName(name)).toBeNull()
  })
})

describe('stats', () => {
  test('nothing syncs before 7b; downloads wait', async () => {
    t = setup()
    t.movie()
    const [r] = await t.subtitles.search(SINTEL.tmdbId, 'en')
    await t.subtitles.download(SINTEL.tmdbId, must(r).id)
    expect(t.subtitles.stats()).toEqual({
      syncedToday: 0,
      waiting: 1,
      avgOffsetMs: 0,
      avgConfidence: 0,
    })
  })
})
