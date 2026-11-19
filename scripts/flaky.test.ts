// SPDX-License-Identifier: AGPL-3.0-only
// The flaky report over a fixture of gh's own output (scripts/fixtures/flaky), trimmed from real
// runs: CI's run 44458790578, whose tests (bun 4/4) failed and passed on its re-run; Release's run
// 44371744243, whose macOS build was cancelled and passed on its re-run; and two runs of commit
// 871b2ec, one failing playback and one that skipped it, which is no flake.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { candidates, collect, failedTests, type Gh, type Run, report } from './flaky.ts'

const FIXTURES = join(import.meta.dir, 'fixtures', 'flaky')
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')

/** A gh that answers from the fixture and refuses anything else, so no test reaches GitHub. */
function fakeGh() {
  const asked: string[] = []
  const gh: Gh = (args) => {
    const line = args.join(' ')
    asked.push(line)
    if (args[0] === 'run' && args[1] === 'list') return fixture('runs.json')
    const jobs =
      /^api repos\/\{owner\}\/\{repo\}\/actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs\?per_page=100$/.exec(
        line,
      )
    if (jobs) return fixture(`jobs-${jobs[1]}-${jobs[2]}.json`)
    const log = /^run view --job (\d+) --log-failed$/.exec(line)
    if (log) return fixture(`log-${log[1]}.txt`)
    throw new Error(`the fixture has no answer for gh ${line}`)
  }
  return { gh, asked }
}

describe('the flaky report', () => {
  test('reads the jobs of re-runs and of commits run twice, and nothing else', () => {
    const runs = JSON.parse(fixture('runs.json')) as Run[]
    expect(candidates(runs).map((r) => r.databaseId)).toEqual([
      44458790578, 44371744243, 44221122851, 44219341723,
    ])
  })

  test('finds the jobs that failed and passed on one commit, and the tests that failed', () => {
    const { gh, asked } = fakeGh()
    const { found } = collect(gh, 300, true)
    expect(found).toEqual([
      {
        workflow: 'CI',
        job: 'check',
        sha: '4a84d0337d82ce198793298bdeb6453498c7a9c8',
        run: 44458790578,
        attempt: 1,
        steps: ['Every job passed'],
        tests: [],
        cancelled: false,
      },
      {
        workflow: 'CI',
        job: 'tests (bun 4/4)',
        sha: '4a84d0337d82ce198793298bdeb6453498c7a9c8',
        run: 44458790578,
        attempt: 1,
        steps: ['Tests (Bun)'],
        tests: [
          'HLS with ffmpeg > a transcode that waits too long gives up with the limit as its reason',
        ],
        cancelled: false,
      },
      {
        workflow: 'Release',
        job: 'desktop (macos-15, universal-apple-darwin)',
        sha: '02a9c93b8361c4858a169b8018cb9f4661f68d54',
        run: 44371744243,
        attempt: 1,
        steps: [],
        tests: [],
        cancelled: true,
      },
      {
        workflow: 'Release',
        job: 'github-release',
        sha: '02a9c93b8361c4858a169b8018cb9f4661f68d54',
        run: 44371744243,
        attempt: 1,
        steps: ['Everything the release needs passed'],
        tests: [],
        cancelled: false,
      },
      {
        workflow: 'Release',
        job: 'outcome',
        sha: '02a9c93b8361c4858a169b8018cb9f4661f68d54',
        run: 44371744243,
        attempt: 1,
        steps: ['Every job ended as the release needs'],
        tests: [],
        cancelled: false,
      },
    ])
    // one log read: not the gates', nor the cancelled job's; and playback, failed on 871b2ec and
    // skipped in its other run, is no flake
    expect(asked.filter((a) => a.startsWith('run view'))).toEqual([
      'run view --job 135340349719 --log-failed',
    ])
  })

  test('says the most frequent first, with the gates apart', () => {
    const { gh } = fakeGh()
    const { runs, found } = collect(gh, 300, true)
    expect(report(found, runs)).toEqual([
      '5 runs read (2026-11-18 01:54 to 2026-11-19 04:30 UTC).',
      '2 failed jobs then passed on the same commit:',
      '',
      '1×  CI › tests (bun 4/4)',
      '    test: HLS with ffmpeg > a transcode that waits too long gives up with the limit as its reason',
      '    4a84d03 (run 44458790578, attempt 1)',
      '1×  Release › desktop (macos-15, universal-apple-darwin)',
      '    cancelled, with no step failed: its time limit?',
      '    02a9c93 (run 44371744243, attempt 1)',
      '',
      'With them, the gates that read their results: CI › check (1), Release › github-release (1), Release › outcome (1).',
    ])
  })

  test('nothing flaky is said so', () => {
    const runs = JSON.parse(fixture('runs.json')) as Run[]
    expect(report([], runs).at(-1)).toBe('No job failed and then passed on the same commit.')
  })

  test('names Bun’s and Jest’s failed tests once each', () => {
    expect(failedTests(fixture('log-135340349719.txt'))).toEqual([
      'HLS with ffmpeg > a transcode that waits too long gives up with the limit as its reason',
    ])
    // Jest heads each failure with "●" and the describe and test names joined by "›"
    const jest = [
      'tests (jest 2/3)\tRun jest\t2026-11-18T03:00:00.0000000Z   ● the player › says why a film didn’t start',
      'tests (jest 2/3)\tRun jest\t2026-11-18T03:00:00.0000000Z     expect(received).toBe(expected)',
    ].join('\n')
    expect(failedTests(jest)).toEqual(['the player › says why a film didn’t start'])
  })
})
