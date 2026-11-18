// SPDX-License-Identifier: AGPL-3.0-only
// scripts/release-gate.ts, the rule for whether a release may publish, and release.yml's job
// conditions, which run 44267473765 showed can skip every build when `ci` and `e2e` are reused,
// and run 44371744243 showed can publish before every build has passed.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BUILDS,
  fromJobs,
  fromNeeds,
  gate,
  JOBS,
  type Release,
  type Result,
} from './release-gate.ts'

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

  test('publishable reads the builds, and only them', () => {
    expect(BUILDS).toEqual(['checks', 'image', 'catalog', 'spk', 'desktop', 'desktop-feed'])
    const builds = Object.fromEntries(BUILDS.map((job) => [job, 'success']))
    expect(gate(builds, STABLE, BUILDS).go).toBe('yes')
    expect(gate({ ...builds, spk: 'skipped', desktop: 'skipped', 'desktop-feed': 'skipped' }, PRERELEASE, BUILDS).go).toBe('yes')
    expect(gate({ ...builds, 'desktop-feed': 'skipped' }, STABLE, BUILDS).go).toBe('no')
    expect(gate(builds, DRY_RUN, BUILDS).go).toBe('yes')
  })

  test('publishable failed, so merge and pages were skipped: github-release stops', () => {
    const results = {
      ...allPassed(),
      publishable: 'failure',
      merge: 'skipped',
      pages: 'skipped',
    }
    expect(gate(results, STABLE, JOBS.slice(0, -1)).go).toBe('no')
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

describe('a re-run of failed jobs', () => {
  const entry = (name: string, status: string, conclusion: string | null) => ({
    name,
    status,
    conclusion,
  })
  // run 44371744243's attempt 2 as the jobs API listed it while the macOS build ran again: the
  // jobs carried over from attempt 1 are there with their results, and the ones still to come
  // (`desktop-feed` and after) aren't listed yet
  const attempt2 = [
    entry('reuse', 'completed', 'success'),
    entry('github-release', 'in_progress', null),
    entry('e2e', 'completed', 'skipped'),
    entry('ci', 'completed', 'skipped'),
    entry('prepare', 'completed', 'success'),
    entry('desktop (macos-15, universal-apple-darwin)', 'in_progress', null),
    entry('checks', 'completed', 'success'),
    entry('image (linux/amd64, ubuntu-24.04, amd64)', 'completed', 'success'),
    entry('catalog', 'completed', 'success'),
    entry('desktop (ubuntu-24.04, x86_64-unknown-linux-gnu)', 'completed', 'success'),
    entry('desktop (windows-2025, x86_64-pc-windows-msvc)', 'completed', 'success'),
    entry('image (linux/arm64, ubuntu-24.04-arm, arm64)', 'completed', 'success'),
    entry('spk', 'completed', 'success'),
  ]
  const waitJobs = JOBS.filter((job) => job !== 'github-release')

  test('the carried-over jobs count with their results, and the rest are waited for', () => {
    const results = fromJobs(attempt2)
    expect(results).toMatchObject({ image: 'success', catalog: 'success', spk: 'success' })
    expect(results.desktop).toBe('pending')
    const verdict = gate(results, STABLE, waitJobs)
    expect(verdict.go).toBe('wait')
    expect(verdict.lines).toContain('desktop-feed: still going (wanted: success)')
  })

  test('once the macOS build and everything after it passed: go', () => {
    const done = [
      ...attempt2.filter((e) => !e.name.startsWith('desktop (macos') && e.name !== 'github-release'),
      entry('desktop (macos-15, universal-apple-darwin)', 'completed', 'success'),
      entry('desktop-feed', 'completed', 'success'),
      entry('publishable', 'completed', 'success'),
      entry('merge', 'completed', 'success'),
      entry('pages', 'completed', 'success'),
    ]
    expect(gate(fromJobs(done), STABLE, waitJobs).go).toBe('yes')
  })

  test('the macOS build cancelled again: no', () => {
    const again = [
      ...attempt2.filter((e) => !e.name.startsWith('desktop (macos')),
      entry('desktop (macos-15, universal-apple-darwin)', 'completed', 'cancelled'),
    ]
    expect(gate(fromJobs(again), STABLE, waitJobs).go).toBe('no')
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
      // outcome and publishable read every result themselves, through the rule
      if (name === 'outcome' || name === 'publishable') continue
      for (const need of needsOf(job))
        expect(condition, `${name} on ${need}`).toContain(`needs.${need}.result == 'success'`)
    }
  })

  test('outcome reads every job the rule names', () => {
    const needs = needsOf(workflow.jobs.outcome as Job)
    for (const job of JOBS) expect(needs).toContain(job)
  })

  // Whether a job after `checks` runs, from its `if:`: every term is `!cancelled()`,
  // `!inputs.dry-run` or `needs.<job>.result == 'success'`, joined by `&&`
  const runs = (name: string, results: Record<string, string>, release: Release): boolean => {
    const condition = (workflow.jobs[name] as Job).if ?? ''
    const terms = condition
      .replace(/^\$\{\{|\}\}$/g, '')
      .split('&&')
      .map((t) => t.trim())
    return terms.every((term) => {
      if (term === '!cancelled()') return true
      if (term === '!inputs.dry-run') return !release.dryRun
      const need = term.match(/^needs\.([\w-]+)\.result == 'success'$/)
      if (!need) throw new Error(`${name}: a term the test can't read: ${term}`)
      return results[need[1] as string] === 'success'
    })
  }

  test('merge and pages need publishable, and only run when it passed', () => {
    for (const name of ['merge', 'pages']) {
      expect(needsOf(workflow.jobs[name] as Job), name).toContain('publishable')
      expect((workflow.jobs[name] as Job).if, name).toContain(
        "needs.publishable.result == 'success'",
      )
    }
    // publishable reads every build, so nothing publishes before each has ended
    expect(needsOf(workflow.jobs.publishable as Job).sort()).toEqual(['prepare', ...BUILDS].sort())
    // and nothing else publishes without it: every job that needs publishable is a publishing one
    const publishing = Object.keys(workflow.jobs).filter((name) =>
      needsOf(workflow.jobs[name] as Job).includes('publishable'),
    )
    expect(publishing.sort()).toEqual(['merge', 'outcome', 'pages'])
  })

  test('run 44371744243, as attempt 1 ended (macOS cancelled): merge and pages don’t run', () => {
    const builds: Record<string, string> = {
      prepare: 'success',
      reuse: 'success',
      ci: 'skipped',
      e2e: 'skipped',
      spk: 'success',
      checks: 'success',
      image: 'success',
      catalog: 'success',
      desktop: 'cancelled',
      'desktop-feed': 'skipped',
    }
    // desktop-feed is skipped, as it was
    expect(runs('desktop-feed', builds, STABLE)).toBe(false)
    // publishable runs, and its rule says no
    expect(runs('publishable', builds, STABLE)).toBe(true)
    const verdict = gate(builds, STABLE, BUILDS)
    expect(verdict.go).toBe('no')
    expect(verdict.lines).toContain('desktop: cancelled, and the release needs it success')
    // so it fails, and nothing publishes
    const after = { ...builds, publishable: 'failure' }
    expect(runs('merge', after, STABLE)).toBe(false)
    expect(runs('pages', { ...after, merge: 'skipped' }, STABLE)).toBe(false)
    // where before this change merge needed only image and catalog, and ran
    expect(runs('merge', { ...builds, publishable: 'success' }, STABLE)).toBe(true)
  })

  test('every build passed: merge, then pages, run; a dry run runs neither', () => {
    const passed = Object.fromEntries(['prepare', ...BUILDS, 'publishable'].map((j) => [j, 'success']))
    expect(runs('merge', passed, STABLE)).toBe(true)
    expect(runs('pages', { ...passed, merge: 'success' }, STABLE)).toBe(true)
    expect(runs('pages', { ...passed, merge: 'failure' }, STABLE)).toBe(false)
    expect(runs('merge', passed, DRY_RUN)).toBe(false)
    // a prerelease: spk and the desktop app skipped on purpose, and publishable passed
    expect(
      gate({ ...passed, spk: 'skipped', desktop: 'skipped', 'desktop-feed': 'skipped' }, PRERELEASE, BUILDS).go,
    ).toBe('yes')
  })

  test('github-release waits on publishable, merge and pages before the tag', () => {
    const source = readFileSync(join(import.meta.dir, 'release-gate.ts'), 'utf8')
    expect(source).toContain("JOBS.filter((job) => job !== 'github-release')")
    for (const job of ['publishable', 'merge', 'pages'] as const) expect(JOBS).toContain(job)
  })
})
