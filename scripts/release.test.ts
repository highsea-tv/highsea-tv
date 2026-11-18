// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  addCatalogChange,
  catalogNote,
  changelogEntries,
  desktopFeed,
  desktopKeyProblems,
  fillUnreleased,
  groupOf,
  imageTags,
  isInternal,
  type Merged,
  nextCatalogVersion,
  notesOf,
  pickVersion,
  prepare,
  prNumberOf,
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

// bun.lock's workspaces as Bun writes them: the released ones carry the version, the rest don't
const LOCK = `{
  "lockfileVersion": 1,
  "workspaces": {
    "apps/client": {
      "name": "@highsea-tv/app",
      "version": "0.1.0",
    },
    "apps/desktop": {
      "name": "@highsea-tv/desktop",
      "version": "0.1.0",
    },
    "apps/server": {
      "name": "@highsea-tv/server",
      "version": "0.1.0",
    },
    "packages/ui": {
      "name": "@highsea-tv/ui",
      "version": "1.0.0",
    },
  },
}
`

const files = () => ({
  changelog: CHANGELOG,
  server: `${JSON.stringify({ name: '@highsea-tv/server', version: '0.1.0' }, null, 2)}\n`,
  releases: '',
  catalogChanges: '# Catalog changes\n\nNewest first.\n\n## 2026.11.2\n\n- A definition.\n',
  desktopConfig: '{\n  "productName": "highsea",\n  "version": "0.1.0",\n  "plugins": {}\n}\n',
  desktopCargo: '[package]\nname = "highsea-desktop"\nversion = "0.1.0"\nedition = "2024"\n',
  desktopLock:
    '[[package]]\nname = "heck"\nversion = "0.5.0"\n\n[[package]]\nname = "highsea-desktop"\nversion = "0.1.0"\n',
  desktopPackage: '{\n  "name": "@highsea-tv/desktop",\n  "version": "0.1.0"\n}\n',
  clientPackage: '{\n  "name": "@highsea-tv/app",\n  "version": "0.1.0"\n}\n',
  lock: LOCK,
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
      'apps/desktop/src-tauri/tauri.conf.json is at 0.1.0, not 0.2.0.',
      'apps/desktop/src-tauri/Cargo.toml is at 0.1.0, not 0.2.0.',
      'apps/desktop/src-tauri/Cargo.lock is at 0.1.0, not 0.2.0.',
      'apps/desktop/package.json is at 0.1.0, not 0.2.0.',
      'apps/client/package.json is at 0.1.0, not 0.2.0.',
      'bun.lock (apps/server) is at 0.1.0, not 0.2.0.',
      'bun.lock (apps/desktop) is at 0.1.0, not 0.2.0.',
      'bun.lock (apps/client) is at 0.1.0, not 0.2.0.',
      'CHANGELOG.md has no ## [0.2.0] section.',
      'releases.json doesn’t start with 0.2.0.',
      'The catalog’s CHANGES.md doesn’t mention 0.2.0, so servers wouldn’t see it.',
    ])
    const after = prepare('0.2.0', '2026-11-09', before, ['v0.1.0'])
    expect(problemsOf('0.2.0', after, ['v0.1.0'])).toEqual([])

    expect(JSON.parse(after.server).version).toBe('0.2.0')
    // the desktop app's version, and nothing else in its files
    expect(after.desktopConfig).toBe(before.desktopConfig.replace('0.1.0', '0.2.0'))
    expect(after.desktopCargo).toBe(before.desktopCargo.replace('0.1.0', '0.2.0'))
    expect(after.desktopLock).toContain('name = "heck"\nversion = "0.5.0"')
    expect(after.desktopLock).toContain('name = "highsea-desktop"\nversion = "0.2.0"')
    expect(JSON.parse(after.desktopPackage).version).toBe('0.2.0')
    expect(JSON.parse(after.clientPackage).version).toBe('0.2.0')
    // bun.lock's three released workspaces, and not the design system's own 1.0.0
    expect(after.lock).toBe(
      before.lock.replace(/"version": "0\.1\.0"/g, '"version": "0.2.0"'),
    )
    expect(after.lock).toContain('"version": "1.0.0"')
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
      desktopConfig: read('apps/desktop/src-tauri/tauri.conf.json'),
      desktopCargo: read('apps/desktop/src-tauri/Cargo.toml'),
      desktopLock: read('apps/desktop/src-tauri/Cargo.lock'),
      desktopPackage: read('apps/desktop/package.json'),
      clientPackage: read('apps/client/package.json'),
      lock: read('bun.lock'),
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

