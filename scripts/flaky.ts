// SPDX-License-Identifier: AGPL-3.0-only
// Which CI jobs and tests failed by chance lately (HT-72):
//
//   bun run flaky [--limit 300] [--no-logs]
//
// A job is flaky when it failed and then passed on the same commit: in a re-run of its workflow
// run (a later attempt), or in another run of the same workflow for the same commit (a push to
// `next` and its pull request, say). Skipped jobs count as neither, and so do cancelled ones,
// except in an attempt where another job failed: a job that runs past its `timeout-minutes` ends
// cancelled, and a superseded run's jobs are cancelled with nothing failed. The gates (ci.yml's
// `check`, release.yml's `outcome` and `github-release`) only say another job failed, so they're
// listed apart, after what failed. For each failed
// attempt it reads the job's failed steps and, from the failed steps' log, the tests that failed:
// Bun's `(fail) …` lines and Jest's `● …` headers. It only reads, through `gh`:
//
// - `gh run list --json …`, which lists each run's latest attempt with its `attempt` number
//   (https://cli.github.com/manual/gh_run_list);
// - the REST API's jobs for each attempt of a run, `GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs`
//   (https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt),
//   each job with its steps' conclusions;
// - `gh run view --job <id> --log-failed`, the failed steps' log of one job
//   (https://cli.github.com/manual/gh_run_view).

export type Run = {
  databaseId: number
  headSha: string
  attempt: number
  conclusion: string
  workflowName: string
  createdAt: string
}

export type Job = {
  id: number
  name: string
  conclusion: string | null
  run_id: number
  run_attempt: number
  head_sha: string
  steps?: { name: string; conclusion: string | null }[]
}

/** A failed job that passed on the same commit, and what failed in it. */
export type Flake = {
  workflow: string
  job: string
  sha: string
  run: number
  attempt: number
  /** The job's failed steps, by name. */
  steps: string[]
  /** The tests its log says failed; empty when the log wasn't read or names none. */
  tests: string[]
  /** It ended cancelled, as a job past its time limit does. */
  cancelled: boolean
}

