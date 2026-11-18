// SPDX-License-Identifier: AGPL-3.0-only
// .github/scripts/reuse-release.sh against a fake `gh` that answers from a table, so nothing
// reaches the network: a release from next reuses next's whole run of a workflow only for the
// same commit, a push run of the same file, and a run that succeeded.
import { describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(import.meta.dir, '..', '.github', 'scripts', 'reuse-release.sh')
const REPO = 'highsea-tv/highsea-tv'
const SHA = 'a'.repeat(40)

// `gh api <path> [--jq <filter>]`: the answer for the path without its query, through jq like gh's
// --jq. An answer `{"__seq": [...]}` gives the next item on each call (a run that finishes later).
const FAKE_GH = `#!/usr/bin/env bash
set -euo pipefail
[ "$1" = api ] || exit 2
path="\${2%%\\?*}"
filter=.
[ "\${3:-}" = --jq ] && filter="$4"
answer=$(jq -ce --arg k "$path" '.[$k]' "$FAKE_DIR/answers.json") || { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }
if jq -e 'type == "object" and has("__seq")' <<< "$answer" > /dev/null; then
  counter="$FAKE_DIR/$(echo "$path" | tr '/' '_')"
  n=$(cat "$counter" 2>/dev/null || echo 0)
  echo $((n + 1)) > "$counter"
  answer=$(jq -c --argjson n "$n" '.__seq[[$n, (.__seq | length) - 1] | min]' <<< "$answer")
fi
jq -r "$filter" <<< "$answer"
`

const RUNS = `repos/${REPO}/actions/workflows/ci.yml/runs`

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    run_number: 70,
    html_url: 'https://github.com/highsea-tv/highsea-tv/actions/runs/7',
    path: '.github/workflows/ci.yml',
    event: 'push',
    head_branch: 'next',
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
    head_repository: { full_name: REPO },
    repository: { full_name: REPO },
    ...overrides,
  }
}

function reuse(runs: unknown, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-reuse-release-'))
  writeFileSync(join(dir, 'gh'), FAKE_GH)
  chmodSync(join(dir, 'gh'), 0o755)
  writeFileSync(join(dir, 'answers.json'), JSON.stringify(runs === null ? {} : { [RUNS]: runs }))
  const output = join(dir, 'output')
  const result = Bun.spawnSync(['bash', SCRIPT, 'ci.yml', '1'], {
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      FAKE_DIR: dir,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      REPO,
      REF: 'refs/heads/next',
      SHA,
      POLL_SECONDS: '0',
      ...env,
    },
  })
  return { out: readFileSync(output, 'utf8').trim(), log: result.stdout.toString() }
}

describe('a release from next reusing next’s run', () => {
  test('a successful push run of the same file for the same commit: reused', () => {
    const r = reuse({ workflow_runs: [run()] })
    expect(r.out).toBe('reused=true')
    expect(r.log).toContain("Reusing ci.yml from next's run")
  })

  test('a release from main or a task branch runs it', () => {
    expect(reuse({ workflow_runs: [run()] }, { REF: 'refs/heads/main' }).out).toBe('reused=false')
    expect(reuse({ workflow_runs: [run()] }, { REF: 'refs/heads/task/43' }).out).toBe(
      'reused=false',
    )
  })

  test('a run that failed, was cancelled or timed out: run it', () => {
    for (const conclusion of ['failure', 'cancelled', 'timed_out'])
      expect(reuse({ workflow_runs: [run({ conclusion })] }).out).toBe('reused=false')
  })

  test('only the newest run for the commit counts', () => {
    const runs = [run({ run_number: 71, id: 8, conclusion: 'failure' }), run()]
    expect(reuse({ workflow_runs: runs }).out).toBe('reused=false')
  })

  test('another commit, event, file, branch or repository doesn’t count', () => {
    for (const other of [
      { head_sha: 'b'.repeat(40) },
      { event: 'pull_request' },
      { path: '.github/workflows/e2e.yml' },
      { head_branch: 'main' },
      { head_repository: { full_name: 'someone/highsea-tv' } },
    ])
      expect(reuse({ workflow_runs: [run(other)] }).out).toBe('reused=false')
  })

  test('no run, or an API error: run it', () => {
    expect(reuse({ workflow_runs: [] }).out).toBe('reused=false')
    expect(reuse(null).out).toBe('reused=false')
  })

  test('waits for a run still going, then reuses it once it passes', () => {
    const r = reuse({
      __seq: [
        { workflow_runs: [run({ status: 'in_progress', conclusion: null })] },
        { workflow_runs: [run()] },
      ],
    })
    expect(r.log).toContain("Waiting for next's run")
    expect(r.out).toBe('reused=true')
  })
})
