#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Whether a heavy job on the next → main pull request can stand on the result of the same job in
# next's push run for the same commit, instead of building it again (ADR 0062's 2026-11-17
# section, next-branch.md › CI by branch). It writes `reused=true` to $GITHUB_OUTPUT only when
# every condition below holds, and `reused=false` otherwise, on any error included, so the job
# then runs whole.
#
#   1. The event is a pull request from this repository's `next` into `main`. A fork's branch
#      called next doesn't count: the head repository must be this one.
#   2. Its head commit is next's commit now (GET /repos/{owner}/{repo}/git/ref/heads/next).
#   3. main's commit is an ancestor of it (GET /repos/{owner}/{repo}/compare/{base}...{head} says
#      `ahead` or `identical`), so the pull request's merge commit has exactly next's tree: the
#      same code, and the same workflow files, as the push run built.
#   4. The push run is this workflow file's (GET /repos/{owner}/{repo}/actions/workflows/{file}/runs),
#      on next, from this repository, for exactly that SHA. A push run takes its workflow file
#      from the commit it was pushed with
#      (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push),
#      so the same SHA is the same workflow file.
#   5. That run's latest attempt finished with `success`, and the job of the same name in it
#      finished with `success` (GET /repos/{owner}/{repo}/actions/runs/{id}/jobs, `filter=latest`):
#      never `failure`, `cancelled`, `skipped` or `timed_out`.
#
# While a push run for that SHA is still queued or in progress, it waits for it (up to
# WAIT_MINUTES), since next's run usually started first and finishes before a fresh build would.
# The REST endpoints: https://docs.github.com/en/rest/actions/workflow-runs,
# https://docs.github.com/en/rest/actions/workflow-jobs, https://docs.github.com/en/rest/commits/commits#compare-two-commits,
# https://docs.github.com/en/rest/git/refs#get-a-reference. The job needs `actions: read` for the
# first two and `contents: read` for the others.
#
#   bash .github/scripts/reuse-next.sh <workflow file> <job's check name> [minutes to wait]
#
# e.g. `reuse-next.sh ci.yml "image (linux/amd64, ubuntu-24.04)" 15`. The rest comes from the
# environment: REPO, EVENT, BASE_REF, HEAD_REF, HEAD_REPO, BASE_SHA, HEAD_SHA, GH_TOKEN for `gh`,
# and POLL_SECONDS (default 30).
set -uo pipefail

WORKFLOW="${1:-${WORKFLOW:-}}"
JOB="${2:-${JOB:-}}"
WAIT_MINUTES="${3:-${WAIT_MINUTES:-40}}"

out="${GITHUB_OUTPUT:-/dev/stdout}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

build() {
  echo "Building it here: $1"
  echo "reused=false" >> "$out"
  exit 0
}

[ "${EVENT:-}" = pull_request ] || build "not a pull request"
[ "${BASE_REF:-}" = main ] && [ "${HEAD_REF:-}" = next ] || build "not the next → main pull request"
[ "${HEAD_REPO:-}" = "${REPO:-}" ] || build "the head branch is in another repository"
[ -n "${HEAD_SHA:-}" ] && [ -n "${BASE_SHA:-}" ] && [ -n "${WORKFLOW:-}" ] && [ -n "${JOB:-}" ] \
  || build "an input is missing"

next_sha=$(gh api "repos/$REPO/git/ref/heads/next" --jq '.object.sha') || build "next's commit couldn't be read"
[ "$next_sha" = "$HEAD_SHA" ] || build "the pull request's head ($HEAD_SHA) isn't next's commit ($next_sha)"

status=$(gh api "repos/$REPO/compare/$BASE_SHA...$HEAD_SHA" --jq '.status') || build "main and next couldn't be compared"
case "$status" in
  ahead | identical) ;;
  *) build "main has commits next doesn't ($status), so the merge isn't next's tree" ;;
esac

# The push runs of this workflow file on next for exactly this SHA, newest first.
runs() {
  gh api "repos/$REPO/actions/workflows/$WORKFLOW/runs?event=push&branch=next&head_sha=$HEAD_SHA&per_page=20" \
    --jq "[.workflow_runs[]
      | select(.head_sha == \"$HEAD_SHA\" and .event == \"push\" and .head_branch == \"next\"
          and .path == \".github/workflows/$WORKFLOW\"
          and .head_repository.full_name == \"$REPO\" and .repository.full_name == \"$REPO\")]
      | sort_by(.run_number) | reverse"
}

deadline=$(($(date +%s) + WAIT_MINUTES * 60))
while :; do
  found=$(runs) || build "next's runs couldn't be read"
  [ "$(jq 'length' <<< "$found")" -gt 0 ] || build "next has no push run of $WORKFLOW for $HEAD_SHA"
  run=$(jq '.[0]' <<< "$found")
  [ "$(jq -r '.status' <<< "$run")" = completed ] && break
  [ "$(date +%s)" -lt "$deadline" ] || build "next's run is still going after $WAIT_MINUTES minutes"
  echo "Waiting for next's run $(jq -r '.html_url' <<< "$run") ($(jq -r '.status' <<< "$run"))"
  sleep "${POLL_SECONDS:-30}"
done

id=$(jq -r '.id' <<< "$run")
url=$(jq -r '.html_url' <<< "$run")
conclusion=$(jq -r '.conclusion' <<< "$run")
[ "$conclusion" = success ] || build "next's run $url ended $conclusion"

job=$(gh api "repos/$REPO/actions/runs/$id/jobs?filter=latest&per_page=100" \
  --jq "[.jobs[] | select(.name == \"$JOB\")] | first | .conclusion // \"missing\"") \
  || build "the jobs of $url couldn't be read"
[ "$job" = success ] || build "$JOB in $url is $job"

echo "Reusing $JOB from next's run $url, the same commit ($HEAD_SHA)"
echo "::notice::$JOB passed on next for this commit ($url), so it isn't built again"
{
  echo "### $JOB: reused from next"
  echo
  echo "Passed on next for $HEAD_SHA in $url; main is an ancestor, so this merge is the same tree."
} >> "$summary"
echo "reused=true" >> "$out"
