// SPDX-License-Identifier: AGPL-3.0-only
// The library folders' checks on System › Health (9c), against a fake filesystem: a folder that's
// missing or read-only is an error, as Radarr's RootFolderCheck and MountCheck are; a disk that's
// all but full is an error, one that's getting full a warning, and each disk is reported once.
import { describe, expect, test } from 'bun:test'
import { type FolderFs, folderIssues } from '../src/system.ts'

const GiB = 1024 ** 3

type Disk = { dev: number; free: number; total: number }

/** A filesystem with these folders on these disks; a folder left out isn't there. */
function fakeFs(folders: Record<string, Disk & { readOnly?: boolean }>): FolderFs {
  const get = (path: string) => {
    const f = folders[path]
    if (!f) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
    return f
  }
  return {
    statSync: (path) => ({ dev: get(path).dev }),
    statfsSync: (path) => {
      const f = get(path)
      return { bavail: f.free / 4096, bsize: 4096, blocks: f.total / 4096 }
    },
    accessSync: (path) => {
      if (get(path).readOnly) throw Object.assign(new Error(`EROFS: ${path}`), { code: 'EROFS' })
    },
  }
}

const roomy: Disk = { dev: 1, free: 2000 * GiB, total: 4000 * GiB }

describe('folderIssues', () => {
  test('folders that are there, writable and on a disk with room raise nothing', () => {
    const fs = fakeFs({ '/data/movies': roomy, '/data/downloads': roomy })
    const issues = folderIssues(
      [
        { label: 'movies', path: '/data/movies' },
        { label: 'downloads', path: '/data/downloads' },
      ],
      fs,
    )
    expect(issues).toEqual([])
  })

  test('a missing folder is an error, and its disk is not checked', () => {
    const issues = folderIssues([{ label: 'movies', path: '/data/movies' }], fakeFs({}))
    expect(issues).toEqual([
      {
        id: 'folder-missing:/data/movies',
        level: 'error',
        message: expect.stringContaining('isn’t there'),
      },
    ])
  })

  test('a folder highsea cannot write to is an error', () => {
    const fs = fakeFs({ '/data/movies': { ...roomy, readOnly: true } })
    const issues = folderIssues([{ label: 'movies', path: '/data/movies' }], fs)
    expect(issues).toEqual([
      {
        id: 'folder-read-only:/data/movies',
        level: 'error',
        message: expect.stringContaining('PUID and PGID'),
      },
    ])
  })

  test('under 1 GiB free is an error, whatever the disk’s size', () => {
    const fs = fakeFs({ '/data/movies': { dev: 1, free: 0.5 * GiB, total: 4000 * GiB } })
    const [issue] = folderIssues([{ label: 'movies', path: '/data/movies' }], fs)
    expect(issue).toMatchObject({ id: 'disk-space:/data/movies', level: 'error' })
    expect(issue?.message).toContain('0.5 GB free')
  })

  test('under a tenth free and under 100 GiB is a warning', () => {
    const fs = fakeFs({ '/data/movies': { dev: 1, free: 50 * GiB, total: 1000 * GiB } })
    const [issue] = folderIssues([{ label: 'movies', path: '/data/movies' }], fs)
    expect(issue).toMatchObject({ id: 'disk-space:/data/movies', level: 'warning' })
    expect(issue?.message).toContain('95% full')
  })

  test('a large disk with under a tenth free but over 100 GiB is left alone', () => {
    const fs = fakeFs({ '/data/movies': { dev: 1, free: 500 * GiB, total: 20_000 * GiB } })
    expect(folderIssues([{ label: 'movies', path: '/data/movies' }], fs)).toEqual([])
  })

  test('two folders on one disk report its space once, under the first', () => {
    const full: Disk = { dev: 7, free: 0.2 * GiB, total: 1000 * GiB }
    const fs = fakeFs({ '/data/movies': full, '/data/downloads': full })
    const issues = folderIssues(
      [
        { label: 'movies', path: '/data/movies' },
        { label: 'downloads', path: '/data/downloads' },
      ],
      fs,
    )
    expect(issues.map((i) => i.id)).toEqual(['disk-space:/data/movies'])
  })

  test('a filesystem without statfs still has its folders checked', () => {
    const fs: FolderFs = {
      ...fakeFs({ '/data/movies': { ...roomy, readOnly: true } }),
      statfsSync: () => {
        throw new Error('ENOSYS')
      },
    }
    const issues = folderIssues([{ label: 'movies', path: '/data/movies' }], fs)
    expect(issues.map((i) => i.id)).toEqual(['folder-read-only:/data/movies'])
  })
})
