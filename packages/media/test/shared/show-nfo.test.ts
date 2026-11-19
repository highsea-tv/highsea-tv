// SPDX-License-Identifier: AGPL-3.0-only
// A show folder's `tvshow.nfo` read for its ids (Phase 5 B): as Sonarr's Kodi metadata writes it,
// as Kodi and Jellyfin read it, and the older forms; a file with none, or none at all, is null.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readShowNfo, showIdsFromNfo } from '../../src/shared/nfo.ts'

let dirs: string[] = []
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

describe('a tvshow.nfo’s ids', () => {
  test('as Sonarr writes it: id and uniqueid for TheTVDB, IMDb and TMDB', () => {
    expect(
      showIdsFromNfo(`<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<tvshow>
  <title>Chernobyl</title>
  <id>360893</id>
  <uniqueid type="tvdb" default="true">360893</uniqueid>
  <uniqueid type="imdb">tt7366338</uniqueid>
  <uniqueid type="tmdb">87108</uniqueid>
</tvshow>`),
    ).toEqual({ tvdb: 360893, tmdb: 87108, imdb: 'tt7366338' })
  })

  test('the provider tags, the older id, and links', () => {
    expect(showIdsFromNfo('<tvshow><tvdbid>78107</tvdbid><tmdbid>2996</tmdbid></tvshow>')).toEqual({
      tvdb: 78107,
      tmdb: 2996,
      imdb: null,
    })
    expect(showIdsFromNfo('<tvshow><id>tt0290978</id></tvshow>')).toEqual({
      tvdb: null,
      tmdb: null,
      imdb: 'tt0290978',
    })
    expect(showIdsFromNfo('https://www.themoviedb.org/tv/2996-the-office')).toMatchObject({
      tmdb: 2996,
    })
    expect(showIdsFromNfo('<tvshow><title>No ids</title></tvshow>')).toEqual({
      tvdb: null,
      tmdb: null,
      imdb: null,
    })
  })

  test('read from a show’s folder, whatever its case; none is null', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'highsea-show-nfo-'))
    dirs.push(dir)
    expect(await readShowNfo(dir)).toBeNull()
    writeFileSync(join(dir, 'TVShow.NFO'), '<tvshow><title>No ids</title></tvshow>')
    expect(await readShowNfo(dir)).toBeNull()
    writeFileSync(
      join(dir, 'TVShow.NFO'),
      '<tvshow><uniqueid type="tvdb">78107</uniqueid></tvshow>',
    )
    expect(await readShowNfo(dir)).toEqual({ tvdb: 78107, tmdb: null, imdb: null })
    expect(await readShowNfo(join(dir, 'missing'))).toBeNull()
  })
})
