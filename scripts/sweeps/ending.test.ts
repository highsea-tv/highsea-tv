// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { keepLatestRun } from './ending.ts'

test('only the latest run’s sheet stays, with one still running and one compared with', () => {
  const run = () => mkdtempSync(join(tmpdir(), 'highsea-layout-'))
  const finished = (dir: string) => {
    writeFileSync(join(dir, 'results.json'), '{}')
    return dir
  }
  const earlier = finished(run())
  const compared = finished(run())
  const running = run()
  // the builds share the prefix and six letters, and are never a run
  const builds = join(tmpdir(), 'highsea-layout-builds')
  mkdirSync(builds, { recursive: true })
  const target = finished(mkdtempSync(join(tmpdir(), 'highsea-layout-iphone-')))
  const latest = finished(run())

  expect(keepLatestRun('highsea-layout-', latest, 'results.json', [compared])).toEqual([earlier])
  for (const kept of [compared, running, builds, target, latest])
    expect(existsSync(kept)).toBe(true)
  expect(existsSync(earlier)).toBe(false)
})
