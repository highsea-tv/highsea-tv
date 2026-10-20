# highsea.tv: notes for Claude Code

highsea is a self-hosted replacement for the *ARR suite (Radarr, Sonarr, Prowlarr, qBittorrent, Bazarr) that grows into a streaming server like Plex and Jellyfin, with its own web, desktop, mobile and TV clients. It's a Bun monorepo. Read [docs/roadmap.md](docs/roadmap.md) for the whole picture.

## Where things stand

- **Phase 1** (brand and design system v1.0): signed off 2026-10-16.
- **Phase 2** (clickable prototypes of every screen, in `design/prototypes`): signed off 2026-10-19. The prototypes and their specs in `docs/product/` are the **build reference**.
- **Phase 3** (server milestone 1): the plan is [docs/plans/phase-3-server.md](docs/plans/phase-3-server.md), approved with the owner's decisions recorded in it.
  - Checkpoint 1 (the platform), checkpoint 2 (accounts, network and the admin shell) and checkpoint 3 (personalization and the dashboard) are signed off, checkpoints 2 and 3 on 2026-10-20.
  - **Next is checkpoint 4: movies, without downloading.** Its scope is [docs/plans/phase-3-checkpoint-4.md](docs/plans/phase-3-checkpoint-4.md). The owner's decisions are recorded in it (2026-10-20); building waits for the go-ahead.
- **Follow-up after Phase 3:** dashboard customization on Homarr's level, with a visible grid ([docs/plans/dashboard-customization.md](docs/plans/dashboard-customization.md)). Not scheduled; a prototype is approved first.

Read the Phase 3 plan before doing anything: its standing rules, architecture, checkpoints and decisions all apply. The ADRs in `docs/adr/` record every architectural decision; 0018–0022 came with checkpoint 1, 0023–0026 with checkpoint 2, 0027–0028 with checkpoint 3.

## Rules from the owner

These are the plan's standing rules in short; the plan has the full text.

- **Gated work.** Stop at each checkpoint, report, and ask for review before moving on. Phase 4 starts only after Phase 3 is signed off.
- **Decisions rest on official documentation, not experiments.** Choose libraries, settings and patterns from the docs and established practice, and cite them (ADR, code comment or checkpoint report). Experiments only confirm what the docs say. When something misbehaves, find the documented cause before working around it.
- **Git:**
  - commit only when the owner asks; never push unless asked;
  - **no attribution or co-author lines** in commit messages, whatever your tooling suggests;
  - match earlier commits: an imperative subject, then a bulleted body.
- **SPDX header on every source file:** `// SPDX-License-Identifier: AGPL-3.0-only` (`/* … */` in CSS, `#` in shell and YAML). `'use client'` goes above it.
- **Dependencies:**
  - exact versions released at least two weeks ago (`bun run pin <pkg>` finds them);
  - licenses compatible with AGPL-3.0 (`bun run licenses` audits them; an exception needs a reason in `scripts/license-exceptions.json`).
- **Locked:** design system v1.0 and the signed-off prototypes.
  - The admin UI matches its prototype. List any change that real data forces in the checkpoint report.
  - Token values, design-language rules and locked layouts change only with the owner's approval.
