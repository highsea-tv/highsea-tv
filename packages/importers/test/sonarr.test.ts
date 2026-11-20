// SPDX-License-Identifier: AGPL-3.0-only
// The Sonarr importer against the fake Sonarr (written from Sonarr's API docs): connecting (and a
// wrong key), the preview (counts, profiles nearest first, root folders, what can't come across),
// the run (a multi-season show with specials, a multi-episode file, an unmonitored season, a series
// found by TheTVDB's id, one TMDB has nothing for, a path that needs mapping), a second run that
// changes nothing, and only GET requests ever sent to Sonarr.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { seedProfiles } from '@highsea-tv/quality'
import {
  COPY_PROFILE,
  nearestToSonarr,
  profileFromSonarr,
  sonarrCutoff,
  sonarrQualityName,
} from '../src/sonarr/index.ts'
import { FAKE_SONARR_KEY, SONARR_FILES, sonarrLibrary, startFakeSonarr } from './fake/index.ts'
import { reason, setup } from './helpers.ts'

const OFFICE = 2996
const CHERNOBYL = 87108

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c()
})

async function start() {
  const s = await setup()
  const fake = await startFakeSonarr(sonarrLibrary('/tv'))
  cleanups.push(s.cleanup, fake.close)
  const conn = { url: fake.url, apiKey: FAKE_SONARR_KEY }
  // Sonarr ran in its own container and saw the shows at /tv
  const pathMappings = [{ from: '/tv', to: s.showsFolder }]
  /** Writes the fake's files under the shows folder, as Sonarr left them on disk. */
  const writeFiles = () => {
    for (const rel of Object.values(SONARR_FILES)) {
      const full = join(s.showsFolder, rel)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, 'episode')
    }
  }
  return { ...s, fake, conn, pathMappings, writeFiles }
}

