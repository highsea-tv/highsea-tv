// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addCatalogChange,
  catalogNote,
  imageTags,
  nextCatalogVersion,
  notesOf,
  prepare,
  problemsOf,
  REPOSITORY,
  readChangelog,
  taggedVersions,
  trustProblems,
} from './release.ts'

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added

- Smart collections, built from **rules**.
- A [guide](https://docs.highsea.tv/install) for \`compose\`,
  on two lines.

### Fixed

- A toast's label.

## [0.1.0] - 2026-11-02

### Added

- The first release.

[unreleased]: ${REPOSITORY}/compare/v0.1.0...HEAD
[0.1.0]: ${REPOSITORY}/releases/tag/v0.1.0
`

const files = () => ({
  changelog: CHANGELOG,
  server: `${JSON.stringify({ name: '@highsea-tv/server', version: '0.1.0' }, null, 2)}\n`,
  releases: '',
  catalogChanges: '# Catalog changes\n\nNewest first.\n\n## 2026.11.2\n\n- A definition.\n',
})

describe('the image’s tags', () => {
  test('a stable release moves its line, latest and beta while it’s the newest', () => {
    expect(imageTags('0.1.0', [])).toEqual(['0.1.0', '0.1', 'latest', 'beta'])
    expect(imageTags('0.2.0', ['0.1.0'])).toEqual(['0.2.0', '0.2', 'latest', 'beta'])
  })

  test('a fix to an older line moves only that line', () => {
    expect(imageTags('0.1.1', ['0.2.0', '0.1.0'])).toEqual(['0.1.1', '0.1'])
  })

  test('a beta moves only beta, and a stable release after a newer beta leaves beta alone', () => {
    expect(imageTags('0.2.0-beta.1', ['0.1.0'])).toEqual(['0.2.0-beta.1', 'beta'])
    expect(imageTags('0.1.1', ['0.2.0-beta.1', '0.1.0'])).toEqual(['0.1.1', '0.1', 'latest'])
    // the stable 0.2.0 is newer than its own betas (SemVer § 11)
    expect(imageTags('0.2.0', ['0.2.0-beta.2', '0.1.0'])).toEqual([
      '0.2.0',
      '0.2',
      'latest',
      'beta',
    ])
  })

  test('only v-prefixed SemVer tags count, newest first', () => {
    expect(taggedVersions(['v0.1.0', 'v0.2.0-beta.1', 'v0.10.0', 'catalog-1', 'v1'])).toEqual([
      '0.10.0',
      '0.2.0-beta.1',
      '0.1.0',
    ])
  })
})

describe('the changelog', () => {
  test('reads Unreleased and each version’s section', () => {
    const { unreleased, sections } = readChangelog(CHANGELOG)
    expect(unreleased).toStartWith('### Added')
    expect(unreleased).toEndWith("- A toast's label.")
    expect(sections).toEqual([
      { version: '0.1.0', date: '2026-11-02', body: '### Added\n\n- The first release.' },
    ])
  })

  test('notes are plain lines within the schema’s limits', () => {
    expect(notesOf(readChangelog(CHANGELOG).unreleased)).toEqual([
      'Smart collections, built from rules.',
      'A guide for compose, on two lines.',
      "A toast's label.",
    ])
    const long = Array.from({ length: 60 }, (_, i) => `- Change ${i} ${'x'.repeat(400)}`).join('\n')
    const notes = notesOf(long)
    expect(notes).toHaveLength(50)
    expect(notes.slice(0, 49).every((n) => n.length === 300 && n.endsWith('…'))).toBe(true)
    expect(notes[49]).toBe('And 11 more on the release’s page.')
  })
})

describe('the catalog’s version', () => {
  test('is the release’s date, or that date’s next one', () => {
    expect(nextCatalogVersion(null, '2026-11-02')).toBe('2026.11.2')
    expect(nextCatalogVersion('2026.10.21', '2026-11-02')).toBe('2026.11.2')
    expect(nextCatalogVersion('2026.11.2', '2026-11-02')).toBe('2026.11.2.2')
    expect(nextCatalogVersion('2026.11.2.2', '2026-11-02')).toBe('2026.11.2.3')
    expect(() => nextCatalogVersion('2026.11.5', '2026-11-02')).toThrow('already at 2026.11.5')
  })

  test('gains an entry above the newest', () => {
    expect(addCatalogChange(files().catalogChanges, '0.2.0', '2026-11-02')).toBe(
      `# Catalog changes\n\nNewest first.\n\n## 2026.11.2.2\n\n- ${catalogNote('0.2.0')}\n\n## 2026.11.2\n\n- A definition.\n`,
    )
  })
})