/** Runs of each workflow on each commit that had a failed attempt worth reading jobs for. */
export function candidates(runs: readonly Run[]): Run[] {
  const groups = new Map<string, Run[]>()
  for (const r of runs) {
    const key = `${r.workflowName}\n${r.headSha}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const picked: Run[] = []
  for (const group of groups.values()) {
    // a re-run's earlier attempts may have failed whatever its last says; two runs of one
    // commit may differ
    const rerun = group.some((r) => r.attempt > 1)
    const mixed = group.some((r) => r.conclusion === 'failure') && group.length > 1
    if (rerun || mixed) picked.push(...group)
  }
  return picked
}

/** Jobs that only report the others' results (the header above). */
export const GATES = new Set(['check', 'outcome', 'github-release'])

/** Did the job fail? A cancelled one did when another job of its attempt failed. */
function failed(j: Job, attempt: readonly Job[]): boolean {
  if (j.conclusion === 'failure' || j.conclusion === 'timed_out') return true
  return j.conclusion === 'cancelled' && attempt.some((o) => o.conclusion === 'failure')
}

/** Jobs that failed on a commit where the same job (by workflow and name) also passed. */
export function flakes(jobs: readonly (Job & { workflow: string })[]): Flake[] {
  const attempts = new Map<string, Job[]>()
  for (const j of jobs) {
    const key = `${j.run_id}/${j.run_attempt}`
    attempts.set(key, [...(attempts.get(key) ?? []), j])
  }
  const byJob = new Map<string, (Job & { workflow: string })[]>()
  for (const j of jobs) {
    const key = `${j.workflow}\n${j.head_sha}\n${j.name}`
    byJob.set(key, [...(byJob.get(key) ?? []), j])
  }
  const found: Flake[] = []
  for (const group of byJob.values()) {
    if (!group.some((j) => j.conclusion === 'success')) continue
    for (const j of group.filter((j) =>
      failed(j, attempts.get(`${j.run_id}/${j.run_attempt}`) ?? []),
    ))
      found.push({
        workflow: j.workflow,
        job: j.name,
        sha: j.head_sha,
        run: j.run_id,
        attempt: j.run_attempt,
        steps: (j.steps ?? [])
          .filter((s) => s.conclusion === 'failure' || s.conclusion === 'cancelled')
          .map((s) => `${s.name}${s.conclusion === 'cancelled' ? ' (cancelled)' : ''}`),
        tests: [],
        cancelled: j.conclusion === 'cancelled',
      })
  }
  return found.sort((a, b) => b.run - a.run || a.job.localeCompare(b.job))
}

/**
 * The tests a job's log says failed, once each. A line of `gh run view --log-failed` is the job,
 * the step and a timestamp before the runner's own line, separated by tabs.
 */
export function failedTests(log: string): string[] {
  const tests = new Set<string>()
  for (const raw of log.split('\n')) {
    const line =
      raw
        .split('\t')
        .at(-1)
        ?.replace(/^\S+Z /, '') ?? ''
    // Bun: "(fail) describe > test [12.34ms]" (https://bun.com/docs/test/reporters)
    const bun = /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line.trim())
    if (bun?.[1]) tests.add(bun[1])
    // Jest: "  ● describe › test", the header of each failure (https://jestjs.io/docs/cli)
    const jest = /^\s*● (.+ › .+)$/.exec(line)
    if (jest?.[1]) tests.add(jest[1].trim())
  }
  return [...tests]
}

/** The report: each failure that passed on the same commit, the most frequent first. */
export function report(found: readonly Flake[], runs: readonly Run[]): string[] {
  const from = runs.at(-1)?.createdAt.slice(0, 16).replace('T', ' ')
  const to = runs[0]?.createdAt.slice(0, 16).replace('T', ' ')
  const head = `${runs.length} runs read (${from} to ${to} UTC).`
  if (!found.length) return [head, 'No job failed and then passed on the same commit.']
  const gates = found.filter((f) => GATES.has(f.job))
  const counts = new Map<string, Flake[]>()
  for (const f of found.filter((f) => !GATES.has(f.job))) {
    const what = f.tests.length
      ? f.tests.map((t) => `test: ${t}`)
      : f.steps.length
        ? f.steps.map((s) => `step: ${s}`)
        : [f.cancelled ? 'cancelled, with no step failed: its time limit?' : 'no failed step named']
    for (const w of what) {
      const key = `${f.workflow} › ${f.job}\n${w}`
      counts.set(key, [...(counts.get(key) ?? []), f])
    }
  }
  const jobs = found.length - gates.length
  const lines = [
    head,
    `${jobs} failed ${jobs === 1 ? 'job' : 'jobs'} then passed on the same commit:`,
    '',
  ]
  for (const [key, list] of [...counts].sort((a, b) => b[1].length - a[1].length)) {
    const [job, what] = key.split('\n')
    lines.push(`${list.length}×  ${job}`, `    ${what}`)
    lines.push(
      `    ${list.map((f) => `${f.sha.slice(0, 7)} (run ${f.run}, attempt ${f.attempt})`).join(', ')}`,
    )
  }
  if (gates.length) {
    const named = new Map<string, number>()
    for (const g of gates)
      named.set(`${g.workflow} › ${g.job}`, (named.get(`${g.workflow} › ${g.job}`) ?? 0) + 1)
    lines.push(
      '',
      `With them, the gates that read their results: ${[...named].map(([n, c]) => `${n} (${c})`).join(', ')}.`,
    )
  }
  return lines
}

/** Runs `gh` and returns what it printed; throws with its own words when it fails. */
export type Gh = (args: string[]) => string

const gh: Gh = (args) => {
  const r = Bun.spawnSync(['gh', ...args])
  if (r.exitCode !== 0) throw new Error(`gh ${args.join(' ')}: ${r.stderr.toString().trim()}`)
  return r.stdout.toString()
}

/** Reads the runs, the jobs of each candidate's attempts and the failed jobs' logs. */
export function collect(run: Gh, limit: number, logs: boolean) {
  const fields = 'databaseId,headSha,attempt,conclusion,workflowName,createdAt'
  const runs = JSON.parse(run(['run', 'list', '--limit', String(limit), '--json', fields])) as Run[]
  const jobs: (Job & { workflow: string })[] = []
  for (const r of candidates(runs))
    for (let a = 1; a <= r.attempt; a++) {
      const path = `repos/{owner}/{repo}/actions/runs/${r.databaseId}/attempts/${a}/jobs?per_page=100`
      const page = JSON.parse(run(['api', path])) as { jobs: Job[] }
      jobs.push(...page.jobs.map((j) => ({ ...j, workflow: r.workflowName })))
    }
  const found = flakes(jobs)
  // a gate's log only names the jobs it read, and a cancelled job's names no test
  if (logs)
    for (const f of found.filter((f) => !GATES.has(f.job) && !f.cancelled)) {
      const job = jobs.find(
        (j) => j.run_id === f.run && j.run_attempt === f.attempt && j.name === f.job,
      )
      if (job) f.tests = failedTests(run(['run', 'view', '--job', String(job.id), '--log-failed']))
    }
  return { runs, found }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--limit')
  const limit = at >= 0 ? Number(args[at + 1]) : 300
  if (!Number.isInteger(limit) || limit < 1) {
    console.error('--limit takes a number of runs, such as 300.')
    process.exit(1)
  }
  const { runs, found } = collect(gh, limit, !args.includes('--no-logs'))
  console.log(report(found, runs).join('\n'))
}