describe('the desktop app’s updates', () => {
  test('latest.json names each platform’s installer, its signature and its address', () => {
    const feed = desktopFeed('0.3.0', '- Playing offline.', '2026-11-20', {
      'macos/highsea.app.tar.gz': 'sig-mac\n',
      'nsis/highsea_0.3.0_x64-setup.exe': 'sig-win',
      'appimage/highsea_0.3.0_amd64.AppImage': 'sig-linux',
      'dmg/highsea_0.3.0_universal.dmg': 'not for the updater',
    })
    const base = `${REPOSITORY}/releases/download/v0.3.0`
    expect(feed).toEqual({
      version: '0.3.0',
      notes: '- Playing offline.',
      pub_date: '2026-11-20T00:00:00Z',
      platforms: {
        'darwin-aarch64': { signature: 'sig-mac', url: `${base}/highsea.app.tar.gz` },
        'darwin-x86_64': { signature: 'sig-mac', url: `${base}/highsea.app.tar.gz` },
        'windows-x86_64': { signature: 'sig-win', url: `${base}/highsea_0.3.0_x64-setup.exe` },
        'linux-x86_64': { signature: 'sig-linux', url: `${base}/highsea_0.3.0_amd64.AppImage` },
      },
    })
    expect(() => desktopFeed('0.3.0', '', '2026-11-20', {})).toThrow('No signed installer')
  })

  test('a release needs the release key in tauri.conf.json, not the development one', () => {
    const config = (pubkey: string) => JSON.stringify({ plugins: { updater: { pubkey } } })
    expect(desktopKeyProblems(config('DEV'), 'DEV')[0]).toContain('trusts the development key')
    expect(desktopKeyProblems(config('RELEASE'), 'DEV')).toEqual([])
    expect(desktopKeyProblems('{}', 'DEV')).toEqual(['tauri.conf.json has no updater pubkey.'])
  })
})

describe('the version to release', () => {
  const tags = ['v0.1.0', 'v0.4.1', 'v0.4.2', 'v0.3.0']

  test('blank or patch is the next patch after the newest tag', () => {
    expect(pickVersion('', tags)).toBe('0.4.3')
    expect(pickVersion('  ', tags, '0.4.2')).toBe('0.4.3')
    expect(pickVersion('patch', tags)).toBe('0.4.3')
    expect(pickVersion('', [])).toBe('0.0.1')
  })

  test('blank keeps a newer version prepared by hand', () => {
    expect(pickVersion('', tags, '0.5.0')).toBe('0.5.0')
    expect(pickVersion('minor', tags, '0.7.0')).toBe('0.5.0')
  })

  test('minor and major step their parts', () => {
    expect(pickVersion('minor', tags)).toBe('0.5.0')
    expect(pickVersion('major', tags)).toBe('1.0.0')
  })

  test('a step from a pre-release finishes it first', () => {
    expect(pickVersion('', ['v0.4.2', 'v0.5.0-beta.1'])).toBe('0.5.0')
    expect(pickVersion('minor', ['v0.4.2', 'v0.5.0-beta.1'])).toBe('0.5.0')
    expect(pickVersion('major', ['v0.5.0-beta.1'])).toBe('1.0.0')
    expect(pickVersion('major', ['v1.0.0-beta.1'])).toBe('1.0.0')
  })

  test('an explicit version must be SemVer and newer than every tag', () => {
    expect(pickVersion('0.6.0', tags)).toBe('0.6.0')
    expect(pickVersion('0.5.0-beta.1', tags)).toBe('0.5.0-beta.1')
    expect(() => pickVersion('0.4.2', tags)).toThrow('0.4.2 isn’t newer than v0.4.2, the newest tag.')
    expect(() => pickVersion('0.3.9', tags)).toThrow('isn’t newer than v0.4.2')
    expect(() => pickVersion('0.5', tags)).toThrow('isn’t patch, minor, major or a SemVer version')
  })
})