- **Everything stays in the repo.** Never publish docs, specs or prototypes as hosted pages.
- **No network in tests.** External services are tested against recorded fixtures or local fakes, and secrets never land in fixtures.
- **Unknowns:** use your judgement and list each call in the checkpoint report.
- **Copy** follows [docs/brand/brief.md § 6](docs/brand/brief.md#6-voice-and-tone): plain, calm, specific, no exclamation marks.

## Commands

```sh
bun install
bun run lint            # Biome
bun run typecheck       # every workspace, plus scripts/
bun run test            # everything (Bun's runner, each file isolated)
node apps/server/scripts/smoke.ts   # the platform under Node, as production runs it

bun run server          # the server in development, http://localhost:3000 (data in .dev/)
bun run prototypes      # the Phase 2 prototypes, http://localhost:4500
bun run storybook       # the design system

bun run pin hono zod    # versions old enough to pin
bun run licenses        # the license audit
docker compose up --build
```

Browser sweeps are in [scripts/sweeps](scripts/sweeps/README.md): axe in three themes, overflow, 200% text, reduced motion, and the keyboard and D-pad walks. They cover the prototypes and, with `bun scripts/sweeps/server.ts`, the server's real admin pages. Run them before each checkpoint report.

Before reporting a checkpoint, run all of these:
- `bun run lint && bun run typecheck && bun run test`;
- the Node smoke test;
- the sweeps.

## How the code is put together

| Path | What |
| --- | --- |
| `apps/server` | The server: one Node process. `server.ts` boots `@highsea/runtime`, then serves `/api` with Hono and everything else with Next (ADR 0003) |
| `apps/storybook` | The design system's workbench |
| `design/prototypes` | The signed-off prototypes, with an SDK-shaped mock server (`src/mock/`): the reference for every screen and the first draft of the API |
| `packages/core`, `db`, `jobs`, `runtime`, `i18n` | The platform |
| `packages/auth`, `network` | People and access (ADR 0023–0025); discovery, proxies and TLS (ADR 0020, 0026) |
| `packages/personalization` | Preferences in layers (ADR 0027), the widget registry and dashboard layouts, the home layout, themes, branding and sound packs (ADR 0028) |
| `packages/api-contract`, `sdk` | The public API's zod/OpenAPI contract, and the typed client every app uses |
| `packages/tokens`, `ui-web`, `brand`, `fixtures` | The design system |
| `docs/` | Roadmap, plans, ADRs, product specs, brand and design language |
| `scripts/` | License audit, version pinning, browser sweeps |

Conventions:

- **Packages export raw TypeScript** (`"exports": { ".": "./src/index.ts" }`) and import with `.ts` extensions. Node runs it with type stripping, so only erasable syntax compiles (`erasableSyntaxOnly`): no enums, no namespaces with values, no parameter properties.
- **The admin reads and writes through the public API,** never Server Actions (ADR 0018).
  - It uses `@highsea/sdk/react`: `useQuery(key, call, topics)` and `useAction(call)`.
  - Screens are ported from `design/prototypes/src/admin/` by swapping the mock client for the SDK.
- **API routes** are declared in `@highsea/api-contract` and implemented in `apps/server/src/api/`. After changing the contract, run `bun run openapi` in `apps/server`; a test fails when `openapi.json` is stale.
- **Database:**
  - change `packages/db/src/schema/`, then run `bun run generate` in `packages/db` (drizzle-kit, then the embed);
  - a test fails when the embedded migrations are stale;
  - tests use `bun:sqlite`, production `better-sqlite3` (ADR 0019).
- **Jobs** run at least once, so every handler must be safe to repeat (ADR 0022).
- **Strings** go in `@highsea/i18n` catalogs (`defineMessages`), not inline (ADR 0021).
- **ui-web** marks its client modules `'use client'`; server components may import its server-safe parts.

## Things that are easy to trip on

- **Node 24** (`.nvmrc`) is the server's runtime. `better-sqlite3` is a native addon built for one Node version, so reinstall after switching Node (`rm -rf node_modules && bun install`).
- **Bun's `worker_threads`** are documented as not battle-tested, so the worker pool is tested under Node (`packages/runtime/test/fixtures/pool-under-node.ts`).
- **`bun test` on its own** runs every file in one process, so a DOM test's global `fetch` leaks into the server tests. Use `bun run test`, which passes `--isolate`.
- **Next's dev server** serves its dev scripts to `localhost` only (`allowedDevOrigins`): browse it at `localhost`, not `127.0.0.1`, or pages never hydrate.
- **Hono** can't add routes after the app has handled a request: register test routes first.
- **Next.js:**
  - a custom server can't use `output: 'standalone'` (ADR 0003, amended);
  - set your own response headers before calling Next's handler.
- **Docker behind a TLS-inspecting proxy:** `docker build --secret id=ca,src=/path/ca.crt .`
- **UI work:** the Phase 2 plan's [known pitfalls](docs/plans/phase-2-prototypes.md#known-pitfalls-from-phase-1) still apply, including:
  - the Tailwind theme reset;
  - literal class maps;
  - `min-w-0` and `grid-cols-[minmax(0,1fr)]` around scrollers.
