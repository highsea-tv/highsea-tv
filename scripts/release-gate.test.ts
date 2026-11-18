// SPDX-License-Identifier: AGPL-3.0-only
// scripts/release-gate.ts, the rule for whether a release may publish, and release.yml's job
// conditions, which run 44267473765 showed can skip every build when `ci` and `e2e` are reused.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fromJobs, fromNeeds, gate, JOBS, type Release, type Result } from './release-gate.ts'

const STABLE: Release = { prerelease: false, dryRun: false }
const PRERELEASE: Release = { prerelease: true, dryRun: false }
const DRY_RUN: Release = { prerelease: false, dryRun: true }

const allPassed = (): Record<string, Result> =>
  Object.fromEntries(JOBS.map((job) => [job, 'success']))

describe('whether a release may publish', () => {
  test('every job passed: go', () => {
    expect(gate(allPassed(), STABLE).go).toBe('yes')
  })

  test('ci and e2e skipped because next’s results were reused: go, since checks speaks for them', () => {
    const results = { ...allPassed(), ci: 'skipped', e2e: 'skipped', reuse: 'success' }
    expect(gate(results, STABLE).go).toBe('yes')
  })

  test('a prerelease: spk and the desktop app skipped on purpose', () => {
    const results = {
      ...allPassed(),
      spk: 'skipped',
      desktop: 'skipped',
      'desktop-feed': 'skipped',
    }
    expect(gate(results, PRERELEASE).go).toBe('yes')
    // and on a stable release those skips stop it
    expect(gate(results, STABLE).go).toBe('no')
  })

  test('a dry run: merge, pages and github-release skipped on purpose', () => {
    const results = {
      ...allPassed(),
      merge: 'skipped',
      pages: 'skipped',
      'github-release': 'skipped',
    }
    expect(gate(results, DRY_RUN).go).toBe('yes')
    expect(gate(results, STABLE).go).toBe('no')
  })

  test('a dry run still needs every build to pass', () => {
    const results = {
      ...allPassed(),
      merge: 'skipped',
      pages: 'skipped',
      'github-release': 'skipped',
    }
    expect(gate({ ...results, image: 'skipped' }, DRY_RUN).go).toBe('no')
    expect(gate({ ...results, 'desktop-feed': 'failure' }, DRY_RUN).go).toBe('no')
  })

  test('one publishing job failed or was cancelled: no', () => {
    for (const job of ['image', 'catalog', 'spk', 'desktop', 'desktop-feed', 'merge', 'pages'])
      for (const result of ['failure', 'cancelled', 'timed_out']) {
        const verdict = gate({ ...allPassed(), [job]: result }, STABLE)
        expect(verdict.go).toBe('no')
        expect(verdict.lines).toContain(`${job}: ${result}, and the release needs it success`)
      }
  })

  test('one skipped unexpectedly: no', () => {
    for (const job of ['image', 'catalog', 'spk', 'desktop', 'desktop-feed', 'merge', 'pages'])
      expect(gate({ ...allPassed(), [job]: 'skipped' }, STABLE).go).toBe('no')
  })

  test('run 44267473765, as it ended: no', () => {
    const run = {
      prepare: 'success',
      reuse: 'success',
      spk: 'success',
      e2e: 'skipped',
      ci: 'skipped',
      checks: 'success',
      catalog: 'skipped',
      desktop: 'skipped',
      image: 'skipped',
      merge: 'skipped',
      'desktop-feed': 'skipped',
      pages: 'skipped',
    }
    const verdict = gate(run, STABLE, JOBS.slice(0, -1))
    expect(verdict.go).toBe('no')
    expect(verdict.lines).toContain('image: skipped, and the release needs it success')
  })

  test('a job still going: wait, unless another already said no', () => {
    expect(gate({ ...allPassed(), pages: 'pending' }, STABLE).go).toBe('wait')
    expect(gate({ ...allPassed(), merge: undefined as never }, STABLE).go).toBe('wait')
    expect(gate({ ...allPassed(), pages: 'pending', image: 'failure' }, STABLE).go).toBe('no')
  })
})

describe('the results it reads', () => {
  test('toJSON(needs)', () => {
    expect(fromNeeds({ image: { result: 'success', outputs: {} } as never, merge: {} })).toEqual({
      image: 'success',
      merge: 'pending',
    })
  })

  test('the jobs API: a matrix job passes only when each entry did', () => {
    const entry = (name: string, status: string, conclusion: string | null) => ({
      name,
      status,
      conclusion,
    })
    expect(
      fromJobs([
        entry('image (linux/amd64, ubuntu-24.04, amd64)', 'completed', 'success'),
        entry('image (linux/arm64, ubuntu-24.04-arm, arm64)', 'completed', 'success'),
        entry('desktop (macos-15, universal-apple-darwin)', 'completed', 'success'),
        entry('desktop (windows-2025, x86_64-pc-windows-msvc)', 'in_progress', null),
        entry('catalog', 'completed', 'success'),
        entry('merge', 'completed', 'skipped'),
        entry('pages', 'queued', null),
        entry('spk (a, b)', 'completed', 'success'),
        entry('spk (c, d)', 'completed', 'failure'),
      ]),
    ).toEqual({
      image: 'success',
      desktop: 'pending',
      catalog: 'success',
      merge: 'skipped',
      pages: 'pending',
      spk: 'failure',
    })
  })
})

// The class of mistake behind run 44267473765: a job after `checks` whose `if:` has no status
// function inherits a skip from anywhere in its chain (`ci`, `e2e`, `spk`, `desktop`). Each must
// run on `!cancelled()` and name the result of every job it needs.
describe('release.yml’s conditions', () => {
  type Job = { needs?: string | string[]; if?: string }
  const workflow = Bun.YAML.parse(
    readFileSync(join(import.meta.dir, '..', '.github', 'workflows', 'release.yml'), 'utf8'),
  ) as { jobs: Record<string, Job> }
  const needsOf = (job: Job) => (typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []))
  const after = (name: string, seen = new Set<string>()): boolean =>
    needsOf(workflow.jobs[name] as Job).some(
      (n) => n === 'checks' || (!seen.has(n) && after(n, seen.add(n))),
    )
  const downstream = Object.keys(workflow.jobs).filter((name) => after(name))

  test('the jobs after checks are the ones the rule reads, and outcome', () => {
    expect(downstream.sort()).toEqual(
      [...JOBS.filter((j) => j !== 'checks' && j !== 'spk'), 'outcome'].sort(),
    )
  })

  test('each runs on !cancelled() and names the result of every job it needs', () => {
    for (const name of downstream) {
      const job = workflow.jobs[name] as Job
      const condition = job.if ?? ''
      expect(condition, name).toContain('!cancelled()')
      expect(condition, name).not.toContain('always()')
      // outcome reads every result itself, through the rule
      if (name === 'outcome') continue
      for (const need of needsOf(job))
        expect(condition, `${name} on ${need}`).toContain(`needs.${need}.result == 'success'`)
    }
  })

  test('outcome reads every job the rule names', () => {
    const needs = needsOf(workflow.jobs.outcome as Job)
    for (const job of JOBS) expect(needs).toContain(job)
  })
})