describe('the changelog from pull requests', () => {
  // what `merged` lists for the pull requests after 0.4.1, as GitHub named and labelled them
  const merged: Merged[] = [
    {
      number: 43,
      title: 'Find the iPhone’s refused sign-in: a typo in setup’s username',
      labels: ['bug'],
      files: ['apps/client/src/setup.tsx', 'docs/plans/phase-5-real-use.md'],
    },
    {
      number: 44,
      title: 'Draw the web client’s artwork from the page’s own server',
      labels: [],
      files: ['packages/client/src/artwork.ts'],
    },
    {
      number: 45,
      title: 'Check the web client’s artwork in the end-to-end run',
      labels: [],
      files: ['scripts/e2e/artwork.spec.ts', '.github/workflows/e2e.yml'],
    },
    {
      number: 46,
      title: 'Let an account’s username be changed (#46)',
      labels: [],
      files: ['apps/server/src/api/users.ts', 'packages/admin/src/users.tsx'],
    },
    {
      number: 47,
      title: 'Prepare 0.4.2, the first findings’ fixes, dated 2026-11-17',
      labels: [],
      files: ['CHANGELOG.md', 'apps/server/package.json'],
    },
    {
      number: 50,
      title: 'Run scoped checks in tasks and leave the full gate to CI',
      labels: [],
      files: ['.claude/skills/checks/SKILL.md', 'docs/adr/0062-next-branch-and-ci-by-branch.md'],
    },
    {
      title: 'Fix the poster’s corner on the TV',
      labels: [],
      files: ['packages/ui/src/poster.tsx'],
    },
  ]

  test('groups them by label, then by the title’s first word, Changed otherwise', () => {
    expect(groupOf(merged[0] as Merged)).toBe('Fixed')
    expect(groupOf(merged[1] as Merged)).toBe('Changed')
    expect(groupOf(merged[3] as Merged)).toBe('Added')
    expect(groupOf(merged[6] as Merged)).toBe('Fixed')
    expect(groupOf({ title: 'Add a thing', labels: ['changed'], files: [] })).toBe('Changed')
    expect(groupOf({ title: 'Tidy a thing', labels: ['enhancement'], files: [] })).toBe('Added')
  })

  test('leaves out internal-only pull requests and the release’s own', () => {
    expect(isInternal(['docs/a.md', '.claude/b.md', '.github/c.yml', 'scripts/d.ts'])).toBe(true)
    expect(isInternal(['docs/a.md', 'apps/server/x.ts'])).toBe(false)
    expect(isInternal([])).toBe(false)
    expect(changelogEntries(merged)).toBe(
      [
        '### Added',
        '',
        `- Let an account’s username be changed ([#46](${REPOSITORY}/pull/46))`,
        '',
        '### Changed',
        '',
        `- Draw the web client’s artwork from the page’s own server ([#44](${REPOSITORY}/pull/44))`,
        '',
        '### Fixed',
        '',
        `- Find the iPhone’s refused sign-in: a typo in setup’s username ([#43](${REPOSITORY}/pull/43))`,
        '- Fix the poster’s corner on the TV',
      ].join('\n'),
    )
  })

  test('fills an empty Unreleased, which prepare then releases within the catalog’s limits', () => {
    const empty = CHANGELOG.replace(/## \[Unreleased\][\s\S]*?(?=## \[0\.1\.0\])/, '## [Unreleased]\n\n')
    const { text, from } = fillUnreleased(empty, merged)
    expect(from).toBe('pull requests')
    expect(readChangelog(text).unreleased).toBe(changelogEntries(merged))
    const after = prepare('0.2.0', '2026-11-17', { ...files(), changelog: text }, ['v0.1.0'])
    expect(problemsOf('0.2.0', after, ['v0.1.0'])).toEqual([])
    expect(JSON.parse(after.releases)[0].notes).toEqual([
      'Let an account’s username be changed (#46)',
      'Draw the web client’s artwork from the page’s own server (#44)',
      'Find the iPhone’s refused sign-in: a typo in setup’s username (#43)',
      'Fix the poster’s corner on the TV',
    ])
  })

  test('a long list keeps to the catalog’s 50 lines of 300 characters', () => {
    const many: Merged[] = Array.from({ length: 60 }, (_, i) => ({
      number: i + 100,
      title: `Change ${i} ${'x'.repeat(i === 0 ? 400 : 10)}`,
      labels: [],
      files: ['apps/server/x.ts'],
    }))
    const empty = CHANGELOG.replace(/## \[Unreleased\][\s\S]*?(?=## \[0\.1\.0\])/, '## [Unreleased]\n\n')
    const { text } = fillUnreleased(empty, many)
    const notes = notesOf(readChangelog(text).unreleased)
    expect(notes).toHaveLength(50)
    expect(Math.max(...notes.map((n) => n.length))).toBeLessThanOrEqual(300)
    expect(notes[49]).toBe('And 11 more on the release’s page.')
  })

  test('entries written by hand win', () => {
    expect(fillUnreleased(CHANGELOG, merged)).toEqual({ text: CHANGELOG, from: 'hand' })
  })

  test('nothing to release is said plainly', () => {
    const empty = CHANGELOG.replace(/## \[Unreleased\][\s\S]*?(?=## \[0\.1\.0\])/, '## [Unreleased]\n\n')
    expect(() => fillUnreleased(empty, [merged[4] as Merged, merged[5] as Merged])).toThrow(
      'Nothing to release',
    )
  })

  test('the pull request’s number comes from a squash or a merge commit', () => {
    expect(prNumberOf('Let an account’s username be changed (#46)')).toBe(46)
    expect(prNumberOf('Merge pull request #39 from highsea-tv/sync/main-0.4.0-into-next')).toBe(39)
    expect(prNumberOf('Record main’s 0.4.0 squash in next’s history')).toBeUndefined()
  })
})