/** A show's episodes as `SxxEyy` → [monitored, has a file]. */
function episodes(s: Awaited<ReturnType<typeof start>>, tmdbId: number) {
  const tree = s.shows.get(tmdbId)
  if (!tree) return null
  const files = new Set(
    s.db
      .select()
      .from(schema.versions)
      .all()
      .filter((v) => v.fileId)
      .map((v) => v.itemId),
  )
  return Object.fromEntries(
    tree.seasons.flatMap((season) =>
      season.episodes.map((e) => [
        `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
        [e.monitored, files.has(e.id)],
      ]),
    ),
  )
}

describe('the profile mapping', () => {
  test('Sonarr’s remux names are read as highsea’s; nearest first by cutoff', () => {
    expect(sonarrQualityName('Bluray-2160p Remux')).toBe('Remux-2160p')
    expect(sonarrQualityName('WEBDL-1080p')).toBe('WEBDL-1080p')
    const [hd, remux] = sonarrLibrary().profiles as unknown as Parameters<typeof sonarrCutoff>[0][]
    expect(sonarrCutoff(hd as never).name).toBe('Bluray-1080p')
    expect(sonarrCutoff(remux as never).name).toBe('Remux-2160p')
    const ours = seedProfiles()
    expect(nearestToSonarr(hd as never, ours)[0]).toBe('qp-hd')
    expect(nearestToSonarr(remux as never, ours)[0]).toBe('qp-uhd')
    expect(profileFromSonarr(remux as never, [])).toMatchObject({
      name: 'Remux',
      cutoff: 'Remux-2160p',
    })
  })
})

describe('the Sonarr importer', () => {
  test('connect: the version and how many series; a wrong key and the wrong program', async () => {
    const s = await start()
    expect(await s.sonarr.connect(s.conn)).toEqual({ version: '4.0.14.2939', series: 3 })
    expect(await reason(() => s.sonarr.connect({ ...s.conn, apiKey: 'wrong' }))).toBe(
      'invalid:bad-credentials',
    )
    expect(await reason(() => s.sonarr.connect({ ...s.conn, apiKey: ' ' }))).toBe('invalid:no-key')
    s.fake.state.appName = 'Radarr'
    expect(await reason(() => s.sonarr.connect(s.conn))).toBe('invalid:not-sonarr')
  })

  test('preview: counts, profiles, root folders and what can’t come across; writes nothing', async () => {
    const s = await start()
    const p = await s.sonarr.preview(s.conn, s.pathMappings)
    expect(p.series).toEqual({
      total: 3,
      withFiles: 2,
      inLibrary: 0,
      ready: 2,
      episodes: 13,
      files: 5,
    })
    expect(
      p.profiles.map((x) => [x.name, x.cutoff, x.series, x.options[0], x.options.at(-1)]),
    ).toEqual([
      ['HD-1080p', 'Bluray-1080p', 2, 'qp-hd', COPY_PROFILE],
      ['Remux', 'Remux-2160p', 1, 'qp-uhd', COPY_PROFILE],
    ])
    expect(p.rootFolders).toEqual([
      { sonarr: '/tv', path: s.showsFolder, status: 'add', series: 3 },
    ])
    expect(p.tags).toBe(2)
    expect(p.numbering).toEqual({ daily: 1, anime: 0 })
    expect(p.problems).toEqual([
      {
        title: 'A Daily Show (1964)',
        message: 'TMDB has no show for TheTVDB’s id 14296, and Sonarr has no TMDB id.',
      },
    ])
    // nothing written: no show, no root folder
    expect(s.shows.get(OFFICE)).toBeNull()
    expect(s.media.rootFolders.list('shows')).toEqual([])

    // without the mapping Sonarr's /tv is outside every folder highsea may use
    const unmapped = await s.sonarr.preview(s.conn, [])
    expect(unmapped.rootFolders[0]?.status).toBe('outside')
    expect(unmapped.series.ready).toBe(0)
    expect(unmapped.problems.some((x) => x.message.includes('Add a path mapping'))).toBe(true)
  })

  test('run: shows where they are, monitoring per season and episode, files in place; a second run changes nothing', async () => {
    const s = await start()
    s.writeFiles()
    const begun = s.sonarr.run(s.conn, { pathMappings: s.pathMappings })
    expect(begun).toMatchObject({ state: 'running', done: 0 })
    expect(await reason(() => s.sonarr.run(s.conn, { pathMappings: [] }))).toBe('conflict:running')
    // the payload carries the key sealed, never in the clear
    expect(JSON.stringify(s.db.select().from(schema.jobs).all())).not.toContain(FAKE_SONARR_KEY)

    await s.runJobs()
    const st = s.sonarr.status()
    expect(st).toMatchObject({
      state: 'done',
      total: 3,
      done: 3,
      imported: 2,
      skipped: 0,
      files: 4,
    })
    expect(st.failures).toEqual([
      {
        name: 'A Daily Show (1964)',
        message: 'TMDB has no show for TheTVDB’s id 14296, and Sonarr has no TMDB id.',
      },
    ])
    // S01E07 is Sonarr's (TheTVDB's) and not TMDB's: its monitoring and its file are left, with why
    expect(st.unmatched).toEqual([
      {
        name: 'The Office (UK) (2001): S01E07',
        message: 'TMDB lists no S01E07 for this show, so its monitoring stays behind.',
      },
      {
        name: `The Office (UK) (2001): Season 01/The Office (UK) - S01E07 - Not On TMDB.mkv`,
        message: 'TMDB lists no S01E07 for this show.',
      },
    ])

    // the Shows root folder came across, inside the data folder
    expect(s.media.rootFolders.list('shows').map((r) => r.path)).toEqual([s.showsFolder])
    const office = s.shows.get(OFFICE)
    expect(office).toMatchObject({
      monitored: true,
      qualityProfileId: 'qp-hd',
      path: join(s.showsFolder, 'The Office (UK) (2001)'),
      seasonFolders: true,
    })
    // seasons as Sonarr had them: specials and season 1 on, season 2 off
    expect(office?.seasons.map((x) => [x.seasonNumber, x.monitored])).toEqual([
      [0, true],
      [1, true],
      [2, false],
    ])
    const eps = episodes(s, OFFICE) ?? {}
    // the multi-episode file holds E01 and E02; E04 was unmonitored by hand in Sonarr
    expect([eps.S01E01, eps.S01E02, eps.S01E03, eps.S01E04, eps.S01E05]).toEqual([
      [true, true],
      [true, true],
      [true, true],
      [false, false],
      [true, false],
    ])
    expect([eps.S00E01, eps.S00E02, eps.S02E01]).toEqual([
      [true, true],
      [false, false],
      [false, false],
    ])
    // a special TMDB lists and Sonarr doesn't keeps highsea's own (off, as a new show's specials)
    expect(eps.S00E03).toEqual([false, false])
    // one file for the two episodes, its release name the one Sonarr kept
    const filesRows = s.db.select().from(schema.mediaFiles).all()
    expect(filesRows).toHaveLength(4)
    const pilot = filesRows.find((f) => f.path.endsWith('S01E01-E02 - Downsize.mkv'))
    expect(pilot?.sceneName).toBe('The.Office.UK.S01E01E02.1080p.WEB-DL-GRP')
    // the file TMDB has no episode for waits in Unmatched for the owner to place
    expect(s.shows.unmatched().map((u) => [u.path.endsWith('Not On TMDB.mkv'), u.reason])).toEqual([
      [true, 'unknown-episode'],
    ])
    const tags = s.db.select().from(schema.tags).all()
    expect(tags.map((t) => t.label)).toEqual(['uk'])

    // Chernobyl had no TMDB id in Sonarr: found by TheTVDB's, on the Remux profile's nearest
    expect(s.shows.get(CHERNOBYL)).toMatchObject({ monitored: true, qualityProfileId: 'qp-uhd' })
    expect(episodes(s, CHERNOBYL)?.S01E01).toEqual([true, true])

    // safe to repeat, and a second run changes nothing
    const before = JSON.stringify({
      items: s.db.select().from(schema.mediaItems).all(),
      versions: s.db.select().from(schema.versions).all(),
      files: s.db.select().from(schema.mediaFiles).all(),
      history: s.db.select().from(schema.history).all(),
      tags: s.db.select().from(schema.mediaItemTags).all(),
    })
    s.sonarr.run(s.conn, { pathMappings: s.pathMappings })
    await s.runJobs()
    expect(s.sonarr.status()).toMatchObject({ state: 'done', imported: 0, skipped: 2, files: 0 })
    const after = JSON.stringify({
      items: s.db.select().from(schema.mediaItems).all(),
      versions: s.db.select().from(schema.versions).all(),
      files: s.db.select().from(schema.mediaFiles).all(),
      history: s.db.select().from(schema.history).all(),
      tags: s.db.select().from(schema.mediaItemTags).all(),
    })
    expect(after).toBe(before)

    // only reads ever reached Sonarr
    expect(s.fake.requests.length).toBeGreaterThan(0)
    expect(s.fake.requests.every((r) => r.startsWith('GET '))).toBe(true)
  })

  test('a change in Sonarr comes across on the next run, and only that', async () => {
    const s = await start()
    s.writeFiles()
    s.sonarr.run(s.conn, { pathMappings: s.pathMappings })
    await s.runJobs()
    // the owner turns season 2 on in Sonarr, and E05 of season 1 off
    const series = s.fake.state.series[0] as {
      seasons: { seasonNumber: number; monitored: boolean }[]
    }
    for (const x of series.seasons) if (x.seasonNumber === 2) x.monitored = true
    for (const e of s.fake.state.episodes as {
      seriesId: number
      seasonNumber: number
      episodeNumber: number
      monitored: boolean
    }[]) {
      if (e.seriesId !== 1) continue
      if (e.seasonNumber === 2) e.monitored = true
      if (e.seasonNumber === 1 && e.episodeNumber === 5) e.monitored = false
    }
    s.sonarr.run(s.conn, { pathMappings: s.pathMappings })
    await s.runJobs()
    expect(s.sonarr.status()).toMatchObject({ imported: 1, skipped: 1 })
    const eps = episodes(s, OFFICE) ?? {}
    expect([eps.S01E05, eps.S02E01]).toEqual([
      [false, false],
      [true, false],
    ])
  })

  test('a show already in the library takes Sonarr’s monitoring and profile, its files kept', async () => {
    const s = await start()
    s.writeFiles()
    s.media.rootFolders.add({ path: s.showsFolder, kind: 'shows' })
    // the library import (B) found it first: everything monitored, the first profile
    await s.shows.add(
      {
        tmdbId: OFFICE,
        title: '',
        year: 0,
        rootFolder: s.showsFolder,
        qualityProfileId: 'qp-any',
        languageProfileId: '',
        monitor: 'all',
        seasonFolders: true,
        search: false,
      },
      { path: join(s.showsFolder, 'The Office (UK) (2001)') },
    )
    const p = await s.sonarr.preview(s.conn, s.pathMappings)
    expect(p.series).toMatchObject({ inLibrary: 1, ready: 1 })
    expect(p.rootFolders[0]?.status).toBe('root-folder')
    s.sonarr.run(s.conn, { pathMappings: s.pathMappings })
    await s.runJobs()
    expect(s.shows.get(OFFICE)).toMatchObject({ qualityProfileId: 'qp-hd' })
    expect(s.shows.get(OFFICE)?.seasons.find((x) => x.seasonNumber === 2)?.monitored).toBe(false)
    expect(
      s.db
        .select()
        .from(schema.versions)
        .all()
        .filter((v) => v.fileId).length,
    ).toBe(5)
  })

  test('copy: a Sonarr profile brought across as it is, once', async () => {
    const s = await start()
    const run = () =>
      s.sonarr.run(s.conn, { pathMappings: s.pathMappings, profiles: { '6': COPY_PROFILE } })
    run()
    await s.runJobs()
    expect(s.media.profiles.get('qp-sonarr-6')).toMatchObject({
      name: 'Remux',
      cutoff: 'Remux-2160p',
    })
    expect(s.shows.get(CHERNOBYL)).toMatchObject({ qualityProfileId: 'qp-sonarr-6' })
    run()
    await s.runJobs()
    expect(s.media.profiles.list().filter((x) => x.id.startsWith('qp-sonarr-'))).toHaveLength(1)
  })

  test('a profile that doesn’t exist is refused before the job starts', async () => {
    const s = await start()
    expect(
      await reason(() =>
        s.sonarr.run(s.conn, { pathMappings: s.pathMappings, profiles: { '4': 'qp-nope' } }),
      ),
    ).toBe('not-found:unknown-quality-profile')
  })
})
