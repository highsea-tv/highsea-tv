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

## 2026-11-17: a pull request of internal docs alone skips `check` (HT-29)

The owner asked for this on 2026-11-17, after pull request #32, which changed only notes and docs, ran the whole of `check`. The Decision above gave `check` no path filter on pull requests and accepted that a docs-only pull request runs it. That changes for pull requests only.

- **A first job, `changes`,** lists a pull request's files with `git diff --name-only --no-renames base...head`: the event's `pull_request.base.sha` and `pull_request.head.sha` ([Webhook events › pull_request](https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request)), compared from where the head branched, after a checkout with `fetch-depth: 0`. Its output `code` is `false` only when every file is on the list `paths-ignore` gives pushes: `docs/**`, `.claude/**`, `README.md` and `CLAUDE.md`. Any other event (a push, a release calling `ci.yml`, whose event is `workflow_dispatch`) says `true` without looking. No new action: it uses the `actions/checkout` the file already pins.
- **`check` needs `changes`** and carries `if: ${{ !cancelled() && needs.changes.outputs.code != 'false' }}`. A job skipped by its `if:` reports success, so `next` and `main`, which require `check`, still merge; a workflow skipped by a path filter would leave the check pending ([Troubleshooting required status checks › Handling skipped but required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)). The same page warns that a job whose `needs` failed is skipped and may not block the merge, so `check` runs whenever `changes` didn't say `false`: a failed `changes` leaves the output empty, and `!cancelled()` keeps `check` from being skipped with it ([Expressions › Status check functions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions)).
- **The required check keeps its name,** `check`, and the rulesets are unchanged. The heavy jobs don't need `check`, so a pull request into `main` or one labelled `full-ci` runs them as before, docs-only or not.
- **What a docs-only pull request shows:** `changes` passes with a notice ("Only the internal docs changed, so check is skipped"), `check` shows as skipped, which counts as passing, and the heavy jobs as skipped (into `next`) or run (into `main`, or with `full-ci`).
- **The two lists must match:** `paths-ignore` and the `case` in `changes`. A file outside them, such as `catalog/keys/README.md` in #32, still runs `check`.

## 2026-11-17: workers run scoped checks, CI is the full gate (HT-42)

The Context above says each task ran the sweeps and screenshots locally before it was marked ready, which is part of why the heavy jobs could wait for the push to `next`. The owner changed that on 2026-11-17: highsea is pre-production, serving one user, and a full local run (about an hour) repeated most of what CI runs ([phase-3-server.md's standing rules](../plans/phase-3-server.md#standing-rules)).

- **A task's worker runs the scoped checks** for what it touched (lint, the touched workspaces' types and tests, and the one sweep that shows a visible change), and marks the task ready without waiting on CI, unless its change is to CI itself. The coordinator watches CI and sends a failure back.
- **CI is the full gate.** The tiers above are unchanged. A change likely to break the heavy jobs still takes the `full-ci` label; otherwise the push to `next` is where the heavy jobs first run it.
- **Full local runs are only for what CI can't do:** the browser sweeps, `one-place` and `controls.ts` at a gate, the simulators and the desktop app on the Mac, the owner's NAS, and a release's install on it. The `checks` skill names each.
- **What follows:** a worker's change reaches `next` having run fewer checks, so `next` is red more often until the coordinator sends the failure back, and a heavy failure is still found after the merge, as the Consequences above say.

## 2026-11-17: CI's wait cut: the fast tier in parallel, and next's results reused on the pull request into `main` (HT-40)

The owner asked for this on 2026-11-17: a task's pull request waited 17 to 26 minutes for `check`, and the pull request from `next` into `main` about an hour, rebuilding what `next` had just built (#38's `ios` alone took 53 minutes). Every test still runs, and a release still runs everything.

**The fast tier runs in parallel.** `check`'s steps took 18 minutes on one runner, 11 of them the tests (393 s Bun's, 262 s the client's Jest). Its steps are now five jobs that start together after `changes`, each with the same `if:` HT-29 gave `check`:

| Job | What |
| --- | --- |
| `lint` | lint, types, licences, cargo-audit and the dependency check |
| `tests` | a matrix: Bun's files in 4 shards (the first also runs the platform under Node, beside its ffmpeg), the client's Jest files in 3 |
| `exports` | the client's web and desktop exports |
| `builds` | the admin's and the docs' builds |
| `check` | needs the four; passes only when each passed and the shards ran every test file exactly once |

- **Bun's shards** are its own `bun test --shard=i/4`, balanced by the per-file durations in `scripts/test-timings.json` through `--timings`; a file with no entry counts as the median, and each shard's output lists only its own files ([Parallel & isolated test runs](https://bun.com/docs/test/parallel)). Each file still runs with `--isolate`, as `bun run test` runs it. Jest's are `jest --shard=i/3` ([Jest CLI › --shard](https://jestjs.io/docs/cli#--shard)). Every shard keeps the list of what it ran (Bun's timings, Jest's `--json`), and `check` compares the union with the checkout's test files, by Bun's documented names ([Test runner › Run tests](https://bun.com/docs/test)) and Jest's `testMatch`: a file no shard ran, or two ran, fails it (`scripts/test-shards.ts`, with its tests).
- **`check` keeps its name** and the rulesets are unchanged. A job whose `needs` failed is skipped, and a skipped job reports success ([Troubleshooting required status checks › Handling skipped but required checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)), so `check` runs with `!cancelled()` and its first step fails unless every needed job's `result` is `success`: never `failure`, `cancelled` or `skipped` ([Contexts › needs](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context)). A cancelled run cancels `check` too, which never counts as passing. With the internal docs alone, all five are skipped by the same condition and report success, as before.
- **cargo-audit** is RustSec's prebuilt binary, installed by `taiki-e/install-action` (pinned to v2.89.1's commit), which downloads it from rustsec/rustsec's release and checks it against the SHA-256 in its manifest ([install-action](https://github.com/taiki-e/install-action#usage)), rather than 143 s of `cargo install` on every run. `cargo audit` still fetches the advisory database on every run.

**The pull request into `main` reuses `next`'s results.** Each heavy job (`playback`, `leak`, both `image`s, `e2e`, the three desktop `build`s, `ios`, `tvos`) begins with a step, `.github/scripts/reuse-next.sh`, that on a pull request into `main` asks the REST API whether the same job passed in `next`'s push run for the same commit ([Workflow runs](https://docs.github.com/en/rest/actions/workflow-runs), [Workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs)). If it did, every later step is skipped and the job passes under its own name; a job whose steps are skipped by their `if:` still succeeds. The steps are skipped rather than the job, since a matrix job skipped by its `if:` reports under its bare id (`image`) rather than the names `main` requires (`image (linux/amd64, ubuntu-24.04)`), and those would stay pending (#48's own run showed `image` alone). It reuses a result only when all of these hold, and builds otherwise, any API error included:

- the pull request comes from this repository's `next` into `main`, and its head is `next`'s commit now ([Git references](https://docs.github.com/en/rest/git/refs#get-a-reference));
- the pull request's merge commit, which the run tests (`github.sha`, the last merge commit on `refs/pull/N/merge`, [Events that trigger workflows › pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)), has exactly the tree of `next`'s commit ([Git commits › Get a commit object](https://docs.github.com/en/rest/git/commits#get-a-commit-object)): the same files, the workflow files among them. `main` is never `next`'s ancestor, since each merge of `next` leaves a merge commit on `main` alone, so an ancestor rule would never reuse; the trees match whenever `main` holds nothing `next` lacks (on 2026-11-17, `main` was 2 merge commits ahead of `next` and `git merge-tree` of the two gave `next`'s tree, `4ab1ca1`);
- the run is of the same workflow file (`path`), a `push` on `next` from this repository, for exactly that SHA (`head_sha`). A push run takes its workflow from the commit pushed ([Events that trigger workflows › push](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)), so the same SHA is the same workflow version; and only the newest such run counts;
- that run's latest attempt concluded `success`, and the job of the same name in it (`filter=latest`) concluded `success`: never `failure`, `cancelled`, `timed_out` or `skipped`.

While `next`'s run for that commit is still going, the step waits for it, for as long as leaves the job time to build after all within its limit (0 to 30 minutes). The jobs need `actions: read`, and `release.yml` gives it to its `ci` and `e2e` calls, since a called workflow can only lower its caller's permissions ([Reusing workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)). A release's event isn't a pull request, so it never reuses anything. The script's cases are tested against a fake `gh` (`scripts/reuse-next.test.ts`). GitHub's merge queue and `workflow_run` were the documented alternatives: the first was declined in the Decision above, and a `workflow_run` workflow reports its checks on the default branch's commit rather than the pull request's, so it can't stand in for a required check.

**A push to `next` runs every heavy workflow whatever it changed.** The reuse is for the exact commit only, and `next`'s commit is often one whose paths skip a workflow (a release's record, a docs change), which before left nothing to reuse. Pull requests keep their path filters, and `ci.yml` no longer has `paths-ignore` for pushes, so a docs-only push to `main` runs the fast tier (a few minutes, which nobody waits for).

**Concurrency.** A pull request's newer run cancels its older one, which tested a commit no longer its head. A push to `next` or `main` and a release are never cancelled: their group is their own run (`github.run_id`), and `cancel-in-progress` is false for them. A group per branch, as before, cancels a *pending* run when a third arrives whatever `cancel-in-progress` says ([Workflow syntax › concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency), [Control the concurrency of workflows and jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)), and the pull request into `main` relies on `next`'s run for its head.

**iOS and tvOS.** The iPhone job no longer runs the client's types and Jest tests, 20 minutes of its 47, which the fast tier already runs on every pull request and push (`bun run typecheck` takes in every workspace; the Jest shards are the same `jest` and config, whose preset is iOS's on any host). No compiler or build cache is kept, on the evidence of #48's run. React Native documents ccache ([Speeding up your build › Local caches](https://reactnative.dev/docs/build-speed#local-caches)), and with `USE_CCACHE=1` at `pod install` the Podfile points every pod's clang at React Native's `scripts/xcode/ccache-clang.sh`. That script runs `exec $CCACHE_BINARY clang`, and `CCACHE_BINARY` is an Xcode build setting, which Xcode doesn't give the compiler's environment ([react-native#46126](https://github.com/facebook/react-native/issues/46126)): the run's 1,290 compiles went straight to clang and left ccache with 0 calls and an empty folder. A cache that never fills costs only time and the repository's 10 GB of caches, which was 9.2 GB full. Pods and the generated project (`prebuild --clean` makes them anew, and `pod install` takes about a minute) and DerivedData (a fresh checkout's timestamps rebuild it, and its paths are absolute) were left out too. Nothing built there ships.

**Consequences.** A task's pull request waits for its longest fast job rather than the sum. It holds up to ten Linux runners at once rather than one, of the 20 jobs GitHub Free runs together ([Actions limits](https://docs.github.com/en/actions/reference/limits)), and each job installs again (about 50 s), so its runner time grows by a few minutes. When the runners are busy, as when `next`'s heavy run is going, its jobs queue: #48's second run waited up to 5 minutes for runners behind `next`'s and #49's, and took 9 minutes rather than 4. Even then it isn't slower than the one long job was. The pull request into `main` takes minutes when `next`'s run for its commit passed, and rebuilds only what didn't. `next` runs more heavy jobs than before (every push), which nobody waits for; the repository is public, so they cost nothing. `scripts/test-timings.json` balances the shards and drifts as tests change; a stale file only unbalances them, and it's refreshed from a run's `shard-bun-*` artifacts, which hold CI's own durations (the command is in `ci.yml`'s note on `tests`).
