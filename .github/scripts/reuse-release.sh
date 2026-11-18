#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Whether a release from next can stand on next's own run of a whole workflow (ci.yml or e2e.yml)
# for the commit it releases, instead of running it again (ADR 0050's 2026-11-17 section). It
# writes `reused=true` to $GITHUB_OUTPUT only when every condition below holds, and
# `reused=false` otherwise, on any error included, so the release then calls the workflow whole.
#
#   1. The release runs on next (REF is refs/heads/next). From main, or any other branch, it runs
#      every check itself, as before.
#   2. There's a push run of this workflow file on next, from this repository, for exactly SHA, the
#      commit the release started from (GET /repos/{owner}/{repo}/actions/workflows/{file}/runs,
#      https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow).
#      A push run takes its workflow file from the commit pushed
#      (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push),
#      so the same SHA is the same workflow and the same tree; only the newest such run counts.
#   3. That run finished, and its conclusion, the latest attempt's, is `success`: every job in it
#      passed or was skipped by its own `if:` (never `failure`, `cancelled` or `timed_out`).
#
# While that run is still queued or in progress, it waits for it (up to WAIT_MINUTES), since
# next's run starts at the merge and is usually well on before anyone presses Release.
#
#   bash .github/scripts/reuse-release.sh <workflow file> [minutes to wait]
#
# The rest comes from the environment: REPO, REF, SHA, GH_TOKEN for `gh` (the job needs
# `actions: read`), and POLL_SECONDS (default 30).
set -uo pipefail

WORKFLOW="${1:-${WORKFLOW:-}}"
WAIT_MINUTES="${2:-${WAIT_MINUTES:-30}}"

out="${GITHUB_OUTPUT:-/dev/stdout}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

run_it() {
  echo "Running $WORKFLOW in the release: $1"
  echo "reused=false" >> "$out"
  exit 0
}

[ "${REF:-}" = refs/heads/next ] || run_it "the release isn't from next"
[ -n "${SHA:-}" ] && [ -n "${WORKFLOW:-}" ] && [ -n "${REPO:-}" ] || run_it "an input is missing"

runs() {
  gh api "repos/$REPO/actions/workflows/$WORKFLOW/runs?event=push&branch=next&head_sha=$SHA&per_page=20" \
    --jq "[.workflow_runs[]
      | select(.head_sha == \"$SHA\" and .event == \"push\" and .head_branch == \"next\"
          and .path == \".github/workflows/$WORKFLOW\"
          and .head_repository.full_name == \"$REPO\" and .repository.full_name == \"$REPO\")]
      | sort_by(.run_number) | reverse"
}

deadline=$(($(date +%s) + WAIT_MINUTES * 60))
while :; do
  found=$(runs) || run_it "next's runs couldn't be read"
  [ "$(jq 'length' <<< "$found")" -gt 0 ] || run_it "next has no push run of $WORKFLOW for $SHA"
  run=$(jq '.[0]' <<< "$found")
  [ "$(jq -r '.status' <<< "$run")" = completed ] && break
  [ "$(date +%s)" -lt "$deadline" ] || run_it "next's run is still going after $WAIT_MINUTES minutes"
  echo "Waiting for next's run $(jq -r '.html_url' <<< "$run") ($(jq -r '.status' <<< "$run"))"
  sleep "${POLL_SECONDS:-30}"
done

url=$(jq -r '.html_url' <<< "$run")
conclusion=$(jq -r '.conclusion' <<< "$run")
[ "$conclusion" = success ] || run_it "next's run $url ended $conclusion"

echo "Reusing $WORKFLOW from next's run $url, the same commit ($SHA)"
echo "::notice::$WORKFLOW passed on next for this commit ($url), so the release doesn't run it again"
{
  echo "### $WORKFLOW: reused from next"
  echo
  echo "Passed on next for $SHA in $url."
} >> "$summary"
echo "reused=true" >> "$out"