describe('preparing and checking', () => {
  test('prepare writes everything check asks for', () => {
    const before = files()
    expect(problemsOf('0.2.0', before, ['v0.1.0'])).toEqual([
      'apps/server is at 0.1.0, not 0.2.0.',
      'CHANGELOG.md has no ## [0.2.0] section.',
      'releases.json doesn’t start with 0.2.0.',
      'The catalog’s CHANGES.md doesn’t mention 0.2.0, so servers wouldn’t see it.',
    ])
    const after = prepare('0.2.0', '2026-11-09', before, ['v0.1.0'])
    expect(problemsOf('0.2.0', after, ['v0.1.0'])).toEqual([])

    expect(JSON.parse(after.server).version).toBe('0.2.0')
    expect(JSON.parse(after.releases)).toEqual([
      {
        version: '0.2.0',
        channel: 'stable',
        date: '2026-11-09',
        notes: [
          'Smart collections, built from rules.',
          'A guide for compose, on two lines.',
          "A toast's label.",
        ],
        url: `${REPOSITORY}/releases/tag/v0.2.0`,
      },
    ])
    const changelog = readChangelog(after.changelog)
    expect(changelog.unreleased).toBe('')
    expect(changelog.sections.map((s) => [s.version, s.date])).toEqual([
      ['0.2.0', '2026-11-09'],
      ['0.1.0', '2026-11-02'],
    ])
    expect(after.changelog).toContain(
      `[unreleased]: ${REPOSITORY}/compare/v0.2.0...HEAD\n[0.2.0]: ${REPOSITORY}/compare/v0.1.0...v0.2.0\n[0.1.0]: ${REPOSITORY}/releases/tag/v0.1.0\n`,
    )
    expect(after.changelog.match(/^\[unreleased\]/gim)).toHaveLength(1)
  })

  test('a beta goes to the beta channel', () => {
    const after = prepare('0.2.0-beta.1', '2026-11-09', files(), ['v0.1.0'])
    expect(JSON.parse(after.releases)[0].channel).toBe('beta')
  })

  test('refuses a version that isn’t newer than every tag, or isn’t SemVer', () => {
    expect(() => prepare('0.1.0', '2026-11-09', files(), ['v0.1.0'])).toThrow(
      '0.1.0 isn’t newer than v0.1.0',
    )
    expect(() => prepare('0.2', '2026-11-09', files(), [])).toThrow('isn’t a SemVer version')
    expect(problemsOf('0.1.0', files(), ['v0.1.0'])[0]).toBe(
      '0.1.0 isn’t newer than v0.1.0, the newest tag.',
    )
  })

  test('check catches notes edited after prepare', () => {
    const after = prepare('0.2.0', '2026-11-09', files(), ['v0.1.0'])
    const edited = { ...after, changelog: after.changelog.replace('built from', 'made from') }
    expect(problemsOf('0.2.0', edited, ['v0.1.0'])).toEqual([
      'releases.json’s 0.2.0 entry doesn’t match the changelog; prepare again.',
    ])
  })

  test('the repository’s changelog is ready: Unreleased prepares, or the server’s version is released', () => {
    const root = join(import.meta.dir, '..')
    const read = (p: string) => {
      try {
        return readFileSync(join(root, p), 'utf8')
      } catch {
        return ''
      }
    }
    const repo = {
      changelog: read('CHANGELOG.md'),
      server: read('apps/server/package.json'),
      releases: read('catalog/indexers/releases.json'),
      catalogChanges: read('catalog/indexers/CHANGES.md'),
    }
    const version = JSON.parse(repo.server).version
    const { unreleased, sections } = readChangelog(repo.changelog)
    if (sections.some((s) => s.version === version)) {
      // released: what prepare wrote still agrees (the tags themselves are git's, not the tree's)
      expect(problemsOf(version, repo, [])).toEqual([])
    } else {
      expect(unreleased).not.toBe('')
      const after = prepare(version, '2026-11-02', repo, [])
      expect(problemsOf(version, after, [])).toEqual([])
    }
  })
})

describe('trust', () => {
  test('a release is signed with a listed release key, and so is the seed', () => {
    expect(trustProblems(['release-2027'], ['release-2027'], 'release-2027')).toEqual([])
    expect(trustProblems([], ['development', 'development'], undefined)).toEqual([
      'No release key is listed in packages/catalog/src/keys.ts (catalog/keys/README.md).',
      'HIGHSEA_CATALOG_KEY_ID isn’t set, so the catalog would be signed with the development key.',
      "The image's seed is signed with development; sign it with the release key.",
    ])
    expect(trustProblems(['release-2027'], ['release-2027'], 'release-2028')).toEqual([
      'The catalog would be signed with release-2028, which isn’t a release key.',
    ])
  })
})
