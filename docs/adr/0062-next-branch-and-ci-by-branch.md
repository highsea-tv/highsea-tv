# 0062. The `next` branch and CI by branch: a fast check on every pull request, the heavy jobs once per push to `next`

- **Status:** Accepted
- **Date:** 2026-11-06

Scoped in [next-branch.md](../plans/next-branch.md) and approved with the owner's answers of 2026-11-06 (every recommendation).

## Context

Until 2026-11-06 every pull request ran every workflow, about 13 jobs whatever its base branch: `ci.yml`'s `check`, `playback`, `leak` and `image` on two platforms, `e2e.yml`, `desktop.yml`'s three builds, and `native.yml`'s `ios` and `tvos`. Three of them run on macOS. GitHub Free allows 20 jobs at once and only 5 on macOS ([Actions limits](https://docs.github.com/en/actions/reference/limits)), so three task pull requests opened together queued behind each other; PR #4's `ios` job waited more than half an hour. The repository is public, so the runners cost nothing ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)): the problem is waiting, not cost.

The task pull requests already target a work branch, not `main`, and each task runs the sweeps and screenshots locally before it's marked ready. `main` had no protection. Releases fail on purpose unless they run from `main` ([ADR 0050](0050-release-and-versioning.md)), and the docs deploy from `main` (its 2026-10-23 section).

The alternatives were GitHub's merge queue on `main`, with the heavy jobs only in the queue ([Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)), and leaving CI as it was.

## Decision

**Two branches.** Work collects on `next`, the work branch renamed on 2026-11-06 ([Renaming a branch](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch)). Shepherdr's tasks branch from it and their pull requests merge into it. `main` changes only when the owner merges `next` into it through a pull request, and stays the default branch, so the front page, the README and the release links show what's released.

**Two tiers.**

| Tier | Jobs | When it runs |
| --- | --- | --- |
| Fast | `ci.yml`'s `check` (lint, types, the Bun tests, the platform under Node, licences, the dependency check, the client's exports, the admin's and the docs' builds), and `catalog.yml` when the catalog changes, as before | every pull request, and every push to `next` or `main` (`catalog.yml`: a push to `main`) |
| Heavy | `ci.yml`'s `playback`, `leak` and `image`; `e2e.yml`; `desktop.yml`; `native.yml` | a push to `next`, a pull request into `main`, a pull request with the `full-ci` label, and a release |

- **How.** The heavy workflows take `push` on `next` only, and `pull_request` on every base branch with `types: [opened, synchronize, reopened, labeled]`, keeping their own paths ([Events that trigger workflows › pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)). Their jobs carry one condition, written once per workflow with its reason and repeated with a YAML alias where a workflow has several jobs ([YAML anchors and aliases](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations#yaml-anchors-and-aliases)):

  ```yaml
  if: >-
    (github.event_name == 'pull_request'
      && (github.base_ref == 'main' || contains(github.event.pull_request.labels.*.name, 'full-ci')))
    || (github.event_name == 'push' && github.ref == 'refs/heads/next')
    || (github.event_name != 'pull_request' && github.event_name != 'push')
  ```

  `github.base_ref` is a pull request's base branch, and `contains()` over `github.event.pull_request.labels.*.name` finds the label ([Contexts › github](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#github-context), [Expressions › contains](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#contains)). The last line lets a release through: `release.yml` calls `ci.yml` and `e2e.yml` whole, and a called workflow's `github` context is its caller's, whose event is `workflow_dispatch` ([Reusing workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)).
- **A push to `main` runs only `check`** (the owner's answer 3): the pull request from `next` already ran everything on the same result, and a release runs it all again.
- **`check` has no path filter on pull requests.** A workflow skipped by its path or branch filters leaves its required checks pending, which blocks the merge, while a job skipped by its `if:` reports success ([Troubleshooting required status checks › Handling skipped but required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)). So `ci.yml` keeps its `paths-ignore` for pushes only, and a pull request that changes only the internal docs runs `check` too. For the same reason no heavy workflow filters its pull requests by branch.
- **Pushes to `next`.** Each workflow's `cancel-in-progress` concurrency group is per branch, so when the owner accepts three tasks in a row, only the last push's heavy run finishes: one full run for the round.

**The label.** `full-ci` (`gh label create full-ci --repo highsea-tv/highsea-tv --color B60205 --description "Run the heavy CI jobs on this pull request"`) is for a pull request into `next` likely to break the heavy jobs: packaging, the Dockerfile, the native and desktop builds, and the workflows. Adding it starts a run (`labeled`). Any other label starts one too, and cancels the run in progress; `check` then runs again rather than being skipped, so a skipped run never stands in for a failed one.

**The rulesets** ([About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets); [REST › Create a repository ruleset](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)), applied by the coordinator after the owner's Accept:

- **`next`:** a pull request, `check` passing, no force pushes.
- **`main`:** the same, with every job that always runs on a pull request into `main` required: `check`, `playback`, `leak`, `image (linux/amd64, ubuntu-24.04)` and `image (linux/arm64, ubuntu-24.04-arm)`. `e2e`, `desktop`'s builds, `ios` and `tvos` are left out, since their workflows' paths can skip them and a skipped workflow's check stays pending.
- **The organisation's admins bypass both** (`OrganizationAdmin`, `bypass_mode: always`), so the owner can still push a fix directly.

Each required check names GitHub Actions' app (`integration_id` 15368), so only a check from a workflow satisfies it.

**Not a merge queue** (the owner's answer 6). A merge queue runs the full suite for every merge, so a round of three pull requests costs three full runs; `next` costs one, and needs no organisation-level rulesets.

## Consequences

- **A task's pull request is back in about the time `check` takes,** and only `check` runs; the heavy workflows start, and their jobs show as skipped.
- **A heavy failure is found later.** A change that breaks the image or the iOS build passes its pull request into `next` and fails on the push after it's merged. `next` is then red until a fix lands, and the pull request into `main` blocks the release. The `full-ci` label is for the changes likely to do that.
- **A docs-only pull request now runs `check`,** where before it ran nothing. That's the price of `check` being safe to require.
- **`main`'s docs deploy when `next` reaches it,** not when a part is committed ([ADR 0050](0050-release-and-versioning.md)'s 2026-11-06 section).
- **Narrower path filters and larger runners** are left for later (the plan's Out of scope).
