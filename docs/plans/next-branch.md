# A `next` branch, and CI by branch

A follow-up asked for by the owner on 2026-11-06, while the first round of D3's review fixes (HT-1 to HT-3) waited on CI: running every workflow on every pull request is slow and uses a lot of compute. Scoped on 2026-11-06, and approved with the owner's answers of 2026-11-06 (every recommendation). It's built now, between rounds: after HT-1 to HT-3 and HT-5 are accepted, and before HT-4 starts.

## Read first

1. `CLAUDE.md` (the git rules) and `docs/status.md`.
2. The six workflows in `.github/workflows/`: `ci.yml`, `e2e.yml`, `desktop.yml`, `native.yml`, `catalog.yml` and `release.yml`.
3. [ADR 0050](../adr/0050-release-and-versioning.md) (releases come from `main`; its 2026-10-23 section has the docs deploying from `main`).
4. The `signoff`, `checks` and `handoff` skills in `.claude/skills/`, and the folder's Shepherdr settings (`herdr-task config --json`).

## Goal

Work collects on a `next` branch, and `main` changes only when the owner merges `next` into it. Each task's pull request into `next` runs only the fast check, so it's back in about 12 minutes. The heavy jobs run once for each push to `next`, and in full on the pull request from `next` into `main`. Releases, the docs' deploy and the catalog work as they do now.

## Out of scope

- **Narrower path filters** (for example, iOS and tvOS only when `apps/client` changes). Most changes touch `packages/**`, which nearly every workflow watches, so this saves little. It can follow on its own.
- **Self-hosted or larger runners.** The repository is public, so standard GitHub-hosted runners cost nothing ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). Waiting time is the problem, not cost.
- **The release workflow's steps.** `release.yml` already calls `ci.yml` and `e2e.yml` whole from `main`, and that stays.
- **The flaky scale tests.** HT-5 gives their setup more time, separately.
- **How the coordinator spaces each task's ports.** That's in the task briefs, not the repository.

## Where things stand

