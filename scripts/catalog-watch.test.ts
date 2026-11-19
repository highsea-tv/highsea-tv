// SPDX-License-Identifier: AGPL-3.0-only
// The monthly watch over a fake GitHub: nothing leaves the process, and only trees are asked for.
import { describe, expect, test } from 'bun:test'
import type { Fetch } from '@highsea-tv/core'
import {
  compare,
  LISTS,
  namesOf,
  normal,
  ourSiteIds,
  type WatchFile,
  watchReport,
} from './catalog-watch.ts'

/** A repository's folders as trees by sha, the way the Git trees API answers. */
function fakeGitHub(trees: Record<string, { path: string; type: string; sha: string }[]>) {
  const asked: string[] = []
  const fetch: Fetch = async (input) => {
    const url = new URL(String(input))
    asked.push(url.pathname)
    const tree = /\/git\/trees\/([^/]+)$/.exec(url.pathname)
    if (tree) {
      const entries = trees[decodeURIComponent(tree[1] as string)]
      return entries
        ? Response.json({ sha: tree[1], tree: entries, truncated: false })
        : new Response('Not Found', { status: 404 })
    }
    if (/^\/repos\/[^/]+\/[^/]+$/.test(url.pathname))
      return Response.json({ default_branch: 'main' })
    return new Response('Not Found', { status: 404 })
  }
  return { fetch, asked }
}

const prowlarr = LISTS.find((l) => l.key === 'prowlarr') as (typeof LISTS)[number]

describe('reading names', () => {
  test('walks to the busiest of the newest version folders and keeps file names alone', async () => {
    const { fetch, asked } = fakeGitHub({
      main: [
        { path: 'definitions', type: 'tree', sha: 'defs' },
        { path: 'README.md', type: 'blob', sha: 'r' },
      ],
      defs: [
        { path: 'v9', type: 'tree', sha: 'v9' },
        { path: 'v11', type: 'tree', sha: 'v11' },
        { path: 'v12', type: 'tree', sha: 'v12' },
        { path: 'v10', type: 'tree', sha: 'v10' },
      ],
      // a new format's folder, nearly empty
      v12: [{ path: 'newformat.yml', type: 'blob', sha: 'n' }],
      v10: [{ path: 'yts.yml', type: 'blob', sha: 'a' }],
      v11: [
        { path: 'yts.yml', type: 'blob', sha: 'a' },
        { path: '1337x.yml', type: 'blob', sha: 'b' },
        { path: 'schema.json', type: 'blob', sha: 'c' },
        { path: 'nested', type: 'tree', sha: 'd' },
      ],
    })
    expect(await namesOf(fetch, prowlarr)).toEqual({
      folder: 'definitions/v11',
      names: ['1337x', 'yts'],
    })
    // the repository, then one tree per folder: no file's contents (no blobs, no raw files)
    expect(asked).toEqual([
      '/repos/Prowlarr/Indexers',
      '/repos/Prowlarr/Indexers/git/trees/main',
      '/repos/Prowlarr/Indexers/git/trees/defs',
      '/repos/Prowlarr/Indexers/git/trees/v12',
      '/repos/Prowlarr/Indexers/git/trees/v11',
      '/repos/Prowlarr/Indexers/git/trees/v10',
    ])
  })

  test('a folder that moved says where it stopped', async () => {
    const { fetch } = fakeGitHub({ main: [] })
    await expect(namesOf(fetch, prowlarr)).rejects.toThrow('Prowlarr: no folder definitions.')
  })
})

describe('the comparison', () => {
  const previous: WatchFile = {
    about: '',
    lists: {
      prowlarr: {
        label: 'Prowlarr',
        folder: 'definitions/v11',
        checked: '2026-10-19',
        names: ['yts', 'knaben', 'oldsite'],
      },
      jackett: {
        label: 'Jackett',
        folder: 'src/Jackett.Common/Definitions',
        checked: '2026-10-19',
        names: ['yts', 'knaben', 'torrentscsv'],
      },
    },
  }
  const current = {
    prowlarr: {
      label: 'Prowlarr',
      folder: 'definitions/v11',
      names: ['eztv', 'knaben', 'newsite', 'yts'],
    },
    jackett: { label: 'Jackett', folder: 'src/Jackett.Common/Definitions', names: ['eztv', 'yts'] },
  }

  test('new and gone names, what carries ours, and what we lack', () => {
    const c = compare(previous, current, ['knaben', 'torrents-csv', 'yts'])
    expect(c.lists.map((l) => [l.key, l.added, l.dropped])).toEqual([
      ['prowlarr', ['eztv', 'newsite'], ['oldsite']],
      ['jackett', ['eztv'], ['knaben', 'torrentscsv']],
    ])
    expect(c.ours).toEqual([
      { id: 'knaben', carriedBy: ['Prowlarr'], droppedBy: ['Jackett'] },
      { id: 'torrents-csv', carriedBy: [], droppedBy: ['Jackett'] },
      { id: 'yts', carriedBy: ['Prowlarr', 'Jackett'], droppedBy: [] },
    ])
    expect(c.lacks).toEqual([
      { name: 'eztv', carriedBy: ['Prowlarr', 'Jackett'] },
      { name: 'newsite', carriedBy: ['Prowlarr'] },
    ])
  })

  test('the report a person reads', () => {
    const text = watchReport('2026-11-19', compare(previous, current, ['knaben', 'yts']))
    expect(text).toContain('Prowlarr (definitions/v11): 4 names, 2 new and 1 gone since 2026-10-19')
    expect(text).toContain(
      '- knaben: carried by Prowlarr; dropped by Jackett since the last run, so check the site',
    )
    expect(text).toContain('highsea lacks, carried by every list (1):\n- eztv')
    expect(text).toContain(
      'highsea lacks 2 names in all, many of them private trackers. --all lists them.',
    )
  })

  test('the first run has nothing to compare with', () => {
    const c = compare(null, current, ['yts'])
    expect(c.lists.every((l) => l.since === null && !l.added.length && !l.dropped.length)).toBe(
      true,
    )
  })

  test('names compare loosely, and the generic definitions name no site', () => {
    expect(normal('Torrents-CSV')).toBe(normal('torrentscsv'))
    const ids = ourSiteIds()
    expect(ids).toContain('internet-archive')
    expect(ids.some((id) => id.startsWith('generic-'))).toBe(false)
  })
})
