---
name: checks
description: Run highsea's local checks under Node 26.11 and summarise the results with their numbers. Workers run the scoped checks for what they touched; CI is the full gate; the full local run is only what CI can't do (the browser sweeps, the simulators, the desktop app, the NAS). Use before `herdr-task ready` or a commit (scoped), at a gate (full), or when asked to run the checks or the sweeps.
argument-hint: "[scoped | quick | full]  (scoped: what a change touched, a worker's default; quick: lint, typecheck, tests over the repo; full: what CI can't run, at a gate)"
---

# Run the checks

Everything runs under **Node 26.11.1** (`.nvmrc`). On this Mac the first `node` on PATH is Homebrew's, another version, so put 26.11.1 first in **every** command:

```sh
export PATH="$HOME/.nvm/versions/node/v26.11.1/bin:$PATH"
node --version   # v26.11.1; scripts/check-node.ts fails the smoke test and server sweep otherwise
```

If `better-sqlite3` fails to load after a Node switch, reinstall: `rm -rf node_modules && bun install`.

## Who runs what (the owner, 2026-11-17)

highsea is in pre-production, serving one user, so a check runs once, in the place that can run it:

- **A worker runs the scoped checks** for what it touched, as fast feedback, then `herdr-task ready`. Not the full set.
- **CI is the full gate,** on every pull request and every push to `next` ([What CI runs](#what-ci-runs-by-branch)).
- **A worker doesn't wait on CI before `herdr-task ready`,** unless its change is to CI itself (`.github/`). The coordinator watches CI and sends a failure back to the task.
- **Full local runs are only for what CI can't do** ([Full](#full-what-ci-cant-run-at-a-gate)): the browser sweeps, the simulators and the desktop app on this Mac, the owner's NAS, and a release's install proof.

## Scoped (a worker's default)

Check what the change touched and nothing else, and say in the reply what ran:

- **Lint:** `bun run lint` (Biome over the repo, a few seconds).
- **Types:** the touched workspaces' typecheck (`bun run --cwd <workspace> typecheck`), plus `tsc -p scripts/tsconfig.json` when a script changed.
- **Tests:** the touched files' tests and their dependants' (`bun test --isolate <folder>`; `git grep` the package's name or the file's path to find who imports it); `apps/client`'s Jest tests (`bun run --cwd apps/client test <path>`) when the client changed. Never a bare `bun test` over the repo.
- **The one sweep that shows it,** when the change is visible (the platform it touched, `scripts/sweeps/README.md`): a prototype's web screen is `bun scripts/sweeps/pages.ts web <query>`, the admin or `/web` from the server is `server.ts pages`, the guides are `docs.ts <path>`, a TV screen adds `dpad.ts`, a native-only change is the simulator's sweep (`phone.ts`, `tv.ts`). Its screenshot is the change's proof.
- **What CI doesn't run, when the change could reach it:** `bun run one-place` and `bun scripts/controls.ts` when a screen, component or token changed (seconds each); `actionlint` when `.github/workflows` changed (`brew install actionlint`).
- **Nothing else:** smoke, licences, audit, the builds and the image are CI's. Run one locally only to find the cause of a CI failure.

## Quick (lint, types and tests over the repo)

```sh
bun run lint && bun run typecheck && bun run test
```

For a change too wide to scope (a shared package many depend on, a rename across the repo). Use `bun run test`, never a bare `bun test`: it passes `--isolate`, and without it a DOM test's `fetch` leaks into the server tests.

## Full (what CI can't run, at a gate)

CI runs the rest, so the full local run is only these, and only when named:

| Run | Commands | When |
| --- | --- | --- |
| The browser sweeps | `pages.ts`, `keyboard.ts`, `dpad.ts`, `server.ts`, `docs.ts` (and `compare.ts` for an admin screen's review) | a gate: a checkpoint report, a part's or phase's close |
| The checks CI doesn't have | `bun run one-place`, `bun scripts/controls.ts` | the same gates |
| The simulators | `phone.ts`, `tv.ts`, `layout.ts` (iPhone and Apple TV) | a gate that touched the phone or TV client, or when a plan names them |
| The desktop app on this Mac | `bun run --cwd apps/desktop dev` with the test identifier | a change to `apps/desktop` or what it wraps, at its gate |
| The owner's NAS | the Synology package installed and used, read-only on `/Volumes/data` | a release, and work about the NAS or the owner's library |
| A release's install proof | the release's package or image installed on the NAS, with hardware acceleration checked there (`bun scripts/image.ts hardware` on a machine with the chip) | each release, after CI's `e2e`, `image` and the release workflow; CI runs the image's end-to-end flow on Linux, not on the NAS |

The sweeps (`scripts/sweeps/README.md`) run in the background; wait for their notifications rather than polling. The prototypes' three build and serve the prototypes themselves (about 5½ minutes together on a 12-core Mac); nothing needs starting first.

```sh
bunx playwright-core install chromium      # once per machine
bun scripts/sweeps/pages.ts
bun scripts/sweeps/keyboard.ts
bun scripts/sweeps/dpad.ts
bun scripts/sweeps/server.ts               # builds, then boots its own seeded production server on :3150
bun scripts/sweeps/docs.ts                 # builds the guides, then every page of the export on :3170
```

`playback.ts`, the image and its end-to-end run are CI's heavy jobs. Run them here only to find the cause of a CI failure: `docker compose -f docker/compose.dev.yaml up --build`, then `HIGHSEA_IMAGE=highsea:dev bun scripts/e2e/run.ts` and `bun scripts/image.ts size highsea:dev` (it reports the size; there is no budget since 2026-11-05). After the end-to-end run, `bun run clean --docker` prunes Docker's build cache and dangling images (containers, tagged images and volumes stay; the `ht8` container among them).

## Afterwards (every mode)

```sh
bun run clean       # build output, and highsea-* temp folders nothing has changed in for an hour; says what it freed
```

A task's worker runs it before `herdr-task ready`, so a finished worktree keeps only its source and `node_modules`. It never touches `.dev`, `node_modules` (unless `--deps`), `/Volumes` or anything outside the checkout and the temp folder ([architecture.md § Commands](../../../docs/architecture.md#commands), Disk). Report the line it ends with.

## What CI runs, by branch

CI is the full gate. It runs two tiers ([ADR 0062](../../../docs/adr/0062-next-branch-and-ci-by-branch.md)):

- **Fast:** `ci.yml`'s `lint` (lint, types, licences, audit), `tests` (Bun's in 4 shards, the first with smoke, Jest's in 3), `exports` and `builds` side by side, and `check`, which needs them and checks the shards ran every test file once, on every pull request that changes more than the internal docs, and every push to `next` or `main`, and `catalog.yml` when the catalog changes.
- **Heavy:** `ci.yml`'s `playback` (`playback.ts`), `leak` and `image`, `e2e.yml`, `desktop.yml` (`build`) and `native.yml` (`ios`, `tvos`) on every push to `next`, the pull request from `next` into `main` (each job reusing `next`'s result for the same commit when it passed there), a pull request with the `full-ci` label, and a release. On a task's pull request into `next` without the label they show as skipped, except `e2e.yml` when it touches `catalog/**`, `packages/catalog/**`, `scripts/e2e/**`, the Dockerfile or `.dockerignore`.

So a task's pull request proves the fast tier, and the push to `next` after it's merged proves the heavy one. For a change that could break the heavy jobs (packaging, the Dockerfile, the native or desktop builds, the workflows), ask for the `full-ci` label on its pull request rather than running them here.

CI doesn't run the browser sweeps, the simulators, `one-place` or `controls.ts`; those are the scoped and full runs above.

## Known false alarms

Don't report these as failures. Do report anything else.

- A toast caught mid-fade fails contrast (`pages.ts` waits for animations to avoid it).
- In `server.ts` with `SWEEP_DEV=1`, a page that calls `notFound()` can throw "Failed to execute 'measure' on 'Performance' … negative time stamp" in development, and Next's dev overlay then shows up as a keyboard stop (vercel/next.js#86060). Production builds don't have it.
- The keyboard sweep once had a hidden focus stop on `/web/settings/devices` (1440) and `/web/settings/home` (390) that a re-run didn't repeat. On 2026-10-28 the same finding (one stop, `hidden: span ""`, a focus guard of the web renderer's dialog, which went in D3) was traced to the announcement dialog still mounted in its exit animation; `acknowledge` in `scripts/sweeps/lib.ts` now waits for the dialog itself to unmount. If it comes back, find the cause rather than re-running until it passes.
- At E3, `server.ts` once failed axe's `aria-allowed-attr` on Indexers' What changed while device builds ran beside it: react-native-web's Modal is `aria-modal` before it's `role="dialog"`. Since HT-19 `axe()` in `scripts/sweeps/lib.ts` waits for every dialog's role first (`dialogsReady`), so it shouldn't come back under load; if it does, find the cause rather than re-running until it passes.
- The tests that need ffmpeg or `unar` skip and say so when those are missing. Report the skip count.

## Reporting

Give a table with the numbers each check printed: lint's file count, tests' pass/skip/fail and file count, licences' package count, the audit's package count and any exceptions with their expiry dates, and pages per sweep. Say they ran under Node 26.11.1.

For a commit body, compress it into the house line:

```
- Checks under Node 26.11: lint, typecheck, 11,394 tests pass (6 skipped), smoke, licences, audit, the docs build and the sweeps clean
```

Name only the checks that actually ran. If something failed, say so with its output. Never round a failure into "clean".
