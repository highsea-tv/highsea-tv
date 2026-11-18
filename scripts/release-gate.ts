// SPDX-License-Identifier: AGPL-3.0-only
// Whether a release may publish (release.yml, ADR 0050's 2026-11-18 notes): the one rule for which
// of the release's jobs must have passed, and which may be skipped on purpose. Three places use it:
//
//   bun scripts/release-gate.ts builds  in `publishable`, from `toJSON(needs)`: it passes only when
//       every build ended as the release needs, and `merge` and `pages` run only when it passed,
//       so nothing is published while a build failed, was cancelled or never ran (run
//       44371744243 pushed the image's tags and deployed the catalog before its macOS build was
//       cancelled).
//   bun scripts/release-gate.ts wait   in `github-release`, before the tag: it reads the run's own
//       jobs (GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt}/jobs,
//       https://docs.github.com/en/rest/actions/workflow-jobs) until every one the release needs
//       has ended, and exits 0 only when the rule says go. `github-release` waits on `checks`
//       alone, so it asks for the `release` environment with the other keyed jobs and one approval
//       covers it; the jobs it publishes after are read here instead of through its `needs`.
//   bun scripts/release-gate.ts needs  in `outcome`, the run's last job, from `toJSON(needs)`
//       (https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context):
//       the run fails unless the rule says go, so a dry run proves every build passed.
//
// The rule: `checks`, `image`, `catalog` and `publishable` always pass; `spk`, `desktop` and
// `desktop-feed` pass on a stable release and are skipped on a prerelease (DSM has no place for a
// prerelease, and the desktop app ships with stable releases); `merge`, `pages` and, once it has run, `github-release`
// pass on a real release and are skipped on a dry run. A job that is skipped when it should have
// passed stops the release, like one that failed: GitHub skips every job after a skipped or failed
// one in its `needs` chain unless its `if:` uses a status function
// (https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds),
// which is how run 44267473765 skipped every build. `ci` and `e2e` aren't read here: `checks`
// speaks for them, passed or reused from next.
//
// A re-run of failed jobs works: GitHub re-runs the failed jobs and the jobs that depend on them,
// and "jobs that aren't included keep their outputs from the previous attempt"
// (https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs); the
// jobs API lists those carried-over jobs in the new attempt with their results (run 44371744243's
// attempt 2 listed `image`, `catalog`, `merge` and the rest as completed, and the cancelled macOS
// build as running again), and `needs` gives their results too.
//
// Environment: PRERELEASE and DRY_RUN (`true` or `false`); for `builds` and `needs`, NEEDS; for `wait`,
// GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, and WAIT_MINUTES (default 200)
// and POLL_SECONDS (default 30).

/** A job's result as GitHub gives it, or `pending` while it hasn't ended. */
export type Result = 'success' | 'failure' | 'cancelled' | 'skipped' | 'pending' | (string & {})

export interface Release {
  prerelease: boolean
  dryRun: boolean
}

export type Verdict = { go: 'yes' | 'wait' | 'no'; lines: string[] }

/** Every job the rule reads, in the order the release runs them. */
export const JOBS = [
  'checks',
  'image',
  'catalog',
  'spk',
  'desktop',
  'desktop-feed',
  'publishable',
  'merge',
  'pages',
  'github-release',
] as const
export type Job = (typeof JOBS)[number]

/** The builds: every job before `publishable`, which is what it reads. */
export const BUILDS = JOBS.slice(0, JOBS.indexOf('publishable'))

/** Whether the release needs `job` to pass (true) or skips it on purpose (false). */
export function wanted(job: Job, release: Release): boolean {
  switch (job) {
    case 'spk':
    case 'desktop':
    case 'desktop-feed':
      return !release.prerelease
    case 'merge':
    case 'pages':
    case 'github-release':
      return !release.dryRun
    default:
      return true
  }
}

/**
 * The verdict on `results` for the jobs in `jobs`: `yes` when every wanted job passed and every
 * other one was skipped (or passed); `no` as soon as one ended any other way; `wait` while one
 * hasn't ended and nothing has said no.
 */
