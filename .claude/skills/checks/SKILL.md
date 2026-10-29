---
name: checks
description: Run highsea's checks under Node 26.11 (lint, typecheck, tests, smoke, licences, audit, the docs build and the browser sweeps) and summarise the results with their numbers. Use before a checkpoint report or a commit, after a small fix (the scoped mode), or when asked to run the checks or the sweeps.
argument-hint: "[quick | scoped | full]  (quick: lint, typecheck, tests; scoped: what a fix touched, with its sweeps; full: everything, before a report)"
---

# Run the checks

Everything runs under **Node 26.11.1** (`.nvmrc`). On this Mac the first `node` on PATH is Homebrew's, another version, so put 26.11.1 first in **every** command:

```sh
export PATH="$HOME/.nvm/versions/node/v26.11.1/bin:$PATH"
node --version   # v26.11.1; scripts/check-node.ts fails the smoke test and server sweep otherwise
```

If `better-sqlite3` fails to load after a Node switch, reinstall: `rm -rf node_modules && bun install`.

## Quick (before any commit)

```sh
bun run lint && bun run typecheck && bun run test
bun run --filter @highsea-tv/docs build        # when apps/docs or anything it imports changed
actionlint                                     # when .github/workflows changed (brew install actionlint; shellcheck checks the run: steps)
```

Use `bun run test`, never a bare `bun test`: it passes `--isolate`, and without it a DOM test's `fetch` leaks into the server tests.

## Scoped (after a small fix)

For a fix between checkpoint reports, check what it touched and nothing else, and say in the reply what ran and that the full set waits for the report:

- **Tests and types:** `bun run lint`, then the touched workspaces' typecheck and tests (`bun test --isolate <folder>`), not the whole repo.
- **Sweeps:** only the platform the fix touched. A prototype change to the web screens is `bun scripts/sweeps/pages.ts web` and `bun scripts/sweeps/keyboard.ts web` (a minute or two); `admin` and `mobile` likewise. `dpad.ts` only when TV screens changed. `server.ts` only when `apps/server`, `apps/web` or what they serve changed (`server.ts pages` or `keyboard` halves it).
- **Nothing else:** smoke, licences, audit and the docs build only when the fix touched what they check (Node, dependencies, `apps/docs`).

## Full (before a checkpoint report)

The quick checks, then:

```sh
bun run smoke       # the platform under Node, as production runs it
bun run licenses    # every dependency compatible with AGPL-3.0
bun run audit       # high or critical advisories; dated exceptions in scripts/audit-exceptions.json
```

Then the sweeps (`scripts/sweeps/README.md`). Run them in the background and wait for their notifications rather than polling. The prototypes' three build and serve the prototypes themselves (about 5½ minutes together on a 12-core Mac); nothing needs starting first.

```sh
bunx playwright-core install chromium      # once per machine
bun scripts/sweeps/pages.ts
bun scripts/sweeps/keyboard.ts
bun scripts/sweeps/dpad.ts
bun scripts/sweeps/server.ts               # builds, then boots its own seeded production server on :3150
bun scripts/sweeps/playback.ts             # the web player in Chromium and Firefox, on :3140 (install firefox once)
```

If the work touched packaging, also run `docker compose -f compose.dev.yaml up --build`, then `HIGHSEA_IMAGE=highsea:dev bun scripts/e2e/run.ts` and `bun scripts/image.ts size highsea:dev 2300` and `bun scripts/image.ts hardware highsea:dev`.

## Known false alarms

Don't report these as failures. Do report anything else.

- A toast caught mid-fade fails contrast (`pages.ts` waits for animations to avoid it).
- In `server.ts` with `SWEEP_DEV=1`, a page that calls `notFound()` can throw "Failed to execute 'measure' on 'Performance' … negative time stamp" in development, and Next's dev overlay then shows up as a keyboard stop (vercel/next.js#86060). Production builds don't have it.
- The keyboard sweep once had a hidden focus stop on `/web/settings/devices` (1440) and `/web/settings/home` (390) that a re-run didn't repeat. On 2026-10-28 the same finding (one stop, `hidden: span ""`, a Radix focus guard) was traced to the announcement dialog still mounted in its exit animation; `acknowledge` in `scripts/sweeps/lib.ts` now waits for the dialog itself to unmount. If it comes back, find the cause rather than re-running until it passes.
- The tests that need ffmpeg or `unar` skip and say so when those are missing. Report the skip count.

## Reporting

Give a table with the numbers each check printed: lint's file count, tests' pass/skip/fail and file count, licences' package count, the audit's package count and any exceptions with their expiry dates, and pages per sweep. Say they ran under Node 26.11.1.

For a commit body, compress it into the house line:

```
- Checks under Node 26.11: lint, typecheck, 11,394 tests pass (6 skipped), smoke, licences, audit, the docs build and the sweeps clean
```

Name only the checks that actually ran. If something failed, say so with its output. Never round a failure into "clean".