- **Every pull request runs about 13 jobs,** whatever its base branch:
  - `ci.yml`: `check`, `playback`, `leak` and `image` on two platforms.
  - `e2e.yml`: the end-to-end run.
  - `desktop.yml`: three builds.
  - `native.yml`: `ios` and `tvos`.

  Three of them run on macOS: the Mac desktop build, `ios` and `tvos`. GitHub Free allows 20 jobs at once, and only 5 on macOS ([Actions limits](https://docs.github.com/en/actions/reference/limits)). So three pull requests open together queue behind each other. On 2026-11-06, PR #4's `ios` job waited more than half an hour.
- **Pushes:** every workflow but the release runs on a push to `main`. `cancel-in-progress` is already set per branch, so a newer push cancels an older run on the same branch.
- **Branches:**
  - The work branch is `claude/determined-maxwell-xohgoy`. The task pull requests target it, because Shepherdr's worktrees branch from the checkout's `HEAD`, and the folder's `base` setting is empty.
  - `main` has no protection and no rulesets.
  - On 2026-11-06, GitHub's copy of the work branch was two commits behind this checkout: D2 (`9a2fc14`) and D3 (`d741191`). So PR #4 listed 598 changed files where its own commit changes 2. That is fixed by pushing the work branch, which the owner decides.
- **Deploys:**
  - Vercel's `highsea-docs` deploys pushes to `main` and makes previews for other branches (ADR 0050's 2026-10-23 section).
  - `highsea-packages` deploys `main` only when what it depends on changed.
  - Releases fail on purpose unless they run from `main` (`release.yml`'s "A real release comes from main").

## The size of this, and its parts

One gated part. It's small, but it changes how every later change lands, so it's reviewed before the next round of tasks starts.

## Progress

- **The branch (A), done on 2026-11-06:** `claude/determined-maxwell-xohgoy` was pushed with D2 and D3, HT-1 to HT-3 and HT-5 accepted into it, and it was renamed `next` on GitHub and in the owner's checkout. Shepherdr's tasks now branch from `next` and merge into it.
- **CI by branch, the workflow around it and the ADRs (A), built on 2026-11-06 (HT-6) and accepted by the owner on 2026-11-06 (PR #8 merged into `next`):**
  - `ci.yml`'s `check` runs on every pull request and every push to `next` or `main`. Its pull requests have no path filter any more, so `check` always reports and both branches can require it; a docs-only pull request now runs it too.
  - The heavy jobs (`ci.yml`'s `playback`, `leak` and `image`, `e2e.yml`, `desktop.yml`, `native.yml`) carry one condition per workflow, with its reason and GitHub's docs beside it, repeated with a YAML alias where a workflow has several jobs: a push to `next`, a pull request into `main`, a pull request with `full-ci`, and a release. The heavy workflows push on `next` only, take every pull request with `labeled` added to the types, and keep their paths. A push to `main` runs only `check`. Every action stays pinned to its SHA.
  - The `signoff`, `checks` and `handoff` skills, CLAUDE.md's git rule and "Now", and `docs/architecture.md`'s commands follow; ADR 0062 and 0050's 2026-11-06 section record it.
  - Checked with `actionlint` and `bun run lint`, and by this part's own pull request into `next` (#8), which ran only `check` while every heavy job showed as skipped.
  - Left for the coordinator after the owner's Accept: the `full-ci` label and the two rulesets (their bodies are in HT-6's Accept card). Still to prove after the merge: the first push to `next` running everything, and a pull request with `full-ci` running everything.
  - Not done here: the `work-through-shepherdr-tasks` memory lives outside the repository, so the coordinator updates it.
  - **Applied by the coordinator after the Accept, on 2026-11-06:** the `full-ci` label, and the rulesets `next` (a pull request, `check`, no force-push) and `main` (the same, with `playback`, `leak` and both `image` matrix checks), each bypassed by organisation admins. The coordinator's memory is updated. Still to prove: the first push to `next` running every job (running for `a5b68ae` at the sign-off), a pull request with `full-ci`, the pull request from `next` into `main` reporting the image checks by the names `main` requires, and a release run.

## The branch (A)

- **`next` is the work branch, renamed.** First `claude/determined-maxwell-xohgoy` is pushed, so GitHub's copy has D2 and D3. Then it's renamed `next` in GitHub's settings. Renaming a branch on GitHub retargets the open pull requests that have it as their base, and old links to it redirect, but closes any open pull request it is the head of, so none may be open from it ([Renaming a branch](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch)). This checkout then follows the new name: `git branch -m`, then `git fetch` and `git branch -u origin/next`.
- **Shepherdr branches from `next`:** `herdr-task config` sets the folder's `tasks.base` to `next`, so a task's worktree, its pull request and the merge after the owner's Accept all use `next`.
- **`main` stays the default branch,** so the repository's front page, the README and the release links keep pointing at what's released.

## CI by branch (A)

Each job falls in one of two tiers:

| Tier | Jobs | When it runs |
| --- | --- | --- |
| Fast | `ci.yml`'s `check` (lint, types, the Bun tests, the platform under Node, licences, the dependency check, the client exports, the admin's and the docs' builds), and `catalog.yml` when the catalog changes | every pull request, and every push to `next` or `main` |
| Heavy | `ci.yml`'s `playback`, `leak` and `image`; `e2e.yml`; `desktop.yml`; `native.yml` | a push to `next`, a pull request into `main`, a pull request with the `full-ci` label, and a release |

- **How:**
  - Each heavy workflow keeps its own paths.
  - `pull_request` gains `branches: [main]` (for `pull_request`, the filter matches the base branch) and `types: [opened, synchronize, reopened, labeled]`.
  - `push` lists `[next, main]`.

  ([Workflow syntax › on.pull_request.branches](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpull_requestpull_request_targetbranchesbranches-ignore); [Events that trigger workflows › pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).)
- **The label:**
  - A pull request into `next` reaches the heavy jobs only through the `full-ci` label. So the heavy workflows also take `pull_request` without the branch filter.
  - Their jobs carry one condition: run unless the event is a pull request into another branch without the label.
  - `ci.yml`'s heavy jobs get the same condition, and `check` has none.
  - The condition is written once, in a comment at the top of each workflow, with its reason.
- **Pushes to `next`:** the existing `cancel-in-progress` means that when the owner accepts three tasks in a row, only the last push's heavy run finishes. That's one full run for the round instead of three.
- **A push to `main`** runs only `check` (answer 3): the pull request from `next` already ran everything on the same result, and a release runs it all again.
- **`release.yml`** keeps calling `ci.yml` and `e2e.yml` through `workflow_call`. The tier condition lets a called run through whole, since its event is `workflow_dispatch`, not `pull_request`.
- **Checked by:** `actionlint` on the workflows. Then one pull request into `next` that runs only `check`, the same pull request with `full-ci` added that runs everything, and the first push to `next` that runs everything.

## Branch rules (A)

GitHub rulesets, which public repositories have on GitHub Free ([About rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)):

- **`next`:** changes go through a pull request, `check` must pass, and no force pushes.
- **`main`:** changes go through a pull request, every heavy job and `check` must pass, and no force pushes.
- **The organisation's admins can bypass both,** so the owner can still push a fix directly.

## The workflow around it (A)

- **`signoff`:** a part's commit is pushed to `next`. "Merge" means opening, or updating, the pull request from `next` into `main` and merging it once its checks pass. It still says that pushing to `main` deploys docs.highsea.tv, and that the docs now go out when `next` reaches `main`, not when a part is committed.
- **`checks`:** the full local run before a checkpoint report stays as it is. The skill says which checks CI runs at which tier.
- **`CLAUDE.md`'s git rule:** work lands on `next`, and `main` changes only through the owner's merge. Kept to one line.
- **`docs/architecture.md`'s commands:** the branches and the tiers.
- **The `work-through-shepherdr-tasks` memory:** the task pull requests target `next`.

## ADRs

- **New: 0062, the `next` branch and CI by branch.** It covers the two branches, the two tiers, the label, the rulesets, and why this was chosen over a merge queue.
- **Dated section: 0050,** "2026-11-06: work lands on `next`". Releases and the docs still come from `main`, which now changes only through a merge from `next`.

## Risks

- **A heavy failure is found later.** A change that breaks the image or the iOS build passes its pull request into `next` and fails on the push after it's merged. `next` is then red until a fix lands, and the pull request into `main` blocks the release. The `full-ci` label is for changes likely to break those jobs: packaging, the Dockerfile, the native and desktop builds, and the workflows.
- **Renaming the branch while pull requests are open.** GitHub retargets them, but each task's worktree still tracks the old name. Renaming between rounds, after the owner's Accepts, avoids it.
- **Required checks and path filters.** A required check whose workflow is skipped by its paths stays "pending" and blocks the merge, as GitHub's docs describe ([Troubleshooting required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)). So `main`'s rules can require only jobs that always run on a pull request into `main`. Otherwise those jobs need a step that always passes when their paths didn't change. The build checks this with a pull request that changes only a guide.

## Open questions for the owner

1. **The branch's name.**
   **Recommended:** `next`, as the owner suggested. It's short, and it says what it holds: what goes out next.
   Or: `develop`, the Git Flow name, familiar to contributors but longer.
   Or: keep `claude/determined-maxwell-xohgoy`, with nothing renamed, but the name says nothing.
2. **What a pull request into `next` runs.**
   **Recommended:** only `check`, the fast tier, about 12 minutes. The tasks already run the sweeps and screenshots locally before they mark themselves ready.
   Or: `check` and the end-to-end run, which catches a broken image sooner, but adds about 11 minutes and a second job to every pull request.
3. **A push to `main`.**
   **Recommended:** only `check`. The pull request from `next` already ran everything on the same result, and a release runs it all again.
   Or: everything, as now. It's a record on `main` itself, at the cost of a second full run for every merge.
4. **The `full-ci` label.**
   **Recommended:** add it, so a change that's likely to break the heavy jobs can run them before it's merged.
   Or: no label, which is simpler, and a heavy failure always shows after the merge into `next`.
5. **Branch rules.**
   **Recommended:** rulesets on both branches as above, with the organisation's admins able to bypass them.
   Or: no rules, only the convention. Nothing to set up, but nothing stops a direct push to `main`.
6. **A merge queue instead of `next`.**
   **Recommended:** no. A merge queue runs the full suite for every merge, so a round of three pull requests costs three full runs. `next` costs one.
   Or: GitHub's merge queue on `main`, where the heavy jobs run only in the queue ([Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)). That's one branch, but with more runs and organisation rulesets to set up.
7. **When.**
   **Recommended:** now, between rounds. Push the work branch, accept HT-1 to HT-3 into it, rename it `next` and change the workflows, then start HT-4.
   Or: after D3's sign-off, which leaves HT-4's round on today's CI.

## The owner's changes

## The owner's answers

On 2026-11-06 the owner took every recommendation for questions 1 to 7:

1. The branch is `next`, the work branch renamed.
2. A pull request into `next` runs only `check`.
3. A push to `main` runs only `check`.
4. The `full-ci` label runs the heavy jobs on a pull request into `next`.
5. Rulesets on `next` and `main`, which the organisation's admins can bypass.
6. `next`, not a merge queue.
7. Built now, between rounds: the work branch pushed, HT-1 to HT-3 and HT-5 accepted into it, renamed `next` and the workflows changed, then HT-4.