export function gate(
  results: Partial<Record<string, Result>>,
  release: Release,
  jobs: readonly Job[] = JOBS,
): Verdict {
  const lines: string[] = []
  let go: Verdict['go'] = 'yes'
  for (const job of jobs) {
    const result = results[job] ?? 'pending'
    const want = wanted(job, release)
    const expected = want ? 'success' : 'skipped'
    if (result === 'pending') {
      lines.push(`${job}: still going (wanted: ${expected})`)
      if (go === 'yes') go = 'wait'
    } else if (result === 'success' || (!want && result === 'skipped')) {
      lines.push(`${job}: ${result}`)
    } else {
      lines.push(`${job}: ${result}, and the release needs it ${expected}`)
      go = 'no'
    }
  }
  return { go, lines }
}

/** `toJSON(needs)`'s results by job. */
export function fromNeeds(needs: Record<string, { result?: string }>): Record<string, Result> {
  return Object.fromEntries(Object.entries(needs).map(([job, n]) => [job, n.result ?? 'pending']))
}

/**
 * The jobs API's entries by job: a matrix job's entries are named `image (linux/amd64, …)`, and
 * the job passes only when each of them did; a skipped matrix job has one entry under its own name.
 */
export function fromJobs(
  jobs: { name: string; status: string; conclusion: string | null }[],
): Record<string, Result> {
  const byJob = new Map<string, Result[]>()
  for (const { name, status, conclusion } of jobs) {
    const job = name.replace(/ \(.*\)$/, '')
    const result = status === 'completed' ? (conclusion ?? 'pending') : 'pending'
    byJob.set(job, [...(byJob.get(job) ?? []), result])
  }
  return Object.fromEntries([...byJob].map(([job, all]) => [job, combined(all)]))
}

/** A failure first; then still going; then success only when every entry passed. */
function combined(all: Result[]): Result {
  const failed = all.find((r) => r !== 'success' && r !== 'skipped' && r !== 'pending')
  if (failed) return failed
  if (all.includes('pending')) return 'pending'
  return all.every((r) => r === 'success') ? 'success' : 'skipped'
}

function release(): Release {
  return { prerelease: process.env.PRERELEASE === 'true', dryRun: process.env.DRY_RUN === 'true' }
}

async function runJobs(): Promise<Record<string, Result>> {
  const { GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT } = process.env
  const path = `repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}/jobs?per_page=100`
  const gh = Bun.spawnSync(['gh', 'api', path, '--paginate', '--jq', '.jobs[]'])
  if (gh.exitCode !== 0) throw new Error(gh.stderr.toString().trim())
  const jobs = gh.stdout
    .toString()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return fromJobs(jobs)
}

if (import.meta.main) {
  const command = process.argv[2]
  if (command === 'builds') {
    const { go, lines } = gate(fromNeeds(JSON.parse(process.env.NEEDS ?? '{}')), release(), BUILDS)
    console.log(lines.join('\n'))
    if (go !== 'yes') {
      console.error('A build didn’t end as the release needs, so nothing is published.')
      process.exit(1)
    }
    console.log('Every build the release needs passed, so it may publish.')
  } else if (command === 'needs') {
    const { go, lines } = gate(fromNeeds(JSON.parse(process.env.NEEDS ?? '{}')), release())
    console.log(lines.join('\n'))
    if (go !== 'yes') {
      console.error('The release is incomplete: a job above didn’t end as the release needs.')
      process.exit(1)
    }
    console.log('Every job the release needs ended as it should.')
  } else if (command === 'wait') {
    // github-release reads the jobs it publishes after; itself is still running
    const jobs = JOBS.filter((job) => job !== 'github-release')
    const deadline = Date.now() + Number(process.env.WAIT_MINUTES ?? 200) * 60_000
    for (;;) {
      let verdict: Verdict
      try {
        verdict = gate(await runJobs(), release(), jobs)
      } catch (error) {
        verdict = { go: 'wait', lines: [`The run's jobs couldn't be read: ${error}`] }
      }
      if (verdict.go === 'yes') {
        console.log(verdict.lines.join('\n'))
        console.log('Every job the release needs passed, so it publishes.')
        break
      }
      if (verdict.go === 'no') {
        console.error(verdict.lines.join('\n'))
        console.error('So nothing is released.')
        process.exit(1)
      }
      if (Date.now() >= deadline) {
        console.error(verdict.lines.join('\n'))
        console.error('Still waiting at the deadline, so nothing is released.')
        process.exit(1)
      }
      console.log(`Waiting:\n${verdict.lines.join('\n')}`)
      await Bun.sleep(Number(process.env.POLL_SECONDS ?? 30) * 1000)
    }
  } else {
    console.error('bun scripts/release-gate.ts builds|needs|wait')
    process.exit(2)
  }
}
