// SPDX-License-Identifier: AGPL-3.0-only
// .github/scripts/reuse-next.sh against a fake `gh` that answers from a table, so nothing reaches
// the network: it reuses next's result only for the same commit, a run of the same workflow file
// that succeeded, and the same job that succeeded.
import { describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', '.github', 'scripts', 'reuse-next.sh')
const REPO = 'highsea-tv/highsea-tv'
const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

// `gh api <path> [--jq <filter>]`: the answer for the path without its query, through jq like gh's
// --jq. An answer `{"__seq": [...]}` gives the next item on each call (a run that finishes later).
const FAKE_GH = `#!/usr/bin/env bash
set -euo pipefail
[ "$1" = api ] || exit 2
path="\${2%%\\?*}"
filter=.
[ "\${3:-}" = --jq ] && filter="$4"
echo "$2" >> "$FAKE_DIR/calls"
answer=$(jq -ce --arg k "$path" '.[$k]' "$FAKE_DIR/answers.json") || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
if jq -e 'type == "object" and has("__seq")' <<< "$answer" > /dev/null; then
  counter="$FAKE_DIR/$(echo "$path" | tr '/' '_')"
  n=$(cat "$counter" 2>/dev/null || echo 0)
  echo $((n + 1)) > "$counter"
  answer=$(jq -c --argjson n "$n" '.__seq[[$n, (.__seq | length) - 1] | min]' <<< "$answer")
fi
jq -r "$filter" <<< "$answer"
`

type Run = Record<string, unknown>

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 7,
    run_number: 70,
    html_url: 'https://github.com/highsea-tv/highsea-tv/actions/runs/7',
    path: '.github/workflows/native.yml',
    event: 'push',
    head_branch: 'next',
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    head_repository: { full_name: REPO },
    repository: { full_name: REPO },
    ...overrides,
  }
}

function answers(o: { next?: string; compare?: string; runs?: unknown; jobs?: unknown } = {}) {
  return {
    [`repos/${REPO}/git/ref/heads/next`]: { object: { sha: o.next ?? HEAD } },
    [`repos/${REPO}/compare/${BASE}...${HEAD}`]: { status: o.compare ?? 'ahead' },
    [`repos/${REPO}/actions/workflows/native.yml/runs`]: o.runs ?? { workflow_runs: [run()] },
    [`repos/${REPO}/actions/runs/7/jobs`]: o.jobs ?? {
      jobs: [
        { name: 'ios', conclusion: 'success' },
        { name: 'tvos', conclusion: 'failure' },
      ],
    },
  }
}

function reuse(table: object, env: Record<string, string> = {}, args: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-reuse-'))
  writeFileSync(join(dir, 'gh'), FAKE_GH)
  chmodSync(join(dir, 'gh'), 0o755)
  writeFileSync(join(dir, 'answers.json'), JSON.stringify(table))
  writeFileSync(join(dir, 'calls'), '')
  const output = join(dir, 'output')
  const result = Bun.spawnSync(['bash', SCRIPT, ...args], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      FAKE_DIR: dir,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      REPO,
      EVENT: 'pull_request',
      BASE_REF: 'main',
      HEAD_REF: 'next',
      HEAD_REPO: REPO,
      BASE_SHA: BASE,
      HEAD_SHA: HEAD,
      WORKFLOW: 'native.yml',
      JOB: 'ios',
      POLL_SECONDS: '0',
      ...env,
    },
  })
  const out = readFileSync(output, 'utf8').trim()
  return { out, log: result.stdout.toString(), code: result.exitCode }
}

describe('reusing next’s result on the next → main pull request', () => {
  test('the same commit, a successful run of this file and a successful job: reused', () => {
    const r = reuse(answers())
    expect(r.code).toBe(0)
    expect(r.out).toBe('reused=true')
    expect(r.log).toContain("Reusing ios from next's run")
  })

  test('the workflow, job and wait can come as arguments, as the workflows pass them', () => {
    expect(reuse(answers(), { WORKFLOW: '', JOB: '' }, ['native.yml', 'ios', '0']).out).toBe(
      'reused=true',
    )
    expect(reuse(answers(), { WORKFLOW: '', JOB: '' }, ['native.yml', 'tvos', '0']).out).toBe(
      'reused=false',
    )
  })

  test('another event, another base or head, or a fork’s next: built', () => {
    expect(reuse(answers(), { EVENT: 'push' }).out).toBe('reused=false')
    expect(reuse(answers(), { BASE_REF: 'next', HEAD_REF: 'task/1' }).out).toBe('reused=false')
    expect(reuse(answers(), { HEAD_REF: 'task/1' }).out).toBe('reused=false')
    expect(reuse(answers(), { HEAD_REPO: 'someone/highsea-tv' }).out).toBe('reused=false')
  })

  test('next has moved on from the pull request’s head: built', () => {
    expect(reuse(answers({ next: 'c'.repeat(40) })).out).toBe('reused=false')
  })

  test('main has commits next doesn’t, so the merge is another tree: built', () => {
    expect(reuse(answers({ compare: 'diverged' })).out).toBe('reused=false')
    expect(reuse(answers({ compare: 'behind' })).out).toBe('reused=false')
  })

  test('a run for another SHA, event, branch, file or repository: built', () => {
    for (const other of [
      run({ head_sha: 'c'.repeat(40) }),
      run({ event: 'pull_request' }),
      run({ head_branch: 'main' }),
      run({ path: '.github/workflows/ci.yml' }),
      run({ head_repository: { full_name: 'someone/highsea-tv' } }),
    ]) {
      expect(reuse(answers({ runs: { workflow_runs: [other] } })).out).toBe('reused=false')
    }
  })

  test('no run at all: built', () => {
    expect(reuse(answers({ runs: { workflow_runs: [] } })).out).toBe('reused=false')
  })

  test('a failed, cancelled or timed-out run: built', () => {
    for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped']) {
      expect(reuse(answers({ runs: { workflow_runs: [run({ conclusion })] } })).out).toBe(
        'reused=false',
      )
    }
  })

  test('the newest run decides, not an older success for the same SHA', () => {
    const runs = {
      workflow_runs: [
        run({ id: 6, run_number: 60 }),
        run({ id: 7, run_number: 70, conclusion: 'failure' }),
      ],
    }
    expect(reuse(answers({ runs })).out).toBe('reused=false')
  })

  test('the job failed, was skipped or isn’t in the run: built', () => {
    expect(reuse(answers(), { JOB: 'tvos' }).out).toBe('reused=false')
    expect(reuse(answers({ jobs: { jobs: [{ name: 'ios', conclusion: 'skipped' }] } })).out).toBe(
      'reused=false',
    )
    expect(reuse(answers(), { JOB: 'image (linux/amd64, ubuntu-24.04)' }).out).toBe('reused=false')
  })

  test('a run still going is waited for, then reused when it passes', () => {
    const runs = {
      __seq: [
        { workflow_runs: [run({ status: 'in_progress', conclusion: null })] },
        { workflow_runs: [run()] },
      ],
    }
    const r = reuse(answers({ runs }))
    expect(r.log).toContain("Waiting for next's run")
    expect(r.out).toBe('reused=true')
  })

  test('a run still going past the wait: built', () => {
    const runs = { workflow_runs: [run({ status: 'queued', conclusion: null })] }
    expect(reuse(answers({ runs }), { WAIT_MINUTES: '0' }).out).toBe('reused=false')
  })

  test('the API failing: built', () => {
    expect(reuse({}).out).toBe('reused=false')
  })
})
