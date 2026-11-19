// SPDX-License-Identifier: AGPL-3.0-only
// The catalog-only publish's guard (catalog-release.yml), on manifests made here.
import { describe, expect, test } from 'bun:test'
import type { HighseaRelease } from '@highsea-tv/catalog'
import { publishProblems } from './catalog.ts'

const releases: HighseaRelease[] = [
  { version: '0.4.7', channel: 'stable', date: '2026-11-19', notes: ['Shows.'] },
]
const live = (stable: string, beta: string, r = releases) => ({
  stable: { version: stable, releases: r },
  beta: { version: beta, releases: r },
})

describe('a catalog-only publish', () => {
  test('goes out with a newer version and the same releases', () => {
    expect(
      publishProblems({ version: '2026.11.20', releases }, live('2026.11.19.5', '2026.11.19.5')),
    ).toEqual([])
    expect(
      publishProblems({ version: '2026.11.19.6', releases }, live('2026.11.19.5', '2026.11.19.5')),
    ).toEqual([])
  })

  test('stops when a channel already has the version, or a newer one', () => {
    expect(
      publishProblems({ version: '2026.11.19.5', releases }, live('2026.11.19.5', '2026.11.19.4')),
    ).toEqual([
      'stable is already at 2026.11.19.5; add a newer heading to catalog/indexers/CHANGES.md, like 2026.11.19.2 or today’s date, with what changed.',
    ])
    expect(
      publishProblems({ version: '2026.11.20', releases }, live('2026.11.19', '2026.11.21')),
    ).toHaveLength(1)
  })

  test('stops when releases.json isn’t what’s published', () => {
    const newer = [{ ...releases[0], version: '0.4.8' } as HighseaRelease, ...releases]
    expect(
      publishProblems(
        { version: '2026.11.20', releases: newer },
        live('2026.11.19.5', '2026.11.19.5'),
      ),
    ).toEqual([
      'catalog/indexers/releases.json isn’t what’s published: a catalog-only publish would change the releases servers know of. Publish with a release instead.',
    ])
  })

  test('a channel never published yet stops nothing', () => {
    expect(
      publishProblems({ version: '2026.11.20', releases }, { stable: null, beta: null }),
    ).toEqual([])
  })
})
